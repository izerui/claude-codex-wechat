import type { FastifyInstance } from 'fastify';
import { persistBridgeDefaultsToConfigFile } from '../daemon/configPersistence';
import type { ProviderId } from '../providers/types';

export type BridgeSettings = {
  defaultProvider: ProviderId;
  defaultWorkspace: string;
  ngrok: {
    enabled: boolean;
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
      ngrok: {
        ...current.ngrok,
        ...(request.body.ngrok && typeof request.body.ngrok === 'object' ? request.body.ngrok : {}),
      },
    }, current.defaultWorkspace);
    input.defaults.defaultProvider = next.defaultProvider;
    input.defaults.defaultWorkspace = next.defaultWorkspace;
    input.defaults.ngrok.enabled = next.ngrok.enabled;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      defaultProvider: next.defaultProvider,
      defaultWorkspace: next.defaultWorkspace,
      ngrokEnabled: next.ngrok.enabled,
    });
    return { ok: true };
  });
}

function normalizeSettings(input: Partial<Record<keyof BridgeSettings, unknown>>, defaultWorkspace: string): BridgeSettings {
  const ngrok = input.ngrok && typeof input.ngrok === 'object' ? input.ngrok as Record<string, unknown> : {};
  return {
    defaultProvider: input.defaultProvider === 'codex' ? 'codex' : 'claude-code',
    defaultWorkspace: typeof input.defaultWorkspace === 'string' && input.defaultWorkspace.trim()
      ? input.defaultWorkspace
      : defaultWorkspace,
    ngrok: {
      enabled: ngrok.enabled === true,
    },
  };
}
