/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';
import type { AuthorizedUserView, BridgeSessionView } from '../../src/web/apiClient';

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

function createFetchStub() {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const state: {
    sessions: BridgeSessionView[];
    users: AuthorizedUserView[];
  } = {
    sessions: [
      {
        id: 'bs_1',
        chatId: 'chat-a',
        ownerUserId: 'user-a',
        providerId: 'claude-code',
        providerSessionId: 'claude-session-1',
        cwd: '/tmp/project',
        status: 'idle',
        createdAt: 1,
        lastActivityAt: 2,
      },
    ],
    users: [
      {
        id: 'user_1',
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        defaultProvider: 'claude-code',
        defaultCwd: '/tmp/project',
        role: 'user',
        createdAt: 1,
      },
    ],
  };

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });

    if (url.endsWith('/api/status')) {
      return new Response(JSON.stringify({ ok: true, sessions: state.sessions, permissions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/providers/status')) {
      return new Response(JSON.stringify({ claude: { detected: true, version: '2.0.1' }, codex: { detected: false, reason: 'missing_binary' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/pairings')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/users')) {
      return new Response(JSON.stringify(state.users), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
          activeUsers: state.users.length,
          hasToken: false,
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/weixin/login')) {
      return new Response(null, { status: 200 });
    }
    if (url.endsWith('/api/channel/sessions')) {
      return new Response(JSON.stringify(state.sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/settings')) {
      return new Response(JSON.stringify({
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
        permissionTimeoutMs: 60000,
        wechatThrottle: { minIntervalMs: 500, chunkSize: 1000 },
        highRiskCommandPolicy: 'per_request',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    if (url.endsWith('/api/channel/sessions/bs_1/stop') && method === 'POST') {
      state.sessions = [{ ...state.sessions[0], status: 'closed', archivedAt: Date.now() }];
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/users/user_1/revoke') && method === 'POST') {
      state.users = [];
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unhandled fetch: ${method} ${url}`);
  });

  return { fetchImpl, calls };
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe('App admin interactions', () => {
  it('stops a session and revokes a user from the UI', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    const stopButton = await screen.findByText('Stop');
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/bs_1/stop') && call.method === 'POST')).toBe(true);
    });

    const revokeButton = await screen.findByText('Revoke');
    fireEvent.click(revokeButton);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/users/user_1/revoke') && call.method === 'POST')).toBe(true);
    });
  });

  it('starts WeChat QR login and enables the channel after a done event', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);

    render(<App />);

    const loginButtons = await screen.findAllByText('Scan to Login');
    fireEvent.click(loginButtons[0]!);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toContain('/api/channel/weixin/login');

    FakeEventSource.instances[0]?.emit('qr', { qrcodeData: 'wx://login-ticket' });
    expect(await screen.findByText('Please scan the QR code with WeChat')).toBeTruthy();

    FakeEventSource.instances[0]?.emit('scanned');
    expect(await screen.findByText('Scanned, waiting for confirmation...')).toBeTruthy();

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

  it('shows account id when plugin status changes to connected', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    class FakeSocket {
      static instances: FakeSocket[] = [];
      private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

      constructor(_url: string) {
        FakeSocket.instances.push(this);
      }

      addEventListener(type: string, handler: (event: MessageEvent) => void) {
        const list = this.listeners.get(type) ?? [];
        list.push(handler);
        this.listeners.set(type, list);
      }

      close() {}

      emitMessage(data: unknown) {
        const event = { data: JSON.stringify(data) } as MessageEvent;
        for (const handler of this.listeners.get('message') ?? []) handler(event);
      }
    }

    vi.stubGlobal('WebSocket', FakeSocket as unknown as typeof WebSocket);

    render(<App />);

    await screen.findAllByText('Not connected');

    FakeSocket.instances[0]?.emitMessage({
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

    expect(await screen.findByText('wx-account-1')).toBeTruthy();
  });

  it('syncs weixin channel settings after changing default provider', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const selectors = await screen.findAllByDisplayValue('Claude Code');
    fireEvent.change(selectors[0]!, { target: { value: 'codex' } });

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/settings') && call.method === 'POST')).toBe(true);
      expect(calls.some((call) => call.url.endsWith('/api/channel/settings/sync') && call.method === 'POST')).toBe(true);
    });
  });
});
