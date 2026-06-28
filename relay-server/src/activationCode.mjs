export function encodeAccessCode(input) {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

// Compatibility alias. New code should prefer encodeAccessCode.
export const encodeActivationCode = encodeAccessCode;
