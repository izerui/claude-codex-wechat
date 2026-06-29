import { describe, expect, it } from 'vitest';
import { normalizeBridgeConfigForTest } from '../src/daemon/config';

describe('relay tunnel config wiring', () => {
  it('normalizes relay tunnel settings from config', () => {
    const config = normalizeBridgeConfigForTest({
      tunnel: {
        enabled: true,
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'clrt_1234567890abcdef12345678',
        },
      },
    });

    expect(config.tunnel).toEqual({
      enabled: true,
      relay: {
        serverUrl: 'wss://relay.style520.com/agent',
        authToken: 'clrt_1234567890abcdef12345678',
      },
    });
  });

  it('falls back to disabled relay tunnel config when values are missing', () => {
    const config = normalizeBridgeConfigForTest({
      tunnel: {
      },
    });

    expect(config.tunnel).toBeUndefined();
  });
});
