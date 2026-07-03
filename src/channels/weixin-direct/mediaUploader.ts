import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { encryptAesEcb, generateAesKey, encodeAesKeyBase64, encodeAesKeyHex } from './mediaCrypto';
import type { CDNMedia } from './mediaDownloader';

export const CDN_UPLOAD_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';

/** MessageItemType values used for outbound media. */
export type OutboundMediaItemType = 2 | 3 | 4 | 5; // IMAGE, VOICE, FILE, VIDEO

export type MediaUploadResult =
  | { ok: true; media: CDNMedia; aesKeyHex: string }
  | { ok: false; reason: string };

type UploadUrlProvider = (input?: { contextToken?: string }) => Promise<{ uploadParam: string }>;

/**
 * Handles the outbound media upload flow:
 * 1. Read local file
 * 2. Generate random AES-128 key
 * 3. Encrypt with AES-128-ECB + PKCS#7
 * 4. Get upload URL from iLink platform
 * 5. Upload ciphertext to CDN
 * 6. Return CDNMedia reference for use in sendmessage
 */
export class WeixinMediaUploader {
  private readonly cdnBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getUploadUrl: UploadUrlProvider;

  constructor(options: {
    getUploadUrl: UploadUrlProvider;
    cdnBaseUrl?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.cdnBaseUrl = (options.cdnBaseUrl ?? CDN_UPLOAD_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.getUploadUrl = options.getUploadUrl;
  }

  async upload(filePath: string, options?: { contextToken?: string }): Promise<MediaUploadResult> {
    // 1. Read local file
    let plaintext: Buffer;
    try {
      plaintext = readFileSync(filePath);
    } catch {
      return { ok: false, reason: 'read_failed' };
    }

    // 2. Generate random AES key
    const key = generateAesKey();

    // 3. Encrypt file
    let ciphertext: Buffer;
    try {
      ciphertext = encryptAesEcb(plaintext, key);
    } catch {
      return { ok: false, reason: 'encrypt_failed' };
    }

    // 4. Get upload URL
    let uploadParam: string;
    try {
      const result = await this.getUploadUrl(options?.contextToken ? { contextToken: options.contextToken } : undefined);
      uploadParam = result.uploadParam;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      return { ok: false, reason: msg || 'get_upload_url_failed' };
    }

    // 5. Upload ciphertext to CDN
    const fileKey = randomUUID();
    const uploadUrl = `${this.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(fileKey)}`;

    let response: Response;
    try {
      response = await this.fetchImpl(uploadUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(ciphertext),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      return { ok: false, reason: 'upload_failed' };
    }

    if (!response.ok) {
      return { ok: false, reason: `upload_http_${response.status}` };
    }

    // 6. Extract download param from response header
    const encryptedParam = response.headers.get('x-encrypted-param') ?? '';
    if (!encryptedParam) {
      return { ok: false, reason: 'no_encrypted_param_in_response' };
    }

    const media: CDNMedia = {
      encrypt_query_param: encryptedParam,
      aes_key: encodeAesKeyBase64(key),
    };

    return {
      ok: true,
      media,
      aesKeyHex: encodeAesKeyHex(key),
    };
  }
}
