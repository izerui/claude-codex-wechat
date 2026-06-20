import type { ChannelAdapter, ChannelIncomingMessage, ChannelMessageHandler, ChannelOutgoingMessage } from '../types';
import { PRIMARY_WEIXIN_PLATFORM } from '../platforms';

type WeixinDirectApi = {
  getUpdates(buffer: string, signal?: AbortSignal): Promise<{
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
  getConfig?(input: { ilinkUserId: string; contextToken?: string }): Promise<{ typingTicket: string }>;
  sendTyping?(input: { ilinkUserId: string; typingTicket: string; status: 1 | 2 }): Promise<void>;
};

export class WeixinDirectAdapter implements ChannelAdapter {
  readonly id = 'weixin-direct';
  private static readonly SESSION_TIMEOUT_THRESHOLD = 3;
  private handler: ChannelMessageHandler | null = null;
  private stopped = true;
  private buffer = '';
  private contextTokens = new Map<string, string>();
  private typingTickets = new Map<string, string>();
  private typingChain = new Map<string, Promise<void>>();
  private runningTask: Promise<void> | null = null;
  private pollAbort: AbortController | null = null;
  private healthy = false;
  private lastError: string | null = null;
  private consecutiveSessionTimeouts = 0;
  private healthListeners = new Set<() => void>();
  private lastNotifiedStatus: string | null = null;

  constructor(private readonly options: {
    api: WeixinDirectApi;
    pollIntervalMs?: number;
  }) {}

  onMessage(handler: ChannelMessageHandler): void {
    this.handler = handler;
  }

  onHealthChange(listener: () => void): void {
    this.healthListeners.add(listener);
  }

  private notifyHealthChange(): void {
    const status = this.getHealth().status;
    if (status === this.lastNotifiedStatus) return;
    this.lastNotifiedStatus = status;
    for (const listener of this.healthListeners) listener();
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
    this.pollAbort?.abort();
    await this.runningTask;
    this.runningTask = null;
    this.notifyHealthChange();
  }

  async sendMessage(message: ChannelOutgoingMessage): Promise<void> {
    await this.options.api.sendTextMessage({
      toUserId: message.chatId,
      text: message.text,
      contextToken: this.contextTokens.get(message.chatId),
    });
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    if (!this.options.api.getConfig || !this.options.api.sendTyping) return;
    // Serialize writes per chat (chain updated synchronously, before any await)
    // so a fire-and-forget keepalive `true` can never land on the wire after the
    // turn's final `false` and leave WeChat stuck showing "正在输入".
    const previous = this.typingChain.get(chatId) ?? Promise.resolve();
    const next = previous.then(
      () => this.writeTyping(chatId, active),
      () => this.writeTyping(chatId, active),
    );
    this.typingChain.set(chatId, next);
    next.finally(() => {
      if (this.typingChain.get(chatId) === next) this.typingChain.delete(chatId);
    });
    await next;
  }

  private async writeTyping(chatId: string, active: boolean): Promise<void> {
    try {
      const typingTicket = await this.getTypingTicket(chatId);
      if (!typingTicket) return;
      await this.options.api.sendTyping?.({
        ilinkUserId: chatId,
        typingTicket,
        status: active ? 1 : 2,
      });
    } catch (error) {
      console.error('[weixin-typing] setTyping failed:', error);
    }
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
        this.pollAbort = new AbortController();
        // getUpdates is a long-poll that stays pending until an inbound message
        // arrives, so an idle-but-healthy connection never produces a response.
        // Treat a dispatched in-flight poll (no prior error) as connected instead
        // of waiting for the first response, otherwise the channel is stuck
        // showing "connecting" until someone messages the bot.
        if (!this.healthy && !this.lastError) {
          this.healthy = true;
          this.notifyHealthChange();
        }
        updates = await this.options.api.getUpdates(this.buffer, this.pollAbort.signal);
        this.healthy = true;
        this.lastError = null;
        this.consecutiveSessionTimeouts = 0;
        this.notifyHealthChange();
      } catch (error) {
        if (this.stopped) break;
        this.healthy = false;
        this.lastError = error instanceof Error ? error.message : String(error);
        if (this.lastError.includes('session timeout')) this.consecutiveSessionTimeouts += 1;
        else this.consecutiveSessionTimeouts = 0;
        this.notifyHealthChange();
        await new Promise((resolve) => setTimeout(resolve, this.options.pollIntervalMs ?? 1_000));
        continue;
      }
      this.buffer = updates.nextBuffer;
      for (const message of updates.messages) {
        if (message.contextToken) {
          this.contextTokens.set(message.chatId, message.contextToken);
        }
        // Dispatch without awaiting the full turn so the long-poll loop stays
        // responsive while a generation streams — this is what lets /cancel and
        // follow-up messages reach the router mid-generation. Per-chat generation
        // ordering is enforced inside MessageRouter (its serialization chain is
        // established synchronously, before any await).
        void this.handler?.({
          id: message.id,
          platform: PRIMARY_WEIXIN_PLATFORM,
          chatId: message.chatId,
          user: { id: message.userId },
          content: { type: 'text', text: message.text },
          timestamp: Date.now(),
          raw: message,
        })?.catch((error) => {
          console.error('[weixin] message handler failed:', error);
        });
        if (this.stopped) break;
      }
      if (this.stopped) break;
      await new Promise((resolve) => setTimeout(resolve, this.options.pollIntervalMs ?? 1_000));
    }
  }

  private async getTypingTicket(chatId: string): Promise<string> {
    if (!this.options.api.getConfig) return '';
    const cached = this.typingTickets.get(chatId);
    if (cached) return cached;
    const config = await this.options.api.getConfig({
      ilinkUserId: chatId,
      contextToken: this.contextTokens.get(chatId),
    });
    const ticket = config.typingTicket.trim();
    if (ticket) this.typingTickets.set(chatId, ticket);
    return ticket;
  }
}
