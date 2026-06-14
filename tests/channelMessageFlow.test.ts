import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { createDaemonServer } from '../src/daemon/server';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { CodexCliRunner } from '../src/providers/codex/codexCliRunner';
import { CodexProvider } from '../src/providers/codex/codexProvider';
import { MessageLogRepository } from '../src/storage/messageLogRepository';
import { PermissionRequestRepository } from '../src/storage/permissionRequestRepository';
import { ProviderBindingRepository } from '../src/storage/providerBindingRepository';
import { RuntimeSessionRepository } from '../src/storage/runtimeSessionRepository';
import { schemaSql } from '../src/storage/schema';
import { SettingsRepository } from '../src/storage/settingsRepository';
import { UserRepository } from '../src/storage/userRepository';
import { PRIMARY_WEIXIN_PLATFORM } from '../src/channels/platforms';

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('channel message flow', () => {
  it('auto-authorizes unauthorized incoming user by default', async () => {
    const db = memoryDb();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, pairings, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1', displayName: 'Alice' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    expect(pairings.listPending()).toEqual([]);
    expect(new UserRepository(db).findByPlatformUser(PRIMARY_WEIXIN_PLATFORM, 'wx_user_1')).toMatchObject({
      platformUserId: 'wx_user_1',
      defaultProvider: 'claude-code',
    });
    expect(sessions.listSessions()).toHaveLength(1);
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
      { kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') },
    ]);
    await app.close();
  });

  it('accepts authorized message flow and auto-authorizes again after revoke by default', async () => {
    const db = memoryDb();
    const users = new UserRepository(db);
    const created = users.createUser({ platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'claude-code', defaultCwd: '/tmp/project' });
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, permissions, sessions, pairings } = createDaemonServer({
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
        providerSessionId: 'claude-code_recoverable_1',
        recoverySource: 'heuristic',
      }),
    ]);
    expect(new PermissionRequestRepository(db).listPending()).toEqual([
      expect.objectContaining({ id: 'pr_fake_1', bridgeSessionId: sessions.listSessions()[0].id }),
    ]);
    expect(new MessageLogRepository(db).listForSession(sessions.listSessions()[0].id)).toEqual([
      expect.objectContaining({ direction: 'inbound', text: 'run tests' }),
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'text_delta', text: '收到：run tests' }),
      expect.objectContaining({ direction: 'outbound', text: '收到：run tests' }),
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'permission_request', text: '允许执行 fake command?' }),
      expect.objectContaining({ direction: 'outbound', text: expect.stringContaining('/approve pr_fake_1') }),
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
    expect(new PermissionRequestRepository(db).listPending()).toHaveLength(2);
    expect(pairings.listPending()).toEqual([]);
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

  it('writes a bridge-owned Codex thread name into session_index for a new chat session', async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHome = mkdtempSync(`${tmpdir()}/bridge-codex-home-`);
    process.env.CODEX_HOME = codexHome;
    try {
      const db = memoryDb();
      const users = new UserRepository(db);
      users.createUser({
        platform: PRIMARY_WEIXIN_PLATFORM,
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'codex',
        defaultCwd: '/tmp/project',
      });
      const channel = new MockChannelAdapter();
      const provider = new CodexProvider({
        runner: new CodexCliRunner({
          processRunner: async () => ({
            code: 0,
            stdout: [
              JSON.stringify({ type: 'agent_message', message: { content: [{ type: 'output_text', text: 'Codex 收到：hello codex' }] } }),
              JSON.stringify({ type: 'exec_complete', session_id: 'codex-session-1' }),
            ].join('\n'),
            stderr: '',
          }),
        }),
      });
      const { app, sessions } = createDaemonServer({
        db,
        channel,
        providers: [provider],
      });

      await channel.emitIncoming({
        id: 'm1',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-codex-live',
        user: { id: 'wx_user_1' },
        content: { type: 'text', text: 'hello codex' },
        timestamp: 1,
      });

      expect(sessions.getActiveSession('chat-codex-live')).toMatchObject({
        providerId: 'codex',
        providerSessionId: 'codex-session-1',
      });
      const index = readFileSync(`${codexHome}/session_index.jsonl`, 'utf8');
      expect(index).toContain('codex-session-1');
      expect(index).toContain('微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdC1jb2RleC1saXZlIn0]');

      await app.close();
    } finally {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it('auto-authorizes first-contact weixin users when the setting is enabled', async () => {
    const db = memoryDb();
    new SettingsRepository(db).set('settings.wechatAutoAuthorize', true);
    const users = new UserRepository(db);
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, pairings, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-auto',
      user: { id: 'wx_user_auto', displayName: 'Auto User' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    expect(pairings.listPending()).toEqual([]);
    expect(users.findByPlatformUser(PRIMARY_WEIXIN_PLATFORM, 'wx_user_auto')).toMatchObject({
      platformUserId: 'wx_user_auto',
      defaultProvider: 'claude-code',
    });
    expect(sessions.listSessions()).toHaveLength(1);
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
      { kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') },
    ]);

    await app.close();
  });

  it('auto-attaches the best matching recoverable provider session on the first authorized message', async () => {
    const db = memoryDb();
    const users = new UserRepository(db);
    users.createUser({
      platform: PRIMARY_WEIXIN_PLATFORM,
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions } = createDaemonServer({
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

    expect(sessions.getActiveSession('chat-a')).toMatchObject({
      providerSessionId: 'claude-code_recoverable_1',
      cwd: '/tmp/project',
    });
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
      { kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') },
    ]);

    await app.close();
  });

  it('prefers the persisted provider binding over generic recoverable matching', async () => {
    const db = memoryDb();
    const users = new UserRepository(db);
    users.createUser({
      platform: PRIMARY_WEIXIN_PLATFORM,
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });
    new ProviderBindingRepository(db).upsert({
      platform: PRIMARY_WEIXIN_PLATFORM,
      platformUserId: 'wx_user_1',
      chatId: 'chat-bound',
      providerId: 'claude-code',
      providerSessionId: 'claude-session-bound',
      cwd: '/tmp/project',
    });

    const channel = new MockChannelAdapter();
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-bound',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'continue' },
      timestamp: 1,
    });

    expect(sessions.getActiveSession('chat-bound')).toMatchObject({
      providerSessionId: 'claude-session-bound',
    });
    expect(new RuntimeSessionRepository(db).list()).toEqual([
      expect.objectContaining({
        chatId: 'chat-bound',
        providerSessionId: 'claude-session-bound',
      }),
    ]);

    await app.close();
  });
});
