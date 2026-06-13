import { describe, expect, it } from 'vitest';
import { detectClaudeCode } from '../src/providers/claude-code/claudeDetection';

describe('detectClaudeCode', () => {
  it('returns missing_binary when command is not found', async () => {
    const result = await detectClaudeCode({
      commandRunner: async () => ({ ok: false, code: 'ENOENT', stdout: '', stderr: 'not found' }),
    });

    expect(result).toEqual({ detected: false, reason: 'missing_binary' });
  });

  it('returns command_failed when version command fails', async () => {
    const result = await detectClaudeCode({
      commandRunner: async () => ({ ok: false, code: 1, stdout: '', stderr: 'boom' }),
    });

    expect(result).toEqual({ detected: false, reason: 'command_failed' });
  });

  it('parses version output', async () => {
    const result = await detectClaudeCode({
      commandRunner: async () => ({ ok: true, stdout: 'Claude Code 2.0.1\n', stderr: '' }),
    });

    expect(result).toEqual({ detected: true, version: '2.0.1' });
  });
});
