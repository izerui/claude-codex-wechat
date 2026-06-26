/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';

const okStatus = { ok: true, sessions: [], permissions: [], preferredLocalUrl: 'http://192.168.1.25:8787' };

const channelState = {
  activeUser: null,
  plugin: {
    id: 'weixin',
    type: 'weixin',
    name: '微信通道',
    enabled: false,
    connected: false,
    status: 'idle',
    activeUsers: 0,
    hasToken: false,
  },
  settings: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
  runtimeConfig: null,
};

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
      if (url.endsWith('/api/channel/state')) {
        return new Response(JSON.stringify(channelState), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
          ngrok: {
            enabled: true,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/ngrok/status')) {
        return new Response(JSON.stringify({
          installed: true,
          enabled: true,
          running: true,
          status: 'running',
          publicUrl: 'https://bridge.ngrok-free.app',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '微信远程控制台' })).toBeTruthy();
    expect((await screen.findAllByText('Claude')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Codex/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText('在线')).toBeTruthy();
    expect((await screen.findAllByText('v2.0.1')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('未找到可执行文件')).length).toBeGreaterThan(0);
    const publicLink = await screen.findByRole('link', { name: 'https://bridge.ngrok-free.app' });
    expect(publicLink.getAttribute('href')).toBe('https://bridge.ngrok-free.app');
    expect(await screen.findByRole('button', { name: '关闭公网' })).toBeTruthy();
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
      if (url.endsWith('/api/channel/state')) {
        return new Response(JSON.stringify(channelState), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
          ngrok: {
            enabled: false,
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/ngrok/status')) {
        return new Response(JSON.stringify({
          installed: false,
          enabled: false,
          running: false,
          status: 'not_installed',
          error: 'ngrok_not_installed',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch);

    render(<App />);

    expect((await screen.findAllByText('v2.0.1')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('未找到可执行文件')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('/opt/bin/claude')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('/opt/bin/codex')).length).toBeGreaterThan(0);
    expect(await screen.findByText('未安装 ngrok')).toBeTruthy();
    const localLink = await screen.findByRole('link', { name: 'http://192.168.1.25:8787' });
    expect(localLink.getAttribute('href')).toBe('http://192.168.1.25:8787');
    expect(screen.queryByRole('button', { name: '开启公网' })).toBeNull();
    expect(screen.queryByText(/检查于/)).toBeNull();
    expect(screen.queryByText(/1234567890000/)).toBeNull();
  });
});
