// Operational script:
// Local helper for WeChat QR login. Generates a QR SVG, auto-opens it, tracks
// login state, refreshes expired QR tickets, and writes reusable credential files.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { WeixinDirectLoginClient } from '../src/channels/weixin-direct/loginClient';
import { defaultConfigPath } from '../src/daemon/config';
import { persistWechatCredentialsToConfigFile } from '../src/daemon/configPersistence';

export function renderQrSvgDocument(qrcodeData: string): string {
  const qr = renderToStaticMarkup(
    React.createElement(QRCodeSVG, {
      value: qrcodeData,
      size: 320,
      marginSize: 2,
      bgColor: '#ffffff',
      fgColor: '#111827',
      title: '微信登录二维码',
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${qr}`;
}

export async function renderWeixinCredentialFiles(input: {
  jsonPath: string;
  envPath: string;
  accountId: string;
  botToken: string;
  baseUrl: string;
}): Promise<void> {
  await mkdir(dirname(input.jsonPath), { recursive: true });
  await mkdir(dirname(input.envPath), { recursive: true });
  await writeFile(input.jsonPath, JSON.stringify({
    wechat: {
      enabled: true,
      baseUrl: input.baseUrl,
      token: input.botToken,
      accountId: input.accountId,
    },
  }, null, 2), 'utf8');
  await writeFile(input.envPath, [
    `export BRIDGE_WECHAT_BASE_URL='${escapeShell(input.baseUrl)}'`,
    `export BRIDGE_WECHAT_TOKEN='${escapeShell(input.botToken)}'`,
    `export BRIDGE_WECHAT_ACCOUNT_ID='${escapeShell(input.accountId)}'`,
    'export BRIDGE_WECHAT_ENABLED=1',
    '',
  ].join('\n'), 'utf8');
}

export async function persistWeixinCredentialsToBridgeConfig(input: {
  configPath: string;
  accountId: string;
  botToken: string;
  baseUrl: string;
}): Promise<void> {
  await persistWechatCredentialsToConfigFile({
    configPath: input.configPath,
    accountId: input.accountId,
    token: input.botToken,
    baseUrl: input.baseUrl,
  });
}

export async function clearWeixinCredentialFiles(input: {
  jsonPath: string;
  envPath: string;
}): Promise<void> {
  await rm(input.jsonPath, { force: true });
  await rm(input.envPath, { force: true });
}

export async function writeWeixinLoginStateFile(path: string, state: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function pollWeixinLoginUntilConfirmed(input: {
  pollIntervalMs: number;
  fetchQrCode: () => Promise<{ ticket: string; qrcodeData: string }>;
  pollQrCodeStatus: (ticket: string) => Promise<
    | { status: 'waiting' }
    | { status: 'scanned' }
    | { status: 'confirmed'; accountId: string; botToken: string; baseUrl: string }
    | { status: 'expired' }
  >;
  onQrCode: (qr: { ticket: string; qrcodeData: string }) => Promise<void>;
  onStatus: (status: Record<string, unknown>) => Promise<void>;
}): Promise<{
  ticket: string;
  accountId: string;
  botToken: string;
  baseUrl: string;
}> {
  let qr = await input.fetchQrCode();
  await input.onQrCode(qr);

  while (true) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, input.pollIntervalMs));
    const status = await input.pollQrCodeStatus(qr.ticket);
    if (status.status === 'waiting') {
      await input.onStatus({ stage: 'waiting', ticket: qr.ticket });
      continue;
    }
    if (status.status === 'scanned') {
      await input.onStatus({ stage: 'scanned', ticket: qr.ticket });
      continue;
    }
    if (status.status === 'expired') {
      await input.onStatus({ stage: 'expired', ticket: qr.ticket });
      qr = await input.fetchQrCode();
      await input.onQrCode(qr);
      continue;
    }
    await input.onStatus({
      stage: 'confirmed',
      ticket: qr.ticket,
      accountId: status.accountId,
      botToken: status.botToken,
      baseUrl: status.baseUrl,
    });
    return {
      ticket: qr.ticket,
      accountId: status.accountId,
      botToken: status.botToken,
      baseUrl: status.baseUrl,
    };
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.BRIDGE_WECHAT_BASE_URL || 'https://ilinkai.weixin.qq.com';
  const outputPath = resolve(process.env.BRIDGE_WECHAT_QR_OUTPUT || '/tmp/bridge-weixin-login-qr.svg');
  const pollIntervalMs = Number(process.env.BRIDGE_WECHAT_LOGIN_POLL_MS || '2000');
  const credentialsJsonPath = resolve(process.env.BRIDGE_WECHAT_CREDENTIALS_JSON || '/tmp/bridge-weixin-credentials.json');
  const credentialsEnvPath = resolve(process.env.BRIDGE_WECHAT_CREDENTIALS_ENV || '/tmp/bridge-weixin.env');
  const statePath = resolve(process.env.BRIDGE_WECHAT_LOGIN_STATE || '/tmp/bridge-weixin-login-state.json');
  const bridgeConfigPath = resolve(process.env.BRIDGE_CONFIG || defaultConfigPath());
  let refreshCount = 0;

  const client = new WeixinDirectLoginClient({
    baseUrl,
    pollIntervalMs,
  });
  await clearWeixinCredentialFiles({
    jsonPath: credentialsJsonPath,
    envPath: credentialsEnvPath,
  });

  const confirmed = await pollWeixinLoginUntilConfirmed({
    pollIntervalMs,
    fetchQrCode: async () => await client.fetchQrCode(),
    pollQrCodeStatus: async (ticket) => await client.pollQrCodeStatus(ticket),
    onQrCode: async (qr) => {
      refreshCount += 1;
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, renderQrSvgDocument(qr.qrcodeData), 'utf8');
      const qrOpened = await tryOpenQrFile(outputPath);
      await writeWeixinLoginStateFile(statePath, {
        stage: 'qr',
        ticket: qr.ticket,
        qrcodeData: qr.qrcodeData,
        qrSvgPath: outputPath,
        qrOpened,
        refreshCount,
        updatedAt: new Date().toISOString(),
        credentialsJsonPath,
        credentialsEnvPath,
        statePath,
      });
      console.log(JSON.stringify({
        stage: 'qr',
        ticket: qr.ticket,
        qrcodeData: qr.qrcodeData,
        qrSvgPath: outputPath,
        qrOpened,
        refreshCount,
        updatedAt: new Date().toISOString(),
        credentialsJsonPath,
        credentialsEnvPath,
        statePath,
        next: 'scan_with_wechat_and_wait_for_confirmation',
      }, null, 2));
    },
    onStatus: async (status) => {
      await writeWeixinLoginStateFile(statePath, {
        ...status,
        refreshCount,
        updatedAt: new Date().toISOString(),
        statePath,
      });
      console.log(JSON.stringify({
        ...status,
        refreshCount,
        updatedAt: new Date().toISOString(),
        statePath,
      }, null, 2));
    },
  });

  await renderWeixinCredentialFiles({
    jsonPath: credentialsJsonPath,
    envPath: credentialsEnvPath,
    accountId: confirmed.accountId,
    botToken: confirmed.botToken,
    baseUrl: confirmed.baseUrl,
  });
  await persistWeixinCredentialsToBridgeConfig({
    configPath: bridgeConfigPath,
    accountId: confirmed.accountId,
    botToken: confirmed.botToken,
    baseUrl: confirmed.baseUrl,
  });
  await writeWeixinLoginStateFile(statePath, {
    stage: 'confirmed',
    ticket: confirmed.ticket,
    accountId: confirmed.accountId,
    botToken: confirmed.botToken,
    baseUrl: confirmed.baseUrl,
    refreshCount,
    updatedAt: new Date().toISOString(),
    credentialsJsonPath,
    credentialsEnvPath,
    bridgeConfigPath,
    statePath,
  });
  console.log(JSON.stringify({
    stage: 'confirmed',
    ticket: confirmed.ticket,
    accountId: confirmed.accountId,
    botToken: confirmed.botToken,
    baseUrl: confirmed.baseUrl,
    refreshCount,
    updatedAt: new Date().toISOString(),
    credentialsJsonPath,
    credentialsEnvPath,
    bridgeConfigPath,
    statePath,
  }, null, 2));
}

function escapeShell(input: string): string {
  return input.replaceAll("'", "'\"'\"'");
}

async function tryOpenQrFile(path: string): Promise<boolean> {
  const command = resolveOpenCommand();
  if (!command) return false;
  return await new Promise((resolve) => {
    const child = spawn(command, [path], {
      stdio: 'ignore',
      detached: true,
    });
    child.on('error', () => resolve(false));
    child.on('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

function resolveOpenCommand(): string | null {
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'linux') return 'xdg-open';
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
