import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProviderId } from '../providers/types';
import type { ActiveWeChatUserRecord } from '../storage/userStore';
import type { BridgeConfig, UpdateStatusConfig } from './config';

export async function persistWechatCredentialsToConfigFile(input: {
  configPath: string;
  accountId: string;
  token: string;
  baseUrl: string;
}): Promise<void> {
  const currentConfig = await readConfigFile(input.configPath);
  const nextConfig = {
    ...currentConfig,
    wechat: {
      ...(isRecord(currentConfig.wechat) ? currentConfig.wechat : {}),
      enabled: true,
      baseUrl: input.baseUrl,
      token: input.token,
      accountId: input.accountId,
    },
  };

  await mkdir(dirname(input.configPath), { recursive: true });
  await writeFile(input.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

export async function deleteConfigFile(configPath: string): Promise<void> {
  try {
    await rm(configPath);
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }
}

// 更新检测结果写入。刻意使用**同步** read-modify-write（与 config 的其它写入者
// currentConversationStore / runtimeUserStore / lastProviderSessionStore /
// weixinStateStore 一致）：在单线程 event loop 里，同步的“读→改→写”整体原子、
// 不会和别的同步写交错，也不会被 /api/status 的同步 readFileSync 读到中间态。
// 若改成异步 writeFile，就会在 await 间隙里被其它同步写覆盖——那正是要避免的并发窗口。
export function persistUpdateStatusToConfigFile(input: {
  configPath: string;
  status: UpdateStatusConfig;
}): void {
  const currentConfig = readConfigFileSync(input.configPath);
  const nextConfig = {
    ...currentConfig,
    update: {
      ...(input.status.currentVersion ? { currentVersion: input.status.currentVersion } : {}),
      ...(input.status.latestVersion ? { latestVersion: input.status.latestVersion } : {}),
      updateAvailable: input.status.updateAvailable,
      ...(input.status.lastCheckedAt !== undefined ? { lastCheckedAt: input.status.lastCheckedAt } : {}),
    },
  };
  mkdirSync(dirname(input.configPath), { recursive: true });
  writeFileSync(input.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

export async function persistBridgeDefaultsToConfigFile(input: {
  configPath: string;
  defaultProvider?: ProviderId;
  defaultWorkspace?: string;
  tunnel?: BridgeConfig['tunnel'];
}): Promise<void> {
  const currentConfig = await readConfigFile(input.configPath);
  const currentBridge = isRecord(currentConfig.bridge) ? currentConfig.bridge : undefined;
  const nextConfig = {
    ...currentConfig,
    bridge: {
      ...(currentBridge ?? {}),
      ...(input.defaultProvider ? { defaultProvider: input.defaultProvider } : {}),
      ...(input.defaultWorkspace ? { defaultWorkspace: input.defaultWorkspace } : {}),
    },
    ...(input.tunnel ? {
      tunnel: {
        ...(input.tunnel.relay ? {
          relay: {
            ...(input.tunnel.relay.serverUrl ? { serverUrl: input.tunnel.relay.serverUrl } : {}),
            ...(input.tunnel.relay.authToken ? { authToken: input.tunnel.relay.authToken } : {}),
          },
        } : {}),
      },
    } : {}),
  };

  await mkdir(dirname(input.configPath), { recursive: true });
  await writeFile(input.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

export async function ensureRelayAuthToken(input: {
  configPath: string;
}): Promise<string> {
  const currentConfig = await readConfigFile(input.configPath);
  const currentTunnel = isRecord(currentConfig.tunnel) ? currentConfig.tunnel : undefined;
  const currentRelay = isRecord(currentTunnel?.relay) ? currentTunnel.relay : undefined;
  const existing = typeof currentRelay?.authToken === 'string' && currentRelay.authToken.trim()
    ? currentRelay.authToken.trim()
    : '';
  if (existing) return existing;

  const authToken = `clrt_${randomBytes(12).toString('hex')}`;
  const nextConfig = {
    ...currentConfig,
    tunnel: {
      ...(currentTunnel ?? {}),
      relay: {
        ...(currentRelay ?? {}),
        authToken,
      },
    },
  };

  await mkdir(dirname(input.configPath), { recursive: true });
  await writeFile(input.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  return authToken;
}

export function ensureRelayAuthTokenSync(input: {
  configPath: string;
}): string {
  const currentConfig = readConfigFileSync(input.configPath);
  const currentTunnel = isRecord(currentConfig.tunnel) ? currentConfig.tunnel : undefined;
  const currentRelay = isRecord(currentTunnel?.relay) ? currentTunnel.relay : undefined;
  const existing = typeof currentRelay?.authToken === 'string' && currentRelay.authToken.trim()
    ? currentRelay.authToken.trim()
    : '';
  if (existing) return existing;

  const authToken = `clrt_${randomBytes(12).toString('hex')}`;
  const nextConfig = {
    ...currentConfig,
    tunnel: {
      ...(currentTunnel ?? {}),
      relay: {
        ...(currentRelay ?? {}),
        authToken,
      },
    },
  };

  mkdirSync(dirname(input.configPath), { recursive: true });
  writeFileSync(input.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  return authToken;
}

export async function persistActiveWeChatUserToConfigFile(input: {
  configPath: string;
  activeWeChatUser?: ActiveWeChatUserRecord;
}): Promise<void> {
  const currentConfig = await readConfigFile(input.configPath);
  const nextConfig = {
    ...currentConfig,
    bridge: {
      ...(isRecord(currentConfig.bridge) ? currentConfig.bridge : {}),
      activeWeChatUser: input.activeWeChatUser,
    },
  };

  await mkdir(dirname(input.configPath), { recursive: true });
  await writeFile(input.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

export async function persistProviderCommandsToConfigFile(input: {
  configPath: string;
  providers?: BridgeConfig['providers'];
}): Promise<void> {
  const currentConfig = await readConfigFile(input.configPath);
  const normalizedProviders = normalizeProvidersForPersistence(input.providers);
  const nextConfig = {
    ...currentConfig,
    providers: normalizedProviders,
  };

  await mkdir(dirname(input.configPath), { recursive: true });
  await writeFile(input.configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

async function readConfigFile(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw error;
  }
}

function readConfigFileSync(path: string): Record<string, unknown> {
  try {
    if (!existsSync(path)) return {};
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}

function normalizeProvidersForPersistence(
  providers: BridgeConfig['providers'] | undefined,
): BridgeConfig['providers'] | undefined {
  const claude = providers?.claude?.command ? { command: providers.claude.command } : undefined;
  const codex = providers?.codex?.command ? { command: providers.codex.command } : undefined;
  if (!claude && !codex) return undefined;
  return {
    ...(claude ? { claude } : {}),
    ...(codex ? { codex } : {}),
  };
}
