import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { startDaemon } from '../src/daemon/bootstrap';
import type { NgrokManager, NgrokStatusView } from '../src/admin/ngrokRoutes';

describe('ngrok daemon bootstrap', () => {
  it('auto-starts ngrok after the daemon begins listening when enabled in config', async () => {
    const configDir = mkdtempSync(`${tmpdir()}/bridge-ngrok-bootstrap-`);
    const configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      bridge: {
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
        ngrok: {
          enabled: true,
        },
      },
    }, null, 2));

    const runningStatus: NgrokStatusView = {
      installed: true,
      enabled: true,
      running: true,
      status: 'running',
      publicUrl: 'https://bridge.ngrok-free.app',
    };
    const stoppedStatus: NgrokStatusView = {
      installed: true,
      enabled: false,
      running: false,
      status: 'stopped',
    };
    const ngrokManager: NgrokManager = {
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
      ngrokManager,
    });

    expect(ngrokManager.start).toHaveBeenCalledTimes(1);
    await daemon.app.close();
  });
});
