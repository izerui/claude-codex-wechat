import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRelayConfig } from '../src/config.mjs';

test('loads relay server config from env', () => {
  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKEN: 'relay-token',
  });

  assert.deepEqual(config, {
    port: 9191,
    baseDomain: 'style520.com',
    authToken: 'relay-token',
  });
});

test('falls back to default port when RELAY_PORT is missing', () => {
  const config = loadRelayConfig({
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKEN: 'relay-token',
  });

  assert.equal(config.port, 8788);
});

test('throws when RELAY_BASE_DOMAIN is missing', () => {
  assert.throws(() => loadRelayConfig({
    RELAY_AUTH_TOKEN: 'relay-token',
  }), /RELAY_BASE_DOMAIN/);
});

test('throws when RELAY_AUTH_TOKEN is missing', () => {
  assert.throws(() => loadRelayConfig({
    RELAY_BASE_DOMAIN: 'style520.com',
  }), /RELAY_AUTH_TOKEN/);
});
