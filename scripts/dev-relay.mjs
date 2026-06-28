import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const root = process.cwd();
const configDir = join(homedir(), '.claude-codex-wechat');
const configPath = join(configDir, 'config.json');
const relayTokensPath = join(root, 'relay-server', 'relay-auth-tokens.txt');

const relayPort = process.env.RELAY_PORT ?? '8788';
const bridgePort = process.env.BRIDGE_PORT ?? '8787';
const relayServerUrl = process.env.RELAY_SERVER_URL ?? `ws://127.0.0.1:${relayPort}/agent`;
const relayClientToken = process.env.RELAY_DEV_CLIENT_TOKEN ?? 'client-token-a';
const activationSecret = process.env.RELAY_ACTIVATION_SECRET ?? 'dev-activation-secret';
const adminToken = process.env.RELAY_ADMIN_TOKEN ?? 'dev-admin-token';

ensureRelayTokenFile(relayTokensPath, relayClientToken);
ensureBridgeConfig(configPath, relayPort, relayClientToken);

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
  if (existsSync(filePath)) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${token}\n`, 'utf8');
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
