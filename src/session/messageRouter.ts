import type { ChannelAdapter, ChannelAttachment, ChannelIncomingMessage, ChannelOutgoingMessage } from '../channels/types';
import { formatPermissionMessage } from '../permissions/formatPermissionMessage';
import type { PermissionRouter } from '../permissions/permissionRouter';
import type { NativeProviderAdapter, ProviderId, ProviderSessionCandidate, PermissionChoice, ProviderEvent } from '../providers/types';
import type { ActiveWeChatUserRecord } from '../storage/userStore';
import { parseBridgeCommand, type BridgeCommand } from './commandParser';
import type { OutboundDeliveryGate } from './outboundGate';
import { buildBridgeCommandHelpMarkdown } from '../shared/bridgeCommandHelp';
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
  // run one at a time. /stop and read-only commands bypass this lock.
  private sessionOpChain: Promise<void> = Promise.resolve();
  // Commands run on their own chain, independent of sessionOpChain, so a hung
  // generation can never block /new, /stop, etc.
  private commandChain: Promise<void> = Promise.resolve();
  private generationSeq = 0;
  // 每条消息到达时按顺序分配一个全局序号；latestMutatingSeq 记录每个 chat
  // 最近一次会话变更命令的序号。聊天用它判断自己是否已被更晚到达的命令取代，
  // 从而消除「命令从 commandChain 插队到排队中的聊天前面」导致的串话。
  private opSeq = 0;
  private readonly latestMutatingSeq = new Map<string, number>();
  private readonly activeGenerations = new Map<string, { genId: number; providerId: ProviderId; bridgeSessionId: string; abort: () => void }>();

  constructor(
    private readonly options: {
      channel: ChannelAdapter;
      permissions: PermissionRouter;
      providers: NativeProviderAdapter[];
      conversation?: CurrentConversationStore;
      sessions?: SessionManager;
      resolveUser(message: ChannelIncomingMessage): ActiveWeChatUserRecord | null;
      autoAuthorizeUser?(message: ChannelIncomingMessage): ActiveWeChatUserRecord | null;
      autoAttachSession?(message: ChannelIncomingMessage, user: ActiveWeChatUserRecord, options?: { shouldCommit: () => boolean }): Promise<CurrentConversationBinding | null>;
      lastProviderSessions?: LastProviderSessionStore;
      events?: BridgeEventHub;
      defaults?: { defaultProvider: ProviderId; defaultWorkspace: string };
      outboundGate?: OutboundDeliveryGate;
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

  /**
   * Single outbound exit. With a quota gate (WeChat), messages flow through it
   * (sent now, hinted, or queued). Without a gate, sent directly.
   */
  private async sendToChat(message: ChannelOutgoingMessage): Promise<void> {
    if (this.options.outboundGate) {
      await this.options.outboundGate.deliver(message.chatId, { kind: message.kind, text: message.text });
    } else {
      await this.options.channel.sendMessage(message);
    }
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
    // 若有积压的待发消息(配额耗尽时排队的),用户这条消息已刷新 token+配额:
    // 用它续发队列,这条消息本身不进 AI(纯刷新 + drain)。
    if (this.options.outboundGate?.hasPending(message.chatId)) {
      await this.options.outboundGate.drain(message.chatId);
      return { status: 'accepted' };
    }
    if (this.options.outboundGate?.shouldInterceptReply?.(message.chatId)) {
      await this.sendToChat({
        chatId: message.chatId,
        kind: 'status',
        text: '没有待续发消息了。',
      });
      return { status: 'accepted' };
    }
    const composedText = composeInboundText(message.content);
    if (!composedText) return { status: 'accepted' };

    // 媒体/引用消息按普通对话处理(不解析为 bridge 命令);纯文本仍可触发命令。
    const isPlainText = message.content.type === 'text'
      && !message.content.attachments?.length
      && !message.content.quoted;
    const command = isPlainText
      ? parseBridgeCommand(message.content.text ?? '')
      : { kind: 'chat' as const, text: composedText };
    if (command.kind === 'permission_decision') {
      await this.decidePermission({ requestId: command.requestId, userId: user.id, decision: command.decision });
      return { status: 'accepted' };
    }
    // 在到达顺序上同步分配序号（在任何 await 之前），保证命令与聊天的先后关系确定。
    const seq = ++this.opSeq;
    if (command.kind !== 'chat') {
      // 命令跑在独立的 commandChain 上，与生成链 sessionOpChain 互不依赖，
      // 所以卡住的生成永远不会阻塞 /new 等命令。/stop 和只读命令
      // 仍立即执行。setTyping 在回调内部切换（不在 runOnCommandChain 之前），
      // 避免被前一次生成 finally 里的 setTyping(false) 清掉。
      if (!isImmediateCommand(command.kind)) {
        // 会话变更命令：同步记录序号，让此刻仍排队/在跑的更早聊天据此作废。
        this.latestMutatingSeq.set(message.chatId, seq);
      }
      const runWithTyping = async () => {
        await this.options.channel.setTyping?.(message.chatId, true);
        try {
          await this.handleCommand(message.chatId, user, command);
        } finally {
          await this.options.channel.setTyping?.(message.chatId, false);
        }
      };
      if (isImmediateCommand(command.kind)) {
        await runWithTyping();
      } else {
        await this.runOnCommandChain(runWithTyping);
      }
      return { status: 'accepted' };
    }

    // 若已有更晚到达的会话变更命令，这条聊天已被取代，直接丢弃（不 steer、不排队）。
    if ((this.latestMutatingSeq.get(message.chatId) ?? 0) > seq) {
      return { status: 'accepted' };
    }
    if (await this.maybeSteer(message.chatId, command.text)) {
      return { status: 'accepted' };
    }
    await this.runExclusive(() => this.runChatGeneration(message, user, command.text, seq));
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

  // Commands serialize among themselves on a chain that is independent of the
  // generation chain, so they never wait behind a (possibly hung) generation.
  private runOnCommandChain<T>(run: () => Promise<T>): Promise<T> {
    const result = this.commandChain.then(() => run());
    this.commandChain = result.then(() => undefined, () => undefined);
    return result;
  }

  // Abandon the live generation for a chat before a command swaps/clears the
  // current session. Signalling abort makes the generation loop release
  // sessionOpChain immediately even if the provider can't be interrupted (a hung
  // CLI or a provider without interruptSession), so later chats never queue
  // forever behind it. Interrupting the provider is then best-effort cleanup.
  private async preemptActiveGeneration(chatId: string): Promise<void> {
    const active = this.activeGenerations.get(chatId);
    if (!active) return;
    this.activeGenerations.delete(chatId);
    active.abort();
    // 中断 provider 仅作尽力而为的清理，且不等待：abort 已让生成跳出循环、让出
    // 生成链，而 interruptSession 本身可能在卡死的 CLI 上挂起，绝不能让它拖住命令。
    void Promise.resolve(this.providers.get(active.providerId)?.interruptSession?.(active.bridgeSessionId)).catch(() => undefined);
  }

  private async runChatGeneration(
    message: ChannelIncomingMessage,
    user: ActiveWeChatUserRecord,
    text: string,
    seq: number,
  ): Promise<void> {
    const superseded = () => (this.latestMutatingSeq.get(message.chatId) ?? 0) > seq;
    // 若此刻已有更晚到达的会话变更命令，这条聊天已被取代：直接放弃，不创建会话、
    // 不发任何消息，避免投递到被命令换掉的会话。注意：这里不等待 commandChain——
    // 命令与聊天分属两条链、互不阻塞，所以一条卡住的命令绝不会堵住后续聊天。
    // 代价仅是：在同一拍内同时发出 /new 和紧随的 prompt 时，prompt 可能按当下
    // current 跑（极小概率，真人操作几乎不会触发），但绝不会卡死或写坏状态。
    if (superseded()) return;
    const sessionResumeTitle = buildSessionBridgeName({
      platform: 'weixin',
      platformUserId: message.user.id,
      chatId: message.chatId,
      summary: summarizeResumeTitle(text),
    });
    let session = this.conversation.getCurrent();
    if (!session) {
      // auto-attach 自身会写 current（attachProviderSessionToBridge → setCurrent）。
      // 调用前先判取代，避免在已有命令到达后还启动一次会覆盖其选择的 attach。
      if (superseded()) return;
      // 把取代检查下沉到 auto-attach 的写入处：若 attach 进行中有命令到达，
      // 这次 attach 不再 setCurrent 覆盖命令选定的会话（providerAutoAttach 内执行）。
      const attached = await this.options.autoAttachSession?.(message, user, { shouldCommit: () => !superseded() });
      // auto-attach 可能涉及文件系统/provider 工作；其间若有 /new、/resume 到达，
      // 这条旧聊天必须让位，不能再 attach/create 覆盖新命令选定的会话。
      if (superseded()) return;
      session = this.conversation.getCurrent()
        ?? attached
        ?? this.conversation.create({
          chatId: message.chatId,
          ownerUserId: user.id,
          providerId: this.options.defaults?.defaultProvider ?? 'claude-code',
          cwd: this.options.defaults?.defaultWorkspace ?? '/tmp/project',
          resumeTitle: sessionResumeTitle,
        });
    }
    const provider = this.providers.get(session.providerId);
    if (!provider) throw new Error(`provider_not_registered:${session.providerId}`);

    if (!session.providerSessionId) {
      const resumeTitle = session.resumeTitle ?? sessionResumeTitle;
      this.conversation.update({
        resumeTitle,
        lastActivityAt: Date.now(),
      }, session.id);
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
      }, session.id) ?? session;
      if (updated.providerId === 'codex' && updated.providerSessionId && updated.resumeTitle) {
        await upsertCodexSessionIndexEntry({
          sessionId: updated.providerSessionId,
          threadName: updated.resumeTitle,
        });
      }
      await this.persistBridgeMetadata(updated);
    }

    const genId = ++this.generationSeq;
    let abortGeneration!: () => void;
    const aborted = new Promise<'aborted'>((resolve) => { abortGeneration = () => resolve('aborted'); });
    this.activeGenerations.set(message.chatId, {
      genId,
      providerId: session.providerId,
      bridgeSessionId: session.id,
      abort: abortGeneration,
    });
    // 存活判定同时覆盖两种取代：被新生成顶替（genId 不匹配），
    // 或被更晚到达的会话变更命令取代（latestMutatingSeq 越过本次序号）。
    const isLive = () => this.activeGenerations.get(message.chatId)?.genId === genId
      && (this.latestMutatingSeq.get(message.chatId) ?? 0) <= seq;
    let bufferedText = '';
    await this.options.channel.setTyping?.(message.chatId, true);
    // Create the keepalive and the iterator INSIDE the try so that a synchronous
    // throw from provider.sendMessage can never orphan the keepalive interval (which
    // would leave WeChat stuck showing "正在输入" forever); the finally always cleans up.
    let typingKeepalive: ReturnType<typeof setInterval> | null = null;
    let iterator: AsyncIterator<ProviderEvent> | null = null;
    try {
      typingKeepalive = this.options.channel.setTyping
        ? setInterval(() => {
            void this.options.channel.setTyping?.(message.chatId, true);
          }, MessageRouter.TYPING_KEEPALIVE_MS)
        : null;
      // 手动驱动迭代器并与 abort 信号竞速：被抢占时即便 provider 卡死、迭代器永不
      // 返回下一个事件，也能立即跳出循环、释放 sessionOpChain，后续聊天不再永久排队。
      iterator = provider.sendMessage({ bridgeSessionId: session.id, text })[Symbol.asyncIterator]();
      while (isLive()) {
        const step = await Promise.race([iterator.next(), aborted]);
        if (step === 'aborted' || step.done) break;
        if (!isLive()) break;
        const event = step.value;
        if (event.type === 'text_delta' && event.text) {
          bufferedText += event.text;
        }
        if (event.type === 'message_done' && bufferedText.trim()) {
          await this.sendToChat({ chatId: message.chatId, kind: 'text', text: bufferedText });
          bufferedText = '';
        }
        if (event.type === 'permission_request') {
          if (bufferedText.trim()) {
            await this.sendToChat({ chatId: message.chatId, kind: 'text', text: bufferedText });
            bufferedText = '';
          }
          this.options.permissions.addRequest(event.request);
          await this.sendToChat({
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
          }, session.id) ?? session;
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
            await this.sendToChat({ chatId: message.chatId, kind: 'text', text: bufferedText });
            bufferedText = '';
          }
          const errorText = `Provider error: ${event.error}`;
          await this.sendToChat({
            chatId: message.chatId,
            kind: 'status',
            text: errorText,
          });
        }
      }
      if (isLive() && bufferedText.trim()) {
        await this.sendToChat({ chatId: message.chatId, kind: 'text', text: bufferedText });
        bufferedText = '';
      }
    } finally {
      void iterator?.return?.().catch(() => undefined);
      // 只有当 entry 仍是本次生成时才清除并复位 typing；被抢占时新生成会自行管理，
      // 这里不能动，避免抹掉它的 entry 或清掉它的 typing。
      const stillMine = this.activeGenerations.get(message.chatId)?.genId === genId;
      if (stillMine) this.activeGenerations.delete(message.chatId);
      if (typingKeepalive) clearInterval(typingKeepalive);
      if (stillMine) await this.options.channel.setTyping?.(message.chatId, false);
    }
  }

  private async handleCommand(
    chatId: string,
    user: ActiveWeChatUserRecord,
    command: Exclude<ReturnType<typeof parseBridgeCommand>, { kind: 'chat' } | { kind: 'permission_decision' }>,
  ): Promise<void> {
    if (command.kind === 'help') {
      await this.sendToChat({
        chatId,
        kind: 'markdown',
        text: buildBridgeCommandHelpMarkdown(),
      });
      return;
    }

    if (command.kind === 'cancel_generation') {
      const active = this.activeGenerations.get(chatId);
      if (!active) {
        await this.sendToChat({ chatId, kind: 'status', text: '当前没有正在进行的生成' });
        return;
      }
      const provider = this.providers.get(active.providerId);
      if (!provider?.interruptSession) {
        await this.sendToChat({ chatId, kind: 'status', text: `${active.providerId} 暂不支持中断` });
        return;
      }
      await provider.interruptSession(active.bridgeSessionId);
      await this.sendToChat({ chatId, kind: 'status', text: '已中断当前生成，会话保留' });
      return;
    }

    if (command.kind === 'new_session') {
      await this.preemptActiveGeneration(chatId);
      const providerId = command.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
      const cwd = command.cwd
        ?? this.conversation.getCurrent()?.cwd
        ?? this.options.defaults?.defaultWorkspace
        ?? '/tmp/project';
      const session = this.conversation.create({
        chatId,
        ownerUserId: user.id,
        providerId,
        cwd,
      });
      await this.sendToChat({
        chatId,
        kind: 'status',
        text: `Started new ${providerId} session: ${session.id}`,
      });
      return;
    }

    if (command.kind === 'status') {
      const session = this.conversation.getCurrent();
      await this.sendToChat({
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
        await this.sendToChat({ chatId, kind: 'status', text: `当前 provider（${providerId}）不支持会话列表` });
        return;
      }
      let candidates = await listUnattachedRecoverableSessions({ provider, providerId, currentSession: current });
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
        await this.sendToChat({ chatId, kind: 'status', text: '没有可恢复的会话' });
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
      lines.push('', '回复 `/resume <id>` 恢复');
      await this.sendToChat({ chatId, kind: 'markdown', text: lines.join('\n') });
      return;
    }

    if (command.kind === 'resume_session') {
      const ref = command.ref.trim();
      if (!ref) {
        await this.sendToChat({ chatId, kind: 'status', text: '用法：/resume <id>' });
        return;
      }
      await this.preemptActiveGeneration(chatId);
      const providerId = this.conversation.getCurrent()?.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
      const previousCwd = this.conversation.getCurrent()?.cwd;
      const provider = this.providers.get(providerId);
      if (!provider?.attachSession || !provider.listRecoverableSessions) {
        await this.sendToChat({ chatId, kind: 'status', text: `当前 provider（${providerId}）不支持会话恢复` });
        return;
      }
      const candidate = (await provider.listRecoverableSessions()).find((item) => item.id === ref);
      if (!candidate) {
        await this.sendToChat({ chatId, kind: 'status', text: `找不到会话 ${ref}` });
        return;
      }
      const cwdUnresolved = !candidate.cwd;
      const attached = await attachProviderSessionToBridge({
        conversationStore: this.conversation,
        lastProviderSessions: this.options.lastProviderSessions,
        provider,
        user,
        providerId,
        providerSessionId: ref,
        chatId,
        cwd: candidate.cwd ?? this.options.defaults?.defaultWorkspace ?? '/tmp/project',
        recoverySource: 'manual_attach',
        resumeTitle: candidate.resumeTitle,
      });
      const head = `已恢复会话 ${attached.id} · ${attached.providerId}`;
      const text = cwdUnresolved
        ? `${head}\n⚠️ 无法确定该会话的原始目录，已使用默认目录 ${attached.cwd}，如需切换请用 /new <目录> 开新会话`
        : previousCwd && previousCwd !== attached.cwd
          ? `${head}\n已切换工作目录到 ${attached.cwd}`
          : `${head} · ${attached.cwd}`;
      await this.sendToChat({ chatId, kind: 'status', text });
      return;
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

// Commands that may run while a generation is in flight: /stop must (to
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

/** Format one attachment for the prompt: `[图片] name @/abs/path` or a failure note. */
function formatAttachment(att: ChannelAttachment): string {
  const label = att.kind === 'image' ? '图片' : att.kind === 'video' ? '视频' : '文件';
  const name = att.fileName ? `${att.fileName} ` : '';
  if (att.failed) return `[${label}] ${name}[下载失败${att.failReason ? `:${att.failReason}` : ''}]`;
  if (att.localPath) return `[${label}] ${name}@${att.localPath}`;
  return `[${label}] ${name}[无法获取]`;
}

/**
 * Compose the prompt text sent to the provider from an inbound message:
 * original text + each media attachment as `@/abs/path` + a quoted block.
 * Returns '' when there is nothing actionable.
 */
export function composeInboundText(content: ChannelIncomingMessage['content']): string {
  const parts: string[] = [];
  if (content.text) parts.push(content.text);
  for (const att of content.attachments ?? []) parts.push(formatAttachment(att));
  if (content.quoted) {
    const quotedParts: string[] = [];
    if (content.quoted.text) quotedParts.push(content.quoted.text);
    for (const att of content.quoted.attachments ?? []) quotedParts.push(formatAttachment(att));
    if (quotedParts.length) parts.push(`[引用] ${quotedParts.join(' ')}`);
  }
  return parts.join('\n');
}
