import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startRelayServer } from '../src/server.mjs';

test('accepts agent registration and returns a random public URL', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authToken: 'relay-token',
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'relay-token',
        }));
      });
      ws.addEventListener('message', (raw) => {
        resolve(JSON.parse(String(raw.data)));
      });
      ws.addEventListener('error', reject);
    });

    assert.equal(registered.type, 'registered');
    assert.match(registered.token, /^[a-z0-9]{10,12}$/);
    assert.equal(registered.publicUrl, `https://style520.com/${registered.token}`);
    ws.close();
  } finally {
    await relay.close();
  }
});

test('routes a public HTTP request to the registered agent and returns its response', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authToken: 'relay-token',
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'relay-token',
        }));
      });
      ws.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      ws.addEventListener('error', reject);
    });

    ws.addEventListener('message', (raw) => {
      const payload = JSON.parse(String(raw.data));
      if (payload.type !== 'request') return;
      ws.send(JSON.stringify({
        type: 'response',
        requestId: payload.requestId,
        status: 200,
        headers: {
          'content-type': 'text/plain',
        },
        bodyBase64: Buffer.from('hello from agent').toString('base64'),
      }));
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}/api/status`,
        method: 'GET',
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(response.status, 200);
    assert.equal(response.text, 'hello from agent');
    ws.close();
  } finally {
    await relay.close();
  }
});
