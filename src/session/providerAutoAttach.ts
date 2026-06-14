import type { ChannelIncomingMessage } from '../channels/types';
import { writeProviderSessionSidecar } from '../providers/sidecarMetadata';
import { upsertCodexSessionIndexEntry } from '../providers/codex/sessionIndex';
import type { NativeProviderAdapter, ProviderId, ProviderSessionCandidate } from '../providers/types';
import type { BridgeSessionRecord, SessionManager } from './sessionManager';
import type { ProviderBindingRepository } from '../storage/providerBindingRepository';
import type { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import type { AuthorizedUserRecord } from '../storage/userRepository';
import { buildSessionBridgeName } from './sessionBridgeTag';

export type AutoAttachSelection = {
  candidate: ProviderSessionCandidate;
  matchedBinding: boolean;
  bindingSource: 'binding_table' | 'sidecar' | 'heuristic';
};

export async function listUnattachedRecoverableSessions(input: {
  provider: NativeProviderAdapter;
  providerId: ProviderId;
  sessionRepository?: RuntimeSessionRepository;
}): Promise<ProviderSessionCandidate[]> {
  if (!input.provider.listRecoverableSessions) return [];
  const attachedIds = new Set(
    (input.sessionRepository?.list() ?? [])
      .filter((session) => session.providerId === input.providerId && !session.archivedAt)
      .map((session) => session.providerSessionId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  return (await input.provider.listRecoverableSessions()).filter((candidate) => !attachedIds.has(candidate.id));
}

export async function selectBestRecoverableSession(input: {
  provider: NativeProviderAdapter;
  providerId: ProviderId;
  targetCwd: string;
  targetPlatformUserId?: string;
  targetChatId?: string;
  bindingRepository?: ProviderBindingRepository;
  sessionRepository?: RuntimeSessionRepository;
  allowHeuristicMatch?: boolean;
}): Promise<AutoAttachSelection | null> {
  const persistedBinding = input.targetChatId
    ? input.bindingRepository?.findByChat('weixin', input.targetChatId, input.providerId)
    : null;
  if (persistedBinding) {
    const candidates = await listUnattachedRecoverableSessions(input);
    const exact = candidates.find((candidate) => candidate.id === persistedBinding.providerSessionId);
    if (exact) return { candidate: exact, matchedBinding: true, bindingSource: 'binding_table' };
    return {
      candidate: {
        id: persistedBinding.providerSessionId,
        providerId: input.providerId,
        cwd: persistedBinding.cwd,
        lastActivityAt: persistedBinding.updatedAt,
      },
      matchedBinding: true,
      bindingSource: 'binding_table',
    };
  }
  if (input.allowHeuristicMatch === false) return null;
  const candidates = await listUnattachedRecoverableSessions(input);
  candidates.sort((a, b) => {
    const aTagMatch = a.bridgeTag?.platformUserId === input.targetPlatformUserId && a.bridgeTag?.chatId === input.targetChatId ? 1 : 0;
    const bTagMatch = b.bridgeTag?.platformUserId === input.targetPlatformUserId && b.bridgeTag?.chatId === input.targetChatId ? 1 : 0;
    if (aTagMatch !== bTagMatch) return bTagMatch - aTagMatch;
    const aMatch = a.cwd === input.targetCwd ? 1 : 0;
    const bMatch = b.cwd === input.targetCwd ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
  });
  const candidate = candidates[0];
  if (!candidate) return null;
  if (candidate.cwd && candidate.cwd !== input.targetCwd) return null;
  return {
    candidate,
    matchedBinding: false,
    bindingSource: candidate.bridgeBindingSource === 'sidecar' ? 'sidecar' : 'heuristic',
  };
}

export async function attachProviderSessionToBridge(input: {
  sessionManager: SessionManager;
  bindingRepository?: ProviderBindingRepository;
  sessionRepository?: RuntimeSessionRepository;
  provider: NativeProviderAdapter;
  user: AuthorizedUserRecord;
  providerId: ProviderId;
  providerSessionId: string;
  chatId: string;
  cwd: string;
  recoverySource: BridgeSessionRecord['recoverySource'];
  resumeTitle?: string;
}): Promise<BridgeSessionRecord> {
  const session = input.sessionManager.createSession({
    chatId: input.chatId,
    ownerUserId: input.user.id,
    providerId: input.providerId,
    cwd: input.cwd,
    recoverySource: input.recoverySource,
    resumeTitle: input.resumeTitle ?? buildSessionBridgeName({
      platform: 'weixin',
      platformUserId: input.user.platformUserId,
      chatId: input.chatId,
    }),
  });
  const attached = await input.provider.attachSession?.({
    candidateId: input.providerSessionId,
    bridgeSessionId: session.id,
    cwd: session.cwd,
  });
  const updated = input.sessionManager.updateSession(session.id, {
    providerSessionId: attached?.providerSessionId,
    status: attached?.status ?? session.status,
    lastActivityAt: Date.now(),
  });
  input.sessionRepository?.createWithId({
    id: updated.id,
    chatId: updated.chatId,
    ownerUserId: updated.ownerUserId,
    providerId: updated.providerId,
    providerSessionId: updated.providerSessionId,
    recoverySource: updated.recoverySource,
    resumeTitle: updated.resumeTitle,
    cwd: updated.cwd,
    status: updated.status,
    createdAt: updated.createdAt,
    lastActivityAt: updated.lastActivityAt,
    archivedAt: updated.archivedAt,
  });
  input.bindingRepository?.upsert({
    platform: 'weixin',
    platformUserId: input.user.platformUserId,
    chatId: input.chatId,
    providerId: input.providerId,
    providerSessionId: updated.providerSessionId ?? input.providerSessionId,
    cwd: updated.cwd,
  });
  if (updated.providerSessionId) {
    await writeProviderSessionSidecar({
      providerId: input.providerId,
      providerSessionId: updated.providerSessionId,
      bridgeTag: {
        platform: 'weixin',
        platformUserId: input.user.platformUserId,
        chatId: input.chatId,
      },
      cwd: updated.cwd,
    });
    if (updated.providerId === 'codex' && updated.resumeTitle) {
      await upsertCodexSessionIndexEntry({
        sessionId: updated.providerSessionId,
        threadName: updated.resumeTitle,
      });
    }
  }
  return updated;
}

export async function autoAttachProviderSessionForMessage(input: {
  message: ChannelIncomingMessage;
  user: AuthorizedUserRecord;
  provider: NativeProviderAdapter;
  sessionManager: SessionManager;
  bindingRepository?: ProviderBindingRepository;
  sessionRepository?: RuntimeSessionRepository;
}): Promise<{ session: BridgeSessionRecord; matchedBinding: boolean; bindingSource: BridgeSessionRecord['recoverySource'] } | null> {
  const selection = await selectBestRecoverableSession({
    provider: input.provider,
    providerId: input.user.defaultProvider,
    targetCwd: input.user.defaultCwd,
    targetPlatformUserId: input.user.platformUserId,
    targetChatId: input.message.chatId,
    bindingRepository: input.bindingRepository,
    sessionRepository: input.sessionRepository,
    allowHeuristicMatch: false,
  });
  if (!selection) return null;
  const session = await attachProviderSessionToBridge({
    sessionManager: input.sessionManager,
    bindingRepository: input.bindingRepository,
    sessionRepository: input.sessionRepository,
    provider: input.provider,
    user: input.user,
    providerId: input.user.defaultProvider,
    providerSessionId: selection.candidate.id,
    chatId: input.message.chatId,
    cwd: selection.candidate.cwd ?? input.user.defaultCwd,
    recoverySource: selection.bindingSource,
    resumeTitle: selection.candidate.resumeTitle,
  });
  return { session, matchedBinding: selection.matchedBinding, bindingSource: selection.bindingSource };
}
