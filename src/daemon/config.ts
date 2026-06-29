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

export type BridgeDefaultsConfig = {
  defaultProvider?: 'claude-code' | 'codex';
  defaultWorkspace?: string;
};

export type RelayTunnelConfig = {
  serverUrl?: string;
  authToken?: string;
};

export type TunnelConfig = {
  relay?: RelayTunnelConfig;
};

export type BridgeConfig = {
  wechat?: WeixinConfig;
  bridge?: BridgeDefaultsConfig;
  tunnel?: TunnelConfig;
  providers?: {
    claude?: ProviderCommandConfig;
    codex?: ProviderCommandConfig;
  };
};

export function defaultConfigPath(): string {
  return join(homedir(), '.claude-codex-wechat', 'config.json');
}

export function loadBridgeConfig(path = process.env.BRIDGE_CONFIG ?? defaultConfigPath()): BridgeConfig {
  if (!existsSync(path)) return normalizeBridgeConfig({}, process.env, path);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return normalizeBridgeConfig(raw, process.env, path);
}

export function normalizeBridgeConfigForTest(
  raw: unknown,
  env: NodeJS.ProcessEnv = process.env,
  path = defaultConfigPath(),
): BridgeConfig {
  return normalizeBridgeConfig(raw, env, path);
}

function normalizeBridgeConfig(raw: unknown, env: NodeJS.ProcessEnv, path: string): BridgeConfig {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    wechat: normalizeWechatConfig(record.wechat, env),
    bridge: normalizeBridgeDefaultsConfig(record.bridge),
    tunnel: normalizeTunnelConfig(record.tunnel),
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

function normalizeBridgeDefaultsConfig(raw: unknown): BridgeDefaultsConfig | undefined {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const defaultProvider = record.defaultProvider === 'codex' ? 'codex' : record.defaultProvider === 'claude-code' ? 'claude-code' : undefined;
  const defaultWorkspace = typeof record.defaultWorkspace === 'string' && record.defaultWorkspace.trim()
    ? record.defaultWorkspace
    : undefined;
  if (!defaultProvider && !defaultWorkspace) return undefined;
  return {
    ...(defaultProvider ? { defaultProvider } : {}),
    ...(defaultWorkspace ? { defaultWorkspace } : {}),
  };
}

function normalizeTunnelConfig(raw: unknown): TunnelConfig | undefined {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const relayRecord = record.relay && typeof record.relay === 'object' ? record.relay as Record<string, unknown> : undefined;
  const relay = {
    serverUrl: typeof relayRecord?.serverUrl === 'string' && relayRecord.serverUrl.trim()
      ? relayRecord.serverUrl
      : 'wss://wechat.style520.com/agent',
    ...(typeof relayRecord?.authToken === 'string' && relayRecord.authToken.trim() ? { authToken: relayRecord.authToken } : {}),
  };
  return {
    relay,
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
