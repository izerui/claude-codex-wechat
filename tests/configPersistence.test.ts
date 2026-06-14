import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { persistWechatCredentialsToConfigFile } from '../src/daemon/configPersistence';

const tempDirs: string[] = [];

describe('config persistence', () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }
  });

  it('creates a formal config file when missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'config-persistence-'));
    tempDirs.push(dir);
    const configPath = join(dir, 'config.json');

    await persistWechatCredentialsToConfigFile({
      configPath,
      accountId: 'wx-account-1',
      token: 'wx-token-1',
      baseUrl: 'https://ilinkai.weixin.qq.com',
    });

    expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-token-1',
        accountId: 'wx-account-1',
      },
    });
  });

  it('updates only wechat credentials while preserving existing formal config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'config-persistence-'));
    tempDirs.push(dir);
    const configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({
      databasePath: '/tmp/bridge.sqlite',
      providers: {
        claude: { command: '/opt/bin/claude' },
        codex: { command: '/opt/bin/codex' },
      },
      wechat: {
        enabled: false,
        baseUrl: 'https://old.example.com',
        token: 'old-token',
        accountId: 'old-account',
      },
    }, null, 2), 'utf8');

    await persistWechatCredentialsToConfigFile({
      configPath,
      accountId: 'wx-account-1',
      token: 'wx-token-1',
      baseUrl: 'https://ilinkai.weixin.qq.com',
    });

    expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({
      databasePath: '/tmp/bridge.sqlite',
      providers: {
        claude: { command: '/opt/bin/claude' },
        codex: { command: '/opt/bin/codex' },
      },
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-token-1',
        accountId: 'wx-account-1',
      },
    });
  });
});
