import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startDaemon } from '../src/daemon/bootstrap';

describe('relay runtime integration', () => {
  it('starts the bridge against a real relay-server and exposes the random public URL through the public status API', async () => {
    // @ts-expect-error relay-server standalone package is plain ESM JS for now.
    const { startRelayServer } = await import('../relay-server/src/server.mjs');
    const relay = await startRelayServer({
      port: 0,
      authTokens: ['clrt_1234567890abcdef12345678'],
    });

    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-runtime-`);
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
          serverUrl: `ws://127.0.0.1:${relay.port}/agent`,
          authToken: 'clrt_1234567890abcdef12345678',
        },
      },
    }, null, 2));

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
    });

    try {
      const response = await fetch(`http://127.0.0.1:${daemon.port}/api/tunnel/status`);
      const payload = await response.json() as { running?: boolean; publicUrl?: string };

      expect(response.status).toBe(200);
      expect(payload.running).toBe(true);
      expect(payload.publicUrl).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${relay.port}/[a-z0-9]{10,12}$`));
    } finally {
      await daemon.app.close();
      await relay.close();
    }
  });

  it('accepts relay settings over the admin API and then starts relay through the tunnel control API', async () => {
    // @ts-expect-error relay-server standalone package is plain ESM JS for now.
    const { startRelayServer } = await import('../relay-server/src/server.mjs');
    const relay = await startRelayServer({
      port: 0,
      authTokens: ['clrt_1234567890abcdef12345678'],
    });

    const configDir = mkdtempSync(`${tmpdir()}/bridge-relay-runtime-save-`);
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      bridge: {
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
      },
    }, null, 2));

    const daemon = await startDaemon({
      port: 0,
      host: '127.0.0.1',
      configPath,
      attachFrontend: async () => undefined,
    });

    try {
      const saveResponse = await fetch(`http://127.0.0.1:${daemon.port}/api/settings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          defaultProvider: 'claude-code',
          defaultWorkspace: '/tmp/project',
          tunnel: {
          enabled: true,
          relay: {
            serverUrl: `ws://127.0.0.1:${relay.port}/agent`,
            authToken: 'clrt_1234567890abcdef12345678',
          },
          },
        }),
      });
      expect(saveResponse.status).toBe(200);

      const startResponse = await fetch(`http://127.0.0.1:${daemon.port}/api/tunnel/start`, {
        method: 'POST',
      });
      const startPayload = await startResponse.json() as { running?: boolean; publicUrl?: string };
      expect(startResponse.status).toBe(200);
      expect(startPayload.running).toBe(true);
      expect(startPayload.publicUrl).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${relay.port}/[a-z0-9]{10,12}$`));

      const statusResponse = await fetch(`http://127.0.0.1:${daemon.port}/api/tunnel/status`);
      const statusPayload = await statusResponse.json() as { running?: boolean; publicUrl?: string };
      expect(statusResponse.status).toBe(200);
      expect(statusPayload.running).toBe(true);
      expect(statusPayload.publicUrl).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${relay.port}/[a-z0-9]{10,12}$`));
    } finally {
      await daemon.app.close();
      await relay.close();
    }
  });
});
