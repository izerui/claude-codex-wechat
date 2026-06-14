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
  private static readonly SESSION_TIMEOUT_THRESHOLD = 3;
  private handler: ChannelMessageHandler | null = null;
  private stopped = true;
  private buffer = '';
  private contextTokens = new Map<string, string>();
  private runningTask: Promise<void> | null = null;
  private healthy = false;
  private lastError: string | null = null;
  private consecutiveSessionTimeouts = 0;

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

  getHealth(): { connected: boolean; status: string; lastError?: string } {
    if (this.lastError) {
      const status = this.consecutiveSessionTimeouts >= WeixinDirectAdapter.SESSION_TIMEOUT_THRESHOLD
        ? 'session_timeout'
        : 'poll_error';
      return {
        connected: false,
        status,
        lastError: this.lastError,
      };
    }
    if (this.healthy) return { connected: true, status: 'connected' };
    if (this.stopped) return { connected: false, status: 'stopped' };
    return { connected: false, status: 'connecting' };
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped) {
      let updates;
      try {
        updates = await this.options.api.getUpdates(this.buffer);
        this.healthy = true;
        this.lastError = null;
        this.consecutiveSessionTimeouts = 0;
      } catch (error) {
        this.healthy = false;
        this.lastError = error instanceof Error ? error.message : String(error);
        if (this.lastError.includes('session timeout')) this.consecutiveSessionTimeouts += 1;
        else this.consecutiveSessionTimeouts = 0;
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
