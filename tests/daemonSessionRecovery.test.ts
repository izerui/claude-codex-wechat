import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { createDaemonServer } from '../src/daemon/server';
import { ClaudeHeadlessRunner, type ClaudeProcessRunner } from '../src/providers/claude-code/claudeHeadlessRunner';
import { ClaudeCodeProvider } from '../src/providers/claude-code/claudeProvider';
import { RuntimeSessionRepository } from '../src/storage/runtimeSessionRepository';
import { schemaSql } from '../src/storage/schema';
import { PRIMARY_WEIXIN_PLATFORM } from '../src/channels/platforms';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

describe('daemon provider session recovery', () => {
  it('resumes the same persisted Claude session after daemon restart', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-daemon-home-`);
    const db = memoryDb();
    try {
      const activeUserStore = createRuntimeUserStore('bridge-daemon-recovery-').activeUserStore;
      activeUserStore.setActiveUser({
        platform: PRIMARY_WEIXIN_PLATFORM,
        platformUserId: 'wx_user_1',
        role: 'user',
      });

      const firstRunnerCalls: Parameters<ClaudeProcessRunner>[0][] = [];
      const firstRunner = new ClaudeHeadlessRunner({
        command: 'claude',
        processRunner: async (call) => {
          firstRunnerCalls.push(call);
          return {
            code: 0,
            stdout: [
              JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'first reply' }] } }),
              JSON.stringify({ type: 'result', session_id: 'claude-session-1' }),
            ].join('\n'),
            stderr: '',
          };
        },
      });
      const firstChannel = new MockChannelAdapter();
      const firstServer = createDaemonServer({
        db,
        channel: firstChannel,
        providers: [new ClaudeCodeProvider({ runner: firstRunner })],
        activeUserStore,
      });

      await firstChannel.emitIncoming({
        id: 'm1',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-a',
        user: { id: 'wx_user_1' },
        content: { type: 'text', text: 'first' },
        timestamp: 1,
      });

      const persistedBeforeRestart = new RuntimeSessionRepository(db).list();
      expect(persistedBeforeRestart).toHaveLength(1);
      expect(persistedBeforeRestart[0]).toMatchObject({
        chatId: 'chat-a',
        providerId: 'claude-code',
        providerSessionId: 'claude-session-1',
        resumeTitle: 'first · 微信 · wx_user_1',
      });

      await firstServer.app.close();

      const secondRunnerCalls: Parameters<ClaudeProcessRunner>[0][] = [];
      const secondRunner = new ClaudeHeadlessRunner({
        command: 'claude',
        processRunner: async (call) => {
          secondRunnerCalls.push(call);
          return {
            code: 0,
            stdout: [
              JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'second reply' }] } }),
              JSON.stringify({ type: 'result', session_id: 'claude-session-1' }),
            ].join('\n'),
            stderr: '',
          };
        },
      });
      const secondChannel = new MockChannelAdapter();
      const secondServer = createDaemonServer({
        db,
        channel: secondChannel,
        providers: [new ClaudeCodeProvider({ runner: secondRunner })],
        activeUserStore,
      });

      await secondChannel.emitIncoming({
        id: 'm2',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-a',
        user: { id: 'wx_user_1' },
        content: { type: 'text', text: 'second' },
        timestamp: 2,
      });

      expect(secondRunnerCalls[0]?.args).toEqual([
        '-p',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--dangerously-skip-permissions',
        '--resume',
        'claude-session-1',
        'second',
      ]);
      expect(new RuntimeSessionRepository(db).list()).toHaveLength(1);
      expect(new RuntimeSessionRepository(db).getActiveByChat('chat-a')).toMatchObject({
        id: persistedBeforeRestart[0]!.id,
        providerSessionId: 'claude-session-1',
        resumeTitle: 'first · 微信 · wx_user_1',
      });

      await secondServer.app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('heals legacy persisted WeChat Claude sessions with missing native resume title metadata on restart', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-daemon-home-`);
    const db = memoryDb();
    try {
      const store = createRuntimeUserStore('bridge-daemon-legacy-');
      const user = seedRuntimeUserStore(store, {
        platform: PRIMARY_WEIXIN_PLATFORM,
        platformUserId: 'wx_user_legacy',
        role: 'user',
      });
      const runtimeSessions = new RuntimeSessionRepository(db);
      const resumeTitle = '微信 · wx_user_legacy · [claude-codex-wechat:legacyprobe]';
      runtimeSessions.createWithId({
        id: 'bs_legacy',
        chatId: 'chat-legacy',
        ownerUserId: user.id,
        providerId: 'claude-code',
        providerSessionId: 'legacy-session-1',
        recoverySource: 'runtime',
        resumeTitle,
        cwd: '/tmp/project',
        status: 'idle',
        createdAt: 1,
        lastActivityAt: 1,
      });

      const projectDir = join(process.env.HOME, '.claude', 'projects', '-tmp-project');
      mkdirSync(projectDir, { recursive: true });
      const sessionPath = join(projectDir, 'legacy-session-1.jsonl');
      writeFileSync(sessionPath, [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'old session' }] } }),
        JSON.stringify({ type: 'result', session_id: 'legacy-session-1' }),
      ].join('\n'));

      const server = createDaemonServer({
        db,
        channel: new MockChannelAdapter(),
        providers: [new ClaudeCodeProvider({ runner: new ClaudeHeadlessRunner() })],
        activeUserStore: store.activeUserStore,
      });

      await server.app.ready();

      await vi.waitFor(() => {
        const content = readFileSync(sessionPath, 'utf8');
        expect(content).toContain('"type":"custom-title"');
        expect(content).toContain('"type":"agent-name"');
        expect(content).toContain(resumeTitle);
      });

      await server.app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });
});
