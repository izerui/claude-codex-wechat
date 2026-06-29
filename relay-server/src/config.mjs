import { readFileSync } from 'node:fs';

export function loadRelayConfig(env = process.env) {
  const port = Number(env.RELAY_PORT ?? 8788);
  const baseDomain = String(env.RELAY_BASE_DOMAIN ?? '').trim();
  const relayServerUrl = String(env.RELAY_SERVER_URL ?? '').trim() || undefined;
  const authTokens = parseAuthTokens(env);
  const authTokensFile = String(env.RELAY_AUTH_TOKENS_FILE ?? '').trim() || undefined;
  const adminToken = String(env.RELAY_ADMIN_TOKEN ?? '').trim() || undefined;
  return {
    port,
    baseDomain,
    relayServerUrl,
    authTokens,
    authTokensFile,
    adminToken,
  };
}

function parseAuthTokens(env) {
  const filePath = String(env.RELAY_AUTH_TOKENS_FILE ?? '').trim();
  if (filePath) {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((token) => token.trim())
      .filter(Boolean);
  }
  const multiValue = String(env.RELAY_AUTH_TOKENS ?? '').trim();
  if (multiValue) {
    return multiValue
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
  }
  const singleValue = String(env.RELAY_AUTH_TOKEN ?? '').trim();
  return singleValue ? [singleValue] : [];
}
