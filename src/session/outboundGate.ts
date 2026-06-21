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
  deliver(chatId: string, message: { kind: string; text: string }): Promise<void>;
  /** Replay queued messages after a token refresh (until quota runs out again). */
  drain(chatId: string): Promise<void>;
}
