type BrowserLike = Partial<Pick<Location, 'host' | 'origin'>>;
type PathLike = Partial<Pick<Location, 'pathname'>>;
type WindowBridgeLike = { __bridgeApiOrigin?: string };

export type ActiveWeChatUserView = {
  id: string;
  platform: string;
  platformUserId: string;
  displayName?: string;
  role: string;
  createdAt: number;
  updatedAt?: number;
};

export type ActiveWeChatUserEventView = {
  id: string;
  platformUserId: string;
  platformType: 'weixin';
  display_name?: string;
  authorizedAt: number;
  lastActive?: number;
};

export type AuthorizedUserEventView = ActiveWeChatUserEventView & {
  defaultProvider: 'claude-code' | 'codex';
  defaultCwd: string;
};

export type AuthorizedUserView = {
  id: string;
  platform: string;
  platformUserId: string;
  displayName?: string;
  role: string;
  defaultProvider: 'claude-code' | 'codex';
  defaultCwd: string;
  createdAt: number;
  lastActiveAt?: number;
};

export type PairingView = {
  code: string;
  platformUserId: string;
  chatId: string;
  displayName?: string;
  requestedAt: number;
  expiresAt?: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
};

export type PairingEventView = {
  code: string;
  platformUserId: string;
  display_name?: string;
  requestedAt: number;
  expiresAt?: number;
};

export type ChannelPluginView = {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  status: string;
  lastError?: string;
  activeUsers: number;
  hasToken: boolean;
  botUsername?: string;
};

export type WeixinRuntimeConfigView = {
  enabled: boolean;
  baseUrl?: string;
  token?: string;
  accountId?: string;
};

export type RecoverableProviderSessionView = {
  id: string;
  providerId: 'claude-code' | 'codex';
  cwd?: string;
  title?: string;
  resumeTitle?: string;
  lastActivityAt?: number;
  preferredResumeMode?: 'title' | 'id';
  preferredResumeCommand?: string;
  providerResumeCommand?: string;
  providerResumeByTitleCommand?: string;
  providerResumeTitleSynced?: boolean;
  providerResumeHistorySynced?: boolean;
  providerResumeRepairable?: boolean;
};

export type RecoverableProviderSessionPage = {
  items: RecoverableProviderSessionView[];
  nextCursor: string | null;
};

export type ProviderStatusView = {
  claude?: unknown;
  codex?: unknown;
};

export type CurrentSessionView = {
  id: string;
  chatId: string;
  ownerUserId: string;
  providerId: string;
  providerSessionId?: string;
  resumeTitle?: string;
  nativeTitle?: string;
  preferredResumeMode?: 'title' | 'id';
  preferredResumeCommand?: string;
  providerResumeCommand?: string;
  providerResumeByTitleCommand?: string;
  providerResumeTitleSynced?: boolean;
  providerResumeHistorySynced?: boolean;
  providerResumeRepairable?: boolean;
  bindingMatched?: boolean;
  bindingSource?: 'runtime' | 'manual_attach' | 'binding_table' | 'sidecar' | 'heuristic';
  bindingPlatformUserId?: string;
  bindingProviderSessionId?: string;
  bindingUpdatedAt?: number;
  providerNativeReachable?: boolean;
  providerNativePath?: string;
  cwd: string;
  status: string;
  createdAt: number;
  lastActivityAt: number;
  archivedAt?: number;
};

export type BridgeSessionView = CurrentSessionView;

export type UpdateStatusView = {
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable: boolean;
  lastCheckedAt?: number;
};

export type StatusView = {
  ok: boolean;
  version?: string;
  sessions: CurrentSessionView[];
  preferredLocalUrl?: string;
  update?: UpdateStatusView | null;
};

export type BridgeSettingsView = {
  defaultProvider: 'claude-code' | 'codex';
  defaultWorkspace: string;
  tunnel: {
    relay?: {
      serverUrl?: string;
      authToken?: string;
    };
  };
};

export type TunnelStatusView = {
  installed: boolean;
  enabled: boolean;
  running: boolean;
  status: 'not_installed' | 'stopped' | 'starting' | 'running' | 'error';
  publicUrl?: string;
  error?: string;
};

export type BridgeWsEvent =
  | { type: 'connected' }
  | { type: 'ping' }
  | { type: 'channel.pairing-requested'; pairing: PairingEventView }
  | { type: 'channel.user-authorized'; user: ActiveWeChatUserEventView }
  | { type: 'channel.plugin-status-changed'; plugin_id: 'weixin'; status: ChannelPluginView }
  | { type: 'channel.current-session-changed' }
  | { type: 'status'; message: string };

