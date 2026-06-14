import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { ManagedWeixinDirectAdapter } from '../src/channels/weixin-direct/managedAdapter';

const servers: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

describe('ManagedWeixinDirectAdapter', () => {
  it('reuses a stable wechat uin across adapter recreation for the same account config', async () => {
    const seenUins: string[] = [];

    const app = Fastify();
    app.post('/ilink/bot/getupdates', async (request, reply) => {
      seenUins.push(String(request.headers['x-wechat-uin'] ?? ''));
      return reply.send({
        ret: 0,
        errcode: 0,
        msgs: [],
        get_updates_buf: '',
      });
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    servers.push(app);
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('fake direct api did not bind tcp');

    const adapter = new ManagedWeixinDirectAdapter({
      enabled: true,
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: 'wx-bot-token',
      accountId: 'wx-account-1',
    });
    adapter.onMessage(async () => {});

    await adapter.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await adapter.stop();

    await adapter.configure({
      enabled: true,
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: 'wx-bot-token',
      accountId: 'wx-account-1',
    });
    await adapter.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await adapter.stop();

    expect(seenUins.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seenUins).size).toBe(1);
  });
});
