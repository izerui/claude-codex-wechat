import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createDaemonServer } from '../src/daemon/server';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { MessageLogRepository } from '../src/storage/messageLogRepository';
import { PermissionRequestRepository } from '../src/storage/permissionRequestRepository';
import { schemaSql } from '../src/storage/schema';
import { UserRepository } from '../src/storage/userRepository';

const servers: Array<{ close: () => Promise<unknown> }> = [];

async function startFakeClawbot() {
  const app = Fastify();
  const sent: unknown[] = [];
  const authorizations: Array<string | undefined> = [];
  app.post('/send', async (request, reply) => {
    sent.push(request.body);
    authorizations.push(request.headers.authorization);
    return reply.send({ ok: true });
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  servers.push(app);
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('fake clawbot did not bind tcp');
  return { baseUrl: `http://127.0.0.1:${address.port}`, sent, authorizations };
}

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('daemon WeChat runtime channel', () => {
  it('uses configured WeChat clawbot HTTP client for authorized message output', async () => {
    const clawbot = await startFakeClawbot();
    const db = memoryDb();
    new UserRepository(db).createUser({
      platform: 'wechat-clawbot',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });
    const { app } = createDaemonServer({
      db,
      providers: [new FakeProviderAdapter('claude-code')],
      wechat: { enabled: true, baseUrl: clawbot.baseUrl, token: 'secret-token' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', text: 'run tests' },
    });

    expect(response.statusCode).toBe(200);
    expect(clawbot.authorizations).toEqual(['Bearer secret-token', 'Bearer secret-token']);
    expect(clawbot.sent).toEqual([
      { chatId: 'chat-a', kind: 'text', text: '收到：run tests' },
      expect.objectContaining({ chatId: 'chat-a', kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') }),
    ]);
    await app.close();
  });

  it('exposes WeChat plugin status for the admin UI', async () => {
    const db = memoryDb();
    const { app } = createDaemonServer({
      db,
      wechat: { enabled: true, baseUrl: 'http://127.0.0.1:9999', token: 'secret-token' },
    });

    const response = await app.inject({ method: 'GET', url: '/api/channel/plugins' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: 'wechat-clawbot',
        type: 'weixin',
        name: 'WeChat clawbot',
        enabled: true,
        connected: true,
        hasToken: true,
      }),
    ]);
    await app.close();
  });

  it('forwards permission decisions from admin API back to the provider and persistence', async () => {
    const clawbot = await startFakeClawbot();
    const db = memoryDb();
    new UserRepository(db).createUser({
      platform: 'wechat-clawbot',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });
    const provider = new FakeProviderAdapter('claude-code');
    const { app } = createDaemonServer({
      db,
      providers: [provider],
      wechat: { enabled: true, baseUrl: clawbot.baseUrl, token: 'secret-token' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', text: 'run tests' },
    });

    const pendingBefore = new PermissionRequestRepository(db).listPending();
    expect(pendingBefore).toHaveLength(1);
    expect(pendingBefore[0]?.id).toBe('pr_fake_1');

    const decide = await app.inject({
      method: 'POST',
      url: '/api/permissions/decide',
      payload: { requestId: 'pr_fake_1', userId: 'user_audit', decision: 'approve' },
    });

    expect(decide.statusCode).toBe(200);
    expect(decide.json()).toEqual({ ok: true });
    expect(provider.permissionDecisions).toEqual([{ requestId: 'pr_fake_1', decision: 'approve' }]);
    expect(new PermissionRequestRepository(db).listPending()).toEqual([]);
    expect(new PermissionRequestRepository(db).findById('pr_fake_1')).toMatchObject({
      id: 'pr_fake_1',
      decision: 'approve',
      decidedBy: 'user_audit',
    });
    await app.close();
  });
});

