import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDaemonServer } from '../src/daemon/server';
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

    const reject = await app.inject({ method: 'POST', url: `/api/channel/pairings/${rejectMe.code}/reject` });
    expect(reject.statusCode).toBe(200);
    expect(reject.json()).toEqual({ ok: true });

    const listAfter = await app.inject({ method: 'GET', url: '/api/channel/pairings' });
    expect(listAfter.json()).toEqual([]);
    await app.close();
  });

  it('lists authorized users', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const { app, users } = createDaemonServer({ db });
    users.createUser({ platform: 'wechat-clawbot', platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'codex', defaultCwd: '/tmp/project' });

    const response = await app.inject({ method: 'GET', url: '/api/channel/users' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ platformUserId: 'wx_user_1', defaultProvider: 'codex' }]);
    await app.close();
  });
});
