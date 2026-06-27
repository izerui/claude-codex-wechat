import { describe, expect, it } from 'vitest';
import { normalizeBridgeConfigForTest } from '../src/daemon/config';

describe('relay tunnel config wiring', () => {
  it('normalizes relay tunnel settings from config', () => {
    const config = normalizeBridgeConfigForTest({
      tunnel: {
        provider: 'relay',
        enabled: true,
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'relay-token',
        },
      },
    });

    expect(config.tunnel).toEqual({
      provider: 'relay',
      enabled: true,
      relay: {
        serverUrl: 'wss://relay.style520.com/agent',
        authToken: 'relay-token',
      },
    });
  });

  it('falls back to disabled relay tunnel config when values are missing', () => {
    const config = normalizeBridgeConfigForTest({
      tunnel: {
        provider: 'relay',
      },
    });

    expect(config.tunnel).toEqual({
      provider: 'relay',
      enabled: false,
      relay: undefined,
    });
  });
});
