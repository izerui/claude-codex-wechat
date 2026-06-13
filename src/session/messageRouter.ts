import type { ChannelAdapter, ChannelIncomingMessage } from '../channels/types';
import { formatPermissionMessage } from '../permissions/formatPermissionMessage';
import type { PermissionRouter } from '../permissions/permissionRouter';
import type { NativeProviderAdapter, ProviderId } from '../providers/types';
import type { MessageLogRepository } from '../storage/messageLogRepository';
import type { PermissionRequestRepository } from '../storage/permissionRequestRepository';
import type { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import type { AuthorizedUserRecord } from '../storage/userRepository';
import { parseBridgeCommand } from './commandParser';
import type { BridgeSessionRecord, SessionManager } from './sessionManager';

export class MessageRouter {
  private readonly providers = new Map<ProviderId, NativeProviderAdapter>();

  constructor(
    private readonly options: {
      channel: ChannelAdapter;
      permissions: PermissionRouter;
      providers: NativeProviderAdapter[];
      sessions: SessionManager;
      resolveUser(message: ChannelIncomingMessage): AuthorizedUserRecord | null;
      sessionRepository?: RuntimeSessionRepository;
      permissionRepository?: PermissionRequestRepository;
      messageLogRepository?: MessageLogRepository;
    },
  ) {
    for (const provider of options.providers) this.providers.set(provider.id, provider);
  }

  async handleMessage(message: ChannelIncomingMessage): Promise<void> {
    const user = this.options.resolveUser(message);
    if (!user) return;
    if (message.content.type !== 'text' || !message.content.text) return;

    const command = parseBridgeCommand(message.content.text);
    if (command.kind === 'permission_decision') {
      await this.decidePermission({ requestId: command.requestId, userId: user.id, decision: command.decision });
      return;
    }
    if (command.kind !== 'chat') {
      await this.handleCommand(message.chatId, user, command);
      return;
    }

    const session = this.options.sessions.getOrCreateSession({
      chatId: message.chatId,
      ownerUserId: user.id,
    });
    this.persistSessionIfNeeded(session);
    this.options.messageLogRepository?.append({
      bridgeSessionId: session.id,
      direction: 'inbound',
      platformMessageId: message.id,
      text: command.text,
      createdAt: Date.now(),
    });
    const provider = this.providers.get(session.providerId);
    if (!provider) throw new Error(`provider_not_registered:${session.providerId}`);

    if (!session.providerSessionId) {
      const providerSession = await provider.startSession({
        bridgeSessionId: session.id,
        cwd: session.cwd,
      });
      const updated = this.options.sessions.updateSession(session.id, {
        providerSessionId: providerSession.providerSessionId,
        status: providerSession.status,
        lastActivityAt: Date.now(),
      });
      this.options.sessionRepository?.update(updated.id, {
        providerSessionId: updated.providerSessionId,
        status: updated.status,
        lastActivityAt: updated.lastActivityAt,
      });
    }

    for await (const event of provider.sendMessage({ bridgeSessionId: session.id, text: command.text })) {
      if (event.type === 'text_delta' && event.text) {
        this.options.messageLogRepository?.append({
          bridgeSessionId: session.id,
          direction: 'provider_event',
          providerEventType: event.type,
          text: event.text,
          createdAt: Date.now(),
        });
        await this.options.channel.sendMessage({ chatId: message.chatId, kind: 'text', text: event.text });
      }
      if (event.type === 'permission_request') {
        this.options.permissions.addRequest(event.request);
        this.options.permissionRepository?.create({
          id: event.request.id,
          bridgeSessionId: event.request.bridgeSessionId,
          providerId: event.request.providerId,
          toolName: event.request.toolName,
          summary: event.request.summary,
          details: event.request.details,
          status: 'pending',
          requestedAt: Date.now(),
        });
        this.options.messageLogRepository?.append({
          bridgeSessionId: session.id,
          direction: 'provider_event',
          providerEventType: event.type,
          text: event.request.summary,
          createdAt: Date.now(),
        });
        await this.options.channel.sendMessage({
          chatId: message.chatId,
          kind: 'permission_request',
          text: formatPermissionMessage(event.request),
        });
      }
      if (event.type === 'session_state') {
        const updated = this.options.sessions.updateSession(session.id, {
          providerSessionId: event.state.providerSessionId,
          status: event.state.status,
          lastActivityAt: Date.now(),
        });
        this.options.sessionRepository?.update(updated.id, {
          providerSessionId: updated.providerSessionId,
          status: updated.status,
          lastActivityAt: updated.lastActivityAt,
        });
      }
    }
  }

  private async handleCommand(
    chatId: string,
    user: AuthorizedUserRecord,
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
      const session = this.options.sessions.createSession({
        chatId,
        ownerUserId: user.id,
        providerId: command.providerId,
        cwd: this.options.sessions.getActiveSession(chatId)?.cwd ?? user.defaultCwd,
      });
      this.persistSessionIfNeeded(session);
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Started new ${command.providerId} session: ${session.id}`,
      });
      return;
    }

    if (command.kind === 'use_provider') {
      const current = this.options.sessions.getActiveSession(chatId);
      const cwd = current?.cwd ?? '/tmp/project';
      const session = this.options.sessions.createSession({
        chatId,
        ownerUserId: user.id,
        providerId: command.providerId,
        cwd,
      });
      this.persistSessionIfNeeded(session);
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Switched active provider to ${command.providerId}`,
      });
      return;
    }

    if (command.kind === 'set_cwd') {
      const current = this.options.sessions.getActiveSession(chatId);
      const session = current
        ? this.options.sessions.updateActiveSession(chatId, { cwd: command.cwd, lastActivityAt: Date.now() })
        : this.options.sessions.createSession({
            chatId,
            ownerUserId: user.id,
            providerId: user.defaultProvider,
            cwd: command.cwd,
          });
      if (session) {
        this.persistSessionIfNeeded(session);
        this.options.sessionRepository?.update(session.id, { lastActivityAt: session.lastActivityAt });
      }
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Working directory set to ${command.cwd}`,
      });
      return;
    }

    if (command.kind === 'status') {
      const session = this.options.sessions.getActiveSession(chatId);
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
      const session = this.options.sessions.getActiveSession(chatId);
      if (!session) {
        await this.options.channel.sendMessage({ chatId, kind: 'status', text: 'No active session to stop' });
        return;
      }
      await this.providers.get(session.providerId)?.stopSession(session.id);
      const archived = this.options.sessions.archiveSession(session.id);
      this.options.sessionRepository?.archive(session.id, archived.archivedAt);
      await this.options.channel.sendMessage({
        chatId,
        kind: 'status',
        text: `Stopped session ${session.id}`,
      });
    }
  }

  async decidePermission(input: { requestId: string; userId: string; decision: 'approve' | 'deny' | 'abort' }): Promise<
    { ok: true } | { ok: false; error: string }
  > {
    const request = this.options.permissions.getRequest(input.requestId);
    const result = this.options.permissions.decide(input);
    if (!result.ok) return result;
    this.options.permissionRepository?.decide({
      id: input.requestId,
      decision: input.decision,
      decidedBy: input.userId,
      decidedAt: Date.now(),
    });
    if (request) {
      await this.providers.get(request.providerId)?.decidePermission?.({
        requestId: input.requestId,
        decision: input.decision,
      });
    }
    return result;
  }

  private persistSessionIfNeeded(session: BridgeSessionRecord): void {
    const repository = this.options.sessionRepository;
    if (!repository || repository.findById(session.id)) return;
    repository.createWithId({
      id: session.id,
      chatId: session.chatId,
      ownerUserId: session.ownerUserId,
      providerId: session.providerId,
      providerSessionId: session.providerSessionId,
      cwd: session.cwd,
      status: session.status,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      archivedAt: session.archivedAt,
    });
  }
}
