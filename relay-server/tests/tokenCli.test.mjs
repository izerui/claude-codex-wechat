import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('relay-server-token CLI prints a token', () => {
  const binPath = fileURLToPath(new URL('../bin/relay-server-token.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [binPath], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^clrt_[a-z0-9]{24}$/);
});

test('relay-server-token CLI appends a token to a file', () => {
  const binPath = fileURLToPath(new URL('../bin/relay-server-token.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'relay-token-cli-'));
  const filePath = join(dir, 'auth-tokens.txt');

  const result = spawnSync(process.execPath, [binPath, '--file', filePath], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const token = result.stdout.trim();
  assert.match(token, /^clrt_[a-z0-9]{24}$/);
  assert.equal(readFileSync(filePath, 'utf8'), `${token}\n`);
});
