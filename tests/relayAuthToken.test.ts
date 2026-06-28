import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureRelayAuthTokenSync } from '../src/daemon/configPersistence';

describe('relay auth token persistence', () => {
  it('creates and persists a relay auth token when missing', () => {
    const configDir = mkdtempSync(`${tmpdir()}/relay-auth-token-`);
    const configPath = join(configDir, 'config.json');

    const authToken = ensureRelayAuthTokenSync({ configPath });
    const stored = JSON.parse(readFileSync(configPath, 'utf8')) as {
      tunnel?: { relay?: { authToken?: string } };
    };

    expect(authToken).toMatch(/^clrt_[a-z0-9]{24}$/);
    expect(stored.tunnel?.relay?.authToken).toBe(authToken);
  });

  it('reuses the existing relay auth token on later reads', () => {
    const configDir = mkdtempSync(`${tmpdir()}/relay-auth-token-reuse-`);
    const configPath = join(configDir, 'config.json');

    const first = ensureRelayAuthTokenSync({ configPath });
    const second = ensureRelayAuthTokenSync({ configPath });

    expect(second).toBe(first);
  });
});
