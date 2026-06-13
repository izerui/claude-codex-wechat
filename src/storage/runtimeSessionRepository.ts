import { nanoid } from 'nanoid';
import type { ProviderId, ProviderSessionStatus } from '../providers/types';
import type { BridgeDatabase } from './db';

export type RuntimeSessionRecord = {
  id: string;
  chatId: string;
  ownerUserId: string;
  providerId: ProviderId;
  providerSessionId?: string;
  cwd: string;
  status: ProviderSessionStatus;
  createdAt: number;
  lastActivityAt: number;
  archivedAt?: number;
};

export class RuntimeSessionRepository {
  constructor(private readonly db: BridgeDatabase) {}

  create(input: {
    chatId: string;
    ownerUserId: string;
    providerId: ProviderId;
    cwd: string;
    status: ProviderSessionStatus;
  }): RuntimeSessionRecord {
    const now = Date.now();
    return this.createWithId({
      id: `bs_${nanoid(10)}`,
      chatId: input.chatId,
      ownerUserId: input.ownerUserId,
      providerId: input.providerId,
      cwd: input.cwd,
      status: input.status,
      createdAt: now,
      lastActivityAt: now,
    });
  }

  createWithId(record: RuntimeSessionRecord): RuntimeSessionRecord {
    this.db.prepare(`
      INSERT INTO bridge_sessions (
        id, chat_id, owner_user_id, provider_id, provider_session_id, cwd, status, created_at, last_activity_at, archived_at
      ) VALUES (
        @id, @chatId, @ownerUserId, @providerId, @providerSessionId, @cwd, @status, @createdAt, @lastActivityAt, @archivedAt
      )
    `).run({
      ...record,
      providerSessionId: record.providerSessionId ?? null,
      archivedAt: record.archivedAt ?? null,
    });
    return record;
  }

  update(
    id: string,
    patch: Partial<Pick<RuntimeSessionRecord, 'providerSessionId' | 'status' | 'lastActivityAt'>>,
  ): RuntimeSessionRecord {
    const existing = this.findById(id);
    if (!existing) throw new Error(`Unknown bridge session: ${id}`);
    const next = { ...existing, ...patch };
    this.db.prepare(`
      UPDATE bridge_sessions
      SET provider_session_id = @providerSessionId,
          status = @status,
          last_activity_at = @lastActivityAt
      WHERE id = @id
    `).run({
      id,
      providerSessionId: next.providerSessionId ?? null,
      status: next.status,
      lastActivityAt: next.lastActivityAt,
    });
    return next;
  }

  archive(id: string, archivedAt = Date.now()): void {
    this.db.prepare(`
      UPDATE bridge_sessions SET archived_at = ?, status = 'closed' WHERE id = ?
    `).run(archivedAt, id);
  }

  findById(id: string): RuntimeSessionRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM bridge_sessions WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? mapSessionRow(row) : null;
  }

  getActiveByChat(chatId: string): RuntimeSessionRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM bridge_sessions
      WHERE chat_id = ? AND archived_at IS NULL
      ORDER BY last_activity_at DESC
      LIMIT 1
    `).get(chatId) as Record<string, unknown> | undefined;
    return row ? mapSessionRow(row) : null;
  }

  list(): RuntimeSessionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM bridge_sessions ORDER BY last_activity_at DESC
    `).all() as Record<string, unknown>[];
    return rows.map(mapSessionRow);
  }

  archiveAllActive(archivedAt = Date.now()): void {
    this.db.prepare(`
      UPDATE bridge_sessions
      SET archived_at = ?, status = 'closed'
      WHERE archived_at IS NULL
    `).run(archivedAt);
  }
}

function mapSessionRow(row: Record<string, unknown>): RuntimeSessionRecord {
  return {
    id: String(row.id),
    chatId: String(row.chat_id),
    ownerUserId: String(row.owner_user_id),
    providerId: row.provider_id === 'codex' ? 'codex' : 'claude-code',
    providerSessionId: row.provider_session_id ? String(row.provider_session_id) : undefined,
    cwd: String(row.cwd),
    status: mapStatus(row.status),
    createdAt: Number(row.created_at),
    lastActivityAt: Number(row.last_activity_at),
    archivedAt: typeof row.archived_at === 'number' ? row.archived_at : undefined,
  };
}

function mapStatus(value: unknown): ProviderSessionStatus {
  if (
    value === 'starting' ||
    value === 'idle' ||
    value === 'running' ||
    value === 'waiting_permission' ||
    value === 'errored' ||
    value === 'closed'
  ) {
    return value;
  }
  return 'errored';
}
