import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { readProviderSessionSidecar } from '../sidecarMetadata';
import type { ProviderSessionCandidate } from '../types';

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
      const sidecar = await readProviderSessionSidecar('codex', sessionId, env);
      const indexed = index.get(sessionId);
      candidates.push({
        id: sessionId,
        providerId: 'codex',
        ...(sidecar?.cwd ? { cwd: sidecar.cwd } : {}),
        ...(sidecar?.updatedAt ? { lastActivityAt: sidecar.updatedAt } : {}),
        ...(sidecar?.bridgeTag ? { bridgeBindingSource: 'sidecar' as const } : {}),
        ...(sidecar?.bridgeTag ? { bridgeTag: sidecar.bridgeTag } : {}),
        title: indexed?.threadName ?? name,
        ...(indexed?.threadName ? { resumeTitle: indexed.threadName } : {}),
      });
    }
  }

  await walk(root, 0);
  return candidates;
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

async function readCodexSessionIndex(env: NodeJS.ProcessEnv): Promise<Map<string, { threadName?: string }>> {
  const indexPath = join(env.CODEX_HOME || join(env.HOME || homedir(), '.codex'), 'session_index.jsonl');
  const index = new Map<string, { threadName?: string }>();
  try {
    const content = await readFile(indexPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (typeof record.id !== 'string' || !record.id.trim()) continue;
        index.set(record.id.trim(), {
          threadName: typeof record.thread_name === 'string' && record.thread_name.trim() ? record.thread_name.trim() : undefined,
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
