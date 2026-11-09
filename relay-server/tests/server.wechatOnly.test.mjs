import test from 'node:test';
import assert from 'node:assert/strict';
import { startRelayServer, isWeChatUserAgent } from '../src/server.mjs';

const AUTH_TOKEN = 'clrt_1234567890abcdef12345678';
const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800322d) NetType/WIFI Language/zh_CN';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// 测试从 127.0.0.1 发请求，本身就是「本机直连」；带上代理头模拟经反代进来的公网请求。
const VIA_PROXY = { 'x-forwarded-for': '203.0.113.7' };

async function startWithAgent(options) {
  const relay = await startRelayServer({ port: 0, authTokens: [AUTH_TOKEN], ...options });
  const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
  const registered = await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'register', clientVersion: '0.1.0', targetBaseUrl: 'http://127.0.0.1:8787', authToken: AUTH_TOKEN }));
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
      headers: { 'content-type': 'text/plain' },
      bodyBase64: Buffer.from('hello from agent').toString('base64'),
    }));
  });
  return { relay, ws, token: registered.token };
}

test('wechatOnly 时普通浏览器访问隧道地址返回 403 无权限页', async () => {
  const { relay, ws, token } = await startWithAgent({ wechatOnly: true });
  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: { 'user-agent': SAFARI_UA, ...VIA_PROXY } });
    assert.equal(response.status, 403);
    const html = await response.text();
    assert.match(html, /无权限访问/);
    // 不提示「请在微信中打开」，避免向陌生访问者透露放行条件。
    assert.doesNotMatch(html, /微信/);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('wechatOnly 时微信内置浏览器正常转发到 agent', async () => {
  const { relay, ws, token } = await startWithAgent({ wechatOnly: true });
  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/api/status`, { headers: { 'user-agent': WECHAT_UA, ...VIA_PROXY } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'hello from agent');
  } finally {
    ws.close();
    await relay.close();
  }
});

test('wechatOnly 时本机直连的普通浏览器可以访问隧道地址', async () => {
  const { relay, ws, token } = await startWithAgent({ wechatOnly: true });
  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: { 'user-agent': SAFARI_UA } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'hello from agent');
  } finally {
    ws.close();
    await relay.close();
  }
});

test('同机反代转发的请求即使来自回环地址也按公网处理', async () => {
  const { relay, ws, token } = await startWithAgent({ wechatOnly: true });
  try {
    for (const header of [{ 'x-forwarded-for': '203.0.113.7' }, { 'x-real-ip': '203.0.113.7' }, { 'x-forwarded-host': 'wechat.example.com' }, { forwarded: 'for=203.0.113.7' }]) {
      const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: { 'user-agent': SAFARI_UA, ...header } });
      assert.equal(response.status, 403, JSON.stringify(header));
    }
  } finally {
    ws.close();
    await relay.close();
  }
});

test('wechatOnly 不影响首页与健康检查', async () => {
  const relay = await startRelayServer({ port: 0, wechatOnly: true });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${relay.port}/healthz`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${relay.port}/`)).status, 200);
  } finally {
    await relay.close();
  }
});

test('未开启 wechatOnly 时任意浏览器都能访问', async () => {
  const { relay, ws, token } = await startWithAgent({});
  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/${token}/`, { headers: { 'user-agent': SAFARI_UA } });
    assert.equal(response.status, 200);
  } finally {
    ws.close();
    await relay.close();
  }
});

test('识别手机与桌面微信 UA', () => {
  assert.equal(isWeChatUserAgent(WECHAT_UA), true);
  assert.equal(isWeChatUserAgent('Mozilla/5.0 (Macintosh) MicroMessenger/3.8.7 MacWechat/3.8.7'), true);
  assert.equal(isWeChatUserAgent(SAFARI_UA), false);
  assert.equal(isWeChatUserAgent(undefined), false);
});
