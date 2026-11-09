import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { derivePublicBase, renderPageTokenScript, startRelayServer } from '../src/server.mjs';

const AUTH_TOKEN = 'clrt_1234567890abcdef12345678';
const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800322d) NetType/WIFI Language/zh_CN';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
// 测试从 127.0.0.1 发请求；带上代理头模拟经 ingress 进来的公网请求，否则会被当成本机直连放行。
const PUBLIC = { 'user-agent': WECHAT_UA, 'x-forwarded-for': '203.0.113.7' };
const HTML = '<!doctype html><html><head><title>console</title></head><body>hi</body></html>';

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor_timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function registerAgent(port, responseHeaders = { 'content-type': 'text/html; charset=utf-8' }, body = HTML) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`);
  const registered = [];
  const requests = [];
  ws.addEventListener('message', (raw) => {
    const payload = JSON.parse(String(raw.data));
    if (payload.type === 'registered') registered.push(payload);
    if (payload.type !== 'request') return;
    requests.push(payload);
    ws.send(JSON.stringify({
      type: 'response',
      requestId: payload.requestId,
      status: 200,
      headers: responseHeaders,
      bodyBase64: Buffer.from(body).toString('base64'),
    }));
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'register', clientVersion: '0.1.0', targetBaseUrl: 'http://127.0.0.1:8787', authToken: AUTH_TOKEN }));
      resolve(undefined);
    });
    ws.addEventListener('error', reject);
  });
  await waitFor(() => registered.length > 0);
  return { ws, registered, requests, token: registered[0].token };
}

async function startWithAgent(options = {}) {
  const { agentResponseHeaders, agentBody, ...relayOptions } = options;
  const relay = await startRelayServer({
    port: 0,
    wechatOnly: true,
    ticketAuth: true,
    publicBaseUrl: 'https://wechat.example.com',
    ...relayOptions,
  });
  const agent = await registerAgent(relay.port, agentResponseHeaders, agentBody);
  return { relay, ...agent };
}

function ticketOf(registered) {
  return new URL(registered.publicUrl).searchParams.get('ticket');
}

function pageTokenOf(html) {
  return html.match(/var T="([A-Za-z0-9_-]{43})"/)?.[1] ?? null;
}

async function redeem(relay, token, ticket, extraHeaders = {}) {
  return fetch(`http://127.0.0.1:${relay.port}/${token}/?ticket=${ticket}`, { headers: { ...PUBLIC, ...extraHeaders } });
}

async function enter(relay, token, registered) {
  const response = await redeem(relay, token, ticketOf(registered.at(-1)));
  assert.equal(response.status, 200);
  const pageToken = pageTokenOf(await response.text());
  assert.ok(pageToken);
  return pageToken;
}

