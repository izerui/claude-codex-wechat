# relay 公网链接票据鉴权设计

日期：2026-11-09
范围：仅 `relay-server/`，客户端（bridge）不改

## 背景与意图

bridge 的控制台（会话切换、目录浏览、微信通道开关等）没有任何鉴权。经 relay 暴露到公网后，
地址形如 `https://wechat.style520.com/<12位后缀>/`，**任何人只要知道这个地址就能完整操作控制台**。
地址会出现在微信 `/help` 回复里、浏览器历史里，转发出去即泄露。

目标：公网链接必须带 relay 签发的有效票据才能进入；只知道地址不行。
本机直接访问 bridge（`http://127.0.0.1:8787`）不经过 relay，完全不受影响。

## 目标

- 公网隧道路径（`/<后缀>/...`）的访问，必须先用一次性票据进入页面，之后只有该页面（凭内存中的页面令牌）能继续请求。
- 票据由 relay 签发、校验，**新老版本客户端一律生效**，客户端零改动。
- 票据一次性：被用过的链接再转发给别人无效。
- 本机 `127.0.0.1` 直连 bridge 不受任何影响。

## 非目标

- 不识别具体是哪个微信号（微信内置浏览器不暴露身份，网页授权需要公众号，当前不具备）。
- 不改 bridge / 客户端代码，不改 `/agent` 协议的既有消息格式（只复用已有的 `registered` 消息）。
- 不做多副本 relay 的会话共享（线上 `replicas: 1`）。

## 反目标（技术上能跑但算失败）

- 任何一个已部署的老客户端因此彻底打不开公网控制台、且发 `/help` 也拿不到可用链接。
- 微信抓取链接预览、或普通浏览器打开，把用户的一次性票据"消耗掉"，导致用户自己点开时无效。
- 同域名下其他用户的页面（同源脚本）能借用本用户的登录状态请求其隧道。
- 票据或会话在 relay 日志、`Referer` 中长期残留。

## 约束（来自现有代码）

- 所有版本客户端在收到 `registered` 消息时，都会用其中的 `publicUrl` 字段覆盖本地公网地址，
  且同一连接上**重复收到 `registered` 也会更新**（`src/runtime/relayTunnelProvider.ts` 中
  `payload.type === 'registered'` 分支，`finishResolve` 对已 resolve 的 promise 为空操作）。
  `/help` 回复与控制台展示的都是这个 `publicUrl`（`src/daemon/server.ts` `getHelpAddress`）。
- relay 目前**不下发 `publicUrl`**（`domainRegistry.allocate` 未传 `publicBaseUrl`），客户端用
  `serverUrl` 推导 `https://<host>/<token>`。本方案起 relay 必须下发 `publicUrl`。
- 所有用户共用同一域名 `wechat.style520.com`，按路径前缀区分。
- relay 已有 `RELAY_WECHAT_ONLY`（非 `MicroMessenger` UA 返回 403「无权限访问」）与
  本机直连放行（回环地址且无 `x-forwarded-*` 等代理头），本方案保留二者。
- 线上部署：k8s，`replicas: 1`，`strategy: Recreate`，前置 nginx ingress（HTTPS 终止）。

## 方案对比

| 方案 | 做法 | 取舍 |
|---|---|---|
| A. bridge 签票 | `/help` 时 bridge 生成票据，bridge 校验并种 cookie | 凭据留在本机；但老客户端不会签票，**不满足"新老一律生效"** |
| B1. relay 签票 + 新协议 | 新增 WS 消息让 bridge 在 `/help` 时向 relay 申请票据 | 每次 `/help` 都是新票；但老客户端不会发新消息，**不满足** |
| **B2. relay 签票 + 复用 `registered` 推送（选定）** | relay 把票据拼进 `publicUrl`，经 `registered` 推给客户端；票据用掉即换新并再次推送 | 新老客户端都自动生效、零改动；代价是会话状态存在 relay 内存 |

用户明确要求票据在 relay 侧签发校验、新老客户端都生效、客户端不改，因此选 B2。

## 设计

### 1. 票据（ticket）

