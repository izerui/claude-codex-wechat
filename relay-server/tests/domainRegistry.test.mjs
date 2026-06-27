import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomainRegistry } from '../src/domainRegistry.mjs';

test('allocates a random path token and returns a public URL', () => {
  const registry = createDomainRegistry({ baseDomain: 'style520.com' });
  const allocation = registry.allocate('conn-1');

  assert.equal(allocation.connectionId, 'conn-1');
  assert.match(allocation.token, /^[a-z0-9]{10,12}$/);
  assert.equal(allocation.publicUrl, `https://style520.com/${allocation.token}`);
});

test('releases a path token when its connection closes', () => {
  const registry = createDomainRegistry({ baseDomain: 'style520.com' });
  const allocation = registry.allocate('conn-1');

  assert.equal(registry.lookupByToken(allocation.token), 'conn-1');
  registry.release('conn-1');
  assert.equal(registry.lookupByToken(allocation.token), null);
});
