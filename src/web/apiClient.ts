type BrowserLike = Partial<Pick<Location, 'host' | 'origin'>>;
type WindowBridgeLike = { __bridgeApiOrigin?: string };

export type ActiveWeChatUserView = {
  id: string;
  platform: string;
  platformUserId: string;
  displayName?: string;
  role: string;
  provider: string;
  cwd: string;
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
  provider: 'claude-code' | 'codex';
  cwd: string;
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
  resumeTitle?: string;
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
};

export type BridgeWsEvent =
  | { type: 'channel.user-authorized'; user: ActiveWeChatUserEventView }
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

export async function fetchActiveUser(): Promise<ActiveWeChatUserView | null> {
  return await requestJsonOptional('/api/channel/active-user');
}

export async function fetchChannelPlugins(): Promise<ChannelPluginView[]> {
  return await requestJson('/api/channel/plugins');
}

export async function fetchWeixinRuntimeConfig(): Promise<WeixinRuntimeConfigView | null> {
  return await requestJsonOptional('/api/channel/wechat/runtime-config');
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

export async function fetchSessions(): Promise<BridgeSessionView[]> {
  return await requestJson('/api/channel/sessions');
}

export async function fetchRecoverableProviderSessions(providerId: 'claude-code' | 'codex'): Promise<RecoverableProviderSessionView[]> {
  return await requestJson(`/api/channel/providers/${encodeURIComponent(providerId)}/recoverable-sessions`);
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
