import { createCipheriv } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WeixinMediaDownloader } from '../src/channels/weixin-direct/mediaDownloader';

const KEY_HEX = '00112233445566778899aabbccddeeff';
const keyBuf = Buffer.from(KEY_HEX, 'hex');

function encryptEcb(plain: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', keyBuf, null);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

function fakeResponse(body: Buffer, init?: { ok?: boolean; status?: number; contentLength?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? String(init?.contentLength ?? body.length) : null) },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  } as unknown as Response;
}

function destPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'wxmedia-')), 'out.bin');
}

describe('WeixinMediaDownloader', () => {
  it('downloads, decrypts and writes the file, returning the local path', async () => {
    const plain = Buffer.from('the real image bytes 图片内容', 'utf8');
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(encryptEcb(plain)));
    const dl = new WeixinMediaDownloader({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const out = destPath();
    const result = await dl.download({ encrypt_query_param: 'q', aes_key: keyBuf.toString('base64') }, { destPath: out });

    expect(result).toMatchObject({ ok: true, localPath: out, bytes: plain.length });
    expect(readFileSync(out).equals(plain)).toBe(true);
    // URL built from encrypt_query_param against the CDN base
    expect(fetchImpl.mock.calls[0][0]).toContain('/download?encrypted_query_param=q');
  });

  it('prefers full_url when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(encryptEcb(Buffer.from('x'))));
    const dl = new WeixinMediaDownloader({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await dl.download({ full_url: 'https://cdn.example/full', aes_key: keyBuf.toString('base64') }, { destPath: destPath() });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://cdn.example/full');
  });

  it('uses aeskeyOverride (direct hex) over media.aes_key', async () => {
    const plain = Buffer.from('override key path', 'utf8');
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(encryptEcb(plain)));
    const dl = new WeixinMediaDownloader({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = destPath();
    const result = await dl.download({ encrypt_query_param: 'q' }, { destPath: out, aeskeyOverride: KEY_HEX });
    expect(result.ok).toBe(true);
    expect(readFileSync(out).equals(plain)).toBe(true);
  });

  it('skips download when over maxBytes (Content-Length guard)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(encryptEcb(Buffer.from('big')), { contentLength: 30_000_000 }));
    const dl = new WeixinMediaDownloader({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await dl.download({ encrypt_query_param: 'q', aes_key: keyBuf.toString('base64') }, { destPath: destPath(), maxBytes: 25_000_000 });
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('fails cleanly when no key is available', async () => {
    const dl = new WeixinMediaDownloader({ fetchImpl: vi.fn() as unknown as typeof fetch });
    const result = await dl.download({ encrypt_query_param: 'q' }, { destPath: destPath() });
    expect(result).toEqual({ ok: false, reason: 'no_key' });
  });

  it('reports http errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(Buffer.from(''), { ok: false, status: 403 }));
    const dl = new WeixinMediaDownloader({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await dl.download({ encrypt_query_param: 'q', aes_key: keyBuf.toString('base64') }, { destPath: destPath() });
    expect(result).toEqual({ ok: false, reason: 'http_403' });
  });

  it('reports decrypt failures (wrong key)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(Buffer.from('not aligned ciphertext')));
    const dl = new WeixinMediaDownloader({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await dl.download({ encrypt_query_param: 'q', aes_key: keyBuf.toString('base64') }, { destPath: destPath() });
    expect(result).toEqual({ ok: false, reason: 'decrypt_failed' });
  });
});
