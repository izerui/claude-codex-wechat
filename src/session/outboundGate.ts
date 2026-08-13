/**
 * Optional gate the MessageRouter routes all outbound chat messages through.
 * A channel that has send-quota limits (WeChat iLink) provides an implementation
 * that queues messages when quota is exhausted and replays them after refresh.
 * Channels without limits omit the gate, and the router sends directly.
 */
export interface OutboundDeliveryGate {
  /** Whether this chat has queued messages waiting for the user to refresh. */
  hasPending(chatId: string): boolean;
  /**
   * Whether the next inbound user reply should be consumed by the gate even if
   * no queued messages remain, typically to absorb a reply to a previously sent
   * continuation hint and avoid misrouting it into the provider.
   */
  shouldInterceptReply?(chatId: string): boolean;
  /** Deliver one logical message: send now (maybe with a hint) or queue it. */
  deliver(chatId: string, message: { kind: string; text: string; filePath?: string; fileName?: string }): Promise<void>;
  /**
   * Signal that a logical batch (a generation or command) finished producing
   * output, so the gate can flush any message it buffered on the final quota
   * slot — sent without a continuation hint since nothing more followed.
   */
  finalize?(chatId: string): Promise<void>;
  /** Replay queued messages after a token refresh (until quota runs out again). */
  drain(chatId: string): Promise<void>;
  /**
   * 丢弃该会话所有待发消息。会话被替换（如 /new）时调用：旧会话排队未发的回复
   * 若继续留着，会在用户下次发消息时串进新会话，造成困惑。
   */
  discardPending?(chatId: string): Promise<void>;
  /**
   * 取出「配额耗尽导致回复被排队」的一次性提示，没有则返回 null。
   * 路由在一轮收尾时调用：否则配额归零后消息被静默入队，用户既收不到回复也不知原因。
   */
  takeQuotaExhaustedNotice?(chatId: string): string | null;
}
