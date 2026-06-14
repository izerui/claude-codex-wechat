/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
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
    if (url.endsWith('/api/channel/sessions')) {
      return new Response(JSON.stringify(state.sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/settings')) {
      return new Response(JSON.stringify({
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
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
    if (url.endsWith('/api/channel/providers/claude-code/recoverable-sessions')) {
      return new Response(JSON.stringify([
        {
          id: 'claude-session-1',
          providerId: 'claude-code',
          title: 'claude-session-1.jsonl',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
          providerResumeTitleSynced: true,
          providerResumeRepairable: false,
          preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
          providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/providers/codex/recoverable-sessions')) {
      return new Response(JSON.stringify([
        {
          id: 'codex-session-1',
          providerId: 'codex',
          title: 'codex-session-1',
          resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
          preferredResumeCommand: 'codex exec resume --json --last 微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
          providerResumeCommand: 'codex exec resume --json --last codex-session-1',
          providerResumeByTitleCommand: 'codex exec resume --json --last 微信 · wx_user_1 · [claude-codex-wechat:codex-test]',
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    if (url.endsWith('/api/channel/sessions/bs_1/stop') && method === 'POST') {
      state.sessions = [{ ...state.sessions[0], status: 'closed', archivedAt: Date.now() }];
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

    const stopButton = await screen.findByText('停止');
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/bs_1/stop') && call.method === 'POST')).toBe(true);
    });

    const revokeButton = await screen.findByText('撤销授权');
    fireEvent.click(revokeButton);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/users/user_1/revoke') && call.method === 'POST')).toBe(true);
    });
  });

  it('repairs native Claude resume metadata from the sessions panel', async () => {
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

    await screen.findByText('claude-session-1');
    const repairButtons = await screen.findAllByRole('button', { name: '修复原生恢复' });
    fireEvent.click(repairButtons[0]!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/bs_1/repair-native-resume') && call.method === 'POST')).toBe(true);
    });
  });

  it('repairs all attached Claude bridge sessions from the sessions panel', async () => {
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

    await screen.findByText('待修复');
    const sessionsHeaders = await screen.findAllByText('会话');
    const sessionsSection = sessionsHeaders.at(-1)?.closest('section');
    if (!sessionsSection) throw new Error('sessions_section_not_found');
    const batchButton = within(sessionsSection).getByRole('button', { name: '批量修复 Claude 恢复' });
    fireEvent.click(batchButton);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/repair-native-resume') && call.method === 'POST')).toBe(true);
    });
  });

  it('starts WeChat QR login and enables the channel after a done event', async () => {
    const { fetchImpl, calls } = createFetchStub();
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

    expect((await screen.findAllByText('网关：https://ilinkai.weixin.qq.com')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Token：已配置')).length).toBeGreaterThan(0);
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

    await screen.findAllByText('未连接');

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

  it('shows session timeout state and prompts re-login when plugin health degrades', async () => {
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

    await screen.findAllByText('未连接');

    FakeSocket.instances[0]?.emitMessage({
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

    expect(await screen.findByText('会话超时')).toBeTruthy();
    expect(await screen.findByText('微信 bot 会话已失效，请重新扫码登录以刷新 token。')).toBeTruthy();
    expect(await screen.findByText('重新扫码登录')).toBeTruthy();
    expect(await screen.findByText('错误：weixin_get_updates_failed:-14:session timeout')).toBeTruthy();
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

  it('loads recoverable Claude sessions for the authorized user flow', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const scanButtons = await screen.findAllByText('扫描 Claude 原生会话');
    fireEvent.click(scanButtons.at(-1)!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/providers/claude-code/recoverable-sessions') && call.method === 'GET')).toBe(true);
    });

    const syncedStates = await screen.findAllByText('原生恢复状态：已同步');
    const recoverableItem = syncedStates.at(-1)?.closest('li');
    if (!recoverableItem) throw new Error('recoverable_item_not_found');
    expect(within(recoverableItem).queryByRole('button', { name: '修复原生恢复' })).toBeNull();
    const panelRoot = scanButtons.at(-1)?.closest('section');
    if (!panelRoot) throw new Error('wechat_panel_not_found');
    expect(within(panelRoot).queryByText('批量修复 Claude 恢复')).toBeNull();
  });

  it('repairs a recoverable Claude session from the WeChat panel before attach', async () => {
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
      if (url.endsWith('/api/channel/providers/claude-code/recoverable-sessions') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify([
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
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', repairableFetch as typeof fetch);

    const scanButtons = await screen.findAllByText('扫描 Claude 原生会话');
    fireEvent.click(scanButtons.at(-1)!);

    await screen.findByText('原生恢复状态：待修复');
    const repairButtons = await screen.findAllByRole('button', { name: '修复原生恢复' });
    fireEvent.click(repairButtons.at(-1)!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/providers/claude-code/recoverable-sessions/claude-session-1/repair-native-resume') && call.method === 'POST')).toBe(true);
    });
  });

  it('repairs all recoverable Claude sessions from the WeChat panel', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const repairableFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/channel/providers/claude-code/recoverable-sessions') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify([
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
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

    const scanButtons = await screen.findAllByText('扫描 Claude 原生会话');
    fireEvent.click(scanButtons.at(-1)!);
    await screen.findByText('原生恢复状态：待修复');

    const batchButtons = await screen.findAllByText('批量修复 Claude 恢复');
    fireEvent.click(batchButtons.at(-1)!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/providers/claude-code/recoverable-sessions/repair-native-resume') && call.method === 'POST')).toBe(true);
    });
  });

  it('auto-attaches the matching Claude session for the selected authorized user', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const autoButtons = await screen.findAllByText('自动接入 Claude 会话');
    fireEvent.click(autoButtons.at(-1)!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/auto-attach') && call.method === 'POST')).toBe(true);
    });
  });
});
