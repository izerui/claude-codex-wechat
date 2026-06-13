import { describe, expect, it } from 'vitest';
import { ClaudeHeadlessRunner } from '../src/providers/claude-code/claudeHeadlessRunner';
import { detectClaudeCode } from '../src/providers/claude-code/claudeDetection';

const maybeReal = process.env.BRIDGE_REAL_CLAUDE === '1' ? describe : describe.skip;

maybeReal('ClaudeHeadlessRunner real Claude CLI', () => {
  it('detects Claude and emits a minimal real message flow contract', async () => {
    const detection = await detectClaudeCode();
    expect(detection.detected).toBe(true);

    const runner = new ClaudeHeadlessRunner();
    await runner.startSession({ bridgeSessionId: 'bs_real_claude', cwd: process.cwd() });

    const events = [];
    for await (const event of runner.sendMessage({
      bridgeSessionId: 'bs_real_claude',
      text: 'Reply with exactly: bridge-ok',
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === 'text_delta' && event.text.includes('bridge-ok'))).toBe(true);
    expect(events.some((event) => event.type === 'session_state')).toBe(true);
    expect(events.some((event) => event.type === 'message_done')).toBe(true);
  }, 120_000);
});
