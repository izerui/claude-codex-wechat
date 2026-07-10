import { describe, expect, it } from 'vitest';
import { normalizeBridgeConfigForTest } from '../src/daemon/config';

describe('relay tunnel config wiring', () => {
  it('normalizes relay tunnel settings from config', () => {
    const config = normalizeBridgeConfigForTest({
      tunnel: {
        relay: {
          serverUrl: 'wss://relay.style520.com/agent',
          authToken: 'clrt_1234567890abcdef12345678',
        },
      },
    });

    expect(config.tunnel).toEqual({
      relay: {
        serverUrl: 'wss://relay.style520.com/agent',
        authToken: 'clrt_1234567890abcdef12345678',
      },
    });
  });

  it('defaults relay tunnel to the default relay server URL when values are missing', () => {
    const config = normalizeBridgeConfigForTest({});
    expect(config.tunnel).toEqual({
      relay: {
        serverUrl: 'wss://wechat.style520.com/agent',
      },
    });
  });
});
