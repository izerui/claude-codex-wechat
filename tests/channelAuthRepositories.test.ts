import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { schemaSql } from '../src/storage/schema';
import { PairingRepository } from '../src/storage/pairingRepository';
import { UserRepository } from '../src/storage/userRepository';

function createMemoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('channel auth repositories', () => {
  it('creates and finds authorized users', () => {
    const users = new UserRepository(createMemoryDb());
    const created = users.createUser({
      platform: 'wechat-clawbot',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });

    expect(users.findByPlatformUser('wechat-clawbot', 'wx_user_1')).toMatchObject({
      id: created.id,
      platformUserId: 'wx_user_1',
      defaultProvider: 'claude-code',
    });
  });

  it('creates, lists, approves, and rejects pairings', () => {
    const pairings = new PairingRepository(createMemoryDb());
    const first = pairings.createPending({
      platformUserId: 'wx_user_1',
      chatId: 'chat-a',
      displayName: 'Alice',
      ttlMs: 60_000,
    });
    const second = pairings.createPending({
      platformUserId: 'wx_user_2',
      chatId: 'chat-b',
      ttlMs: 60_000,
    });

    expect(pairings.listPending().map((p) => p.code).sort()).toEqual([first.code, second.code].sort());
    expect(pairings.approve(first.code)).toEqual({ ok: true });
    expect(pairings.reject(second.code)).toEqual({ ok: true });
    expect(pairings.listPending()).toEqual([]);
  });
});
