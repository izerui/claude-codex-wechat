import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ProviderBindingRepository } from '../src/storage/providerBindingRepository';
import { RuntimeSessionRepository } from '../src/storage/runtimeSessionRepository';
import { schemaSql } from '../src/storage/schema';

function createMemoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('runtime repositories', () => {
  it('creates, updates, deletes, and lists bridge sessions by active chat', () => {
    const sessions = new RuntimeSessionRepository(createMemoryDb());
    const created = sessions.create({
      chatId: 'chat-a',
      ownerUserId: 'user-a',
      providerId: 'claude-code',
      cwd: '/tmp/project',
      status: 'starting',
    });

    sessions.update(created.id, {
      providerSessionId: 'claude_fake_bs_1',
      status: 'idle',
      lastActivityAt: created.lastActivityAt + 1,
    });

    expect(sessions.getActiveByChat('chat-a')).toMatchObject({
      id: created.id,
      providerSessionId: 'claude_fake_bs_1',
      recoverySource: 'runtime',
      status: 'idle',
    });
    expect(sessions.list()).toHaveLength(1);

    sessions.delete(created.id);
    expect(sessions.getActiveByChat('chat-a')).toBeNull();
  });

  it('replaces the prior bridge session record when a new session is created for the same chat', () => {
    const sessions = new RuntimeSessionRepository(createMemoryDb());
    sessions.createWithId({
      id: 'bs_old',
      chatId: 'chat-a',
      ownerUserId: 'user-a',
      providerId: 'claude-code',
      providerSessionId: 'claude-old',
      recoverySource: 'runtime',
      resumeTitle: 'old',
      cwd: '/tmp/project-a',
      status: 'idle',
      createdAt: 1,
      lastActivityAt: 1,
    });
    sessions.createWithId({
      id: 'bs_new',
      chatId: 'chat-a',
      ownerUserId: 'user-a',
      providerId: 'codex',
      providerSessionId: 'codex-new',
      recoverySource: 'runtime',
      resumeTitle: 'new',
      cwd: '/tmp/project-b',
      status: 'starting',
      createdAt: 2,
      lastActivityAt: 2,
    });

    expect(sessions.list()).toEqual([
      expect.objectContaining({
        id: 'bs_new',
        chatId: 'chat-a',
        providerId: 'codex',
        providerSessionId: 'codex-new',
      }),
    ]);
    expect(sessions.findById('bs_old')).toBeNull();
    expect(sessions.getActiveByChat('chat-a')).toMatchObject({ id: 'bs_new' });
  });

  it('stores and updates provider session bindings by chat', () => {
    const bindings = new ProviderBindingRepository(createMemoryDb());
    bindings.upsert({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      chatId: 'chat-a',
      providerId: 'claude-code',
      providerSessionId: 'claude-session-1',
      cwd: '/tmp/project',
    });

    expect(bindings.findByChat('weixin', 'chat-a', 'claude-code')).toMatchObject({
      platformUserId: 'wx_user_1',
      providerSessionId: 'claude-session-1',
      cwd: '/tmp/project',
    });

    bindings.upsert({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      chatId: 'chat-a',
      providerId: 'claude-code',
      providerSessionId: 'claude-session-2',
      cwd: '/tmp/project-2',
    });

    expect(bindings.findByChat('weixin', 'chat-a', 'claude-code')).toMatchObject({
      providerSessionId: 'claude-session-2',
      cwd: '/tmp/project-2',
    });
  });

  it('persists recovery source for attached bridge sessions', () => {
    const sessions = new RuntimeSessionRepository(createMemoryDb());
    sessions.createWithId({
      id: 'bs_manual',
      chatId: 'chat-manual',
      ownerUserId: 'user-a',
      providerId: 'claude-code',
      providerSessionId: 'claude-session-1',
      recoverySource: 'manual_attach',
      resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
      cwd: '/tmp/project',
      status: 'idle',
      createdAt: 10,
      lastActivityAt: 11,
    });

    expect(sessions.findById('bs_manual')).toMatchObject({
      recoverySource: 'manual_attach',
      resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
    });
  });
});
