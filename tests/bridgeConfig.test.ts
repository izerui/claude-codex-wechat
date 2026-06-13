import { describe, expect, it } from 'vitest';
import { normalizeBridgeConfigForTest } from '../src/daemon/config';

describe('bridge config provider commands', () => {
  it('normalizes provider command paths from config', () => {
    const config = normalizeBridgeConfigForTest({
      providers: {
        claude: { command: '/opt/bin/claude' },
        codex: { command: '/opt/bin/codex' },
      },
    });

    expect(config.providers).toEqual({
      claude: { command: '/opt/bin/claude' },
      codex: { command: '/opt/bin/codex' },
    });
  });

  it('falls back to env provider command paths when config is missing', () => {
    const config = normalizeBridgeConfigForTest({}, {
      BRIDGE_CLAUDE_COMMAND: '/env/claude',
      BRIDGE_CODEX_COMMAND: '/env/codex',
    });

    expect(config.providers).toEqual({
      claude: { command: '/env/claude' },
      codex: { command: '/env/codex' },
    });
  });
});
