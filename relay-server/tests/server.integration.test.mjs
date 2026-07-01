import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRelayServer } from '../src/server.mjs';

test('accepts agent registration without requiring a public URL', async () => {
  const relay = await startRelayServer({
    port: 0,
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
        }));
      });
      ws.addEventListener('message', (raw) => {
        resolve(JSON.parse(String(raw.data)));
      });
      ws.addEventListener('error', reject);
    });

    assert.equal(registered.type, 'registered');
    assert.match(registered.token, /^[a-z0-9]{10,12}$/);
    assert.equal(registered.publicUrl, undefined);
    ws.close();
  } finally {
    await relay.close();
  }
});

test('routes a public HTTP request to the registered agent and returns its response', async () => {
  const relay = await startRelayServer({
    port: 0,
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
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

test('fails an in-flight public request promptly when the agent disconnects before replying', async () => {
  const relay = await startRelayServer({
    port: 0,
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
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
      ws.close();
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
      req.setTimeout(1000, () => reject(new Error('request_timed_out')));
      req.on('error', reject);
      req.end();
    });

    assert.equal(response.status, 502);
    assert.equal(response.text, 'agent_disconnected');
  } finally {
    await relay.close();
  }
});

test('times out a public request when the agent does not reply', async () => {
  const relay = await startRelayServer({
    port: 0,
    authTokens: ['clrt_1234567890abcdef12345678'],
    requestTimeoutMs: 50,
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
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
      req.setTimeout(1000, () => reject(new Error('request_timed_out')));
      req.on('error', reject);
      req.end();
    });

    assert.equal(response.status, 504);
    assert.equal(response.text, 'agent_timeout');
    ws.close();
  } finally {
    await relay.close();
  }
});

test('rewrites root-relative HTML asset URLs to keep the relay token prefix', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
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
          'content-type': 'text/html; charset=utf-8',
          'content-length': '999',
        },
        bodyBase64: Buffer.from(`<!doctype html>
<html>
  <head>
    <script type="module">import RefreshRuntime from "/@react-refresh";</script>
    <script type="module" src="/@vite/client"></script>
    <script type="module" src="/src/web/main.tsx"></script>
  </head>
  <body>
    <a href="/api/status">status</a>
  </body>
</html>`).toString('base64'),
      }));
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}`,
        method: 'GET',
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(response.status, 200);
    assert.match(response.text, new RegExp(`from "/${registered.token}/@react-refresh"`));
    assert.match(response.text, new RegExp(`src="/${registered.token}/@vite/client"`));
    assert.match(response.text, new RegExp(`src="/${registered.token}/src/web/main\\.tsx"`));
    assert.match(response.text, new RegExp(`href="/${registered.token}/api/status"`));
    assert.equal(response.headers['content-length'], String(Buffer.byteLength(response.text)));
    ws.close();
  } finally {
    await relay.close();
  }
});

test('rewrites root-relative module imports to keep the relay token prefix', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
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
          'content-type': 'application/javascript; charset=utf-8',
        },
        bodyBase64: Buffer.from(`import RefreshRuntime from "/@react-refresh";
import "/src/web/styles.css";
import { jsxDEV } from "/node_modules/vite/deps/react_jsx-dev-runtime.js?v=abc";
console.log(RefreshRuntime, jsxDEV);`).toString('base64'),
      }));
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}/src/web/main.tsx`,
        method: 'GET',
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(response.status, 200);
    assert.match(response.text, new RegExp(`from "/${registered.token}/@react-refresh"`));
    assert.match(response.text, new RegExp(`import "/${registered.token}/src/web/styles\\.css"`));
    assert.match(response.text, new RegExp(`from "/${registered.token}/node_modules/vite/deps/react_jsx-dev-runtime\\.js\\?v=abc"`));
    ws.close();
  } finally {
    await relay.close();
  }
});