- 每个在线连接（`connectionId`）**同一时刻只有一张有效票据**。
- 格式：**8 位随机码**，字符集 `a-z0-9`（用 `crypto.randomInt` 生成，约 2.8 万亿种组合）。
  票据只能用一次、1 天内有效、又绑定具体后缀，8 位足够防猜（1 天内要试完需每秒约 3000 万次请求）；不用更短，例如 6 位纯数字只有 100 万种，很快就能被暴力试出来。
- 有效期：**1 天**（用户定的）。
- 生命周期：
  - 客户端注册成功时签发第一张，随 `registered` 下发。
  - 票据被成功兑换后**立即作废并签发新票**，再发一条 `registered` 推给该连接。
  - 票据过期时签发新票并推送（定时检查，间隔不超过 1 分钟），保证用户任意时刻发 `/help`
    拿到的都是可用链接。聊天记录里超过 1 天的旧链接失效，重新发 `/help` 即可。
  - 连接断开时作废该连接的票据。
- `publicUrl` 形如：`https://wechat.style520.com/<后缀>/?ticket=<票据>`。

### 2. 推送 `registered`

- 复用现有消息结构，字段与首次注册一致：`type`、`connectionId`、`token`、`streaming`、
  `publicUrl`。只有 `publicUrl` 中的票据变化。
- `publicUrl` 的基础地址来源（按优先级）：
  1. 新增配置 `RELAY_PUBLIC_BASE_URL`（如 `https://wechat.style520.com`）；
  2. 未配置时，从 `/agent` WebSocket upgrade 请求的 `x-forwarded-proto` / `x-forwarded-host`
     （回退 `host`）推导，与 README 现有说明一致。
  两者都拿不到时不下发 `publicUrl`（行为同现在），并在启动日志中告警：此时票据鉴权无法使用，
  隧道访问一律 403（见第 4 节）。

### 3. 兑换票据

请求命中隧道路径、URL 带 `ticket` 查询参数、且没有有效页面令牌时：

1. 先过既有检查：本机直连放行；否则必须是微信 UA（`RELAY_WECHAT_ONLY` 开启时）。
   **不满足时直接 403，不读取、不消耗票据**（防微信预览抓取和普通浏览器消耗票据）。
2. 只有 `GET` 请求可以兑换票据。
3. 票据必须属于该路径对应的连接、未过期、**未被兑换过（严格一次性，无宽限）**；否则 403「无权限访问」。
4. 兑换成功：
   - 作废票据，签发并推送新票（第 1 节）；
   - 生成一个**页面令牌**（32 字节随机数 base64url），转发请求（路径去掉 `ticket`）；
   - agent 返回 HTML 时，relay 在 `<head>` 开头注入一段脚本（第 4 节），把页面令牌写进脚本闭包；
   - 响应强制 `Cache-Control: no-store`、`Referrer-Policy: no-referrer`（以 relay 为准，覆盖 agent 同名头）。
   - **不跳转、不种 cookie。** 地址栏保留 `?ticket=...`，但票据已作废。

### 4. 页面令牌（取代 cookie 会话）

**为什么不用 cookie**：所有用户共用 `wechat.style520.com` 一个源，cookie 的 `Path` 只决定浏览器何时自动附带，
挡不住同源页面的脚本。攻击者可以自己注册一个隧道，诱导用户打开，再用脚本请求 `/<受害者后缀>/api/...`，
浏览器会自动带上受害者的 cookie。所以凭证**不能由浏览器自动附带**。

**做法**：

- 页面令牌只存在于注入脚本的闭包里（页面内存），其他页面拿不到。
- 注入脚本包装 `fetch`、`XMLHttpRequest`、`EventSource`：**只对本后缀路径**（同源且路径以 `/<后缀>/` 开头）的请求，
  `fetch` / XHR 加请求头 `X-Relay-Page-Token`，`EventSource`（无法设请求头）加查询参数 `__rpt`。
  对其他路径一律不附带，避免把令牌泄露给别人的隧道。
- relay 对隧道请求（非本机直连）按以下顺序放行：
  1. 带有效页面令牌（请求头或 `__rpt` 参数）→ 放行，转发前移除该请求头和 `__rpt` 参数；
  2. 否则带 `ticket` → 按第 3 节兑换；
  3. 否则 `Sec-Fetch-Dest` 为 `script` / `style` / `image` / `font` / `manifest`，且转发路径不以 `/api/` 开头 → 放行
     （`<script>`、`<link>`、`<img>` 等标签加载的前端静态资源无法带请求头；`Sec-Fetch-*` 由浏览器设置、页面脚本不能伪造；
     排除 `/api/` 防止借标签触发接口）；
  4. 其余 → 403「无权限访问」。
