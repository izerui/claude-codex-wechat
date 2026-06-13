import { nanoid } from 'nanoid';
import type { BridgeDatabase } from './db';

export type MessageLogDirection = 'inbound' | 'outbound' | 'provider_event';

export type MessageLogRecord = {
  id: string;
  bridgeSessionId: string;
  direction: MessageLogDirection;
  platformMessageId?: string;
  providerEventType?: string;
  text?: string;
  createdAt: number;
};

export class MessageLogRepository {
  constructor(private readonly db: BridgeDatabase) {}

  append(input: Omit<MessageLogRecord, 'id'>): MessageLogRecord {
    const record: MessageLogRecord = { id: `msg_${nanoid(10)}`, ...input };
    this.db.prepare(`
      INSERT INTO message_log (
        id, bridge_session_id, direction, platform_message_id, provider_event_type, text, created_at
      ) VALUES (
        @id, @bridgeSessionId, @direction, @platformMessageId, @providerEventType, @text, @createdAt
      )
    `).run({
      ...record,
      platformMessageId: record.platformMessageId ?? null,
      providerEventType: record.providerEventType ?? null,
      text: record.text ?? null,
    });
    return record;
  }

  listForSession(bridgeSessionId: string): MessageLogRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM message_log
      WHERE bridge_session_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(bridgeSessionId) as Record<string, unknown>[];
    return rows.map(mapMessageLogRow);
  }
}

function mapMessageLogRow(row: Record<string, unknown>): MessageLogRecord {
  return {
    id: String(row.id),
    bridgeSessionId: String(row.bridge_session_id),
    direction: mapDirection(row.direction),
    platformMessageId: row.platform_message_id ? String(row.platform_message_id) : undefined,
    providerEventType: row.provider_event_type ? String(row.provider_event_type) : undefined,
    text: row.text ? String(row.text) : undefined,
    createdAt: Number(row.created_at),
  };
}

function mapDirection(value: unknown): MessageLogDirection {
  if (value === 'outbound' || value === 'provider_event') return value;
  return 'inbound';
}
