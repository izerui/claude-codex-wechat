import type { FastifyInstance } from 'fastify';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import type { ProviderId } from '../providers/types';
import type { SettingsRepository } from '../storage/settingsRepository';
import type { UserRepository } from '../storage/userRepository';

export type BridgeSettings = {
  defaultProvider: ProviderId;
  defaultWorkspace: string;
  permissionTimeoutMs: number | 'never';
  highRiskCommandPolicy: 'per_request' | 'deny' | 'allow';
};

export function registerSettingsRoutes(input: {
  app: FastifyInstance;
  settings: SettingsRepository;
  defaultWorkspace: string;
  users?: UserRepository;
}): void {
  input.app.get('/api/settings', async () => readSettings(input.settings, input.defaultWorkspace));

  input.app.post<{ Body: Partial<BridgeSettings> }>('/api/settings', async (request) => {
    const next = normalizeSettings({
      ...readSettings(input.settings, input.defaultWorkspace),
      ...request.body,
    }, input.defaultWorkspace);
    for (const [key, value] of Object.entries(next)) input.settings.set(`settings.${key}`, value);
    input.users?.updateDefaultsForPlatform(PRIMARY_WEIXIN_PLATFORM, {
      defaultProvider: next.defaultProvider,
      defaultCwd: next.defaultWorkspace,
    });
    return { ok: true };
  });
}

function readSettings(settings: SettingsRepository, defaultWorkspace: string): BridgeSettings {
  return normalizeSettings({
    defaultProvider: settings.get('settings.defaultProvider'),
    defaultWorkspace: settings.get('settings.defaultWorkspace'),
    permissionTimeoutMs: settings.get('settings.permissionTimeoutMs'),
    highRiskCommandPolicy: settings.get('settings.highRiskCommandPolicy'),
  }, defaultWorkspace);
}

function normalizeSettings(input: Partial<Record<keyof BridgeSettings, unknown>>, defaultWorkspace: string): BridgeSettings {
  return {
    defaultProvider: input.defaultProvider === 'codex' ? 'codex' : 'claude-code',
    defaultWorkspace: typeof input.defaultWorkspace === 'string' && input.defaultWorkspace.trim()
      ? input.defaultWorkspace
      : defaultWorkspace,
    permissionTimeoutMs: normalizeTimeout(input.permissionTimeoutMs),
    highRiskCommandPolicy: normalizeHighRiskPolicy(input.highRiskCommandPolicy),
  };
}

function normalizeTimeout(value: unknown): number | 'never' {
  if (value === 'never') return 'never';
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return 60_000;
}

function normalizeHighRiskPolicy(value: unknown): BridgeSettings['highRiskCommandPolicy'] {
  if (value === 'deny' || value === 'allow') return value;
  return 'per_request';
}