test('registered carries a publicUrl with an 8-char ticket', async () => {
  const { relay, ws, registered } = await startWithAgent();
  try {
    assert.match(registered[0].publicUrl, /^https:\/\/wechat\.example\.com\/[a-z0-9]{10,12}\/\?ticket=[a-z0-9]{8}$/);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('tunnel request without ticket or page token is 403', async () => {
  const { relay, ws, token, requests } = await startWithAgent();
  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: PUBLIC });
    assert.equal(response.status, 403);
    assert.match(await response.text(), /无权限访问/);
    assert.equal(requests.length, 0);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('redeeming a ticket injects a page token script, sets no cookie and pushes a new ticket', async () => {
  const { relay, ws, token, registered, requests } = await startWithAgent();
  try {
    const ticket = ticketOf(registered[0]);
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/?ticket=${ticket}&x=1`, { headers: PUBLIC });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /^<!doctype html><html><head><script>/);
    assert.ok(html.includes('<title>console</title>'));
    assert.ok(pageTokenOf(html));
    assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(html));
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(requests[0].path, '/?x=1');
    await waitFor(() => registered.length === 2);
    assert.notEqual(ticketOf(registered[1]), ticket);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('ticket is strictly one-time and refresh needs a new ticket', async () => {
  const { relay, ws, token, registered } = await startWithAgent();
  try {
    const ticket = ticketOf(registered[0]);
    assert.equal((await redeem(relay, token, ticket)).status, 200);
    assert.equal((await redeem(relay, token, ticket)).status, 403);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('page token in header or __rpt param is accepted and stripped before forwarding', async () => {
  const { relay, ws, token, registered, requests } = await startWithAgent();
  try {
    const pageToken = await enter(relay, token, registered);
    const viaHeader = await fetch(`http://127.0.0.1:${relay.port}/${token}/api/status`, {
      headers: { ...PUBLIC, 'x-relay-page-token': pageToken },
    });
    assert.equal(viaHeader.status, 200);
    assert.equal(requests.at(-1).path, '/api/status');
    assert.equal(requests.at(-1).headers['x-relay-page-token'], undefined);

    const viaParam = await fetch(`http://127.0.0.1:${relay.port}/${token}/api/events?a=1&__rpt=${pageToken}`, { headers: PUBLIC });
    assert.equal(viaParam.status, 200);
    assert.equal(requests.at(-1).path, '/api/events?a=1');
  } finally {
    ws.close();
    await relay.close();
  }
});

test('a page token never authorizes another suffix', async () => {
  const relay = await startRelayServer({ port: 0, wechatOnly: true, ticketAuth: true, publicBaseUrl: 'https://wechat.example.com' });
  try {
    const victim = await registerAgent(relay.port);
    const attackerWs = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    const attackerRegistered = [];
    attackerWs.addEventListener('message', (raw) => {
      const payload = JSON.parse(String(raw.data));
      if (payload.type === 'registered') attackerRegistered.push(payload);
      if (payload.type === 'request') {
        attackerWs.send(JSON.stringify({ type: 'response', requestId: payload.requestId, status: 200, headers: { 'content-type': 'text/html' }, bodyBase64: Buffer.from(HTML).toString('base64') }));
      }
    });
    await new Promise((resolve) => attackerWs.addEventListener('open', resolve));
    attackerWs.send(JSON.stringify({ type: 'register', clientVersion: '0.1.0', targetBaseUrl: 'http://x', authToken: 'clrt_ffffffffffffffffffffffff' }));
    await waitFor(() => attackerRegistered.length > 0);
    const attackerToken = await enter(relay, attackerRegistered[0].token, attackerRegistered);

    const response = await fetch(`http://127.0.0.1:${relay.port}/${victim.token}/api/status`, {
      headers: { ...PUBLIC, 'x-relay-page-token': attackerToken },
    });
    assert.equal(response.status, 403);
    assert.equal(victim.requests.length, 0);
    attackerWs.close();
    victim.ws.close();
  } finally {
    await relay.close();
  }
});

test('static subresources load without a token but /api/ does not', async () => {
  const { relay, ws, token } = await startWithAgent();
  try {
    const asset = (path, dest) => fetch(`http://127.0.0.1:${relay.port}/${token}${path}`, { headers: { ...PUBLIC, 'sec-fetch-dest': dest } });
    for (const dest of ['script', 'style', 'image', 'font', 'manifest']) {
      assert.equal((await asset('/assets/index.js', dest)).status, 200, dest);
    }
    assert.equal((await asset('/api/fs/list', 'script')).status, 403);
    assert.equal((await asset('/assets/index.js', 'empty')).status, 403);
    assert.equal((await asset('/assets/index.js', 'document')).status, 403);
    assert.equal((await asset('/assets/sw.js', 'serviceworker')).status, 403);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('agent cannot widen a service worker scope', async () => {
  const { relay, ws, token } = await startWithAgent({
    agentResponseHeaders: { 'content-type': 'text/javascript', 'Service-Worker-Allowed': '/' },
    agentBody: 'self.addEventListener("fetch", () => {});',
  });
  try {
    // 本机直连不需要令牌，直接看 relay 写回的响应头。
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/sw.js`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('service-worker-allowed'), null);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('agent response headers cannot drop no-store on redemption', async () => {
  const { relay, ws, token, registered } = await startWithAgent({
    agentResponseHeaders: { 'content-type': 'text/html', 'cache-control': 'public, max-age=0', 'set-cookie': 'foo=bar; Path=/' },
  });
  try {
    const response = await redeem(relay, token, ticketOf(registered[0]));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.deepEqual(response.headers.getSetCookie(), ['foo=bar; Path=/']);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('page token expires after seven days', async () => {
  let clock = 1_000;
  const { relay, ws, token, registered } = await startWithAgent({ ticketAuthOptions: { now: () => clock } });
  try {
    const pageToken = await enter(relay, token, registered);
    const call = () => fetch(`http://127.0.0.1:${relay.port}/${token}/api/status`, { headers: { ...PUBLIC, 'x-relay-page-token': pageToken } });
    clock += 604_800_000 - 1;
    assert.equal((await call()).status, 200);
    clock += 2;
    assert.equal((await call()).status, 403);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('expired ticket is reissued and pushed', async () => {
  let clock = 1_000;
  const { relay, ws, token, registered } = await startWithAgent({ ticketAuthOptions: { now: () => clock } });
  try {
    const ticket = ticketOf(registered[0]);
    clock += 86_400_001;
    relay.refreshExpiredTickets();
    await waitFor(() => registered.length === 2);
    assert.notEqual(ticketOf(registered[1]), ticket);
    assert.equal((await redeem(relay, token, ticket)).status, 403);
    assert.equal((await redeem(relay, token, ticketOf(registered[1]))).status, 200);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('non-wechat request does not consume ticket', async () => {
  const { relay, ws, token, registered } = await startWithAgent();
  try {
    const ticket = ticketOf(registered[0]);
    assert.equal((await redeem(relay, token, ticket, { 'user-agent': SAFARI_UA })).status, 403);
    assert.equal((await redeem(relay, token, ticket)).status, 200);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('only GET can redeem a ticket', async () => {
  const { relay, ws, token, registered } = await startWithAgent();
  try {
    const ticket = ticketOf(registered[0]);
    const post = await fetch(`http://127.0.0.1:${relay.port}/${token}/?ticket=${ticket}`, { method: 'POST', headers: PUBLIC, body: 'x' });
    assert.equal(post.status, 403);
    assert.equal((await redeem(relay, token, ticket)).status, 200);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('ticket on suffix root without trailing slash', async () => {
  const { relay, ws, token, registered, requests } = await startWithAgent();
  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}?ticket=${ticketOf(registered[0])}`, { headers: PUBLIC });
    assert.equal(response.status, 200);
    assert.equal(requests[0].path, '/');
  } finally {
    ws.close();
    await relay.close();
  }
});

test('page token survives reconnect with the same auth token', async () => {
  const relay = await startRelayServer({ port: 0, wechatOnly: true, ticketAuth: true, publicBaseUrl: 'https://wechat.example.com' });
  try {
    const first = await registerAgent(relay.port);
    const pageToken = await enter(relay, first.token, first.registered);
    await waitFor(() => first.registered.length === 2);
    const pendingTicket = ticketOf(first.registered[1]);
    first.ws.close();
    await waitFor(() => relay.listConnections().length === 0);

    const second = await registerAgent(relay.port);
    assert.equal(second.token, first.token);
    assert.notEqual(ticketOf(second.registered[0]), pendingTicket);
    const call = await fetch(`http://127.0.0.1:${relay.port}/${second.token}/api/status`, { headers: { ...PUBLIC, 'x-relay-page-token': pageToken } });
    assert.equal(call.status, 200);
    assert.equal((await redeem(relay, second.token, pendingTicket)).status, 403);
    second.ws.close();
  } finally {
    await relay.close();
  }
});

test('public base url is derived from the agent upgrade request when not configured', async () => {
  const { relay, ws, token, registered } = await startWithAgent({ publicBaseUrl: undefined });
  try {
    assert.match(registered[0].publicUrl, new RegExp(`^http://127\\.0\\.0\\.1:${relay.port}/${token}/\\?ticket=[a-z0-9]{8}$`));
  } finally {
    ws.close();
    await relay.close();
  }
});

test('no public base url means tunnel is locked', () => {
  assert.equal(derivePublicBase({}), undefined);
  assert.equal(derivePublicBase({ host: 'relay.local' }), 'http://relay.local');
  assert.equal(derivePublicBase({ host: 'internal', 'x-forwarded-host': 'wechat.example.com, x', 'x-forwarded-proto': 'https, http' }), 'https://wechat.example.com');
});

test('direct loopback access needs no ticket', async () => {
  const { relay, ws, token } = await startWithAgent();
  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: { 'user-agent': SAFARI_UA } });
    assert.equal(response.status, 200);
    assert.equal(pageTokenOf(await response.text()), null);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('ticketAuth off keeps the old behavior', async () => {
  const { relay, ws, token, registered } = await startWithAgent({ ticketAuth: false });
  try {
    assert.equal(registered[0].publicUrl, undefined);
    assert.equal((await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: PUBLIC })).status, 200);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('injected script adds the token only to requests for its own suffix', () => {
  const sent = { fetch: [], xhr: [], es: [] };
  class FakeXhr {
    constructor() { this.headers = {}; }
    open(_method, url) { this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send() { sent.xhr.push({ url: this.url, headers: this.headers }); }
  }
  class FakeEventSource {
    constructor(url) { sent.es.push(url); }
  }
  const context = {
    location: { href: 'https://wechat.example.com/abc123/', origin: 'https://wechat.example.com' },
    URL,
    Headers,
    Request,
    fetch: (input, init) => { sent.fetch.push({ input, headers: new Headers(init?.headers) }); return Promise.resolve(); },
    XMLHttpRequest: FakeXhr,
    EventSource: FakeEventSource,
  };
  context.window = context;
  vm.runInNewContext(renderPageTokenScript('TOKEN', 'abc123'), context);

  context.window.fetch('/abc123/api/status');
  context.window.fetch('https://wechat.example.com/other99/api/x');
  context.window.fetch('https://evil.example.com/abc123/api/x');
  assert.equal(sent.fetch[0].headers.get('x-relay-page-token'), 'TOKEN');
  assert.equal(sent.fetch[1].headers.get('x-relay-page-token'), null);
  assert.equal(sent.fetch[2].headers.get('x-relay-page-token'), null);

  const own = new context.window.XMLHttpRequest();
  own.open('GET', '/abc123/api/a');
  own.send();
  const other = new context.window.XMLHttpRequest();
  other.open('GET', '/other99/api/a');
  other.send();
  assert.equal(sent.xhr[0].headers['x-relay-page-token'], 'TOKEN');
  assert.equal(sent.xhr[1].headers['x-relay-page-token'], undefined);

  new context.window.EventSource('/abc123/api/events?a=1');
  new context.window.EventSource('/other99/api/events');
  assert.equal(sent.es[0], 'https://wechat.example.com/abc123/api/events?a=1&__rpt=TOKEN');
  assert.equal(sent.es[1], '/other99/api/events');
});
