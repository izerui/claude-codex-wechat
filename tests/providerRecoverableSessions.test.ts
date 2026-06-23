import Database from 'better-sqlite3';
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

  it('prefers the latest Codex session_index update when rollout mtimes are stale', async () => {
    const home = trackTempDir('codex-recoverable-index-order-');
    const codexHome = join(home, '.codex');
    const sessionDir = join(codexHome, 'sessions', '2026', '06', '19');
    mkdirSync(sessionDir, { recursive: true });

    const staleWechatPath = join(sessionDir, 'rollout-2026-06-19T10-00-00-codex-wechat.jsonl');
    const freshOtherPath = join(sessionDir, 'rollout-2026-06-19T10-05-00-codex-other.jsonl');

    writeFileSync(staleWechatPath, JSON.stringify({
      timestamp: '2026-06-19T10:00:00.000Z',
      type: 'session_meta',
      payload: { id: 'codex-wechat', cwd: '/tmp/codex-project' },
      cwd: '/tmp/codex-project',
    }), 'utf8');
    writeFileSync(freshOtherPath, JSON.stringify({
      timestamp: '2026-06-19T10:05:00.000Z',
      type: 'session_meta',
      payload: { id: 'codex-other', cwd: '/tmp/codex-project' },
      cwd: '/tmp/codex-project',
    }), 'utf8');

    utimesSync(staleWechatPath, new Date('2026-06-19T10:00:00.000Z'), new Date('2026-06-19T10:00:00.000Z'));
    utimesSync(freshOtherPath, new Date('2026-06-19T10:05:00.000Z'), new Date('2026-06-19T10:05:00.000Z'));

    writeFileSync(join(codexHome, 'session_index.jsonl'), [
      JSON.stringify({
        id: 'codex-wechat',
        thread_name: '微信 · wx_user_1 · [claude-codex-wechat:newest]',
        updated_at: '2026-06-19T10:10:00.000Z',
      }),
      JSON.stringify({
        id: 'codex-other',
        thread_name: 'other session',
        updated_at: '2026-06-19T10:05:00.000Z',
      }),
    ].join('\n'), 'utf8');

    const sessions = await listRecoverableCodexSessions({ HOME: home, CODEX_HOME: codexHome });

    expect(sessions.map((session) => session.id)).toEqual(['codex-wechat', 'codex-other']);
    expect(sessions[0]).toMatchObject({
      id: 'codex-wechat',
      title: '微信 · wx_user_1 · [claude-codex-wechat:newest]',
      resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:newest]',
    });
    expect((sessions[0]?.lastActivityAt ?? 0)).toBeGreaterThan(sessions[1]?.lastActivityAt ?? 0);
  });

  it('falls back to the Codex thread title when session_index is missing the latest session', async () => {
    const home = trackTempDir('codex-recoverable-thread-title-');
    const codexHome = join(home, '.codex');
    const sessionDir = join(codexHome, 'sessions', '2026', '06', '19');
    mkdirSync(sessionDir, { recursive: true });

    const rolloutPath = join(sessionDir, 'rollout-2026-06-19T10-00-00-codex-thread-only.jsonl');
    writeFileSync(rolloutPath, JSON.stringify({
      timestamp: '2026-06-19T10:00:00.000Z',
      type: 'session_meta',
      payload: { id: 'codex-thread-only', cwd: '/tmp/codex-project' },
      cwd: '/tmp/codex-project',
    }), 'utf8');
    utimesSync(rolloutPath, new Date('2026-06-19T10:00:00.000Z'), new Date('2026-06-19T10:00:00.000Z'));

    const db = new Database(join(codexHome, 'state_5.sqlite'));
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        updated_at_ms INTEGER,
        rollout_path TEXT NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO threads (id, title, updated_at_ms, rollout_path)
      VALUES (@id, @title, @updatedAtMs, @rolloutPath)
    `).run({
      id: 'codex-thread-only',
      title: '微信最新会话标题',
      updatedAtMs: 1781863800000,
      rolloutPath,
    });
    db.close();

    const sessions = await listRecoverableCodexSessions({ HOME: home, CODEX_HOME: codexHome });

    expect(sessions).toEqual([
      expect.objectContaining({
        id: 'codex-thread-only',
        title: '微信最新会话标题',
        resumeTitle: '微信最新会话标题',
        lastActivityAt: 1781863800000,
      }),
    ]);
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
