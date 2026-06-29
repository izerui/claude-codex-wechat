import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRelayConfig } from '../src/config.mjs';

// These assertions intentionally use the public compatibility key `activationSecret`.
test('loads relay server config from env', () => {
  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
  });

  assert.deepEqual(config, {
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['clrt_1234567890abcdef12345678'],
    authTokensFile: undefined,
    activationSecret: undefined,
    adminToken: undefined,
  });
});

test('allows missing RELAY_BASE_DOMAIN when RELAY_SERVER_URL is provided', () => {
  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_SERVER_URL: 'wss://wechat.style520.com/agent',
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
  });

  assert.deepEqual(config, {
    port: 9191,
    baseDomain: '',
    relayServerUrl: 'wss://wechat.style520.com/agent',
    authTokens: ['clrt_1234567890abcdef12345678'],
    authTokensFile: undefined,
    activationSecret: undefined,
    adminToken: undefined,
  });
});

test('loads relay server config from RELAY_AUTH_TOKENS', () => {
  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKENS: 'relay-token-a, relay-token-b ,, relay-token-c',
  });

  assert.deepEqual(config, {
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['clrt_aaaaaaaaaaaaaaaaaaaaaaaa', 'clrt_bbbbbbbbbbbbbbbbbbbbbbbb', 'relay-token-c'],
    authTokensFile: undefined,
    activationSecret: undefined,
    adminToken: undefined,
  });
});

test('keeps RELAY_ACTIVATION_SECRET on the public activationSecret config key', () => {
  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
    RELAY_ACTIVATION_SECRET: 'compat-secret',
  });

  assert.deepEqual(config, {
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['clrt_1234567890abcdef12345678'],
    authTokensFile: undefined,
    activationSecret: 'compat-secret',
    adminToken: undefined,
  });
});

test('loads relay server config from RELAY_AUTH_TOKENS_FILE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-auth-file-'));
  const tokenFile = join(dir, 'tokens.txt');
  writeFileSync(tokenFile, '\nrelay-token-a\nrelay-token-b\n\nrelay-token-c\n');

  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKENS_FILE: tokenFile,
  });

  assert.deepEqual(config, {
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['clrt_aaaaaaaaaaaaaaaaaaaaaaaa', 'clrt_bbbbbbbbbbbbbbbbbbbbbbbb', 'relay-token-c'],
    authTokensFile: tokenFile,
    activationSecret: undefined,
    adminToken: undefined,
  });
});

test('prefers RELAY_AUTH_TOKENS_FILE over inline env tokens', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-auth-file-priority-'));
  const tokenFile = join(dir, 'tokens.txt');
  writeFileSync(tokenFile, 'file-token-a\nfile-token-b\n');

  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKENS_FILE: tokenFile,
    RELAY_AUTH_TOKENS: 'env-token-a,env-token-b',
    RELAY_AUTH_TOKEN: 'env-single-token',
  });

  assert.deepEqual(config, {
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['clrt_cccccccccccccccccccccccc', 'clrt_dddddddddddddddddddddddd'],
    authTokensFile: tokenFile,
    activationSecret: undefined,
    adminToken: undefined,
  });
});

test('falls back to default port when RELAY_PORT is missing', () => {
  const config = loadRelayConfig({
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
  });

  assert.equal(config.port, 8788);
});

test('throws when RELAY_BASE_DOMAIN is missing', () => {
  assert.throws(() => loadRelayConfig({
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
  }), /RELAY_BASE_DOMAIN|RELAY_SERVER_URL/);
});

test('allows missing RELAY_AUTH_TOKEN during the current open relay phase', () => {
  const config = loadRelayConfig({
    RELAY_BASE_DOMAIN: 'style520.com',
  });

  assert.deepEqual(config, {
    port: 8788,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: [],
    authTokensFile: undefined,
    activationSecret: undefined,
    adminToken: undefined,
  });
});
