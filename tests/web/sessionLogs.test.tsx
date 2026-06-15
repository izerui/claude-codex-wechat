/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';
import type { ActiveWeChatUserView, BridgeSessionView } from '../../src/web/apiClient';

function createFetchStub() {
  const calls: Array<{ url: string; method: string }> = [];
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
    activeUser: null,
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
    if (url.endsWith('/api/channel/sessions')) {
      return new Response(JSON.stringify(state.sessions), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/settings')) {
      return new Response(JSON.stringify({
        provider: 'claude-code',
        defaultWorkspace: '/tmp/project',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unhandled fetch: ${method} ${url}`);
  });

  return { fetchImpl, calls };
}

describe('App session interactions without bridge event history', () => {
  it('does not render bridge event controls or panels', async () => {
    const { fetchImpl, calls } = createFetchStub();
    vi.stubGlobal('fetch', fetchImpl as typeof fetch);

    render(<App />);

    expect(await screen.findByText('微信 · wx_user_1 · [claude-codex-wechat:test]')).toBeTruthy();
    expect(screen.queryByText('事件')).toBeNull();
    expect(screen.queryByText('桥接事件 · bs_1')).toBeNull();
    expect(calls.some((call) => call.url.endsWith('/api/channel/sessions/bs_1/events'))).toBe(false);
  });

  it('still renders session rows for sidecar-attached sessions', async () => {
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

    expect(await screen.findByText('/tmp/sidecar')).toBeTruthy();
    expect(screen.queryByText('事件')).toBeNull();
  });
});
