import { describe, expect, it } from 'vitest';
import { detectCodexCli } from '../src/providers/codex/codexDetection';
import { CodexCliRunner } from '../src/providers/codex/codexCliRunner';

const maybeReal = process.env.BRIDGE_REAL_CODEX === '1' ? describe : describe.skip;

maybeReal('CodexCliRunner real Codex CLI', () => {
  it('detects Codex and emits a minimal real message flow contract', async () => {
    const detection = await detectCodexCli();
    expect(detection.detected).toBe(true);

    const runner = new CodexCliRunner();
    await runner.startSession({ bridgeSessionId: 'bs_real_codex', cwd: process.cwd() });

    const events = [];
    for await (const event of runner.sendMessage({
      bridgeSessionId: 'bs_real_codex',
      text: 'Reply with exactly: codex-bridge-ok',
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === 'text_delta' && event.text.includes('codex-bridge-ok'))).toBe(true);
    expect(events.some((event) => event.type === 'session_state')).toBe(true);
    expect(events.some((event) => event.type === 'message_done')).toBe(true);
  }, 120_000);
});
