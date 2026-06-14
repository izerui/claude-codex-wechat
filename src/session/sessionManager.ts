import { nanoid } from 'nanoid';
import type { ProviderId, ProviderSessionStatus } from '../providers/types';

export type BridgeSessionRecord = {
  id: string;
  chatId: string;
  ownerUserId: string;
  providerId: ProviderId;
  providerSessionId?: string;
  recoverySource: 'runtime' | 'manual_attach' | 'binding_table' | 'sidecar' | 'heuristic';
  resumeTitle?: string;
  cwd: string;
  status: ProviderSessionStatus;
  createdAt: number;
  lastActivityAt: number;
  archivedAt?: number;
};

export class SessionManager {
  private readonly sessions = new Map<string, BridgeSessionRecord>();
  private readonly activeByChat = new Map<string, string>();

  constructor(private readonly defaults: { defaultCwd: string; defaultProviderId: ProviderId }) {}

  getActiveSession(chatId: string): BridgeSessionRecord | null {
    const id = this.activeByChat.get(chatId);
    return id ? this.sessions.get(id) ?? null : null;
  }

  getOrCreateSession(input: { chatId: string; ownerUserId: string; providerId?: ProviderId; cwd?: string }): BridgeSessionRecord {
    const existing = this.getActiveSession(input.chatId);
    if (existing && !existing.archivedAt) return existing;
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
    const now = Date.now();
    const record: BridgeSessionRecord = {
      id: `bs_${nanoid(10)}`,
      chatId: input.chatId,
      ownerUserId: input.ownerUserId,
      providerId: input.providerId,
      cwd: input.cwd,
      recoverySource: input.recoverySource ?? 'runtime',
      resumeTitle: input.resumeTitle,
      status: 'starting',
      createdAt: now,
      lastActivityAt: now,
    };
    this.sessions.set(record.id, record);
    this.activeByChat.set(record.chatId, record.id);
    return record;
  }

  hydrateSession(record: BridgeSessionRecord): BridgeSessionRecord {
    this.sessions.set(record.id, record);
    if (!record.archivedAt) {
      const current = this.getActiveSession(record.chatId);
      if (!current || current.lastActivityAt <= record.lastActivityAt) {
        this.activeByChat.set(record.chatId, record.id);
      }
    }
    return record;
  }

  updateSession(id: string, patch: Partial<Pick<BridgeSessionRecord, 'providerSessionId' | 'resumeTitle' | 'status' | 'lastActivityAt'>>): BridgeSessionRecord {
    const existing = this.sessions.get(id);
    if (!existing) throw new Error(`Unknown bridge session: ${id}`);
    const next = { ...existing, ...patch };
    this.sessions.set(id, next);
    return next;
  }

  updateActiveSession(chatId: string, patch: Partial<Pick<BridgeSessionRecord, 'cwd' | 'providerId' | 'providerSessionId' | 'resumeTitle' | 'status' | 'lastActivityAt'>>): BridgeSessionRecord | null {
    const existing = this.getActiveSession(chatId);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    this.sessions.set(existing.id, next);
    return next;
  }

  archiveSession(id: string, archivedAt = Date.now()): BridgeSessionRecord {
    const existing = this.sessions.get(id);
    if (!existing) throw new Error(`Unknown bridge session: ${id}`);
    const next: BridgeSessionRecord = {
      ...existing,
      status: 'closed',
      archivedAt,
      lastActivityAt: archivedAt,
    };
    this.sessions.set(id, next);
    if (this.activeByChat.get(existing.chatId) === id) {
      this.activeByChat.delete(existing.chatId);
    }
    return next;
  }

  listSessions(): BridgeSessionRecord[] {
    return [...this.sessions.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }
}
