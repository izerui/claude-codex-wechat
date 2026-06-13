import { nanoid } from 'nanoid';
import type { BridgeDatabase } from './db';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import type { ProviderId } from '../providers/types';

export type AuthorizedUserRecord = {
  id: string;
  platform: string;
  platformUserId: string;
  displayName?: string;
  role: 'admin' | 'user';
  defaultProvider: ProviderId;
  defaultCwd: string;
  createdAt: number;
  lastActiveAt?: number;
};

export class UserRepository {
  constructor(private readonly db: BridgeDatabase) {}

  createUser(input: Omit<AuthorizedUserRecord, 'id' | 'createdAt'>): AuthorizedUserRecord {
    const record: AuthorizedUserRecord = { ...input, id: `user_${nanoid(10)}`, createdAt: Date.now() };
    this.db.prepare(`
      INSERT INTO authorized_users (id, platform, platform_user_id, display_name, role, default_provider, default_cwd, created_at, last_active_at)
      VALUES (@id, @platform, @platformUserId, @displayName, @role, @defaultProvider, @defaultCwd, @createdAt, @lastActiveAt)
    `).run({ ...record, displayName: record.displayName ?? null, lastActiveAt: record.lastActiveAt ?? null });
    return record;
  }

  findByPlatformUser(platform: string, platformUserId: string): AuthorizedUserRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM authorized_users
      WHERE platform = ? AND platform_user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(platform, platformUserId) as Record<string, unknown> | undefined;
    return row ? mapAuthorizedUserRow(row) : null;
  }

  listUsers(): AuthorizedUserRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM authorized_users ORDER BY created_at DESC
    `).all() as Record<string, unknown>[];
    return rows.map(mapAuthorizedUserRow);
  }

  updateDefaultsForPlatform(platform: string, patch: { defaultProvider?: ProviderId; defaultCwd?: string }): void {
    const assignments: string[] = [];
    const values: Array<string> = [];
    if (patch.defaultProvider) {
      assignments.push('default_provider = ?');
      values.push(patch.defaultProvider);
    }
    if (patch.defaultCwd) {
      assignments.push('default_cwd = ?');
      values.push(patch.defaultCwd);
    }
    if (assignments.length === 0) return;
    this.db.prepare(`
      UPDATE authorized_users
      SET ${assignments.join(', ')}
      WHERE platform = ?
    `).run(...values, platform);
  }

  revokeUser(id: string): { ok: true } | { ok: false; error: string } {
    const result = this.db.prepare(`
      DELETE FROM authorized_users WHERE id = ?
    `).run(id);
    return result.changes > 0 ? { ok: true } : { ok: false, error: 'user_not_found' };
  }
}

function mapAuthorizedUserRow(row: Record<string, unknown>): AuthorizedUserRecord {
  return {
    id: String(row.id),
    platform: String(row.platform),
    platformUserId: String(row.platform_user_id),
    displayName: row.display_name ? String(row.display_name) : undefined,
    role: row.role === 'admin' ? 'admin' : 'user',
    defaultProvider: row.default_provider === 'codex' ? 'codex' : 'claude-code',
    defaultCwd: String(row.default_cwd),
    createdAt: Number(row.created_at),
    lastActiveAt: typeof row.last_active_at === 'number' ? row.last_active_at : undefined,
  };
}
