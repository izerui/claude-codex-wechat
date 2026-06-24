import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderId } from '../providers/types';
import { CurrentConversationStore, type CurrentConversationBinding } from './currentConversationStore';

export type BridgeSessionRecord = CurrentConversationBinding;

export class SessionManager {
  readonly store: CurrentConversationStore;
  private readonly defaults: { defaultCwd: string; defaultProviderId: ProviderId };

  constructor(defaults: { defaultCwd: string; defaultProviderId: ProviderId; configPath?: string }) {
    this.defaults = defaults;
    this.store = new CurrentConversationStore(
      defaults.configPath ?? join(mkdtempSync(join(tmpdir(), 'claude-codex-wechat-session-manager-')), 'config.json'),
      defaults,
    );
  }

  getActiveSession(chatId: string): BridgeSessionRecord | null {
    const current = this.store.getCurrent();
    return current?.chatId === chatId ? current : null;
  }

  getOrCreateSession(input: { chatId: string; ownerUserId: string; providerId?: ProviderId; cwd?: string }): BridgeSessionRecord {
    const existing = this.getActiveSession(input.chatId);
    if (existing) return existing;
    return this.createSession({
      chatId: input.chatId,
      ownerUserId: input.ownerUserId,
      providerId: input.providerId ?? this.defaults.defaultProviderId,
      cwd: input.cwd ?? this.defaults.defaultCwd,
    });
  }

  createSession(input: {
    chatId: string;
    ownerUserId: string;
    providerId: ProviderId;
    cwd: string;
    recoverySource?: BridgeSessionRecord['recoverySource'];
    resumeTitle?: string;
  }): BridgeSessionRecord {
    return this.store.create(input);
  }

  hydrateSession(record: BridgeSessionRecord): BridgeSessionRecord {
    return this.store.setCurrent(record);
  }

  updateSession(_id: string, patch: Partial<Pick<BridgeSessionRecord, 'providerSessionId' | 'resumeTitle' | 'status' | 'lastActivityAt'>>): BridgeSessionRecord {
    const updated = this.store.update(patch);
    if (!updated) throw new Error('Unknown bridge session');
    return updated;
  }

  updateActiveSession(_chatId: string, patch: Partial<Pick<BridgeSessionRecord, 'cwd' | 'providerId' | 'providerSessionId' | 'resumeTitle' | 'status' | 'lastActivityAt'>>): BridgeSessionRecord | null {
    return this.store.update(patch);
  }

  removeSession(_id: string): BridgeSessionRecord {
    const current = this.store.getCurrent();
    if (!current) throw new Error('Unknown bridge session');
    this.store.clear();
    return current;
  }

  listSessions(): BridgeSessionRecord[] {
    const current = this.store.getCurrent();
    return current ? [current] : [];
  }
}
