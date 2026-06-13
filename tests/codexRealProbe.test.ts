import { describe, expect, it } from 'vitest';
import { detectCodexCli } from '../src/providers/codex/codexDetection';

const maybeReal = process.env.BRIDGE_REAL_CODEX === '1' ? describe : describe.skip;

maybeReal('CodexCliRunner real Codex CLI', () => {
  it('detects Codex CLI through version contract only', async () => {
    const result = await detectCodexCli();
    expect(result.detected).toBe(true);
    if (result.detected) {
      expect(typeof result.version === 'string' || result.version === null).toBe(true);
    }
  }, 60_000);
});
