# relay 公网链接票据鉴权 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公网隧道路径必须先用 relay 签发的一次性票据换取 7 天会话才能访问；新老客户端零改动，本机直连不受影响。

**Architecture:** 新增纯内存模块 `ticketAuth.mjs` 管理票据与会话（时间可注入，便于测试）。`server.mjs` 在注册时把票据拼进 `publicUrl` 并经 `registered` 下发，票据被兑换或过期时重新推送 `registered`；HTTP 隧道请求在转发前做「本机直连 → 微信 UA → 会话 / 票据」校验，兑换成功时附加 `Set-Cookie`，并在转发前剥离 `ticket` 参数与 `relay_session` cookie。

**Tech Stack:** Node.js ≥ 20 ESM（`.mjs`），`ws`，`node:test` + `node:assert/strict`，`node:crypto`。

**Spec:** `docs/superpowers/specs/2026-11-09-relay-ticket-auth-design.md`

## Global Constraints

- 只改 `relay-server/`（以及部署文档）；不改 `src/` 下任何客户端代码，不改 `/agent` 既有消息格式。
- 票据：8 位，字符集 `a-z0-9`，`crypto.randomInt` 生成；严格一次性；有效期 1 天（`86_400_000` ms）。
- 会话：32 字节随机数 base64url；从兑换起固定 7 天（`604_800_000` ms），不续期；按 `authToken` 绑定。
- cookie：`relay_session=<id>; Path=/<后缀>/; HttpOnly; SameSite=Lax; Max-Age=604800`，HTTPS 时追加 `; Secure`。
- 兑换成功不跳转：直接转发（路径去掉 `ticket`），响应附加 `Set-Cookie`、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`。
- 拒绝一律 `403` + 现有 `renderWeChatOnlyPage()`（只显示「无权限访问」）。
- 配置：`RELAY_TICKET_AUTH` 默认开启（`0|false|off|no` 关闭）；`RELAY_PUBLIC_BASE_URL` 可选，未配置时从 `/agent` upgrade 请求的 `x-forwarded-proto`/`x-forwarded-host`（回退 `host`）推导。
- `startRelayServer` 的 `ticketAuth` 参数默认 `false`（与 `wechatOnly` 一致，保证既有测试不受影响）；`loadRelayConfig` 默认 `true`。
- 日志不得输出票据、会话 ID 明文。

## Review Focus

1. **隧道根路径不带斜杠且带查询**（`/<后缀>?ticket=x`）：现有 `path.split('/')` 会把 `<后缀>?ticket=x` 当成后缀，导致 404。期望正常识别后缀并兑换。→ Task 3 测试 `ticket on suffix root without trailing slash`。
2. **同时带有效会话和已用票据**（聊天里点旧链接）：期望忽略票据、正常进入，且不再签发新票。→ Task 3 测试 `valid session ignores a used ticket`。
3. **非微信 UA 带有效票据**（微信预览抓取 / 普通浏览器）：期望 403 且票据不被消耗。→ Task 3 测试 `non-wechat request does not consume ticket`。
4. **同一 `authToken` 断线重连**：期望已有会话仍有效、旧票据作废、新票据随新 `registered` 下发。→ Task 3 测试 `session survives reconnect with the same auth token`。
5. **无法得到公网基础地址**（未配置且 upgrade 请求无 host 信息）：期望不下发 `publicUrl`，非本机直连的隧道请求一律 403，进程不崩溃。→ Task 3 测试 `no public base url means tunnel is locked`。

---

### Task 1: 票据与会话存储 `ticketAuth.mjs`

**Files:**
- Create: `relay-server/src/ticketAuth.mjs`
- Test: `relay-server/tests/ticketAuth.test.mjs`

**Interfaces:**
- Produces:
  - `createTicketAuth({ ticketTtlMs = 86_400_000, sessionTtlMs = 604_800_000, now = Date.now } = {})` 返回：
    - `issueTicket(authToken: string): string` —— 生成新票并替换该 authToken 的旧票。
    - `currentTicket(authToken: string): string | null` —— 未过期的当前票，否则 `null`。
    - `redeemTicket(authToken: string, ticket: string): string | null` —— 票据属于该 authToken、未过期、未使用时作废它并返回新会话 ID，否则 `null`。不自动签发新票。
    - `isValidSession(authToken: string, sessionId: string): boolean`
    - `revokeTicket(authToken: string): void`
    - `takeExpiredTicketOwners(): string[]` —— 返回当前票已过期的 authToken 列表（并删除这些过期票）。
    - `sweep(): void` —— 删除过期会话。
  - `generateTicket(): string` —— 8 位 `a-z0-9`。
  - `SESSION_COOKIE_NAME = 'relay_session'`

- [ ] **Step 1: 写失败测试**

```js
test('generateTicket returns 8 chars of a-z0-9', () => {
  for (let i = 0; i < 50; i++) assert.match(generateTicket(), /^[a-z0-9]{8}$/);
});
test('ticket is one-time and bound to its auth token', () => {
  const auth = createTicketAuth();
  const t = auth.issueTicket('A');
  assert.equal(auth.redeemTicket('B', t), null);
  const sid = auth.redeemTicket('A', t);
  assert.ok(sid);
  assert.equal(auth.isValidSession('A', sid), true);
  assert.equal(auth.isValidSession('B', sid), false);
  assert.equal(auth.redeemTicket('A', t), null);
});
test('issuing a new ticket invalidates the previous one', () => {
  const auth = createTicketAuth();
  const old = auth.issueTicket('A');
  auth.issueTicket('A');
  assert.equal(auth.redeemTicket('A', old), null);
});
test('ticket expires after one day and is reported for reissue', () => {
  let clock = 0;
  const auth = createTicketAuth({ now: () => clock });
  const t = auth.issueTicket('A');
  clock = 86_400_000 + 1;
  assert.equal(auth.currentTicket('A'), null);
  assert.deepEqual(auth.takeExpiredTicketOwners(), ['A']);
  assert.deepEqual(auth.takeExpiredTicketOwners(), []);
  assert.equal(auth.redeemTicket('A', t), null);
});
test('session lasts exactly seven days without renewal', () => {
  let clock = 0;
  const auth = createTicketAuth({ now: () => clock });
  const sid = auth.redeemTicket('A', auth.issueTicket('A'));
  clock = 604_800_000 - 1;
  assert.equal(auth.isValidSession('A', sid), true);
  clock = 604_800_000 + 1;
  assert.equal(auth.isValidSession('A', sid), false);
});
test('revokeTicket makes the current ticket unusable', () => {
  const auth = createTicketAuth();
  const t = auth.issueTicket('A');
  auth.revokeTicket('A');
  assert.equal(auth.redeemTicket('A', t), null);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd relay-server && node --test tests/ticketAuth.test.mjs`
Expected: FAIL（`Cannot find module '../src/ticketAuth.mjs'`）

- [ ] **Step 3: 实现 `relay-server/src/ticketAuth.mjs`**

两个 `Map`：`tickets: authToken → { value, expiresAt }`，`sessions: sessionId → { authToken, expiresAt }`。会话 ID 用 `randomBytes(32).toString('base64url')`。风格参照 `domainRegistry.mjs`（工厂函数 + 返回方法对象）。

- [ ] **Step 4: 运行确认通过**

Run: `cd relay-server && node --test tests/ticketAuth.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add relay-server/src/ticketAuth.mjs relay-server/tests/ticketAuth.test.mjs
git commit -m "feat(relay): 新增一次性票据与 7 天会话存储"
```

---

### Task 2: 配置项 `RELAY_TICKET_AUTH` / `RELAY_PUBLIC_BASE_URL`

**Files:**
- Modify: `relay-server/src/config.mjs`
- Test: `relay-server/tests/config.test.mjs`

**Interfaces:**
- Produces: `loadRelayConfig(env)` 返回值新增 `ticketAuth: boolean`（默认 `true`）、`publicBaseUrl: string | undefined`（去掉末尾 `/`，空串视为未设置）。

- [ ] **Step 1: 写失败测试**

现有 7 处 `assert.deepEqual(config, {...})` 的期望对象各补 `ticketAuth: true, publicBaseUrl: undefined`。新增：

```js
test('RELAY_TICKET_AUTH can be turned off and RELAY_PUBLIC_BASE_URL is normalized', () => {
  for (const value of ['0', 'false', 'OFF', 'no']) {
    assert.equal(loadRelayConfig({ RELAY_TICKET_AUTH: value }).ticketAuth, false);
  }
  assert.equal(loadRelayConfig({}).ticketAuth, true);
  assert.equal(loadRelayConfig({ RELAY_PUBLIC_BASE_URL: 'https://wechat.style520.com/' }).publicBaseUrl, 'https://wechat.style520.com');
  assert.equal(loadRelayConfig({ RELAY_PUBLIC_BASE_URL: '  ' }).publicBaseUrl, undefined);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd relay-server && node --test tests/config.test.mjs`
Expected: FAIL（`deepEqual` 缺少新字段）

- [ ] **Step 3: 在 `loadRelayConfig` 中加入两个字段**，`ticketAuth` 与 `wechatOnly` 用同一个关闭正则。

- [ ] **Step 4: 运行确认通过**

Run: `cd relay-server && node --test tests/config.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add relay-server/src/config.mjs relay-server/tests/config.test.mjs
git commit -m "feat(relay): 新增 RELAY_TICKET_AUTH 与 RELAY_PUBLIC_BASE_URL 配置"
```

---

### Task 3: 服务端接入票据鉴权

**Files:**
- Modify: `relay-server/src/server.mjs`
- Create: `relay-server/tests/server.ticketAuth.test.mjs`
- Modify: `relay-server/README.md`（环境变量表新增两项；「安全说明」补充票据机制与"上线后需重新 /help"）

**Interfaces:**
- Consumes: Task 1 `createTicketAuth`、`SESSION_COOKIE_NAME`；Task 2 的 `ticketAuth`、`publicBaseUrl`（`startRelayServer` 输入参数同名）。
- Produces: `startRelayServer({ ..., ticketAuth = false, publicBaseUrl, ticketAuthOptions })`，`ticketAuthOptions` 透传给 `createTicketAuth`（测试注入时钟用）；返回对象新增 `refreshExpiredTickets(): void`（测试中手动触发过期检查，内部定时器也调用它）。

改动要点（实现者按此落地，细节自定）：

1. **解析请求路径**：用 `new URL(req.url, 'http://relay.local')` 取 `pathname` 与 `searchParams`；后缀取 `pathname` 第一段。转发给 agent 的 `path` = 去掉后缀的 `pathname` + 去掉 `ticket` 后的查询串（无剩余参数则不带 `?`）。
2. **公网基础地址**：`publicBaseUrl` 优先；否则在 `wss.on('connection', (ws, request) => …)` 中由 `request.headers` 推导（`x-forwarded-proto` 首值，缺省 `http`；`x-forwarded-host` 首值，回退 `host`）。存入连接记录 `publicBase`。
3. **下发 `registered`**：抽出 `sendRegistered(connectionId)`，字段与现有一致；`ticketAuth` 开启且有 `publicBase` 时 `publicUrl = ${publicBase}/${token}/?ticket=${ticketAuth.currentTicket(authToken) ?? ticketAuth.issueTicket(authToken)}`；未开启时保持现有行为（有 `allocation.publicUrl` 才带）。注册时先 `revokeTicket` 再签发（重连换新票）。
4. **请求鉴权顺序**（`ticketAuth` 开启时；本机直连 `isDirectLoopbackRequest(req)` 直接跳过 2–5）：
   1. 后缀不存在 → 404（不变）。
   2. `wechatOnly` 且非微信 UA → 403（不变，**不读取票据**）。
   3. cookie 中任一 `relay_session` 值满足 `isValidSession(authToken, id)` → 放行（忽略 URL 中的票据）。
   4. 否则 URL 有 `ticket`、方法为 `GET`、`redeemTicket` 成功 → 放行，并 `res.setHeader('Set-Cookie', …)`、`Referrer-Policy`、`Cache-Control`；随后 `issueTicket` + `sendRegistered`。
   5. 其余 → 403。
5. **转发前清理**：`headers.cookie` 中移除所有 `relay_session=…` 片段，剩余为空则删除该头。
6. **断开**：`ws.on('close')` 中 `revokeTicket(authToken)`（仅当该 authToken 当前连接就是本连接时）。
7. **定时器**：每 60 秒执行 `refreshExpiredTickets()`（对 `takeExpiredTicketOwners()` 中仍在线的 authToken 签发新票并 `sendRegistered`）和 `sweep()`；`unref()`，`close()` 时清除。
8. `Secure`：`publicBase` 以 `https://` 开头时追加。

- [ ] **Step 1: 写失败测试 `relay-server/tests/server.ticketAuth.test.mjs`**

测试辅助：`startWithAgent({ ticketAuth: true, wechatOnly: true, publicBaseUrl: 'https://wechat.example.com', ticketAuthOptions })`，返回 `{ relay, ws, token, messages }`，`messages` 收集所有 `registered`；agent 对 `request` 回 200 `hello from agent`，并记录收到的 `path` 与 `headers`。所有"公网请求"带 `x-forwarded-for: 203.0.113.7` 与微信 UA（`WECHAT_UA`，同 `server.wechatOnly.test.mjs`）。`ticketOf(url)` 取 `publicUrl` 的 `ticket` 参数。

```js
test('registered carries a publicUrl with an 8-char ticket', async () => {
  // messages[0].publicUrl 匹配 ^https://wechat\.example\.com/[a-z0-9]{10,12}/\?ticket=[a-z0-9]{8}$
});
test('tunnel request without ticket or session is 403', async () => {
  // GET /${token}/ → 403，body 含「无权限访问」
});
test('redeeming a ticket forwards the page, sets a scoped cookie and pushes a new ticket', async () => {
  // GET /${token}/?ticket=${t}&x=1 → 200 'hello from agent'
  // set-cookie 匹配 ^relay_session=[A-Za-z0-9_-]{43}; Path=/${token}/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$
  // referrer-policy === 'no-referrer'，cache-control === 'no-store'
  // agent 收到 path === '/?x=1'
  // 等待 messages.length === 2，新 ticket !== t
});
test('ticket is strictly one-time', async () => {
  // 兑换一次后，不带 cookie 再用同一 ticket → 403
});
test('valid session ignores a used ticket', async () => {
  // 带兑换得到的 cookie + 旧 ticket → 200，且 messages 数量不再增加
});
test('session cookie is not forwarded to the agent', async () => {
  // 带 cookie: `a=1; relay_session=${sid}; b=2` → agent 收到 cookie === 'a=1; b=2'
});
test('session expires after seven days', async () => {
  // ticketAuthOptions.now 注入可变时钟；+604_800_001 ms 后带 cookie → 403
});
test('expired ticket is reissued and pushed', async () => {
  // 时钟 +86_400_001 ms，调用 relay.refreshExpiredTickets() → 收到新 registered，旧 ticket 兑换 → 403
});
test('non-wechat request does not consume ticket', async () => {
  // Safari UA + 有效 ticket → 403；随后微信 UA + 同一 ticket → 200
});
test('ticket on suffix root without trailing slash', async () => {
  // GET /${token}?ticket=${t} → 200，agent 收到 path === '/'
});
test('session survives reconnect with the same auth token', async () => {
  // 兑换得 cookie → 关闭 ws → 同 authToken 重新注册 → 带 cookie 访问 → 200；旧 ticket → 403；新 registered 带新 ticket
});
test('no public base url means tunnel is locked', async () => {
  // ticketAuth: true、不传 publicBaseUrl，upgrade 请求不带 host 推导不到时：registered 无 publicUrl；公网请求 → 403
  // 注：Node 的 WebSocket 客户端总会发 host，测试中通过 publicBaseUrl 未设置 + 断言 publicUrl 由 host 推导为 http://127.0.0.1:<port>/... 覆盖推导分支；
  //     "完全推导不到"分支用单元方式覆盖：导出并测试 derivePublicBase(headers) 对空 headers 返回 undefined。
});
test('direct loopback access needs no ticket', async () => {
  // 不带代理头的本机请求 → 200
});
test('ticketAuth off keeps the old behavior', async () => {
  // ticketAuth: false，公网微信请求不带 ticket → 200
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd relay-server && node --test tests/server.ticketAuth.test.mjs`
Expected: FAIL（无 `?ticket=`、请求未被拦截等）

- [ ] **Step 3: 按上面 8 个改动要点修改 `relay-server/src/server.mjs`**；导出 `derivePublicBase(headers): string | undefined`。`bin/relay-server.mjs` 已把整个 config 传给 `startRelayServer`，无需改动。

- [ ] **Step 4: 运行全部 relay 测试**

Run: `cd relay-server && npm test`
Expected: 全部 PASS（既有测试因 `ticketAuth` 默认 `false` 不受影响）

- [ ] **Step 5: 更新 `relay-server/README.md`**：环境变量表新增 `RELAY_TICKET_AUTH`、`RELAY_PUBLIC_BASE_URL`；「安全说明」写明：公网链接需经 `/help` 获取的一次性票据（8 位、1 天有效），兑换后 7 天内凭 cookie 访问；relay 重启后需重新 `/help`。

- [ ] **Step 6: Commit**

```bash
git add relay-server/src/server.mjs relay-server/tests/server.ticketAuth.test.mjs relay-server/README.md
git commit -m "feat(relay): 公网隧道接入一次性票据鉴权与 7 天会话"
```

---

### Task 4: 版本与部署配置

**Files:**
- Modify: `relay-server/package.json`（`version` → `0.1.8`）
- Modify（另一仓库，只改不 apply）: `/Users/liuyuhua/IdeaProjects/kubernetes/cluster/k3s/init/prod/relay-server/app.yaml`

- [ ] **Step 1: `relay-server/package.json` 版本改为 `0.1.8`**

- [ ] **Step 2: `app.yaml` 的 `env` 增加**

```yaml
            # 公网链接的票据签发地址前缀，需与 ingress 域名一致。
            - name: RELAY_PUBLIC_BASE_URL
              value: "https://wechat.style520.com"
```

- [ ] **Step 3: 全量验证**

Run: `cd relay-server && npm test`
Expected: 全部 PASS

- [ ] **Step 4: Commit（仅本仓库）**

```bash
git add relay-server/package.json
git commit -m "chore(relay): 升级至 0.1.8"
```

kubernetes 仓库的 `app.yaml` 改动不提交、不 apply，交由用户在新镜像上线后处理。
