import { describe, expect, it, vi } from 'vitest';
import { WechatClawbotAdapter } from '../src/channels/wechat-clawbot/adapter';

describe('WechatClawbotAdapter', () => {
  it('maps inbound payloads and invokes registered handler', async () => {
    const client = { sendMessage: vi.fn() };
    const adapter = new WechatClawbotAdapter({ client });
    const received: unknown[] = [];
    adapter.onMessage(async (message) => {
      received.push(message);
    });

    await adapter.receiveInbound({
      id: 'wx_msg_1',
      chatId: 'chat-a',
      senderId: 'user-a',
      text: 'hello',
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ chatId: 'chat-a', user: { id: 'user-a' }, content: { text: 'hello' } });
  });

  it('forwards outgoing messages through the client', async () => {
    const client = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    const adapter = new WechatClawbotAdapter({ client });

    await adapter.sendMessage({ chatId: 'chat-a', kind: 'text', text: 'reply' });

    expect(client.sendMessage).toHaveBeenCalledWith({ chatId: 'chat-a', kind: 'text', text: 'reply' });
  });
});