- 页面令牌按 `authToken` 绑定，有效期上限 7 天（防内存无限增长；页面打开期间可用）。断线重连后仍有效。
- **刷新页面或关闭重开都需要重新发 `/help`**：令牌在页面内存里，刷新即丢失（用户接受：每次访问都用 `/help` 发起）。
- relay 删除所有隧道响应中的 `Service-Worker-Allowed` 头，防止某个后缀注册的 Service Worker 把作用域扩大到整个域名、
  拦截别人的请求。


### 5. 本机直连与既有开关

- 本机直连（回环地址且无代理头）：不要求票据和会话，行为同现在。
- `RELAY_WECHAT_ONLY` 保留，作为兑换票据前的前置检查，默认开启。
- 新增总开关 `RELAY_TICKET_AUTH`，**默认开启**；设为 `0` / `false` / `off` / `no` 时退回
  "仅微信 UA 检查"的现有行为，作为上线后出问题时的应急回退。

### 6. 对老客户端的影响

- 所有客户端都会通过 `registered` 拿到带票据的 `publicUrl`，`/help` 自动带上票据，无需升级。
- 旧版控制台（v0.1.62 及以前）右上角会显示带票据的链接。本机控制台只在本机访问，可接受；
  新版控制台已不显示链接。
- 用户手里所有不带票据的旧链接，在新 relay 上线后全部失效，需重新发 `/help`。

### 7. 日志

- 不在任何日志中输出票据和会话 ID 的明文。如需排查，只记录前 4 位。
- relay 现有日志若打印完整请求 URL，需对 `ticket` 参数打码。

## 测试要点

- 不带票据、不带页面令牌访问隧道路径 → 403。
- 微信 UA + 有效票据 → 返回的 HTML 含注入脚本与页面令牌、无 `Set-Cookie`、`no-store`；agent 收到的路径不含 `ticket`；客户端收到新的 `registered`。
- 同一票据第二次使用（无令牌）→ 403。过期票据 → 403。别的连接的票据 → 403。
- 带有效页面令牌（请求头或 `__rpt`）→ 正常转发，agent 收不到令牌头和 `__rpt` 参数；令牌用在其他后缀 → 403。
- `Sec-Fetch-Dest: script` 访问静态路径 → 放行；访问 `/api/...` → 403；`Sec-Fetch-Dest: empty` 无令牌 → 403。
- 非微信 UA + 有效票据 → 403，且票据仍可被随后的微信 UA 请求正常兑换。
- agent 响应中的 `Service-Worker-Allowed` 被删除。
- 页面令牌超过 7 天 → 403。同一 `authToken` 断线重连后令牌仍有效。
- 本机直连（无代理头）→ 不要求票据；带 `x-forwarded-for` 的回环请求 → 按公网处理。
- `RELAY_TICKET_AUTH=0` → 退回现有行为。首页 `/` 与 `/healthz` 不受影响。

## 部署

- k8s `app.yaml` 增加 `RELAY_PUBLIC_BASE_URL=https://wechat.style520.com`（可选，ingress 已透传
  `x-forwarded-*` 时可省略，建议显式配置）。
- 上线后所有用户需重新发一次 `/help`。

## 留给实现者 / 我替用户定的取值

- 基线代码：HEAD（`ec41bd0`，relay-server 0.1.63 已含 `RELAY_WECHAT_ONLY` 与本机直连放行）。
- 票据严格一次性、兑换后不跳转：用户定的。页面令牌取代 cookie（审阅发现同源 cookie 可被借用后，用户同意）；刷新需重新 `/help`：用户接受。

- 令牌请求头名 `X-Relay-Page-Token`、查询参数名 `__rpt`、静态资源放行规则：我的取值。票据 8 位随机码、有效期 1 天：用户定的。
- 过期票据的检查间隔、内存清理周期：实现者自定（不超过 1 分钟即可）。
- 代码组织（新增 `ticketRegistry.mjs` / `sessionStore.mjs` 等）：实现者自定，风格与
  `domainRegistry.mjs` 一致。
