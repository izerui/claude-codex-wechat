import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type WeixinPersistedState = {
  contextTokens: Record<string, string>;
  cursor: string;
};

/**
 * Persists the WeChat channel's recovery state — per-user `context_token`s and the
 * `getupdates` cursor — so the bridge survives restarts. Without this, every restart
 * drops all context tokens (replies fail until the user messages again) and resets
 * the cursor (risking missed/duplicated messages).
 */
export interface WeixinStateStore {
  /** Read persisted state. */
  load(): WeixinPersistedState;
  setContextToken(userId: string, token: string): void;
  setCursor(cursor: string): void;
  /** Drop everything (e.g. on session expiry / re-login). */
  clear(): void;
}

type WeixinChannelState = {
  contextTokens?: Record<string, string>;
  cursor?: string;
};

type RuntimeStateFile = {
  bridge?: {
    weixinChannel?: WeixinChannelState;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Stores channel recovery state inside the shared runtime config file under
 * `bridge.weixinChannel`, alongside the other runtime stores (active user,
 * current conversation, credentials) — single source of truth, no separate file.
 */
export class FileWeixinStateStore implements WeixinStateStore {
  constructor(private readonly configPath: string) {}

  load(): WeixinPersistedState {
    const channel = this.readState().bridge?.weixinChannel;
    return {
      contextTokens: { ...(channel?.contextTokens ?? {}) },
      cursor: channel?.cursor ?? '',
    };
  }

  setContextToken(userId: string, token: string): void {
    if (!userId || !token) return;
    const state = this.readState();
    const channel = state.bridge?.weixinChannel ?? {};
    const contextTokens = { ...(channel.contextTokens ?? {}) };
    if (contextTokens[userId] === token) return;
    contextTokens[userId] = token;
    this.writeChannel(state, { ...channel, contextTokens });
  }

  setCursor(cursor: string): void {
    const state = this.readState();
    const channel = state.bridge?.weixinChannel ?? {};
    if ((channel.cursor ?? '') === cursor) return;
    this.writeChannel(state, { ...channel, cursor });
  }

  clear(): void {
    const state = this.readState();
    if (!state.bridge?.weixinChannel) return;
    this.writeChannel(state, { contextTokens: {}, cursor: '' });
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
