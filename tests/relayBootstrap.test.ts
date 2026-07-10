import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { startDaemon } from '../src/daemon/bootstrap';
import type { TunnelProvider, TunnelStatusView } from '../src/runtime/tunnelProvider';
import { RelayTunnelProvider } from '../src/runtime/relayTunnelProvider';
import { createDaemonServer } from '../src/daemon/server';
import { createRuntimeUserStore } from './helpers/runtimeUserStore';

describe('relay daemon bootstrap', () => {
  it('auto-starts relay when relay tunnel config is enabled', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-bootstrap-`);
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      bridge: {
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
      },
      tunnel: {
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'clrt_1234567890abcdef12345678',
        },
      },
    }, null, 2));

    const runningStatus: TunnelStatusView = {
      installed: true,
      running: true,
      status: 'running',
      publicUrl: 'https://relay.style520.com/sjdfh2xxx',
    };
    const stoppedStatus: TunnelStatusView = {
      installed: true,
      running: false,
      status: 'stopped',
    };
    const relayProvider: TunnelProvider = {
      getStatus: vi.fn(async () => runningStatus),
      start: vi.fn(async () => runningStatus),
      stop: vi.fn(async () => stoppedStatus),
    };

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
      tunnelProvider: relayProvider,
    });

    expect(relayProvider.start).toHaveBeenCalledTimes(1);
    await daemon.app.close();
  });

  it('config 无 authToken（首启）也连接 relay——token 会被确保生成，新旧 token 都连', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-bootstrap-notoken-`);
    const configPath = join(configDir, 'config.json');
    // config 里没有 tunnel/authToken：token 由 ensureRelayAuthTokenSync 在本次启动生成，
    // 门控用【本次确保后的】token 判断，因此首启也应连接 relay（不能等下次重启）。
    writeFileSync(configPath, JSON.stringify({
      bridge: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    }, null, 2));

    const runningStatus: TunnelStatusView = {
      installed: true,
      running: true,
      status: 'running',
      publicUrl: 'https://relay.style520.com/abc123',
    };
    const relayProvider: TunnelProvider = {
      getStatus: vi.fn(async () => runningStatus),
      start: vi.fn(async () => runningStatus),
      stop: vi.fn(async () => ({ installed: true, running: false, status: 'stopped' } as TunnelStatusView)),
    };

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
      tunnelProvider: relayProvider,
    });

    expect(relayProvider.start).toHaveBeenCalledTimes(1);
    await daemon.app.close();
  });

  it('relay 已配置但连接迟迟不完成（离线握手挂起）时，daemon 启动不被阻塞', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-bootstrap-nonblock-`);
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      tunnel: { relay: { serverUrl: 'wss://relay.style520.com/agent', authToken: 'clrt_1234567890abcdef12345678' } },
    }, null, 2));

    // start() 返回一个一直不 resolve 的 promise，模拟 relay 连不上时握手挂起。
    // 若启动是 await start()，startDaemon 会挂在这里超时；非阻塞则应立即返回。
    let releaseStart: (() => void) | undefined;
    const relayProvider: TunnelProvider = {
      getStatus: vi.fn(async () => ({ installed: true, running: false, status: 'stopped' } as TunnelStatusView)),
      start: vi.fn(() => new Promise<TunnelStatusView>((resolve) => {
        releaseStart = () => resolve({ installed: true, running: true, status: 'running' });
      })),
      stop: vi.fn(async () => ({ installed: true, running: false, status: 'stopped' } as TunnelStatusView)),
    };

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
      tunnelProvider: relayProvider,
    });

    expect(relayProvider.start).toHaveBeenCalledTimes(1); // 有配置 → 后台发起了连接
    await daemon.app.close();
    releaseStart?.(); // 清理悬挂的 start promise
  });

  it('constructs and starts a relay provider from config when one is not injected', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-bootstrap-auto-`);
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      bridge: {
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
      },
      tunnel: {
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'clrt_1234567890abcdef12345678',
        },
      },
    }, null, 2));

    const runningStatus: TunnelStatusView = {
      installed: true,
      running: true,
      status: 'running',
      publicUrl: 'https://relay.style520.com/sjdfh2xxx',
    };
    const startSpy = vi.spyOn(RelayTunnelProvider.prototype, 'start').mockResolvedValue(runningStatus);

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
    });

    expect(startSpy).toHaveBeenCalledTimes(1);
    await daemon.app.close();
    startSpy.mockRestore();
  });

  it('auto-starts relay after settings API persisted relay config and the daemon restarted', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-bootstrap-settings-`);
    const configPath = join(configDir, 'config.json');
    const settingsServer = createDaemonServer({
      configPath,
      activeUserStore: createRuntimeUserStore('bridge-relay-bootstrap-settings-store-').activeUserStore,
    });

    const save = await settingsServer.app.inject({
      method: 'POST',
      url: '/api/settings',
        payload: {
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
          tunnel: {
            relay: {
              serverUrl: 'wss://relay.style520.com/agent',
              authToken: 'clrt_1234567890abcdef12345678',
          },
        },
      },
    });
    expect(save.statusCode).toBe(200);
    await settingsServer.app.close();

    const runningStatus: TunnelStatusView = {
      installed: true,
      running: true,
      status: 'running',
      publicUrl: 'https://relay.style520.com/sjdfh2xxx',
    };
    const startSpy = vi.spyOn(RelayTunnelProvider.prototype, 'start').mockResolvedValue(runningStatus);

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
    });

    expect(startSpy).toHaveBeenCalledTimes(1);
    await daemon.app.close();
    startSpy.mockRestore();
  });

  it('boot 把 bridge 默认值与 relay 配置写全 config.json（记录最后状态）', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-bootstrap-persist-`);
    const configPath = join(configDir, 'config.json');
    // 起始 config 几乎为空：既没有 tunnel，也没有 bridge 默认值。
    writeFileSync(configPath, JSON.stringify({}, null, 2));

    const runningStatus: TunnelStatusView = { installed: true, running: true, status: 'running' };
    const relayProvider: TunnelProvider = {
      getStatus: vi.fn(async () => runningStatus),
      start: vi.fn(async () => runningStatus),
      stop: vi.fn(async () => ({ installed: true, running: false, status: 'stopped' } as TunnelStatusView)),
    };

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
      tunnelProvider: relayProvider,
    });
    await daemon.app.close();

    const persisted = JSON.parse(readFileSync(configPath, 'utf8'));
    // relay 配置写全：serverUrl + authToken 都在文件里
    expect(persisted.tunnel?.relay?.serverUrl).toBe('wss://wechat.style520.com/agent');
    expect(typeof persisted.tunnel?.relay?.authToken).toBe('string');
    expect(persisted.tunnel.relay.authToken).toMatch(/^clrt_/);
    // bridge 默认值也写全（记录最后状态）：未配 defaultWorkspace 时写入的是有效值 process.cwd()
    expect(persisted.bridge?.defaultProvider).toBe('claude-code');
    expect(persisted.bridge?.defaultWorkspace).toBe(process.cwd());
  });

  it('boot 保留用户显式配置的 bridge 默认值', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-bootstrap-persist-explicit-`);
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      bridge: { defaultProvider: 'codex', defaultWorkspace: '/Users/me/proj' },
    }, null, 2));

    const runningStatus: TunnelStatusView = { installed: true, running: true, status: 'running' };
    const relayProvider: TunnelProvider = {
      getStatus: vi.fn(async () => runningStatus),
      start: vi.fn(async () => runningStatus),
      stop: vi.fn(async () => ({ installed: true, running: false, status: 'stopped' } as TunnelStatusView)),
    };

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
      tunnelProvider: relayProvider,
    });
    await daemon.app.close();

    const persisted = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(persisted.bridge?.defaultProvider).toBe('codex');
    expect(persisted.bridge?.defaultWorkspace).toBe('/Users/me/proj');
  });
});
