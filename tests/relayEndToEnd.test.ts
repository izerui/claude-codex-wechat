import { describe, expect, it } from 'vitest';
import { RelayTunnelProvider } from '../src/runtime/relayTunnelProvider';

describe('relay end-to-end', () => {
  it('connects the bridge relay provider to relay-server and receives a random public URL', async () => {
    // @ts-expect-error relay-server standalone package is plain ESM JS for now.
    const { startRelayServer } = await import('../relay-server/src/server.mjs');
    const relay = await startRelayServer({
      port: 0,
      baseDomain: 'style520.com',
      authToken: 'relay-token',
    });

    try {
      const provider = new RelayTunnelProvider({
        serverUrl: `ws://127.0.0.1:${relay.port}/agent`,
        authToken: 'relay-token',
        targetBaseUrl: 'http://127.0.0.1:8787',
        createSocket: RelayTunnelProvider.defaultCreateSocket,
      });

      const status = await provider.start();

      expect(status.running).toBe(true);
      expect(status.publicUrl).toMatch(/^https:\/\/style520\.com\/[a-z0-9]{10,12}$/);
      await provider.stop();
    } finally {
      await relay.close();
    }
  });
});
