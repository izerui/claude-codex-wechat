import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { createDaemonServer } from '../src/daemon/server';
import { ClaudeCodeProvider } from '../src/providers/claude-code/claudeProvider';
import { FakeClaudeRunner } from '../src/providers/claude-code/fakeClaudeRunner';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { CodexProvider } from '../src/providers/codex/codexProvider';
import { CodexAppServerClient } from '../src/providers/codex/codexAppServerClient';
import { ProviderBindingRepository } from '../src/storage/providerBindingRepository';
import { RuntimeSessionRepository } from '../src/storage/runtimeSessionRepository';
import { schemaSql } from '../src/storage/schema';
import { PRIMARY_WEIXIN_PLATFORM } from '../src/channels/platforms';
import type { NativeProviderAdapter, ProviderEvent, ProviderSession } from '../src/providers/types';
import type { ProviderSessionCandidate } from '../src/providers/types';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

function seededUsers(platformUserId = 'wx_user_1', input?: { defaultProvider?: 'claude-code' | 'codex'; defaultCwd?: string }) {
  const store = createRuntimeUserStore('bridge-message-flow-active-wechat-user-');
  seedRuntimeUserStore(store, {
    platform: PRIMARY_WEIXIN_PLATFORM,
    platformUserId,
    role: 'user',
  });
  return store.activeUserStore;
}

class NoScanAutoAttachProvider implements NativeProviderAdapter {
  readonly id = 'claude-code' as const;
  private readonly sessions = new Map<string, ProviderSession>();

  async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    const session: ProviderSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: this.id,
      providerSessionId: `claude-code_fresh_${input.bridgeSessionId}`,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    if (!this.sessions.has(input.bridgeSessionId)) throw new Error('fake_provider_session_not_found');
    yield { type: 'text_delta', text: `收到：${input.text}` };
    yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
  }

  async listRecoverableSessions(): Promise<ProviderSessionCandidate[]> {
    throw new Error('should_not_scan_recoverable_sessions');
  }

  async attachSession(): Promise<ProviderSession> {
    throw new Error('should_not_attach_without_binding');
  }
}

