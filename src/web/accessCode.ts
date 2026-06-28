export type AccessCodePayload = {
  version?: number;
  serverUrl?: string;
  authToken?: string;
  expiresAt?: number;
};

export type RelayAccessCodePayload = AccessCodePayload;

export const RELAY_ACCESS_CODE_ERRORS = {
  expired: 'access_code_expired',
  invalid: 'invalid_access_code',
  secretMissing: 'access_code_signature_secret_missing',
  signatureInvalid: 'access_code_signature_invalid',
} as const;

const LEGACY_RELAY_ACCESS_CODE_ERROR_MAP: Record<string, string> = {
  activation_code_expired: RELAY_ACCESS_CODE_ERRORS.expired,
  invalid_activation_code: RELAY_ACCESS_CODE_ERRORS.invalid,
  activation_signature_secret_missing: RELAY_ACCESS_CODE_ERRORS.secretMissing,
  activation_code_signature_invalid: RELAY_ACCESS_CODE_ERRORS.signatureInvalid,
};

export async function decodeRelayAccessCode(raw: string, secret?: string): Promise<RelayAccessCodePayload> {
  const trimmed = raw.trim();
  const decodedText = atob(trimmed.replaceAll('-', '+').replaceAll('_', '/'));
  const outer = JSON.parse(decodedText) as { body?: string; signature?: string };
  if (typeof outer.body === 'string' && typeof outer.signature === 'string') {
    if (!secret) throw new Error(RELAY_ACCESS_CODE_ERRORS.secretMissing);
    const expected = await signRelayAccessCodeBodyForTest(outer.body, secret);
    if (expected !== outer.signature) throw new Error(RELAY_ACCESS_CODE_ERRORS.signatureInvalid);
    return JSON.parse(atob(outer.body.replaceAll('-', '+').replaceAll('_', '/')));
  }
  return outer as RelayAccessCodePayload;
}

export async function signRelayAccessCodeBodyForTest(body: string, secret: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('webcrypto_unavailable');
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await subtle.sign('HMAC', key, encoder.encode(body));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/g, '');
}

export function normalizeRelayAccessCodeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || RELAY_ACCESS_CODE_ERRORS.invalid);
  return LEGACY_RELAY_ACCESS_CODE_ERROR_MAP[message] ?? message;
}

// Compatibility type/function aliases. New code should prefer the access-code names above.
export type ActivationPayload = AccessCodePayload;
export const decodeRelayActivationCode = decodeRelayAccessCode;
export const signActivationBodyForTest = signRelayAccessCodeBodyForTest;
