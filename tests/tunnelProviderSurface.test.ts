import { describe, expect, it, vi } from 'vitest';
import type { TunnelProvider, TunnelStatusView } from '../src/runtime/tunnelProvider';

describe('tunnel provider surface', () => {
  it('supports a provider-neutral runtime status contract', async () => {
    const status: TunnelStatusView = {
      installed: true,
      running: true,
      status: 'running',
      publicUrl: 'https://bridge.example.com',
    };
    const provider: TunnelProvider = {
      getStatus: vi.fn(async () => status),
      start: vi.fn(async () => status),
      stop: vi.fn(async (): Promise<TunnelStatusView> => ({ ...status, running: false, status: 'stopped' })),
    };

    await expect(provider.getStatus()).resolves.toEqual(status);
  });
});
