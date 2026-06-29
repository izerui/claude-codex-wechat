import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('relay-server CLI starts, answers /healthz, and shuts down on SIGTERM', async () => {
  const binPath = fileURLToPath(new URL('../bin/relay-server.mjs', import.meta.url));
  const child = spawn(process.execPath, [binPath], {
    env: {
      ...process.env,
      RELAY_PORT: '0',
      RELAY_BASE_DOMAIN: 'style520.com',
      RELAY_AUTH_TOKEN: 'clrt_1234567890abcdef12345678',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });

  const line = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay_server_start_timeout')), 5000);
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      const match = text.match(/relay-server listening on 0\.0\.0\.0:(\d+)/);
      if (!match?.[1]) return;
      clearTimeout(timer);
      resolve(match[1]);
    });
    child.on('error', reject);
  });

  const health = await fetch(`http://127.0.0.1:${line}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  child.kill('SIGTERM');
  const [code, signal] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.equal(signal, null);
});
