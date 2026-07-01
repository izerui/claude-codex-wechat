import test from 'node:test';
import assert from 'node:assert/strict';
import { startRelayServer } from '../src/server.mjs';

test('serves the end-user onboarding guide at the root path', async () => {
  const relay = await startRelayServer({
    port: 0,
    baseDomain: 'style520.com',
    adminToken: 'admin-secret',
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
    adminToken: 'admin-secret',
  });

  try {
    // 未注册的 token 路径仍应走代理逻辑并返回 404，而不是被 landing 页拦截。
    const response = await fetch(`http://127.0.0.1:${relay.port}/unknown-token/whatever`);
    assert.equal(response.status, 404);
  } finally {
    await relay.close();
  }
});
