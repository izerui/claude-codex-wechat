import { nanoid } from 'nanoid';
import type { BridgeDatabase } from './db';

export type PairingRecord = {
  code: string;
  platformUserId: string;
  chatId: string;
  displayName?: string;
  requestedAt: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
};

function mapPairingRow(row: Record<string, unknown>): PairingRecord {
  return {
    code: String(row.code),
    platformUserId: String(row.platform_user_id),
    chatId: String(row.chat_id),
    displayName: row.display_name ? String(row.display_name) : undefined,
    requestedAt: Number(row.requested_at),
    expiresAt: Number(row.expires_at),
    status: row.status === 'approved' || row.status === 'rejected' || row.status === 'expired' ? row.status : 'pending',
  };
}

export class PairingRepository {
  constructor(private readonly db: BridgeDatabase) {}

  createPending(input: { platformUserId: string; chatId: string; displayName?: string; ttlMs: number }): PairingRecord {
    const requestedAt = Date.now();
    const record: PairingRecord = {
      code: `pair_${nanoid(8)}`,
      platformUserId: input.platformUserId,
      chatId: input.chatId,
      displayName: input.displayName,
      requestedAt,
      expiresAt: requestedAt + input.ttlMs,
      status: 'pending',
    };
    this.db.prepare(`
      INSERT INTO pairing_requests (code, platform_user_id, chat_id, display_name, requested_at, expires_at, status)
      VALUES (@code, @platformUserId, @chatId, @displayName, @requestedAt, @expiresAt, @status)
    `).run({ ...record, displayName: record.displayName ?? null });
    return record;
  }

  listPending(): PairingRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM pairing_requests WHERE status = 'pending' AND expires_at > ? ORDER BY requested_at DESC
    `).all(Date.now()) as Record<string, unknown>[];
    return rows.map(mapPairingRow);
  }

  approve(code: string): { ok: true } | { ok: false; error: string } {
    return this.updateStatus(code, 'approved');
  }

  reject(code: string): { ok: true } | { ok: false; error: string } {
    return this.updateStatus(code, 'rejected');
  }

  private updateStatus(code: string, status: 'approved' | 'rejected'): { ok: true } | { ok: false; error: string } {
    const result = this.db.prepare(`
      UPDATE pairing_requests SET status = ? WHERE code = ? AND status = 'pending'
    `).run(status, code);
    return result.changes > 0 ? { ok: true } : { ok: false, error: 'pairing_not_pending' };
  }
}