test('rewrites root-relative CSS asset URLs to keep the relay token prefix', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
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
          'content-type': 'text/css; charset=utf-8',
        },
        bodyBase64: Buffer.from(`@font-face { src: url("/fonts/dev.woff2") format("woff2"); }
.app { background-image: url('/images/bg.png'); }
.icon { src: url(/assets/bootstrap-icons.woff2?abc) format("woff2"); }`).toString('base64'),
      }));
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}/src/web/styles.css`,
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
    assert.match(response.text, new RegExp(`url\\("/${registered.token}/fonts/dev\\.woff2"\\)`));
    assert.match(response.text, new RegExp(`url\\('/${registered.token}/images/bg\\.png'\\)`));
    assert.match(response.text, new RegExp(`url\\(/${registered.token}/assets/bootstrap-icons\\.woff2\\?abc\\)`));
    ws.close();
  } finally {
    await relay.close();
  }
});

test('does not prefix ordinary css payload strings inside vite style modules', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
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
          'content-type': 'application/javascript; charset=utf-8',
        },
        bodyBase64: Buffer.from(
          'import { createHotContext as __vite__createHotContext } from "/@vite/client";'
          + 'import.meta.hot = __vite__createHotContext("/src/web/styles.css");'
          + 'const __vite__id = "/Users/demo/project/src/web/styles.css";'
          + 'const __vite__css = "body{background:#fff}";',
        ).toString('base64'),
      }));
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}/src/web/styles.css`,
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
    assert.match(response.text, new RegExp(`from "/${registered.token}/@vite/client"`));
    assert.match(response.text, new RegExp(`createHotContext\\("/${registered.token}/src/web/styles\\.css"\\)`));
    assert.match(response.text, /const __vite__id = "\/Users\/demo\/project\/src\/web\/styles\.css";/);
    assert.match(response.text, /const __vite__css = "body\{background:#fff\}";/);
    ws.close();
  } finally {
    await relay.close();
  }
});

test('rewrites font urls inside vite css payload strings without rewriting unrelated js strings', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
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
          'content-type': 'application/javascript; charset=utf-8',
        },
        bodyBase64: Buffer.from(
          'import { createHotContext as __vite__createHotContext } from "/@vite/client";'
          + 'const __vite__css = "@font-face{src:url(\\"/node_modules/pkg/font.woff2?abc\\") format(\\"woff2\\");}";'
          + 'const note = "keep-this-string";',
        ).toString('base64'),
      }));
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}/node_modules/pkg/style.css`,
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
    assert.match(response.text, /url\(\\"\/[a-z0-9]{10,12}\/node_modules\/pkg\/font\.woff2\?abc\\\"\)/);
    assert.match(response.text, /const note = "keep-this-string";/);
    ws.close();
  } finally {
    await relay.close();
  }
});

test('accepts registration when auth token is in the whitelist', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_aaaaaaaaaaaaaaaaaaaaaaaa', 'clrt_bbbbbbbbbbbbbbbbbbbbbbbb'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_bbbbbbbbbbbbbbbbbbbbbbbb',
        }));
      });
      ws.addEventListener('message', (raw) => {
        resolve(JSON.parse(String(raw.data)));
      });
      ws.addEventListener('error', reject);
    });

    assert.equal(registered.type, 'registered');
    ws.close();
  } finally {
    await relay.close();
  }
});

test('lists active relay connections with client instance metadata', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
        }));
      });
      ws.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      ws.addEventListener('error', reject);
    });

    const response = await fetch(`http://127.0.0.1:${relay.port}/connections`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.connections, [{
      authToken: 'clrt_1234567890abcdef12345678',
      publicUrl: payload.connections[0].publicUrl,
    }]);
    assert.match(payload.connections[0].publicUrl, new RegExp(`^http://127\\.0\\.0\\.1:${relay.port}/[a-z0-9]{10,12}$`));
    ws.close();
  } finally {
    await relay.close();
  }
});

test('disconnects an active relay connection by id', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const closePromise = new Promise((resolve) => {
      ws.addEventListener('close', () => resolve(undefined));
    });
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
        }));
      });
      ws.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      ws.addEventListener('error', reject);
    });

    const response = await fetch(`http://127.0.0.1:${relay.port}/connections/${registered.connectionId}/disconnect`, {
      method: 'POST',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true });
    await closePromise;

    await new Promise((resolve) => setTimeout(resolve, 20));
    const statusResponse = await fetch(`http://127.0.0.1:${relay.port}/connections`);
    const statusPayload = await statusResponse.json();
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(statusPayload.connections, []);
  } finally {
    await relay.close();
  }
});

test('disconnects an active relay connection by auth token', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const closePromise = new Promise((resolve) => {
      ws.addEventListener('close', () => resolve(undefined));
    });
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
        }));
      });
      ws.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      ws.addEventListener('error', reject);
    });

    const response = await fetch(`http://127.0.0.1:${relay.port}/connections/auth-token/${encodeURIComponent('clrt_1234567890abcdef12345678')}/disconnect`, {
      method: 'POST',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true });
    await closePromise;
  } finally {
    await relay.close();
  }
});

