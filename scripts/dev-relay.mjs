import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const root = process.cwd();
const configDir = join(homedir(), '.claude-codex-wechat');
const configPath = join(configDir, 'config.json');
const relayTokensPath = join(root, 'relay-server', 'relay-auth-tokens.txt');

const relayPort = process.env.RELAY_PORT ?? '8788';
const bridgePort = process.env.BRIDGE_PORT ?? '8787';
const relayServerUrl = process.env.RELAY_SERVER_URL ?? `ws://127.0.0.1:${relayPort}/agent`;
const activationSecret = process.env.RELAY_ACTIVATION_SECRET ?? 'dev-activation-secret';
const adminToken = process.env.RELAY_ADMIN_TOKEN ?? 'dev-admin-token';
const relayClientToken = ensureBridgeRelayAuthToken(configPath, relayPort);

ensureRelayTokenFile(relayTokensPath, relayClientToken);

const mode = process.argv[2] === 'all' ? 'all' : 'relay';
const children = [];

children.push(spawnWithPrefix(
  'relay',
  'node',
  ['./bin/relay-server.mjs'],
  {
    cwd: join(root, 'relay-server'),
    env: {
      ...process.env,
      RELAY_PORT: relayPort,
      RELAY_SERVER_URL: relayServerUrl,
      RELAY_AUTH_TOKENS_FILE: relayTokensPath,
      RELAY_ACTIVATION_SECRET: activationSecret,
      RELAY_ADMIN_TOKEN: adminToken,
    },
  },
));

if (mode === 'all') {
  children.push(spawnWithPrefix(
    'bridge',
    'pnpm',
    ['dev'],
    {
      cwd: root,
      env: {
        ...process.env,
        BRIDGE_PORT: bridgePort,
        BRIDGE_CONFIG: configPath,
      },
    },
  ));
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 200);
}

for (const child of children) {
  child.on('exit', (code) => {
    if (shuttingDown) return;
    shutdown(typeof code === 'number' ? code : 1);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function ensureRelayTokenFile(filePath, token) {
  mkdirSync(dirname(filePath), { recursive: true });
  const existing = existsSync(filePath)
    ? readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
    : [];
  if (existing.includes(token)) return;
  writeFileSync(filePath, `${[...existing, token].join('\n')}\n`, 'utf8');
}

function ensureBridgeConfig(filePath, relayPortValue, relayToken) {
  if (existsSync(filePath)) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify({
    bridge: {
      defaultProvider: 'claude-code',
      defaultWorkspace: root,
    },
    tunnel: {
      provider: 'relay',
      enabled: true,
      relay: {
        serverUrl: `ws://127.0.0.1:${relayPortValue}/agent`,
        authToken: relayToken,
      },
    },
  }, null, 2)}\n`, 'utf8');
}

function ensureBridgeRelayAuthToken(filePath, relayPortValue) {
  if (!existsSync(filePath)) {
    const relayToken = createRelayClientToken();
    ensureBridgeConfig(filePath, relayPortValue, relayToken);
    return relayToken;
  }

  const currentConfig = readConfigFile(filePath);
  const currentTunnel = isRecord(currentConfig.tunnel) ? currentConfig.tunnel : {};
  const currentRelay = isRecord(currentTunnel.relay) ? currentTunnel.relay : {};
  const existing = typeof currentRelay.authToken === 'string' && currentRelay.authToken.trim()
    ? currentRelay.authToken.trim()
    : '';
  if (existing && existing !== 'client-token-a') return existing;

  const authToken = createRelayClientToken();
  const nextConfig = {
    ...currentConfig,
    tunnel: {
      ...currentTunnel,
      enabled: currentTunnel.enabled === true,
      relay: {
        ...currentRelay,
        serverUrl: typeof currentRelay.serverUrl === 'string' && currentRelay.serverUrl.trim()
          ? currentRelay.serverUrl
          : `ws://127.0.0.1:${relayPortValue}/agent`,
        authToken,
      },
    },
  };

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  return authToken;
}

function readConfigFile(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function createRelayClientToken() {
  return `clrt_${randomBytes(12).toString('hex')}`;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function spawnWithPrefix(prefix, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${prefix}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${prefix}] ${chunk}`);
  });
  return child;
}
