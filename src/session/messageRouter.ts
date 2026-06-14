import type { ChannelAdapter, ChannelIncomingMessage } from '../channels/types';
import { formatPermissionMessage } from '../permissions/formatPermissionMessage';
import type { PermissionRouter } from '../permissions/permissionRouter';
import type { NativeProviderAdapter, ProviderId } from '../providers/types';
import type { BridgeEventRepository } from '../storage/bridgeEventRepository';
import type { PermissionRequestRepository } from '../storage/permissionRequestRepository';
import type { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import type { AuthorizedUserRecord } from '../storage/userRepository';
import { parseBridgeCommand } from './commandParser';
import type { BridgeSessionRecord, SessionManager } from './sessionManager';
import type { PairingRepository } from '../storage/pairingRepository';
import type { BridgeEventHub } from '../daemon/events';
import { ensurePairingForMessage } from '../channels/pairing';
import { buildSessionBridgeName } from './sessionBridgeTag';
import { upsertCodexSessionIndexEntry } from '../providers/codex/sessionIndex';
import { writeProviderSessionSidecar } from '../providers/sidecarMetadata';
import { ensureClaudeSessionBridgeMetadata } from '../providers/claude-code/nativeSessions';
import type { ProviderBindingRepository } from '../storage/providerBindingRepository';

export class MessageRouter {
  private readonly providers = new Map<ProviderId, NativeProviderAdapter>();

  constructor(
    private readonly options: {
      channel: ChannelAdapter;
      permissions: PermissionRouter;
      providers: NativeProviderAdapter[];
      sessions: SessionManager;
      resolveUser(message: ChannelIncomingMessage): AuthorizedUserRecord | null;
      autoAuthorizeUser?(message: ChannelIncomingMessage): AuthorizedUserRecord | null;
      autoAttachSession?(message: ChannelIncomingMessage, user: AuthorizedUserRecord): Promise<BridgeSessionRecord | null>;
      sessionRepository?: RuntimeSessionRepository;
      permissionRepository?: PermissionRequestRepository;
      eventLogRepository?: BridgeEventRepository;
      pairingRepository?: PairingRepository;
      bindingRepository?: ProviderBindingRepository;
      events?: BridgeEventHub;
    },
  ) {
    for (const provider of options.providers) this.providers.set(provider.id, provider);
  }

  async handleMessage(message: ChannelIncomingMessage): Promise<
    { status: 'accepted' } | { status: 'pairing_required'; code: string }
  > {
    let user = this.options.resolveUser(message);
    if (!user) {
      user = this.options.autoAuthorizeUser?.(message) ?? null;
    }
    if (!user) {
      if (this.options.pairingRepository && this.options.events) {
        const pairing = ensurePairingForMessage(this.options.pairingRepository, this.options.events, message);
        return { status: 'pairing_required', code: pairing.code };
      }
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
    const session = this.options.sessions.getActiveSession(message.chatId)
      ?? await this.options.autoAttachSession?.(message, user)
      ?? this.options.sessions.createSession({
        chatId: message.chatId,
        ownerUserId: user.id,
        providerId: user.defaultProvider,
        cwd: user.defaultCwd,
        resumeTitle: sessionResumeTitle,
      });
    this.persistSessionIfNeeded(session);
    const provider = this.providers.get(session.providerId);
    if (!provider) throw new Error(`provider_not_registered:${session.providerId}`);

    if (!session.providerSessionId) {
      const resumeTitle = session.resumeTitle ?? sessionResumeTitle;
      this.options.sessions.updateSession(session.id, {
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
      const updated = this.options.sessions.updateSession(session.id, {
        providerSessionId: providerSession.providerSessionId,
        resumeTitle,
        status: providerSession.status,
        lastActivityAt: Date.now(),
      });
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
        this.options.eventLogRepository?.append({
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
        this.options.eventLogRepository?.append({
          bridgeSessionId: session.id,
          direction: 'provider_event',
          providerEventType: event.type,
          text: event.error,
          createdAt: Date.now(),
        });
        const errorText = `Provider error: ${event.error}`;
        await this.options.channel.sendMessage({
          chatId: message.chatId,
          kind: 'status',
          text: errorText,
        });
      }
    }
    return { status: 'accepted' };
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
      recoverySource: session.recoverySource,
      resumeTitle: session.resumeTitle,
      cwd: session.cwd,
      status: session.status,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      archivedAt: session.archivedAt,
    });
  }

  private async persistBridgeMetadata(session: BridgeSessionRecord, platformUserId: string): Promise<void> {
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
