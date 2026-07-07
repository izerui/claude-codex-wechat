import Database from 'better-sqlite3';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { NativeVersionStamp, ProviderSessionCandidate } from '../types';

function resolveCodexSessionsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.CODEX_HOME || join(env.HOME || homedir(), '.codex'), 'sessions');
}

function isMatchingCodexRolloutFile(name: string): boolean {
  return name.startsWith('rollout-') && name.endsWith('.jsonl');
}

function extractCodexSessionId(name: string): string | null {
  if (!isMatchingCodexRolloutFile(name)) return null;
  const withoutExt = basename(name, '.jsonl');
  const match = withoutExt.match(/^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)$/);
  if (!match?.[1]) return null;
  return match[1];
}

export async function listRecoverableCodexSessions(env: NodeJS.ProcessEnv = process.env): Promise<ProviderSessionCandidate[]> {
  const root = resolveCodexSessionsRoot(env);
  const index = await readCodexSessionIndex(env);
  const threadMeta = readCodexThreadMetadata(env);
  const candidates: ProviderSessionCandidate[] = [];

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > 8) return;
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const name = String(entry.name);
      const path = join(currentDir, name);
      if (entry.isDirectory()) {
        await walk(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const sessionId = extractCodexSessionId(name);
      if (!sessionId) continue;
      const indexed = index.get(sessionId);
      const threaded = threadMeta.get(sessionId);
      const sessionMeta = await readCodexSessionMeta(path);
      const resolvedTitle = indexed?.threadName ?? threaded?.title ?? name;
      const resolvedLastActivityAt = indexed?.updatedAtMs ?? threaded?.updatedAtMs ?? sessionMeta.lastActivityAt;
      candidates.push({
        id: sessionId,
        providerId: 'codex',
        ...(sessionMeta.cwd ? { cwd: sessionMeta.cwd } : {}),
        ...(resolvedLastActivityAt ? { lastActivityAt: resolvedLastActivityAt } : {}),
        title: resolvedTitle,
        ...((indexed?.threadName ?? threaded?.title) ? { resumeTitle: indexed?.threadName ?? threaded?.title } : {}),
      });
    }
  }

  await walk(root, 0);
  return candidates.sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
}

export async function findRecoverableCodexSessionPath(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const root = resolveCodexSessionsRoot(env);
  const trimmed = sessionId.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) return null;

  async function walk(currentDir: string, depth: number): Promise<string | null> {
    if (depth > 8) return null;
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const name = String(entry.name);
      const path = join(currentDir, name);
      if (entry.isDirectory()) {
        const found = await walk(path, depth + 1);
        if (found) return found;
        continue;
      }
      if (!entry.isFile()) continue;
      if (extractCodexSessionId(name) === trimmed) return path;
    }
    return null;
  }

  return await walk(root, 0);
}

export async function getCodexNativeVersion(input: {
  sessionId: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<NativeVersionStamp | null> {
  const sessionPath = await findRecoverableCodexSessionPath(input.sessionId, input.env ?? process.env);
  if (!sessionPath) return null;
  const metadata = await stat(sessionPath).catch(() => null);
  if (!metadata?.isFile()) return null;
  return {
    fingerprint: `codex:${input.sessionId}:${Math.trunc(metadata.mtimeMs)}:${metadata.size}`,
    observedAt: Date.now(),
  };
}

async function readCodexSessionIndex(env: NodeJS.ProcessEnv): Promise<Map<string, { threadName?: string; updatedAtMs?: number }>> {
  const indexPath = join(env.CODEX_HOME || join(env.HOME || homedir(), '.codex'), 'session_index.jsonl');
  const index = new Map<string, { threadName?: string; updatedAtMs?: number }>();
  try {
    const content = await readFile(indexPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (typeof record.id !== 'string' || !record.id.trim()) continue;
        const updatedAtMs = typeof record.updated_at === 'string'
          ? Date.parse(record.updated_at)
          : undefined;
        index.set(record.id.trim(), {
          threadName: typeof record.thread_name === 'string' && record.thread_name.trim() ? record.thread_name.trim() : undefined,
          updatedAtMs: Number.isFinite(updatedAtMs) ? Math.trunc(updatedAtMs as number) : undefined,
        });
      } catch {
        // Ignore malformed index lines and continue.
      }
    }
  } catch {
    return index;
  }
  return index;
}

function readCodexThreadMetadata(env: NodeJS.ProcessEnv): Map<string, { title?: string; updatedAtMs?: number }> {
  const dbPath = join(env.CODEX_HOME || join(env.HOME || homedir(), '.codex'), 'state_5.sqlite');
  const metadata = new Map<string, { title?: string; updatedAtMs?: number }>();
  if (!existsSync(dbPath)) return metadata;
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const columns = db.prepare('PRAGMA table_info(threads)').all() as Array<{ name?: string }>;
    if (!columns.some((column) => column.name === 'id')) return metadata;
    const rows = db.prepare('SELECT id, title, updated_at_ms FROM threads').all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id.trim()) continue;
      metadata.set(row.id.trim(), {
        title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : undefined,
        updatedAtMs: typeof row.updated_at_ms === 'number'
          ? Math.trunc(row.updated_at_ms)
          : typeof row.updated_at_ms === 'bigint'
            ? Number(row.updated_at_ms)
            : undefined,
      });
    }
  } catch {
    return metadata;
  } finally {
    db?.close();
  }
  return metadata;
}

async function readCodexSessionMeta(filePath: string): Promise<{ cwd?: string; lastActivityAt?: number }> {
  try {
    const content = await readFile(filePath, 'utf8');
    let cwd: string | undefined;
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (typeof record.cwd === 'string' && record.cwd.trim()) {
          cwd = record.cwd.trim();
          break;
        }
        if (record.payload && typeof record.payload === 'object') {
          const payload = record.payload as Record<string, unknown>;
          if (typeof payload.cwd === 'string' && payload.cwd.trim()) {
            cwd = payload.cwd.trim();
            break;
          }
        }
      } catch {
        // Ignore malformed lines.
      }
    }
    const metadata = await stat(filePath).catch(() => null);
    return {
      cwd,
      lastActivityAt: metadata ? Math.trunc(metadata.mtimeMs) : undefined,
    };
  } catch {
    return {};
  }
}
