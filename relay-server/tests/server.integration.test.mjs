import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRelayServer } from '../src/server.mjs';

test('accepts agent registration and returns a random public URL', async () => {
  const relay = await startRelayServer({
    port: 0,
    relayServerUrl: 'wss://style520.com/agent',
    authTokens: ['relay-token'],
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
    assert.equal(registered.publicUrl, undefined);
    ws.close();
  } finally {
    await relay.close();
  }
});

test('routes a public HTTP request to the registered agent and returns its response', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
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

test('rewrites root-relative HTML asset URLs to keep the relay token prefix', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
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
    authTokens: ['relay-token'],
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
    authTokens: ['relay-token'],
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
          'content-type': 'text/css; charset=utf-8',
        },
        bodyBase64: Buffer.from(`@font-face { src: url("/fonts/dev.woff2") format("woff2"); }
.app { background-image: url('/images/bg.png'); }`).toString('base64'),
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
    ws.close();
  } finally {
    await relay.close();
  }
});

test('does not prefix ordinary css payload strings inside vite style modules', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
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
    authTokens: ['relay-token'],
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
    authTokens: ['relay-token-a', 'relay-token-b'],
  });

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const registered = await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: 'http://127.0.0.1:8787',
          authToken: 'relay-token-b',
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
    authTokens: ['relay-token'],
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

    const response = await fetch(`http://127.0.0.1:${relay.port}/connections`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.connections, [{
      connectionId: registered.connectionId,
      authToken: 'relay-token',
      publicUrl: payload.connections[0].publicUrl,
    }]);
    assert.match(payload.connections[0].publicUrl, /^https:\/\/style520\.com\/[a-z0-9]{10,12}$/);
    ws.close();
  } finally {
    await relay.close();
  }
});

test('disconnects an active relay connection by id', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
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
          authToken: 'relay-token',
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

test('serves the relay admin page', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
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
    assert.match(html, /复制接入码/);
    assert.match(html, /data-access-code/);
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

test('rejects unauthorized admin access when RELAY_ADMIN_TOKEN is configured', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
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
    authTokens: ['relay-token'],
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
    authTokens: ['relay-token'],
    authTokensFile,
    activationSecret: 'test-access-code-secret',
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
          authToken: 'relay-token',
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
      connectionId: registered.connectionId,
      authToken: 'relay-token',
      publicUrl: payload.connections[0].publicUrl,
    }]);
    assert.match(payload.connections[0].publicUrl, /^https:\/\/style520\.com\/[a-z0-9]{10,12}$/);
    ws.close();
  } finally {
    await relay.close();
    await rm(authTokensFile, { force: true });
  }
});

test('builds an access code for an assigned client instance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-admin-access-code-'));
  const authTokensFile = join(dir, 'auth-tokens.txt');
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
    authTokensFile,
    activationSecret: 'test-access-code-secret',
  });

  try {
    const tokenResponse = await fetch(`http://127.0.0.1:${relay.port}/admin/tokens`, {
      method: 'POST',
      headers: {
      },
    });
    const tokenPayload = await tokenResponse.json();

    const response = await fetch(`http://127.0.0.1:${relay.port}/admin/activation-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        authToken: tokenPayload.token,
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.activationCode, payload.accessCode);
    const signedEnvelope = JSON.parse(Buffer.from(payload.accessCode, 'base64url').toString('utf8'));
    const decoded = JSON.parse(Buffer.from(signedEnvelope.body, 'base64url').toString('utf8'));
    assert.equal(typeof signedEnvelope.signature, 'string');
    assert.deepEqual(decoded, {
      version: 1,
      serverUrl: 'wss://style520.com/agent',
      authToken: tokenPayload.token,
      expiresAt: decoded.expiresAt,
    });
    assert.equal(typeof decoded.expiresAt, 'number');
    assert.ok(decoded.expiresAt > Date.now());
  } finally {
    await relay.close();
    await rm(authTokensFile, { force: true });
  }
});

test('builds an access code and auto-assigns a token for an unassigned client instance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-admin-access-code-auto-'));
  const authTokensFile = join(dir, 'auth-tokens.txt');
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
    authTokensFile,
    activationSecret: 'test-access-code-secret',
  });

  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/admin/activation-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        authToken: 'relay-token',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.activationCode, payload.accessCode);
    const signedEnvelope = JSON.parse(Buffer.from(payload.accessCode, 'base64url').toString('utf8'));
    const decoded = JSON.parse(Buffer.from(signedEnvelope.body, 'base64url').toString('utf8'));
    assert.equal(decoded.authToken, 'relay-token');
    assert.equal(decoded.serverUrl, 'wss://style520.com/agent');
  } finally {
    await relay.close();
    await rm(authTokensFile, { force: true });
  }
});

test('builds an access code when the server input uses accessCodeSecret', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-admin-access-code-secret-'));
  const authTokensFile = join(dir, 'auth-tokens.txt');
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    authTokens: ['relay-token'],
    authTokensFile,
    accessCodeSecret: 'test-access-code-secret',
  });

  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/admin/activation-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        authToken: 'relay-token',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.activationCode, payload.accessCode);
    const signedEnvelope = JSON.parse(Buffer.from(payload.accessCode, 'base64url').toString('utf8'));
    const decoded = JSON.parse(Buffer.from(signedEnvelope.body, 'base64url').toString('utf8'));
    assert.equal(decoded.authToken, 'relay-token');
  } finally {
    await relay.close();
    await rm(authTokensFile, { force: true });
  }
});
