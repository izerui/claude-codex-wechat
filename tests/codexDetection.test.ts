import { describe, expect, it } from 'vitest';
import { detectCodexCli } from '../src/providers/codex/codexDetection';

describe('detectCodexCli', () => {
  it('returns missing_binary when command is not found', async () => {
    const result = await detectCodexCli({
      commandRunner: async () => ({ ok: false, code: 'ENOENT', stdout: '', stderr: 'not found' }),
    });

    expect(result).toEqual({ detected: false, reason: 'missing_binary' });
  });

  it('returns command_failed when version command fails', async () => {
    const result = await detectCodexCli({
      commandRunner: async () => ({ ok: false, code: 1, stdout: '', stderr: 'boom' }),
    });

    expect(result).toEqual({ detected: false, reason: 'command_failed' });
  });

  it('parses version output', async () => {
    const result = await detectCodexCli({
      commandRunner: async () => ({ ok: true, stdout: 'codex-cli 0.139.0\n', stderr: '' }),
    });

    expect(result).toEqual({ detected: true, version: '0.139.0' });
  });
});
