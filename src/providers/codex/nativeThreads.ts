import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
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
    return result.changes > 0;
  } finally {
    db.close();
  }
}
