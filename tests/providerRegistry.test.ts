import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../src/providers/providerRegistry';
import type { ClaudeDetectionResult } from '../src/providers/claude-code/claudeDetection';
import type { CodexDetectionResult } from '../src/providers/codex/codexDetection';

describe('ProviderRegistry', () => {
  it('returns detection state with command path and checkedAt', async () => {
    const detectClaude = vi.fn(async () => ({ detected: true, version: '1.2.3' } as ClaudeDetectionResult));
    const detectCodex = vi.fn(async () => ({ detected: false, reason: 'missing_binary' } as CodexDetectionResult));
    const registry = new ProviderRegistry({
      claudeCommand: '/opt/bin/claude',
      codexCommand: '/opt/bin/codex',
      detectClaude,
      detectCodex,
      now: () => 1234567890,
    });

    const status = await registry.getStatus();

    expect(status).toEqual({
      claude: {
        detected: true,
        version: '1.2.3',
        command: '/opt/bin/claude',
        checkedAt: 1234567890,
      },
      codex: {
        detected: false,
        reason: 'missing_binary',
        command: '/opt/bin/codex',
        checkedAt: 1234567890,
      },
    });
  });
});
