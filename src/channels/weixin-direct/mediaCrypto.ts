import { createDecipheriv } from 'node:crypto';

/**
 * Decode a WeChat iLink media `aes_key` into a raw 16-byte key.
 * Handles the three formats the protocol uses:
 *   - direct hex string (32 chars)           — e.g. image_item.aeskey
 *   - base64(raw 16 bytes)                    — CDNMedia.aes_key format A
 *   - base64(hex string of 32 chars)          — CDNMedia.aes_key format B
 */
export function decodeAesKey(encoded: string): Buffer {
  if (/^[0-9a-fA-F]{32}$/.test(encoded)) {
    return Buffer.from(encoded, 'hex');
  }
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length === 16) {
    return decoded;
  }
  if (decoded.length === 32) {
    const hex = decoded.toString('ascii');
    if (/^[0-9a-fA-F]{32}$/.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
  }
  throw new Error(`weixin_media_aes_key_invalid:len=${decoded.length}`);
}

/** Decrypt WeChat CDN media (AES-128-ECB, PKCS#7 padding). */
export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  if (key.length !== 16) {
    throw new Error(`weixin_media_aes_key_size:${key.length}`);
  }
  const decipher = createDecipheriv('aes-128-ecb', key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
