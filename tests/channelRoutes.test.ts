import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createDaemonServer } from '../src/daemon/server';
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

  it('accepts inbound message from authorized user', async () => {
    const db = memoryDb();
    const users = new UserRepository(db);
    users.createUser({ platform: 'wechat-clawbot', platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'claude-code', defaultCwd: '/tmp/project' });
    const { app } = createDaemonServer({ db });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/wechat/inbound',
      payload: { id: 'm1', chatId: 'chat-a', senderId: 'wx_user_1', text: 'hello' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, status: 'accepted' });
    await app.close();
  });
});
