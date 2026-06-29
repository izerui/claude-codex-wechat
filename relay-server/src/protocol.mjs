import { isValidClientToken } from './tokenManager.mjs';

export function parseRelayMessage(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.type === 'register') {
    if (
      typeof parsed.clientVersion === 'string' &&
      typeof parsed.targetBaseUrl === 'string' &&
      typeof parsed.authToken === 'string' &&
      isValidClientToken(parsed.authToken)
    ) {
      return parsed;
    }
    throw new Error('invalid_register_message');
  }
  return parsed;
}
