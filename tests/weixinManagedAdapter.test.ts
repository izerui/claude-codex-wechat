import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedWeixinDirectAdapter, buildTransientWeixinUin } from '../src/channels/weixin-direct/managedAdapter';

const servers: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

describe('buildTransientWeixinUin', () => {
  it('encodes X-WECHAT-UIN as base64 of a uint32 decimal string', () => {
    for (let i = 0; i < 50; i += 1) {
      const uin = buildTransientWeixinUin();
      const decoded = Buffer.from(uin, 'base64').toString('utf8');
      expect(decoded).toMatch(/^\d+$/);
      const n = Number(decoded);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(4_294_967_295);
    }
  });
});

describe('ManagedWeixinDirectAdapter', () => {
  it('generates a fresh wechat uin when recreating the adapter for the same account config', async () => {
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
    expect(new Set(seenUins).size).toBeGreaterThanOrEqual(2);
  });

  it('forwards health-change notifications and re-attaches them after reconfigure', async () => {
    const app = Fastify();
    app.post('/ilink/bot/getupdates', async (_request, reply) => reply.send({
      ret: 0,
      errcode: 0,
      msgs: [],
      get_updates_buf: '',
    }));
    await app.listen({ host: '127.0.0.1', port: 0 });
    servers.push(app);
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('fake direct api did not bind tcp');
    const config = {
      enabled: true,
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: 'wx-bot-token',
      accountId: 'wx-account-1',
    };

    const adapter = new ManagedWeixinDirectAdapter(config);
    adapter.onMessage(async () => {});
    const statuses: string[] = [];
    adapter.onHealthChange(() => statuses.push(adapter.getHealth().status));

    await adapter.start();
    await vi.waitFor(() => {
      expect(statuses).toContain('connected');
    });
    await adapter.stop();

    statuses.length = 0;
    await adapter.configure(config);
    await adapter.start();
    await vi.waitFor(() => {
      expect(statuses).toContain('connected');
    });
    await adapter.stop();
  });
});
