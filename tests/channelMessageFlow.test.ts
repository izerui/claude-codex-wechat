import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { createDaemonServer } from '../src/daemon/server';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { MessageLogRepository } from '../src/storage/messageLogRepository';
import { PermissionRequestRepository } from '../src/storage/permissionRequestRepository';
import { RuntimeSessionRepository } from '../src/storage/runtimeSessionRepository';
import { schemaSql } from '../src/storage/schema';
import { UserRepository } from '../src/storage/userRepository';
import { PRIMARY_WEIXIN_PLATFORM } from '../src/channels/platforms';

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('channel message flow', () => {
  it('creates pending pairing for unauthorized incoming user', async () => {
    const db = memoryDb();
    const channel = new MockChannelAdapter();
    const { app, pairings } = createDaemonServer({ db, channel });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1', displayName: 'Alice' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });

    expect(pairings.listPending()).toHaveLength(1);
    await app.close();
  });

  it('accepts authorized message flow and requires pairing again after revoke', async () => {
    const db = memoryDb();
    const users = new UserRepository(db);
    const created = users.createUser({ platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'claude-code', defaultCwd: '/tmp/project' });
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, permissions, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    expect(sessions.listSessions()).toHaveLength(1);
    expect(permissions.getPendingRequests()).toHaveLength(1);
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
      { kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') },
    ]);
    expect(new RuntimeSessionRepository(db).list()).toEqual([
      expect.objectContaining({
        chatId: 'chat-a',
        ownerUserId: expect.any(String),
        providerId: 'claude-code',
        providerSessionId: expect.stringContaining('claude-code_fake_'),
      }),
    ]);
    expect(new PermissionRequestRepository(db).listPending()).toEqual([
      expect.objectContaining({ id: 'pr_fake_1', bridgeSessionId: sessions.listSessions()[0].id }),
    ]);
    expect(new MessageLogRepository(db).listForSession(sessions.listSessions()[0].id)).toEqual([
      expect.objectContaining({ direction: 'inbound', text: 'run tests' }),
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'text_delta', text: '收到：run tests' }),
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'permission_request', text: '允许执行 fake command?' }),
    ]);

    const revoke = await app.inject({ method: 'POST', url: `/api/channel/users/${created.id}/revoke` });
    expect(revoke.statusCode).toBe(200);

    await channel.emitIncoming({
      id: 'm2',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run again' },
      timestamp: 2,
    });
    expect(new PermissionRequestRepository(db).listPending()).toHaveLength(1);
    await app.close();
  });

  it('switches provider and reports status through incoming commands', async () => {
    const db = memoryDb();
    const users = new UserRepository(db);
    users.createUser({ platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'claude-code', defaultCwd: '/tmp/project' });
    const channel = new MockChannelAdapter();
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code'), new FakeProviderAdapter('codex')],
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new codex' },
      timestamp: 1,
    });
    expect(sessions.getActiveSession('chat-a')).toMatchObject({ providerId: 'codex' });

    await channel.emitIncoming({
      id: 'm2',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/status' },
      timestamp: 2,
    });

    expect(sent[0]).toContain('Started new codex session');
    expect(sent.at(-1)).toContain('codex');
    await app.close();
  });
});
