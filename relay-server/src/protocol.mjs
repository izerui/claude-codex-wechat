export function parseRelayMessage(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.type === 'register') {
    if (
      typeof parsed.clientVersion === 'string' &&
      typeof parsed.targetBaseUrl === 'string' &&
      typeof parsed.authToken === 'string'
    ) {
      return parsed;
    }
    throw new Error('invalid_register_message');
  }
  return parsed;
}
