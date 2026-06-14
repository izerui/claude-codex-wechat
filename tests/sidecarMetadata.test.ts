import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeProviderSessionSidecar } from '../src/providers/sidecarMetadata';

const tempDirs: string[] = [];

describe('sidecarMetadata', () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }
  });

  it('writes provider sidecar files into the renamed home directory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'bridge-sidecar-'));
    tempDirs.push(home);

    await writeProviderSessionSidecar({
      providerId: 'codex',
      providerSessionId: 'session-1',
      bridgeTag: {
        platform: 'weixin',
        platformUserId: 'wx_user_1',
        chatId: 'chat_1',
      },
      cwd: '/tmp/project',
    }, { HOME: home });

    const sidecarDir = join(home, '.claude-codex-wechat', 'provider-sidecar');
    const files = await readdir(sidecarDir);
    expect(files).toHaveLength(1);

    const content = JSON.parse(await readFile(join(sidecarDir, files[0] || ''), 'utf8')) as Record<string, unknown>;
    expect(content.providerId).toBe('codex');
  });
});
