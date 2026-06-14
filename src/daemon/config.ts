import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type WeixinConfig = {
  enabled: boolean;
  baseUrl?: string;
  token?: string;
  accountId?: string;
};

export type ProviderCommandConfig = {
  command?: string;
};

export type BridgeConfig = {
  databasePath?: string;
  wechat?: WeixinConfig;
  providers?: {
    claude?: ProviderCommandConfig;
    codex?: ProviderCommandConfig;
  };
};

export function defaultConfigPath(): string {
  return join(homedir(), '.local-agent-wechat-bridge', 'config.json');
}

export function loadBridgeConfig(path = process.env.BRIDGE_CONFIG ?? defaultConfigPath()): BridgeConfig {
  if (!existsSync(path)) return normalizeBridgeConfig({}, process.env);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return normalizeBridgeConfig(raw, process.env);
}

export function normalizeBridgeConfigForTest(raw: unknown, env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  return normalizeBridgeConfig(raw, env);
}

function normalizeBridgeConfig(raw: unknown, env: NodeJS.ProcessEnv): BridgeConfig {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    databasePath: typeof record.databasePath === 'string' && record.databasePath ? record.databasePath : undefined,
    wechat: normalizeWechatConfig(record.wechat, env),
    providers: normalizeProvidersConfig(record.providers, env),
  };
}

function normalizeProvidersConfig(raw: unknown, env: NodeJS.ProcessEnv): BridgeConfig['providers'] {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const claude = normalizeProviderCommand(record.claude, env.BRIDGE_CLAUDE_COMMAND);
  const codex = normalizeProviderCommand(record.codex, env.BRIDGE_CODEX_COMMAND);
  if (!claude && !codex) return undefined;
  return {
    ...(claude ? { claude } : {}),
    ...(codex ? { codex } : {}),
  };
}

function normalizeProviderCommand(raw: unknown, envFallback: string | undefined): ProviderCommandConfig | undefined {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const command = typeof record.command === 'string' && record.command
    ? record.command
    : typeof envFallback === 'string' && envFallback
      ? envFallback
      : undefined;
  return command ? { command } : undefined;
}

function normalizeWechatConfig(raw: unknown, env: NodeJS.ProcessEnv): WeixinConfig | undefined {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const enabled = record.enabled === true
    || env.BRIDGE_WECHAT_ENABLED === '1'
    || env.BRIDGE_WECHAT_ENABLED === 'true';
  const baseUrl = typeof record.baseUrl === 'string' && record.baseUrl
    ? record.baseUrl
    : typeof env.BRIDGE_WECHAT_BASE_URL === 'string' && env.BRIDGE_WECHAT_BASE_URL
      ? env.BRIDGE_WECHAT_BASE_URL
      : undefined;
  const token = typeof record.token === 'string' && record.token
    ? record.token
    : typeof env.BRIDGE_WECHAT_TOKEN === 'string' && env.BRIDGE_WECHAT_TOKEN
      ? env.BRIDGE_WECHAT_TOKEN
      : undefined;
  const accountId = typeof record.accountId === 'string' && record.accountId
    ? record.accountId
    : typeof env.BRIDGE_WECHAT_ACCOUNT_ID === 'string' && env.BRIDGE_WECHAT_ACCOUNT_ID
      ? env.BRIDGE_WECHAT_ACCOUNT_ID
      : undefined;
  if (!enabled && !baseUrl && !token && !accountId) return undefined;
  return {
    enabled,
    baseUrl,
    token,
    accountId,
  };
}