test('a second agent registration with the same auth token takes over the first', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws1 = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const ws1Closed = new Promise((resolve) => {
      ws1.addEventListener('close', () => resolve(undefined));
    });
    await new Promise((resolve, reject) => {
      ws1.addEventListener('open', () => {
        ws1.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
        }));
      });
      ws1.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      ws1.addEventListener('error', reject);
    });

    const ws2 = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const takeover = await new Promise((resolve, reject) => {
      ws2.addEventListener('open', () => {
        ws2.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
        }));
      });
      ws2.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
        if (payload.type === 'error') reject(new Error(payload.error));
      });
      ws2.addEventListener('error', reject);
    });

    assert.equal(takeover.type, 'registered');
    // The stale first connection is evicted by the takeover.
    await ws1Closed;

    const response = await fetch(`http://127.0.0.1:${relay.port}/connections`);
    const payload = await response.json();
    assert.equal(payload.connections.length, 1);
    assert.equal(payload.connections[0].authToken, 'clrt_1234567890abcdef12345678');

    ws2.close();
  } finally {
    await relay.close();
  }
});

test('serves the relay admin page', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/admin`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(html, /relay-server 管理后台/);
    assert.match(html, /输入管理令牌后进入后台/);
    assert.match(html, /管理令牌/);
    assert.match(html, /当前没有在线客户端/);
    assert.match(html, /在线连接/);
    assert.match(html, /data-auth-token/);
    assert.doesNotMatch(html, /分配 token/);
    assert.doesNotMatch(html, /激活码/);
    assert.doesNotMatch(html, /data-activation-code/);
    assert.doesNotMatch(html, /回源地址/);
    assert.doesNotMatch(html, /连接时间/);
    assert.doesNotMatch(html, /最近活动/);
    assert.doesNotMatch(html, /刷新/);
  } finally {
    await relay.close();
  }
});

test('rejects invalid websocket registration payloads without crashing the relay', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const badWs = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    await new Promise((resolve, reject) => {
      badWs.addEventListener('open', () => {
        badWs.send('{bad json');
      });
      badWs.addEventListener('close', () => resolve(undefined));
      badWs.addEventListener('error', reject);
    });

    const healthResponse = await fetch(`http://127.0.0.1:${relay.port}/healthz`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(healthPayload, { ok: true });

    const goodWs = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      goodWs.addEventListener('open', () => {
        goodWs.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
        }));
      });
      goodWs.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      goodWs.addEventListener('error', reject);
    });

    assert.equal(registered.type, 'registered');
    goodWs.close();
  } finally {
    await relay.close();
  }
});

test('rejects unauthorized admin access when RELAY_ADMIN_TOKEN is configured', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
    adminToken: 'relay-admin-secret',
  });

  try {
    const pageResponse = await fetch(`http://127.0.0.1:${relay.port}/admin`);
    const pageHtml = await pageResponse.text();
    assert.equal(pageResponse.status, 200);
    assert.match(pageHtml, /输入管理令牌后进入后台/);

    const listResponse = await fetch(`http://127.0.0.1:${relay.port}/connections`);
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 401);
    assert.deepEqual(listPayload, { ok: false, error: 'admin_unauthorized' });

    const authorizedResponse = await fetch(`http://127.0.0.1:${relay.port}/admin`, {
      headers: {
        Authorization: 'Bearer relay-admin-secret',
      },
    });
    assert.equal(authorizedResponse.status, 200);
  } finally {
    await relay.close();
  }
});

test('generates and appends a client token through the admin API when RELAY_AUTH_TOKENS_FILE is configured', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-admin-token-'));
  const authTokensFile = join(dir, 'auth-tokens.txt');
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
    authTokensFile,
  });

  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/admin/tokens`, {
      method: 'POST',
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.match(payload.token, /^clrt_[a-z0-9]{24}$/);
    assert.equal(typeof payload.totalTokens, 'number');
    const fileContent = await readFile(authTokensFile, 'utf8');
    assert.match(fileContent, new RegExp(payload.token));
  } finally {
    await relay.close();
    await rm(authTokensFile, { force: true });
  }
});

test('returns only panel fields from /connections after a token is assigned', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-admin-assign-'));
  const authTokensFile = join(dir, 'auth-tokens.txt');
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
    authTokensFile,
  });

  try {
    const tokenResponse = await fetch(`http://127.0.0.1:${relay.port}/admin/tokens`, {
      method: 'POST',
      headers: {
      },
    });
    const tokenPayload = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200);
    assert.match(tokenPayload.token, /^clrt_[a-z0-9]{24}$/);

    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
        }));
      });
      ws.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      ws.addEventListener('error', reject);
    });

    const response = await fetch(`http://127.0.0.1:${relay.port}/connections`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.connections, [{
      authToken: 'clrt_1234567890abcdef12345678',
      publicUrl: payload.connections[0].publicUrl,
    }]);
    assert.match(payload.connections[0].publicUrl, new RegExp(`^http://127\\.0\\.0\\.1:${relay.port}/[a-z0-9]{10,12}$`));
    ws.close();
  } finally {
    await relay.close();
    await rm(authTokensFile, { force: true });
  }
});

