import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDaemonServer } from '../src/daemon/server';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { SessionManager } from '../src/session/sessionManager';
import { MessageRouter } from '../src/session/messageRouter';
import { RuntimeUserStore } from '../src/storage/runtimeUserStore';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';

describe('channel auth repositories', () => {
  it('stores the current active wechat user as a single record', () => {
    const store = createRuntimeUserStore('bridge-auth-active-wechat-user-');
    const activeUserStore = store.activeUserStore;
    const created = seedRuntimeUserStore(store, {
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    expect(activeUserStore.isActiveUser('weixin', 'wx_user_1')).toMatchObject({
      id: created.id,
      platformUserId: 'wx_user_1',
    });
    expect(activeUserStore.getActiveUser()).toMatchObject({ platformUserId: 'wx_user_1' });
  });

  it('persists activeWeChatUser into config.json for the default daemon store', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'bridge-runtime-state-'));
    const configPath = join(configDir, 'config.json');
    const runtimeStore = new RuntimeUserStore(configPath);
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [],
      sessions,
      resolveUser: () => null,
      autoAuthorizeUser: (message) => {
        const existing = runtimeStore.isActiveUser(message.platform, message.user.id);
        if (existing) return existing;
        return runtimeStore.setActiveUser({
          platform: message.platform,
          platformUserId: message.user.id,
          displayName: message.user.displayName,
          role: 'user',
        });
      },
    });
    channel.onMessage(async (message) => {
      await router.handleMessage(message);
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1', displayName: 'Alice' },
      content: { type: 'image' },
      timestamp: 1,
    });

    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      bridge?: {
        activeWeChatUser?: { platformUserId: string; provider: string; cwd: string };
      };
    };
    expect(config.bridge?.activeWeChatUser).toEqual(
      expect.objectContaining({
        platformUserId: 'wx_user_1',
      }),
    );
  });

  it('uses config.json when BRIDGE_CONFIG is provided without an explicit users store', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'bridge-runtime-default-store-'));
    const configPath = join(configDir, 'config.json');
    const previousConfig = process.env.BRIDGE_CONFIG;
    process.env.BRIDGE_CONFIG = configPath;

    try {
      const channel = new MockChannelAdapter();
      const { app } = createDaemonServer({
        channel,
        providers: [],
      });

      await channel.emitIncoming({
        id: 'm1',
        platform: 'weixin',
        chatId: 'chat-a',
        user: { id: 'wx_user_1', displayName: 'Alice' },
        content: { type: 'image' },
        timestamp: 1,
      });

      const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
        bridge?: {
          activeWeChatUser?: { platformUserId: string };
        };
      };
      expect(config.bridge?.activeWeChatUser).toEqual(
        expect.objectContaining({
          platformUserId: 'wx_user_1',
        }),
      );
      await app.close();
    } finally {
      if (previousConfig === undefined) delete process.env.BRIDGE_CONFIG;
      else process.env.BRIDGE_CONFIG = previousConfig;
    }
  });

  it('replaces the previous active wechat user instead of appending a list', () => {
    const store = createRuntimeUserStore('bridge-auth-replace-');
    seedRuntimeUserStore(store, {
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    const replaced = seedRuntimeUserStore(store, {
      platform: 'weixin',
      platformUserId: 'wx_user_2',
      role: 'user',
    });

    expect(store.activeUserStore.isActiveUser('weixin', 'wx_user_1')).toBeNull();
    expect(store.activeUserStore.isActiveUser('weixin', 'wx_user_2')).toMatchObject({
      id: replaced.id,
    });
    expect(store.activeUserStore.getActiveUser()).toMatchObject({ platformUserId: 'wx_user_2' });
  });

  it('preserves currentConversation when re-authorizing the same active wechat user', () => {
    const store = createRuntimeUserStore('bridge-auth-preserve-current-');
    const created = seedRuntimeUserStore(store, {
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      currentConversation: {
        id: 'bs_1',
        chatId: 'chat-a',
        ownerUserId: 'user_1',
        providerId: 'claude-code',
        providerSessionId: 'claude-session-1',
        recoverySource: 'runtime',
        resumeTitle: 'existing session',
        cwd: '/tmp/project',
        status: 'idle',
        createdAt: 1,
        lastActivityAt: 1,
      },
    });

    const updated = store.activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      displayName: 'Alice',
    });

    expect(updated.platformUserId).toBe('wx_user_1');
    expect(store.activeUserStore.getActiveUser()).toMatchObject({
      platformUserId: 'wx_user_1',
      displayName: 'Alice',
      currentConversation: {
        id: 'bs_1',
        providerSessionId: 'claude-session-1',
        cwd: '/tmp/project',
      },
    });
    expect(store.activeUserStore.getActiveUser()?.id).toBe(created.id);
    expect(updated.id).toBe(created.id);
  });
});