export function resolveApiBaseUrlForTest(
  windowLike: WindowBridgeLike,
  locationLike: BrowserLike & PathLike,
): string {
  if (typeof windowLike.__bridgeApiOrigin === 'string' && windowLike.__bridgeApiOrigin) {
    return windowLike.__bridgeApiOrigin;
  }
  const origin = typeof locationLike.origin === 'string' && locationLike.origin ? locationLike.origin : '';
  const pathname = typeof locationLike.pathname === 'string' ? locationLike.pathname : '';
  const firstSegment = pathname.split('/').filter(Boolean)[0] ?? '';
  if (!origin) return '';
  if (!firstSegment) return origin;
  // Relay path mode mounts the whole app under /<token>; API calls must stay under that prefix.
  return `${origin}/${firstSegment}`;
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

async function requestJsonOptional<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(resolveApiUrl(path), init);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${path}_failed:${response.status}`);
  return await response.json() as T;
}

export async function fetchStatus(): Promise<StatusView> {
  return await requestJson('/api/status');
}

export async function fetchProviderStatus(): Promise<ProviderStatusView> {
  return await requestJson('/api/providers/status');
}

export async function fetchTunnelStatus(): Promise<TunnelStatusView> {
  return await requestJson('/api/tunnel/status');
}

export async function startTunnel(): Promise<TunnelStatusView> {
  return await requestJson('/api/tunnel/start', { method: 'POST' });
}

export async function stopTunnel(): Promise<TunnelStatusView> {
  return await requestJson('/api/tunnel/stop', { method: 'POST' });
}

export type DirectoryEntryView = {
  name: string;
  path: string;
  isDirectory: true;
};

export type DirectoryListingView = {
  path: string;
  parent: string | null;
  isRoot: boolean;
  entries: DirectoryEntryView[];
};

export async function listDirectory(path?: string, keep?: string): Promise<DirectoryListingView> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  if (keep) params.set('keep', keep);
  const query = params.toString();
  return await requestJson(`/api/fs/list${query ? `?${query}` : ''}`);
}

export async function fetchActiveUser(): Promise<ActiveWeChatUserView | null> {
  return await requestJsonOptional('/api/channel/active-user');
}

export async function fetchAuthorizedUsers(): Promise<AuthorizedUserView[]> {
  const active = await fetchActiveUser();
  if (!active) return [];
  return [{
    id: active.id,
    platform: active.platform,
    platformUserId: active.platformUserId,
    displayName: active.displayName,
    role: active.role,
    defaultProvider: 'claude-code',
    defaultCwd: '/tmp/project',
    createdAt: active.createdAt,
    lastActiveAt: active.updatedAt,
  }];
}

export async function fetchPairings(): Promise<PairingView[]> {
  return [];
}

export async function fetchChannelPlugins(): Promise<ChannelPluginView[]> {
  return await requestJson('/api/channel/plugins');
}

export async function fetchWeixinRuntimeConfig(): Promise<WeixinRuntimeConfigView | null> {
  return await requestJsonOptional('/api/channel/wechat/runtime-config');
}

export type LastProviderSessionView = {
  providerSessionId: string;
  cwd: string;
  updatedAt: number;
};

export type WeixinQuotaView = {
  remaining: number;
  sentCount: number;
  limit: number;
  expired: boolean;
  /** Absolute time (ms) the token's 24h window closes; 0 when no token. */
  windowEndsAt: number;
};

export type ChannelStateView = {
  activeUser: ActiveWeChatUserView | null;
  plugin: ChannelPluginView;
  settings: BridgeSettingsView;
  runtimeConfig: WeixinRuntimeConfigView | null;
  lastProviderSessions?: Partial<Record<'claude-code' | 'codex', LastProviderSessionView>>;
  quota?: WeixinQuotaView | null;
};

export async function fetchChannelState(): Promise<ChannelStateView> {
  return await requestJson('/api/channel/state');
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

export async function fetchCurrentSession(): Promise<CurrentSessionView | null> {
  const current = await requestJsonOptional<CurrentSessionView>('/api/channel/current-session');
  if (current) return current;
  const legacy = await requestJsonOptional<CurrentSessionView[]>('/api/channel/sessions');
  return legacy?.[0] ?? null;
}

export async function fetchRecoverableProviderSessions(
  providerId: 'claude-code' | 'codex',
  input?: { limit?: number; cursor?: string | null },
): Promise<RecoverableProviderSessionPage> {
  const params = new URLSearchParams();
  if (typeof input?.limit === 'number' && input.limit > 0) params.set('limit', String(input.limit));
  if (input?.cursor) params.set('cursor', input.cursor);
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const payload = await requestJson<RecoverableProviderSessionView[] | RecoverableProviderSessionPage>(
    `/api/channel/providers/${encodeURIComponent(providerId)}/recoverable-sessions${query}`,
  );
  if (Array.isArray(payload)) return { items: payload, nextCursor: null };
  return payload;
}

export async function attachProviderSession(input: {
  providerId: 'claude-code' | 'codex';
  providerSessionId: string;
  platformUserId: string;
  chatId?: string;
  cwd?: string;
}): Promise<void> {
  await requestJson('/api/channel/sessions/attach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function createNewSession(input: {
  providerId: 'claude-code' | 'codex';
  cwd: string;
  platformUserId: string;
  chatId?: string;
}): Promise<void> {
  await requestJson('/api/channel/sessions/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function autoAttachProviderSession(input: {
  providerId: 'claude-code' | 'codex';
  platformUserId: string;
  chatId?: string;
  cwd?: string;
}): Promise<void> {
  await requestJson('/api/channel/sessions/auto-attach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function repairRecoverableProviderSessionNativeResume(input: {
  providerId: 'claude-code' | 'codex';
  providerSessionId: string;
}): Promise<{ ok: true; repaired: boolean }> {
  return await requestJson(`/api/channel/providers/${encodeURIComponent(input.providerId)}/recoverable-sessions/${encodeURIComponent(input.providerSessionId)}/repair-native-resume`, {
    method: 'POST',
  });
}

export async function repairAllRecoverableProviderSessionsNativeResume(input: {
  providerId: 'claude-code' | 'codex';
}): Promise<{ ok: true; repairedCount: number; checkedCount: number }> {
  return await requestJson(`/api/channel/providers/${encodeURIComponent(input.providerId)}/recoverable-sessions/repair-native-resume`, {
    method: 'POST',
  });
}

export async function approvePairing(_code: string): Promise<void> {
  return;
}

export async function rejectPairing(_code: string): Promise<void> {
  return;
}

export async function revokeAuthorizedUser(_userId: string): Promise<void> {
  return;
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
