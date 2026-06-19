import type { ChannelAdapter, ChannelIncomingMessage } from '../channels/types';
import { formatPermissionMessage } from '../permissions/formatPermissionMessage';
import type { PermissionRouter } from '../permissions/permissionRouter';
import type { NativeProviderAdapter, ProviderId, ProviderSessionCandidate, PermissionChoice } from '../providers/types';
import type { ActiveWeChatUserRecord } from '../storage/userStore';
import { parseBridgeCommand, type BridgeCommand } from './commandParser';
import { CurrentConversationStore, type CurrentConversationBinding } from './currentConversationStore';
import { attachProviderSessionToBridge, listUnattachedRecoverableSessions } from './providerAutoAttach';
import type { SessionManager } from './sessionManager';
import type { BridgeEventHub } from '../daemon/events';
import { buildSessionBridgeName } from './sessionBridgeTag';
import { upsertCodexSessionIndexEntry } from '../providers/codex/sessionIndex';
import { ensureClaudeSessionBridgeMetadata } from '../providers/claude-code/nativeSessions';
import type { LastProviderSessionStore } from '../storage/lastProviderSessionStore';

export class MessageRouter {
  private static readonly TYPING_KEEPALIVE_MS = 5_000;
  private static readonly SESSION_LIST_LIMIT = 8;
  private readonly providers = new Map<ProviderId, NativeProviderAdapter>();
  private readonly sessionListCache = new Map<string, { providerId: ProviderId; ids: string[] }>();
  // Single global lock: the bridge stores one current conversation, so every
  // session-mutating operation (chat generation + state-changing commands) must
  // run one at a time. /cancel and read-only commands bypass this lock.
  private sessionOpChain: Promise<void> = Promise.resolve();
  private readonly activeGenerations = new Map<string, { providerId: ProviderId; bridgeSessionId: string }>();

  constructor(
    private readonly options: {
      channel: ChannelAdapter;
      permissions: PermissionRouter;
      providers: NativeProviderAdapter[];
      conversation?: CurrentConversationStore;
      sessions?: SessionManager;
      resolveUser(message: ChannelIncomingMessage): ActiveWeChatUserRecord | null;
      autoAuthorizeUser?(message: ChannelIncomingMessage): ActiveWeChatUserRecord | null;
      autoAttachSession?(message: ChannelIncomingMessage, user: ActiveWeChatUserRecord): Promise<CurrentConversationBinding | null>;
      lastProviderSessions?: LastProviderSessionStore;
      events?: BridgeEventHub;
      defaults?: { defaultProvider: ProviderId; defaultWorkspace: string };
    },
  ) {
    for (const provider of options.providers) this.providers.set(provider.id, provider);
    if (!this.options.conversation) {
      const fallbackSessions = this.options.sessions;
      this.options.conversation = fallbackSessions?.store
        ? fallbackSessions.store
        : new CurrentConversationStore('/tmp/claude-codex-wechat-message-router.json', {
            defaultCwd: '/tmp/project',
            defaultProviderId: 'claude-code',
          });
    }
  }

  private get conversation(): CurrentConversationStore {
    return this.options.conversation as CurrentConversationStore;
  }

  private conversationSignature(): string {
    const current = this.conversation.getCurrent();
    if (!current) return '';
    return `${current.id}|${current.providerId}|${current.providerSessionId ?? ''}|${current.cwd}|${current.status}`;
  }

  private async withSessionChangeNotification<T>(run: () => Promise<T>): Promise<T> {
    const before = this.conversationSignature();
    try {
      return await run();
    } finally {
      if (this.conversationSignature() !== before) {
        this.options.events?.emit({ type: 'channel.current-session-changed' });
      }
    }
  }

  async handleMessage(message: ChannelIncomingMessage): Promise<
    { status: 'accepted' } | { status: 'pairing_required'; code: string }
  > {
    return this.withSessionChangeNotification(() => this.handleMessageInner(message));
  }

