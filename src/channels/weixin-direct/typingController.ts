/**
 * Per-chat best-effort typing sender for the WeChat iLink channel.
 *
 * The iLink typing indicator auto-expires after roughly 60 seconds, so the bridge
 * only sends one `status=1` when work starts and one `status=2` when work ends.
 * Failures are logged by callers but never retried here; TTL expiration is the
 * safety net that prevents a permanently stuck indicator.
 */
export type TypingControllerDeps = {
  getConfig: (input: { ilinkUserId: string; contextToken?: string }) => Promise<{ typingTicket: string }>;
  sendTyping: (input: { ilinkUserId: string; typingTicket: string; status: 1 | 2 }) => Promise<void>;
  getContextToken: (chatId: string) => string | undefined;
};

export class TypingController {
  private readonly tickets = new Map<string, { ticket: string; contextToken?: string }>();
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
    try {
      const ticket = await this.getTicket(chatId);
      if (!ticket || this.disposed) return;
      await this.deps.sendTyping({ ilinkUserId: chatId, typingTicket: ticket, status: active ? 1 : 2 });
    } catch {
      this.tickets.delete(chatId);
    }
  }

  private async getTicket(chatId: string): Promise<string> {
    const contextToken = this.deps.getContextToken(chatId);
    const cached = this.tickets.get(chatId);
    // A ticket is bound to the context_token it was fetched with; once the user
    // sends a new message that token expires, so a cached ticket from an older
    // token is refetched instead of reused (otherwise every turn after the first
    // sends `status=1` with a stale ticket and shows no indicator).
    if (cached && cached.contextToken === contextToken) return cached.ticket;
    const config = await this.deps.getConfig({ ilinkUserId: chatId, contextToken });
    const ticket = config.typingTicket.trim();
    if (ticket) this.tickets.set(chatId, { ticket, contextToken });
    return ticket;
  }
}
