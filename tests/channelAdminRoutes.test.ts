import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { createDaemonServer } from '../src/daemon/server';
import { FakeClaudeRunner } from '../src/providers/claude-code/fakeClaudeRunner';
import { ClaudeCodeProvider } from '../src/providers/claude-code/claudeProvider';
import { CodexProvider } from '../src/providers/codex/codexProvider';
import { CodexCliRunner } from '../src/providers/codex/codexCliRunner';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { buildSessionBridgeName } from '../src/session/sessionBridgeTag';
import { BridgeEventRepository } from '../src/storage/bridgeEventRepository';
import { PermissionRequestRepository } from '../src/storage/permissionRequestRepository';
import { RuntimeSessionRepository } from '../src/storage/runtimeSessionRepository';
import { schemaSql } from '../src/storage/schema';
import { UserRepository } from '../src/storage/userRepository';

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
    const created = users.createUser({ platform: 'weixin', platformUserId: 'wx_user_1', role: 'user', defaultProvider: 'codex', defaultCwd: '/tmp/project' });

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
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
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

  it('lists bridge events for a session', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users, sessions } = createDaemonServer({ db, channel, providers: [provider] });
    users.createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
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
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'permission_request', text: '允许执行 fake command?' }),
    ]));
    await app.close();
  });

  it('exposes persisted sessions and permission decisions for admin UI', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users } = createDaemonServer({ db, channel, providers: [provider] });
    users.createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
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
      wechatAutoAuthorize: true,
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
        wechatAutoAuthorize: true,
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
      wechatAutoAuthorize: true,
      wechatThrottle: { minIntervalMs: 750, chunkSize: 800 },
      highRiskCommandPolicy: 'deny',
    });
    await app.close();
  });

  it('exports the effective WeChat runtime config for handoff to a new daemon', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const { app } = createDaemonServer({
      db,
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
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const configDir = mkdtempSync(`${tmpdir()}/bridge-config-`);
    const configPath = join(configDir, 'config.json');
    const { app } = createDaemonServer({
      db,
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
    expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-bot-token',
        accountId: 'wx-account-1',
      },
    });

    await app.close();
  });

  it('repairs legacy Claude native resume title metadata for a bridge session', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-admin-home-`);
    const db = new Database(':memory:');
    db.exec(schemaSql);
    try {
      const user = new UserRepository(db).createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: '/tmp/project',
      });
      const projectDir = join(process.env.HOME, '.claude', 'projects', '-tmp-project');
      mkdirSync(projectDir, { recursive: true });
      const sessionPath = join(projectDir, 'legacy-session-1.jsonl');
      writeFileSync(sessionPath, [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'legacy' }] } }),
        JSON.stringify({ type: 'result', session_id: 'legacy-session-1' }),
      ].join('\n'));

      new RuntimeSessionRepository(db).createWithId({
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
      });

      const app = createDaemonServer({
        db,
        channel: new MockChannelAdapter(),
        providers: [new ClaudeCodeProvider({ runner: new FakeClaudeRunner() })],
      }).app;
      const repair = await app.inject({ method: 'POST', url: '/api/channel/sessions/bs_legacy/repair-native-resume' });
      expect(repair.statusCode).toBe(200);
      expect(repair.json()).toEqual({ ok: true, repaired: true });
      const content = readFileSync(sessionPath, 'utf8');
      expect(content).toContain('"type":"custom-title"');
      expect(content).toContain('"type":"agent-name"');
      const listed = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
      expect(listed.json()).toEqual([
        expect.objectContaining({
          id: 'bs_legacy',
          providerResumeTitleSynced: true,
          providerResumeRepairable: true,
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('repairs all repairable attached Claude bridge sessions in one batch request', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-admin-home-`);
    const db = new Database(':memory:');
    db.exec(schemaSql);
    try {
      const user = new UserRepository(db).createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: '/tmp/project',
      });
      const runtimeSessions = new RuntimeSessionRepository(db);
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

      runtimeSessions.createWithId({
        id: 'bs_batch_1',
        chatId: 'chat-batch-1',
        ownerUserId: user.id,
        providerId: 'claude-code',
        providerSessionId: 'attached-batch-1',
        recoverySource: 'runtime',
        resumeTitle: repairableTitle,
        cwd: '/tmp/project',
        status: 'idle',
        createdAt: 1,
        lastActivityAt: 1,
      });
      runtimeSessions.createWithId({
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
      });

      const app = createDaemonServer({
        db,
        channel: new MockChannelAdapter(),
        providers: [new ClaudeCodeProvider({ runner: new FakeClaudeRunner() })],
      }).app;

      const repair = await app.inject({ method: 'POST', url: '/api/channel/sessions/repair-native-resume' });
      expect(repair.statusCode).toBe(200);
      expect(repair.json()).toEqual(expect.objectContaining({
        ok: true,
        checkedCount: 2,
      }));
      expect([0, 1]).toContain(repair.json().repairedCount);

      const repairedContent = readFileSync(join(projectDir, 'attached-batch-1.jsonl'), 'utf8');
      expect(repairedContent).toContain('"type":"custom-title"');
      expect(repairedContent).toContain(repairableTitle);

      const syncedContent = readFileSync(join(projectDir, 'attached-batch-2.jsonl'), 'utf8');
      expect((syncedContent.match(/"type":"custom-title"/g) ?? []).length).toBe(1);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('applies updated default provider and workspace to new WeChat sessions', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const channel = new MockChannelAdapter();
    const { app, users, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code'), new FakeProviderAdapter('codex')],
    });
    users.createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/original',
    });

    const update = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/codex-project',
        permissionTimeoutMs: 60_000,
        wechatAutoAuthorize: true,
        wechatThrottle: { minIntervalMs: 500, chunkSize: 1000 },
        highRiskCommandPolicy: 'per_request',
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
      cwd: '/tmp/codex-project',
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

  it('lists recoverable native provider sessions and attaches one into the bridge', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users } = createDaemonServer({ db, providers: [provider] });
    users.createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
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
        preferredResumeMode: 'title',
        providerResumeCommand: 'claude --resume claude-code_recoverable_1',
        providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdC1hdHRhY2hlZCJ9]',
        resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdC1hdHRhY2hlZCJ9]',
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

  it('repairs recoverable Claude native resume metadata before attaching', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const resumeTitle = buildSessionBridgeName({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        chatId: 'chat-recoverable',
      });
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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ db, providers: [provider] });

      const repair = await app.inject({
        method: 'POST',
        url: '/api/channel/providers/claude-code/recoverable-sessions/claude-repairable-session/repair-native-resume',
      });
      expect(repair.statusCode).toBe(200);
      expect(repair.json()).toEqual({ ok: true, repaired: true });

      const content = readFileSync(join(projectDir, 'claude-repairable-session.jsonl'), 'utf8');
      expect(content).toContain('"type":"custom-title"');
      expect(content).toContain('"type":"agent-name"');
      expect(content).toContain(resumeTitle);

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([
        expect.objectContaining({
          id: 'claude-repairable-session',
          providerResumeTitleSynced: true,
          providerResumeHistorySynced: true,
          providerResumeRepairable: true,
        }),
      ]);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('reports Claude history sync separately from session title sync', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const resumeTitle = buildSessionBridgeName({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        chatId: 'chat-history-missing',
      });
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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const user = new UserRepository(db).createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: '/tmp/project',
      });
      new RuntimeSessionRepository(db).createWithId({
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
      });

      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ db, providers: [provider] });

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

  it('repairs all repairable recoverable Claude sessions in one batch request', async () => {
    const previousHome = process.env.HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-claude-home-'));
    process.env.HOME = home;
    try {
      const projectDir = join(home, '.claude', 'projects', 'proj-recoverable-batch');
      mkdirSync(projectDir, { recursive: true });
      const repairableTitle = buildSessionBridgeName({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        chatId: 'chat-batch-1',
      });
      const alreadySyncedTitle = buildSessionBridgeName({
        platform: 'weixin',
        platformUserId: 'wx_user_2',
        chatId: 'chat-batch-2',
      });

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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ db, providers: [provider] });

      const repair = await app.inject({
        method: 'POST',
        url: '/api/channel/providers/claude-code/recoverable-sessions/repair-native-resume',
      });
      expect(repair.statusCode).toBe(200);
      expect(repair.json()).toEqual(expect.objectContaining({
        ok: true,
        checkedCount: 2,
      }));
      expect([0, 1]).toContain(repair.json().repairedCount);

      const repairedContent = readFileSync(join(projectDir, 'claude-batch-repair-1.jsonl'), 'utf8');
      expect(repairedContent).toContain('"type":"custom-title"');
      expect(repairedContent).toContain('"type":"agent-name"');
      expect(repairedContent).toContain(repairableTitle);

      const syncedContent = readFileSync(join(projectDir, 'claude-batch-repair-2.jsonl'), 'utf8');
      expect((syncedContent.match(/"type":"custom-title"/g) ?? []).length).toBe(1);
      expect((syncedContent.match(/"type":"agent-name"/g) ?? []).length).toBe(1);

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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const runner = new CodexCliRunner({ processRunner: async () => ({ code: 0, stdout: '', stderr: '' }) });
      const { app } = createDaemonServer({ db, providers: [new CodexProvider({ runner })] });

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/codex/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([
        expect.objectContaining({
          id: 'codex-session-1',
          providerId: 'codex',
          preferredResumeMode: 'title',
          title: '微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
          providerResumeCommand: 'codex exec resume --json --last codex-session-1',
          providerResumeByTitleCommand: 'codex exec resume --json --last 微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
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
            cwd: '/tmp/codex-project',
          },
        }),
      ].join('\n'), 'utf8');

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const runner = new CodexCliRunner({ processRunner: async () => ({ code: 0, stdout: '', stderr: '' }) });
      const { app, users } = createDaemonServer({ db, providers: [new CodexProvider({ runner })] });
      users.createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'codex',
        defaultCwd: '/tmp/codex-project',
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
          preferredResumeMode: 'title',
        },
      });

      const index = readFileSync(join(codexHome, 'session_index.jsonl'), 'utf8');
      expect(index).toContain('codex-session-1');
      expect(index).toContain('微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdC1jb2RleCJ9]');

      await app.close();
    } finally {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it('filters already attached native sessions out of recoverable results', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users } = createDaemonServer({ db, providers: [provider] });
    users.createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
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

  it('keeps archived provider sessions recoverable for later re-attach', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users } = createDaemonServer({ db, providers: [provider] });
    users.createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
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

    const attachedSessionId = (attach.json() as { session: { id: string } }).session.id;
    const archive = await app.inject({
      method: 'POST',
      url: `/api/channel/sessions/${attachedSessionId}/archive`,
    });
    expect(archive.statusCode).toBe(200);

    const recoverable = await app.inject({
      method: 'GET',
      url: '/api/channel/providers/claude-code/recoverable-sessions',
    });
    expect(recoverable.statusCode).toBe(200);
    expect(recoverable.json()).toEqual([
      expect.objectContaining({
        id: 'claude-code_recoverable_1',
        providerId: 'claude-code',
      }),
    ]);

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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new FakeProviderAdapter('claude-code');
      const { app, users } = createDaemonServer({ db, providers: [provider] });
      users.createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: '/tmp/project',
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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ db, providers: [provider] });

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([
        expect.objectContaining({
          id: 'claude-meta-session',
          title: '微信自动接管测试',
          cwd: '/tmp/real-project',
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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app, users } = createDaemonServer({ db, providers: [provider] });
      users.createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: '/tmp/project-sidecar',
      });

      const attach = await app.inject({
        method: 'POST',
        url: '/api/channel/sessions/attach',
        payload: {
          providerId: 'claude-code',
          providerSessionId: 'claude-sidecar-session',
          platformUserId: 'wx_user_1',
          chatId: 'chat-sidecar',
          cwd: '/tmp/project-sidecar',
        },
      });
      expect(attach.statusCode).toBe(200);

      const recoverable = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverable.statusCode).toBe(200);
      expect(recoverable.json()).toEqual([]);

      await app.inject({
        method: 'POST',
        url: `/api/channel/sessions/${(attach.json() as { session: { id: string } }).session.id}/archive`,
      });

      const recoverableAfterArchive = await app.inject({
        method: 'GET',
        url: '/api/channel/providers/claude-code/recoverable-sessions',
      });
      expect(recoverableAfterArchive.statusCode).toBe(200);
      expect(recoverableAfterArchive.json()).toEqual([
        expect.objectContaining({
          id: 'claude-sidecar-session',
          cwd: '/tmp/project-sidecar',
          bridgeTag: {
            platform: 'weixin',
            platformUserId: 'wx_user_1',
            chatId: 'chat-sidecar',
          },
        }),
      ]);

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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app } = createDaemonServer({ db, providers: [provider] });

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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app, users } = createDaemonServer({ db, providers: [provider] });
      users.createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: '/tmp/default-project',
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
          cwd: '/tmp/recovered-project',
          providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdC1hdHRhY2hlZCJ9]',
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

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const { app, users } = createDaemonServer({ db, providers: [provider] });
      users.createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: '/tmp/project-a',
      });

      const attach = await app.inject({
        method: 'POST',
        url: '/api/channel/sessions/auto-attach',
        payload: {
          providerId: 'claude-code',
          platformUserId: 'wx_user_1',
        },
      });
      expect(attach.statusCode).toBe(200);
      expect(attach.json()).toMatchObject({
        ok: true,
        session: {
          cwd: '/tmp/project-a',
          providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoid3hfdXNlcl8xIn0]',
        },
      });

      const sessions = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
      expect(sessions.json()).toEqual([
        expect.objectContaining({
          bindingMatched: false,
          bindingSource: 'heuristic',
          cwd: '/tmp/project-a',
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
          cwd: '/Users/liuyuhua',
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
        cwd: '/Users/liuyuhua',
        updatedAt: 200,
      }, null, 2), 'utf8');
      writeFileSync(join(home, '.codex', 'session_index.jsonl'), JSON.stringify({
        id: 'codex-cwd-mismatch',
        thread_name: '微信 · wx_user_1 · [claude-codex-wechat:codex-cwd-mismatch]',
        updated_at: '2026-06-14T02:00:00.000Z',
      }), 'utf8');

      const db = new Database(':memory:');
      db.exec(schemaSql);
      const provider = new CodexProvider({ runner: new CodexCliRunner() });
      const { app, users } = createDaemonServer({ db, providers: [provider] });
      users.createUser({
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        defaultProvider: 'codex',
        defaultCwd: '/Users/liuyuhua/github/claude-codex-wechat',
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

  it('syncs channel settings by clearing active runtime sessions', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const { app, users } = createDaemonServer({ db, channel, providers: [provider] });
    users.createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });
    const before = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(before.json()).toHaveLength(1);

    const sync = await app.inject({
      method: 'POST',
      url: '/api/channel/settings/sync',
      payload: { platform: 'weixin' },
    });

    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toEqual({ ok: true });

    const after = await app.inject({ method: 'GET', url: '/api/channel/sessions' });
    expect(after.json()).toEqual([
      expect.objectContaining({ status: 'closed', archivedAt: expect.any(Number) }),
    ]);
    await app.close();
  });
});
