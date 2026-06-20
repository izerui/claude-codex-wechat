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

  function clientWith(payload: unknown): WeixinDirectApiClient {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    return new WeixinDirectApiClient({
      baseUrl: 'https://ilinkai.weixin.qq.com', botToken: 't', wechatUin: 'u',
      fetchImpl: fetchMock as typeof fetch,
    });
  }

  it('parses image/file/video items into attachment metadata alongside text', async () => {
    const client = clientWith({
      ret: 0, errcode: 0, get_updates_buf: 'b',
      msgs: [{
        from_user_id: 'user_a', context_token: 'ctx', msg_id: 'm1',
        item_list: [
          { type: 1, text_item: { text: '看这些' } },
          { type: 2, image_item: { media: { encrypt_query_param: 'iq', aes_key: 'ik' }, aeskey: '00112233445566778899aabbccddeeff' } },
          { type: 4, file_item: { media: { encrypt_query_param: 'fq', aes_key: 'fk' }, file_name: 'report.pdf' } },
          { type: 5, video_item: { media: { encrypt_query_param: 'vq', aes_key: 'vk' } } },
        ],
      }],
    });
    const updates = await client.getUpdates('');
    expect(updates.messages[0]).toMatchObject({
      id: 'm1', chatId: 'user_a', text: '看这些', contextToken: 'ctx',
      attachments: [
        { kind: 'image', aeskey: '00112233445566778899aabbccddeeff', media: { encrypt_query_param: 'iq', aes_key: 'ik' } },
        { kind: 'file', fileName: 'report.pdf', media: { encrypt_query_param: 'fq', aes_key: 'fk' } },
        { kind: 'video', media: { encrypt_query_param: 'vq', aes_key: 'vk' } },
      ],
    });
  });

  it('keeps a media-only message (no text) instead of dropping it', async () => {
    const client = clientWith({
      ret: 0, errcode: 0, get_updates_buf: 'b',
      msgs: [{
        from_user_id: 'user_a', context_token: 'ctx', msg_id: 'm2',
        item_list: [{ type: 2, image_item: { media: { encrypt_query_param: 'iq', aes_key: 'ik' } } }],
      }],
    });
    const updates = await client.getUpdates('');
    expect(updates.messages).toHaveLength(1);
    expect(updates.messages[0]).toMatchObject({ id: 'm2', text: '', attachments: [{ kind: 'image' }] });
  });

  it('parses a quoted (ref_msg) message', async () => {
    const client = clientWith({
      ret: 0, errcode: 0, get_updates_buf: 'b',
      msgs: [{
        from_user_id: 'user_a', context_token: 'ctx', msg_id: 'm3',
        item_list: [
          { type: 1, text_item: { text: '这个怎么改' } },
          { type: 1, ref_msg: { title: '引用', message_item: { type: 1, text_item: { text: '原始内容' } } } },
        ],
      }],
    });
    const updates = await client.getUpdates('');
    expect(updates.messages[0]).toMatchObject({ id: 'm3', text: '这个怎么改', quoted: { text: '引用 原始内容' } });
  });
});
