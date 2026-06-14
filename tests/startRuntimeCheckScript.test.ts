import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

describe('start-runtime-check credential loading', () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }
  });

  it('documents env credential exports in helper output format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-check-script-'));
    tempDirs.push(dir);
    const envFile = join(dir, 'bridge-weixin.env');
    await writeFile(envFile, [
      "export BRIDGE_WECHAT_BASE_URL='https://ilinkai.weixin.qq.com'",
      "export BRIDGE_WECHAT_TOKEN='wx-token-1'",
      "export BRIDGE_WECHAT_ACCOUNT_ID='wx-account-1'",
      'export BRIDGE_WECHAT_ENABLED=1',
      '',
    ].join('\n'), 'utf8');

    const content = await readFile(envFile, 'utf8');
    expect(content).toContain("export BRIDGE_WECHAT_TOKEN='wx-token-1'");
    expect(content).toContain("export BRIDGE_WECHAT_ACCOUNT_ID='wx-account-1'");
  });
});
