import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { PRIMARY_WEIXIN_PLATFORM } from '../src/channels/platforms';
import { createDaemonServer } from '../src/daemon/server';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { CodexProvider } from '../src/providers/codex/codexProvider';
import { findRecoverableCodexSessionPath } from '../src/providers/codex/nativeSessions';
import { schemaSql } from '../src/storage/schema';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';

const maybeReal = process.env.BRIDGE_REAL_CODEX === '1' ? describe : describe.skip;

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(schemaSql);
  return db;
}

maybeReal('channel message flow real Codex interactive', () => {
  it('creates a real resume-visible Codex session from a simulated WeChat message', async () => {
    const db = memoryDb();
    const store = createRuntimeUserStore('bridge-real-codex-users-');
    const users = store.activeUserStore;
    seedRuntimeUserStore(store, {
      platform: PRIMARY_WEIXIN_PLATFORM,
      platformUserId: 'wx_user_real_codex',
      role: 'user',
      provider: 'codex',
      cwd: process.cwd(),
    });

    const channel = new MockChannelAdapter();
    const provider = new CodexProvider({ runner: new CodexInteractiveRunner() });
    const { app, sessions } = createDaemonServer({
      db,
      channel,
      providers: [provider],
      activeUserStore: users,
    });

    await channel.emitIncoming({
      id: 'm1',
      platform: PRIMARY_WEIXIN_PLATFORM,
      chatId: 'chat-real-codex',
      user: { id: 'wx_user_real_codex' },
      content: { type: 'text', text: 'Reply with exactly: wechat-codex-resume-ok' },
      timestamp: Date.now(),
    });

    const active = sessions.getActiveSession('chat-real-codex');
    expect(active).toMatchObject({
      providerId: 'codex',
      providerSessionId: expect.any(String),
      resumeTitle: '微信 · wx_user_real_codex · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl9yZWFsX2NvZGV4IiwiY2hhdElkIjoiY2hhdC1yZWFsLWNvZGV4In0]',
    });

    const stateDb = new Database(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'state_5.sqlite'), { readonly: true });
    const thread = stateDb.prepare(`
      SELECT source, title, cwd
      FROM threads WHERE id = ?
    `).get(active!.providerSessionId) as Record<string, unknown> | undefined;
    stateDb.close();

    expect(thread).toMatchObject({
      source: 'cli',
      title: active!.resumeTitle,
      cwd: process.cwd(),
    });

    const rolloutPath = await findRecoverableCodexSessionPath(active!.providerSessionId!);
    expect(rolloutPath).toBeTruthy();
    const rollout = readFileSync(rolloutPath!, 'utf8');
    expect(rollout).toContain('"originator":"codex-tui"');
    expect(rollout).toContain('"source":"cli"');

    await app.close();
  }, 180_000);
});
