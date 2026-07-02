import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compareSemver, createUpdateChecker, isNewerVersion } from '../src/daemon/updateChecker';
import { persistUpdateStatusToConfigFile } from '../src/daemon/configPersistence';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe('compareSemver / isNewerVersion', () => {
  it('compares numeric cores', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
    expect(compareSemver('1.3.0', '1.2.9')).toBe(1);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
  });

  it('returns null for unparseable versions', () => {
    expect(compareSemver('abc', '1.2.3')).toBeNull();
    expect(compareSemver('1.2', '1.2.3')).toBeNull();
  });

  it('treats prerelease latest as not-newer', () => {
    expect(isNewerVersion('1.3.0-beta.1', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.3.0', '1.2.0')).toBe(true);
    expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.1.0', '1.2.0')).toBe(false);
  });
});

describe('createUpdateChecker', () => {
  const base = { currentVersion: '0.1.19', configPath: '/tmp/x/config.json', now: () => 1000 };

  it('persists updateAvailable=true when registry has a newer version', async () => {
    const persist = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => jsonResponse({ version: '0.1.23' }));
    const checker = createUpdateChecker({ ...base, fetchImpl: fetchImpl as never, persist });
    await checker.checkOnce();
    expect(persist).toHaveBeenCalledWith({
      configPath: base.configPath,
      status: { currentVersion: '0.1.19', latestVersion: '0.1.23', updateAvailable: true, lastCheckedAt: 1000 },
    });
  });

  it('persists updateAvailable=false when already latest', async () => {
    const persist = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => jsonResponse({ version: '0.1.19' }));
    const checker = createUpdateChecker({ ...base, fetchImpl: fetchImpl as never, persist });
    await checker.checkOnce();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      status: expect.objectContaining({ latestVersion: '0.1.19', updateAvailable: false }),
    }));
  });

  it('does not persist when the fetch fails (keeps last result)', async () => {
    const persist = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const checker = createUpdateChecker({ ...base, fetchImpl: fetchImpl as never, persist });
    await checker.checkOnce();
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not persist on a non-ok response or unparseable version', async () => {
    const persist = vi.fn(async () => {});
    const notOk = createUpdateChecker({ ...base, persist, fetchImpl: (async () => jsonResponse({ version: '0.1.23' }, false)) as never });
    await notOk.checkOnce();
    const garbage = createUpdateChecker({ ...base, persist, fetchImpl: (async () => jsonResponse({ version: 'nope' })) as never });
    await garbage.checkOnce();
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('persistUpdateStatusToConfigFile', () => {
  it('merges the update block without clobbering other config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'update-cfg-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      wechat: { enabled: true, token: 'keep-me' },
      tunnel: { relay: { authToken: 'clrt_keep' } },
    }, null, 2));

    persistUpdateStatusToConfigFile({
      configPath,
      status: { currentVersion: '0.1.19', latestVersion: '0.1.23', updateAvailable: true, lastCheckedAt: 42 },
    });

    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written.wechat).toEqual({ enabled: true, token: 'keep-me' });
    expect(written.tunnel).toEqual({ relay: { authToken: 'clrt_keep' } });
    expect(written.update).toEqual({ currentVersion: '0.1.19', latestVersion: '0.1.23', updateAvailable: true, lastCheckedAt: 42 });
  });
});
