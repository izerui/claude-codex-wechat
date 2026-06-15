/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';
import type { AuthorizedUserView, BridgeEventView, BridgeSessionView } from '../../src/web/apiClient';

function createFetchStub() {
  const calls: Array<{ url: string; method: string }> = [];
  const state: {
    sessions: BridgeSessionView[];
    users: AuthorizedUserView[];
    events: Record<string, BridgeEventView[]>;
  } = {
    sessions: [
      {
        id: 'bs_1',
        chatId: 'chat-a',
        ownerUserId: 'user-a',
        providerId: 'claude-code',
        providerSessionId: 'claude-session-1',
        preferredResumeMode: 'title',
        preferredResumeCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
        providerResumeCommand: 'claude --resume claude-session-1',
        providerResumeByTitleCommand: 'claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]',
        providerResumeTitleSynced: true,
        providerResumeRepairable: true,
        resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
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
    events: {
      bs_1: [
        {
          id: 'msg_1',
          bridgeSessionId: 'bs_1',
          direction: 'provider_event',
          providerEventType: 'permission_request',
          text: '允许执行 fake command?',
          createdAt: 1,
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
    if (url.endsWith('/api/channel/sessions/bs_1/events')) {
      return new Response(JSON.stringify(state.events.bs_1), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/settings')) {
      return new Response(JSON.stringify({
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unhandled fetch: ${method} ${url}`);
  });

  return { fetchImpl, calls };
}

describe('App session event interactions', () => {
  it('loads and renders session bridge events when the event button is clicked', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    const eventButtons = await screen.findAllByText('事件');
    fireEvent.click(eventButtons[0]!);

    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/bs_1/events') && call.method === 'GET')).toBe(true);
    });

    expect(await screen.findByText('桥接事件 · bs_1')).toBeTruthy();
    expect(await screen.findByText('允许执行 fake command?')).toBeTruthy();
    expect(await screen.findByText('标题恢复')).toBeTruthy();
    expect(await screen.findByText('推荐恢复')).toBeTruthy();
    expect(await screen.findByText('按标题恢复')).toBeTruthy();
    expect(await screen.findByText('原生恢复状态')).toBeTruthy();
    expect(await screen.findByText('已同步')).toBeTruthy();
    expect((await screen.findAllByText('claude -r 微信 · wx_user_1 · [claude-codex-wechat:test]')).length).toBe(2);
    expect(await screen.findByText('claude --resume claude-session-1')).toBeTruthy();
    expect(await screen.findByText('微信 · wx_user_1 · [claude-codex-wechat:test]')).toBeTruthy();
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

  it('renders bridge event rows without relying on text delta/outbound deduplication', async () => {
    const { fetchImpl } = createFetchStub();
    const mergedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/channel/sessions/bs_1/events')) {
        return new Response(JSON.stringify([
          {
            id: 'msg_1',
            bridgeSessionId: 'bs_1',
            direction: 'provider_event',
            providerEventType: 'permission_request',
            text: '允许执行 read file?',
            createdAt: 1,
          },
          {
            id: 'msg_2',
            bridgeSessionId: 'bs_1',
            direction: 'provider_event',
            providerEventType: 'error',
            text: 'provider_failed:read file',
            createdAt: 2,
          },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return await fetchImpl(input, init);
    });
    vi.stubGlobal('fetch', mergedFetch as typeof fetch);

    render(<App />);

    const eventButtons = await screen.findAllByText('事件');
    fireEvent.click(eventButtons[0]!);

    expect(await screen.findByText('允许执行 read file?')).toBeTruthy();
    expect(await screen.findByText('provider_failed:read file')).toBeTruthy();
  });
});
