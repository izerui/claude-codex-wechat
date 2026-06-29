import test from 'node:test';
import assert from 'node:assert/strict';
import { createWsRegistry } from '../src/wsRegistry.mjs';

test('stores and removes active relay connections', () => {
  const registry = createWsRegistry();
  const socket = { id: 'socket-1' };

  registry.set('conn-1', {
    socket,
    authToken: 'clrt_111111111111111111111111',
    publicUrl: 'https://style520.com/abc123',
    connectedAt: 1000,
  });
  assert.deepEqual(registry.get('conn-1'), {
    socket,
    authToken: 'clrt_111111111111111111111111',
    publicUrl: 'https://style520.com/abc123',
    connectedAt: 1000,
  });

  registry.delete('conn-1');
  assert.equal(registry.get('conn-1'), null);
});
