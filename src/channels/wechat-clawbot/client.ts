import type { ChannelOutgoingMessage } from '../types';
import { mapChannelOutgoingToWechatSendBody } from './messageMapping';

export class WechatClawbotHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'WechatClawbotHttpError';
  }
}

export class WechatClawbotHttpClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(input: { baseUrl: string; token?: string }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, '');
    this.token = input.token;
  }

  async sendMessage(message: ChannelOutgoingMessage): Promise<void> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await fetch(`${this.baseUrl}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(mapChannelOutgoingToWechatSendBody(message)),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new WechatClawbotHttpError(`wechat_clawbot_send_failed:${response.status}`, response.status, body);
    }
  }
}
