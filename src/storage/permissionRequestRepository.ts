import type { ProviderId } from '../providers/types';
import type { BridgeDatabase } from './db';

export type PermissionRequestRecord = {
  id: string;
  bridgeSessionId: string;
  providerId: ProviderId;
  toolName: string;
  summary: string;
  details?: unknown;
  status: 'pending' | 'decided';
  decision?: 'approve' | 'deny' | 'abort';
  requestedAt: number;
  decidedAt?: number;
  decidedBy?: string;
};

export class PermissionRequestRepository {
  constructor(private readonly db: BridgeDatabase) {}

  create(record: PermissionRequestRecord): void {
    this.db.prepare(`
      INSERT INTO permission_requests (
        id, bridge_session_id, provider_id, tool_name, summary, details_json, status, decision, requested_at, decided_at, decided_by
      ) VALUES (
        @id, @bridgeSessionId, @providerId, @toolName, @summary, @detailsJson, @status, @decision, @requestedAt, @decidedAt, @decidedBy
      )
    `).run({
      ...record,
      detailsJson: record.details === undefined ? null : JSON.stringify(record.details),
      decision: record.decision ?? null,
      decidedAt: record.decidedAt ?? null,
      decidedBy: record.decidedBy ?? null,
    });
  }

  findById(id: string): PermissionRequestRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM permission_requests WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? mapPermissionRow(row) : null;
  }

  listPending(): PermissionRequestRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM permission_requests WHERE status = 'pending' ORDER BY requested_at DESC
    `).all() as Record<string, unknown>[];
    return rows.map(mapPermissionRow);
  }

  decide(input: {
    id: string;
    decision: 'approve' | 'deny' | 'abort';
    decidedBy: string;
    decidedAt: number;
  }): { ok: true } | { ok: false; error: string } {
    const result = this.db.prepare(`
      UPDATE permission_requests
      SET status = 'decided', decision = @decision, decided_by = @decidedBy, decided_at = @decidedAt
      WHERE id = @id AND status = 'pending'
    `).run(input);
    return result.changes > 0 ? { ok: true } : { ok: false, error: 'permission_request_not_pending' };
  }
}

function mapPermissionRow(row: Record<string, unknown>): PermissionRequestRecord {
  return {
    id: String(row.id),
    bridgeSessionId: String(row.bridge_session_id),
    providerId: row.provider_id === 'codex' ? 'codex' : 'claude-code',
    toolName: String(row.tool_name),
    summary: String(row.summary),
    details: parseJsonValue(row.details_json),
    status: row.status === 'decided' ? 'decided' : 'pending',
    decision: mapDecision(row.decision),
    requestedAt: Number(row.requested_at),
    decidedAt: typeof row.decided_at === 'number' ? row.decided_at : undefined,
    decidedBy: row.decided_by ? String(row.decided_by) : undefined,
  };
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return undefined;
  return JSON.parse(value);
}

function mapDecision(value: unknown): PermissionRequestRecord['decision'] {
  if (value === 'approve' || value === 'deny' || value === 'abort') return value;
  return undefined;
}
