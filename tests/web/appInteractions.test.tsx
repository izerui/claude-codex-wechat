/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';

function createFetchStub() {
  const calls: Array<{ url: string; method: string }> = [];
  const state = {
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
        platform: 'wechat-clawbot',
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
    calls.push({ url, method });

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
});
