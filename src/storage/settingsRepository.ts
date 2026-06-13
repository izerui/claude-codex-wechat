import type { BridgeDatabase } from './db';

export class SettingsRepository {
  constructor(private readonly db: BridgeDatabase) {}

  get(key: string): unknown | null {
    const row = this.db.prepare(`
      SELECT value_json FROM settings WHERE key = ?
    `).get(key) as { value_json?: unknown } | undefined;
    if (typeof row?.value_json !== 'string') return null;
    return JSON.parse(row.value_json);
  }

  set(key: string, value: unknown, updatedAt = Date.now()): void {
    this.db.prepare(`
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), updatedAt);
  }
}
