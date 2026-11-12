/**
 * Optional gate the MessageRouter routes all outbound chat messages through.
 * A channel that has send-quota limits (WeChat iLink) provides an implementation
 * that queues messages when quota is exhausted and replays them after refresh.
 * Channels without limits omit the gate, and the router sends directly.
 */
export interface OutboundDeliveryGate {
  /** Whether this chat has queued messages waiting for the user to refresh. */
  hasPending(chatId: string): boolean;
  /** false = queued; invoke onDelivered only when every chunk reached the channel. */
  deliver(chatId: string, message: { kind: string; text: string; filePath?: string; fileName?: string }, onDelivered?: () => void, isCurrent?: () => boolean): Promise<boolean | void>;
  /** Replay queued messages after a token refresh (until quota runs out again). */
  drain(chatId: string): Promise<void>;
  /**
   * 丢弃该会话所有待发消息。会话被替换（如 /new）时调用：旧会话排队未发的回复
   * 若继续留着，会在用户下次发消息时串进新会话，造成困惑。
   */
  discardPending?(chatId: string): Promise<void>;
}
