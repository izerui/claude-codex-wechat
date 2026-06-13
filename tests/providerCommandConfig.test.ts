import { describe, expect, it, vi } from 'vitest';
import { createDefaultProviders } from '../src/providers/defaultProviders';
import { ProviderRegistry } from '../src/providers/providerRegistry';
import type { ClaudeDetectionResult } from '../src/providers/claude-code/claudeDetection';
import type { CodexDetectionResult } from '../src/providers/codex/codexDetection';

describe('provider command config wiring', () => {
  it('passes configured provider commands into default providers', async () => {
    const providers = createDefaultProviders({
      claudeCommand: '/opt/bin/claude',
      codexCommand: '/opt/bin/codex',
    });

    expect(providers).toHaveLength(2);
    expect(providers.map((provider) => provider.id)).toEqual(['claude-code', 'codex']);
  });

  it('passes configured commands into detection probes', async () => {
    const detectClaude = vi.fn(async () => ({ detected: true, version: '1.2.3' } as ClaudeDetectionResult));
    const detectCodex = vi.fn(async () => ({ detected: false, reason: 'missing_binary' } as CodexDetectionResult));
    const registry = new ProviderRegistry({
      claudeCommand: '/opt/bin/claude',
      codexCommand: '/opt/bin/codex',
      detectClaude,
      detectCodex,
    });

    const status = await registry.getStatus();

    expect(status).toEqual({
      claude: { detected: true, version: '1.2.3' },
      codex: { detected: false, reason: 'missing_binary' },
    });
  });
});
