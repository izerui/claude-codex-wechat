export type PairingView = {
  code: string;
  platformUserId: string;
  chatId: string;
  displayName?: string;
  requestedAt: number;
  expiresAt: number;
  status: string;
};

export type AuthorizedUserView = {
  id: string;
  platform: string;
  platformUserId: string;
  displayName?: string;
  role: string;
  defaultProvider: string;
  defaultCwd: string;
  createdAt: number;
  lastActiveAt?: number;
};

export type ProviderStatusView = {
  claude?: unknown;
  codex?: unknown;
};

export type BridgeSessionView = {
  id: string;
  chatId: string;
  ownerUserId: string;
  providerId: string;
  providerSessionId?: string;
  cwd: string;
  status: string;
  createdAt: number;
  lastActivityAt: number;
  archivedAt?: number;
};

export type PermissionRequestView = {
  id: string;
  bridgeSessionId: string;
  providerId: string;
  toolName: string;
  summary: string;
  details?: unknown;
  status: string;
  requestedAt: number;
  expiresAt?: number;
};

export type StatusView = {
  ok: boolean;
  sessions: BridgeSessionView[];
  permissions: PermissionRequestView[];
};

export type BridgeSettingsView = {
  defaultProvider: 'claude-code' | 'codex';
  defaultWorkspace: string;
  permissionTimeoutMs: number | 'never';
  wechatThrottle: {
    minIntervalMs: number;
    chunkSize: number;
  };
  highRiskCommandPolicy: 'per_request' | 'deny' | 'allow';
};

export type MessageLogView = {
  id: string;
  bridgeSessionId: string;
  direction: 'inbound' | 'outbound' | 'provider_event';
  platformMessageId?: string;
  providerEventType?: string;
  text?: string;
  createdAt: number;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`${path}_failed:${response.status}`);
  return await response.json() as T;
}

export async function fetchStatus(): Promise<StatusView> {
  return await requestJson('/api/status');
}

export async function fetchProviderStatus(): Promise<ProviderStatusView> {
  return await requestJson('/api/providers/status');
}

export async function fetchPairings(): Promise<PairingView[]> {
  return await requestJson('/api/channel/pairings');
}

export async function approvePairing(code: string): Promise<void> {
  await requestJson(`/api/channel/pairings/${encodeURIComponent(code)}/approve`, { method: 'POST' });
}

export async function rejectPairing(code: string): Promise<void> {
  await requestJson(`/api/channel/pairings/${encodeURIComponent(code)}/reject`, { method: 'POST' });
}

export async function fetchAuthorizedUsers(): Promise<AuthorizedUserView[]> {
  return await requestJson('/api/channel/users');
}

export async function revokeAuthorizedUser(id: string): Promise<void> {
  await requestJson(`/api/channel/users/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
}

export async function fetchSessions(): Promise<BridgeSessionView[]> {
  return await requestJson('/api/channel/sessions');
}

export async function fetchSessionMessages(id: string): Promise<MessageLogView[]> {
  return await requestJson(`/api/channel/sessions/${encodeURIComponent(id)}/messages`);
}

export async function stopSession(id: string): Promise<void> {
  await requestJson(`/api/channel/sessions/${encodeURIComponent(id)}/stop`, { method: 'POST' });
}

export async function archiveSession(id: string): Promise<void> {
  await requestJson(`/api/channel/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

export async function decidePermission(input: {
  requestId: string;
  userId: string;
  decision: 'approve' | 'deny' | 'abort';
}): Promise<void> {
  await requestJson('/api/permissions/decide', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function fetchSettings(): Promise<BridgeSettingsView> {
  return await requestJson('/api/settings');
}

export async function updateSettings(settings: BridgeSettingsView): Promise<void> {
  await requestJson('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
}
