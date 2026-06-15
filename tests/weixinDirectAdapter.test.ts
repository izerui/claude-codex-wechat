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
});
