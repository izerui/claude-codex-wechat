import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listRecoverableClaudeSessions } from '../src/providers/claude-code/nativeSessions';
import { listRecoverableCodexSessions } from '../src/providers/codex/nativeSessions';

const tempDirs: string[] = [];

function trackTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeJsonl(filePath: string, records: unknown[]): void {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join('\n'), 'utf8');
}

describe('recoverable provider session ordering', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists Codex sessions in descending updateTime order', async () => {
    const home = trackTempDir('codex-recoverable-order-');
    const codexHome = join(home, '.codex');
    const sessionDir = join(codexHome, 'sessions', '2026', '06', '19');
    mkdirSync(sessionDir, { recursive: true });

    const olderPath = join(sessionDir, 'rollout-2026-06-19T10-00-00-codex-older.jsonl');
    const newerPath = join(sessionDir, 'rollout-2026-06-19T10-05-00-codex-newer.jsonl');

    writeFileSync(olderPath, JSON.stringify({
      timestamp: '2026-06-19T10:00:00.000Z',
      type: 'session_meta',
      payload: { id: 'codex-older', cwd: '/tmp/codex-project' },
      cwd: '/tmp/codex-project',
    }), 'utf8');
    writeFileSync(newerPath, JSON.stringify({
      timestamp: '2026-06-19T10:05:00.000Z',
      type: 'session_meta',
      payload: { id: 'codex-newer', cwd: '/tmp/codex-project' },
      cwd: '/tmp/codex-project',
    }), 'utf8');

    utimesSync(olderPath, new Date('2026-06-19T10:00:00.000Z'), new Date('2026-06-19T10:00:00.000Z'));
    utimesSync(newerPath, new Date('2026-06-19T10:05:00.000Z'), new Date('2026-06-19T10:05:00.000Z'));

    const sessions = await listRecoverableCodexSessions({ HOME: home, CODEX_HOME: codexHome });

    expect(sessions.map((session) => session.id)).toEqual(['codex-newer', 'codex-older']);
    expect((sessions[0]?.lastActivityAt ?? 0)).toBeGreaterThan(sessions[1]?.lastActivityAt ?? 0);
  });

  it('lists Claude sessions in descending updateTime order', async () => {
    const home = trackTempDir('claude-recoverable-order-');
    const projectDir = join(home, '.claude', 'projects', '-tmp-project');
    mkdirSync(projectDir, { recursive: true });

    const olderPath = join(projectDir, 'claude-older.jsonl');
    const newerPath = join(projectDir, 'claude-newer.jsonl');

    writeJsonl(olderPath, [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'older' }] } },
    ]);
    writeJsonl(newerPath, [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'newer' }] } },
    ]);

    writeJsonl(join(home, '.claude', 'history.jsonl'), [
      {
        sessionId: 'claude-older',
        display: 'older',
        project: '/tmp/project',
        timestamp: 1000,
      },
      {
        sessionId: 'claude-newer',
        display: 'newer',
        project: '/tmp/project',
        timestamp: 2000,
      },
    ]);

    const sessions = await listRecoverableClaudeSessions({ HOME: home });

    expect(sessions.map((session) => session.id)).toEqual(['claude-newer', 'claude-older']);
    expect((sessions[0]?.lastActivityAt ?? 0)).toBeGreaterThan(sessions[1]?.lastActivityAt ?? 0);
  });
});