describe('channel message flow', () => {
  it('auto-authorizes unauthorized incoming user by default', async () => {
    const db = memoryDb();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions, activeUserStore } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore: createRuntimeUserStore('bridge-message-flow-auto-').activeUserStore,
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1', displayName: 'Alice' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    expect(activeUserStore.isActiveUser(PRIMARY_WEIXIN_PLATFORM, 'wx_user_1')).toMatchObject({
      platformUserId: 'wx_user_1',
    });
    expect(sessions.listSessions()).toHaveLength(1);
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
      { kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') },
    ]);
    await app.close();
  });

  it('accepts subsequent messages from an already active wechat user', async () => {
    const db = memoryDb();
    const store = createRuntimeUserStore('bridge-message-flow-existing-');
    const activeUserStore = store.activeUserStore;
    seedRuntimeUserStore(store, { platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user' });
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, permissions, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore: activeUserStore,
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
        providerSessionId: expect.stringContaining('claude-code_fake_'),
        recoverySource: 'runtime',
      }),
    ]);
    expect(permissions.getPendingRequests()).toEqual([
      expect.objectContaining({ id: 'pr_fake_1', bridgeSessionId: sessions.listSessions()[0].id }),
    ]);

    await channel.emitIncoming({
      id: 'm2',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run again' },
      timestamp: 2,
    });
    expect(permissions.getPendingRequests()).toHaveLength(2);
    await app.close();
  });

  it('starts a new session after restart when no persisted binding exists', async () => {
    const db = memoryDb();
    const store = createRuntimeUserStore('bridge-message-flow-restart-');
    const activeUserStore = store.activeUserStore;
    seedRuntimeUserStore(store, {
      platform: PRIMARY_WEIXIN_PLATFORM,
      platformUserId: 'wx_user_1',
      role: 'user',
    });
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new NoScanAutoAttachProvider()],
      activeUserStore: activeUserStore,
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-fresh',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello after restart' },
      timestamp: 1,
    });

    expect(sessions.getActiveSession('chat-fresh')).toMatchObject({
      providerId: 'claude-code',
      providerSessionId: expect.stringContaining('claude-code_fresh_'),
      recoverySource: 'runtime',
    });
    expect(new ProviderBindingRepository(db).findByChat(PRIMARY_WEIXIN_PLATFORM, 'chat-fresh', 'claude-code')).toMatchObject({
      chatId: 'chat-fresh',
      providerId: 'claude-code',
      providerSessionId: expect.stringContaining('claude-code_fresh_'),
    });
    expect(sent).toEqual([{ kind: 'text', text: '收到：hello after restart' }]);

    await app.close();
  });

  it('switches provider and reports status through incoming commands', async () => {
    const db = memoryDb();
    const store = createRuntimeUserStore('bridge-message-flow-switch-');
    const activeUserStore = store.activeUserStore;
    seedRuntimeUserStore(store, { platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user' });
    const channel = new MockChannelAdapter();
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code'), new FakeProviderAdapter('codex')],
      activeUserStore: activeUserStore,
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

  it('reloads the active provider session through an incoming command', async () => {
    const db = memoryDb();
    const activeUserStore = seededUsers();
    const channel = new MockChannelAdapter();
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));
    const provider = new FakeProviderAdapter('claude-code');
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [provider],
      activeUserStore: activeUserStore,
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-reload',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello reload' },
      timestamp: 1,
    });
    const active = sessions.getActiveSession('chat-reload');
    expect(active?.providerSessionId).toMatch(/^claude-code_fake_/);

    await channel.emitIncoming({
      id: 'm2',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-reload',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/reload' },
      timestamp: 2,
    });

    expect(provider.stoppedSessions).toEqual([active!.id]);
    expect(sessions.getActiveSession('chat-reload')?.id).toBe(active?.id);
    expect(sent.at(-1)).toContain(`Reloaded active claude-code session ${active?.id}`);

    await app.close();
  });

  it('writes a bridge-owned Codex thread name into session_index for a new chat session', async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHome = mkdtempSync(`${tmpdir()}/bridge-codex-home-`);
    process.env.CODEX_HOME = codexHome;
    try {
      const db = memoryDb();
      const activeUserStore = seededUsers('wx_user_1', { defaultProvider: 'codex' });
      const channel = new MockChannelAdapter();
      const notificationHandlers = new Map<string, (params: unknown) => void>();
      vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
      vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method: string, params?: unknown) => {
        if (method === 'thread/start') return { threadId: 'codex-session-1' };
        if (method === 'turn/start') {
          queueMicrotask(() => {
            notificationHandlers.get('item/agentMessage/delta')?.({ delta: 'Codex 收到：hello codex' });
            notificationHandlers.get('turn/completed')?.({ threadId: 'codex-session-1', turn: { id: 'turn-1' } });
          });
          return { turn: { id: 'turn-1' } };
        }
        if (method === 'thread/resume') return { threadId: (params as { threadId: string }).threadId };
        return {};
      });
      vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
      vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
        notificationHandlers.set(method, handler);
        return () => {
          notificationHandlers.delete(method);
        };
      });
      vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
      vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

      const provider = new CodexProvider({
        runner: new CodexInteractiveRunner({ command: 'codex' }),
      });
      const { app, sessions } = createDaemonServer({
        db,
        channel,
        providers: [provider],
        activeUserStore: activeUserStore,
        bridgeDefaults: {
          defaultProvider: 'codex',
          defaultWorkspace: '/tmp/project',
        },
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
      expect(index).toContain('微信 · wx_user_1');

      await app.close();
    } finally {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it('auto-authorizes first-contact weixin users by default', async () => {
    const db = memoryDb();
    const activeUserStore = createRuntimeUserStore('bridge-message-flow-auto-weixin-').activeUserStore;
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore,
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-auto',
      user: { id: 'wx_user_auto', displayName: 'Auto User' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    expect(activeUserStore.isActiveUser(PRIMARY_WEIXIN_PLATFORM, 'wx_user_auto')).toMatchObject({
      platformUserId: 'wx_user_auto',
    });
    expect(sessions.listSessions()).toHaveLength(1);
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
      { kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') },
    ]);

    await app.close();
  });

  it('creates first-run WeChat Claude sessions with native resume metadata already synced', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-wechat-claude-home-`);
    const db = memoryDb();
    try {
      const sessionId = 'claude-native-wechat-1';
      const projectDir = join(process.env.HOME, '.claude', 'projects', '-tmp-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, `${sessionId}.jsonl`), [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }),
        JSON.stringify({ type: 'result', session_id: sessionId }),
      ].join('\n'));

      const channel = new MockChannelAdapter();
      const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
      const originalStartSession = provider.startSession.bind(provider);
      vi.spyOn(provider, 'startSession').mockImplementation(async (input) => {
        const started = await originalStartSession(input);
        return {
          ...started,
          providerSessionId: sessionId,
        };
      });

      const { app } = createDaemonServer({
        db,
        channel,
        providers: [provider],
      });

      await channel.emitIncoming({
        id: 'm1',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-native',
        user: { id: 'wx_user_native', displayName: 'Native User' },
        content: { type: 'text', text: '帮我恢复微信凭据并继续验证' },
        timestamp: 1,
      });

      const content = readFileSync(join(projectDir, `${sessionId}.jsonl`), 'utf8');
      expect(content).toContain('"type":"custom-title"');
      expect(content).toContain('"type":"agent-name"');
      expect(content).toContain('微信 · wx_user_native');

      const history = readFileSync(join(process.env.HOME, '.claude', 'history.jsonl'), 'utf8');
      expect(history).toContain('"display":"帮我恢复微信凭据并继续验证 · 微信 · wx_user_native"');
      expect(history).toContain(`"project":"${process.cwd()}"`);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('starts a fresh provider session on the first authorized message when no binding exists', async () => {
    const db = memoryDb();
    const activeUserStore = seededUsers();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore: activeUserStore,
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
      providerSessionId: expect.stringContaining('claude-code_fake_'),
      recoverySource: 'runtime',
    });
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
      { kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') },
    ]);

    await app.close();
  });

  it('prefers the persisted provider binding over generic recoverable matching', async () => {
    const db = memoryDb();
    const activeUserStore = seededUsers();
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
      activeUserStore: activeUserStore,
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

  it('re-attaches the persisted provider binding on the first authorized message after restart', async () => {
    const db = memoryDb();
    const activeUserStore = seededUsers();
    new ProviderBindingRepository(db).upsert({
      platform: PRIMARY_WEIXIN_PLATFORM,
      platformUserId: 'wx_user_1',
      chatId: 'chat-restart-bound',
      providerId: 'claude-code',
      providerSessionId: 'claude-session-bound',
      cwd: '/tmp/project',
    });

    const channel = new MockChannelAdapter();
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore: activeUserStore,
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-restart-bound',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'resume bound session' },
      timestamp: 1,
    });

    expect(sessions.getActiveSession('chat-restart-bound')).toMatchObject({
      providerSessionId: 'claude-session-bound',
      recoverySource: 'binding_table',
    });

    await app.close();
  });
});
