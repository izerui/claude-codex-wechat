/** @vitest-environment jsdom */
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelStrip, EngineBays } from '../../src/web/Cockpit';
import { listDirectory } from '../../src/web/apiClient';

vi.mock('../../src/web/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/web/apiClient')>();
  return { ...actual, listDirectory: vi.fn() };
});

const listDirectoryMock = vi.mocked(listDirectory);

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  listDirectoryMock.mockReset();
  listDirectoryMock.mockImplementation(async (path?: string) => ({
    path: path ?? '/',
    parent: path && path !== '/' ? '/' : null,
    isRoot: !path || path === '/',
    entries: [],
  }));
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

  it('shows the last session on the inactive engine, not on the active one', () => {
    render(
      <EngineBays
        providerStatus={{ claude: { detected: true, version: '2.0.1' }, codex: { detected: true, version: '0.9.0' } }}
        plugin={connectedPlugin}
        currentSession={claudeSession}
        lastProviderSessions={{
          'claude-code': { providerSessionId: 'sess_claude_old', cwd: '/old/claude', updatedAt: 1700000000000 },
          codex: { providerSessionId: 'sess_codex_old', cwd: '/old/codex', updatedAt: 1700000000000 },
        }}
      />,
    );
    // active (claude) shows current session, not its last session
    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.queryByText('sess_claude_old')).toBeNull();
    // inactive (codex) shows the last session
    expect(screen.getByText('最近会话')).toBeTruthy();
    expect(screen.getByText('sess_codex_old')).toBeTruthy();
    expect(screen.getByText('/old/codex')).toBeTruthy();
  });

  it('keeps the inactive engine on standby when it has no last session', () => {
    render(
      <EngineBays
        providerStatus={{ claude: { detected: true, version: '2.0.1' }, codex: { detected: true, version: '0.9.0' } }}
        plugin={connectedPlugin}
        currentSession={claudeSession}
        lastProviderSessions={{}}
      />,
    );
    expect(screen.queryByText('最近会话')).toBeNull();
    expect(screen.getByText('待命')).toBeTruthy();
  });

  it('hides the create buttons when session creation is not allowed', () => {
    render(
      <EngineBays
        providerStatus={{ claude: { detected: true, version: '2.0.1' }, codex: { detected: true, version: '0.9.0' } }}
        plugin={connectedPlugin}
        currentSession={claudeSession}
        canCreateSession={false}
        onCreateSession={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: '新建会话' })).toBeNull();
    expect(screen.queryByRole('button', { name: '新开会话' })).toBeNull();
  });

  it('creates a session from the inactive card using its provider and tree-selected cwd', async () => {
    const onCreateSession = vi.fn();
    // tree roots at '/' and auto-expands the value chain; provide the full path down to a child
    const tree: Record<string, { name: string; path: string; isDirectory: true }[]> = {
      '/': [{ name: 'old', path: '/old', isDirectory: true }],
      '/old': [{ name: 'codex', path: '/old/codex', isDirectory: true }],
      '/old/codex': [{ name: 'sub', path: '/old/codex/sub', isDirectory: true }],
    };
    listDirectoryMock.mockImplementation(async (path?: string) => ({
      path: path ?? '/',
      parent: path && path !== '/' ? '/' : null,
      isRoot: !path || path === '/',
      entries: tree[path ?? '/'] ?? [],
    }));
    render(
      <EngineBays
        providerStatus={{ claude: { detected: true, version: '2.0.1' }, codex: { detected: true, version: '0.9.0' } }}
        plugin={connectedPlugin}
        currentSession={claudeSession}
        canCreateSession
        defaultWorkspace="/default/ws"
        lastProviderSessions={{ codex: { providerSessionId: 'sess_codex_old', cwd: '/old/codex', updatedAt: 1700000000000 } }}
        onCreateSession={onCreateSession}
      />,
    );
    // active claude card offers "新开会话"; inactive codex card offers "新建会话"
    expect(screen.getByRole('button', { name: '新开会话' })).toBeTruthy();
    // open the codex directory picker, then pick a child of its auto-expanded last-session cwd
    fireEvent.click(screen.getByRole('button', { name: 'Codex 工作目录' }));
    const sub = await screen.findByText('sub');
    fireEvent.click(sub);
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }));
    expect(onCreateSession).toHaveBeenCalledWith('codex', '/old/codex/sub');
  });

  it('creates a session from the active card using the current session cwd as default', () => {
    const onCreateSession = vi.fn();
    render(
      <EngineBays
        providerStatus={{ claude: { detected: true, version: '2.0.1' }, codex: { detected: true, version: '0.9.0' } }}
        plugin={connectedPlugin}
        currentSession={claudeSession}
        canCreateSession
        defaultWorkspace="/default/ws"
        onCreateSession={onCreateSession}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '新开会话' }));
    expect(onCreateSession).toHaveBeenCalledWith('claude-code', '/home/me/proj');
  });

  it('shows visible 新会话 text on each create button', () => {
    render(
      <EngineBays
        providerStatus={{ claude: { detected: true, version: '2.0.1' }, codex: { detected: true, version: '0.9.0' } }}
        plugin={connectedPlugin}
        currentSession={claudeSession}
        canCreateSession
        defaultWorkspace="/default/ws"
        onCreateSession={vi.fn()}
      />,
    );
    expect(screen.getAllByText('新会话')).toHaveLength(2);
  });
});
