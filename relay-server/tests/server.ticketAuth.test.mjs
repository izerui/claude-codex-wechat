import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePublicBase, startRelayServer } from '../src/server.mjs';

const AUTH_TOKEN = 'clrt_1234567890abcdef12345678';
const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800322d) NetType/WIFI Language/zh_CN';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
// 测试从 127.0.0.1 发请求；带上代理头模拟经 ingress 进来的公网请求，否则会被当成本机直连放行。
const PUBLIC = { 'user-agent': WECHAT_UA, 'x-forwarded-for': '203.0.113.7' };

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor_timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function registerAgent(port, responseHeaders = { 'content-type': 'text/plain' }) {
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
      bodyBase64: Buffer.from('hello from agent').toString('base64'),
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
  const { agentResponseHeaders, ...relayOptions } = options;
  const relay = await startRelayServer({
    port: 0,
    wechatOnly: true,
    ticketAuth: true,
    publicBaseUrl: 'https://wechat.example.com',
    ...relayOptions,
  });
  const agent = await registerAgent(relay.port, options.agentResponseHeaders);
  return { relay, ...agent };
}

function ticketOf(registered) {
  return new URL(registered.publicUrl).searchParams.get('ticket');
}

function sessionCookieOf(response) {
  return (response.headers.get('set-cookie') ?? '').split(';')[0];
}

async function redeem(relay, token, ticket, extraHeaders = {}) {
  return fetch(`http://127.0.0.1:${relay.port}/${token}/?ticket=${ticket}`, { headers: { ...PUBLIC, ...extraHeaders } });
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

test('tunnel request without ticket or session is 403', async () => {
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

test('redeeming a ticket forwards the page, sets a scoped cookie and pushes a new ticket', async () => {
  const { relay, ws, token, registered, requests } = await startWithAgent();
  try {
    const ticket = ticketOf(registered[0]);
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/?ticket=${ticket}&x=1`, { headers: PUBLIC });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'hello from agent');
    assert.match(
      response.headers.get('set-cookie') ?? '',
      new RegExp(`^relay_session=[A-Za-z0-9_-]{43}; Path=/${token}/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$`),
    );
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

test('ticket is strictly one-time', async () => {
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

test('valid session ignores a used ticket', async () => {
  const { relay, ws, token, registered } = await startWithAgent();
  try {
    const ticket = ticketOf(registered[0]);
    const cookie = sessionCookieOf(await redeem(relay, token, ticket));
    await waitFor(() => registered.length === 2);
    const again = await redeem(relay, token, ticket, { cookie });
    assert.equal(again.status, 200);
    assert.equal(again.headers.get('set-cookie'), null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(registered.length, 2);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('session cookie is not forwarded to the agent', async () => {
  const { relay, ws, token, registered, requests } = await startWithAgent();
  try {
    const cookie = sessionCookieOf(await redeem(relay, token, ticketOf(registered[0])));
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/api/status`, {
      headers: { ...PUBLIC, cookie: `a=1; ${cookie}; b=2` },
    });
    assert.equal(response.status, 200);
    assert.equal(requests.at(-1).headers.cookie, 'a=1; b=2');
    assert.equal(requests.at(-1).path, '/api/status');
  } finally {
    ws.close();
    await relay.close();
  }
});

test('session expires after seven days', async () => {
  let clock = 1_000;
  const { relay, ws, token, registered } = await startWithAgent({ ticketAuthOptions: { now: () => clock } });
  try {
    const cookie = sessionCookieOf(await redeem(relay, token, ticketOf(registered[0])));
    clock += 604_800_000 - 1;
    assert.equal((await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: { ...PUBLIC, cookie } })).status, 200);
    clock += 2;
    assert.equal((await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: { ...PUBLIC, cookie } })).status, 403);
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

test('session survives reconnect with the same auth token', async () => {
  const relay = await startRelayServer({ port: 0, wechatOnly: true, ticketAuth: true, publicBaseUrl: 'https://wechat.example.com' });
  try {
    const first = await registerAgent(relay.port);
    const usedTicket = ticketOf(first.registered[0]);
    const cookie = sessionCookieOf(await redeem(relay, first.token, usedTicket));
    await waitFor(() => first.registered.length === 2);
    const pendingTicket = ticketOf(first.registered[1]);
    first.ws.close();
    await waitFor(() => relay.listConnections().length === 0);

    const second = await registerAgent(relay.port);
    assert.equal(second.token, first.token);
    assert.notEqual(ticketOf(second.registered[0]), pendingTicket);
    assert.equal((await fetch(`http://127.0.0.1:${relay.port}/${second.token}/`, { headers: { ...PUBLIC, cookie } })).status, 200);
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
    const response = await redeem(relay, token, ticketOf(registered[0]));
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get('set-cookie') ?? '', /Secure/);
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

test('agent response headers cannot drop the session cookie or no-store on redemption', async () => {
  const { relay, ws, token, registered } = await startWithAgent({
    agentResponseHeaders: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=0', 'set-cookie': 'foo=bar; Path=/' },
  });
  try {
    const response = await redeem(relay, token, ticketOf(registered[0]));
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.some((c) => c.startsWith('relay_session=')), JSON.stringify(cookies));
    assert.ok(cookies.includes('foo=bar; Path=/'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  } finally {
    ws.close();
    await relay.close();
  }
});

test('agent cannot plant or overwrite a relay_session cookie', async () => {
  const { relay, ws, token } = await startWithAgent({
    agentResponseHeaders: { 'content-type': 'text/plain', 'set-cookie': ['relay_session=evil; Path=/other/', 'foo=bar'] },
  });
  try {
    // 本机直连不需要票据，直接拿到 agent 原始响应头经 relay 过滤后的结果。
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.headers.getSetCookie(), ['foo=bar']);
  } finally {
    ws.close();
    await relay.close();
  }
});
