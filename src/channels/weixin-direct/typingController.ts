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
  private readonly tickets = new Map<string, string>();
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
