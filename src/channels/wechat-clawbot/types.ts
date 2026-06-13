import type { ChannelOutgoingMessage } from '../types';

export type WechatClawbotInboundPayload = {
  id: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  text?: string;
  isGroup?: boolean;
  mentionedSelf?: boolean;
  raw?: unknown;
};

export type WechatClawbotSendBody = Pick<ChannelOutgoingMessage, 'chatId' | 'kind' | 'text' | 'buttons'>;
