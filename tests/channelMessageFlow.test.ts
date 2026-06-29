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
import { LastProviderSessionStore } from '../src/storage/lastProviderSessionStore';
import { PRIMARY_WEIXIN_PLATFORM } from '../src/channels/platforms';
import type { NativeProviderAdapter, ProviderEvent, ProviderSession } from '../src/providers/types';
import type { ProviderSessionCandidate } from '../src/providers/types';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';
import type { TunnelStatusView } from '../src/runtime/tunnelProvider';

function seededUsers(platformUserId = 'wx_user_1') {
  const store = createRuntimeUserStore('bridge-message-flow-active-wechat-user-');
  seedRuntimeUserStore(store, {
    platform: PRIMARY_WEIXIN_PLATFORM,
    platformUserId,
    role: 'user',
  });
  return { activeUserStore: store.activeUserStore, configPath: store.configPath };
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
  it('includes the public relay URL in /help replies when relay is running', async () => {
    const { activeUserStore, configPath } = seededUsers('wx_user_1');
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const runningStatus: TunnelStatusView = {
      installed: true,
      running: true,
      status: 'running',
      publicUrl: 'https://relay.style520.com/session-001',
    };
    const relayProvider = {
      getStatus: vi.fn(async () => runningStatus),
      start: vi.fn(async () => runningStatus),
      stop: vi.fn(async () => ({ ...runningStatus, running: false, status: 'stopped' as const })),
    };
    const { app } = createDaemonServer({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore,
      configPath,
      tunnelProvider: relayProvider,
      bridgeDefaults: {
        defaultProvider: 'claude-code',
        defaultWorkspace: process.cwd(),
        tunnel: {
          enabled: true,
          relay: {
            serverUrl: 'wss://relay.style520.com/agent',
            authToken: 'clrt_1234567890abcdef12345678',
          },
        },
      },
    });

    await channel.emitIncoming({
      id: 'm-help',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-help',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/help' },
      timestamp: 1,
    });

    expect(sent.at(-1)?.text).toContain('[https://relay.style520.com/session-001](https://relay.style520.com/session-001)');
    await app.close();
  });

  it('auto-authorizes unauthorized incoming user by default', async () => {
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions, activeUserStore } = createDaemonServer({
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
    ]);
    await app.close();
  });

  it('accepts subsequent messages from an already active wechat user', async () => {
    const store = createRuntimeUserStore('bridge-message-flow-existing-');
    const activeUserStore = store.activeUserStore;
    seedRuntimeUserStore(store, { platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user' });
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions } = createDaemonServer({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore: activeUserStore,
      configPath: store.configPath,
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
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
    ]);
    expect(JSON.parse(readFileSync(store.configPath, 'utf8'))).toMatchObject({
      bridge: {
        activeWeChatUser: {
          platformUserId: 'wx_user_1',
          currentConversation: {
            chatId: 'chat-a',
            providerId: 'claude-code',
            providerSessionId: expect.stringContaining('claude-code_fake_'),
            recoverySource: 'runtime',
          },
        },
      },
    });
    await channel.emitIncoming({
      id: 'm2',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run again' },
      timestamp: 2,
    });
    await app.close();
  });

  it('starts a new session after restart when no persisted binding exists', async () => {
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
      channel,
      providers: [new NoScanAutoAttachProvider()],
      activeUserStore: activeUserStore,
      configPath: store.configPath,
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
    expect(new LastProviderSessionStore(store.configPath).get('claude-code')).toMatchObject({
      providerSessionId: expect.stringContaining('claude-code_fresh_'),
      cwd: process.cwd(),
    });
    expect(sent).toEqual([{ kind: 'text', text: '收到：hello after restart' }]);

    await app.close();
  });

  it('switches provider and reports status through incoming commands', async () => {
    const store = createRuntimeUserStore('bridge-message-flow-switch-');
    const activeUserStore = store.activeUserStore;
    seedRuntimeUserStore(store, { platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user' });
    const channel = new MockChannelAdapter();
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));
    const { app, sessions } = createDaemonServer({
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

  it('writes a bridge-owned Codex thread name into session_index for a new chat session', async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHome = mkdtempSync(`${tmpdir()}/bridge-codex-home-`);
    process.env.CODEX_HOME = codexHome;
    try {
      const { activeUserStore, configPath } = seededUsers('wx_user_1');
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
        channel,
        providers: [provider],
        activeUserStore: activeUserStore,
        configPath,
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
      expect(index).toContain('hello codex');

      await app.close();
    } finally {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it('re-writes the Codex session_index entry during final metadata persistence', async () => {
    const previousCodexHome = process.env.CODEX_HOME;
    const codexHome = mkdtempSync(`${tmpdir()}/bridge-codex-home-`);
    process.env.CODEX_HOME = codexHome;
    try {
      const { activeUserStore, configPath } = seededUsers('wx_user_1');
      const channel = new MockChannelAdapter();
      const notificationHandlers = new Map<string, (params: unknown) => void>();
      vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
      vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method: string, params?: unknown) => {
        if (method === 'thread/start') return { threadId: 'codex-session-final-persist' };
        if (method === 'turn/start') {
          queueMicrotask(() => {
            notificationHandlers.get('item/agentMessage/delta')?.({ delta: 'Codex 收到：hello codex' });
            notificationHandlers.get('turn/completed')?.({ threadId: 'codex-session-final-persist', turn: { id: 'turn-final' } });
          });
          return { turn: { id: 'turn-final' } };
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
        runner: new CodexInteractiveRunner({
          command: 'codex',
          syncThreadForResume: vi.fn(async () => {
            const indexPath = `${codexHome}/session_index.jsonl`;
            writeFileSync(indexPath, '', 'utf8');
            return true;
          }),
        }),
      });
      const { app } = createDaemonServer({
        channel,
        providers: [provider],
        activeUserStore,
        configPath,
        bridgeDefaults: {
          defaultProvider: 'codex',
          defaultWorkspace: '/tmp/project',
        },
      });

      await channel.emitIncoming({
        id: 'm-final',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-codex-final',
        user: { id: 'wx_user_1' },
        content: { type: 'text', text: 'hello codex' },
        timestamp: 1,
      });

      const index = readFileSync(`${codexHome}/session_index.jsonl`, 'utf8');
      expect(index).toContain('codex-session-final-persist');
      expect(index).toContain('hello codex');

      await app.close();
    } finally {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  it('sends one WeChat message per Codex agent message within a single turn', async () => {
    const { activeUserStore, configPath } = seededUsers('wx_user_1');
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method: string, params?: unknown) => {
      if (method === 'thread/start') return { threadId: 'codex-session-split' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-1', delta: '我先检查 ' });
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-1', delta: 'relay 是否可用。' });
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-2', delta: '已经代理出去，地址如下。' });
          notificationHandlers.get('turn/completed')?.({ threadId: 'codex-session-split', turn: { id: 'turn-split' } });
        });
        return { turn: { id: 'turn-split' } };
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
      runner: new CodexInteractiveRunner({
        command: 'codex',
        syncThreadForResume: vi.fn(async () => true),
      }),
    });
    const { app } = createDaemonServer({
      channel,
      providers: [provider],
      activeUserStore,
      configPath,
      bridgeDefaults: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/project',
      },
    });

    await channel.emitIncoming({
      id: 'm-split',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-codex-split',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '代理出去这个端口' },
      timestamp: 1,
    });

    expect(sent).toEqual([
      { kind: 'text', text: '我先检查 relay 是否可用。' },
      { kind: 'text', text: '已经代理出去，地址如下。' },
    ]);

    await app.close();
  });

  it('auto-authorizes first-contact weixin users by default', async () => {
    const activeUserStore = createRuntimeUserStore('bridge-message-flow-auto-weixin-').activeUserStore;
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions } = createDaemonServer({
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
    ]);

    await app.close();
  });

  it('creates first-run WeChat Claude sessions with native resume metadata already synced', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-wechat-claude-home-`);
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
        channel,
        providers: [provider],
        bridgeDefaults: {
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
        },
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
      expect(content).toContain('帮我恢复微信凭据并继续验证');

      const history = readFileSync(join(process.env.HOME, '.claude', 'history.jsonl'), 'utf8');
      expect(history).toContain('"display":"帮我恢复微信凭据并继续验证"');
      expect(history).toContain(`"project":"/tmp/project"`);

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('normalizes a Claude session that is only written mid-turn so claude -r lists it', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-wechat-claude-race-`);
    try {
      const sessionId = 'claude-mid-turn-1';
      const projectDir = join(process.env.HOME, '.claude', 'projects', '-tmp-project');
      mkdirSync(projectDir, { recursive: true });

      // The Claude CLI writes the session .jsonl *during* the turn, after the
      // bridge has already persisted once on session start. Its records carry the
      // sdk-cli entrypoint, which claude -r hides until normalized to cli. A short
      // one-shot turn must still end up normalized.
      class MidTurnWritingRunner extends FakeClaudeRunner {
        async *sendMessage(input: { bridgeSessionId: string; text: string }) {
          writeFileSync(join(projectDir, `${sessionId}.jsonl`), [
            JSON.stringify({ type: 'user', entrypoint: 'sdk-cli', sessionId, cwd: '/tmp/project', message: { role: 'user', content: input.text } }),
            JSON.stringify({ type: 'assistant', entrypoint: 'sdk-cli', sessionId, message: { content: [{ type: 'text', text: 'ok' }] } }),
            JSON.stringify({ type: 'result', entrypoint: 'sdk-cli', session_id: sessionId }),
          ].join('\n') + '\n');
          yield { type: 'text_delta', text: 'ok' } as const;
          yield { type: 'message_done' } as const;
        }
      }

      const channel = new MockChannelAdapter();
      const provider = new ClaudeCodeProvider({ runner: new MidTurnWritingRunner() });
      const originalStartSession = provider.startSession.bind(provider);
      vi.spyOn(provider, 'startSession').mockImplementation(async (input) => ({
        ...(await originalStartSession(input)),
        providerSessionId: sessionId,
      }));

      const { app } = createDaemonServer({
        channel,
        providers: [provider],
        bridgeDefaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
      });

      await channel.emitIncoming({
        id: 'm1',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-race',
        user: { id: 'wx_user_race', displayName: 'Race User' },
        content: { type: 'text', text: '分析项目' },
        timestamp: 1,
      });

      const content = readFileSync(join(projectDir, `${sessionId}.jsonl`), 'utf8');
      expect(content).toContain('"entrypoint":"cli"');
      expect(content).not.toContain('"entrypoint":"sdk-cli"');
      expect(content).toContain('"type":"permission-mode"');

      await app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('starts a fresh provider session on the first authorized message when no binding exists', async () => {
    const { activeUserStore, configPath } = seededUsers();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const { app, sessions } = createDaemonServer({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore: activeUserStore,
      configPath,
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
    ]);

    await app.close();
  });

  it('prefers the persisted provider binding over generic recoverable matching', async () => {
    const store = createRuntimeUserStore('bridge-message-flow-bound-');
    seedRuntimeUserStore(store, { platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user' });
    const activeUserStore = store.activeUserStore;
    new LastProviderSessionStore(store.configPath).set('claude-code', {
      providerSessionId: 'claude-code_recoverable_1',
      cwd: '/tmp/project',
    });

    const channel = new MockChannelAdapter();
    const { app, sessions } = createDaemonServer({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore: activeUserStore,
      configPath: store.configPath,
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
      providerSessionId: 'claude-code_recoverable_1',
    });
    expect(JSON.parse(readFileSync(store.configPath, 'utf8'))).toMatchObject({
      bridge: {
        activeWeChatUser: {
          platformUserId: 'wx_user_1',
          currentConversation: {
            chatId: 'chat-bound',
            providerSessionId: 'claude-code_recoverable_1',
          },
        },
      },
    });

    await app.close();
  });

  it('re-attaches the persisted provider binding on the first authorized message after restart', async () => {
    const store = createRuntimeUserStore('bridge-message-flow-restart-bound-');
    seedRuntimeUserStore(store, { platform: PRIMARY_WEIXIN_PLATFORM, platformUserId: 'wx_user_1', role: 'user' });
    const activeUserStore = store.activeUserStore;
    new LastProviderSessionStore(store.configPath).set('claude-code', {
      providerSessionId: 'claude-code_recoverable_1',
      cwd: '/tmp/project',
    });

    const channel = new MockChannelAdapter();
    const { app, sessions } = createDaemonServer({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      activeUserStore: activeUserStore,
      configPath: store.configPath,
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
      providerSessionId: 'claude-code_recoverable_1',
      recoverySource: 'binding_table',
    });

    await app.close();
  });
});
