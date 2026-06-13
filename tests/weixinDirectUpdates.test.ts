import { describe, expect, it, vi } from 'vitest';
import { WeixinDirectApiClient } from '../src/channels/weixin-direct/apiClient';

describe('WeixinDirectApiClient getupdates', () => {
  it('parses incoming weixin text updates and preserves context_token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ret: 0,
      errcode: 0,
      msgs: [
        {
          from_user_id: 'user_a',
          context_token: 'ctx_123',
          msg_id: 'msg_1',
          item_list: [
            { type: 1, text_item: { text: 'hello from weixin' } },
          ],
        },
      ],
      get_updates_buf: 'buf_next',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const client = new WeixinDirectApiClient({
      baseUrl: 'https://ilinkai.weixin.qq.com',
      botToken: 'tok_123',
      wechatUin: 'uin_456',
      fetchImpl: fetchMock as typeof fetch,
    });

    const updates = await client.getUpdates('');

    expect(updates.nextBuffer).toBe('buf_next');
    expect(updates.messages).toEqual([
      {
        id: 'msg_1',
        chatId: 'user_a',
        userId: 'user_a',
        text: 'hello from weixin',
        contextToken: 'ctx_123',
      },
    ]);
  });
});
