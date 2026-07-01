import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRelayMessage } from '../src/protocol.mjs';

test('parses a valid register message', () => {
  const parsed = parseRelayMessage(JSON.stringify({
    type: 'register',
    clientVersion: '0.1.0',
    targetBaseUrl: 'http://127.0.0.1:8787',
    authToken: 'clrt_1234567890abcdef12345678',
  }));

  assert.equal(parsed.type, 'register');
  assert.equal(parsed.clientVersion, '0.1.0');
  assert.equal(parsed.authToken, 'clrt_1234567890abcdef12345678');
});

test('parses a register message that declares streaming support', () => {
  const parsed = parseRelayMessage(JSON.stringify({
    type: 'register',
    clientVersion: '0.1.0',
    targetBaseUrl: 'http://127.0.0.1:8787',
    authToken: 'clrt_1234567890abcdef12345678',
    supportsStreaming: true,
  }));

  assert.equal(parsed.type, 'register');
  assert.equal(parsed.supportsStreaming, true);
});

test('throws for invalid relay messages', () => {
  assert.throws(() => parseRelayMessage(JSON.stringify({ type: 'register' })), /invalid_register_message/);
  // supportsStreaming 存在但不是布尔值 —— 能力协商字段类型非法,应拒绝。
  assert.throws(() => parseRelayMessage(JSON.stringify({
    type: 'register',
    clientVersion: '0.1.0',
    targetBaseUrl: 'http://127.0.0.1:8787',
    authToken: 'clrt_1234567890abcdef12345678',
    supportsStreaming: 'yes',
  })), /invalid_register_message/);
  assert.throws(() => parseRelayMessage(JSON.stringify({
    type: 'register',
    clientVersion: '0.1.0',
    targetBaseUrl: 'http://127.0.0.1:8787',
    authToken: 'clrt_short',
  })), /invalid_register_message/);
  assert.throws(() => parseRelayMessage('not-json'), /Unexpected token|JSON/);
});
