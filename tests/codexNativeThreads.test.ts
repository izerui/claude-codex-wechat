import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncCodexThreadForResume } from '../src/providers/codex/nativeThreads';

describe('syncCodexThreadForResume', () => {
  it('updates Codex thread metadata so resume picker can see bridge-owned sessions', async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const home = mkdtempSync(join(tmpdir(), 'bridge-codex-thread-home-'));
    const codexHome = join(home, '.codex');
    process.env.HOME = home;
    process.env.CODEX_HOME = codexHome;

    try {
      mkdirSync(join(codexHome, 'sessions', '2026', '06', '14'), { recursive: true });
      const rolloutPath = join(
        codexHome,
        'sessions',
        '2026',
        '06',
        '14',
        'rollout-2026-06-14T12-20-07-codex-session-1.jsonl',
      );
      writeFileSync(rolloutPath, JSON.stringify({
        timestamp: '2026-06-14T04:20:08.049Z',
        type: 'session_meta',
        payload: {
          id: 'codex-session-1',
          cwd: '/tmp/codex-project',
          source: 'exec',
        },
      }), 'utf8');
      writeFileSync(join(codexHome, 'session_index.jsonl'), JSON.stringify({
        id: 'codex-session-1',
        thread_name: '微信 · wx_user_1 · [claude-codex-wechat:test]',
        updated_at: '2026-06-14T04:20:58.825Z',
      }), 'utf8');

      const db = new Database(join(codexHome, 'state_5.sqlite'));
      db.exec(`
        CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          rollout_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          source TEXT NOT NULL,
          model_provider TEXT NOT NULL,
          cwd TEXT NOT NULL,
          title TEXT NOT NULL,
          sandbox_policy TEXT NOT NULL,
          approval_mode TEXT NOT NULL,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          has_user_event INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          archived_at INTEGER,
          git_sha TEXT,
          git_branch TEXT,
          git_origin_url TEXT,
          cli_version TEXT NOT NULL DEFAULT '',
          first_user_message TEXT NOT NULL DEFAULT '',
          agent_nickname TEXT,
          agent_role TEXT,
          memory_mode TEXT NOT NULL DEFAULT 'enabled',
          model TEXT,
          reasoning_effort TEXT,
          agent_path TEXT,
          created_at_ms INTEGER,
          updated_at_ms INTEGER,
          thread_source TEXT,
          preview TEXT NOT NULL DEFAULT ''
        );
      `);
      db.prepare(`
        INSERT INTO threads (
          id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
          sandbox_policy, approval_mode, tokens_used, has_user_event, archived,
          cli_version, first_user_message, memory_mode, model, reasoning_effort,
          created_at_ms, updated_at_ms, thread_source, preview
        ) VALUES (
          @id, @rolloutPath, @createdAt, @updatedAt, @source, @modelProvider, @cwd, @title,
          @sandboxPolicy, @approvalMode, @tokensUsed, @hasUserEvent, @archived,
          @cliVersion, @firstUserMessage, @memoryMode, @model, @reasoningEffort,
          @createdAtMs, @updatedAtMs, @threadSource, @preview
        )
      `).run({
        id: 'codex-session-1',
        rolloutPath,
        createdAt: 1781410807,
        updatedAt: 1781410857,
        source: 'exec',
        modelProvider: 'custom',
        cwd: '/tmp/codex-project',
        title: '你是什么大模型',
        sandboxPolicy: '{"type":"disabled"}',
        approvalMode: 'never',
        tokensUsed: 10,
        hasUserEvent: 0,
        archived: 0,
        cliVersion: '0.139.0',
        firstUserMessage: '你是什么大模型',
        memoryMode: 'disabled',
        model: 'gpt-5.4',
        reasoningEffort: 'medium',
        createdAtMs: 1781410807896,
        updatedAtMs: 1781410857640,
        threadSource: 'user',
        preview: '你是什么大模型',
      });
      db.close();

      await syncCodexThreadForResume({
        sessionId: 'codex-session-1',
        resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
        cwd: '/tmp/codex-project',
      });

      const checkDb = new Database(join(codexHome, 'state_5.sqlite'), { readonly: true });
      const thread = checkDb.prepare(`
        SELECT source, title, cwd, updated_at_ms
        FROM threads WHERE id = 'codex-session-1'
      `).get() as Record<string, unknown> | undefined;
      checkDb.close();

      expect(thread).toMatchObject({
        source: 'cli',
        title: '微信 · wx_user_1 · [claude-codex-wechat:test]',
        cwd: '/tmp/codex-project',
      });
      expect(Number(thread?.updated_at_ms)).toBeGreaterThanOrEqual(1781410857640);
      expect(readFileSync(join(codexHome, 'session_index.jsonl'), 'utf8')).toContain('微信 · wx_user_1 · [claude-codex-wechat:test]');
    } finally {
      process.env.HOME = previousHome;
      process.env.CODEX_HOME = previousCodexHome;
    }
  });
});
