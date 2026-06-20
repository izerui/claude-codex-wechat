import { describe, expect, it, vi } from 'vitest';
import { WeixinDirectAdapter } from '../src/channels/weixin-direct/adapter';

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
});
