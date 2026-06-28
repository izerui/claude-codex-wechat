import { createHmac } from 'node:crypto';

export function signAccessCodePayload(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signAccessCodeBody(body, secret);
  return Buffer.from(JSON.stringify({ body, signature }), 'utf8').toString('base64url');
}

export function signAccessCodeBody(body, secret) {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

// Compatibility aliases. New code should prefer the access-code names above.
export const signActivationPayload = signAccessCodePayload;
export const signActivationBody = signAccessCodeBody;
