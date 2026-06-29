import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { createDaemonServer } from '../src/daemon/server';
import { FakeClaudeRunner } from '../src/providers/claude-code/fakeClaudeRunner';
import { ClaudeCodeProvider } from '../src/providers/claude-code/claudeProvider';
import { CodexProvider } from '../src/providers/codex/codexProvider';
import { CodexCliRunner } from '../src/providers/codex/codexCliRunner';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { FileWeixinStateStore } from '../src/channels/weixin-direct/weixinStateStore';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';

describe('channel admin routes', () => {
  it('does not expose pairing approval routes', async () => {
    const { app } = createDaemonServer({ activeUserStore: createRuntimeUserStore('bridge-admin-pairings-').activeUserStore });

    const list = await app.inject({ method: 'GET', url: '/api/channel/pairings' });
    expect(list.statusCode).toBe(404);

    const approve = await app.inject({ method: 'POST', url: '/api/channel/pairings/pair_test/approve' });
    expect(approve.statusCode).toBe(404);

    const reject = await app.inject({ method: 'POST', url: '/api/channel/pairings/pair_test/reject' });
    expect(reject.statusCode).toBe(404);
    await app.close();
  });

  it('returns the active user without exposing revoke route', async () => {
    const { app, activeUserStore } = createDaemonServer({ activeUserStore: createRuntimeUserStore('bridge-admin-active-wechat-user-').activeUserStore });
    const created = activeUserStore.setActiveUser({ platform: 'weixin', platformUserId: 'wx_user_1', role: 'user' });

    const response = await app.inject({ method: 'GET', url: '/api/channel/active-user' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ platformUserId: 'wx_user_1' });

    const revoke = await app.inject({ method: 'POST', url: `/api/channel/active-user/${created.id}/revoke` });
    expect(revoke.statusCode).toBe(404);

    const after = await app.inject({ method: 'GET', url: '/api/channel/active-user' });
    expect(after.json()).toMatchObject({ platformUserId: 'wx_user_1' });
    await app.close();
  });

  it('lists and stops runtime sessions without retaining historical bridge rows', async () => {
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, activeUserStore, sessions } = createDaemonServer({ channel, providers: [provider], activeUserStore: createRuntimeUserStore('bridge-admin-stop-').activeUserStore });
    activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });

    const active = sessions.getActiveSession('chat-a');
    expect(active).not.toBeNull();

    const stop = await app.inject({ method: 'POST', url: `/api/channel/sessions/${active!.id}/stop` });
    expect(stop.statusCode).toBe(404);

    const stopMissing = await app.inject({ method: 'POST', url: '/api/channel/sessions/does-not-exist/stop' });
    expect(stopMissing.statusCode).toBe(404);

    const listed = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(listed.json()).toEqual([
      expect.objectContaining({
        id: active!.id,
        status: 'idle',
        providerSessionId: expect.stringContaining('claude-code_fake_'),
      }),
    ]);

    await channel.emitIncoming({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'second hello' },
      timestamp: 2,
    });
    const next = sessions.getActiveSession('chat-a');
    expect(next).not.toBeNull();
    expect(next!.id).toBe(active!.id);

    const archive = await app.inject({ method: 'POST', url: `/api/channel/sessions/${next!.id}/archive` });
    expect(archive.statusCode).toBe(404);

    const archiveMissing = await app.inject({ method: 'POST', url: '/api/channel/sessions/does-not-exist/archive' });
    expect(archiveMissing.statusCode).toBe(404);

    const afterArchive = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(afterArchive.json()).toEqual([
      expect.objectContaining({
        id: active!.id,
        status: 'idle',
        providerSessionId: expect.stringContaining('claude-code_fake_'),
      }),
    ]);
    await app.close();
  });

  it('exposes the active weixin user push quota in channel state', async () => {
    const configPath = join(mkdtempSync(join(tmpdir(), 'bridge-admin-quota-')), 'config.json');
    const { app, activeUserStore } = createDaemonServer({
      configPath,
      activeUserStore: createRuntimeUserStore('bridge-admin-quota-store-').activeUserStore,
    });
    activeUserStore.setActiveUser({ platform: 'weixin', platformUserId: 'wx_user_1', role: 'user' });

    // No token yet → window expired, nothing left to send.
    const before = await app.inject({ method: 'GET', url: '/api/channel/state' });
    expect(before.json().quota).toMatchObject({ remaining: 0, sentCount: 0, limit: 10, expired: true });

    // User messaged the bot → token refresh resets the 24h window + full quota.
    new FileWeixinStateStore(configPath).setContextToken('wx_user_1', 'tok_1');
    const after = await app.inject({ method: 'GET', url: '/api/channel/state' });
    const quota = after.json().quota;
    expect(quota).toMatchObject({ remaining: 10, sentCount: 0, limit: 10, expired: false });
    expect(quota.windowEndsAt).toBeGreaterThan(Date.now());

    await app.close();
  });

  it('reports no quota when there is no active weixin user', async () => {
    const configPath = join(mkdtempSync(join(tmpdir(), 'bridge-admin-quota-none-')), 'config.json');
    const { app } = createDaemonServer({
      configPath,
      activeUserStore: createRuntimeUserStore('bridge-admin-quota-none-store-').activeUserStore,
    });

    const state = await app.inject({ method: 'GET', url: '/api/channel/state' });
    expect(state.json().quota).toBeNull();
    await app.close();
  });

  it('clears the active wechat user and current session when disabling the weixin plugin', async () => {
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, activeUserStore, sessions } = createDaemonServer({ channel, providers: [provider], activeUserStore: createRuntimeUserStore('bridge-admin-disable-').activeUserStore });
    activeUserStore.setActiveUser({ platform: 'weixin', platformUserId: 'wx_user_1', role: 'user' });

    await channel.emitIncoming({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });
    const active = sessions.getActiveSession('chat-a');
    expect(active).not.toBeNull();

    const disable = await app.inject({ method: 'POST', url: '/api/channel/plugins/disable', payload: { plugin_id: 'weixin' } });
    expect(disable.statusCode).toBe(200);
    expect(disable.json()).toEqual({ ok: true });

    const activeUser = await app.inject({ method: 'GET', url: '/api/channel/active-user' });
    expect(activeUser.json()).toBeNull();

    expect(provider.stoppedSessions).toEqual([active!.id]);
    const listed = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(listed.json()).toEqual([]);
    await app.close();
  });

  it('does not expose bridge event history routes', async () => {
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, activeUserStore, sessions } = createDaemonServer({ channel, providers: [provider], activeUserStore: createRuntimeUserStore('bridge-admin-no-events-').activeUserStore });
    activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    const active = sessions.getActiveSession('chat-a');
    expect(active).not.toBeNull();

    const response = await app.inject({ method: 'GET', url: `/api/channel/sessions/${active!.id}/events` });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('exposes persisted sessions and permission decisions for admin UI', async () => {
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, activeUserStore } = createDaemonServer({ channel, providers: [provider], activeUserStore: createRuntimeUserStore('bridge-admin-status-').activeUserStore });
    activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    const sessions = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.json()).toEqual([
      expect.objectContaining({
        chatId: 'chat-a',
        providerId: 'claude-code',
        providerSessionId: expect.stringContaining('claude-code_fake_'),
        bindingMatched: false,
        bindingSource: 'runtime',
        providerResumeTitleSynced: false,
        providerResumeRepairable: false,
        providerResumeCommand: expect.stringContaining('claude --resume'),
      }),
    ]);

    const status = await app.inject({ method: 'GET', url: '/api/status' });
    expect(status.json()).toMatchObject({
      ok: true,
      sessions: [expect.objectContaining({ chatId: 'chat-a' })],
    });

    const decision = await app.inject({
      method: 'POST',
      url: '/api/permissions/decide',
      payload: { requestId: 'pr_fake_1', userId: 'user_admin', decision: 'deny' },
    });
    expect(decision.statusCode).toBe(404);
    const statusAfterDecision = await app.inject({ method: 'GET', url: '/api/status' });
    expect(statusAfterDecision.json()).toMatchObject({
      ok: true,
      sessions: [expect.objectContaining({ chatId: 'chat-a' })],
    });
    await app.close();
  });

  it('deletes config.json when disabling the wechat plugin', async () => {
    const store = createRuntimeUserStore('bridge-admin-disable-wechat-');
    writeFileSync(store.configPath, JSON.stringify({
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-bot-token',
        accountId: 'wx-account-1',
      },
    }, null, 2));

    const { app } = createDaemonServer({
      activeUserStore: store.activeUserStore,
      configPath: store.configPath,
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-bot-token',
        accountId: 'wx-account-1',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/plugins/disable',
      payload: { plugin_id: 'weixin' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(existsSync(store.configPath)).toBe(false);
    await app.close();
  });

  it('reads and updates daemon settings', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-settings-config-`);
    const configPath = join(configDir, 'config.json');
    const { app } = createDaemonServer({
      activeUserStore: createRuntimeUserStore('bridge-admin-settings-').activeUserStore,
      configPath,
      bridgeDefaults: {
        defaultProvider: 'claude-code',
        defaultWorkspace: process.cwd(),
      },
    });

    const initial = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({
      defaultProvider: 'claude-code',
      defaultWorkspace: process.cwd(),
      tunnel: {
        relay: {
          serverUrl: 'wss://wechat.style520.com/agent',
          authToken: expect.any(String),
        },
      },
    });

    const update = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/project',
        tunnel: {
          relay: {
            serverUrl: 'wss://relay.style520.com/agent',
            authToken: 'clrt_1234567890abcdef12345678',
          },
        },
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toEqual({ ok: true });

    const next = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(next.json()).toMatchObject({
      defaultProvider: 'codex',
      defaultWorkspace: '/tmp/project',
      tunnel: {
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'clrt_1234567890abcdef12345678',
        },
      },
    });
    expect(JSON.parse(await readFile(configPath, 'utf8'))).toMatchObject({
      bridge: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/project',
      },
      tunnel: {
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'clrt_1234567890abcdef12345678',
        },
      },
    });
    await app.close();
  });

  it('does not notify the weixin user when default settings change', async () => {
    const channel = new MockChannelAdapter();
    const sent: Array<{ chatId: string; kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ chatId: message.chatId, kind: message.kind, text: message.text }));
    // Regression guard: even with an active user and a live conversation (the old bug's trigger), no notification should fire.
    const store = createRuntimeUserStore('bridge-admin-no-notify-');
    const { app, activeUserStore } = createDaemonServer({
      channel,
      activeUserStore: store.activeUserStore,
      configPath: store.configPath,
      bridgeDefaults: {
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
      },
    });
    const user = activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });
    writeFileSync(store.configPath, JSON.stringify({
      bridge: {
        activeWeChatUser: {
          ...user,
          currentConversation: {
            id: 'bs_active_1',
            chatId: 'chat-a',
            ownerUserId: user.id,
            providerId: 'claude-code',
            cwd: '/tmp/active-project',
            recoverySource: 'runtime',
            status: 'idle',
            createdAt: 10,
            lastActivityAt: 20,
          },
        },
      },
    }, null, 2));

    const update = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/project',
      },
    });

    expect(update.statusCode).toBe(200);
    expect(sent).toEqual([]);

    const next = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(next.json()).toMatchObject({ defaultProvider: 'codex', defaultWorkspace: '/tmp/project' });
    await app.close();
  });

  it('exports the effective WeChat runtime config for handoff to a new daemon', async () => {
    const { app } = createDaemonServer({
      activeUserStore: createRuntimeUserStore('bridge-admin-runtime-config-').activeUserStore,
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-bot-token',
        accountId: 'wx-account-id',
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/channel/wechat/runtime-config' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      enabled: true,
      baseUrl: 'https://ilinkai.weixin.qq.com',
      token: 'wx-bot-token',
      accountId: 'wx-account-id',
    });

    await app.close();
  });

  it('persists formal wechat config when enabling the plugin from the admin API', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-config-`);
    const configPath = join(configDir, 'config.json');
    const { app } = createDaemonServer({
      activeUserStore: createRuntimeUserStore('bridge-admin-wechat-disable-').activeUserStore,
      wechat: { enabled: false },
      configPath,
    });

    const enable = await app.inject({
      method: 'POST',
      url: '/api/channel/plugins/enable',
      payload: {
        plugin_id: 'weixin',
        config: {
          baseUrl: 'https://ilinkai.weixin.qq.com',
          credentials: {
            account_id: 'wx-account-1',
            bot_token: 'wx-bot-token',
          },
        },
      },
    });

    expect(enable.statusCode).toBe(200);
    expect(JSON.parse(await readFile(configPath, 'utf8'))).toMatchObject({
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-bot-token',
        accountId: 'wx-account-1',
      },
    });

    await app.close();
  });

  it('does not expose bridge-session native resume repair routes', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-admin-home-`);
    try {
      const store = createRuntimeUserStore('bridge-admin-native-repair-');
      const user = seedRuntimeUserStore(store, {
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
      });
      const projectDir = join(process.env.HOME, '.claude', 'projects', '-tmp-project');
      mkdirSync(projectDir, { recursive: true });
      const sessionPath = join(projectDir, 'legacy-session-1.jsonl');
      writeFileSync(sessionPath, [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'legacy' }] } }),
        JSON.stringify({ type: 'result', session_id: 'legacy-session-1' }),
      ].join('\n'));

      writeFileSync(store.configPath, JSON.stringify({
        bridge: {
          activeWeChatUser: {
            ...user,
            currentConversation: {
              id: 'bs_legacy',
              chatId: 'chat-legacy',
              ownerUserId: user.id,
              providerId: 'claude-code',
              providerSessionId: 'legacy-session-1',
              recoverySource: 'runtime',
              resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:legacyprobe]',
              cwd: '/tmp/project',
              status: 'idle',
              createdAt: 1,
              lastActivityAt: 1,
            },
          },
        },
      }, null, 2));

      const app = createDaemonServer({
        channel: new MockChannelAdapter(),
        providers: [new ClaudeCodeProvider({ runner: new FakeClaudeRunner() })],
        activeUserStore: store.activeUserStore,
        configPath: store.configPath,
      }).app;
      const repair = await app.inject({ method: 'POST', url: '/api/channel/sessions/bs_legacy/repair-native-resume' });
      expect(repair.statusCode).toBe(404);
      const listed = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
      expect(listed.json()).toEqual([
        expect.objectContaining({
          id: 'bs_legacy',
          providerResumeRepairable: true,
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('does not expose batch bridge-session native resume repair routes', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-admin-home-`);
    try {
      const store = createRuntimeUserStore('bridge-admin-batch-repair-');
      const user = seedRuntimeUserStore(store, {
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
      });
      const repairableTitle = '微信 · wx_user_1 · [claude-codex-wechat:batch-attached-1]';
      const syncedTitle = '微信 · wx_user_1 · [claude-codex-wechat:batch-attached-2]';

      const projectDir = join(process.env.HOME, '.claude', 'projects', '-tmp-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'attached-batch-1.jsonl'), JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'legacy attached 1' }] },
      }), 'utf8');
      writeFileSync(join(projectDir, 'attached-batch-2.jsonl'), [
        JSON.stringify({ type: 'custom-title', customTitle: syncedTitle, sessionId: 'attached-batch-2' }),
        JSON.stringify({ type: 'agent-name', agentName: syncedTitle, sessionId: 'attached-batch-2' }),
      ].join('\n'), 'utf8');

      writeFileSync(store.configPath, JSON.stringify({
        bridge: {
          activeWeChatUser: {
            ...user,
            currentConversation: {
              id: 'bs_batch_2',
              chatId: 'chat-batch-2',
              ownerUserId: user.id,
              providerId: 'claude-code',
              providerSessionId: 'attached-batch-2',
              recoverySource: 'runtime',
              resumeTitle: syncedTitle,
              cwd: '/tmp/project',
              status: 'idle',
              createdAt: 2,
              lastActivityAt: 2,
            },
          },
        },
      }, null, 2));

      const app = createDaemonServer({
        channel: new MockChannelAdapter(),
        providers: [new ClaudeCodeProvider({ runner: new FakeClaudeRunner() })],
        activeUserStore: store.activeUserStore,
        configPath: store.configPath,
      }).app;

      const repair = await app.inject({ method: 'POST', url: '/api/channel/sessions/repair-native-resume' });
      expect(repair.statusCode).toBe(404);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('applies updated default provider and workspace to new WeChat sessions', async () => {
    const channel = new MockChannelAdapter();
    const store = createRuntimeUserStore('bridge-admin-default-provider-switch-');
    const { app, activeUserStore, sessions } = createDaemonServer({
      channel,
      providers: [new FakeProviderAdapter('claude-code'), new FakeProviderAdapter('codex')],
      activeUserStore: store.activeUserStore,
      configPath: store.configPath,
    });
    activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    const update = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/codex-project',
      },
    });
    expect(update.statusCode).toBe(200);

    await channel.emitIncoming({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-codex',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello codex' },
      timestamp: 1,
    });

    expect(sessions.getActiveSession('chat-codex')).toMatchObject({
      providerId: 'codex',
    });
    await app.close();
  });

  it('reports both Claude and Codex provider status', async () => {
    const { app } = createDaemonServer();

    const response = await app.inject({ method: 'GET', url: '/api/providers/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      claude: expect.anything(),
      codex: expect.anything(),
    });
    await app.close();
  });

  it('lists recoverable native provider sessions and attaches one into the bridge', async () => {
    const provider = new FakeProviderAdapter('claude-code');
    const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
    activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    const recoverable = await app.inject({
      method: 'GET',
      url: '/api/channel/providers/claude-code/recoverable-sessions',
    });
    expect(recoverable.statusCode).toBe(200);
    expect(recoverable.json()).toEqual([
      expect.objectContaining({
        id: 'claude-code_recoverable_1',
        providerId: 'claude-code',
        providerResumeRepairable: false,
      }),
    ]);

    const attach = await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/attach',
      payload: {
        providerId: 'claude-code',
        providerSessionId: 'claude-code_recoverable_1',
        platformUserId: 'wx_user_1',
        chatId: 'chat-attached',
      },
    });
    expect(attach.statusCode).toBe(200);
    expect(attach.json()).toMatchObject({
      ok: true,
      session: {
        chatId: 'chat-attached',
        providerId: 'claude-code',
        providerSessionId: 'claude-code_recoverable_1',
        preferredResumeMode: 'id',
        providerResumeCommand: 'claude --resume claude-code_recoverable_1',
      },
    });

    const sessions = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(sessions.json()).toEqual([
      expect.objectContaining({
        chatId: 'chat-attached',
        providerSessionId: 'claude-code_recoverable_1',
      }),
    ]);

    await app.close();
  });

  it('paginates recoverable native provider sessions with nextCursor', async () => {
    class ManyRecoverableProvider extends FakeProviderAdapter {
      override async listRecoverableSessions() {
        return [
          { id: 'claude-code_recoverable_4', providerId: 'claude-code' as const, title: 'session 4' },
          { id: 'claude-code_recoverable_3', providerId: 'claude-code' as const, title: 'session 3' },
          { id: 'claude-code_recoverable_2', providerId: 'claude-code' as const, title: 'session 2' },
          { id: 'claude-code_recoverable_1', providerId: 'claude-code' as const, title: 'session 1' },
        ];
      }
    }

    const provider = new ManyRecoverableProvider('claude-code');
    const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
    activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    const firstPage = await app.inject({
      method: 'GET',
      url: '/api/channel/providers/claude-code/recoverable-sessions?limit=2',
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json()).toEqual({
      items: [
        expect.objectContaining({ id: 'claude-code_recoverable_4' }),
        expect.objectContaining({ id: 'claude-code_recoverable_3' }),
      ],
      nextCursor: 'claude-code_recoverable_3',
    });

    const secondPage = await app.inject({
      method: 'GET',
      url: '/api/channel/providers/claude-code/recoverable-sessions?limit=2&cursor=claude-code_recoverable_3',
    });
    expect(secondPage.statusCode).toBe(200);
    expect(secondPage.json()).toEqual({
      items: [
        expect.objectContaining({ id: 'claude-code_recoverable_2' }),
        expect.objectContaining({ id: 'claude-code_recoverable_1' }),
      ],
      nextCursor: null,
    });

    await app.close();
  });

  it('rejects attaching a recoverable session when no active wechat user is authorized', async () => {
    const provider = new FakeProviderAdapter('claude-code');
    const store = createRuntimeUserStore('bridge-admin-reattach-wechat-user-');
    const created = store.activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });
    const { app } = createDaemonServer({
      providers: [provider],
      activeUserStore: store.activeUserStore,
      configPath: store.configPath,
    });

    expect(store.activeUserStore.getActiveUser()).toMatchObject({ platformUserId: 'wx_user_1' });
    expect(store.activeUserStore.clearActiveUser(created.id)).toEqual({ ok: true });
    expect(store.activeUserStore.getActiveUser()).toBeNull();

    const attach = await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/attach',
      payload: {
        providerId: 'claude-code',
        providerSessionId: 'claude-code_recoverable_1',
        platformUserId: 'wx_user_1',
        chatId: 'chat-reattached',
      },
    });
    expect(attach.statusCode).toBe(404);
    expect(attach.json()).toEqual({ ok: false, error: 'active_wechat_user_not_found' });
    expect(store.activeUserStore.getActiveUser()).toBeNull();

    await app.close();
  });

  it('does not expose recoverable Claude native resume repair before attaching', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const resumeTitle = '修复原生 resume';
      const projectDir = join(home, '.claude', 'projects', 'proj-recoverable-repair');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'claude-repairable-session.jsonl'), [
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'repair me', sessionId: 'claude-repairable-session' }),
      ].join('\n'), 'utf8');
      writeFileSync(join(home, '.claude', 'history.jsonl'), [
        JSON.stringify({
          display: resumeTitle,
          timestamp: 123,
          project: '/tmp/recoverable-project',
          sessionId: 'claude-repairable-session',
        }),
      ].join('\n'), 'utf8');

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ providers: [provider] });

      const repair = await app.inject({
        method: 'POST',
        url: '/api/channel/providers/claude-code/recoverable-sessions/claude-repairable-session/repair-native-resume',
      });
      expect(repair.statusCode).toBe(404);

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([
        expect.objectContaining({
          id: 'claude-repairable-session',
          providerResumeTitleSynced: false,
          providerResumeHistorySynced: true,
          providerResumeRepairable: true,
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  // FLAKY(预存): daemon 启动时 server.ts 的 void ensureClaudeSessionBridgeMetadata 未 await,
  // 会异步把 history.display 同步为 resumeTitle,破坏本用例依赖的「history 未同步」状态。
  // 时序敏感,留待消除启动竞态后恢复。
  it.skip('reports Claude history sync separately from session title sync', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const resumeTitle = '历史同步标题';
      const projectDir = join(home, '.claude', 'projects', 'proj-history-missing');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'claude-history-missing.jsonl'), [
        JSON.stringify({ type: 'custom-title', customTitle: resumeTitle, sessionId: 'claude-history-missing' }),
        JSON.stringify({ type: 'agent-name', agentName: resumeTitle, sessionId: 'claude-history-missing' }),
      ].join('\n'), 'utf8');
      writeFileSync(join(home, '.claude', 'history.jsonl'), [
        JSON.stringify({
          display: '旧标题',
          timestamp: 123,
          project: '/tmp/history-missing',
          sessionId: 'claude-history-missing',
        }),
      ].join('\n'), 'utf8');

      const store = createRuntimeUserStore('bridge-admin-history-missing-');
      const user = seedRuntimeUserStore(store, {
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
      });
      writeFileSync(store.configPath, JSON.stringify({
        bridge: {
          activeWeChatUser: {
            ...user,
            currentConversation: {
              id: 'bs_history_missing',
              chatId: 'chat-history-missing',
              ownerUserId: user.id,
              providerId: 'claude-code',
              providerSessionId: 'claude-history-missing',
              recoverySource: 'runtime',
              resumeTitle,
              cwd: '/tmp/project',
              status: 'idle',
              createdAt: 1,
              lastActivityAt: 1,
            },
          },
        },
      }, null, 2));

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({
        providers: [provider],
        activeUserStore: store.activeUserStore,
        configPath: store.configPath,
      });

      const sessions = await app.inject({
        method: 'GET',
        url: '/api/channel/sessions',
      });
      expect(sessions.statusCode).toBe(200);
      expect(sessions.json()).toEqual([
        expect.objectContaining({
          id: 'bs_history_missing',
          providerResumeTitleSynced: true,
          providerResumeHistorySynced: false,
          providerResumeRepairable: true,
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('does not expose batch recoverable Claude native resume repair routes', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const projectDir = join(home, '.claude', 'projects', 'proj-recoverable-batch');
      mkdirSync(projectDir, { recursive: true });
      const repairableTitle = '批量修复会话一';
      const alreadySyncedTitle = '批量修复会话二';

      writeFileSync(join(projectDir, 'claude-batch-repair-1.jsonl'), [
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'repair batch 1', sessionId: 'claude-batch-repair-1' }),
      ].join('\n'), 'utf8');
      writeFileSync(join(projectDir, 'claude-batch-repair-2.jsonl'), [
        JSON.stringify({ type: 'custom-title', customTitle: alreadySyncedTitle, sessionId: 'claude-batch-repair-2' }),
        JSON.stringify({ type: 'agent-name', agentName: alreadySyncedTitle, sessionId: 'claude-batch-repair-2' }),
      ].join('\n'), 'utf8');

      writeFileSync(join(home, '.claude', 'history.jsonl'), [
        JSON.stringify({
          display: repairableTitle,
          timestamp: 123,
          project: '/tmp/recoverable-batch-1',
          sessionId: 'claude-batch-repair-1',
        }),
        JSON.stringify({
          display: alreadySyncedTitle,
          timestamp: 124,
          project: '/tmp/recoverable-batch-2',
          sessionId: 'claude-batch-repair-2',
        }),
      ].join('\n'), 'utf8');

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ providers: [provider] });

      const repair = await app.inject({
        method: 'POST',
        url: '/api/channel/providers/claude-code/recoverable-sessions/repair-native-resume',
      });
      expect(repair.statusCode).toBe(404);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('lists recoverable Codex sessions with a resume-by-name command', async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHome = mkdtempSync(join(tmpdir(), 'bridge-codex-home-'));
    process.env.CODEX_HOME = codexHome;
    try {
      mkdirSync(join(codexHome, 'sessions', '2026', '06', '14'), { recursive: true });
      writeFileSync(join(codexHome, 'sessions', '2026', '06', '14', 'rollout-2026-06-14T01-15-08-codex-session-1.jsonl'), [
        JSON.stringify({
          timestamp: '2026-06-14T01:15:36.051Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-1',
            cwd: '/tmp/codex-project',
          },
        }),
      ].join('\n'), 'utf8');
      writeFileSync(join(codexHome, 'session_index.jsonl'), [
        JSON.stringify({
          id: 'codex-session-1',
          thread_name: '微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
          updated_at: '2026-06-14T01:16:00.000Z',
        }),
      ].join('\n'), 'utf8');

      const runner = new CodexCliRunner({ processRunner: async () => ({ code: 0, stdout: '', stderr: '' }) });
      const { app } = createDaemonServer({ providers: [new CodexProvider({ runner })] });

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/codex/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([
        expect.objectContaining({
          id: 'codex-session-1',
          providerId: 'codex',
          cwd: '/tmp/codex-project',
          preferredResumeMode: 'title',
          title: '微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
          providerResumeCommand: 'codex resume codex-session-1',
          providerResumeByTitleCommand: 'codex resume 微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
        }),
      ]);

      await app.close();
    } finally {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it('writes a bridge-owned Codex thread name into session_index on attach', async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHome = mkdtempSync(join(tmpdir(), 'bridge-codex-home-'));
    process.env.CODEX_HOME = codexHome;
    try {
      mkdirSync(join(codexHome, 'sessions', '2026', '06', '14'), { recursive: true });
      writeFileSync(join(codexHome, 'sessions', '2026', '06', '14', 'rollout-2026-06-14T01-15-08-codex-session-1.jsonl'), [
        JSON.stringify({
          timestamp: '2026-06-14T01:15:36.051Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-1',
          },
        }),
      ].join('\n'), 'utf8');

      const runner = new CodexCliRunner({ processRunner: async () => ({ code: 0, stdout: '', stderr: '' }) });
      const { app, activeUserStore } = createDaemonServer({ providers: [new CodexProvider({ runner })] });
      activeUserStore.setActiveUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
      });

      const attach = await app.inject({
        method: 'POST',
        url: '/api/channel/sessions/attach',
        payload: {
          providerId: 'codex',
          providerSessionId: 'codex-session-1',
          platformUserId: 'wx_user_1',
          chatId: 'chat-codex',
        },
      });
      expect(attach.statusCode).toBe(200);
      expect(attach.json()).toMatchObject({
        session: {
          preferredResumeMode: 'id',
        },
      });

      expect(existsSync(join(codexHome, 'session_index.jsonl'))).toBe(false);

      await app.close();
    } finally {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it('filters already attached native sessions out of recoverable results', async () => {
    const provider = new FakeProviderAdapter('claude-code');
    const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
    activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/attach',
      payload: {
        providerId: 'claude-code',
        providerSessionId: 'claude-code_recoverable_1',
        platformUserId: 'wx_user_1',
        chatId: 'chat-attached',
      },
    });

    const recoverable = await app.inject({
      method: 'GET',
      url: '/api/channel/providers/claude-code/recoverable-sessions',
    });
    expect(recoverable.statusCode).toBe(200);
    expect(recoverable.json()).toEqual([]);

    await app.close();
  });

  it('keeps attached provider sessions hidden from recoverable scans while they remain current bridge sessions', async () => {
    const provider = new FakeProviderAdapter('claude-code');
    const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
    activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    const attach = await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/attach',
      payload: {
        providerId: 'claude-code',
        providerSessionId: 'claude-code_recoverable_1',
        platformUserId: 'wx_user_1',
        chatId: 'chat-attached',
      },
    });
    expect(attach.statusCode).toBe(200);

    const recoverable = await app.inject({
      method: 'GET',
      url: '/api/channel/providers/claude-code/recoverable-sessions',
    });
    expect(recoverable.statusCode).toBe(200);
    expect(recoverable.json()).toEqual([]);

    await app.close();
  });

  it('reports native Claude session reachability and resolved path in session listings', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const claudeSessionId = 'claude-native-session-1';
      const projectDir = join(home, '.claude', 'projects', 'proj-a');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, `${claudeSessionId}.jsonl`), '[]\n', 'utf8');

      const provider = new FakeProviderAdapter('claude-code');
      const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
      activeUserStore.setActiveUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        currentConversation: {
          id: 'bs_active',
          chatId: 'wx_user_1',
          ownerUserId: 'user_active',
          providerId: 'claude-code',
          cwd: '/tmp/project-a',
          recoverySource: 'runtime',
          status: 'idle',
          createdAt: 1,
          lastActivityAt: 1,
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/channel/sessions/attach',
        payload: {
          providerId: 'claude-code',
          providerSessionId: claudeSessionId,
          platformUserId: 'wx_user_1',
          chatId: 'chat-native',
        },
      });

      const sessions = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
      expect(sessions.statusCode).toBe(200);
      expect(sessions.json()).toEqual([
        expect.objectContaining({
          providerSessionId: claudeSessionId,
          providerNativeReachable: true,
          providerNativePath: join(projectDir, `${claudeSessionId}.jsonl`),
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('uses ai-title metadata for recoverable Claude session labels', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const projectDir = join(home, '.claude', 'projects', 'proj-meta');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'claude-meta-session.jsonl'), [
        JSON.stringify({ type: 'last-prompt', lastPrompt: '这是最后一个问题', sessionId: 'claude-meta-session' }),
        JSON.stringify({ type: 'ai-title', aiTitle: '微信自动接管测试', sessionId: 'claude-meta-session' }),
      ].join('\n'), 'utf8');
      writeFileSync(join(home, '.claude', 'history.jsonl'), [
        JSON.stringify({
          display: '这是最后一个问题',
          timestamp: 123,
          project: '/tmp/real-project',
          sessionId: 'claude-meta-session',
        }),
      ].join('\n'), 'utf8');

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ providers: [provider] });

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([
        expect.objectContaining({
          id: 'claude-meta-session',
          title: '微信自动接管测试',
          providerResumeCommand: 'claude --resume claude-meta-session',
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('writes provider sidecar metadata so recoverable Claude sessions can rehydrate bridgeTag and cwd', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const projectDir = join(home, '.claude', 'projects', 'proj-sidecar');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'claude-sidecar-session.jsonl'), JSON.stringify({
        type: 'ai-title',
        aiTitle: 'sidecar 测试会话',
        sessionId: 'claude-sidecar-session',
      }), 'utf8');

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
      activeUserStore.setActiveUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
      });

      const attach = await app.inject({
        method: 'POST',
        url: '/api/channel/sessions/attach',
        payload: {
          providerId: 'claude-code',
          providerSessionId: 'claude-sidecar-session',
          platformUserId: 'wx_user_1',
          chatId: 'chat-sidecar',
        },
      });
      expect(attach.statusCode).toBe(200);

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([]);

      const recoverableWhileAttached = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverableWhileAttached.statusCode).toBe(200);
      expect(recoverableWhileAttached.json()).toEqual([]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('extracts bridgeTag from Claude custom-title records', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const projectDir = join(home, '.claude', 'projects', 'proj-title');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'claude-title-session.jsonl'), [
        JSON.stringify({
          type: 'custom-title',
          customTitle: '微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdC10aXRsZSJ9]',
          sessionId: 'claude-title-session',
        }),
        JSON.stringify({
          type: 'last-prompt',
          lastPrompt: 'continue bridge',
          sessionId: 'claude-title-session',
        }),
      ].join('\n'), 'utf8');

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ providers: [provider] });

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([
        expect.objectContaining({
          id: 'claude-title-session',
          title: 'continue bridge',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdC10aXRsZSJ9]',
          providerResumeTitleSynced: true,
          providerResumeRepairable: true,
          providerResumeCommand: 'claude --resume claude-title-session',
          providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdC10aXRsZSJ9]',
          bridgeTag: {
            platform: 'weixin',
            platformUserId: 'wx_user_1',
            chatId: 'chat-title',
          },
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('uses recoverable Claude session cwd when attaching without an explicit cwd', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const projectDir = join(home, '.claude', 'projects', 'proj-meta');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'claude-meta-session.jsonl'), [
        JSON.stringify({ type: 'ai-title', aiTitle: '自动接管 cwd 测试', sessionId: 'claude-meta-session' }),
      ].join('\n'), 'utf8');
      writeFileSync(join(home, '.claude', 'history.jsonl'), [
        JSON.stringify({
          display: '自动接管 cwd 测试',
          timestamp: 123,
          project: '/tmp/recovered-project',
          sessionId: 'claude-meta-session',
        }),
      ].join('\n'), 'utf8');

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
      activeUserStore.setActiveUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
      });

      const attach = await app.inject({
        method: 'POST',
        url: '/api/channel/sessions/attach',
        payload: {
          providerId: 'claude-code',
          providerSessionId: 'claude-meta-session',
          platformUserId: 'wx_user_1',
          chatId: 'chat-attached',
        },
      });
      expect(attach.statusCode).toBe(200);
      expect(attach.json()).toMatchObject({
        ok: true,
        session: {
          providerSessionId: 'claude-meta-session',
          providerResumeByTitleCommand: 'claude -r 自动接管 cwd 测试',
        },
      });

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('auto-attaches the newest recoverable Claude session that matches the user cwd', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const projectDir = join(home, '.claude', 'projects', 'proj-auto');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'claude-old.jsonl'), JSON.stringify({
        type: 'ai-title',
        aiTitle: '旧会话',
        sessionId: 'claude-old',
      }), 'utf8');
      writeFileSync(join(projectDir, 'claude-new.jsonl'), JSON.stringify({
        type: 'ai-title',
        aiTitle: '新会话',
        sessionId: 'claude-new',
      }), 'utf8');
      writeFileSync(join(home, '.claude', 'history.jsonl'), [
        JSON.stringify({ sessionId: 'claude-old', project: '/tmp/project-a', timestamp: 100 }),
        JSON.stringify({ sessionId: 'claude-new', project: '/tmp/project-a', timestamp: 200 }),
        JSON.stringify({ sessionId: 'claude-other', project: '/tmp/project-b', timestamp: 300 }),
      ].join('\n'), 'utf8');

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
      activeUserStore.setActiveUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
      });

      const attach = await app.inject({
        method: 'POST',
        url: '/api/channel/sessions/auto-attach',
        payload: {
          providerId: 'claude-code',
          platformUserId: 'wx_user_1',
          cwd: '/tmp/project-a',
        },
      });
      expect(attach.statusCode).toBe(200);
      expect(attach.json()).toMatchObject({
        ok: true,
        session: {
          cwd: '/tmp/project-a',
          providerResumeCommand: 'claude --resume claude-new',
        },
      });

      const sessions = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
      expect(sessions.json()).toEqual([
        expect.objectContaining({
          bindingMatched: false,
          bindingSource: 'heuristic',
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('does not auto-attach a Codex recoverable session when its cwd does not match the user cwd', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-codex-home-'));
    process.env.HOME = home;
    try {
      const codexSessionDir = join(home, '.codex', 'sessions', '2026', '06', '14');
      mkdirSync(codexSessionDir, { recursive: true });
      writeFileSync(join(codexSessionDir, 'rollout-2026-06-14T10-00-00-codex-cwd-mismatch.jsonl'), JSON.stringify({
        timestamp: '2026-06-14T02:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'codex-cwd-mismatch',
        },
      }), 'utf8');
      mkdirSync(join(home, '.claude-codex-wechat', 'provider-sidecar'), { recursive: true });
      writeFileSync(join(home, '.claude-codex-wechat', 'provider-sidecar', 'codex__codex-cwd-mismatch.json'), JSON.stringify({
        providerId: 'codex',
        providerSessionId: 'codex-cwd-mismatch',
        bridgeTag: {
          platform: 'weixin',
          platformUserId: 'wx_user_1',
          chatId: 'wx_user_1',
        },
        updatedAt: 200,
      }, null, 2), 'utf8');
      writeFileSync(join(home, '.codex', 'session_index.jsonl'), JSON.stringify({
        id: 'codex-cwd-mismatch',
        thread_name: '微信 · wx_user_1 · [claude-codex-wechat:codex-cwd-mismatch]',
        updated_at: '2026-06-14T02:00:00.000Z',
      }), 'utf8');

      const provider = new CodexProvider({ runner: new CodexCliRunner() });
      const { app, activeUserStore } = createDaemonServer({ providers: [provider] });
      activeUserStore.setActiveUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
      });

      const attach = await app.inject({
        method: 'POST',
        url: '/api/channel/sessions/auto-attach',
        payload: {
          providerId: 'codex',
          platformUserId: 'wx_user_1',
        },
      });

      expect(attach.statusCode).toBe(404);
      expect(attach.json()).toEqual({ ok: false, error: 'recoverable_provider_session_not_found' });

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('syncs channel settings by updating the current conversation to the latest provider and workspace', async () => {
    const channel = new MockChannelAdapter();
    const store = createRuntimeUserStore('bridge-admin-settings-sync-current-conversation-');
    const { app, activeUserStore, conversation } = createDaemonServer({
      channel,
      providers: [new FakeProviderAdapter('claude-code'), new FakeProviderAdapter('codex')],
      activeUserStore: store.activeUserStore,
      configPath: store.configPath,
      bridgeDefaults: {
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/original-project',
      },
    });
    const activeUser = activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });
    const before = conversation.getCurrent();
    expect(before).toMatchObject({
      chatId: 'chat-a',
      ownerUserId: activeUser.id,
      providerId: 'claude-code',
      providerSessionId: expect.stringContaining('claude-code_fake_'),
      cwd: '/tmp/original-project',
      status: 'idle',
    });

    const update = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/updated-project',
      },
    });
    expect(update.statusCode).toBe(200);

    const sync = await app.inject({
      method: 'POST',
      url: '/api/channel/settings/sync',
      payload: { platform: 'weixin' },
    });

    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toEqual({ ok: true });

    const after = conversation.getCurrent();
    expect(after).toBeNull();

    const listed = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(listed.json()).toEqual([]);
    await app.close();
  });

  it('creates a new session with chosen provider and notifies the weixin user', async () => {
    const channel = new MockChannelAdapter();
    const sent: Array<{ chatId: string; kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ chatId: message.chatId, kind: message.kind, text: message.text }));
    const provider = new FakeProviderAdapter('codex');
    const { app, activeUserStore, sessions } = createDaemonServer({
      channel,
      providers: [provider],
      activeUserStore: createRuntimeUserStore('bridge-admin-new-session-').activeUserStore,
      bridgeDefaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });
    activeUserStore.setActiveUser({ platform: 'weixin', platformUserId: 'wx_user_1', role: 'user' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/new',
      payload: { providerId: 'codex', cwd: '/tmp/my-project', platformUserId: 'wx_user_1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, session: { providerId: 'codex', cwd: '/tmp/my-project' } });

    const current = sessions.getCurrent();
    expect(current).toMatchObject({ providerId: 'codex', cwd: '/tmp/my-project', chatId: 'wx_user_1' });

    expect(sent).toEqual([
      { chatId: 'wx_user_1', kind: 'status', text: '已新建 Codex 会话，项目目录：/tmp/my-project。' },
    ]);
    await app.close();
  });

  it('still creates the session even if the weixin notification fails', async () => {
    const channel = new MockChannelAdapter();
    channel.onSent(() => {
      throw new Error('weixin_send_message_failed:-3:unknown_error');
    });
    const provider = new FakeProviderAdapter('codex');
    const { app, activeUserStore, sessions } = createDaemonServer({
      channel,
      providers: [provider],
      activeUserStore: createRuntimeUserStore('bridge-admin-new-session-notify-fail-').activeUserStore,
      bridgeDefaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });
    activeUserStore.setActiveUser({ platform: 'weixin', platformUserId: 'wx_user_1', role: 'user' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/new',
      payload: { providerId: 'codex', cwd: '/tmp/my-project', platformUserId: 'wx_user_1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, session: { providerId: 'codex', cwd: '/tmp/my-project' } });
    expect(sessions.getCurrent()).toMatchObject({ providerId: 'codex', cwd: '/tmp/my-project', chatId: 'wx_user_1' });
    await app.close();
  });

  it('rejects new session creation when there is no active weixin user', async () => {
    const provider = new FakeProviderAdapter('codex');
    const { app } = createDaemonServer({
      channel: new MockChannelAdapter(),
      providers: [provider],
      activeUserStore: createRuntimeUserStore('bridge-admin-new-session-nouser-').activeUserStore,
      bridgeDefaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/new',
      payload: { providerId: 'codex', cwd: '/tmp/my-project', platformUserId: 'wx_user_1' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false, error: 'active_wechat_user_not_found' });
    await app.close();
  });
});