test('advertises streaming support in the registered handshake', async () => {
  const relay = await startRelayServer({
    port: 0,
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
          supportsStreaming: true,
        }));
      });
      ws.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      ws.addEventListener('error', reject);
    });

    assert.equal(registered.type, 'registered');
    assert.equal(registered.streaming, true);
    ws.close();
  } finally {
    await relay.close();
  }
});

test('streams a non-rewritten response chunk to the client before the stream ends (SSE never buffers)', async () => {
  // 请求超时设得很短:若走缓冲(等整个响应体),无限流会被判 agent_timeout。
  // 流式透传下首字节 response-start 应取消超时,chunk 立即抵达浏览器。
  const relay = await startRelayServer({
    port: 0,
    authTokens: ['clrt_1234567890abcdef12345678'],
    requestTimeoutMs: 100,
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
          supportsStreaming: true,
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
      // 模拟无限 SSE 流:发头 + 一块事件,但故意不发 response-end。
      ws.send(JSON.stringify({
        type: 'response-start',
        requestId: payload.requestId,
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }));
      ws.send(JSON.stringify({
        type: 'response-chunk',
        requestId: payload.requestId,
        chunkBase64: Buffer.from('event: hello\n\n').toString('base64'),
      }));
    });

    const firstChunk = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}/api/bridge-events`,
        method: 'GET',
      }, (res) => {
        assert.equal(res.statusCode, 200);
        res.on('data', (chunk) => resolve(Buffer.from(chunk).toString('utf8')));
      });
      req.setTimeout(1000, () => reject(new Error('request_timed_out')));
      req.on('error', reject);
      req.end();
    });

    assert.equal(firstChunk, 'event: hello\n\n');
    ws.close();
  } finally {
    await relay.close();
  }
});

test('reassembles a chunked html response and still rewrites root-relative URLs', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
          supportsStreaming: true,
        }));
      });
      ws.addEventListener('message', (raw) => {
        const payload = JSON.parse(String(raw.data));
        if (payload.type === 'registered') resolve(payload);
      });
      ws.addEventListener('error', reject);
    });

    const html = '<!doctype html>\n<a href="/api/status">status</a>\n<script src="/@vite/client"></script>';
    const half = Math.floor(html.length / 2);
    ws.addEventListener('message', (raw) => {
      const payload = JSON.parse(String(raw.data));
      if (payload.type !== 'request') return;
      ws.send(JSON.stringify({
        type: 'response-start',
        requestId: payload.requestId,
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }));
      ws.send(JSON.stringify({
        type: 'response-chunk',
        requestId: payload.requestId,
        chunkBase64: Buffer.from(html.slice(0, half)).toString('base64'),
      }));
      ws.send(JSON.stringify({
        type: 'response-chunk',
        requestId: payload.requestId,
        chunkBase64: Buffer.from(html.slice(half)).toString('base64'),
      }));
      ws.send(JSON.stringify({ type: 'response-end', requestId: payload.requestId }));
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}`,
        method: 'GET',
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(response.status, 200);
    assert.match(response.text, new RegExp(`href="/${registered.token}/api/status"`));
    assert.match(response.text, new RegExp(`src="/${registered.token}/@vite/client"`));
    assert.equal(response.headers['content-length'], String(Buffer.byteLength(response.text)));
    ws.close();
  } finally {
    await relay.close();
  }
});

test('ends a streaming response cleanly when the agent disconnects mid-stream', async () => {
  const relay = await startRelayServer({
    port: 0,
    authTokens: ['clrt_1234567890abcdef12345678'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'clrt_1234567890abcdef12345678',
          supportsStreaming: true,
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
        type: 'response-start',
        requestId: payload.requestId,
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }));
      ws.send(JSON.stringify({
        type: 'response-chunk',
        requestId: payload.requestId,
        chunkBase64: Buffer.from('partial').toString('base64'),
      }));
      // 发完首块立即断开,模拟 agent 中途掉线。
      setTimeout(() => ws.close(), 20);
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: relay.port,
        path: `/${registered.token}/api/bridge-events`,
        method: 'GET',
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({
          status: res.statusCode,
          text: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      req.setTimeout(1000, () => reject(new Error('request_timed_out')));
      req.on('error', reject);
      req.end();
    });

    assert.equal(response.status, 200);
    // 头已发,断开时干净收尾——已收到的内容原样保留,不追加 agent_disconnected。
    assert.equal(response.text, 'partial');
  } finally {
    await relay.close();
  }
});
