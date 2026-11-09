import test from 'node:test';
import assert from 'node:assert/strict';
import { startRelayServer } from '../src/server.mjs';

test('serves the end-user onboarding guide at the root path', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
  });

  try {
    const response = await fetch(`http://127.0.0.1:${relay.port}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const html = await response.text();
    // 关键内容标记：标题、安装命令、启动命令、扫码绑定入口。
    assert.match(html, /claude-codex-wechat 接入指南/);
    assert.match(html, /npm install -g claude-codex-wechat/);
    assert.match(html, /claude-codex-wechat start/);
    assert.match(html, /127\.0\.0\.1:8787/);
    assert.match(html, /隐私与安全承诺/);
    // 页面是纯自动流程，不应再出现让用户手动改配置 / 手填令牌的内容。
    assert.doesNotMatch(html, /config\.json/);
    assert.doesNotMatch(html, /authToken/);
  } finally {
    await relay.close();
  }
});

test('the root guide does not shadow the tunnel proxy for token paths', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
  });

  try {
    // 未注册的 token 路径仍应走代理逻辑并返回 404，而不是被 landing 页拦截。
    const response = await fetch(`http://127.0.0.1:${relay.port}/unknown-token/whatever`);
    assert.equal(response.status, 404);
  } finally {
    await relay.close();
  }
});

test('the root guide shows only the number of online clients', async () => {
  const relay = await startRelayServer({ port: 0 });
  const authToken = 'clrt_1234567890abcdef12345678';

  try {
    const before = await (await fetch(`http://127.0.0.1:${relay.port}/`)).text();
    assert.match(before, /当前在线 <strong>0<\/strong> 个客户端/);

    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/agent`);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'register', clientVersion: '0.1.0', targetBaseUrl: 'http://127.0.0.1:8787', authToken }));
      });
      ws.addEventListener('message', (raw) => {
        if (JSON.parse(String(raw.data)).type === 'registered') resolve(undefined);
      });
      ws.addEventListener('error', reject);
    });

    const after = await (await fetch(`http://127.0.0.1:${relay.port}/`)).text();
    assert.match(after, /当前在线 <strong>1<\/strong> 个客户端/);
    // 只给数量，不泄露 token 或隧道后缀。
    assert.doesNotMatch(after, new RegExp(authToken));
    ws.close();
  } finally {
    await relay.close();
  }
});
