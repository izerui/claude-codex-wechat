import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { createDaemonServer } from '../src/daemon/server';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { PermissionRequestRepository } from '../src/storage/permissionRequestRepository';
import { schemaSql } from '../src/storage/schema';

describe('channel admin routes', () => {
  it('lists, approves, and rejects pairings', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const { app, pairings } = createDaemonServer({ db });
    const approveMe = pairings.createPending({ platformUserId: 'wx_user_1', chatId: 'chat-a', ttlMs: 60_000 });
    const rejectMe = pairings.createPending({ platformUserId: 'wx_user_2', chatId: 'chat-b', ttlMs: 60_000 });

    const listBefore = await app.inject({ method: 'GET', url: '/api/channel/pairings' });
    expect(listBefore.statusCode).toBe(200);
    expect(listBefore.json()).toHaveLength(2);

    const approve = await app.inject({ method: 'POST', url: `/api/channel/pairings/${approveMe.code}/approve` });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toEqual({ ok: true });

    const usersAfterApprove = await app.inject({ method: 'GET', url: '/api/channel/users' });
    expect(usersAfterApprove.json()).toMatchObject([{ platformUserId: 'wx_user_1', defaultProvider: 'claude-code' }]);

    const reject = await app.inject({ method: 'POST', url: `/api/channel/pairings/${rejectMe.code}/reject` });
    expect(reject.statusCode).toBe(200);
    expect(reject.json()).toEqual({ ok: true });

    const listAfter = await app.inject({ method: 'GET', url: '/api/channel/pairings' });
    expect(listAfter.json()).toEqual([]);
    await app.close();
  });

  it('lists and revokes authorized users', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const { app, users } = createDaemonServer({ db });
    const created = users.createUser({ platform: 'wechat-clawbot', platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'codex', defaultCwd: '/tmp/project' });

    const response = await app.inject({ method: 'GET', url: '/api/channel/users' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ platformUserId: 'wx_user_1', defaultProvider: 'codex' }]);

    const revoke = await app.inject({ method: 'POST', url: `/api/channel/users/${created.id}/revoke` });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json()).toEqual({ ok: true });

    const after = await app.inject({ method: 'GET', url: '/api/channel/users' });
    expect(after.json()).toEqual([]);
    await app.close();
  });

  it('lists, stops, and archives runtime sessions', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users, sessions } = createDaemonServer({ db, channel, providers: [provider] });
    users.createUser({
      platform: 'wechat-clawbot',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });

    await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', text: 'hello' },
    });

    const active = sessions.getActiveSession('chat-a');
    expect(active).not.toBeNull();

    const stop = await app.inject({ method: 'POST', url: `/api/channel/sessions/${active!.id}/stop` });
    expect(stop.statusCode).toBe(200);
    expect(stop.json()).toEqual({ ok: true });
    expect(provider.stoppedSessions).toEqual([active!.id]);

    const stopMissing = await app.inject({ method: 'POST', url: '/api/channel/sessions/does-not-exist/stop' });
    expect(stopMissing.statusCode).toBe(404);
    expect(stopMissing.json()).toEqual({ ok: false, error: 'session_not_found' });

    const listed = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(listed.json()).toEqual([
      expect.objectContaining({ id: active!.id, status: 'closed' }),
    ]);

    await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm2', chatId: 'chat-a', senderId: 'wx_user_1', text: 'second hello' },
    });
    const next = sessions.getActiveSession('chat-a');
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(active!.id);

    const archive = await app.inject({ method: 'POST', url: `/api/channel/sessions/${next!.id}/archive` });
    expect(archive.statusCode).toBe(200);
    expect(archive.json()).toEqual({ ok: true });

    const archiveMissing = await app.inject({ method: 'POST', url: '/api/channel/sessions/does-not-exist/archive' });
    expect(archiveMissing.statusCode).toBe(404);
    expect(archiveMissing.json()).toEqual({ ok: false, error: 'session_not_found' });

    const afterArchive = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(afterArchive.json()).toEqual([
      expect.objectContaining({ id: next!.id, status: 'closed', archivedAt: expect.any(Number) }),
      expect.objectContaining({ id: active!.id, status: 'closed' }),
    ]);
    await app.close();
  });

  it('lists message logs for a session', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users, sessions } = createDaemonServer({ db, channel, providers: [provider] });
    users.createUser({
      platform: 'wechat-clawbot',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });

    await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', text: 'run tests' },
    });

    const active = sessions.getActiveSession('chat-a');
    expect(active).not.toBeNull();

    const response = await app.inject({ method: 'GET', url: `/api/channel/sessions/${active!.id}/messages` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ direction: 'inbound', text: 'run tests' }),
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'text_delta', text: '收到：run tests' }),
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'permission_request', text: '允许执行 fake command?' }),
    ]);
    await app.close();
  });

  it('exposes persisted sessions and permission decisions for admin UI', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users } = createDaemonServer({ db, channel, providers: [provider] });
    users.createUser({
      platform: 'wechat-clawbot',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });

    await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', text: 'run tests' },
    });

    const sessions = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json()).toEqual([
      expect.objectContaining({
        chatId: 'chat-a',
        providerId: 'claude-code',
        providerSessionId: expect.stringContaining('claude-code_fake_'),
      }),
    ]);

    const status = await app.inject({ method: 'GET', url: '/api/status' });
    expect(status.json()).toMatchObject({
      ok: true,
      sessions: [expect.objectContaining({ chatId: 'chat-a' })],
      permissions: [expect.objectContaining({ id: 'pr_fake_1' })],
    });

    const decision = await app.inject({
      method: 'POST',
      url: '/api/permissions/decide',
      payload: { requestId: 'pr_fake_1', userId: 'user_admin', decision: 'deny' },
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json()).toEqual({ ok: true });
    expect(new PermissionRequestRepository(db).findById('pr_fake_1')).toMatchObject({
      status: 'decided',
      decision: 'deny',
      decidedBy: 'user_admin',
    });
    expect(provider.permissionDecisions).toEqual([{ requestId: 'pr_fake_1', decision: 'deny' }]);
    await app.close();
  });

  it('reads and updates daemon settings', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const { app } = createDaemonServer({ db });

    const initial = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({
      defaultProvider: 'claude-code',
      defaultWorkspace: process.cwd(),
      permissionTimeoutMs: 60_000,
      wechatThrottle: { minIntervalMs: 500, chunkSize: 1000 },
      highRiskCommandPolicy: 'per_request',
    });

    const update = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/project',
        permissionTimeoutMs: 300_000,
        wechatThrottle: { minIntervalMs: 750, chunkSize: 800 },
        highRiskCommandPolicy: 'deny',
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toEqual({ ok: true });

    const next = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(next.json()).toMatchObject({
      defaultProvider: 'codex',
      defaultWorkspace: '/tmp/project',
      permissionTimeoutMs: 300_000,
      wechatThrottle: { minIntervalMs: 750, chunkSize: 800 },
      highRiskCommandPolicy: 'deny',
    });
    await app.close();
  });

  it('reports both Claude and Codex provider status', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const { app } = createDaemonServer({ db });

    const response = await app.inject({ method: 'GET', url: '/api/providers/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      claude: expect.anything(),
      codex: expect.anything(),
    });
    await app.close();
  });
});
