import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { encryptAesEcb, generateAesKey, encodeAesKeyHex } from './mediaCrypto';
import { detectVoiceInfo, type VoiceInfo } from './voiceInfo';

export const CDN_UPLOAD_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';

/** MessageItemType values used for outbound media. */
export type OutboundMediaItemType = 2 | 3 | 4 | 5; // IMAGE, VOICE, FILE, VIDEO

export type MediaUploadResult =
  | { ok: true; downloadParam: string; aesKeyHex: string; rawSize: number; ciphertextSize: number; voiceInfo?: VoiceInfo }
  | { ok: false; reason: string };

export type GetUploadUrlInput = {
  filekey: string;
  mediaType?: number;
  toUserId?: string;
  contextToken?: string;
  rawsize: number;
  rawfilemd5: string;
  filesize: number;
  aeskey: string;
  noNeedThumb?: boolean;
};

export type GetUploadUrlResult = {
  uploadParam: string;
  uploadFullUrl?: string;
};

type UploadUrlProvider = (input: GetUploadUrlInput) => Promise<GetUploadUrlResult>;

/**
 * Handles the outbound media upload flow:
 * 1. Read local file, compute size + MD5
 * 2. Generate random AES-128 key
 * 3. Encrypt with AES-128-ECB + PKCS#7, compute encrypted size
 * 4. Call getUploadUrl with full metadata
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

  async upload(filePath: string, options?: { contextToken?: string; mediaType?: number; toUserId?: string }): Promise<MediaUploadResult> {
    // 1. Read local file, compute size + MD5
    let plaintext: Buffer;
    try {
      plaintext = readFileSync(filePath);
    } catch {
      return { ok: false, reason: 'read_failed' };
    }
    const rawsize = plaintext.length;
    const rawfilemd5 = createHash('md5').update(plaintext).digest('hex');

    // 2. Generate random AES key
    const key = generateAesKey();
    const aeskeyHex = encodeAesKeyHex(key);

    // 3. Encrypt file
    let ciphertext: Buffer;
    try {
      ciphertext = encryptAesEcb(plaintext, key);
    } catch {
      return { ok: false, reason: 'encrypt_failed' };
    }
    const filesize = ciphertext.length;

    // 4. Get upload URL with full metadata
    const filekey = randomBytes(16).toString('hex');
    let uploadParam: string;
    let uploadFullUrl: string | undefined;
    try {
      const result = await this.getUploadUrl({
        filekey,
        rawsize,
        rawfilemd5,
        filesize,
        aeskey: aeskeyHex,
        noNeedThumb: true,
        ...(options?.contextToken ? { contextToken: options.contextToken } : {}),
        ...(options?.mediaType != null ? { mediaType: options.mediaType } : {}),
        ...(options?.toUserId ? { toUserId: options.toUserId } : {}),
      });
      uploadParam = result.uploadParam;
      uploadFullUrl = result.uploadFullUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      return { ok: false, reason: msg || 'get_upload_url_failed' };
    }

    // 5. Upload ciphertext to CDN
    const uploadUrl = uploadFullUrl
      || `${this.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`;

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

    // Detect voice info for audio files
    const isAudio = options?.mediaType === 4; // MediaType.VOICE = 4
    const voiceInfo = isAudio ? detectVoiceInfo(plaintext, filePath) : undefined;

    return {
      ok: true,
      downloadParam: encryptedParam,
      aesKeyHex: aeskeyHex,
      rawSize: rawsize,
      ciphertextSize: filesize,
      ...(voiceInfo ? { voiceInfo } : {}),
    };
  }
}
