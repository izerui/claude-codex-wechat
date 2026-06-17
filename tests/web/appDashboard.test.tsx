/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';

const okStatus = { ok: true, sessions: [], permissions: [] };
const checkedAt = 1234567890000;

function formatCheckedAtForLocalTimezone(value: number): string {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

describe('App dashboard provider status', () => {
  it('renders the bootstrap dashboard summary with service and provider status', async () => {
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/status')) {
        return new Response(JSON.stringify(okStatus), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/providers/status')) {
        return new Response(JSON.stringify({
          claude: { detected: true, version: '2.0.1', command: '/opt/bin/claude', checkedAt: 1234567890000 },
          codex: { detected: false, reason: 'missing_binary', command: '/opt/bin/codex', checkedAt: 1234567890000 },
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
        return new Response(JSON.stringify(null), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/settings')) {
        return new Response(JSON.stringify({
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '本地微信代理桥接' })).toBeTruthy();
    expect((await screen.findAllByText('桥接')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Claude')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Codex/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText('在线')).toBeTruthy();
    expect((await screen.findAllByText('已检测 · 2.0.1')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('未找到可执行文件')).length).toBeGreaterThan(0);
    expect(screen.queryByText('5177 页面')).toBeNull();
    expect(screen.queryByText('监控区')).toBeNull();
    expect(screen.queryByText('桥接总览与接入摘要')).toBeNull();
  });

  it('shows provider command details with timezone-stable assertions', async () => {
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/status')) {
        return new Response(JSON.stringify(okStatus), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/providers/status')) {
        return new Response(JSON.stringify({
          claude: { detected: true, version: '2.0.1', command: '/opt/bin/claude', checkedAt: 1234567890000 },
          codex: { detected: false, reason: 'missing_binary', command: '/opt/bin/codex', checkedAt: 1234567890000 },
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
        return new Response(JSON.stringify(null), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/settings')) {
        return new Response(JSON.stringify({
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch);

    render(<App />);

    const expectedCheckedAt = formatCheckedAtForLocalTimezone(checkedAt);

    expect((await screen.findAllByText('已检测 · 2.0.1')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('未找到可执行文件')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(`/opt/bin/claude · 检查于 ${expectedCheckedAt}`)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(`/opt/bin/codex · 检查于 ${expectedCheckedAt}`)).length).toBeGreaterThan(0);
    expect(screen.queryByText('/opt/bin/claude · 检查于 1234567890000')).toBeNull();
  });
});
