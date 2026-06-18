/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';
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

function createFetchStub() {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const state: {
    sessions: BridgeSessionView[];
    activeUser: ActiveWeChatUserView | null;
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
        provider: 'claude-code',
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
    throw new Error(`Unhandled fetch: ${method} ${url}`);
  });

  return { fetchImpl, calls };
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe('App admin interactions', () => {
  it('stops the current bridge session from the UI without showing revoke or archive controls', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    const stopButton = await screen.findByText('停止');
    fireEvent.click(stopButton);

    await waitFor(() => {
    expect(calls.some((call) => call.url.endsWith('/api/channel/current-session/stop') && call.method === 'POST')).toBe(true);
    });
    expect(screen.queryByText('撤销授权')).toBeNull();
    expect(screen.queryByText('归档')).toBeNull();
  });

  it('does not render pending pairing controls', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findAllByText('当前活跃用户信息');
    expect(screen.queryByText('待审批配对')).toBeNull();
    expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/api/channel/pairings'))).toBe(false);
  });

  it('defaults to the Claude native session tab and switches to Codex native session tab', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);
    vi.stubGlobal('WebSocket', class {
      addEventListener() {}
      close() {}
      constructor(_url: string) {}
    } as unknown as typeof WebSocket);

    render(<App />);

    const claudeTab = (await screen.findAllByRole('button', { name: 'Claude 原生会话' })).at(-1)!;
    expect(claudeTab.getAttribute('aria-pressed')).toBe('true');
    expect((await screen.findAllByText('平台 ID：wx_user_1')).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/providers/claude-code/recoverable-sessions') && call.method === 'GET')).toBe(true);
    });
    expect((await screen.findAllByText('原生会话 ID：claude-session-1')).length).toBeGreaterThan(0);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Codex 原生会话' })).at(-1)!);
    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/providers/codex/recoverable-sessions') && call.method === 'GET')).toBe(true);
    });
    expect((await screen.findAllByText('原生会话 ID：codex-session-1')).length).toBeGreaterThan(0);
  });

  it('renders a simplified bridge sessions table without duplicate recovery columns', async () => {
    const { fetchImpl } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    await screen.findAllByText('当前活跃用户信息');
    expect((await screen.findAllByText('当前活跃用户信息')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('当前会话')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('提供方：claude-code')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('工作目录：/tmp/project')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('状态：idle')).length).toBeGreaterThan(0);
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

    expect((await screen.findAllByText('原生标题：微信 · wx_user_1 · [claude-codex-wechat:test]')).length).toBeGreaterThan(0);
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

    await screen.findAllByText('原生标题：微信 · wx_user_1 · [claude-codex-wechat:test]');
    const sessionsHeaders = await screen.findAllByText('当前活跃用户信息');
    const sessionsSection = sessionsHeaders.at(-1)?.closest('section');
    if (!sessionsSection) throw new Error('sessions_section_not_found');
    expect(within(sessionsSection).queryByRole('button', { name: '批量修复 Claude 恢复' })).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/repair-native-resume'))).toBe(false);
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
    fireEvent.click((await screen.findAllByText('保存配置')).at(-1)!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/settings') && call.method === 'POST')).toBe(true);
      expect(calls.some((call) => call.url.endsWith('/api/channel/settings/sync') && call.method === 'POST')).toBe(true);
    });
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

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 原生会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/providers/claude-code/recoverable-sessions') && call.method === 'GET')).toBe(true);
    });

    const syncedStates = await screen.findAllByText('原生恢复状态：已同步');
    const recoverableItem = syncedStates.at(-1)?.closest('li');
    if (!recoverableItem) throw new Error('recoverable_item_not_found');
    expect(within(recoverableItem).queryByRole('button', { name: '修复原生恢复' })).toBeNull();
    const panelRoot = claudeTabButtons.at(-1)?.closest('section');
    if (!panelRoot) throw new Error('wechat_panel_not_found');
    expect(within(panelRoot).queryByText('批量修复 Claude 恢复')).toBeNull();
  });

  it('does not attempt to attach a recoverable session when the active wechat user is unavailable', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const inactiveUserFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/channel/active-user')) {
        return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 原生会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);
    fireEvent.click((await screen.findAllByRole('button', { name: '接入会话' })).at(-1)!);

    expect(await screen.findByText('no_active_wechat_user')).toBeTruthy();
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

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 原生会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);

    expect((await screen.findAllByText('原生恢复状态：待修复')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '修复原生恢复' })).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/api/channel/providers/claude-code/recoverable-sessions/claude-session-1/repair-native-resume'))).toBe(false);
  });

  it('does not render batch recoverable-session native resume repair controls in the WeChat panel', async () => {
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

    const claudeTabButtons = await screen.findAllByRole('button', { name: 'Claude 原生会话' });
    fireEvent.click(claudeTabButtons.at(-1)!);
    expect((await screen.findAllByText('原生恢复状态：待修复')).length).toBeGreaterThan(0);

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

    await screen.findAllByRole('button', { name: 'Claude 原生会话' });
    expect(screen.queryByText('自动接入 Claude 会话')).toBeNull();
    expect(screen.queryByText('自动接入 Codex 会话')).toBeNull();
  });
});
