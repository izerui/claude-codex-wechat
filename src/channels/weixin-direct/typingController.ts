/**
 * Per-chat best-effort typing sender for the WeChat iLink channel.
 *
 * The iLink typing indicator auto-expires after roughly 60 seconds. To keep it
 * visible across a long generation the caller re-asserts `status=1` on an
 * interval (see MessageRouter's typing keepalive), and sends one `status=2` when
 * work ends.
 *
 * The typing_ticket is a long-lived per-user credential (treated as valid for up
 * to ~24h, independent of the message's context_token), so it is cached with a
 * randomized TTL and refreshed lazily. getConfig failures back off exponentially
 * (2s → 1h) and never discard an already-cached ticket; send failures are logged
 * but not retried. TTL expiration is the safety net against a stuck indicator.
 */
export type TypingControllerDeps = {
  getConfig: (input: { ilinkUserId: string; contextToken?: string }) => Promise<{ typingTicket: string }>;
  sendTyping: (input: { ilinkUserId: string; typingTicket: string; status: 1 | 2 }) => Promise<void>;
  getContextToken: (chatId: string) => string | undefined;
  log?: (msg: string) => void;
};

const CONFIG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CONFIG_CACHE_INITIAL_RETRY_MS = 2_000;
const CONFIG_CACHE_MAX_RETRY_MS = 60 * 60 * 1000;

type TicketEntry = {
  ticket: string;
  nextFetchAt: number;
  retryDelayMs: number;
};

export class TypingController {
  private readonly tickets = new Map<string, TicketEntry>();
  private readonly chain = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(private readonly deps: TypingControllerDeps) {}

  set(chatId: string, active: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
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

  dispose(): void {
    this.disposed = true;
    this.chain.clear();
  }

  private async attempt(chatId: string, active: boolean): Promise<void> {
    if (this.disposed) return;
    const ticket = await this.getTicket(chatId);
    if (!ticket || this.disposed) return;
    try {
      await this.deps.sendTyping({ ilinkUserId: chatId, typingTicket: ticket, status: active ? 1 : 2 });
    } catch (err) {
      // Best-effort: a failed send does not invalidate the ticket. Log the real
      // error (e.g. iLink ret/errmsg) so a genuine ticket/token rejection is
      // observable instead of silently swallowed.
      this.deps.log?.(`typing send failed (status=${active ? 1 : 2}): ${String(err)}`);
    }
  }

  private async getTicket(chatId: string): Promise<string> {
    const now = Date.now();
    const entry = this.tickets.get(chatId);
    if (entry && now < entry.nextFetchAt) return entry.ticket;

    try {
      const config = await this.deps.getConfig({
        ilinkUserId: chatId,
        contextToken: this.deps.getContextToken(chatId),
      });
      const ticket = config.typingTicket.trim();
      this.tickets.set(chatId, {
        ticket,
        nextFetchAt: now + Math.random() * CONFIG_CACHE_TTL_MS,
        retryDelayMs: CONFIG_CACHE_INITIAL_RETRY_MS,
      });
      return ticket;
    } catch (err) {
      this.deps.log?.(`getConfig failed for ${chatId}: ${String(err)}`);
      if (entry) {
        // Keep the previously cached ticket; only delay the next refresh.
        entry.retryDelayMs = Math.min(entry.retryDelayMs * 2, CONFIG_CACHE_MAX_RETRY_MS);
        entry.nextFetchAt = now + entry.retryDelayMs;
        return entry.ticket;
      }
      this.tickets.set(chatId, {
        ticket: '',
        nextFetchAt: now + CONFIG_CACHE_INITIAL_RETRY_MS,
        retryDelayMs: CONFIG_CACHE_INITIAL_RETRY_MS,
      });
      return '';
    }
  }
}
