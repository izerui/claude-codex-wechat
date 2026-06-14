import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

function resolveCodexStateDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.CODEX_HOME || join(env.HOME || homedir(), '.codex'), 'state_5.sqlite');
}

export async function syncCodexThreadForResume(input: {
  sessionId: string;
  resumeTitle: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const env = input.env ?? process.env;
  const dbPath = resolveCodexStateDbPath(env);
  if (!existsSync(dbPath)) return false;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const db = new Database(dbPath);
    try {
      const columns = db.prepare('PRAGMA table_info(threads)').all() as Array<{ name?: string }>;
      if (!columns.some((column) => column.name === 'id')) return false;

      const updatedAtMs = Date.now();
      const updatedAt = Math.trunc(updatedAtMs / 1000);
      const result = db.prepare(`
        UPDATE threads
        SET
          source = 'cli',
          cwd = @cwd,
          title = @resumeTitle,
          updated_at = @updatedAt,
          updated_at_ms = @updatedAtMs
        WHERE id = @sessionId
      `).run({
        sessionId: input.sessionId,
        cwd: input.cwd,
        resumeTitle: input.resumeTitle,
        updatedAt,
        updatedAtMs,
      });
      if (result.changes > 0) {
        const row = db.prepare('SELECT rollout_path FROM threads WHERE id = ?').get(input.sessionId) as
          | { rollout_path?: unknown }
          | undefined;
        if (typeof row?.rollout_path === 'string' && row.rollout_path) {
          await syncCodexRolloutSessionMeta(row.rollout_path);
        }
        return true;
      }
    } finally {
      db.close();
    }
    await delay(100);
  }
  return false;
}

async function syncCodexRolloutSessionMeta(rolloutPath: string): Promise<void> {
  if (!existsSync(rolloutPath)) return;
  const content = await readFile(rolloutPath, 'utf8');
  const lines = content.split(/\r?\n/);
  if (!lines[0]?.trim()) return;
  try {
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    if (first.type !== 'session_meta' || !first.payload || typeof first.payload !== 'object') return;
    const payload = first.payload as Record<string, unknown>;
    payload.source = 'cli';
    payload.originator = 'codex-tui';
    first.payload = payload;
    lines[0] = JSON.stringify(first);
    await writeFile(rolloutPath, lines.join('\n'), 'utf8');
  } catch {
    // Ignore malformed rollout files; state DB update is still useful.
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
