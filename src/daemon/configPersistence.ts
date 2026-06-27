import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ProviderId } from '../providers/types';
import type { ActiveWeChatUserRecord } from '../storage/userStore';
import type { BridgeConfig } from './config';

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

export async function persistBridgeDefaultsToConfigFile(input: {
  configPath: string;
  defaultProvider?: ProviderId;
  defaultWorkspace?: string;
  ngrokEnabled?: boolean;
  tunnel?: BridgeConfig['tunnel'];
}): Promise<void> {
  const currentConfig = await readConfigFile(input.configPath);
  const currentBridge = isRecord(currentConfig.bridge) ? currentConfig.bridge : undefined;
  const currentNgrok = isRecord(currentBridge?.ngrok) ? currentBridge.ngrok : undefined;
  const nextConfig = {
    ...currentConfig,
    bridge: {
      ...(currentBridge ?? {}),
      ...(input.defaultProvider ? { defaultProvider: input.defaultProvider } : {}),
      ...(input.defaultWorkspace ? { defaultWorkspace: input.defaultWorkspace } : {}),
      ...(typeof input.ngrokEnabled === 'boolean' ? {
        ngrok: {
          ...(currentNgrok ?? {}),
          enabled: input.ngrokEnabled,
        },
      } : {}),
    },
    ...(input.tunnel ? {
      tunnel: {
        ...(input.tunnel.provider ? { provider: input.tunnel.provider } : {}),
        enabled: input.tunnel.enabled === true,
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
