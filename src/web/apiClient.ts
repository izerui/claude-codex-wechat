export type PairingView = {
  code: string;
  platformUserId: string;
  chatId: string;
  displayName?: string;
  requestedAt: number;
  expiresAt: number;
  status: string;
};

export type PairingEventView = {
  code: string;
  platformUserId: string;
  platformType: 'weixin';
  display_name?: string;
  requestedAt: number;
  expiresAt: number;
};

type BrowserLike = Partial<Pick<Location, 'host' | 'origin'>>;
type WindowBridgeLike = { __bridgeApiOrigin?: string };

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

export type AuthorizedUserEventView = {
  id: string;
  platformUserId: string;
  platformType: 'weixin';
  display_name?: string;
  authorizedAt: number;
  lastActive?: number;
  defaultProvider: 'claude-code' | 'codex';
  defaultCwd: string;
};

export type ChannelPluginView = {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  status: string;
  activeUsers: number;
  hasToken: boolean;
  botUsername?: string;
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

export type BridgeWsEvent =
  | { type: 'channel.pairing-requested'; pairing: PairingEventView }
  | { type: 'channel.user-authorized'; user: AuthorizedUserEventView }
  | { type: 'channel.plugin-status-changed'; plugin_id: 'weixin'; status: ChannelPluginView }
  | { type: 'status'; message: string }
  | { type: 'permission_requested'; requestId: string }
  | { type: 'permission_decided'; requestId: string; decision: string };

export function resolveApiBaseUrlForTest(windowLike: WindowBridgeLike, locationLike: BrowserLike): string {
  if (typeof windowLike.__bridgeApiOrigin === 'string' && windowLike.__bridgeApiOrigin) {
    return windowLike.__bridgeApiOrigin;
  }
  return typeof locationLike.origin === 'string' && locationLike.origin ? locationLike.origin : '';
}

function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return resolveApiBaseUrlForTest(window as WindowBridgeLike, window.location);
  }
  return '';
}

export function resolveApiUrl(path: string): string {
  return `${resolveApiBaseUrl()}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), init);
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

export async function fetchChannelPlugins(): Promise<ChannelPluginView[]> {
  return await requestJson('/api/channel/plugins');
}

export async function enableWeixinPlugin(input: { accountId: string; botToken: string; baseUrl?: string }): Promise<void> {
  await requestJson('/api/channel/plugins/enable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      plugin_id: 'weixin',
      config: {
        ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
        credentials: {
          account_id: input.accountId,
          bot_token: input.botToken,
          ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
        },
      },
    }),
  });
}

export async function disableWeixinPlugin(): Promise<void> {
  await requestJson('/api/channel/plugins/disable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plugin_id: 'weixin' }),
  });
}

export async function syncWeixinChannelSettings(): Promise<void> {
  await requestJson('/api/channel/settings/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'weixin' }),
  });
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
