import { nanoid } from 'nanoid';
import type { BridgeDatabase } from './db';

export type BridgeEventStorageDirection = 'inbound' | 'outbound' | 'provider_event';
export type BridgeEventDirection = 'provider_event';

export type BridgeEventWriteRecord = {
  id: string;
  bridgeSessionId: string;
  direction: BridgeEventStorageDirection;
  platformMessageId?: string;
  providerEventType?: string;
  text?: string;
  createdAt: number;
};

export type BridgeEventRecord = Omit<BridgeEventWriteRecord, 'direction'> & {
  direction: BridgeEventDirection;
};

export class BridgeEventRepository {
  constructor(private readonly db: BridgeDatabase) {}

  append(input: Omit<BridgeEventWriteRecord, 'id'>): BridgeEventWriteRecord {
    const record: BridgeEventWriteRecord = { id: `msg_${nanoid(10)}`, ...input };
    this.db.prepare(`
      INSERT INTO bridge_events (
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

  listForSession(bridgeSessionId: string): BridgeEventRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM bridge_events
      WHERE bridge_session_id = ?
        AND direction = 'provider_event'
      ORDER BY created_at ASC, rowid ASC
    `).all(bridgeSessionId) as Record<string, unknown>[];
    return rows.map(mapBridgeEventRow);
  }

  listEventsForSession(bridgeSessionId: string): BridgeEventRecord[] {
    return this.listForSession(bridgeSessionId);
  }
}

function mapBridgeEventRow(row: Record<string, unknown>): BridgeEventRecord {
  return {
    id: String(row.id),
    bridgeSessionId: String(row.bridge_session_id),
    direction: 'provider_event',
    platformMessageId: row.platform_message_id ? String(row.platform_message_id) : undefined,
    providerEventType: row.provider_event_type ? String(row.provider_event_type) : undefined,
    text: row.text ? String(row.text) : undefined,
    createdAt: Number(row.created_at),
  };
}

export function ensureBridgeEventStorage(db: BridgeDatabase): void {
  ensureBridgeEventsTable(db);
}

function ensureBridgeEventsTable(db: BridgeDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bridge_events (
      id TEXT PRIMARY KEY,
      bridge_session_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      platform_message_id TEXT,
      provider_event_type TEXT,
      text TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}
