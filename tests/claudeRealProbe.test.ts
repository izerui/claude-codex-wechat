import { describe, expect, it } from 'vitest';
import { detectClaudeCode } from '../src/providers/claude-code/claudeDetection';

const maybeIt = process.env.BRIDGE_REAL_CLAUDE === '1' ? it : it.skip;

describe('detectClaudeCode real probe', () => {
  maybeIt('probes local claude --version only', async () => {
    const result = await detectClaudeCode();
    expect(result.detected).toBe(true);
    if (result.detected) {
      expect(typeof result.version === 'string' || result.version === null).toBe(true);
    }
  });
});
