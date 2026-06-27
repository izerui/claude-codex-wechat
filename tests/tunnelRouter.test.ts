import { describe, expect, it, vi } from 'vitest';
import { TunnelRouter } from '../src/runtime/tunnelRouter';
import type { TunnelProvider, TunnelStatusView } from '../src/runtime/tunnelProvider';

describe('TunnelRouter', () => {
  it('uses the ngrok provider when tunnel.provider is ngrok', async () => {
    const runningStatus: TunnelStatusView = {
      installed: true,
      enabled: true,
      running: true,
      status: 'running',
      publicUrl: 'https://bridge.ngrok-free.app',
    };
    const ngrokProvider: TunnelProvider = {
      getStatus: vi.fn(async () => runningStatus),
      start: vi.fn(async () => runningStatus),
      stop: vi.fn(async (): Promise<TunnelStatusView> => ({ ...runningStatus, enabled: false, running: false, status: 'stopped' })),
      setEnabled: vi.fn(async () => runningStatus),
    };
    const router = new TunnelRouter({
      bridgePort: 8787,
      defaults: {
        ngrok: { enabled: true },
        tunnel: { provider: 'ngrok', enabled: true },
      },
      ngrokProvider,
    });

    const status = await router.getStatus();
    expect(status.publicUrl).toBe('https://bridge.ngrok-free.app');
    expect(ngrokProvider.getStatus).toHaveBeenCalledTimes(1);
  });

  it('uses the relay provider when tunnel.provider is relay', async () => {
    const runningStatus: TunnelStatusView = {
      installed: true,
      enabled: true,
      running: true,
      status: 'running',
      publicUrl: 'https://bridge.ngrok-free.app',
    };
    const stoppedStatus: TunnelStatusView = {
      installed: true,
      enabled: false,
      running: false,
      status: 'stopped',
    };
    const ngrokProvider: TunnelProvider = {
      getStatus: vi.fn(async () => runningStatus),
      start: vi.fn(async () => runningStatus),
      stop: vi.fn(async () => stoppedStatus),
      setEnabled: vi.fn(async () => runningStatus),
    };
    const router = new TunnelRouter({
      bridgePort: 8787,
      defaults: {
        ngrok: { enabled: false },
        tunnel: {
          provider: 'relay',
          enabled: true,
          relay: {
            serverUrl: 'wss://relay.style520.com/agent',
            authToken: 'relay-token',
          },
        },
      },
      ngrokProvider,
    });

    const status = await router.getStatus();
    expect(status.status).toBe('stopped');
    expect(ngrokProvider.getStatus).not.toHaveBeenCalled();
  });
});
