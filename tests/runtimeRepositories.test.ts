import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { MessageLogRepository } from '../src/storage/messageLogRepository';
import { PermissionRequestRepository } from '../src/storage/permissionRequestRepository';
import { ProviderBindingRepository } from '../src/storage/providerBindingRepository';
import { RuntimeSessionRepository } from '../src/storage/runtimeSessionRepository';
import { schemaSql } from '../src/storage/schema';
import { SettingsRepository } from '../src/storage/settingsRepository';

function createMemoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('runtime repositories', () => {
  it('creates, updates, and lists bridge sessions by active chat', () => {
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

    sessions.archive(created.id, created.createdAt + 10);
    expect(sessions.getActiveByChat('chat-a')).toBeNull();
  });

  it('stores permission request details and records decisions', () => {
    const permissions = new PermissionRequestRepository(createMemoryDb());
    permissions.create({
      id: 'pr_1',
      bridgeSessionId: 'bs_1',
      providerId: 'claude-code',
      toolName: 'Bash',
      summary: 'Run tests',
      details: { command: 'pnpm test' },
      status: 'pending',
      requestedAt: 100,
    });

    expect(permissions.listPending()).toEqual([
      expect.objectContaining({
        id: 'pr_1',
        details: { command: 'pnpm test' },
        status: 'pending',
      }),
    ]);

    expect(permissions.decide({ id: 'pr_1', decision: 'approve', decidedBy: 'user-a', decidedAt: 120 })).toEqual({ ok: true });
    expect(permissions.findById('pr_1')).toMatchObject({
      status: 'decided',
      decision: 'approve',
      decidedBy: 'user-a',
      decidedAt: 120,
    });
  });

  it('appends message log entries in chronological order', () => {
    const log = new MessageLogRepository(createMemoryDb());
    log.append({
      bridgeSessionId: 'bs_1',
      direction: 'inbound',
      platformMessageId: 'wx_m1',
      text: 'hello',
      createdAt: 100,
    });
    log.append({
      bridgeSessionId: 'bs_1',
      direction: 'provider_event',
      providerEventType: 'text_delta',
      text: 'hi',
      createdAt: 110,
    });

    expect(log.listForSession('bs_1')).toEqual([
      expect.objectContaining({ direction: 'inbound', text: 'hello' }),
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'text_delta', text: 'hi' }),
    ]);
  });

  it('persists settings as typed JSON values', () => {
    const settings = new SettingsRepository(createMemoryDb());
    expect(settings.get('permission.timeoutMs')).toBeNull();

    settings.set('permission.timeoutMs', 60_000);
    settings.set('wechat.throttle', { minIntervalMs: 500, chunkSize: 1000 });

    expect(settings.get('permission.timeoutMs')).toBe(60_000);
    expect(settings.get('wechat.throttle')).toEqual({ minIntervalMs: 500, chunkSize: 1000 });
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
      resumeTitle: '微信 · wx_user_1 · [local-agent-wechat-bridge:test]',
      cwd: '/tmp/project',
      status: 'idle',
      createdAt: 10,
      lastActivityAt: 11,
    });

    expect(sessions.findById('bs_manual')).toMatchObject({
      recoverySource: 'manual_attach',
      resumeTitle: '微信 · wx_user_1 · [local-agent-wechat-bridge:test]',
    });
  });
});
