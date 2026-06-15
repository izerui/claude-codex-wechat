import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDaemonServer } from '../src/daemon/server';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { PermissionRouter } from '../src/permissions/permissionRouter';
import { SessionManager } from '../src/session/sessionManager';
import { MessageRouter } from '../src/session/messageRouter';
import { schemaSql } from '../src/storage/schema';
import { RuntimeUserStore } from '../src/storage/runtimeUserStore';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';

function createMemoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('channel auth repositories', () => {
  it('stores the current active wechat user as a single record', () => {
    const store = createRuntimeUserStore('bridge-auth-users-');
    const users = store.activeUserStore;
    const created = seedRuntimeUserStore(store, {
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      provider: 'claude-code',
      cwd: '/tmp/project',
    });

    expect(users.isActiveUser('weixin', 'wx_user_1')).toMatchObject({
      id: created.id,
      platformUserId: 'wx_user_1',
      provider: 'claude-code',
    });
    expect(users.getActiveUser()).toMatchObject({ platformUserId: 'wx_user_1' });
  });

  it('persists activeWeChatUser into config.json for the default daemon store', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'bridge-runtime-state-'));
    const configPath = join(configDir, 'config.json');
    const runtimeStore = new RuntimeUserStore(configPath);
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
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
          provider: 'claude-code',
          cwd: '/tmp/project',
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
        provider: 'claude-code',
        cwd: '/tmp/project',
      }),
    );
  });

  it('uses config.json when BRIDGE_CONFIG is provided without an explicit users store', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'bridge-runtime-default-store-'));
    const configPath = join(configDir, 'config.json');
    const previousConfig = process.env.BRIDGE_CONFIG;
    process.env.BRIDGE_CONFIG = configPath;

    try {
      const db = createMemoryDb();
      const channel = new MockChannelAdapter();
      const { app } = createDaemonServer({
        db,
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
          activeWeChatUser?: { platformUserId: string; provider: string; cwd: string };
        };
      };
      expect(config.bridge?.activeWeChatUser).toEqual(
        expect.objectContaining({
          platformUserId: 'wx_user_1',
          provider: 'claude-code',
          cwd: process.cwd(),
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
      provider: 'claude-code',
      cwd: '/tmp/project-a',
    });

    const replaced = seedRuntimeUserStore(store, {
      platform: 'weixin',
      platformUserId: 'wx_user_2',
      role: 'user',
      provider: 'codex',
      cwd: '/tmp/project-b',
    });

    expect(store.activeUserStore.isActiveUser('weixin', 'wx_user_1')).toBeNull();
    expect(store.activeUserStore.isActiveUser('weixin', 'wx_user_2')).toMatchObject({
      id: replaced.id,
      provider: 'codex',
    });
    expect(store.activeUserStore.getActiveUser()).toMatchObject({ platformUserId: 'wx_user_2' });
  });
});
