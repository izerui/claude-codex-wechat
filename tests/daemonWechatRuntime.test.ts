import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDaemonServer } from '../src/daemon/server';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { BridgeEventRepository } from '../src/storage/bridgeEventRepository';
import { PermissionRequestRepository } from '../src/storage/permissionRequestRepository';
import { schemaSql } from '../src/storage/schema';
import { SettingsRepository } from '../src/storage/settingsRepository';
import { UserRepository } from '../src/storage/userRepository';
import { WeixinDirectAdapter } from '../src/channels/weixin-direct/adapter';

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('daemon WeChat runtime channel', () => {
  it('exposes WeChat plugin status for the admin UI', async () => {
    const db = memoryDb();
    const { app } = createDaemonServer({
      db,
      wechat: { enabled: true, baseUrl: 'https://ilinkai.weixin.qq.com', token: 'secret-token', accountId: 'wx-account-1' },
    });

    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/channel/plugins' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: 'weixin',
        type: 'weixin',
        name: 'WeChat channel',
        enabled: true,
        connected: false,
        status: 'connecting',
        hasToken: true,
      }),
    ]);
    await app.close();
  });

  it('reports session timeout as disconnected for the managed weixin runtime', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
        errcode: -14,
        errmsg: 'session timeout',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const db = memoryDb();
    const { app } = createDaemonServer({
      db,
      wechat: { enabled: true, baseUrl: 'https://ilinkai.weixin.qq.com', token: 'secret-token', accountId: 'wx-account-1' },
    });

    await app.ready();

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    }, { timeout: 4_000 });

    await vi.waitFor(async () => {
      const response = await app.inject({ method: 'GET', url: '/api/channel/plugins' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          id: 'weixin',
          enabled: true,
          connected: false,
          status: 'session_timeout',
          lastError: 'weixin_get_updates_failed:-14:session timeout',
        }),
      ]);
    }, { timeout: 4_000 });

    await app.close();
    vi.stubGlobal('fetch', originalFetch);
  }, 10_000);

  it('proxies AionUi-compatible WeChat login SSE from the clawbot service', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          qrcode: 'ticket_123',
          qrcode_img_content: 'wx://qr-ticket',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { status: 'scaned' },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          status: 'confirmed',
          ilink_bot_id: 'wx-account-1',
          bot_token: 'wx-bot-token',
          baseurl: 'https://ilinkai.weixin.qq.com',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);
    const db = memoryDb();
    const { app } = createDaemonServer({
      db,
      wechat: { enabled: false },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/channel/weixin/login',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: qr');
    expect(response.body).toContain('{"qrcodeData":"wx://qr-ticket"}');
    expect(response.body).toContain('event: scanned');
    expect(response.body).toContain('event: done');
    expect(response.body).toContain('{"accountId":"wx-account-1","botToken":"wx-bot-token","baseUrl":"https://ilinkai.weixin.qq.com"}');
    await app.close();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('can drive provider chat from weixin-direct polling without inbound webhook posts', async () => {
    const db = memoryDb();
    new UserRepository(db).createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });

    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'buf_1',
          messages: [
            {
              id: 'msg_1',
              chatId: 'chat-a',
              userId: 'wx_user_1',
              text: 'run tests',
              contextToken: 'ctx_123',
            },
          ],
        })
        .mockResolvedValue({
          nextBuffer: 'buf_1',
          messages: [],
        }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };

    const channel = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    const { app } = createDaemonServer({
      db,
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
    });

    void channel.start();

    await vi.waitFor(() => {
      expect(new PermissionRequestRepository(db).listPending()).toHaveLength(1);
    });

    const logs = new BridgeEventRepository(db).listForSession(
      new PermissionRequestRepository(db).listPending()[0]!.bridgeSessionId,
    );
    expect(logs).toEqual([
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'permission_request', text: '允许执行 fake command?' }),
    ]);
    expect(api.sendTextMessage).toHaveBeenCalledWith({
      toUserId: 'chat-a',
      text: '收到：run tests',
      contextToken: 'ctx_123',
    });

    await app.close();
  });

  it('boots the default direct weixin channel and processes polled messages through the daemon wiring', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ret: 0,
        errcode: 0,
        msgs: [
          {
            from_user_id: 'wx_user_1',
            context_token: 'ctx_456',
            msg_id: 'msg_1',
            item_list: [
              { type: 1, text_item: { text: 'run tests' } },
            ],
          },
        ],
        get_updates_buf: 'buf_1',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValue(new Response(JSON.stringify({
        ret: 0,
        errcode: 0,
        msgs: [],
        get_updates_buf: 'buf_1',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const db = memoryDb();
    new UserRepository(db).createUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
      defaultProvider: 'claude-code',
      defaultCwd: '/tmp/project',
    });

    const { app } = createDaemonServer({
      db,
      providers: [new FakeProviderAdapter('claude-code')],
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-bot-token',
        accountId: 'wx-account-1',
      },
    });

    await app.ready();

    await vi.waitFor(() => {
      expect(new PermissionRequestRepository(db).listPending()).toHaveLength(1);
    });

    const pending = new PermissionRequestRepository(db).listPending();
    const logs = new BridgeEventRepository(db).listForSession(pending[0]!.bridgeSessionId);
    expect(logs).toEqual([
      expect.objectContaining({ direction: 'provider_event', providerEventType: 'permission_request', text: '允许执行 fake command?' }),
    ]);

    const sendCalls = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/ilink/bot/sendmessage'));
    expect(sendCalls).toHaveLength(2);
    expect(String((sendCalls[0]?.[1] as RequestInit | undefined)?.body)).toContain('"context_token":"ctx_456"');

    await app.close();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('auto-authorizes first-contact messages in direct weixin mode', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ret: 0,
        errcode: 0,
        msgs: [
          {
            from_user_id: 'wx_user_unauthorized',
            msg_id: 'msg_1',
            item_list: [
              { type: 1, text_item: { text: 'hello' } },
            ],
          },
        ],
        get_updates_buf: 'buf_1',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValue(new Response(JSON.stringify({
        ret: 0,
        errcode: 0,
        msgs: [],
        get_updates_buf: 'buf_1',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const db = memoryDb();
    const { app, pairings, users } = createDaemonServer({
      db,
      providers: [new FakeProviderAdapter('claude-code')],
      wechat: {
        enabled: true,
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'wx-bot-token',
        accountId: 'wx-account-1',
      },
    });

    await app.ready();

    await vi.waitFor(() => {
      expect(users.listUsers()).toHaveLength(1);
    });

    expect(pairings.listPending()).toEqual([]);
    expect(users.listUsers()[0]).toMatchObject({
      platformUserId: 'wx_user_unauthorized',
      defaultProvider: 'claude-code',
    });

    await app.close();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('starts direct weixin polling immediately after enabling the plugin from the admin route and auto-authorizes the sender', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ret: 0,
        errcode: 0,
        msgs: [
          {
            from_user_id: 'wx_user_late_enable',
            msg_id: 'msg_1',
            item_list: [
              { type: 1, text_item: { text: 'hello after login' } },
            ],
          },
        ],
        get_updates_buf: 'buf_1',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValue(new Response(JSON.stringify({
        ret: 0,
        errcode: 0,
        msgs: [],
        get_updates_buf: 'buf_1',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const db = memoryDb();
    const { app, pairings, users } = createDaemonServer({
      db,
      providers: [new FakeProviderAdapter('claude-code')],
      wechat: { enabled: false },
    });

    await app.ready();

    const enable = await app.inject({
      method: 'POST',
      url: '/api/channel/plugins/enable',
      payload: {
        plugin_id: 'weixin',
        config: {
          baseUrl: 'https://ilinkai.weixin.qq.com',
          credentials: {
            account_id: 'wx-account-1',
            bot_token: 'wx-bot-token',
          },
        },
      },
    });

    expect(enable.statusCode).toBe(200);

    await vi.waitFor(() => {
      expect(users.listUsers()).toHaveLength(1);
    });

    expect(pairings.listPending()).toEqual([]);
    expect(users.listUsers()[0]).toMatchObject({
      platformUserId: 'wx_user_late_enable',
      defaultProvider: 'claude-code',
    });

    await app.close();
    vi.stubGlobal('fetch', originalFetch);
  });
});