  private async handleMessageInner(message: ChannelIncomingMessage): Promise<
    { status: 'accepted' } | { status: 'pairing_required'; code: string }
  > {
    let user = this.options.resolveUser(message);
    if (!user) {
      user = this.options.autoAuthorizeUser?.(message) ?? null;
    }
    if (!user) {
      return { status: 'pairing_required', code: 'pairing_required' };
    }
    if (message.content.type !== 'text' || !message.content.text) return { status: 'accepted' };

    const command = parseBridgeCommand(message.content.text);
    if (command.kind === 'permission_decision') {
      await this.decidePermission({ requestId: command.requestId, userId: user.id, decision: command.decision });
      return { status: 'accepted' };
    }
    if (command.kind !== 'chat') {
      // /cancel and read-only commands run immediately (concurrent with an
      // in-flight generation, which is exactly what /cancel needs). Every
      // session-mutating command is serialized behind the active generation.
      if (isImmediateCommand(command.kind)) {
        await this.handleCommand(message.chatId, user, command);
      } else {
        await this.runExclusive(() => this.handleCommand(message.chatId, user, command));
      }
      return { status: 'accepted' };
    }

    if (await this.maybeSteer(message.chatId, command.text)) {
      return { status: 'accepted' };
    }
    await this.runExclusive(() => this.runChatGeneration(message, user, command.text));
    return { status: 'accepted' };
  }

  // A chat message arriving while a turn is in flight: if the provider supports
  // native steer (Codex turn/steer), inject it into the running turn instead of
  // queueing a new turn. Otherwise fall back to the serialized lock (queue).
  private maybeSteer(chatId: string, text: string): Promise<boolean> {
    const active = this.activeGenerations.get(chatId);
    if (!active) return Promise.resolve(false);
    const provider = this.providers.get(active.providerId);
    if (!provider?.steerSession) return Promise.resolve(false);
    return provider.steerSession(active.bridgeSessionId, text).then(() => true);
  }

