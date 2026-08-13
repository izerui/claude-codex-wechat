/** @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { App } from '../../src/web/App';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const connectedPlugin = {
  id: 'weixin',
  type: 'weixin',
  name: 'WeChat channel',
  enabled: true,
  connected: true,
  status: 'connected',
  activeUsers: 1,
  hasToken: true,
};

// 扫描 recoverable sessions 实测要 1.6~2s，这里用可控的 deferred 模拟那段等待。
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function stubFetch(recoverablePromise: Promise<unknown>) {
  vi.stubGlobal('WebSocket', class {
    addEventListener() {}
    close() {}
    constructor(_url: string) {}
  } as unknown as typeof WebSocket);

  vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/recoverable-sessions')) {
      await recoverablePromise;
      return json({ items: [], nextCursor: null });
    }
    if (url.endsWith('/api/status')) return json({ ok: true, sessions: [], permissions: [] });
    if (url.endsWith('/api/providers/status')) {
      return json({
        claude: { detected: true, command: '/opt/bin/claude', checkedAt: 1 },
        codex: { detected: true, command: '/opt/bin/codex', checkedAt: 1 },
      });
    }
    if (url.endsWith('/api/channel/state')) {
      return json({
        activeUser: null,
        plugin: connectedPlugin,
        settings: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
        runtimeConfig: null,
      });
    }
    if (url.endsWith('/api/settings')) {
      return json({ defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project', tunnel: { enabled: false } });
    }
    if (url.endsWith('/api/tunnel/status')) return json({ installed: false, enabled: false, running: false });
    if (url.endsWith('/api/bridge-events')) return new Response('', { status: 200 });
    return json(null);
  }) as typeof fetch);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recoverable sessions loading state', () => {
  it('shows a loading hint instead of the empty message while scanning', async () => {
    const deferred = createDeferred<void>();
    stubFetch(deferred.promise);

    render(<App />);

    const codexTabs = await screen.findAllByRole('button', { name: 'Codex 会话' });
    fireEvent.click(codexTabs.at(-1)!);

    // 扫描尚未返回：此时不能骗用户说“暂无可恢复会话”。
    await waitFor(() => {
      expect(screen.queryByText('加载中...')).toBeTruthy();
    });
    expect(screen.queryByText('暂无可恢复会话。')).toBeNull();

    deferred.resolve();

    // 扫描返回且确实为空后，才显示空态。
    await waitFor(() => {
      expect(screen.queryByText('暂无可恢复会话。')).toBeTruthy();
    });
  });
});
