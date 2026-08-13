/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';
import { resetBridgeEventsForTests } from '../../src/web/bridgeEventsSocket';
import { resolveApiBaseUrlForTest } from '../../src/web/apiClient';
import type { ActiveWeChatUserView, BridgeSessionView } from '../../src/web/apiClient';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data ?? {});
    const event = { data: payload } as MessageEvent;
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
}

function setupBrowserMocks() {
  const { fetchImpl } = createFetchStub();
  vi.stubGlobal('fetch', fetchImpl as typeof fetch);
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
}

async function flushPromises() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * @param options.pluginConnected 微信通道是否已连接。默认 true——面板的多数交互都有
 * isPluginConnected 守卫，未连接时根本不会发起请求。只有扫码登录这类「从未连接开始」
 * 的流程才需要显式传 false。
 */
function createFetchStub(options: { pluginConnected?: boolean } = {}) {
  const pluginConnected = options.pluginConnected ?? true;
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  let bridgeController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const encoder = new TextEncoder();
  const emitBridgeEvent = (payload: unknown) => {
    bridgeController?.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };
  const state: {
    sessions: BridgeSessionView[];
    activeUser: ActiveWeChatUserView | null;
    quota: { remaining: number; sentCount: number; limit: number; expired: boolean; windowEndsAt: number } | null;
    tunnel: {
      installed: boolean;
      running: boolean;
      status: 'not_installed' | 'stopped' | 'starting' | 'running' | 'error';
      publicUrl?: string;
      error?: string;
    };
  } = {
    sessions: [
      {
        id: 'bs_1',
        chatId: 'chat-a',
        ownerUserId: 'user-a',
        providerId: 'claude-code',
        providerSessionId: 'claude-session-1',
        resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
        providerResumeTitleSynced: false,
        providerResumeRepairable: false,
        preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
        providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
        cwd: '/tmp/project',
        status: 'idle',
        createdAt: 1,
        lastActivityAt: 2,
      },
    ],
    activeUser:
      {
        id: 'user_1',
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        role: 'user',
        createdAt: 1,
      },
    quota: {
      remaining: 7,
      sentCount: 3,
      limit: 10,
      expired: false,
      windowEndsAt: Date.now() + 18 * 60 * 60 * 1000 + 60_000,
    },
    tunnel: {
      installed: true,
      running: true,
      status: 'running',
      publicUrl: 'https://relay.style520.com/session-001',
    },
  };

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });

    if (url.endsWith('/api/status')) {
      return new Response(JSON.stringify({ ok: true, sessions: state.sessions, permissions: [], preferredLocalUrl: 'http://192.168.1.25:8787' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/state')) {
      return new Response(JSON.stringify({
        activeUser: state.activeUser,
        plugin: {
          id: 'weixin',
          type: 'weixin',
          name: 'WeChat channel',
          enabled: pluginConnected,
          connected: pluginConnected,
          status: pluginConnected ? 'connected' : 'disabled',
          activeUsers: state.activeUser ? 1 : 0,
          hasToken: pluginConnected,
        },
        settings: {
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
          tunnel: {
            relay: {
              serverUrl: 'wss://relay.style520.com/agent',
              authToken: 'clrt_1234567890abcdef12345678',
            },
          },
        },
        runtimeConfig: {
          enabled: true,
          baseUrl: 'https://ilinkai.weixin.qq.com',
          token: 'wx-bot-token',
          accountId: 'wx-account-1',
        },
        lastProviderSessions: {
          'claude-code': {
            providerSessionId: 'claude-session-1',
            cwd: '/tmp/project',
            updatedAt: 2,
          },
          codex: {
            providerSessionId: 'codex-session-1',
            cwd: '/tmp/project',
            updatedAt: 3,
          },
        },
        quota: state.quota,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/providers/status')) {
      return new Response(JSON.stringify({ claude: { detected: true, version: '2.0.1' }, codex: { detected: false, reason: 'missing_binary' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/active-user')) {
      return new Response(JSON.stringify(state.activeUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/plugins')) {
      return new Response(JSON.stringify([
        {
          id: 'weixin',
          type: 'weixin',
          name: 'WeChat channel',
          enabled: false,
          connected: false,
          status: 'disabled',
          activeUsers: state.activeUser ? 1 : 0,
          hasToken: false,
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/wechat/runtime-config')) {
      return new Response(JSON.stringify({
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-bot-token',
        accountId: 'wx-account-1',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/weixin/login')) {
      return new Response(null, { status: 200 });
    }
    if (url.endsWith('/api/channel/current-session')) {
      return new Response(JSON.stringify(state.sessions[0] ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/sessions')) {
      return new Response(JSON.stringify(state.sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/settings')) {
      return new Response(JSON.stringify({
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
        tunnel: {
          relay: {
            serverUrl: 'wss://relay.style520.com/agent',
            authToken: 'clrt_1234567890abcdef12345678',
          },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/tunnel/status')) {
      return new Response(JSON.stringify(state.tunnel), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/settings/sync') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/plugins/enable') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/plugins/disable') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/channel/providers/claude-code/recoverable-sessions')) {
      const cursor = new URL(url, 'http://localhost').searchParams.get('cursor');
      if (cursor === 'claude-session-1') {
        return new Response(JSON.stringify({
          items: [
            {
              id: 'claude-session-2',
              providerId: 'claude-code',
              title: 'claude-session-2.jsonl',
              cwd: '/tmp/project-2',
              resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test-2]',
              providerResumeTitleSynced: true,
              providerResumeRepairable: false,
              preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test-2]',
              providerResumeCommand: 'claude --resume claude-session-2',
              providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test-2]',
            },
          ],
          nextCursor: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        items: [
          {
            id: 'claude-session-1',
            providerId: 'claude-code',
            title: 'claude-session-1.jsonl',
            cwd: '/tmp/project',
            resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
            providerResumeTitleSynced: true,
            providerResumeRepairable: false,
            preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
            providerResumeCommand: 'claude --resume claude-session-1',
            providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          },
        ],
        nextCursor: 'claude-session-1',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/channel/providers/codex/recoverable-sessions')) {
      return new Response(JSON.stringify({
        items: [
          {
            id: 'codex-session-1',
            providerId: 'codex',
            title: 'codex-session-1',
            resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
            preferredResumeCommand: 'codex resume 微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
            providerResumeCommand: 'codex resume codex-session-1',
            providerResumeByTitleCommand: 'codex resume 微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
          },
        ],
        nextCursor: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/providers/claude-code/recoverable-sessions/claude-session-1/repair-native-resume') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true, repaired: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/providers/claude-code/recoverable-sessions/repair-native-resume') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true, repairedCount: 1, checkedCount: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/sessions/repair-native-resume') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true, repairedCount: 1, checkedCount: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/sessions/attach') && method === 'POST') {
      return new Response(JSON.stringify({
        ok: true,
        session: {
          id: 'bs_attached_1',
          chatId: 'wx_user_1',
          ownerUserId: 'user_1',
          providerId: 'claude-code',
          providerSessionId: 'claude-session-1',
          preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          providerResumeCommand: 'claude --resume claude-session-1',
          providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
          cwd: '/tmp/project',
          status: 'idle',
          createdAt: 3,
          lastActivityAt: 4,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/current-session/attach') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/sessions/new') && method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/sessions/auto-attach') && method === 'POST') {
      return new Response(JSON.stringify({
        ok: true,
        session: {
          id: 'bs_auto_1',
          chatId: 'wx_user_1',
          ownerUserId: 'user_1',
          providerId: 'claude-code',
          providerSessionId: 'claude-session-auto',
          preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          providerResumeCommand: 'claude --resume claude-session-auto',
          providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
          cwd: '/tmp/project',
          status: 'idle',
          createdAt: 5,
          lastActivityAt: 6,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/current-session/stop') && method === 'POST') {
      state.sessions = [];
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/sessions/bs_1/stop') && method === 'POST') {
      state.sessions = [];
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/sessions/bs_1/repair-native-resume') && method === 'POST') {
      state.sessions = [{
        ...state.sessions[0],
        resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
        providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
        preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
      }];
      return new Response(JSON.stringify({ ok: true, repaired: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/bridge-events')) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          bridgeController = controller;
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    throw new Error(`Unhandled fetch: ${method} ${url}`);
  });

  return { fetchImpl, calls, emitBridgeEvent };
}

afterEach(async () => {
  // Unmount components so the shared bridge-events subscription releases its
  // listener, then forcibly reset the shared singleton so the next test gets
  // a fresh stream connection instead of a stale, aborted one.
  cleanup();
  resetBridgeEventsForTests();
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe('App admin interactions', () => {
  it('shows the relay public URL from the dashboard without a manual toggle button', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    expect(await screen.findByText('https://relay.style520.com/session-001')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '开启公网' })).toBeNull();
    expect(screen.queryByRole('button', { name: '关闭公网' })).toBeNull();
  });

  it('treats relay as the default public tunnel provider in dashboard state', async () => {
    const relayFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/settings')) {
        return new Response(JSON.stringify({
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
          tunnel: {
            enabled: false,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/tunnel/status')) {
        return new Response(JSON.stringify({
          installed: false,
          enabled: false,
          running: false,
          status: 'error',
          error: 'relay_not_configured',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await createFetchStub().fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', relayFetch as typeof fetch);

    render(<App />);

    expect(await screen.findByText('未配置 Relay Server')).toBeTruthy();
    expect(screen.queryByText('未配置 Relay Server')).toBeTruthy();
  });

  it('does not show editable relay settings controls in the help panel', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findByRole('heading', { name: '微信远程控制台' });
    expect(screen.queryByPlaceholderText('wss://relay.style520.com/agent')).toBeNull();
    expect(screen.queryByPlaceholderText('Relay Auth Token')).toBeNull();
    expect(screen.queryByRole('button', { name: '保存 Relay 设置' })).toBeNull();
  });

  it('does not show the relay client instance id field in the help panel', async () => {
    const customFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/channel/state')) {
        return new Response(JSON.stringify({
          activeUser: null,
          plugin: {
            id: 'weixin',
            type: 'weixin-direct',
            name: '微信',
            enabled: false,
            connected: false,
            status: 'disabled',
            activeUsers: 0,
            hasToken: false,
          },
          settings: {
            defaultProvider: 'claude-code',
            defaultWorkspace: '/tmp/project',
            tunnel: {
              enabled: false,
              relay: {
                serverUrl: 'wss://relay.style520.com/agent',
                authToken: 'clrt_1234567890abcdef12345678',
              },
            },
          },
          runtimeConfig: null,
          lastProviderSessions: {},
          quota: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await createFetchStub().fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', customFetch as typeof fetch);

    render(<App />);

    await screen.findByRole('heading', { name: '微信远程控制台' });
    expect(screen.queryByDisplayValue('relay-client-demo')).toBeNull();
    expect(screen.queryByRole('button', { name: '复制实例 ID' })).toBeNull();
  });

  it('keeps relay token path prefix for runtime api urls and login event stream', async () => {
    expect(resolveApiBaseUrlForTest(
      {},
      {
        origin: 'http://127.0.0.1:8788',
        pathname: '/f300f2a605ed/src/web/main.tsx',
      },
    )).toBe('http://127.0.0.1:8788/f300f2a605ed');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        origin: 'http://127.0.0.1:8788',
        pathname: '/f300f2a605ed',
      },
    });

    const fetchCalls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.endsWith('/api/status')) {
        return new Response(JSON.stringify({ ok: true, sessions: [], permissions: [], preferredLocalUrl: 'http://192.168.1.25:8787' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/state')) {
        return new Response(JSON.stringify({
          activeUser: null,
          plugin: {
            id: 'weixin',
            type: 'weixin',
            name: 'WeChat channel',
            enabled: false,
            connected: false,
            status: 'disabled',
            activeUsers: 0,
            hasToken: false,
          },
          settings: {
            defaultProvider: 'claude-code',
            defaultWorkspace: '/tmp/project',
            tunnel: {
              relay: {
                serverUrl: 'wss://relay.style520.com/agent',
                authToken: 'clrt_1234567890abcdef12345678',
              },
            },
          },
          runtimeConfig: {
            enabled: true,
            baseUrl: 'https://ilinkai.weixin.qq.com',
            token: 'wx-bot-token',
            accountId: 'wx-account-1',
          },
          quota: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/providers/status')) {
        return new Response(JSON.stringify({ claude: { detected: true }, codex: { detected: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/settings')) {
        return new Response(JSON.stringify({
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
          tunnel: {
            enabled: false,
            relay: {
              serverUrl: 'wss://relay.style520.com/agent',
              authToken: 'clrt_1234567890abcdef12345678',
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/tunnel/status')) {
        return new Response(JSON.stringify({
          installed: false,
          enabled: false,
          running: false,
          status: 'error',
          error: 'relay_not_configured',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/active-user')) {
        return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/current-session')) {
        return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/sessions')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/plugins')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/wechat/runtime-config')) {
        return new Response(JSON.stringify({
          enabled: true,
          baseUrl: 'https://ilinkai.weixin.qq.com',
          token: 'wx-bot-token',
          accountId: 'wx-account-1',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/weixin/login')) {
        return new Response(null, { status: 200 });
      }
      if (url.endsWith('/api/bridge-events') && init?.method === 'POST') {
        return new Response(new ReadableStream(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);

    render(<App />);

    await screen.findByRole('heading', { name: '微信远程控制台' });
    expect(fetchCalls.some((url) => url.startsWith('http://127.0.0.1:8788/f300f2a605ed/api/status'))).toBe(true);
    expect(fetchCalls.some((url) => url.startsWith('http://127.0.0.1:8788/f300f2a605ed/api/channel/state'))).toBe(true);
  });

  it('does not show an extra relay action button in the help panel', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findByRole('heading', { name: '微信远程控制台' });
    expect(screen.queryByRole('button', { name: '导入' })).toBeNull();
  });

  it('uses relay public status when relay is the selected tunnel provider', async () => {
    const { fetchImpl } = createFetchStub();
    const relayFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/settings')) {
        return new Response(JSON.stringify({
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
          tunnel: {
            enabled: true,
            relay: {
              serverUrl: 'wss://relay.style520.com/agent',
              authToken: 'clrt_1234567890abcdef12345678',
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/tunnel/status')) {
        return new Response(JSON.stringify({
          installed: true,
          enabled: true,
          running: true,
          status: 'running',
          publicUrl: 'https://style520.com/sjdfh2xxx',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', relayFetch as typeof fetch);

    render(<App />);

    const relayLink = await screen.findByRole('link', { name: 'https://style520.com/sjdfh2xxx' });
    expect(relayLink.getAttribute('href')).toBe('https://style520.com/sjdfh2xxx');
  });

  it('copies the resume-by-id command from a recoverable session card', async () => {
    const { fetchImpl } = createFetchStub();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);

    const copyButtons = await screen.findAllByRole('button', { name: '复制恢复命令' });
    fireEvent.click(copyButtons.at(-1)!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("cd '/tmp/project' && claude --resume claude-session-1");
    });
  });

  it('builds a Windows-friendly runnable resume command when cwd is a Windows path', async () => {
    const writeText = vi.fn(async () => undefined);
    const windowsFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/status')) {
        return new Response(JSON.stringify({ ok: true, sessions: [], permissions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/providers/status')) {
        return new Response(JSON.stringify({ claude: { detected: true }, codex: { detected: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/active-user')) {
        return new Response(JSON.stringify({
          id: 'user_1',
          platform: 'weixin',
          platformUserId: 'wx_user_1',
          role: 'user',
          createdAt: 1,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/plugins')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/state')) {
        return new Response(JSON.stringify({
          activeUser: {
            id: 'user_1',
            platform: 'weixin',
            platformUserId: 'wx_user_1',
            role: 'user',
            createdAt: 1,
          },
          plugin: {
            id: 'weixin',
            type: 'weixin',
            name: 'WeChat channel',
            // 未连接时面板不会去扫描可恢复会话，卡片和复制按钮都不会渲染。
            enabled: true,
            connected: true,
            status: 'connected',
            activeUsers: 1,
            hasToken: true,
          },
          settings: { defaultProvider: 'claude-code', defaultWorkspace: 'C:\\\\work\\\\repo' },
          runtimeConfig: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/channel/providers/claude-code/recoverable-sessions')) {
        return new Response(JSON.stringify([
          {
            id: 'claude-session-win',
            providerId: 'claude-code',
            title: 'claude-session-win.jsonl',
            cwd: 'C:\\work\\repo',
            providerResumeCommand: 'claude --resume claude-session-win',
          },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/current-session')) {
        return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/sessions')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/settings')) {
        return new Response(JSON.stringify({ defaultProvider: 'claude-code', defaultWorkspace: 'C:\\\\work\\\\repo' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unhandled fetch: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', windowsFetch as typeof fetch);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);

    const copyButtons = await screen.findAllByRole('button', { name: '复制恢复命令' });
    fireEvent.click(copyButtons.at(-1)!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('cd /d "C:\\work\\repo" && claude --resume claude-session-win');
    });
  });

  it('does not render stop, revoke or archive controls and never calls the stop endpoint', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findAllByText('微信通道');
    expect(screen.queryByText('停止')).toBeNull();
    expect(screen.queryByText('撤销授权')).toBeNull();
    expect(screen.queryByText('归档')).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/api/channel/current-session/stop') && call.method === 'POST')).toBe(false);
  });

  it('does not render pending pairing controls', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findAllByText('当前活跃用户');
    expect(screen.queryByText('待审批配对')).toBeNull();
    expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/api/channel/pairings'))).toBe(false);
  });

  it('shows the WeChat proactive-push quota and remaining window in the channel strip', async () => {
    setupBrowserMocks();
    render(<App />);

    await screen.findAllByText('当前活跃用户');
    expect((await screen.findAllByText('推送额度')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/剩 7\/10/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/窗口约 18h/)).length).toBeGreaterThan(0);
    await flushPromises();
  });

  it('switches to the Claude and Codex native session tabs and loads recoverable sessions', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const claudeTab = (await screen.findAllByRole('button', { name: 'Claude 会话' })).at(-1)!;
    fireEvent.click(claudeTab);
    expect(claudeTab.className).toContain('active');
    expect((await screen.findAllByText('wx_user_1')).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/channel/providers/claude-code/recoverable-sessions') && call.method === 'GET')).toBe(true);
    });
    expect((await screen.findAllByText('claude-session-1')).length).toBeGreaterThan(0);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Codex 会话' })).at(-1)!);
    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/channel/providers/codex/recoverable-sessions') && call.method === 'GET')).toBe(true);
    });
    expect((await screen.findAllByText('codex-session-1')).length).toBeGreaterThan(0);
  });

  it('leaves recoverable session titles intact when they are within the display limit', async () => {
    const { fetchImpl } = createFetchStub();
    const longTitle = 'claude 的会话 列表都对了， 但是codex 会话列表不对啊，无法显示 微信中最新的会话';
    const customFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/channel/providers/codex/recoverable-sessions')) {
        return new Response(JSON.stringify({
          items: [{
            id: 'codex-session-long',
            providerId: 'codex',
            title: longTitle,
            resumeTitle: longTitle,
            providerResumeCommand: 'codex resume codex-session-long',
            providerResumeByTitleCommand: `codex resume ${longTitle}`,
            preferredResumeCommand: `codex resume ${longTitle}`,
            cwd: '/tmp/project',
            lastActivityAt: 2,
          }],
          nextCursor: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', customFetch as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Codex 会话' })).at(-1)!);

    const title = await screen.findByTitle(longTitle);
    expect(title.textContent).toBe(longTitle);
    expect(await screen.findByText("按 ID 恢复：cd '/tmp/project' && codex resume codex-session-long")).toBeTruthy();
  });

  it('renders a simplified bridge sessions table without duplicate recovery columns', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findAllByText('当前活跃用户');
    expect((await screen.findAllByText('当前活跃用户')).length).toBeGreaterThan(0);
    expect(screen.queryByText('提供方会话')).toBeNull();
    expect(screen.queryByText('恢复模式')).toBeNull();
    expect(screen.queryByText('推荐恢复')).toBeNull();
    expect(screen.queryByText('按 ID 恢复')).toBeNull();
    expect(screen.queryByText('按标题恢复')).toBeNull();
    expect(screen.queryByText('绑定状态')).toBeNull();
    expect(screen.queryByText('绑定详情')).toBeNull();
    expect(screen.queryByText('原生状态')).toBeNull();
  });

  it('does not render bridge-session native resume repair controls', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const repairableBridgeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/status')) {
        return new Response(JSON.stringify({
          ok: true,
          sessions: [{
            id: 'bs_1',
            chatId: 'chat-a',
            ownerUserId: 'user-a',
            providerId: 'claude-code',
            providerSessionId: 'claude-session-1',
            resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
            providerResumeTitleSynced: false,
            providerResumeRepairable: true,
            preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
            providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
            cwd: '/tmp/project',
            status: 'idle',
            createdAt: 1,
            lastActivityAt: 2,
          }],
          permissions: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/sessions')) {
        return new Response(JSON.stringify([{
          id: 'bs_1',
          chatId: 'chat-a',
          ownerUserId: 'user-a',
          providerId: 'claude-code',
          providerSessionId: 'claude-session-1',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
          providerResumeTitleSynced: false,
          providerResumeRepairable: true,
          preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          cwd: '/tmp/project',
          status: 'idle',
          createdAt: 1,
          lastActivityAt: 2,
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', repairableBridgeFetch as typeof fetch);

    render(<App />);

    await screen.findAllByText('微信通道');
    expect(screen.queryByText('原生标题：微信 · wx_user_1 · [claude-codex-wechat:test]')).toBeNull();
    expect(screen.queryByRole('button', { name: '修复原生恢复' })).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/bs_1/repair-native-resume'))).toBe(false);
  });

  it('does not render batch native resume repair controls in the sessions panel', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const repairableBridgeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/status')) {
        return new Response(JSON.stringify({
          ok: true,
          sessions: [{
            id: 'bs_1',
            chatId: 'chat-a',
            ownerUserId: 'user-a',
            providerId: 'claude-code',
            providerSessionId: 'claude-session-1',
            resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
            providerResumeTitleSynced: false,
            providerResumeRepairable: true,
            preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
            providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
            cwd: '/tmp/project',
            status: 'idle',
            createdAt: 1,
            lastActivityAt: 2,
          }],
          permissions: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/sessions')) {
        return new Response(JSON.stringify([{
          id: 'bs_1',
          chatId: 'chat-a',
          ownerUserId: 'user-a',
          providerId: 'claude-code',
          providerSessionId: 'claude-session-1',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
          providerResumeTitleSynced: false,
          providerResumeRepairable: true,
          preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          cwd: '/tmp/project',
          status: 'idle',
          createdAt: 1,
          lastActivityAt: 2,
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', repairableBridgeFetch as typeof fetch);

    render(<App />);

    const sessionsHeaders = await screen.findAllByText('当前活跃用户');
    const sessionsSection = sessionsHeaders.at(-1)?.closest('section');
    if (!sessionsSection) throw new Error('sessions_section_not_found');
    expect(screen.queryByText('原生标题：微信 · wx_user_1 · [claude-codex-wechat:test]')).toBeNull();
    expect(within(sessionsSection).queryByRole('button', { name: '批量修复 Claude 恢复' })).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/repair-native-resume'))).toBe(false);
  });

  it('starts WeChat QR login and enables the channel after a done event', async () => {
    // 扫码登录本就是「从未连接走到已连接」的流程，起点必须是未连接。
    const { fetchImpl, calls } = createFetchStub({ pluginConnected: false });
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);

    render(<App />);

    const loginButtons = await screen.findAllByText('扫码登录');
    fireEvent.click(loginButtons[0]!);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toContain('/api/channel/weixin/login');

    FakeEventSource.instances[0]?.emit('qr', { qrcodeData: 'wx://login-ticket' });
    expect(await screen.findByText('请使用微信扫描二维码')).toBeTruthy();
    await waitFor(() => {
      const qr = screen.getByTestId('weixin-login-qr');
      expect(qr.querySelector('svg')).toBeTruthy();
    });
    expect(screen.queryByText('wx://login-ticket')).toBeNull();

    FakeEventSource.instances[0]?.emit('scanned');
    expect(await screen.findByText('已扫码，等待确认...')).toBeTruthy();

    FakeEventSource.instances[0]?.emit('done', {
      accountId: 'wx-account-1',
      botToken: 'wx-bot-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
    });

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/plugins/enable') && call.method === 'POST')).toBe(true);
    });
    const enableCall = calls.find((call) => call.url.endsWith('/api/channel/plugins/enable') && call.method === 'POST');
    expect(enableCall?.body).toContain('"account_id":"wx-account-1"');
    expect(enableCall?.body).toContain('"bot_token":"wx-bot-token"');
    expect(enableCall?.body).toContain('"baseUrl":"https://ilinkai.weixin.qq.com"');
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });

  it('shows WeChat runtime config summary when available', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    expect((await screen.findAllByText('网关')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('https://ilinkai.weixin.qq.com')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Token')).toBeNull();
    expect(screen.queryByText('已配置')).toBeNull();
  });

  it('reflects connected state in the channel strip when the plugin connects', async () => {
    const { fetchImpl, emitBridgeEvent } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findAllByText('未连接');

    await waitFor(() => {
      emitBridgeEvent({
        type: 'channel.plugin-status-changed',
        plugin_id: 'weixin',
        status: {
          id: 'weixin',
          type: 'weixin',
          name: 'WeChat channel',
          enabled: true,
          connected: true,
          status: 'configured',
          activeUsers: 0,
          hasToken: true,
          botUsername: 'wx-account-1',
        },
      });
      expect(screen.getAllByText('已连接').length).toBeGreaterThan(0);
    });

    expect((await screen.findAllByText('已连接')).length).toBeGreaterThan(0);
  });

  it('shows session timeout state and prompts re-login when plugin health degrades', async () => {
    const { fetchImpl, emitBridgeEvent } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findAllByText('未连接');

    await waitFor(() => {
      emitBridgeEvent({
        type: 'channel.plugin-status-changed',
        plugin_id: 'weixin',
        status: {
          id: 'weixin',
          type: 'weixin',
          name: 'WeChat channel',
          enabled: true,
          connected: false,
          status: 'session_timeout',
          lastError: 'weixin_get_updates_failed:-14:session timeout',
          activeUsers: 0,
          hasToken: true,
          botUsername: 'wx-account-1',
        },
      });
      return screen.findByText('会话超时');
    });

    expect(await screen.findByText('会话超时')).toBeTruthy();
    expect(await screen.findByText('微信 bot 会话已失效，请重新扫码登录以刷新 token。')).toBeTruthy();
    expect(await screen.findByText('重新扫码登录')).toBeTruthy();
    expect(await screen.findByText('错误：weixin_get_updates_failed:-14:session timeout')).toBeTruthy();
  });

  it('loads recoverable Claude sessions for the active wechat user flow', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/api/channel/providers/claude-code/recoverable-sessions') && call.method === 'GET')).toBe(true);
    });

    const recoverableTitles = await screen.findAllByText('claude-session-1.jsonl');
    const recoverableItem = recoverableTitles.at(-1)?.closest('li');
    if (!recoverableItem) throw new Error('recoverable_item_not_found');
    expect(within(recoverableItem).queryByText(/推荐恢复：/)).toBeNull();
    expect(within(recoverableItem).queryByText(/按标题恢复：/)).toBeNull();
    expect(within(recoverableItem).queryByRole('button', { name: '修复原生恢复' })).toBeNull();
    const panelRoot = claudeTabButtons.at(-1)?.closest('section');
    if (!panelRoot) throw new Error('wechat_panel_not_found');
    expect(within(panelRoot).queryByText('批量修复 Claude 恢复')).toBeNull();
    expect(within(panelRoot).queryByRole('button', { name: '加载更多' })).toBeTruthy();
  });

  it('loads more recoverable sessions when clicking load more', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);

    expect(await screen.findByText('claude-session-1.jsonl')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '加载更多' }));

    expect(await screen.findByText('claude-session-2.jsonl')).toBeTruthy();
    expect(calls.some((call) => call.url.includes('/api/channel/providers/claude-code/recoverable-sessions?limit=10&cursor=claude-session-1'))).toBe(true);
  });

  it('does not attempt to attach a recoverable session when the active wechat user is unavailable', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const inactiveUserFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/channel/active-user')) {
        return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/state')) {
        return new Response(JSON.stringify({
          activeUser: null,
          plugin: {
            id: 'weixin',
            type: 'weixin',
            name: 'WeChat channel',
            enabled: false,
            connected: false,
            status: 'disabled',
            activeUsers: 0,
            hasToken: false,
          },
          settings: {
            defaultProvider: 'claude-code',
            defaultWorkspace: '/tmp/project',
            tunnel: {
              relay: {
                serverUrl: 'wss://wechat.style520.com/agent',
                authToken: 'clrt_1234567890abcdef12345678',
              },
            },
          },
          runtimeConfig: { enabled: true, baseUrl: 'https://ilinkai.weixin.qq.com', token: 'wx-bot-token', accountId: 'wx-account-1' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/settings')) {
        return new Response(JSON.stringify({
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
          tunnel: {
            relay: {
              serverUrl: 'wss://wechat.style520.com/agent',
              authToken: 'clrt_1234567890abcdef12345678',
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/tunnel/status')) {
        return new Response(JSON.stringify({
          installed: true,
          enabled: false,
          running: false,
          status: 'stopped',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', inactiveUserFetch as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);

    expect(screen.queryByRole('button', { name: '接入会话' })).toBeNull();
    expect(await screen.findByText('暂无可恢复会话。')).toBeTruthy();
    expect(calls.some((call) => call.url.endsWith('/api/channel/current-session/attach') && call.method === 'POST')).toBe(false);
  });

  it('does not render recoverable-session native resume repair controls in the WeChat panel', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const repairableFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/channel/providers/claude-code/recoverable-sessions') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          items: [
            {
              id: 'claude-session-1',
              providerId: 'claude-code',
              title: 'claude-session-1.jsonl',
              resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
              providerResumeTitleSynced: false,
              providerResumeRepairable: true,
              preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
              providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
            },
          ],
          nextCursor: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', repairableFetch as typeof fetch);

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);

    expect(await screen.findByText('claude-session-1.jsonl')).toBeTruthy();
    expect(screen.queryByText('推荐恢复：claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]')).toBeNull();
    expect(screen.queryByText('按标题恢复：claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]')).toBeNull();
    expect(screen.queryByRole('button', { name: '修复原生恢复' })).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/api/channel/providers/claude-code/recoverable-sessions/claude-session-1/repair-native-resume'))).toBe(false);
  });

  it('does not render batch recoverable-session native resume repair controls in the WeChat panel', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const repairableFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/channel/providers/claude-code/recoverable-sessions') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          items: [
            {
              id: 'claude-session-1',
              providerId: 'claude-code',
              title: 'claude-session-1.jsonl',
              resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
              providerResumeTitleSynced: false,
              providerResumeRepairable: true,
              preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
              providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
            },
          ],
          nextCursor: null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', repairableFetch as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);
    expect(await screen.findByText('claude-session-1.jsonl')).toBeTruthy();
    expect(screen.queryByText('推荐恢复：claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]')).toBeNull();
    expect(screen.queryByText('按标题恢复：claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]')).toBeNull();

    expect(screen.queryByText('批量修复 Claude 恢复')).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/api/channel/providers/claude-code/recoverable-sessions/repair-native-resume'))).toBe(false);
  });

  it('does not render auto-attach buttons in the WeChat panel', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    await screen.findAllByRole('button', { name: 'Claude 会话' });
    expect(screen.queryByText('自动接入 Claude 会话')).toBeNull();
    expect(screen.queryByText('自动接入 Codex 会话')).toBeNull();
  });
});
