import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { schemaSql } from '../src/storage/schema';
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
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });

    expect(users.findByPlatformUser('weixin', 'wx_user_1')).toMatchObject({
      id: created.id,
      platformUserId: 'wx_user_1',
      defaultProvider: 'claude-code',
    });
  });
});
