export function loadRelayConfig(env = process.env) {
  const port = Number(env.RELAY_PORT ?? 8788);
  const baseDomain = String(env.RELAY_BASE_DOMAIN ?? '').trim();
  const authToken = String(env.RELAY_AUTH_TOKEN ?? '').trim();
  if (!baseDomain) throw new Error('RELAY_BASE_DOMAIN is required');
  if (!authToken) throw new Error('RELAY_AUTH_TOKEN is required');
  return {
    port,
    baseDomain,
    authToken,
  };
}
