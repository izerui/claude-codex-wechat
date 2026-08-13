import { describe, expect, it, vi } from 'vitest';
import { sendMediaToWeChat } from '../src/media/sendClient';

// 这个客户端是 MCP 工具与 daemon 之间唯一的发送通道，
// sendMedia.ts 与 douyinDownload.ts 此前各自复制了一份，签名还写反了。
describe('sendMediaToWeChat', () => {
  const okResponse = () => ({
    ok: true,
    json: async () => ({ ok: true }),
    text: async () => '',
  }) as unknown as Response;

  it('posts kind and filePath to the bridge endpoint', async () => {
    const fetchImpl = vi.fn(async () => okResponse());

    const result = await sendMediaToWeChat({
      kind: 'video',
      filePath: '/tmp/a.mp4',
      apiBaseUrl: 'http://127.0.0.1:9999',
      fetchImpl,
    });

    expect(result).toBe('发送成功');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9999/api/channel/send-media');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ kind: 'video', filePath: '/tmp/a.mp4' });
  });

  // 不自动补 fileName：send_image/send_video 历来不传，补上会改变微信端展示的文件名。
  it('omits fileName unless the caller provides one', async () => {
    const fetchImpl = vi.fn(async () => okResponse());

    await sendMediaToWeChat({
      kind: 'file',
      filePath: '/tmp/a.pdf',
      fileName: '报告.pdf',
      fetchImpl,
    });

    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)))
      .toEqual({ kind: 'file', filePath: '/tmp/a.pdf', fileName: '报告.pdf' });
  });

  it('reports the HTTP status when the endpoint rejects the request', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'channel not available',
      json: async () => ({}),
    }) as unknown as Response);

    await expect(sendMediaToWeChat({ kind: 'video', filePath: '/tmp/a.mp4', fetchImpl }))
      .rejects.toThrow('发送失败 (HTTP 503): channel not available');
  });

  it('surfaces the endpoint error message when ok is false', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => '',
      json: async () => ({ ok: false, error: 'no active chat target' }),
    }) as unknown as Response);

    await expect(sendMediaToWeChat({ kind: 'file', filePath: '/tmp/a.pdf', fetchImpl }))
      .rejects.toThrow('发送失败: no active chat target');
  });

  it('defaults to the BRIDGE_API_URL base when no override is given', async () => {
    const fetchImpl = vi.fn(async () => okResponse());

    await sendMediaToWeChat({ kind: 'image', filePath: '/tmp/a.png', fetchImpl });

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://localhost:8787/api/channel/send-media');
  });
});
