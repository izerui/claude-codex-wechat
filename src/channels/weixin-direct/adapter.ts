import { setTimeout as delay } from 'node:timers/promises';
import type { ChannelAdapter, ChannelMessageHandler, ChannelOutgoingMessage } from '../types';
import { PRIMARY_WEIXIN_PLATFORM } from '../platforms';
import type { WeixinStateStore } from './weixinStateStore';

const MAX_TEXT_LENGTH = 4_000;
const DEFAULT_CHUNK_DELAY_MS = 300;
const DEDUP_WINDOW_MS = 5 * 60_000;
const MAX_RETRY_DELAY_MS = 30_000;

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
  private seenMessageIds = new Map<string, number>();
  private retryDelayMs = 0;
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
    chunkDelayMs?: number;
    stateStore?: WeixinStateStore;
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
    if (this.options.stateStore) {
      const persisted = this.options.stateStore.load();
      for (const [userId, token] of Object.entries(persisted.contextTokens)) {
        this.contextTokens.set(userId, token);
      }
      if (persisted.cursor) this.buffer = persisted.cursor;
    }
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
    const contextToken = this.contextTokens.get(message.chatId);
    if (!contextToken) {
      // iLink reply/proactive-send requires a fresh context_token from the user's
      // latest inbound message. Without it the gateway rejects with -3; fail loudly
      // instead of firing a doomed request.
      throw new Error(`weixin_no_context_token:${message.chatId}`);
    }
    const chunks = chunkText(message.text ?? '', MAX_TEXT_LENGTH);
    const chunkDelayMs = this.options.chunkDelayMs ?? DEFAULT_CHUNK_DELAY_MS;
    for (let i = 0; i < chunks.length; i += 1) {
      // iLink hard limit: ≤10 proactive sends per token within 24h. Check before
      // each chunk so we fail loudly (quota error) instead of getting a -3 from
      // the gateway. Each chunk counts against the quota.
      if (this.options.stateStore && !this.options.stateStore.canSend(message.chatId)) {
        throw new Error(`weixin_push_quota_exceeded:${message.chatId}`);
      }
      if (i > 0 && chunkDelayMs > 0) await delay(chunkDelayMs);
      await this.options.api.sendTextMessage({
        toUserId: message.chatId,
        text: chunks[i]!,
        contextToken,
      });
      this.options.stateStore?.recordSent(message.chatId);
    }
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
        this.retryDelayMs = 0;
        this.notifyHealthChange();
      } catch (error) {
        if (this.stopped) break;
        this.healthy = false;
        this.lastError = error instanceof Error ? error.message : String(error);
        if (this.lastError.includes('session timeout')) this.consecutiveSessionTimeouts += 1;
        else this.consecutiveSessionTimeouts = 0;
        this.notifyHealthChange();
        // Exponential backoff: start at pollIntervalMs, double each consecutive
        // failure, cap at MAX_RETRY_DELAY_MS. Reset to 0 on the next success.
        const base = this.options.pollIntervalMs ?? 1_000;
        this.retryDelayMs = this.retryDelayMs === 0
          ? base
          : Math.min(this.retryDelayMs * 2, MAX_RETRY_DELAY_MS);
        await delay(this.retryDelayMs);
        continue;
      }
      this.buffer = updates.nextBuffer;
      this.options.stateStore?.setCursor(this.buffer);
      for (const message of updates.messages) {
        if (this.isDuplicate(message.id)) continue;
        if (message.contextToken) {
          this.contextTokens.set(message.chatId, message.contextToken);
          this.options.stateStore?.setContextToken(message.chatId, message.contextToken);
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
      await delay(this.options.pollIntervalMs ?? 1_000);
    }
  }

  private isDuplicate(id: string): boolean {
    if (!id) return false;
    const now = Date.now();
    for (const [seenId, ts] of this.seenMessageIds) {
      if (now - ts > DEDUP_WINDOW_MS) this.seenMessageIds.delete(seenId);
    }
    if (this.seenMessageIds.has(id)) return true;
    this.seenMessageIds.set(id, now);
    return false;
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

/**
 * Split text into <=limit chunks at natural boundaries.
 * Priority: paragraph break → line break → space → hard cut.
 */
function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    let splitAt = -1;
    const win = remaining.slice(0, limit);
    const para = win.lastIndexOf('\n\n');
    if (para > limit * 0.3) splitAt = para + 2;
    if (splitAt === -1) {
      const line = win.lastIndexOf('\n');
      if (line > limit * 0.3) splitAt = line + 1;
    }
    if (splitAt === -1) {
      const space = win.lastIndexOf(' ');
      if (space > limit * 0.3) splitAt = space + 1;
    }
    if (splitAt === -1) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks.length > 0 ? chunks : [''];
}
