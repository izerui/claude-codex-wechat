import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket as WsClient } from 'ws';
import { startRelayServer } from '../src/server.mjs';

const AUTH_TOKEN = 'clrt_1234567890abcdef12345678';

function registerAgent(port, { authToken = AUTH_TOKEN } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`);
  const registered = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'register',
        clientVersion: '0.1.0',
        targetBaseUrl: 'http://127.0.0.1:8787',
        authToken,
      }));
    });
    ws.addEventListener('message', (raw) => {
      const payload = JSON.parse(String(raw.data));
      if (payload.type === 'registered') resolve({ ws, payload });
      if (payload.type === 'error') reject(new Error(payload.error));
    });
    ws.addEventListener('error', reject);
  });
  return registered;
}

test('a reconnecting agent with the same auth token takes over the stale registration', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: [AUTH_TOKEN],
  });

  try {
    // First connection registers and holds the deterministic public token.
    const first = await registerAgent(relay.port);
    const firstClosed = new Promise((resolve) => {
      first.ws.addEventListener('close', () => resolve(undefined));
    });

    // A second connection with the SAME auth token arrives while the first is
    // still registered server-side (simulating a half-open stale entry that was
    // never released). The newcomer must take over, not be rejected.
    const second = await registerAgent(relay.port);

    assert.equal(second.payload.type, 'registered');
    // The public token is deterministic per auth token, so the address survives
    // the takeover and stays stable for the user.
    assert.equal(second.payload.token, first.payload.token);

    // The stale first socket is evicted.
    await firstClosed;

    // Exactly one live connection remains, and routing still works through it.
    const response = await fetch(`http://127.0.0.1:${relay.port}/connections`);
    const payload = await response.json();
    assert.equal(payload.connections.length, 1);
    assert.equal(payload.connections[0].authToken, AUTH_TOKEN);

    second.ws.close();
  } finally {
    await relay.close();
  }
});

test('the relay server sends websocket pings to keep idle agent connections alive', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: [AUTH_TOKEN],
    heartbeatIntervalMs: 40,
  });

  try {
    // Use the ws client (not the global WebSocket) because it surfaces the
    // protocol-level ping frames that the global/undici client swallows.
    const ws = new WsClient(`ws://127.0.0.1:${relay.port}/agent`);
    const pinged = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no_ping_within_window')), 1000);
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: AUTH_TOKEN,
        }));
      });
      ws.on('ping', () => {
        clearTimeout(timer);
        resolve(undefined);
      });
      ws.on('error', reject);
    });

    await pinged;
    ws.close();
  } finally {
    await relay.close();
  }
});

test('the relay server terminates an agent that stops answering pings and frees its auth token', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: [AUTH_TOKEN],
    heartbeatIntervalMs: 40,
  });

  try {
    const ws = new WsClient(`ws://127.0.0.1:${relay.port}/agent`);
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: AUTH_TOKEN,
        }));
      });
      ws.on('message', (raw) => {
        const payload = JSON.parse(String(raw));
        if (payload.type === 'registered') resolve(undefined);
      });
      ws.on('error', reject);
    });

    // Go silent at the socket level: the client stops reading, so it never
    // answers the server's pings. The server must notice and terminate it.
    ws.pause();

    const freed = await new Promise((resolve) => {
      const deadline = Date.now() + 2000;
      const poll = setInterval(async () => {
        const response = await fetch(`http://127.0.0.1:${relay.port}/connections`);
        const payload = await response.json();
        if (payload.connections.length === 0) {
          clearInterval(poll);
          resolve(true);
        } else if (Date.now() > deadline) {
          clearInterval(poll);
          resolve(false);
        }
      }, 40);
    });

    assert.equal(freed, true);
    ws.terminate();
  } finally {
    await relay.close();
  }
});
