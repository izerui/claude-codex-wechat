import { describe, expect, it } from 'vitest';
import { mapChannelOutgoingToWechatSendBody, mapWechatInboundToChannelMessage } from '../src/channels/wechat-clawbot/messageMapping';

describe('wechat clawbot message mapping', () => {
  it('maps inbound text payload to channel message', () => {
    const message = mapWechatInboundToChannelMessage({
      id: 'wx_msg_1',
      chatId: 'wx_chat_1',
      senderId: 'wx_user_1',
      senderName: 'Alice',
      text: 'hello',
      isGroup: false,
      mentionedSelf: false,
      raw: { source: 'clawbot' },
    });

    expect(message).toMatchObject({
      id: 'wx_msg_1',
      platform: 'wechat-clawbot',
      chatId: 'wx_chat_1',
      user: { id: 'wx_user_1', displayName: 'Alice' },
      content: { type: 'text', text: 'hello' },
      raw: { source: 'clawbot' },
    });
    expect(message.timestamp).toBeTypeOf('number');
  });

  it('maps channel outgoing message to clawbot send body', () => {
    expect(mapChannelOutgoingToWechatSendBody({
      chatId: 'wx_chat_1',
      kind: 'permission_request',
      text: 'approve?',
      buttons: [{ id: 'approve', label: 'Approve', command: '/approve pr_1' }],
    })).toEqual({
      chatId: 'wx_chat_1',
      kind: 'permission_request',
      text: 'approve?',
      buttons: [{ id: 'approve', label: 'Approve', command: '/approve pr_1' }],
    });
  });
});
