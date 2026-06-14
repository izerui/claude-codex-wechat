/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';
import type { AuthorizedUserView, BridgeSessionView, MessageLogView } from '../../src/web/apiClient';

function createFetchStub() {
  const calls: Array<{ url: string; method: string }> = [];
  const state: {
    sessions: BridgeSessionView[];
    users: AuthorizedUserView[];
    logs: Record<string, MessageLogView[]>;
  } = {
    sessions: [
      {
        id: 'bs_1',
        chatId: 'chat-a',
        ownerUserId: 'user-a',
        providerId: 'claude-code',
        providerSessionId: 'claude-session-1',
        preferredResumeMode: 'title',
        preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [local-agent-wechat-bridge:test]',
        providerResumeCommand: 'claude --resume claude-session-1',
        providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [local-agent-wechat-bridge:test]',
        providerResumeTitleSynced: true,
        providerResumeRepairable: true,
        resumeTitle: '微信 · wx_user_1 · [local-agent-wechat-bridge:test]',
        bindingMatched: true,
        bindingSource: 'binding_table',
        bindingPlatformUserId: 'wx_user_1',
        bindingProviderSessionId: 'claude-session-1',
        cwd: '/tmp/project',
        status: 'idle',
        createdAt: 1,
        lastActivityAt: 2,
      },
    ],
    users: [],
    logs: {
      bs_1: [
        {
          id: 'msg_1',
          bridgeSessionId: 'bs_1',
          direction: 'inbound',
          text: 'run tests',
          createdAt: 1,
        },
        {
          id: 'msg_2',
          bridgeSessionId: 'bs_1',
          direction: 'provider_event',
          providerEventType: 'text_delta',
          text: '收到：run tests',
          createdAt: 2,
        },
      ],
    },
  };

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });

    if (url.endsWith('/api/status')) {
      return new Response(JSON.stringify({ ok: true, sessions: state.sessions, permissions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/providers/status')) {
      return new Response(JSON.stringify({
        claude: { detected: true, version: '2.0.1', command: '/opt/bin/claude', checkedAt: 1234567890 },
        codex: { detected: false, reason: 'missing_binary', command: '/opt/bin/codex', checkedAt: 1234567890 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    if (url.endsWith('/api/channel/sessions')) {
      return new Response(JSON.stringify(state.sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/channel/sessions/bs_1/messages')) {
      return new Response(JSON.stringify(state.logs.bs_1), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/settings')) {
      return new Response(JSON.stringify({
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
        permissionTimeoutMs: 60000,
        wechatAutoAuthorize: true,
        wechatThrottle: { minIntervalMs: 500, chunkSize: 1000 },
        highRiskCommandPolicy: 'per_request',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unhandled fetch: ${method} ${url}`);
  });

  return { fetchImpl, calls };
}

describe('App session log interactions', () => {
  it('loads and renders session message logs when the log button is clicked', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    const logsButton = await screen.findByText('日志');
    fireEvent.click(logsButton);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/bs_1/messages') && call.method === 'GET')).toBe(true);
    });

    expect(await screen.findByText('消息日志 · bs_1')).toBeTruthy();
    expect(await screen.findByText('run tests')).toBeTruthy();
    expect(await screen.findByText('收到：run tests')).toBeTruthy();
    expect(await screen.findByText('标题恢复')).toBeTruthy();
    expect(await screen.findByText('推荐恢复')).toBeTruthy();
    expect(await screen.findByText('按标题恢复')).toBeTruthy();
    expect(await screen.findByText('原生恢复状态')).toBeTruthy();
    expect(await screen.findByText('已同步')).toBeTruthy();
    expect((await screen.findAllByText('claude -r 微信 · wx_user_1 · [local-agent-wechat-bridge:test]')).length).toBe(2);
    expect(await screen.findByText('claude --resume claude-session-1')).toBeTruthy();
    expect(await screen.findByText('微信 · wx_user_1 · [local-agent-wechat-bridge:test]')).toBeTruthy();
    expect(await screen.findByText('历史绑定命中')).toBeTruthy();
    expect(await screen.findByText('wx_user_1 · claude-session-1')).toBeTruthy();
  });

  it('renders sidecar recovery source label for sidecar-attached sessions', async () => {
    const { fetchImpl } = createFetchStub();
    const sidecarFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const sidecarSession = {
        id: 'bs_sidecar',
        chatId: 'chat-b',
        ownerUserId: 'user-b',
        providerId: 'claude-code',
        providerSessionId: 'claude-session-sidecar',
        providerResumeCommand: 'claude --resume claude-session-sidecar',
        bindingMatched: false,
        bindingSource: 'sidecar' as const,
        cwd: '/tmp/sidecar',
        status: 'idle',
        createdAt: 1,
        lastActivityAt: 2,
      };
      if (url.endsWith('/api/status')) {
        return new Response(JSON.stringify({
          ok: true,
          sessions: [sidecarSession],
          permissions: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/sessions')) {
        return new Response(JSON.stringify([sidecarSession]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', sidecarFetch as typeof fetch);

    render(<App />);

    expect(await screen.findByText('Sidecar 命中')).toBeTruthy();
  });
});
