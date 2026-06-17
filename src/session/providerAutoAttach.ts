import type { ChannelIncomingMessage } from '../channels/types';
import { upsertCodexSessionIndexEntry } from '../providers/codex/sessionIndex';
import { syncCodexThreadForResume } from '../providers/codex/nativeThreads';
import type { NativeProviderAdapter, ProviderId, ProviderSessionCandidate } from '../providers/types';
import type { CurrentConversationBinding, CurrentConversationStore } from './currentConversationStore';
import type { ActiveWeChatUserRecord } from '../storage/userStore';
import type { LastProviderSessionStore } from '../storage/lastProviderSessionStore';
import { buildSessionBridgeName } from './sessionBridgeTag';

export type AutoAttachSelection = {
  candidate: ProviderSessionCandidate;
  matchedBinding: boolean;
  bindingSource: 'binding_table' | 'sidecar' | 'heuristic';
};

export async function listUnattachedRecoverableSessions(input: {
  provider: NativeProviderAdapter;
  providerId: ProviderId;
  currentSession?: CurrentConversationBinding | null;
}): Promise<ProviderSessionCandidate[]> {
  if (!input.provider.listRecoverableSessions) return [];
  const attachedIds = new Set(
    [input.currentSession]
      .filter((session): session is CurrentConversationBinding => Boolean(session && session.providerId === input.providerId))
      .map((session) => session.providerSessionId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  return (await input.provider.listRecoverableSessions()).filter((candidate) => !attachedIds.has(candidate.id));
}

export async function selectBestRecoverableSession(input: {
  provider: NativeProviderAdapter;
  providerId: ProviderId;
  targetCwd: string;
  lastProviderSessions?: LastProviderSessionStore;
  currentSession?: CurrentConversationBinding | null;
  allowHeuristicMatch?: boolean;
}): Promise<AutoAttachSelection | null> {
  const persistedBinding = input.lastProviderSessions?.get(input.providerId) ?? null;
  if (persistedBinding) {
    const candidates = await listUnattachedRecoverableSessions({
      provider: input.provider,
      providerId: input.providerId,
      currentSession: input.currentSession,
    });
    const exact = candidates.find((candidate) => candidate.id === persistedBinding.providerSessionId);
    if (exact) return { candidate: exact, matchedBinding: true, bindingSource: 'binding_table' };
  }
  if (input.allowHeuristicMatch === false) return null;
  const candidates = await listUnattachedRecoverableSessions({
    provider: input.provider,
    providerId: input.providerId,
    currentSession: input.currentSession,
  });
  candidates.sort((a, b) => {
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
  conversationStore: CurrentConversationStore;
  lastProviderSessions?: LastProviderSessionStore;
  provider: NativeProviderAdapter;
  user: ActiveWeChatUserRecord;
  providerId: ProviderId;
  providerSessionId: string;
  chatId: string;
  cwd: string;
  recoverySource: CurrentConversationBinding['recoverySource'];
  resumeTitle?: string;
}): Promise<CurrentConversationBinding> {
  const session = input.conversationStore.create({
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
  const updated = input.conversationStore.update({
    providerSessionId: attached?.providerSessionId,
    status: attached?.status ?? session.status,
    lastActivityAt: Date.now(),
  }) ?? session;
  input.lastProviderSessions?.set(input.providerId, {
    providerSessionId: updated.providerSessionId ?? input.providerSessionId,
    cwd: updated.cwd,
  });
  if (updated.providerSessionId) {
    if (updated.providerId === 'codex' && updated.resumeTitle) {
      await upsertCodexSessionIndexEntry({
        sessionId: updated.providerSessionId,
        threadName: updated.resumeTitle,
      });
      await syncCodexThreadForResume({
        sessionId: updated.providerSessionId,
        resumeTitle: updated.resumeTitle,
        cwd: updated.cwd,
      });
    }
  }
  return updated;
}

export async function autoAttachProviderSessionForMessage(input: {
  message: ChannelIncomingMessage;
  user: ActiveWeChatUserRecord;
  provider: NativeProviderAdapter;
  conversationStore: CurrentConversationStore;
  lastProviderSessions?: LastProviderSessionStore;
  defaultProviderId: ProviderId;
  defaultCwd: string;
}): Promise<{ session: CurrentConversationBinding; matchedBinding: boolean; bindingSource: CurrentConversationBinding['recoverySource'] } | null> {
  const selection = await selectBestRecoverableSession({
    provider: input.provider,
    providerId: input.defaultProviderId,
    targetCwd: input.user.currentConversation?.cwd ?? input.defaultCwd,
    lastProviderSessions: input.lastProviderSessions,
    currentSession: input.conversationStore.getCurrent(),
    allowHeuristicMatch: false,
  });
  if (!selection) return null;
  const session = await attachProviderSessionToBridge({
    conversationStore: input.conversationStore,
    lastProviderSessions: input.lastProviderSessions,
    provider: input.provider,
    user: input.user,
    providerId: input.defaultProviderId,
    providerSessionId: selection.candidate.id,
    chatId: input.message.chatId,
    cwd: selection.candidate.cwd ?? input.user.currentConversation?.cwd ?? input.defaultCwd,
    recoverySource: selection.bindingSource,
    resumeTitle: selection.candidate.resumeTitle,
  });
  return { session, matchedBinding: selection.matchedBinding, bindingSource: selection.bindingSource };
}
