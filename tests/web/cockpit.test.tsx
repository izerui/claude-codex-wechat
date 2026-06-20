/** @vitest-environment jsdom */
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelStrip, EngineBays } from '../../src/web/Cockpit';

afterEach(() => {
  cleanup();
});
import type { ChannelPluginView, CurrentSessionView } from '../../src/web/apiClient';

const connectedPlugin: ChannelPluginView = {
  id: 'weixin', type: 'weixin', name: '微信通道',
  enabled: true, connected: true, status: 'connected', activeUsers: 1, hasToken: true,
};

const claudeSession: CurrentSessionView = {
  id: 's1', chatId: 'c1', ownerUserId: 'u1', providerId: 'claude-code',
  providerSessionId: 'sess_8f3a', cwd: '/home/me/proj', status: 'running',
  createdAt: 1700000000000, lastActivityAt: 1700000600000,
} as CurrentSessionView;

describe('ChannelStrip', () => {
  it('shows gateway and active user labels and a disconnect action when enabled', () => {
    const onDisconnect = vi.fn();
    render(
      <ChannelStrip
        plugin={connectedPlugin}
        activeUser={{ id: 'u1', platform: 'weixin', platformUserId: 'wx1', displayName: '张三', role: 'user', createdAt: 1 }}
        gateway="https://gw.example.io"
        busy={false}
        loginState="connected"
        onLogin={vi.fn()}
        onDisconnect={onDisconnect}
      />,
    );
    expect(screen.getByText('微信通道')).toBeTruthy();
    expect(screen.getByText('已连接')).toBeTruthy();
    expect(screen.getByText('网关')).toBeTruthy();
    expect(screen.getByText('当前活跃用户')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '断开连接' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('shows a login button when not enabled', () => {
    render(
      <ChannelStrip
        plugin={null} activeUser={null} gateway={undefined}
        busy={false} loginState="idle" onLogin={vi.fn()} onDisconnect={vi.fn()}
      />,
    );
    expect(screen.getByText('未连接')).toBeTruthy();
    expect(screen.getByRole('button', { name: '扫码登录' })).toBeTruthy();
  });
});

describe('EngineBays', () => {
  it('highlights the active engine with session detail and keeps the other on standby', () => {
    render(
      <EngineBays
        providerStatus={{
          claude: { detected: true, version: '2.0.1', command: '/opt/bin/claude' },
          codex: { detected: false, reason: 'missing_binary', command: '/opt/bin/codex' },
        }}
        plugin={connectedPlugin}
        currentSession={claudeSession}
      />,
    );
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('v2.0.1')).toBeTruthy();
    expect(screen.getByText('未找到可执行文件')).toBeTruthy();
    expect(screen.getByText('/opt/bin/claude')).toBeTruthy();
    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.getByText('sess_8f3a')).toBeTruthy();
    expect(screen.getByText('/home/me/proj')).toBeTruthy();
    expect(screen.getByText('待命')).toBeTruthy();
  });

  it('shows both engines on standby when not connected', () => {
    render(
      <EngineBays
        providerStatus={{ claude: { detected: true, version: '2.0.1' }, codex: { detected: true, version: '0.9.0' } }}
        plugin={{ ...connectedPlugin, enabled: false, connected: false }}
        currentSession={claudeSession}
      />,
    );
    expect(screen.queryByText('当前会话')).toBeNull();
    expect(screen.getAllByText('待命').length).toBe(2);
  });
});
