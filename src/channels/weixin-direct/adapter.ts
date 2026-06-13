import type { ChannelAdapter, ChannelIncomingMessage, ChannelMessageHandler, ChannelOutgoingMessage } from '../types';
import { PRIMARY_WEIXIN_PLATFORM } from '../platforms';

type WeixinDirectApi = {
  getUpdates(buffer: string): Promise<{
    nextBuffer: string;
    messages: Array<{
      id: string;
      chatId: string;
      userId: string;
      text: string;
      contextToken?: string;
    }>;
  }>;
  sendTextMessage(input: { toUserId: string; text: string; contextToken?: string }): Promise<void>;
};

export class WeixinDirectAdapter implements ChannelAdapter {
  readonly id = 'weixin-direct';
  private handler: ChannelMessageHandler | null = null;
  private stopped = true;
  private buffer = '';
  private contextTokens = new Map<string, string>();
  private runningTask: Promise<void> | null = null;

  constructor(private readonly options: {
    api: WeixinDirectApi;
    pollIntervalMs?: number;
  }) {}

  onMessage(handler: ChannelMessageHandler): void {
    this.handler = handler;
  }

  async start(input?: { background?: boolean }): Promise<void> {
    if (!this.handler) throw new Error('weixin_direct_handler_not_registered');
    this.stopped = false;
    const loop = this.runLoop();
    this.runningTask = loop;
    if (input?.background) return;
    await loop;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.runningTask;
    this.runningTask = null;
  }

  async sendMessage(message: ChannelOutgoingMessage): Promise<void> {
    await this.options.api.sendTextMessage({
      toUserId: message.chatId,
      text: message.text,
      contextToken: this.contextTokens.get(message.chatId),
    });
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped) {
      let updates;
      try {
        updates = await this.options.api.getUpdates(this.buffer);
      } catch {
        if (this.stopped) break;
        await new Promise((resolve) => setTimeout(resolve, this.options.pollIntervalMs ?? 1_000));
        continue;
      }
      this.buffer = updates.nextBuffer;
      for (const message of updates.messages) {
        if (message.contextToken) {
          this.contextTokens.set(message.chatId, message.contextToken);
        }
        await this.handler?.({
          id: message.id,
          platform: PRIMARY_WEIXIN_PLATFORM,
          chatId: message.chatId,
          user: { id: message.userId },
          content: { type: 'text', text: message.text },
          timestamp: Date.now(),
          raw: message,
        });
        if (this.stopped) break;
      }
      if (this.stopped) break;
      await new Promise((resolve) => setTimeout(resolve, this.options.pollIntervalMs ?? 1_000));
    }
  }
}
