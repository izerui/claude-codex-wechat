import type { ChannelAdapter, ChannelIncomingMessage } from '../channels/types';
import { formatPermissionMessage } from '../permissions/formatPermissionMessage';
import type { PermissionRouter } from '../permissions/permissionRouter';
import type { NativeProviderAdapter, ProviderId } from '../providers/types';
import type { ActiveWeChatUserRecord } from '../storage/userStore';
import { parseBridgeCommand } from './commandParser';
import { CurrentConversationStore, type CurrentConversationBinding } from './currentConversationStore';
import type { SessionManager } from './sessionManager';
import type { BridgeEventHub } from '../daemon/events';
import { buildSessionBridgeName } from './sessionBridgeTag';
import { upsertCodexSessionIndexEntry } from '../providers/codex/sessionIndex';
import { writeProviderSessionSidecar } from '../providers/sidecarMetadata';
import { ensureClaudeSessionBridgeMetadata } from '../providers/claude-code/nativeSessions';
import type { ProviderBindingRepository } from '../storage/providerBindingRepository';
import { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';

export class MessageRouter {
  private static readonly TYPING_KEEPALIVE_MS = 5_000;
  private readonly providers = new Map<ProviderId, NativeProviderAdapter>();

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
      sessionRepository?: RuntimeSessionRepository;
      bindingRepository?: ProviderBindingRepository;
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

  async handleMessage(message: ChannelIncomingMessage): Promise<
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
      await this.handleCommand(message.chatId, user, command);
      return { status: 'accepted' };
    }

    const sessionResumeTitle = buildSessionBridgeName({
      platform: 'weixin',
      platformUserId: message.user.id,
      chatId: message.chatId,
      summary: summarizeResumeTitle(command.text),
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
    this.persistSessionIfNeeded(session);

    if (!session.providerSessionId) {
      const resumeTitle = session.resumeTitle ?? sessionResumeTitle;
      this.conversation.update({
        resumeTitle,
        lastActivityAt: Date.now(),
      });
      this.options.sessionRepository?.update(session.id, {
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
      this.options.sessionRepository?.update(updated.id, {
        providerSessionId: updated.providerSessionId,
        resumeTitle: updated.resumeTitle,
        status: updated.status,
        lastActivityAt: updated.lastActivityAt,
      });
      if (updated.providerId === 'codex' && updated.providerSessionId && updated.resumeTitle) {
        await upsertCodexSessionIndexEntry({
          sessionId: updated.providerSessionId,
          threadName: updated.resumeTitle,
        });
      }
      await this.persistBridgeMetadata(updated, message.user.id);
    }

    let bufferedText = '';
    await this.options.channel.setTyping?.(message.chatId, true);
    const typingKeepalive = this.options.channel.setTyping
      ? setInterval(() => {
          void this.options.channel.setTyping?.(message.chatId, true);
        }, MessageRouter.TYPING_KEEPALIVE_MS)
      : null;
    try {
      for await (const event of provider.sendMessage({ bridgeSessionId: session.id, text: command.text })) {
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
          this.options.sessionRepository?.update(updated.id, {
            providerSessionId: updated.providerSessionId,
            status: updated.status,
            lastActivityAt: updated.lastActivityAt,
          });
          if (updated.providerId === 'codex' && updated.providerSessionId && updated.resumeTitle) {
            await upsertCodexSessionIndexEntry({
              sessionId: updated.providerSessionId,
              threadName: updated.resumeTitle,
            });
          }
          await this.persistBridgeMetadata(updated, message.user.id);
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
      if (typingKeepalive) clearInterval(typingKeepalive);
      await this.options.channel.setTyping?.(message.chatId, false);
    }
    return { status: 'accepted' };
  }

  private async handleCommand(
    chatId: string,
    user: ActiveWeChatUserRecord,
    command: Exclude<ReturnType<typeof parseBridgeCommand>, { kind: 'chat' } | { kind: 'permission_decision' }>,
  ): Promise<void> {
    if (command.kind === 'help') {
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: '/help /status /new claude|codex /use claude|codex /cwd <path> /stop /approve <id> /deny <id> /abort <id>',
      });
      return;
    }

    if (command.kind === 'new_session') {
      const session = this.conversation.create({
        chatId,
        ownerUserId: user.id,
        providerId: command.providerId,
        cwd: this.conversation.getCurrent()?.cwd ?? this.options.defaults?.defaultWorkspace ?? '/tmp/project',
      });
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Started new ${command.providerId} session: ${session.id}`,
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

    if (command.kind === 'stop') {
      const session = this.conversation.getCurrent();
      if (!session) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: 'No active session to stop' });
        return;
      }
      await this.providers.get(session.providerId)?.stopSession(session.id);
      this.conversation.clear();
      this.options.sessionRepository?.delete(session.id);
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
      if (updated) {
        this.options.sessionRepository?.update(updated.id, {
          providerSessionId: updated.providerSessionId,
          status: updated.status,
          lastActivityAt: updated.lastActivityAt,
        });
      }
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Reloaded active ${session.providerId} session ${session.id}`,
      });
    }
  }

  async decidePermission(input: { requestId: string; userId: string; decision: 'approve' | 'deny' | 'abort' }): Promise<
    { ok: true } | { ok: false; error: string }
  > {
    const request = this.options.permissions.getRequest(input.requestId);
    const result = this.options.permissions.decide(input);
    if (!result.ok) return result;
    if (request) {
      await this.providers.get(request.providerId)?.decidePermission?.({
        requestId: input.requestId,
        decision: input.decision,
      });
    }
    return result;
  }

  private persistSessionIfNeeded(session: CurrentConversationBinding): void {
    const repository = this.options.sessionRepository;
    if (!repository || repository.findById(session.id)) return;
    repository.createWithId({
      id: session.id,
      chatId: session.chatId,
      ownerUserId: session.ownerUserId,
      providerId: session.providerId,
      providerSessionId: session.providerSessionId,
      recoverySource: session.recoverySource,
      resumeTitle: session.resumeTitle,
      cwd: session.cwd,
      status: session.status,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    });
  }

  private async persistBridgeMetadata(session: CurrentConversationBinding, platformUserId: string): Promise<void> {
    if (!session.providerSessionId || !session.resumeTitle) return;
    this.options.bindingRepository?.upsert({
      platform: 'weixin',
      platformUserId,
      chatId: session.chatId,
      providerId: session.providerId,
      providerSessionId: session.providerSessionId,
      cwd: session.cwd,
    });
    await writeProviderSessionSidecar({
      providerId: session.providerId,
      providerSessionId: session.providerSessionId,
      bridgeTag: {
        platform: 'weixin',
        platformUserId,
        chatId: session.chatId,
      },
      cwd: session.cwd,
    });
    if (session.providerId === 'claude-code') {
      await ensureClaudeSessionBridgeMetadata({
        sessionId: session.providerSessionId,
        resumeTitle: session.resumeTitle,
      });
    }
  }
}

function summarizeResumeTitle(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > 32 ? `${normalized.slice(0, 32).trimEnd()}…` : normalized;
}
