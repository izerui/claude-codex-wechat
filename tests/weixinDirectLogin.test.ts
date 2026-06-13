import { describe, expect, it, vi } from 'vitest';
import { WeixinDirectLoginClient } from '../src/channels/weixin-direct/loginClient';

describe('WeixinDirectLoginClient', () => {
  it('fetches qr code and then resolves confirmed login credentials', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          qrcode: 'ticket_123',
          qrcode_img_content: 'wx://qr-ticket',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          status: 'scaned',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          status: 'confirmed',
          ilink_bot_id: 'acc_1',
          bot_token: 'tok_1',
          baseurl: 'https://ilinkai.weixin.qq.com',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const client = new WeixinDirectLoginClient({
      fetchImpl: fetchMock as typeof fetch,
      pollIntervalMs: 1,
    });

    const qr = await client.fetchQrCode();
    expect(qr).toEqual({
      ticket: 'ticket_123',
      qrcodeData: 'wx://qr-ticket',
    });

    const scanned = await client.pollQrCodeStatus(qr.ticket);
    expect(scanned).toEqual({ status: 'scanned' });

    const confirmed = await client.pollQrCodeStatus(qr.ticket);
    expect(confirmed).toEqual({
      status: 'confirmed',
      accountId: 'acc_1',
      botToken: 'tok_1',
      baseUrl: 'https://ilinkai.weixin.qq.com',
    });
  });
});
