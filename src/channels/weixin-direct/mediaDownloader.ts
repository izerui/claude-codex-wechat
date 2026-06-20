import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodeAesKey, decryptAesEcb } from './mediaCrypto';

export const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';

/** Encrypted-CDN media reference carried by inbound message items. */
export type CDNMedia = {
  encrypt_query_param?: string;
  aes_key?: string;
  /** When the server returns a complete download URL, use it directly. */
  full_url?: string;
};

export type MediaDownloadResult =
  | { ok: true; localPath: string; bytes: number }
  | { ok: false; reason: string };

/**
 * Downloads + decrypts a single media file from the WeChat iLink encrypted CDN.
 * Stateless and side-effect-isolated: the caller decides the destination path
 * and per-call size cap (e.g. videos capped at 25MB), so this stays easy to test.
 */
export class WeixinMediaDownloader {
  private readonly cdnBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { cdnBaseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.cdnBaseUrl = (options.cdnBaseUrl ?? CDN_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async download(media: CDNMedia, input: {
    destPath: string;
    aeskeyOverride?: string;
    maxBytes?: number;
  }): Promise<MediaDownloadResult> {
    const url = media.full_url?.trim()
      || (media.encrypt_query_param
        ? `${this.cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param)}`
        : '');
    if (!url) return { ok: false, reason: 'no_url' };

    const keySource = input.aeskeyOverride ?? media.aes_key;
    if (!keySource) return { ok: false, reason: 'no_key' };

    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    } catch {
      return { ok: false, reason: 'fetch_failed' };
    }
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };

    // Cheap guard via Content-Length before pulling the whole body.
    const declaredLen = Number(response.headers.get('content-length') ?? '');
    if (input.maxBytes && Number.isFinite(declaredLen) && declaredLen > input.maxBytes) {
      return { ok: false, reason: 'too_large' };
    }

    const ciphertext = Buffer.from(await response.arrayBuffer());
    if (input.maxBytes && ciphertext.length > input.maxBytes) {
      return { ok: false, reason: 'too_large' };
    }

    let plaintext: Buffer;
    try {
      plaintext = decryptAesEcb(ciphertext, decodeAesKey(keySource));
    } catch {
      return { ok: false, reason: 'decrypt_failed' };
    }

    mkdirSync(dirname(input.destPath), { recursive: true });
    writeFileSync(input.destPath, plaintext);
    return { ok: true, localPath: input.destPath, bytes: plaintext.length };
  }
}
