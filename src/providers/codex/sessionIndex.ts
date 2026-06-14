import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

function resolveCodexIndexPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.CODEX_HOME || join(env.HOME || homedir(), '.codex'), 'session_index.jsonl');
}

export async function upsertCodexSessionIndexEntry(input: {
  sessionId: string;
  threadName: string;
  updatedAt?: string;
}, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const indexPath = resolveCodexIndexPath(env);
  const lines: string[] = [];
  let replaced = false;
  try {
    const content = await readFile(indexPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (record.id === input.sessionId) {
          lines.push(JSON.stringify({
            ...record,
            id: input.sessionId,
            thread_name: input.threadName,
            updated_at: input.updatedAt ?? new Date().toISOString(),
          }));
          replaced = true;
        } else {
          lines.push(line);
        }
      } catch {
        lines.push(line);
      }
    }
  } catch {
    // Create a fresh index file below.
  }
  if (!replaced) {
    lines.push(JSON.stringify({
      id: input.sessionId,
      thread_name: input.threadName,
      updated_at: input.updatedAt ?? new Date().toISOString(),
    }));
  }
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${lines.join('\n')}\n`, 'utf8');
}
