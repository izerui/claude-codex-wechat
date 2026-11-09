import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRelayConfig } from '../src/config.mjs';

test('loads relay server config from env', () => {
  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
  });

  assert.deepEqual(config, {
    host: '0.0.0.0',
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['clrt_1234567890abcdef12345678'],
    authTokensFile: undefined,
    wechatOnly: true,
  });
});

test('RELAY_WECHAT_ONLY 显式关闭时放开给任意浏览器', () => {
  for (const value of ['0', 'false', 'OFF', 'no']) {
    assert.equal(loadRelayConfig({ RELAY_WECHAT_ONLY: value }).wechatOnly, false);
  }
  assert.equal(loadRelayConfig({ RELAY_WECHAT_ONLY: '1' }).wechatOnly, true);
});

test('allows missing RELAY_BASE_DOMAIN when RELAY_SERVER_URL is provided', () => {
  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_SERVER_URL: 'wss://wechat.style520.com/agent',
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
  });

  assert.deepEqual(config, {
    host: '0.0.0.0',
    port: 9191,
    baseDomain: '',
    relayServerUrl: 'wss://wechat.style520.com/agent',
    authTokens: ['clrt_1234567890abcdef12345678'],
    authTokensFile: undefined,
    wechatOnly: true,
  });
});

test('loads relay server config from RELAY_AUTH_TOKENS', () => {
  const config = loadRelayConfig({
    RELAY_PORT: '9191',
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKENS: 'relay-token-a, relay-token-b ,, relay-token-c',
  });

  assert.deepEqual(config, {
    host: '0.0.0.0',
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['relay-token-a', 'relay-token-b', 'relay-token-c'],
    authTokensFile: undefined,
    wechatOnly: true,
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
    host: '0.0.0.0',
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['relay-token-a', 'relay-token-b', 'relay-token-c'],
    authTokensFile: tokenFile,
    wechatOnly: true,
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
    host: '0.0.0.0',
    port: 9191,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: ['file-token-a', 'file-token-b'],
    authTokensFile: tokenFile,
    wechatOnly: true,
  });
});

test('falls back to default port when RELAY_PORT is missing', () => {
  const config = loadRelayConfig({
    RELAY_BASE_DOMAIN: 'style520.com',
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
  });

  assert.equal(config.port, 8788);
  assert.equal(config.host, '0.0.0.0');
});

test('allows startup config without RELAY_BASE_DOMAIN or RELAY_SERVER_URL', () => {
  const config = loadRelayConfig({
    RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
  });
  assert.deepEqual(config, {
    host: '0.0.0.0',
    port: 8788,
    baseDomain: '',
    relayServerUrl: undefined,
    authTokens: ['clrt_1234567890abcdef12345678'],
    authTokensFile: undefined,
    wechatOnly: true,
  });
});

test('allows missing RELAY_AUTH_TOKEN during the current open relay phase', () => {
  const config = loadRelayConfig({
    RELAY_BASE_DOMAIN: 'style520.com',
  });

  assert.deepEqual(config, {
    host: '0.0.0.0',
    port: 8788,
    baseDomain: 'style520.com',
    relayServerUrl: undefined,
    authTokens: [],
    authTokensFile: undefined,
    wechatOnly: true,
  });
});
