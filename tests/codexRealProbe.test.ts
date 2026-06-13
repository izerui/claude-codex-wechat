import { describe, expect, it } from 'vitest';
import { detectCodexCli } from '../src/providers/codex/codexDetection';

const maybeIt = process.env.BRIDGE_REAL_CODEX === '1' ? it : it.skip;

describe('detectCodexCli real probe', () => {
  maybeIt('probes local codex --version only', async () => {
    const result = await detectCodexCli();
    expect(result.detected).toBe(true);
    if (result.detected) {
      expect(typeof result.version === 'string' || result.version === null).toBe(true);
    }
  });
});
