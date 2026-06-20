import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** iLink 平台硬限制:每个最新 token 开启的 24h 窗口内,bot 最多主动发 10 条。 */
export const PUSH_QUOTA_LIMIT = 10;
export const PUSH_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WeixinPersistedState = {
  contextTokens: Record<string, string>;
  cursor: string;
};

export type WeixinQuota = {
  /** 当前 token 窗口内还能主动发几条（过期则 0）。 */
  remaining: number;
  sentCount: number;
  windowStartAt: number;
  /** 24h 窗口是否已过期（过期则 token 失效，需用户发新消息）。 */
  expired: boolean;
};

/** A logical outbound message held in the per-chat queue while waiting for quota. */
export type OutboundQueueItem = {
  kind: string;
  text: string;
};

/**
 * Persists the WeChat channel's recovery + quota state so the bridge survives restarts.
 *
 * Per user we track the latest `context_token` plus its **24h window start** and
 * **proactive send count** — both bound to that token. When the user sends a new
 * message (token refresh), the window and quota reset. This mirrors the iLink
 * platform's hard limit: ≤10 proactive messages per token within 24h.
 */
export interface WeixinStateStore {
  load(): WeixinPersistedState;
  /** Record the user's latest token AND reset its 24h window + send quota. */
  setContextToken(userId: string, token: string): void;
  setCursor(cursor: string): void;
  /** Whether a proactive send is currently allowed (has token, window live, quota left). */
  canSend(userId: string): boolean;
  /** Count one sent message against the current token's quota. */
  recordSent(userId: string): void;
  getQuota(userId: string): WeixinQuota;
  /** Append a logical message to the chat's pending outbound queue. */
  enqueueOutbound(chatId: string, item: OutboundQueueItem): void;
  /** Read (without removing) the chat's pending queue. */
  peekOutbound(chatId: string): OutboundQueueItem[];
  /** Remove the first item from the chat's pending queue. */
  shiftOutbound(chatId: string): void;
  hasPendingOutbound(chatId: string): boolean;
  clearOutbound(chatId: string): void;
  /** Drop everything (e.g. on session expiry / re-login). */
  clear(): void;
}

type UserState = {
  contextToken: string;
  windowStartAt: number;
  sentCount: number;
};

type WeixinChannelState = {
  cursor?: string;
  users?: Record<string, UserState>;
  outbox?: Record<string, OutboundQueueItem[]>;
};

type RuntimeStateFile = {
  bridge?: {
    weixinChannel?: WeixinChannelState;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Stores channel recovery + quota state inside the shared runtime config file under
 * `bridge.weixinChannel`, alongside the other runtime stores — single source of truth.
 */
export class FileWeixinStateStore implements WeixinStateStore {
  constructor(private readonly configPath: string) {}

  load(): WeixinPersistedState {
    const channel = this.readChannel();
    const contextTokens: Record<string, string> = {};
    for (const [userId, user] of Object.entries(channel.users ?? {})) {
      if (user?.contextToken) contextTokens[userId] = user.contextToken;
    }
    return { contextTokens, cursor: channel.cursor ?? '' };
  }

  setContextToken(userId: string, token: string): void {
    if (!userId || !token) return;
    const state = this.readState();
    const channel = state.bridge?.weixinChannel ?? {};
    const users = { ...(channel.users ?? {}) };
    // New token = user just messaged → reset this user's 24h window + quota,
    // bound to the latest token.
    users[userId] = { contextToken: token, windowStartAt: Date.now(), sentCount: 0 };
    this.writeChannel(state, { ...channel, users });
  }

  setCursor(cursor: string): void {
    const state = this.readState();
    const channel = state.bridge?.weixinChannel ?? {};
    if ((channel.cursor ?? '') === cursor) return;
    this.writeChannel(state, { ...channel, cursor });
  }

  canSend(userId: string): boolean {
    const user = this.readChannel().users?.[userId];
    if (!user?.contextToken) return false;
    if (Date.now() - user.windowStartAt >= PUSH_WINDOW_MS) return false;
    return user.sentCount < PUSH_QUOTA_LIMIT;
  }

  recordSent(userId: string): void {
    const state = this.readState();
    const channel = state.bridge?.weixinChannel ?? {};
    const user = channel.users?.[userId];
    if (!user) return;
    const users = { ...channel.users, [userId]: { ...user, sentCount: user.sentCount + 1 } };
    this.writeChannel(state, { ...channel, users });
  }

  getQuota(userId: string): WeixinQuota {
    const user = this.readChannel().users?.[userId];
    if (!user?.contextToken) return { remaining: 0, sentCount: 0, windowStartAt: 0, expired: true };
    const expired = Date.now() - user.windowStartAt >= PUSH_WINDOW_MS;
    const remaining = expired ? 0 : Math.max(0, PUSH_QUOTA_LIMIT - user.sentCount);
    return { remaining, sentCount: user.sentCount, windowStartAt: user.windowStartAt, expired };
  }

  enqueueOutbound(chatId: string, item: OutboundQueueItem): void {
    if (!chatId) return;
    const state = this.readState();
    const channel = state.bridge?.weixinChannel ?? {};
    const outbox = { ...(channel.outbox ?? {}) };
    outbox[chatId] = [...(outbox[chatId] ?? []), item];
    this.writeChannel(state, { ...channel, outbox });
  }

  peekOutbound(chatId: string): OutboundQueueItem[] {
    return this.readChannel().outbox?.[chatId] ?? [];
  }

  shiftOutbound(chatId: string): void {
    const state = this.readState();
    const channel = state.bridge?.weixinChannel ?? {};
    const list = channel.outbox?.[chatId];
    if (!list?.length) return;
    const outbox = { ...channel.outbox };
    const rest = list.slice(1);
    if (rest.length) outbox[chatId] = rest;
    else delete outbox[chatId];
    this.writeChannel(state, { ...channel, outbox });
  }

  hasPendingOutbound(chatId: string): boolean {
    return (this.readChannel().outbox?.[chatId]?.length ?? 0) > 0;
  }

  clearOutbound(chatId: string): void {
    const state = this.readState();
    const channel = state.bridge?.weixinChannel ?? {};
    if (!channel.outbox?.[chatId]) return;
    const outbox = { ...channel.outbox };
    delete outbox[chatId];
    this.writeChannel(state, { ...channel, outbox });
  }

  clear(): void {
    const state = this.readState();
    if (!state.bridge?.weixinChannel) return;
    this.writeChannel(state, { cursor: '', users: {}, outbox: {} });
  }

  private readChannel(): WeixinChannelState {
    return this.readState().bridge?.weixinChannel ?? {};
  }

  private readState(): RuntimeStateFile {
    if (!existsSync(this.configPath)) return {};
    try {
      const raw = JSON.parse(readFileSync(this.configPath, 'utf8')) as RuntimeStateFile;
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  private writeChannel(state: RuntimeStateFile, channel: WeixinChannelState): void {
    const next: RuntimeStateFile = {
      ...state,
      bridge: { ...(state.bridge ?? {}), weixinChannel: channel },
    };
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}
