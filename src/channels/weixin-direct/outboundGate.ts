import type { OutboundDeliveryGate } from '../../session/outboundGate';
import type { OutboundQueueItem, WeixinStateStore } from './weixinStateStore';

/** Appended to the last message a token's quota can carry, to guide the user to refresh. */
export const CONTINUATION_HINT = '\n\n（消息较多未发完，请回复任意消息继续接收）';

/**
 * Quota-aware outbound gate for the WeChat iLink channel.
 *
 * Each token allows ≤10 proactive sends within 24h. This gate sends while quota
 * lasts, appends a continuation hint on the last slot, and queues the rest. When
 * the user replies (refreshing the token + quota), `drain` replays the queue.
 */
export class WeixinOutboundGate implements OutboundDeliveryGate {
  private readonly hintedReplies = new Map<string, number>();
  private static readonly HINT_REPLY_TTL_MS = 2 * 60 * 60 * 1000;

  constructor(private readonly options: {
    store: WeixinStateStore;
    send: (chatId: string, message: OutboundQueueItem) => Promise<void>;
  }) {}

  hasPending(chatId: string): boolean {
    return this.options.store.hasPendingOutbound(chatId);
  }

  shouldInterceptReply(chatId: string): boolean {
    const hintedAt = this.hintedReplies.get(chatId);
    if (!hintedAt) return false;
    if (Date.now() - hintedAt > WeixinOutboundGate.HINT_REPLY_TTL_MS) {
      this.hintedReplies.delete(chatId);
      return false;
    }
    this.hintedReplies.delete(chatId);
    return true;
  }

  async deliver(chatId: string, message: OutboundQueueItem): Promise<void> {
    const { store } = this.options;
    // Already backed up → keep everything ordered behind the queue.
    if (store.hasPendingOutbound(chatId)) {
      store.enqueueOutbound(chatId, message);
      return;
    }
    const quota = store.getQuota(chatId);
    if (quota.expired || quota.remaining <= 0) {
      store.enqueueOutbound(chatId, message);
      return;
    }
    if (quota.remaining === 1) {
      // Last slot. In the streaming case we can't know if more will follow, so we
      // always append the hint here; if nothing follows it's a harmless nudge.
      await this.options.send(chatId, { kind: message.kind, text: message.text + CONTINUATION_HINT });
      this.hintedReplies.set(chatId, Date.now());
      return;
    }
    await this.options.send(chatId, message);
  }

  async drain(chatId: string): Promise<void> {
    const { store } = this.options;
    while (store.hasPendingOutbound(chatId)) {
      const quota = store.getQuota(chatId);
      if (quota.expired || quota.remaining <= 0) break; // out of quota; leave the rest queued
      const pending = store.peekOutbound(chatId);
      const next = pending[0]!;
      const isLastSlot = quota.remaining === 1;
      const hasMore = pending.length > 1;
      if (isLastSlot && hasMore) {
        // Draining knows exactly whether more follows, so the hint is precise.
        await this.options.send(chatId, { kind: next.kind, text: next.text + CONTINUATION_HINT });
        this.hintedReplies.set(chatId, Date.now());
        store.shiftOutbound(chatId);
        break; // quota exhausted; remaining stay queued for the next refresh
      }
      await this.options.send(chatId, next);
      store.shiftOutbound(chatId);
    }
    if (!store.hasPendingOutbound(chatId)) this.hintedReplies.delete(chatId);
  }
}
