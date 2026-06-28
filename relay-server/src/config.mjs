import { readFileSync } from 'node:fs';

export function loadRelayConfig(env = process.env) {
  const port = Number(env.RELAY_PORT ?? 8788);
  const baseDomain = String(env.RELAY_BASE_DOMAIN ?? '').trim();
  const relayServerUrl = String(env.RELAY_SERVER_URL ?? '').trim() || undefined;
  const authTokens = parseAuthTokens(env);
  const authTokensFile = String(env.RELAY_AUTH_TOKENS_FILE ?? '').trim() || undefined;
  // Keep the historical env name for compatibility with existing deployments.
  const accessCodeSecret = String(env.RELAY_ACTIVATION_SECRET ?? '').trim() || undefined;
  const adminToken = String(env.RELAY_ADMIN_TOKEN ?? '').trim() || undefined;
  if (!baseDomain && !relayServerUrl) throw new Error('RELAY_BASE_DOMAIN or RELAY_SERVER_URL is required');
  return {
    port,
    baseDomain,
    relayServerUrl,
    authTokens,
    authTokensFile,
    // Keep the public config shape stable for existing callers.
    activationSecret: accessCodeSecret,
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
