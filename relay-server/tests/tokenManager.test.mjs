import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendTokenToFile, createClientToken } from '../src/tokenManager.mjs';

test('creates a client token with the expected prefix and length', () => {
  const token = createClientToken();

  assert.match(token, /^clrt_[a-z0-9]{24}$/);
});

test('appends a generated token to a whitelist file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-token-manager-'));
  const filePath = join(dir, 'auth-tokens.txt');
  const token = 'clrt_abcdefghijklmnopqrstuvwxyz'.slice(0, 29);

  const result = appendTokenToFile({ filePath, token });

  assert.equal(result.created, true);
  assert.equal(result.added, true);
  assert.equal(result.tokens.length, 1);
  assert.equal(result.tokens[0], token);
  assert.equal(readFileSync(filePath, 'utf8'), `${token}\n`);
});

test('does not append a duplicate token twice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-token-manager-dup-'));
  const filePath = join(dir, 'auth-tokens.txt');
  const token = 'clrt_abcdefghijklmnopqrstuvwxyz'.slice(0, 29);

  const first = appendTokenToFile({ filePath, token });
  const second = appendTokenToFile({ filePath, token });

  assert.equal(first.added, true);
  assert.equal(second.created, false);
  assert.equal(second.added, false);
  assert.deepEqual(second.tokens, [token]);
  assert.equal(readFileSync(filePath, 'utf8'), `${token}\n`);
});
