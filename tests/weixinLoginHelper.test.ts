import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearWeixinCredentialFiles,
  persistWeixinCredentialsToBridgeConfig,
  pollWeixinLoginUntilConfirmed,
  renderQrSvgDocument,
  renderWeixinCredentialFiles,
  writeWeixinLoginStateFile,
} from '../scripts/weixin-login-helper';

const tempDirs: string[] = [];

describe('weixin login helper', () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }
  });

  it('renders an SVG QR document with the qrcode data embedded', () => {
    const svg = renderQrSvgDocument('https://liteapp.weixin.qq.com/q/test');
    expect(svg).toContain('<svg');
    expect(svg).toContain('微信登录二维码');
  });

  it('writes reusable credential files after login confirmation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weixin-login-helper-'));
    tempDirs.push(dir);
    const jsonPath = join(dir, 'weixin-credentials.json');
    const envPath = join(dir, 'weixin.env');

    await renderWeixinCredentialFiles({
      jsonPath,
      envPath,
      accountId: 'wx-account-1',
      botToken: 'wx-token-1',
      baseUrl: 'https://ilinkai.weixin.qq.com',
    });

    expect(JSON.parse(await readFile(jsonPath, 'utf8'))).toEqual({
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-token-1',
        accountId: 'wx-account-1',
      },
    });
    expect(await readFile(envPath, 'utf8')).toContain("export BRIDGE_WECHAT_TOKEN='wx-token-1'");
    expect(await readFile(envPath, 'utf8')).toContain("export BRIDGE_WECHAT_ACCOUNT_ID='wx-account-1'");
    expect(await readFile(envPath, 'utf8')).toContain("export BRIDGE_WECHAT_BASE_URL='https://ilinkai.weixin.qq.com'");
  });

  it('persists confirmed credentials into the formal bridge config file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weixin-login-helper-'));
    tempDirs.push(dir);
    const configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify({
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

    await persistWeixinCredentialsToBridgeConfig({
      configPath,
      accountId: 'wx-account-1',
      botToken: 'wx-token-1',
      baseUrl: 'https://ilinkai.weixin.qq.com',
    });

    expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({
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

  it('clears stale credential files before a fresh login run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weixin-login-helper-'));
    tempDirs.push(dir);
    const jsonPath = join(dir, 'weixin-credentials.json');
    const envPath = join(dir, 'weixin.env');
    await writeFile(jsonPath, '{"old":true}', 'utf8');
    await writeFile(envPath, 'export BRIDGE_WECHAT_TOKEN=old', 'utf8');

    await clearWeixinCredentialFiles({ jsonPath, envPath });

    await expect(readFile(jsonPath, 'utf8')).rejects.toThrow();
    await expect(readFile(envPath, 'utf8')).rejects.toThrow();
  });

  it('writes a machine-readable login state file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weixin-login-helper-'));
    tempDirs.push(dir);
    const statePath = join(dir, 'weixin-login-state.json');

    await writeWeixinLoginStateFile(statePath, {
      stage: 'scanned',
      ticket: 'ticket_123',
      updatedAt: '2026-06-14T06:00:00.000Z',
      refreshCount: 1,
    });

    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({
      stage: 'scanned',
      ticket: 'ticket_123',
      updatedAt: '2026-06-14T06:00:00.000Z',
      refreshCount: 1,
    });
  });

  it('refreshes the qr ticket automatically after expiration', async () => {
    let fetchCount = 0;
    const fetchQrCode = async () => {
      fetchCount += 1;
      return {
        ticket: `ticket_${fetchCount}`,
        qrcodeData: `https://liteapp.weixin.qq.com/q/${fetchCount}`,
      };
    };
    const statusResponses: Array<
      | { status: 'waiting' }
      | { status: 'expired' }
      | { status: 'confirmed'; accountId: string; botToken: string; baseUrl: string }
    > = [
      { status: 'expired' },
      { status: 'confirmed', accountId: 'wx-account-1', botToken: 'wx-token-1', baseUrl: 'https://ilinkai.weixin.qq.com' },
    ];
    const statusCalls: string[] = [];

    const result = await pollWeixinLoginUntilConfirmed({
      pollIntervalMs: 1,
      fetchQrCode,
      pollQrCodeStatus: async (ticket) => {
        statusCalls.push(ticket);
        const next = statusResponses.shift();
        if (!next) throw new Error('missing status response');
        return next;
      },
      onQrCode: async () => undefined,
      onStatus: async () => undefined,
    });

    expect(result.ticket).toBe('ticket_2');
    expect(result.accountId).toBe('wx-account-1');
    expect(statusCalls).toEqual(['ticket_1', 'ticket_2']);
  });

  it('emits waiting heartbeats while polling the same qr ticket', async () => {
    const events: Array<Record<string, unknown>> = [];
    const resultPromise = pollWeixinLoginUntilConfirmed({
      pollIntervalMs: 1,
      fetchQrCode: async () => ({
        ticket: 'ticket_1',
        qrcodeData: 'https://liteapp.weixin.qq.com/q/1',
      }),
      pollQrCodeStatus: async () => (
        events.length < 2
          ? { status: 'waiting' as const }
          : { status: 'confirmed' as const, accountId: 'wx-account-1', botToken: 'wx-token-1', baseUrl: 'https://ilinkai.weixin.qq.com' }
      ),
      onQrCode: async () => undefined,
      onStatus: async (status) => {
        events.push(status);
      },
    });

    const result = await resultPromise;

    expect(result.ticket).toBe('ticket_1');
    expect(events.some((event) => event.stage === 'waiting')).toBe(true);
    expect(events.at(-1)?.stage).toBe('confirmed');
  });
});
