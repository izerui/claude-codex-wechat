import { mkdtempSync, writeFileSync } from 'node:fs';
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
        provider: 'relay',
        enabled: true,
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'relay-token',
        },
      },
    }, null, 2));

    const runningStatus: TunnelStatusView = {
      installed: true,
      enabled: true,
      running: true,
      status: 'running',
      publicUrl: 'https://relay.style520.com/sjdfh2xxx',
    };
    const stoppedStatus: TunnelStatusView = {
      installed: true,
      enabled: false,
      running: false,
      status: 'stopped',
    };
    const relayProvider: TunnelProvider = {
      getStatus: vi.fn(async () => runningStatus),
      start: vi.fn(async () => runningStatus),
      stop: vi.fn(async () => stoppedStatus),
      setEnabled: vi.fn(async () => runningStatus),
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

  it('constructs and starts a relay provider from config when one is not injected', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-bootstrap-auto-`);
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      bridge: {
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
      },
      tunnel: {
        provider: 'relay',
        enabled: true,
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'relay-token',
        },
      },
    }, null, 2));

    const runningStatus: TunnelStatusView = {
      installed: true,
      enabled: true,
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
          enabled: true,
          relay: {
            serverUrl: 'wss://relay.style520.com/agent',
            authToken: 'relay-token',
          },
        },
      },
    });
    expect(save.statusCode).toBe(200);
    await settingsServer.app.close();

    const runningStatus: TunnelStatusView = {
      installed: true,
      enabled: true,
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
});
