import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ProviderId } from '../providers/types';
import type { CurrentConversationBinding } from '../session/currentConversationStore';
import type { ActiveWeChatUserRecord } from '../storage/userStore';

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

export async function persistBridgeDefaultsToConfigFile(input: {
  configPath: string;
  defaultProvider: ProviderId;
  defaultWorkspace: string;
}): Promise<void> {
  const currentConfig = await readConfigFile(input.configPath);
  const nextConfig = {
    ...currentConfig,
    bridge: {
      ...(isRecord(currentConfig.bridge) ? currentConfig.bridge : {}),
      defaultProvider: input.defaultProvider,
      defaultWorkspace: input.defaultWorkspace,
    },
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

export async function persistCurrentConversationBindingToConfigFile(input: {
  configPath: string;
  currentConversationBinding?: CurrentConversationBinding;
}): Promise<void> {
  const currentConfig = await readConfigFile(input.configPath);
  const nextConfig = {
    ...currentConfig,
    bridge: {
      ...(isRecord(currentConfig.bridge) ? currentConfig.bridge : {}),
      currentConversationBinding: input.currentConversationBinding,
    },
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
