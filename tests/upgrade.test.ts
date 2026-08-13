import { describe, expect, it, vi } from 'vitest';
import { performUpgrade } from '../src/daemon/upgrade';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function createDeps(overrides: Partial<Parameters<typeof performUpgrade>[0]> = {}) {
  return {
    currentVersion: '0.1.50',
    fetchImpl: vi.fn(async () => jsonResponse({ version: '0.1.52' })) as unknown as typeof fetch,
    install: vi.fn(async () => ({ ok: true as const })),
    restart: vi.fn(async () => undefined),
    log: vi.fn(),
    ...overrides,
  };
}

describe('performUpgrade', () => {
  it('installs the new version and restarts the service', async () => {
    const deps = createDeps();

    const result = await performUpgrade(deps);

    expect(result).toEqual({ outcome: 'upgraded', from: '0.1.50', to: '0.1.52' });
    expect(deps.install).toHaveBeenCalledTimes(1);
    expect(deps.restart).toHaveBeenCalledTimes(1);
  });

  it('skips install and restart when already on the latest version', async () => {
    const deps = createDeps({
      currentVersion: '0.1.52',
      fetchImpl: vi.fn(async () => jsonResponse({ version: '0.1.52' })) as unknown as typeof fetch,
    });

    const result = await performUpgrade(deps);

    expect(result).toEqual({ outcome: 'already-latest', from: '0.1.52', to: '0.1.52' });
    expect(deps.install).not.toHaveBeenCalled();
    expect(deps.restart).not.toHaveBeenCalled();
  });

  it('reinstalls the latest version when forced', async () => {
    const deps = createDeps({ currentVersion: '0.1.52' });

    const result = await performUpgrade({ ...deps, force: true });

    expect(result.outcome).toBe('upgraded');
    expect(deps.install).toHaveBeenCalledTimes(1);
    expect(deps.restart).toHaveBeenCalledTimes(1);
  });

  it('does not restart when the install fails', async () => {
    const deps = createDeps({
      install: vi.fn(async () => ({ ok: false as const, message: 'EACCES: permission denied' })),
    });

    const result = await performUpgrade(deps);

    expect(result).toEqual({
      outcome: 'install-failed',
      from: '0.1.50',
      to: '0.1.52',
      message: 'EACCES: permission denied',
    });
    expect(deps.restart).not.toHaveBeenCalled();
  });

  it('does not install when the latest version cannot be resolved', async () => {
    const deps = createDeps({
      fetchImpl: vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch,
    });

    const result = await performUpgrade(deps);

    expect(result.outcome).toBe('check-failed');
    expect(deps.install).not.toHaveBeenCalled();
    expect(deps.restart).not.toHaveBeenCalled();
  });
});
