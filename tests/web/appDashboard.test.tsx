/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';

const okStatus = { ok: true, sessions: [], permissions: [] };

describe('App dashboard provider status', () => {
  it('shows detailed Claude and Codex status text', async () => {
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/status')) {
        return new Response(JSON.stringify(okStatus), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/channel/sessions')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    if (url.endsWith('/api/settings')) {
      return new Response(JSON.stringify({
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
        permissionTimeoutMs: 60000,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch);

    render(<App />);

    expect(await screen.findByText('已检测 · 2.0.1')).toBeTruthy();
    expect(await screen.findByText('未找到可执行文件')).toBeTruthy();
    expect(await screen.findByText('/opt/bin/claude · 检查于 1234567890')).toBeTruthy();
    expect(await screen.findByText('/opt/bin/codex · 检查于 1234567890')).toBeTruthy();
  });
});
