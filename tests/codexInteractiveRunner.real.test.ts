import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findRecoverableCodexSessionPath } from '../src/providers/codex/nativeSessions';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { detectCodexCli } from '../src/providers/codex/codexDetection';
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';

const maybeReal = process.env.BRIDGE_REAL_CODEX === '1' ? describe : describe.skip;

maybeReal('CodexInteractiveRunner real Codex CLI', () => {
  it('creates a native interactive thread that is persisted as a resume-visible cli session', async () => {
    const detection = await detectCodexCli();
    expect(detection.detected).toBe(true);

    const runner = new CodexInteractiveRunner();
    const resumeTitle = `微信 · real codex interactive probe · [claude-codex-wechat:real-probe-${Date.now()}]`;
    await runner.startSession({
      bridgeSessionId: 'bs_real_codex_interactive',
      cwd: process.cwd(),
      options: { sessionName: resumeTitle },
    });

    let providerSessionId: string | undefined;
    for await (const event of runner.sendMessage({
      bridgeSessionId: 'bs_real_codex_interactive',
      text: 'Reply with exactly: codex-interactive-ok',
    })) {
      if (event.type === 'session_state' && event.state.providerSessionId) {
        providerSessionId = event.state.providerSessionId;
      }
    }
    await runner.stopSession('bs_real_codex_interactive');

    expect(providerSessionId).toBeTruthy();

    const stateDb = new Database(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'state_5.sqlite'), { readonly: true });
    const thread = stateDb.prepare(`
      SELECT source, title, cwd
      FROM threads WHERE id = ?
    `).get(providerSessionId) as Record<string, unknown> | undefined;
    stateDb.close();

    expect(thread).toMatchObject({
      source: 'cli',
      title: resumeTitle,
      cwd: process.cwd(),
    });

    const rolloutPath = await findRecoverableCodexSessionPath(providerSessionId!);
    expect(rolloutPath).toBeTruthy();
    const rollout = readFileSync(rolloutPath!, 'utf8');
    expect(rollout).toContain('"originator":"codex-tui"');
    expect(rollout).toContain('"source":"cli"');
    expect(rollout).toContain(providerSessionId!);
  }, 180_000);
});
