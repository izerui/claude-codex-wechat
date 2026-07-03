import type { OutboundDeliveryGate } from '../../session/outboundGate';
import type { OutboundQueueItem, WeixinStateStore } from './weixinStateStore';

/** Appended to the last message a token's quota can carry, to guide the user to refresh. */
export const CONTINUATION_HINT = '\n\n（消息较多未发完，请回复任意消息继续接收）';

/**
 * Quota-aware outbound gate for the WeChat iLink channel.
 *
 * Each token allows ≤10 proactive sends within 24h. This gate sends while quota
 * lasts and queues the rest. When the user replies (refreshing the token + quota),
 * `drain` replays the queue.
 *
 * The continuation hint must ride on the last message a token can still send, but
 * a streaming `deliver` can't know whether the current message is the last one.
 * So when only the final slot remains, the message is buffered rather than sent:
 * if another message follows, the buffered one is flushed WITH the hint (more
 * really did follow); if the turn ends first, `finalize` flushes it WITHOUT the
 * hint. This avoids tagging a genuinely-final message as "more to come".
 */
export class WeixinOutboundGate implements OutboundDeliveryGate {
  private readonly hintedReplies = new Map<string, number>();
  /** The message held back on the final quota slot, pending proof of a follow-up. */
  private readonly pendingLast = new Map<string, OutboundQueueItem>();
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
    // A message was buffered on the final slot and now another one arrives — proof
    // that more really follows. Flush the buffered one WITH the hint (it claims the
    // last slot), and queue this one behind the now-exhausted quota.
    const buffered = this.pendingLast.get(chatId);
    if (buffered) {
      this.pendingLast.delete(chatId);
      await this.options.send(chatId, appendHintIfText(buffered));
      this.hintedReplies.set(chatId, Date.now());
      store.enqueueOutbound(chatId, message);
      return;
    }
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
      // Last slot. Don't send yet: buffer it so the hint is only added if a
      // follow-up actually arrives (deliver above) — otherwise finalize() sends
      // it hintless. This is what stops a genuinely-final message from being
      // mislabeled "more to come".
      this.pendingLast.set(chatId, message);
      return;
    }
    await this.options.send(chatId, message);
  }

  /**
   * Flush any message buffered on the final slot, sent WITHOUT a hint because the
   * turn ended with no follow-up. Called when a logical batch (a generation or a
   * command) finishes producing output.
   */
  async finalize(chatId: string): Promise<void> {
    const buffered = this.pendingLast.get(chatId);
    if (!buffered) return;
    this.pendingLast.delete(chatId);
    await this.options.send(chatId, buffered);
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
        await this.options.send(chatId, appendHintIfText(next));
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

const MEDIA_KINDS = new Set(['image', 'video', 'audio', 'file']);

/** Append continuation hint only to text-based messages; media messages pass through unchanged. */
function appendHintIfText(item: OutboundQueueItem): OutboundQueueItem {
  if (MEDIA_KINDS.has(item.kind)) return item;
  return { ...item, text: item.text + CONTINUATION_HINT };
}
