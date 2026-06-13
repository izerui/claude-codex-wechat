import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { WechatClawbotHttpClient, WechatClawbotHttpError } from '../src/channels/wechat-clawbot/client';

const servers: Array<{ close: () => Promise<unknown> }> = [];

async function startFakeClawbot(handler: (body: unknown, authorization: string | undefined) => { status: number; body: unknown }) {
  const app = Fastify();
  app.post('/send', async (request, reply) => {
    const result = handler(request.body, request.headers.authorization);
    return reply.code(result.status).send(result.body);
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  servers.push(app);
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('fake server did not bind tcp');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

describe('WechatClawbotHttpClient', () => {
  it('sends outbound messages with optional bearer token', async () => {
    let received: unknown = null;
    let auth: string | undefined;
    const baseUrl = await startFakeClawbot((body, authorization) => {
      received = body;
      auth = authorization;
      return { status: 200, body: { ok: true } };
    });

    const client = new WechatClawbotHttpClient({ baseUrl, token: 'secret-token' });
    await client.sendMessage({ chatId: 'chat-a', kind: 'text', text: 'hello' });

    expect(received).toEqual({ chatId: 'chat-a', kind: 'text', text: 'hello' });
    expect(auth).toBe('Bearer secret-token');
  });

  it('throws typed error for non-2xx responses', async () => {
    const baseUrl = await startFakeClawbot(() => ({ status: 500, body: { error: 'down' } }));
    const client = new WechatClawbotHttpClient({ baseUrl });

    await expect(client.sendMessage({ chatId: 'chat-a', kind: 'text', text: 'hello' })).rejects.toBeInstanceOf(WechatClawbotHttpError);
  });
});
