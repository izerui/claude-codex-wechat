import { randomUUID } from 'node:crypto';
import type { OutboundDeliveryGate } from '../../session/outboundGate';
import type { OutboundQueueItem, WeixinStateStore } from './weixinStateStore';
import { chunkText, MAX_TEXT_LENGTH } from './textChunks';

export const CONTINUATION_HINT = '\n\n（还有消息未发完，发送消息后将继续接收；你的新消息也会正常处理）';

/** Quota limits outbound delivery only. Incoming messages always remain input. */
export class WeixinOutboundGate implements OutboundDeliveryGate {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly receipts = new Map<string, () => void>();
  private readonly conditions = new Map<string, () => boolean>();
  /** 每条消息被微信服务端拒收的次数（按 deliveryId）。 */
  private readonly rejections = new Map<string, number>();

  constructor(private readonly options: {
    store: WeixinStateStore;
    send: (chatId: string, message: OutboundQueueItem) => Promise<void>;
  }) {}

  hasPending(chatId: string): boolean {
    return this.options.store.hasPendingOutbound(chatId);
  }

  async deliver(chatId: string, message: OutboundQueueItem, onDelivered?: () => void, isCurrent?: () => boolean): Promise<boolean> {
    const deliveryId = randomUUID();
    let delivered = false;
    // Persist before attempting delivery: a result stays available after a failed send.
    const chunks = ['text', 'markdown', 'status'].includes(message.kind) ? chunkText(message.text) : [message.text];
    chunks.forEach((text, index) => {
      const id = index === chunks.length - 1 ? deliveryId : randomUUID();
      this.options.store.enqueueOutbound(chatId, {
        ...message, text, deliveryId: id, enqueuedAt: Date.now(), ...(isCurrent ? { ephemeral: true } : {}),
      });
      if (isCurrent) this.conditions.set(id, isCurrent);
    });
    this.receipts.set(deliveryId, () => { delivered = true; onDelivered?.(); });
    await this.drain(chatId).catch((error) => {
      console.error('[weixin] outbound delivery deferred:', error);
    });
    return delivered;
  }

  async discardPending(chatId: string): Promise<void> {
    await this.exclusive(chatId, async () => {
      for (const item of this.options.store.peekOutbound(chatId)) {
        if (item.deliveryId) {
          this.receipts.delete(item.deliveryId);
          this.conditions.delete(item.deliveryId);
        }
      }
      this.options.store.clearOutbound(chatId);
    });
  }

  drain(chatId: string): Promise<void> {
    return this.exclusive(chatId, async () => {
      const { store } = this.options;
      while (store.hasPendingOutbound(chatId)) {
        const pending = store.peekOutbound(chatId);
        const next = pending[0]!;
        if (next.ephemeral && (!next.deliveryId || !this.conditions.get(next.deliveryId)?.())) {
          store.shiftOutbound(chatId);
          if (next.deliveryId) {
            this.receipts.delete(next.deliveryId);
            this.conditions.delete(next.deliveryId);
          }
          continue;
        }
        const quota = store.getQuota(chatId);
        if (quota.expired || quota.remaining <= 0) return;
        const textKind = ['text', 'markdown', 'status'].includes(next.kind);
        const outgoing = quota.remaining === 1 && pending.length > 1 && textKind && next.text.length + CONTINUATION_HINT.length <= MAX_TEXT_LENGTH
          ? { ...next, text: next.text + CONTINUATION_HINT }
          : next;
        try {
          await this.options.send(chatId, outgoing);
        } catch (error) {
          // 网络断了、额度不足、服务端临时故障：留在队首，恢复后接着发。
          // 只有服务端明确拒收这一条、且屡次如此时才跳过——否则它会永远堵住后面所有回复
          if (!isRejection(error) || !next.deliveryId) throw error;
          const count = (this.rejections.get(next.deliveryId) ?? 0) + 1;
          this.rejections.set(next.deliveryId, count);
          if (count < MAX_REJECTIONS) throw error;
          console.error('[weixin] outbound message rejected repeatedly, skipped:', error);
          store.shiftOutbound(chatId);
          this.rejections.delete(next.deliveryId);
          this.receipts.delete(next.deliveryId);
          this.conditions.delete(next.deliveryId);
          // 尽量告诉用户少了一条；这条提示本身发不出去也不再重试
          const preview = next.text.replace(/\s+/g, ' ').slice(0, 30);
          await this.options.send(chatId, {
            kind: 'status',
            text: `有一条消息被微信拒收，重试 ${MAX_REJECTIONS} 次后已跳过${preview ? `：「${preview}…」` : '。'}`,
          }).catch(() => undefined);
          continue;
        }
        if (next.deliveryId) this.rejections.delete(next.deliveryId);
        store.shiftOutbound(chatId);
        if (next.deliveryId) {
          const receipt = this.receipts.get(next.deliveryId);
          this.receipts.delete(next.deliveryId);
          this.conditions.delete(next.deliveryId);
          receipt?.();
        }
      }
    });
  }

  private exclusive<T>(chatId: string, run: () => Promise<T>): Promise<T> {
    const result = (this.chains.get(chatId) ?? Promise.resolve()).catch(() => undefined).then(run);
    this.chains.set(chatId, result);
    void result.finally(() => {
      if (this.chains.get(chatId) === result) this.chains.delete(chatId);
    }).catch(() => undefined);
    return result;
  }
}

const MAX_REJECTIONS = 3;

/**
 * 微信服务端明确拒收了这条（HTTP 4xx 或业务错误码），重试同一条也不会成功。
 * 网络错误、HTTP 5xx、token 过期（-14）、本地额度不足都不算：那些恢复后还能发出去。
 */
function isRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  const match = /^weixin_send_(?:message|media)_failed:(-?\d+)/.exec(message);
  if (!match) return false;
  const code = Number(match[1]);
  return !(code >= 500 && code < 600) && code !== -14;
}
