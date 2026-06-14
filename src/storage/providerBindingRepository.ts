import type { ProviderId } from '../providers/types';
import type { BridgeDatabase } from './db';

export type ProviderBindingRecord = {
  platform: string;
  platformUserId: string;
  chatId: string;
  providerId: ProviderId;
  providerSessionId: string;
  cwd: string;
  updatedAt: number;
};

export class ProviderBindingRepository {
  constructor(private readonly db: BridgeDatabase) {}

  upsert(input: Omit<ProviderBindingRecord, 'updatedAt'>, updatedAt = Date.now()): ProviderBindingRecord {
    const record: ProviderBindingRecord = { ...input, updatedAt };
    this.db.prepare(`
      INSERT INTO provider_session_bindings (
        platform, platform_user_id, chat_id, provider_id, provider_session_id, cwd, updated_at
      ) VALUES (
        @platform, @platformUserId, @chatId, @providerId, @providerSessionId, @cwd, @updatedAt
      )
      ON CONFLICT(platform, chat_id, provider_id) DO UPDATE SET
        platform_user_id = excluded.platform_user_id,
        provider_session_id = excluded.provider_session_id,
        cwd = excluded.cwd,
        updated_at = excluded.updated_at
    `).run(record);
    return record;
  }

  findByChat(platform: string, chatId: string, providerId: ProviderId): ProviderBindingRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM provider_session_bindings
      WHERE platform = ? AND chat_id = ? AND provider_id = ?
      LIMIT 1
    `).get(platform, chatId, providerId) as Record<string, unknown> | undefined;
    return row ? mapProviderBindingRow(row) : null;
  }

  list(): ProviderBindingRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM provider_session_bindings ORDER BY updated_at DESC
    `).all() as Record<string, unknown>[];
    return rows.map(mapProviderBindingRow);
  }
}

function mapProviderBindingRow(row: Record<string, unknown>): ProviderBindingRecord {
  return {
    platform: String(row.platform),
    platformUserId: String(row.platform_user_id),
    chatId: String(row.chat_id),
    providerId: row.provider_id === 'codex' ? 'codex' : 'claude-code',
    providerSessionId: String(row.provider_session_id),
    cwd: String(row.cwd),
    updatedAt: Number(row.updated_at),
  };
}
