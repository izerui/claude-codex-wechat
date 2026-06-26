import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { NgrokManager } from '../src/runtime/ngrokManager';

class FakeChild extends EventEmitter {
  pid = 1234;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn();
  stderr = new EventEmitter();
}

describe('NgrokManager', () => {
  it('reports not_installed when ngrok is missing', async () => {
    const manager = new NgrokManager({
      port: 8787,
      enabled: true,
      findExecutable: vi.fn(async () => undefined),
      spawnNgrok: vi.fn(),
      fetchTunnels: vi.fn(),
    });

    const status = await manager.start();

    expect(status).toEqual({
      installed: false,
      enabled: true,
      running: false,
      status: 'not_installed',
      error: 'ngrok_not_installed',
    });
  });

  it('reports installed on status checks before the first start attempt', async () => {
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(),
      fetchTunnels: vi.fn(),
    });

    const status = await manager.getStatus();

    expect(status).toMatchObject({
      installed: true,
      enabled: false,
      running: false,
      status: 'stopped',
    });
  });

  it('hydrates publicUrl from tunnel inspection while already running', async () => {
    const child = new FakeChild();
    const fetchTunnels = vi.fn()
      .mockResolvedValueOnce({
        tunnels: [],
      })
      .mockResolvedValueOnce({
        tunnels: [{ public_url: 'https://secure.ngrok-free.app' }],
      });
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(() => child as never),
      fetchTunnels,
      sleep: vi.fn(async () => undefined),
    });

    await manager.start();
    const status = await manager.getStatus();

    expect(status).toMatchObject({
      installed: true,
      enabled: true,
      running: true,
      status: 'running',
      publicUrl: 'https://secure.ngrok-free.app',
    });
  });

  it('starts ngrok and resolves the https public URL', async () => {
    const child = new FakeChild();
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(() => child as never),
      fetchTunnels: vi.fn(async () => ({
        tunnels: [
          { public_url: 'http://plain.ngrok-free.app' },
          { public_url: 'https://secure.ngrok-free.app' },
        ],
      })),
    });

    const status = await manager.start();

    expect(status).toMatchObject({
      installed: true,
      enabled: true,
      running: true,
      status: 'running',
      publicUrl: 'https://secure.ngrok-free.app',
    });
  });

  it('does not spawn a second process when start is called repeatedly', async () => {
    const child = new FakeChild();
    const spawnNgrok = vi.fn(() => child as never);
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok,
      fetchTunnels: vi.fn(async () => ({
        tunnels: [{ public_url: 'https://secure.ngrok-free.app' }],
      })),
    });

    await manager.start();
    await manager.start();

    expect(spawnNgrok).toHaveBeenCalledTimes(1);
  });

  it('hydrates publicUrl when start is called again on an already running tunnel', async () => {
    const child = new FakeChild();
    const fetchTunnels = vi.fn()
      .mockResolvedValueOnce({
        tunnels: [],
      })
      .mockResolvedValueOnce({
        tunnels: [{ public_url: 'https://secure.ngrok-free.app' }],
      });
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(() => child as never),
      fetchTunnels,
      sleep: vi.fn(async () => undefined),
    });

    await manager.start();
    const status = await manager.start();

    expect(status).toMatchObject({
      installed: true,
      enabled: true,
      running: true,
      status: 'running',
      publicUrl: 'https://secure.ngrok-free.app',
    });
  });

  it('retries tunnel discovery briefly before reporting success', async () => {
    const child = new FakeChild();
    const fetchTunnels = vi.fn()
      .mockRejectedValueOnce(new Error('ngrok_tunnels_failed:404'))
      .mockRejectedValueOnce(new Error('ngrok_tunnels_failed:404'))
      .mockResolvedValue({
        tunnels: [{ public_url: 'https://secure.ngrok-free.app' }],
      });
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(() => child as never),
      fetchTunnels,
      sleep: vi.fn(async () => undefined),
    });

    const status = await manager.start();

    expect(fetchTunnels).toHaveBeenCalledTimes(3);
    expect(status).toMatchObject({
      installed: true,
      enabled: true,
      running: true,
      status: 'running',
      publicUrl: 'https://secure.ngrok-free.app',
    });
  });

  it('stops a running child and clears the public URL', async () => {
    const child = new FakeChild();
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(() => child as never),
      fetchTunnels: vi.fn(async () => ({
        tunnels: [{ public_url: 'https://secure.ngrok-free.app' }],
      })),
      terminateChild: vi.fn(),
    });

    await manager.start();
    const status = await manager.stop();

    expect(status).toMatchObject({
      installed: true,
      enabled: false,
      running: false,
      status: 'stopped',
    });
    expect(status.publicUrl).toBeUndefined();
  });

  it('switches to error when the ngrok child exits unexpectedly', async () => {
    const child = new FakeChild();
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(() => child as never),
      fetchTunnels: vi.fn(async () => ({
        tunnels: [{ public_url: 'https://secure.ngrok-free.app' }],
      })),
    });

    await manager.start();
    child.emit('exit', 1, null);

    await expect(manager.getStatus()).resolves.toMatchObject({
      installed: true,
      enabled: true,
      running: false,
      status: 'error',
      error: 'ngrok_exited:1',
    });
  });

  it('includes startup stderr context when tunnel discovery never succeeds', async () => {
    const child = new FakeChild();
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(() => child as never),
      fetchTunnels: vi.fn(async () => {
        child.stderr.emit('data', Buffer.from('authentication failed'));
        throw new Error('ngrok_tunnels_failed:404');
      }),
      sleep: vi.fn(async () => undefined),
    });

    const status = await manager.start();

    expect(status).toMatchObject({
      installed: true,
      enabled: true,
      running: false,
      status: 'error',
    });
    expect(status.error).toContain('authentication failed');
  });

  it('includes recent stderr when the ngrok child exits after startup', async () => {
    const child = new FakeChild();
    const manager = new NgrokManager({
      port: 8787,
      enabled: false,
      findExecutable: vi.fn(async () => '/opt/homebrew/bin/ngrok'),
      spawnNgrok: vi.fn(() => child as never),
      fetchTunnels: vi.fn(async () => ({
        tunnels: [{ public_url: 'https://secure.ngrok-free.app' }],
      })),
    });

    await manager.start();
    child.stderr.emit('data', Buffer.from('tunnel disconnected'));
    child.emit('exit', 1, null);

    const status = await manager.getStatus();
    expect(status.error).toContain('tunnel disconnected');
  });
});
