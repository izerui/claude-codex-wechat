import type { FastifyInstance } from 'fastify';
import { ensureRelayAuthTokenSync, persistBridgeDefaultsToConfigFile } from '../daemon/configPersistence';
import type { ProviderId } from '../providers/types';

export type BridgeSettings = {
  defaultProvider: ProviderId;
  defaultWorkspace: string;
  tunnel: {
    enabled: boolean;
    relay?: {
      serverUrl?: string;
      authToken?: string;
    };
  };
};

export function registerSettingsRoutes(input: {
  app: FastifyInstance;
  defaults: BridgeSettings;
  configPath: string;
}): void {
  input.app.get('/api/settings', async () => input.defaults);

  input.app.post<{ Body: Partial<BridgeSettings> }>('/api/settings', async (request) => {
    const current = { ...input.defaults };
    const next = normalizeSettings({
      ...current,
      ...request.body,
      tunnel: {
        ...current.tunnel,
        ...(request.body.tunnel && typeof request.body.tunnel === 'object' ? request.body.tunnel : {}),
        relay: {
          ...(current.tunnel?.relay ?? {}),
          ...((request.body.tunnel && typeof request.body.tunnel === 'object' && 'relay' in request.body.tunnel && request.body.tunnel.relay && typeof request.body.tunnel.relay === 'object')
            ? request.body.tunnel.relay as Record<string, unknown>
            : {}),
        },
      },
    }, current.defaultWorkspace);
    if (!next.tunnel.relay?.authToken) {
      const authToken = ensureRelayAuthTokenSync({ configPath: input.configPath });
      next.tunnel = {
        ...next.tunnel,
        relay: {
          ...(next.tunnel.relay ?? {}),
          authToken,
        },
      };
    }
    input.defaults.defaultProvider = next.defaultProvider;
    input.defaults.defaultWorkspace = next.defaultWorkspace;
    input.defaults.tunnel = next.tunnel;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      defaultProvider: next.defaultProvider,
      defaultWorkspace: next.defaultWorkspace,
      tunnel: next.tunnel,
    });
    return { ok: true };
  });
}

function normalizeSettings(input: Partial<Record<keyof BridgeSettings, unknown>>, defaultWorkspace: string): BridgeSettings {
  const tunnel = input.tunnel && typeof input.tunnel === 'object' ? input.tunnel as Record<string, unknown> : {};
  const relay = tunnel.relay && typeof tunnel.relay === 'object' ? tunnel.relay as Record<string, unknown> : {};
  return {
    defaultProvider: input.defaultProvider === 'codex' ? 'codex' : 'claude-code',
    defaultWorkspace: typeof input.defaultWorkspace === 'string' && input.defaultWorkspace.trim()
      ? input.defaultWorkspace
      : defaultWorkspace,
    tunnel: {
      enabled: tunnel.enabled !== false,
      ...((typeof relay.serverUrl === 'string' && relay.serverUrl.trim()) || (typeof relay.authToken === 'string' && relay.authToken.trim()) || !('relay' in tunnel)
        ? {
            relay: {
              serverUrl: typeof relay.serverUrl === 'string' && relay.serverUrl.trim() ? relay.serverUrl : 'wss://wechat.style520.com/agent',
              ...(typeof relay.authToken === 'string' && relay.authToken.trim() ? { authToken: relay.authToken } : {}),
            },
          }
        : {}),
    },
  };
}
