import { describe, expect, it, vi } from 'vitest';
import { WeixinDirectAdapter } from '../src/channels/weixin-direct/adapter';
import type { ChannelIncomingMessage } from '../src/channels/types';

describe('WeixinDirectAdapter', () => {
  it('polls updates and forwards inbound text messages to the registered handler', async () => {
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'buf_1',
          messages: [
            {
              id: 'msg_1',
              chatId: 'user_a',
              userId: 'user_a',
              text: 'hello from weixin',
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

    const adapter = new WeixinDirectAdapter({
      api,
      pollIntervalMs: 1,
    });

    const received: unknown[] = [];
    adapter.onMessage(async (message) => {
      received.push(message);
      await adapter.stop();
    });

    await adapter.start({ background: true });

    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      id: 'msg_1',
      chatId: 'user_a',
      user: { id: 'user_a' },
      content: { text: 'hello from weixin' },
    });
  });

  it('can be started in background mode without awaiting the polling loop', async () => {
    let resolvePoll: ((value: { nextBuffer: string; messages: never[] }) => void) | undefined;
    const api = {
      getUpdates: vi.fn().mockImplementation(() => new Promise<{ nextBuffer: string; messages: never[] }>((resolve) => {
        resolvePoll = resolve;
      })),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});

    await adapter.start({ background: true });
    expect(api.getUpdates).toHaveBeenCalledTimes(1);

    const completePoll = resolvePoll;
    if (!completePoll) throw new Error('expected polling promise resolver');
    completePoll({ nextBuffer: 'buf_1', messages: [] });
    await adapter.stop();
  });

  it('sends replies with the last context token for the chat', async () => {
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'buf_1',
          messages: [
            {
              id: 'msg_1',
              chatId: 'user_a',
              userId: 'user_a',
              text: 'hello from weixin',
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

    const adapter = new WeixinDirectAdapter({
      api,
      pollIntervalMs: 1,
    });

    adapter.onMessage(async () => {
      await adapter.stop();
    });

    await adapter.start({ background: true });
    await vi.waitFor(() => {
      expect(api.getUpdates).toHaveBeenCalled();
    });
    await adapter.sendMessage({ chatId: 'user_a', kind: 'text', text: 'reply' });

    expect(api.sendTextMessage).toHaveBeenCalledWith({
      toUserId: 'user_a',
      text: 'reply',
      contextToken: 'ctx_123',
    });
  });

  it('retries polling after transient getUpdates failure', async () => {
    const api = {
      getUpdates: vi.fn()
        .mockRejectedValueOnce(new Error('temporary network error'))
        .mockResolvedValueOnce({
          nextBuffer: 'buf_1',
          messages: [
            {
              id: 'msg_1',
              chatId: 'user_a',
              userId: 'user_a',
              text: 'hello after retry',
            },
          ],
        })
        .mockResolvedValue({
          nextBuffer: 'buf_1',
          messages: [],
        }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    const received: string[] = [];
    adapter.onMessage(async (message) => {
      received.push(message.content.text ?? '');
      await adapter.stop();
    });

    await adapter.start({ background: true });

    await vi.waitFor(() => {
      expect(received).toEqual(['hello after retry']);
      expect(api.getUpdates).toHaveBeenCalledTimes(2);
    });
  });

  it('does not mark the plugin as session_timeout after a single timeout-shaped polling failure', async () => {
    const api = {
      getUpdates: vi.fn()
        .mockRejectedValueOnce(new Error('weixin_get_updates_failed:-14:session timeout'))
        .mockImplementation(() => new Promise<never>(() => {})),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});

    await adapter.start({ background: true });

    await vi.waitFor(() => {
      expect(api.getUpdates).toHaveBeenCalled();
      expect(adapter.getHealth()).toMatchObject({
        connected: false,
        status: 'poll_error',
        lastError: 'weixin_get_updates_failed:-14:session timeout',
      });
    });

    await adapter.stop();
  });

  it('marks the plugin as session_timeout after repeated timeout-shaped polling failures', async () => {
    const api = {
      getUpdates: vi.fn().mockRejectedValue(new Error('weixin_get_updates_failed:-14:session timeout')),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});

    await adapter.start({ background: true });

    await vi.waitFor(() => {
      expect(api.getUpdates.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(adapter.getHealth()).toMatchObject({
        connected: false,
        status: 'session_timeout',
        lastError: 'weixin_get_updates_failed:-14:session timeout',
      });
    });

    await adapter.stop();
  });

  it('reports connected while the first long-poll is in flight and has not yet returned', async () => {
    const api = {
      getUpdates: vi.fn().mockImplementation((_buffer: string, signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});

    await adapter.start({ background: true });

    await vi.waitFor(() => {
      expect(api.getUpdates).toHaveBeenCalled();
      expect(adapter.getHealth()).toMatchObject({ connected: true, status: 'connected' });
    });

    await adapter.stop();
  });

  it('aborts the in-flight getUpdates long-poll when stopped instead of waiting for it to return', async () => {
    let aborted = false;
    const api = {
      getUpdates: vi.fn().mockImplementation((_buffer: string, signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      })),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});

    await adapter.start({ background: true });
    await vi.waitFor(() => {
      expect(api.getUpdates).toHaveBeenCalled();
    });

    await adapter.stop();
    expect(aborted).toBe(true);
  });

  it('notifies health listeners with connected once the poll loop dispatches its long-poll', async () => {
    const api = {
      getUpdates: vi.fn()
        .mockImplementation((_buffer: string, signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});
    const statuses: string[] = [];
    adapter.onHealthChange(() => {
      statuses.push(adapter.getHealth().status);
    });

    await adapter.start({ background: true });

    await vi.waitFor(() => {
      expect(statuses).toContain('connected');
    });
    expect(adapter.getHealth().status).toBe('connected');

    await adapter.stop();
  });

  it('fetches typing ticket once and sends typing start/cancel for the chat', async () => {
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'buf_1',
          messages: [
            {
              id: 'msg_1',
              chatId: 'user_a',
              userId: 'user_a',
              text: 'hello from weixin',
              contextToken: 'ctx_123',
            },
          ],
        })
        .mockResolvedValue({
          nextBuffer: 'buf_1',
          messages: [],
        }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockResolvedValue({ typingTicket: 'ticket_123' }),
      sendTyping: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});

    await adapter.start({ background: true });
    await adapter.setTyping('user_a', true);
    await adapter.setTyping('user_a', false);

    await vi.waitFor(() => {
      expect(api.getConfig).toHaveBeenCalledWith({
        ilinkUserId: 'user_a',
        contextToken: 'ctx_123',
      });
      expect(api.sendTyping).toHaveBeenNthCalledWith(1, {
        ilinkUserId: 'user_a',
        typingTicket: 'ticket_123',
        status: 1,
      });
      expect(api.sendTyping).toHaveBeenNthCalledWith(2, {
        ilinkUserId: 'user_a',
        typingTicket: 'ticket_123',
        status: 2,
      });
    });

    await adapter.stop();
  });

  it('orders typing writes so a slow start cannot land after a later stop', async () => {
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => { releaseStart = resolve; });
    const landed: Array<1 | 2> = [];
    const api = {
      getUpdates: vi.fn().mockResolvedValue({ nextBuffer: 'buf_1', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockResolvedValue({ typingTicket: 'ticket_123' }),
      sendTyping: vi.fn().mockImplementation(async ({ status }: { status: 1 | 2 }) => {
        // Simulate the "typing start" round-trip lagging on the wire while the
        // later "typing stop" returns immediately.
        if (status === 1) await startGate;
        landed.push(status);
      }),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });

    // Fire-and-forget start (mirrors the keepalive), immediately followed by stop.
    void adapter.setTyping('user_a', true);
    const stop = adapter.setTyping('user_a', false);

    await Promise.resolve();
    releaseStart();
    await stop;

    await vi.waitFor(() => expect(landed.length).toBe(2));
    // The final state delivered to WeChat must be the stop (status 2), never a
    // stale start that re-enables "正在输入".
    expect(landed[landed.length - 1]).toBe(2);

    await adapter.stop();
  });

  it('swallows a failed typing stop without retrying', async () => {
    const api = {
      getUpdates: vi.fn().mockResolvedValue({ nextBuffer: 'buf_1', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockResolvedValue({ typingTicket: 'ticket_stale' }),
      sendTyping: vi.fn().mockImplementation(async ({ status, typingTicket }: { status: 1 | 2; typingTicket: string }) => {
        if (status === 2 && typingTicket === 'ticket_stale') throw new Error('invalid_typing_ticket');
      }),
    };

    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });

    await adapter.setTyping('user_a', true);
    await adapter.setTyping('user_a', false);

    expect(api.getConfig).toHaveBeenCalledTimes(1);
    expect(api.sendTyping).toHaveBeenCalledTimes(2);

    await adapter.stop();
  });

  it('refuses to send (and does not call the api) when no context token exists for the chat', async () => {
    const api = {
      getUpdates: vi.fn().mockResolvedValue({ nextBuffer: 'buf_1', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });

    await expect(
      adapter.sendMessage({ chatId: 'unknown_user', kind: 'text', text: 'hi' }),
    ).rejects.toThrow('weixin_no_context_token');
    expect(api.sendTextMessage).not.toHaveBeenCalled();

    await adapter.stop();
  });

  it('splits long outbound text into <=4000 char chunks, each carrying the context token', async () => {
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'buf_1',
          messages: [{ id: 'm1', chatId: 'user_a', userId: 'user_a', text: 'hi', contextToken: 'ctx_123' }],
        })
        .mockResolvedValue({ nextBuffer: 'buf_1', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, chunkDelayMs: 0 });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });
    await vi.waitFor(() => expect(api.getUpdates).toHaveBeenCalled());

    const longText = 'A'.repeat(4500); // no natural boundary → hard cut at 4000
    await adapter.sendMessage({ chatId: 'user_a', kind: 'text', text: longText });

    expect(api.sendTextMessage).toHaveBeenCalledTimes(2);
    const calls = api.sendTextMessage.mock.calls;
    expect(calls[0][0].text.length).toBe(4000);
    expect(calls[1][0].text.length).toBe(500);
    expect(calls[0][0]).toMatchObject({ toUserId: 'user_a', contextToken: 'ctx_123' });
    expect(calls[1][0]).toMatchObject({ toUserId: 'user_a', contextToken: 'ctx_123' });

    await adapter.stop();
  });

  it('prefers paragraph boundaries when chunking long text', async () => {
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'buf_1',
          messages: [{ id: 'm1', chatId: 'user_a', userId: 'user_a', text: 'hi', contextToken: 'ctx_123' }],
        })
        .mockResolvedValue({ nextBuffer: 'buf_1', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, chunkDelayMs: 0 });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });
    await vi.waitFor(() => expect(api.getUpdates).toHaveBeenCalled());

    const head = 'A'.repeat(3500);
    const tail = 'B'.repeat(2000);
    await adapter.sendMessage({ chatId: 'user_a', kind: 'text', text: `${head}\n\n${tail}` });

    const calls = api.sendTextMessage.mock.calls;
    expect(calls.length).toBe(2);
    // First chunk ends at the paragraph break (head only, no trailing B's).
    expect(calls[0][0].text).toBe(`${head}\n\n`);
    expect(calls[1][0].text).toBe(tail);

    await adapter.stop();
  });

  it('deduplicates inbound messages by msg_id within the dedup window', async () => {
    const dup = { id: 'dup_1', chatId: 'user_a', userId: 'user_a', text: 'once', contextToken: 'ctx_1' };
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({ nextBuffer: 'b1', messages: [dup] })
        .mockResolvedValueOnce({ nextBuffer: 'b2', messages: [dup] }) // same msg_id redelivered
        .mockResolvedValue({ nextBuffer: 'b2', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1 });
    const received: string[] = [];
    adapter.onMessage(async (m) => { received.push(m.id); });
    await adapter.start({ background: true });

    await vi.waitFor(() => expect(api.getUpdates.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(received).toEqual(['dup_1']); // delivered once despite two poll deliveries

    await adapter.stop();
  });

  it('loads persisted context tokens and cursor on start', async () => {
    const store = {
      load: vi.fn().mockReturnValue({ contextTokens: { user_a: 'ctx_loaded' }, cursor: 'buf_loaded' }),
      setContextToken: vi.fn(),
      setCursor: vi.fn(),
      canSend: vi.fn().mockReturnValue(true),
      recordSent: vi.fn(),
      getQuota: vi.fn().mockReturnValue({ remaining: 10, sentCount: 0, windowStartAt: Date.now(), expired: false }),
      clear: vi.fn(),
      enqueueOutbound: vi.fn(),
      peekOutbound: vi.fn().mockReturnValue([]),
      shiftOutbound: vi.fn(),
      hasPendingOutbound: vi.fn().mockReturnValue(false),
      clearOutbound: vi.fn(),
    };
    const api = {
      getUpdates: vi.fn().mockResolvedValue({ nextBuffer: 'buf_loaded', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, stateStore: store });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });
    await vi.waitFor(() => expect(api.getUpdates).toHaveBeenCalled());

    // first long-poll resumes from the persisted cursor
    expect(api.getUpdates.mock.calls[0][0]).toBe('buf_loaded');
    // persisted token lets us reply without a fresh inbound message this run
    await adapter.sendMessage({ chatId: 'user_a', kind: 'text', text: 'hi' });
    expect(api.sendTextMessage).toHaveBeenCalledWith({ toUserId: 'user_a', text: 'hi', contextToken: 'ctx_loaded' });

    await adapter.stop();
  });

  it('persists context token and cursor as messages arrive', async () => {
    const store = {
      load: vi.fn().mockReturnValue({ contextTokens: {}, cursor: '' }),
      setContextToken: vi.fn(),
      setCursor: vi.fn(),
      canSend: vi.fn().mockReturnValue(true),
      recordSent: vi.fn(),
      getQuota: vi.fn().mockReturnValue({ remaining: 10, sentCount: 0, windowStartAt: Date.now(), expired: false }),
      clear: vi.fn(),
      enqueueOutbound: vi.fn(),
      peekOutbound: vi.fn().mockReturnValue([]),
      shiftOutbound: vi.fn(),
      hasPendingOutbound: vi.fn().mockReturnValue(false),
      clearOutbound: vi.fn(),
    };
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({ nextBuffer: 'buf_1', messages: [{ id: 'm1', chatId: 'user_a', userId: 'user_a', text: 'hi', contextToken: 'ctx_new' }] })
        .mockResolvedValue({ nextBuffer: 'buf_1', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, stateStore: store });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });

    await vi.waitFor(() => {
      expect(store.setContextToken).toHaveBeenCalledWith('user_a', 'ctx_new');
      expect(store.setCursor).toHaveBeenCalledWith('buf_1');
    });

    await adapter.stop();
  });

  it('refuses to send when the store reports quota exhausted / window expired', async () => {
    const store = {
      load: vi.fn().mockReturnValue({ contextTokens: { user_a: 'ctx_1' }, cursor: '' }),
      setContextToken: vi.fn(),
      setCursor: vi.fn(),
      canSend: vi.fn().mockReturnValue(false),
      recordSent: vi.fn(),
      getQuota: vi.fn().mockReturnValue({ remaining: 0, sentCount: 10, windowStartAt: Date.now(), expired: false }),
      clear: vi.fn(),
      enqueueOutbound: vi.fn(),
      peekOutbound: vi.fn().mockReturnValue([]),
      shiftOutbound: vi.fn(),
      hasPendingOutbound: vi.fn().mockReturnValue(false),
      clearOutbound: vi.fn(),
    };
    const api = {
      getUpdates: vi.fn().mockResolvedValue({ nextBuffer: '', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, stateStore: store });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });

    await expect(
      adapter.sendMessage({ chatId: 'user_a', kind: 'text', text: 'hi' }),
    ).rejects.toThrow('weixin_push_quota_exceeded');
    expect(api.sendTextMessage).not.toHaveBeenCalled();
    expect(store.recordSent).not.toHaveBeenCalled();

    await adapter.stop();
  });

  it('records one quota slot per logical message regardless of chunk count', async () => {
    const store = {
      load: vi.fn().mockReturnValue({ contextTokens: { user_a: 'ctx_1' }, cursor: '' }),
      setContextToken: vi.fn(),
      setCursor: vi.fn(),
      canSend: vi.fn().mockReturnValue(true),
      recordSent: vi.fn(),
      getQuota: vi.fn().mockReturnValue({ remaining: 10, sentCount: 0, windowStartAt: Date.now(), expired: false }),
      clear: vi.fn(),
      enqueueOutbound: vi.fn(),
      peekOutbound: vi.fn().mockReturnValue([]),
      shiftOutbound: vi.fn(),
      hasPendingOutbound: vi.fn().mockReturnValue(false),
      clearOutbound: vi.fn(),
    };
    const api = {
      getUpdates: vi.fn().mockResolvedValue({ nextBuffer: '', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, chunkDelayMs: 0, stateStore: store });
    adapter.onMessage(async () => {});
    await adapter.start({ background: true });

    // 4500 chars → 2 chunks (2 API calls) but ONE logical message → 1 quota slot
    await adapter.sendMessage({ chatId: 'user_a', kind: 'text', text: 'A'.repeat(4500) });
    expect(api.sendTextMessage).toHaveBeenCalledTimes(2);
    expect(store.recordSent).toHaveBeenCalledTimes(1);
    expect(store.recordSent).toHaveBeenCalledWith('user_a');

    await adapter.stop();
  });

  it('downloads inbound media and exposes attachments with local paths', async () => {
    const downloader = { download: vi.fn().mockResolvedValue({ ok: true, localPath: '/media/m1_0.jpg', bytes: 100 }) };
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'b',
          messages: [{
            id: 'm1', chatId: 'user_a', userId: 'user_a', text: '看图', contextToken: 'ctx',
            attachments: [{ kind: 'image', media: { encrypt_query_param: 'q', aes_key: 'k' }, aeskey: '00112233445566778899aabbccddeeff' }],
          }],
        })
        .mockResolvedValue({ nextBuffer: 'b', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const received: ChannelIncomingMessage[] = [];
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, mediaDownloader: downloader as never, mediaDir: '/media' });
    adapter.onMessage(async (m) => { received.push(m as ChannelIncomingMessage); });
    await adapter.start({ background: true });

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]!.content).toMatchObject({
      type: 'mixed',
      text: '看图',
      attachments: [{ kind: 'image', localPath: '/media/m1_0.jpg' }],
    });
    expect(downloader.download).toHaveBeenCalledWith(
      { encrypt_query_param: 'q', aes_key: 'k' },
      expect.objectContaining({ aeskeyOverride: '00112233445566778899aabbccddeeff', destPath: '/media/m1_0.jpg' }),
    );
    await adapter.stop();
  });

  it('marks an attachment failed when download fails, without dropping the message', async () => {
    const downloader = { download: vi.fn().mockResolvedValue({ ok: false, reason: 'too_large' }) };
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'b',
          messages: [{ id: 'm2', chatId: 'user_a', userId: 'user_a', text: '', contextToken: 'ctx', attachments: [{ kind: 'video', media: { encrypt_query_param: 'q', aes_key: 'k' } }] }],
        })
        .mockResolvedValue({ nextBuffer: 'b', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const received: ChannelIncomingMessage[] = [];
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, mediaDownloader: downloader as never, mediaDir: '/media' });
    adapter.onMessage(async (m) => { received.push(m as ChannelIncomingMessage); });
    await adapter.start({ background: true });

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]!.content).toMatchObject({
      type: 'video',
      attachments: [{ kind: 'video', failed: true, failReason: 'too_large' }],
    });
    // video gets the 25MB cap passed through
    expect(downloader.download.mock.calls[0][1]).toMatchObject({ maxBytes: 25 * 1024 * 1024 });
    await adapter.stop();
  });

  it('downloads quoted-message attachments too', async () => {
    const downloader = { download: vi.fn().mockResolvedValue({ ok: true, localPath: '/media/m3_q_0.jpg', bytes: 1 }) };
    const api = {
      getUpdates: vi.fn()
        .mockResolvedValueOnce({
          nextBuffer: 'b',
          messages: [{
            id: 'm3', chatId: 'user_a', userId: 'user_a', text: '这个怎么改', contextToken: 'ctx',
            quoted: { text: '原始内容', attachments: [{ kind: 'image', media: { encrypt_query_param: 'q', aes_key: 'k' } }] },
          }],
        })
        .mockResolvedValue({ nextBuffer: 'b', messages: [] }),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
    };
    const received: ChannelIncomingMessage[] = [];
    const adapter = new WeixinDirectAdapter({ api, pollIntervalMs: 1, mediaDownloader: downloader as never, mediaDir: '/media' });
    adapter.onMessage(async (m) => { received.push(m as ChannelIncomingMessage); });
    await adapter.start({ background: true });

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]!.content.quoted).toMatchObject({
      text: '原始内容',
      attachments: [{ kind: 'image', localPath: '/media/m3_q_0.jpg' }],
    });
    await adapter.stop();
  });
});
