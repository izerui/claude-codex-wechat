/**
 * Per-chat "typing indicator" state machine for the WeChat iLink channel.
 *
 * iLink typing is **sticky**: it never auto-expires, so the indicator only clears
 * when a `status=2` (stop) actually lands. A swallowed stop leaves the chat stuck
 * showing "对方正在输入..." forever. This controller therefore treats the stop as a
 * durable goal: it retries with backoff until the stop is confirmed, survives ticket
 * staleness by re-fetching, and persists the active set so a crash-leftover indicator
 * can be cleared on the next start.
 *
 * Writes per chat are serialized so a slow `start` can never land after a later `stop`.
 * Starts/keepalives stay best-effort (the next keepalive re-asserts them).
 */
export type TypingControllerDeps = {
  getConfig: (input: { ilinkUserId: string; contextToken?: string }) => Promise<{ typingTicket: string }>;
  sendTyping: (input: { ilinkUserId: string; typingTicket: string; status: 1 | 2 }) => Promise<void>;
  getContextToken: (chatId: string) => string | undefined;
  /** Persist whether a chat has an outstanding indicator (for crash-leftover cleanup). */
  persistTypingActive?: (chatId: string, active: boolean) => void;
  /** Backoff schedule (ms) for retrying a failed stop; the last value repeats. */
  stopBackoffMs?: number[];
};

const DEFAULT_STOP_BACKOFF_MS = [2_000, 30_000];

export class TypingController {
  private readonly stopBackoffMs: number[];
  private readonly tickets = new Map<string, string>();
  private readonly chain = new Map<string, Promise<void>>();
  /** chatId → pending stop retry (timer + how many attempts so far, for backoff). */
  private readonly stopRetry = new Map<string, { timer: ReturnType<typeof setTimeout>; attempts: number }>();
  /** Mirrors the persisted active set so keepalive ticks don't re-write to disk. */
  private readonly persistedActive = new Set<string>();
  private disposed = false;

  constructor(private readonly deps: TypingControllerDeps) {
    this.stopBackoffMs = deps.stopBackoffMs?.length ? deps.stopBackoffMs : DEFAULT_STOP_BACKOFF_MS;
  }

  set(chatId: string, active: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    // A new start supersedes any in-flight durable stop for this chat.
    if (active) this.cancelStopRetry(chatId);
    const previous = this.chain.get(chatId) ?? Promise.resolve();
    const next = previous.then(
      () => this.attempt(chatId, active),
      () => this.attempt(chatId, active),
    );
    this.chain.set(chatId, next);
    next.finally(() => {
      if (this.chain.get(chatId) === next) this.chain.delete(chatId);
    });
    return next;
  }

  /** Re-try a chat's pending stop immediately (e.g. after a context_token refresh). */
  flush(chatId: string): void {
    if (this.disposed) return;
    if (!this.stopRetry.has(chatId)) return;
    this.clearStopTimer(chatId);
    void this.set(chatId, false);
  }

  /** On startup, drive each persisted-active chat back to "not typing". */
  reconcilePersisted(chatIds: string[]): void {
    for (const chatId of chatIds) {
      this.persistedActive.add(chatId);
      void this.set(chatId, false);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const chatId of [...this.stopRetry.keys()]) this.clearStopTimer(chatId);
    this.chain.clear();
  }

  private async attempt(chatId: string, active: boolean): Promise<void> {
    if (this.disposed) return;
    try {
      const ticket = await this.getTicket(chatId);
      if (!ticket) throw new Error('weixin_typing_empty_ticket');
      if (this.disposed) return;
      await this.deps.sendTyping({ ilinkUserId: chatId, typingTicket: ticket, status: active ? 1 : 2 });
      if (active) {
        this.markPersisted(chatId, true);
      } else {
        this.cancelStopRetry(chatId);
        this.markPersisted(chatId, false);
      }
    } catch (error) {
      // A stale/invalid ticket is the usual culprit — drop it so the next try re-fetches.
      this.tickets.delete(chatId);
      if (active) {
        // Start is best-effort; the next keepalive tick re-asserts it.
        return;
      }
      // The stop MUST eventually land or typing sticks forever — keep retrying.
      this.scheduleStopRetry(chatId);
    }
  }

  private scheduleStopRetry(chatId: string): void {
    if (this.disposed) return;
    const attempts = this.stopRetry.get(chatId)?.attempts ?? 0;
    const backoff = this.stopBackoffMs[Math.min(attempts, this.stopBackoffMs.length - 1)]!;
    const timer = setTimeout(() => {
      this.stopRetry.delete(chatId);
      void this.set(chatId, false);
    }, backoff);
    timer.unref?.();
    this.stopRetry.set(chatId, { timer, attempts: attempts + 1 });
  }

  private cancelStopRetry(chatId: string): void {
    this.clearStopTimer(chatId);
  }

  private clearStopTimer(chatId: string): void {
    const pending = this.stopRetry.get(chatId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.stopRetry.delete(chatId);
  }

  private markPersisted(chatId: string, active: boolean): void {
    if (active === this.persistedActive.has(chatId)) return;
    if (active) this.persistedActive.add(chatId);
    else this.persistedActive.delete(chatId);
    this.deps.persistTypingActive?.(chatId, active);
  }

  private async getTicket(chatId: string): Promise<string> {
    const cached = this.tickets.get(chatId);
    if (cached) return cached;
    const config = await this.deps.getConfig({
      ilinkUserId: chatId,
      contextToken: this.deps.getContextToken(chatId),
    });
    const ticket = config.typingTicket.trim();
    if (ticket) this.tickets.set(chatId, ticket);
    return ticket;
  }
}
