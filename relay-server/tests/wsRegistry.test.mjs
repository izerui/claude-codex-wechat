import test from 'node:test';
import assert from 'node:assert/strict';
import { createWsRegistry } from '../src/wsRegistry.mjs';

test('stores and removes active relay connections', () => {
  const registry = createWsRegistry();
  const socket = { id: 'socket-1' };

  registry.set('conn-1', socket);
  assert.equal(registry.get('conn-1'), socket);

  registry.delete('conn-1');
  assert.equal(registry.get('conn-1'), null);
});
