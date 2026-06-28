import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRelayMessage } from '../src/protocol.mjs';

test('parses a valid register message', () => {
  const parsed = parseRelayMessage(JSON.stringify({
    type: 'register',
    clientVersion: '0.1.0',
    targetBaseUrl: 'http://127.0.0.1:8787',
    authToken: 'relay-token',
  }));

  assert.equal(parsed.type, 'register');
  assert.equal(parsed.clientVersion, '0.1.0');
  assert.equal(parsed.authToken, 'relay-token');
});

test('throws for invalid relay messages', () => {
  assert.throws(() => parseRelayMessage(JSON.stringify({ type: 'register' })), /invalid_register_message/);
  assert.throws(() => parseRelayMessage('not-json'), /Unexpected token|JSON/);
});