  // Serialize session-mutating work onto one global chain. The chain is updated
  // synchronously (no await before the assignment) so two non-blocking channel
  // dispatches enqueue in arrival order without racing.
  private runExclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.sessionOpChain.then(() => run());
    this.sessionOpChain = result.then(() => undefined, () => undefined);
    return result;
  }

  private async runChatGeneration(
    message: ChannelIncomingMessage,
    user: ActiveWeChatUserRecord,
    text: string,
  ): Promise<void> {
    const sessionResumeTitle = buildSessionBridgeName({
      platform: 'weixin',
      platformUserId: message.user.id,
      chatId: message.chatId,
      summary: summarizeResumeTitle(text),
    });
    const session = this.conversation.getCurrent()
      ?? await this.options.autoAttachSession?.(message, user)
      ?? this.conversation.create({
        chatId: message.chatId,
        ownerUserId: user.id,
        providerId: this.options.defaults?.defaultProvider ?? 'claude-code',
        cwd: this.options.defaults?.defaultWorkspace ?? '/tmp/project',
        resumeTitle: sessionResumeTitle,
      });
    const provider = this.providers.get(session.providerId);
    if (!provider) throw new Error(`provider_not_registered:${session.providerId}`);

    if (!session.providerSessionId) {
      const resumeTitle = session.resumeTitle ?? sessionResumeTitle;
      this.conversation.update({
        resumeTitle,
        lastActivityAt: Date.now(),
      });
      const providerSession = await provider.startSession({
        bridgeSessionId: session.id,
        cwd: session.cwd,
        options: {
          sessionName: resumeTitle,
        },
      });
      const updated = this.conversation.update({
        providerSessionId: providerSession.providerSessionId,
        resumeTitle,
        status: providerSession.status,
        lastActivityAt: Date.now(),
      }) ?? session;
      if (updated.providerId === 'codex' && updated.providerSessionId && updated.resumeTitle) {
        await upsertCodexSessionIndexEntry({
          sessionId: updated.providerSessionId,
          threadName: updated.resumeTitle,
        });
      }
      await this.persistBridgeMetadata(updated);
    }

    this.activeGenerations.set(message.chatId, { providerId: session.providerId, bridgeSessionId: session.id });
    let bufferedText = '';
    await this.options.channel.setTyping?.(message.chatId, true);
    const typingKeepalive = this.options.channel.setTyping
      ? setInterval(() => {
          void this.options.channel.setTyping?.(message.chatId, true);
        }, MessageRouter.TYPING_KEEPALIVE_MS)
      : null;
    try {
      for await (const event of provider.sendMessage({ bridgeSessionId: session.id, text })) {
        if (event.type === 'text_delta' && event.text) {
          bufferedText += event.text;
        }
        if (event.type === 'message_done' && bufferedText.trim()) {
          await this.options.channel.sendMessage({ chatId: message.chatId, kind: 'text', text: bufferedText });
          bufferedText = '';
        }
        if (event.type === 'permission_request') {
          if (bufferedText.trim()) {
            await this.options.channel.sendMessage({ chatId: message.chatId, kind: 'text', text: bufferedText });
            bufferedText = '';
          }
          this.options.permissions.addRequest(event.request);
          await this.options.channel.sendMessage({
            chatId: message.chatId,
            kind: 'permission_request',
            text: formatPermissionMessage(event.request),
          });
        }
        if (event.type === 'session_state') {
          const updated = this.conversation.update({
            providerSessionId: event.state.providerSessionId,
            status: event.state.status,
            lastActivityAt: Date.now(),
          }) ?? session;
          if (updated.providerId === 'codex' && updated.providerSessionId && updated.resumeTitle) {
            await upsertCodexSessionIndexEntry({
              sessionId: updated.providerSessionId,
              threadName: updated.resumeTitle,
            });
          }
          await this.persistBridgeMetadata(updated);
        }
        if (event.type === 'error' && event.error) {
          if (bufferedText.trim()) {
            await this.options.channel.sendMessage({ chatId: message.chatId, kind: 'text', text: bufferedText });
            bufferedText = '';
          }
          const errorText = `Provider error: ${event.error}`;
          await this.options.channel.sendMessage({
            chatId: message.chatId,
            kind: 'status',
            text: errorText,
          });
        }
      }
    } finally {
      this.activeGenerations.delete(message.chatId);
      if (typingKeepalive) clearInterval(typingKeepalive);
      await this.options.channel.setTyping?.(message.chatId, false);
    }
  }

  private async handleCommand(
    chatId: string,
    user: ActiveWeChatUserRecord,
    command: Exclude<ReturnType<typeof parseBridgeCommand>, { kind: 'chat' } | { kind: 'permission_decision' }>,
  ): Promise<void> {
    if (command.kind === 'help') {
      await this.options.channel.sendMessage({
        chatId,
        kind: 'markdown',
        text: [
          '**可用命令**',
          '',
          '直接发送文字即可与 AI 对话。',
          '',
          '**会话管理**',
          '- `/help` — 显示本帮助',
          '- `/status` — 查看当前会话（provider、工作目录、状态）',
          '- `/new [claude|codex]` — 新建会话，省略则用默认 provider',
          '- `/use claude|codex` — 切换当前 provider',
          '- `/cwd <path>` — 设置工作目录，例：`/cwd /home/project`',
          '- `/stop` — 停止并清除当前会话',
          '- `/cancel` — 中断当前正在生成的回复（会话保留）',
          '- `/reload` — 重启当前会话（保留 provider 与目录）',
          '',
          '**历史会话**',
          '- `/sessions` — 列出最近的历史会话（按更新时间倒序）',
          '- `/sessions <关键词>` — 按标题/目录筛选',
          '- `/sessions mine` — 只看通过微信创建的会话',
          '- `/resume <编号>` — 按列表编号恢复',
          '- `/resume <id>` — 按会话 id 恢复',
          '- `/archive [编号]` — 归档会话（仅 Codex；省略则归档当前会话）',
          '',
          '**权限审批**（AI 请求工具授权时使用，`<id>` 见请求消息）',
          '- `/approve <id>` — 批准本次请求',
          '- `/always <id>` — 本会话内永久批准该工具',
          '- `/deny <id>` — 拒绝本次请求',
          '- `/abort <id>` — 中止本次请求',
        ].join('\n'),
      });
      return;
    }

    if (command.kind === 'cancel_generation') {
      const active = this.activeGenerations.get(chatId);
      if (!active) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: '当前没有正在进行的生成' });
        return;
      }
      const provider = this.providers.get(active.providerId);
      if (!provider?.interruptSession) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: `${active.providerId} 暂不支持中断` });
        return;
      }
      await provider.interruptSession(active.bridgeSessionId);
      await this.options.channel.sendMessage({ chatId, kind: 'status', text: '已中断当前生成，会话保留' });
      return;
    }

    if (command.kind === 'new_session') {
      const providerId = command.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
      const session = this.conversation.create({
        chatId,
        ownerUserId: user.id,
        providerId,
        cwd: this.conversation.getCurrent()?.cwd ?? this.options.defaults?.defaultWorkspace ?? '/tmp/project',
      });
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Started new ${providerId} session: ${session.id}`,
      });
      return;
    }

    if (command.kind === 'use_provider') {
      const current = this.conversation.getCurrent();
      const cwd = current?.cwd ?? '/tmp/project';
      this.conversation.create({
        chatId,
        ownerUserId: user.id,
        providerId: command.providerId,
        cwd,
      });
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Switched active provider to ${command.providerId}`,
      });
      return;
    }

    if (command.kind === 'set_cwd') {
      const current = this.conversation.getCurrent();
      const session = current
        ? this.conversation.update({ cwd: command.cwd, lastActivityAt: Date.now() })
        : this.conversation.create({
            chatId,
            ownerUserId: user.id,
            providerId: this.options.defaults?.defaultProvider ?? 'claude-code',
            cwd: command.cwd,
          });
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Working directory set to ${command.cwd}`,
      });
      return;
    }

    if (command.kind === 'status') {
      const session = this.conversation.getCurrent();
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: session
          ? `Active session ${session.id} · ${session.providerId} · ${session.cwd} · ${session.status}`
          : 'No active session',
      });
      return;
    }

    if (command.kind === 'list_sessions') {
      const current = this.conversation.getCurrent();
      const providerId = current?.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
      const provider = this.providers.get(providerId);
      if (!provider?.listRecoverableSessions) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: `当前 provider（${providerId}）不支持会话列表` });
        return;
      }
      let candidates = await listUnattachedRecoverableSessions({ provider, providerId, currentSession: current });
      if (command.scope === 'mine') {
        candidates = candidates.filter((candidate) => candidate.bridgeTag?.platformUserId === user.platformUserId);
      }
      if (command.keyword) {
        const keyword = command.keyword.toLowerCase();
        candidates = candidates.filter((candidate) =>
          (candidate.resumeTitle ?? candidate.title ?? '').toLowerCase().includes(keyword)
          || (candidate.cwd ?? '').toLowerCase().includes(keyword),
        );
      }
      candidates.sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
      const shown = candidates.slice(0, MessageRouter.SESSION_LIST_LIMIT);
      if (shown.length === 0) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: '没有可恢复的会话' });
        return;
      }
      this.sessionListCache.set(chatId, { providerId, ids: shown.map((candidate) => candidate.id) });
      const lines = [`**可恢复会话（${providerId}）**`, ''];
      shown.forEach((candidate, index) => {
        lines.push(`${index + 1}. ${this.formatSessionLine(candidate)}`);
      });
      if (candidates.length > shown.length) {
        lines.push('', `（还有 ${candidates.length - shown.length} 条，用 \`/sessions <关键词>\` 筛选）`);
      }
      lines.push('', '回复 `/resume <编号>` 恢复，或 `/resume <id>` 指定');
      await this.options.channel.sendMessage({ chatId, kind: 'markdown', text: lines.join('\n') });
      return;
    }

    if (command.kind === 'resume_session') {
      const ref = command.ref.trim();
      if (!ref) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: '用法：/resume <编号> 或 /resume <id>（先用 /sessions 查看列表）' });
        return;
      }
      let providerId = this.conversation.getCurrent()?.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
      const previousCwd = this.conversation.getCurrent()?.cwd;
      let sessionId = ref;
      if (/^\d+$/.test(ref)) {
        const cached = this.sessionListCache.get(chatId);
        if (!cached) {
          await this.options.channel.sendMessage({ chatId, kind: 'status', text: '请先用 /sessions 查看列表，再用编号恢复' });
          return;
        }
        const index = Number.parseInt(ref, 10);
        if (index < 1 || index > cached.ids.length) {
          await this.options.channel.sendMessage({ chatId, kind: 'status', text: `编号 ${ref} 超出范围，请重新 /sessions 查看` });
          return;
        }
        providerId = cached.providerId;
        sessionId = cached.ids[index - 1];
      }
      const provider = this.providers.get(providerId);
      if (!provider?.attachSession || !provider.listRecoverableSessions) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: `当前 provider（${providerId}）不支持会话恢复` });
        return;
      }
      const candidate = (await provider.listRecoverableSessions()).find((item) => item.id === sessionId);
      if (!candidate) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: `找不到会话 ${sessionId}` });
        return;
      }
      const cwdUnresolved = !candidate.cwd;
      const attached = await attachProviderSessionToBridge({
        conversationStore: this.conversation,
        lastProviderSessions: this.options.lastProviderSessions,
        provider,
        user,
        providerId,
        providerSessionId: sessionId,
        chatId,
        cwd: candidate.cwd ?? this.options.defaults?.defaultWorkspace ?? '/tmp/project',
        recoverySource: 'manual_attach',
        resumeTitle: candidate.resumeTitle,
      });
      const head = `已恢复会话 ${attached.id} · ${attached.providerId}`;
      const text = cwdUnresolved
        ? `${head}\n⚠️ 无法确定该会话的原始目录，已使用默认目录 ${attached.cwd}，如需请用 /cwd <path> 切换`
        : previousCwd && previousCwd !== attached.cwd
          ? `${head}\n已切换工作目录到 ${attached.cwd}`
          : `${head} · ${attached.cwd}`;
      await this.options.channel.sendMessage({ chatId, kind: 'status', text });
      return;
    }

    if (command.kind === 'archive_session') {
      const ref = command.ref.trim();
      const current = this.conversation.getCurrent();
      let providerId: ProviderId;
      let providerSessionId: string;
      if (!ref) {
        if (!current?.providerSessionId) {
          await this.options.channel.sendMessage({ chatId, kind: 'status', text: '当前没有可归档的会话' });
          return;
        }
        providerId = current.providerId;
        providerSessionId = current.providerSessionId;
      } else if (/^\d+$/.test(ref)) {
        const cached = this.sessionListCache.get(chatId);
        if (!cached) {
          await this.options.channel.sendMessage({ chatId, kind: 'status', text: '请先用 /sessions 查看列表，再用编号归档' });
          return;
        }
        const index = Number.parseInt(ref, 10);
        if (index < 1 || index > cached.ids.length) {
          await this.options.channel.sendMessage({ chatId, kind: 'status', text: `编号 ${ref} 超出范围，请重新 /sessions 查看` });
          return;
        }
        providerId = cached.providerId;
        providerSessionId = cached.ids[index - 1];
      } else {
        providerId = current?.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
        providerSessionId = ref;
      }
      const provider = this.providers.get(providerId);
      if (!provider?.archiveSession) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: `${providerId} 无原生归档命令，暂不支持归档（可用 /stop 停止，会话仍可 resume）` });
        return;
      }
      const isCurrent = current?.providerSessionId === providerSessionId;
      try {
        if (isCurrent && current) await provider.stopSession(current.id);
        await provider.archiveSession(providerSessionId);
      } catch (error) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: `归档失败：${error instanceof Error ? error.message : String(error)}` });
        return;
      }
      if (isCurrent) this.conversation.clear();
      this.sessionListCache.delete(chatId);
      await this.options.channel.sendMessage({ chatId, kind: 'status', text: `已归档会话 ${providerSessionId}` });
      return;
    }

    if (command.kind === 'stop') {
      const session = this.conversation.getCurrent();
      if (!session) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: 'No active session to stop' });
        return;
      }
      await this.providers.get(session.providerId)?.stopSession(session.id);
      this.conversation.clear();
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Stopped session ${session.id}`,
      });
      return;
    }

    if (command.kind === 'reload') {
      const session = this.conversation.getCurrent();
      if (!session) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: 'No active session to reload' });
        return;
      }
      const provider = this.providers.get(session.providerId);
      if (!provider) throw new Error(`provider_not_registered:${session.providerId}`);
      await provider.stopSession(session.id);
      const reloaded = await provider.startSession({
        bridgeSessionId: session.id,
        cwd: session.cwd,
        options: {
          ...(session.providerSessionId ? { providerSessionId: session.providerSessionId } : {}),
          ...(session.resumeTitle ? { sessionName: session.resumeTitle } : {}),
        },
      });
      const updated = this.conversation.update({
        providerSessionId: reloaded.providerSessionId,
        status: reloaded.status,
        lastActivityAt: Date.now(),
      });
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Reloaded active ${session.providerId} session ${session.id}`,
      });
    }
  }

  async decidePermission(input: { requestId: string; userId: string; decision: PermissionChoice }): Promise<
    { ok: true } | { ok: false; error: string }
  > {
    const request = this.options.permissions.getRequest(input.requestId);
    const result = this.options.permissions.decide(input);
    if (!result.ok) return result;
    if (request) {
      // Providers have no native per-session approval, so map approve_for_session
      // down to a plain approve when handing the decision to the CLI.
      const providerDecision = input.decision === 'approve_for_session' ? 'approve' : input.decision;
      await this.providers.get(request.providerId)?.decidePermission?.({
        requestId: input.requestId,
        decision: providerDecision,
      });
    }
    return result;
  }

  private formatSessionLine(candidate: ProviderSessionCandidate): string {
    const title = candidate.resumeTitle ?? candidate.title ?? candidate.id;
    const cwd = candidate.cwd ? ` · ${candidate.cwd}` : '';
    const when = candidate.lastActivityAt ? ` · ${formatRelativeTime(candidate.lastActivityAt)}` : '';
    return `${title}${cwd}${when}`;
  }

  private async persistBridgeMetadata(session: CurrentConversationBinding): Promise<void> {
    if (!session.providerSessionId || !session.resumeTitle) return;
    this.options.lastProviderSessions?.set(session.providerId, {
      providerSessionId: session.providerSessionId,
      cwd: session.cwd,
    });
    if (session.providerId === 'claude-code') {
      await ensureClaudeSessionBridgeMetadata({
        sessionId: session.providerSessionId,
        resumeTitle: session.resumeTitle,
        cwd: session.cwd,
      });
    }
  }
}

function summarizeResumeTitle(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > 32 ? `${normalized.slice(0, 32).trimEnd()}…` : normalized;
}

// Commands that may run while a generation is in flight: /cancel must (to
// interrupt it), and read-only commands are safe. Everything else mutates the
// single current conversation and is serialized behind the active generation.
function isImmediateCommand(kind: BridgeCommand['kind']): boolean {
  return kind === 'cancel_generation'
    || kind === 'help'
    || kind === 'status'
    || kind === 'list_sessions';
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}个月前`;
}
