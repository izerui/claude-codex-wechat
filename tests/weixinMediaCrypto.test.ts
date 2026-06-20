import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeAesKey, decryptAesEcb } from '../src/channels/weixin-direct/mediaCrypto';

const KEY_HEX = '00112233445566778899aabbccddeeff';
const keyBuf = Buffer.from(KEY_HEX, 'hex');

function encryptEcb(plain: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

describe('decodeAesKey', () => {
  it('decodes a direct hex string (32 chars)', () => {
    expect(decodeAesKey(KEY_HEX).equals(keyBuf)).toBe(true);
  });

  it('decodes base64 of raw 16 bytes (format A)', () => {
    expect(decodeAesKey(keyBuf.toString('base64')).equals(keyBuf)).toBe(true);
  });

  it('decodes base64 of a hex string (format B)', () => {
    const encoded = Buffer.from(KEY_HEX, 'utf8').toString('base64');
    expect(decodeAesKey(encoded).equals(keyBuf)).toBe(true);
  });

  it('all three formats resolve to the same key', () => {
    const a = decodeAesKey(KEY_HEX);
    const b = decodeAesKey(keyBuf.toString('base64'));
    const c = decodeAesKey(Buffer.from(KEY_HEX, 'utf8').toString('base64'));
    expect(a.equals(b)).toBe(true);
    expect(b.equals(c)).toBe(true);
  });

  it('throws on an undecodable key', () => {
    expect(() => decodeAesKey('zzz')).toThrow('weixin_media_aes_key_invalid');
  });
});

describe('decryptAesEcb', () => {
  it('round-trips AES-128-ECB ciphertext back to plaintext', () => {
    const plain = Buffer.from('hello wechat media 你好 📎', 'utf8');
    const cipher = encryptEcb(plain, keyBuf);
    expect(decryptAesEcb(cipher, keyBuf).equals(plain)).toBe(true);
  });

  it('rejects a non-16-byte key', () => {
    expect(() => decryptAesEcb(Buffer.alloc(16), Buffer.alloc(8))).toThrow('weixin_media_aes_key_size');
  });
});
