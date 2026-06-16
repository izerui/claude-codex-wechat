import type { CurrentConversationBinding } from '../session/currentConversationStore';
import type { BridgeDatabase } from './db';

export type RuntimeSessionRecord = CurrentConversationBinding;

function ensureTable(db: BridgeDatabase): void {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS bridge_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_session_id TEXT,
      recovery_source TEXT NOT NULL,
      resume_title TEXT,
      cwd TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL
    )
  `).run();
}

export class RuntimeSessionRepository {
  constructor(private readonly db: BridgeDatabase) {
    ensureTable(db);
  }

  create(input: {
    chatId: string;
    ownerUserId: string;
    providerId: RuntimeSessionRecord['providerId'];
    cwd: string;
    status: RuntimeSessionRecord['status'];
  }): RuntimeSessionRecord {
    const now = Date.now();
    return this.createWithId({
      id: `bs_compat_${now}`,
      chatId: input.chatId,
      ownerUserId: input.ownerUserId,
      providerId: input.providerId,
      cwd: input.cwd,
      recoverySource: 'runtime',
      status: input.status,
      createdAt: now,
      lastActivityAt: now,
    });
  }

  createWithId(record: RuntimeSessionRecord): RuntimeSessionRecord {
    this.db.prepare(`DELETE FROM bridge_sessions`).run();
    this.db.prepare(`
      INSERT INTO bridge_sessions (
        id, chat_id, owner_user_id, provider_id, provider_session_id, recovery_source, resume_title, cwd, status, created_at, last_activity_at
      ) VALUES (
        @id, @chatId, @ownerUserId, @providerId, @providerSessionId, @recoverySource, @resumeTitle, @cwd, @status, @createdAt, @lastActivityAt
      )
    `).run({
      ...record,
      providerSessionId: record.providerSessionId ?? null,
      resumeTitle: record.resumeTitle ?? null,
    });
    return record;
  }

  update(_id: string, patch: Partial<Pick<RuntimeSessionRecord, 'providerSessionId' | 'resumeTitle' | 'status' | 'lastActivityAt'>>): RuntimeSessionRecord {
    const existing = this.findById(_id);
    if (!existing) throw new Error(`Unknown bridge session: ${_id}`);
    const next = { ...existing, ...patch };
    this.db.prepare(`
      UPDATE bridge_sessions
      SET provider_session_id = @providerSessionId,
          resume_title = @resumeTitle,
          status = @status,
          last_activity_at = @lastActivityAt
      WHERE id = @id
    `).run({
      id: _id,
      providerSessionId: next.providerSessionId ?? null,
      resumeTitle: next.resumeTitle ?? null,
      status: next.status,
      lastActivityAt: next.lastActivityAt,
    });
    return next;
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM bridge_sessions WHERE id = ?`).run(id);
  }

  findById(id: string): RuntimeSessionRecord | null {
    const row = this.db.prepare(`SELECT * FROM bridge_sessions WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  getActiveByChat(chatId: string): RuntimeSessionRecord | null {
    const row = this.db.prepare(`SELECT * FROM bridge_sessions WHERE chat_id = ? LIMIT 1`).get(chatId) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  list(): RuntimeSessionRecord[] {
    const rows = this.db.prepare(`SELECT * FROM bridge_sessions ORDER BY last_activity_at DESC`).all() as Record<string, unknown>[];
    return rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): RuntimeSessionRecord {
  return {
    id: String(row.id),
    chatId: String(row.chat_id),
    ownerUserId: String(row.owner_user_id),
    providerId: row.provider_id === 'codex' ? 'codex' : 'claude-code',
    providerSessionId: row.provider_session_id ? String(row.provider_session_id) : undefined,
    recoverySource: row.recovery_source === 'manual_attach'
      ? 'manual_attach'
      : row.recovery_source === 'binding_table'
        ? 'binding_table'
        : row.recovery_source === 'sidecar'
          ? 'sidecar'
          : row.recovery_source === 'heuristic'
            ? 'heuristic'
            : 'runtime',
    resumeTitle: row.resume_title ? String(row.resume_title) : undefined,
    cwd: String(row.cwd),
    status: row.status === 'starting' || row.status === 'idle' || row.status === 'running' || row.status === 'waiting_permission' || row.status === 'errored' || row.status === 'closed'
      ? row.status
      : 'errored',
    createdAt: Number(row.created_at),
    lastActivityAt: Number(row.last_activity_at),
  };
}
