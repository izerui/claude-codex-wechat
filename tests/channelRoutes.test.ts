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

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('wechat channel routes', () => {
  it('creates pending pairing for unauthorized inbound user', async () => {
    const db = memoryDb();
    const { app, pairings } = createDaemonServer({ db });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', senderName: 'Alice', text: 'hello' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ ok: true, status: 'pairing_required' });
    expect(pairings.listPending()).toHaveLength(1);
    await app.close();
  });

  it('accepts inbound message from authorized user and requires pairing again after revoke', async () => {
    const db = memoryDb();
    const users = new UserRepository(db);
    const created = users.createUser({ platform: 'wechat-clawbot', platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'claude-code', defaultCwd: '/tmp/project' });
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, permissions, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', text: 'run tests' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, status: 'accepted' });
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

    const second = await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm2', chatId: 'chat-a', senderId: 'wx_user_1', text: 'run again' },
    });
    expect(second.statusCode).toBe(202);
    expect(second.json()).toMatchObject({ ok: true, status: 'pairing_required' });
    await app.close();
  });

  it('switches provider and reports status through inbound commands', async () => {
    const db = memoryDb();
    const users = new UserRepository(db);
    users.createUser({ platform: 'wechat-clawbot', platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'claude-code', defaultCwd: '/tmp/project' });
    const channel = new MockChannelAdapter();
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code'), new FakeProviderAdapter('codex')],
    });

    await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', text: '/new codex' },
    });
    expect(sessions.getActiveSession('chat-a')).toMatchObject({ providerId: 'codex' });

    await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm2', chatId: 'chat-a', senderId: 'wx_user_1', text: '/status' },
    });

    expect(sent[0]).toContain('Started new codex session');
    expect(sent.at(-1)).toContain('codex');
    await app.close();
  });
});
