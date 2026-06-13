import type { ChannelIncomingMessage, ChannelOutgoingMessage } from '../types';
import type { WechatClawbotInboundPayload, WechatClawbotSendBody } from './types';

export function mapWechatInboundToChannelMessage(payload: WechatClawbotInboundPayload): ChannelIncomingMessage {
  return {
    id: payload.id,
    platform: 'wechat-clawbot',
    chatId: payload.chatId,
    user: {
      id: payload.senderId,
      ...(payload.senderName ? { displayName: payload.senderName } : {}),
    },
    content: {
      type: 'text',
      text: payload.text ?? '',
    },
    timestamp: Date.now(),
    raw: payload.raw ?? payload,
  };
}

export function mapChannelOutgoingToWechatSendBody(message: ChannelOutgoingMessage): WechatClawbotSendBody {
  return {
    chatId: message.chatId,
    kind: message.kind,
    text: message.text,
    ...(message.buttons ? { buttons: message.buttons } : {}),
  };
}
