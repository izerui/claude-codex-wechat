import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { WeixinDirectApiClient } from '../src/channels/weixin-direct/apiClient';

const servers: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

describe('WeixinDirectApiClient', () => {
  it('sends message with required ilink headers and context_token', async () => {
    let headers: Record<string, string | undefined> | null = null;
    let body: unknown = null;

    const app = Fastify();
    app.post('/ilink/bot/sendmessage', async (request, reply) => {
      headers = {
        authorizationtype: String(request.headers.authorizationtype ?? ''),
        authorization: String(request.headers.authorization ?? ''),
        'x-wechat-uin': String(request.headers['x-wechat-uin'] ?? ''),
      };
      body = request.body;
      return reply.send({ ok: true });
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    servers.push(app);
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('fake direct api did not bind tcp');

    const client = new WeixinDirectApiClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      botToken: 'tok_123',
      wechatUin: 'uin_456',
    });

    await client.sendTextMessage({
      toUserId: 'user_1',
      text: 'hello weixin',
      contextToken: 'ctx_abc',
    });

    expect(headers).toEqual({
      authorizationtype: 'ilink_bot_token',
      authorization: 'Bearer tok_123',
      'x-wechat-uin': 'uin_456',
    });
    expect(body).toEqual({
      msg: {
        to_user_id: 'user_1',
        client_id: expect.any(String),
        message_type: 2,
        message_state: 2,
        item_list: [
          {
            type: 1,
            text_item: {
              text: 'hello weixin',
            },
          },
        ],
        context_token: 'ctx_abc',
      },
      base_info: {},
    });
  });
});
