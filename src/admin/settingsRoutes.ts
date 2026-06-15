import type { FastifyInstance } from 'fastify';
import type { ChannelAdapter } from '../channels/types';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import type { ProviderId } from '../providers/types';
import type { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import type { SettingsRepository } from '../storage/settingsRepository';
import type { UserRepository } from '../storage/userRepository';

export type BridgeSettings = {
  defaultProvider: ProviderId;
  defaultWorkspace: string;
};

export function registerSettingsRoutes(input: {
  app: FastifyInstance;
  settings: SettingsRepository;
  defaultWorkspace: string;
  users?: UserRepository;
  channel?: ChannelAdapter;
  sessions?: RuntimeSessionRepository;
}): void {
  input.app.get('/api/settings', async () => readSettings(input.settings, input.defaultWorkspace));

  input.app.post<{ Body: Partial<BridgeSettings> }>('/api/settings', async (request) => {
    const current = readSettings(input.settings, input.defaultWorkspace);
    const next = normalizeSettings({
      ...current,
      ...request.body,
    }, input.defaultWorkspace);
    for (const [key, value] of Object.entries(next)) input.settings.set(`settings.${key}`, value);
    input.users?.updateDefaultsForPlatform(PRIMARY_WEIXIN_PLATFORM, {
      defaultProvider: next.defaultProvider,
      defaultCwd: next.defaultWorkspace,
    });
    if (input.channel && current.defaultProvider !== next.defaultProvider) {
      const users = input.users?.listUsers().filter((user) => user.platform === PRIMARY_WEIXIN_PLATFORM) ?? [];
      const providerLabel = next.defaultProvider === 'codex' ? 'Codex' : 'Claude Code';
      await Promise.all(users.map(async (user) => {
        const activeSession = input.sessions?.list().find((session) => (
          session.ownerUserId === user.id && !session.archivedAt
        ));
        const cwd = activeSession?.cwd ?? user.defaultCwd ?? next.defaultWorkspace;
        await input.channel?.sendMessage({
          chatId: user.platformUserId,
          kind: 'status',
          text: `对话模型已切换为 ${providerLabel}，项目目录：${cwd}。`,
        });
      }));
    }
    return { ok: true };
  });
}

function readSettings(settings: SettingsRepository, defaultWorkspace: string): BridgeSettings {
  return normalizeSettings({
    defaultProvider: settings.get('settings.defaultProvider'),
    defaultWorkspace: settings.get('settings.defaultWorkspace'),
  }, defaultWorkspace);
}

function normalizeSettings(input: Partial<Record<keyof BridgeSettings, unknown>>, defaultWorkspace: string): BridgeSettings {
  return {
    defaultProvider: input.defaultProvider === 'codex' ? 'codex' : 'claude-code',
    defaultWorkspace: typeof input.defaultWorkspace === 'string' && input.defaultWorkspace.trim()
      ? input.defaultWorkspace
      : defaultWorkspace,
  };
}
