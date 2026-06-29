import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDomainRegistry } from '../src/domainRegistry.mjs';

test('derives a stable token from authToken (same authToken -> same suffix)', () => {
  const registry = createDomainRegistry({});
  const authToken = 'clrt_1234567890abcdef12345678';
  const expected = createHash('sha256').update(authToken).digest('hex').slice(0, 12);

  const a = registry.allocate('conn-1', { authToken });
  assert.equal(a.token, expected);

  registry.release('conn-1');
  const b = registry.allocate('conn-2', { authToken });
  assert.equal(b.token, expected, 'token 应在重连后保持不变');
});

test('builds public URL from publicBaseUrl when provided', () => {
  const registry = createDomainRegistry({});
  const authToken = 'clrt_abcdefabcdefabcdefabcdef';
  const allocation = registry.allocate('conn-1', {
    authToken,
    publicBaseUrl: 'https://style520.com',
  });
  assert.equal(allocation.publicUrl, `https://style520.com/${allocation.token}`);
});

test('falls back to a random token when no authToken is supplied', () => {
  const registry = createDomainRegistry({});
  const allocation = registry.allocate('conn-1');
  assert.match(allocation.token, /^[a-f0-9]{12}$/);
});

test('releases a path token when its connection closes', () => {
  const registry = createDomainRegistry({});
  const allocation = registry.allocate('conn-1', { authToken: 'clrt_x' });

  assert.equal(registry.lookupByToken(allocation.token), 'conn-1');
  registry.release('conn-1');
  assert.equal(registry.lookupByToken(allocation.token), null);
});
