import type { ChannelAdapter, ChannelMessageHandler, ChannelOutgoingMessage } from '../types';
import { mapWechatInboundToChannelMessage } from './messageMapping';
import type { WechatClawbotInboundPayload } from './types';

export type WechatClawbotSender = {
  sendMessage(message: ChannelOutgoingMessage): Promise<void>;
};

export class WechatClawbotAdapter implements ChannelAdapter {
  readonly id = 'wechat-clawbot';
  private handler: ChannelMessageHandler | null = null;

  constructor(private readonly options: { client: WechatClawbotSender }) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  onMessage(handler: ChannelMessageHandler): void {
    this.handler = handler;
  }

  async sendMessage(message: ChannelOutgoingMessage): Promise<void> {
    await this.options.client.sendMessage(message);
  }

  async receiveInbound(payload: WechatClawbotInboundPayload): Promise<void> {
    if (!this.handler) throw new Error('wechat_clawbot_handler_not_registered');
    await this.handler(mapWechatInboundToChannelMessage(payload));
  }
}
