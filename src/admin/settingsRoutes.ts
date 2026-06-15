import type { FastifyInstance } from 'fastify';
import type { ChannelAdapter } from '../channels/types';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import { persistBridgeDefaultsToConfigFile } from '../daemon/configPersistence';
import type { ProviderId } from '../providers/types';
import type { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import type { ActiveWeChatUserStore } from '../storage/userStore';

export type BridgeSettings = {
  defaultProvider: ProviderId;
  defaultWorkspace: string;
};

export function registerSettingsRoutes(input: {
  app: FastifyInstance;
  defaults: BridgeSettings;
  configPath: string;
  users?: ActiveWeChatUserStore;
  channel?: ChannelAdapter;
  sessions?: RuntimeSessionRepository;
}): void {
  input.app.get('/api/settings', async () => input.defaults);

  input.app.post<{ Body: Partial<BridgeSettings> }>('/api/settings', async (request) => {
    const current = { ...input.defaults };
    const next = normalizeSettings({
      ...current,
      ...request.body,
    }, current.defaultWorkspace);
    input.defaults.defaultProvider = next.defaultProvider;
    input.defaults.defaultWorkspace = next.defaultWorkspace;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      defaultProvider: next.defaultProvider,
      defaultWorkspace: next.defaultWorkspace,
    });
    input.users?.updateActiveUser(PRIMARY_WEIXIN_PLATFORM, {
      provider: next.defaultProvider,
      cwd: next.defaultWorkspace,
    });
    if (input.channel && current.defaultProvider !== next.defaultProvider) {
      const activeUser = input.users?.getActiveUser();
      const users = activeUser && activeUser.platform === PRIMARY_WEIXIN_PLATFORM ? [activeUser] : [];
      const providerLabel = next.defaultProvider === 'codex' ? 'Codex' : 'Claude Code';
      await Promise.all(users.map(async (user) => {
        const activeSession = input.sessions?.list().find((session) => (
          session.ownerUserId === user.id
        ));
        const cwd = activeSession?.cwd ?? user.cwd ?? next.defaultWorkspace;
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

function normalizeSettings(input: Partial<Record<keyof BridgeSettings, unknown>>, defaultWorkspace: string): BridgeSettings {
  return {
    defaultProvider: input.defaultProvider === 'codex' ? 'codex' : 'claude-code',
    defaultWorkspace: typeof input.defaultWorkspace === 'string' && input.defaultWorkspace.trim()
      ? input.defaultWorkspace
      : defaultWorkspace,
  };
}
