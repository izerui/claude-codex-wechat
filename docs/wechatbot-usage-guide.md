# WeChat iLink Bot API 使用指南（wechatbot）

> 整合自官方开源项目 [`corespeed-io/wechatbot`](https://github.com/corespeed-io/wechatbot)（文档站 <https://www.wechatbot.dev/zh/nodejs>）的协议文档与 Node.js SDK 源码，并与本仓库三份参考文档及 `src/channels/weixin-direct` 实测结果交叉验证。

## 0. 文档目的与来源

这是一份面向工程实现的 **微信 iLink Bot API** 完整使用指南，覆盖：端点、调用方式、字段、请求头、数据模型、规则约束、错误码、注意事项、最佳实践，以及本仓库当前实现与官方协议的差异。

来源与权威级别（从高到低）：

| 标记 | 来源 | 说明 |
|------|------|------|
| `[协议]` | `corespeed-io/wechatbot` → `docs/protocol.md` | 官方协议参考，端点/字段/错误码的第一来源 |
| `[SDK]` | `corespeed-io/wechatbot` → `nodejs/src/**` | 官方 Node.js SDK 源码，行为的权威实现 |
| `[本地文档]` | 本仓库 `docs/2026-06-19-hermes-*` 等三份 | 既有整理，方向性参考 |
| `[本地实现]` | 本仓库 `src/channels/weixin-direct/**` | 当前 weixin-direct 实现 |
| `[实测]` | 本会话实测 | 运行日志与判定实验得到的结论 |

验证状态图例：✅ 已交叉验证一致 · ⚠️ 存在差异/需注意 · 🔬 实测结论（官方文档未记载）

---

## 1. 总览

- iLink Bot 是 **个人微信** 的机器人接入（不是企业微信 WeCom），底层是腾讯 **iLink Bot API**。`[协议][本地文档]`
- ⚠️ **主动推送有硬配额**:用户每发一条消息会刷新 token 并开 24 小时窗口,窗口内 bot 最多主动发 **10 条**;超时或超额即被拒。详见 §6.3。
- 接入模型：**扫码登录 + 长轮询拉消息（getupdates）+ 直接发消息（sendmessage）**。不需要 webhook / 公网回调 / WebSocket。`[协议][本地文档]` ✅
- 登录连接到的是一个 **iLink bot 身份**（形如 `xxxx@im.bot`），不是可完全脚本控制的普通个人号。后果：**bot 通常进不了普通微信群、也收不到群事件**——群聊不应作为默认承诺，私聊 DM 才是可靠路径。`[本地文档]`
- 默认地址：`[协议][SDK]`
  - Base URL：`https://ilinkai.weixin.qq.com`
  - CDN URL：`https://novac2c.cdn.weixin.qq.com/c2c`

---

## 2. 登录与凭据

### 2.1 扫码登录流程 `[协议]`

```
# 1) 取二维码
GET /ilink/bot/get_bot_qrcode?bot_type=3
→ { qrcode: "<token>", qrcode_img_content: "<url>" }

# 2) 轮询扫码状态
GET /ilink/bot/get_qrcode_status?qrcode=<token>
Headers: { "iLink-App-ClientVersion": "1" }
→ { status: "wait" | "scaned" | "confirmed" | "expired",
    bot_token?, ilink_bot_id?, ilink_user_id?, baseurl? }
```

状态流：`wait`（等待扫码）→ `scaned`（已扫码）→ `confirmed`（已确认，返回凭据）/ `expired`（二维码过期）。`[协议][本地文档]`

### 2.2 登录产物（最小凭据集合）`[协议][本地文档]`

- `account_id` / `ilink_bot_id`
- `bot_token`
- `baseurl`（即后续所有请求的 Base URL）

### 2.3 凭据持久化与恢复 `[SDK][本地文档]`

- 凭据应落盘，**一次扫码、多次重启复用**；只有会话失效时才需要重新扫码。
- 官方 SDK 默认 `storage: 'file'`，目录 `~/.wechatbot`。

---

## 3. 通用请求约定

### 3.1 所有 POST 请求的公共头 `[协议]` ✅

```
Content-Type:     application/json
AuthorizationType: ilink_bot_token
Authorization:    Bearer <bot_token>
X-WECHAT-UIN:     <base64(String(randomUint32))>
```

### 3.2 公共请求体字段 `base_info` `[协议]` ⚠️

官方要求**每个 POST body 都带**：

```jsonc
{ "base_info": { "channel_version": "<version>" } }
```

`channel_version` 官方 SDK 取自 `package.json` 的版本号。`[SDK]`

> ⚠️ **本仓库差异**：`src/channels/weixin-direct/apiClient.ts` 当前发送的是 `base_info: {}`（缺 `channel_version`，apiClient.ts:50/83/153/190）。目前网关宽容可用，但与官方协议不一致，网关收紧时存在隐患。

### 3.3 `X-WECHAT-UIN` 生成方式 ⚠️

- 官方：`base64(String(randomUint32))` —— 先把随机 uint32 **转成字符串**再 base64。`[协议]`
- 本仓库：`Buffer.from(4 个随机字节).toString('base64')` —— 把 4 个**原始字节**直接 base64（managedAdapter.ts:100-104）。`[本地实现]`

> ⚠️ 两者编码不同。当前能跑通，但严格意义上与官方不一致，建议对齐为「随机数的字符串形式再 base64」。

---

## 4. 端点详解

### 4.1 长轮询收消息 `getupdates` `[协议][SDK]` ✅

```
POST /ilink/bot/getupdates
Body: { "get_updates_buf": "<cursor>", "base_info": {...} }
超时: 服务端 hold 约 35s 后返回（长轮询）
→ { ret: 0, msgs: [...], get_updates_buf: "<new_cursor>" }
```

- **游标 `get_updates_buf`** 必须持久化，重启后从上次位置继续。`[协议][SDK]`
- 正常 timeout（无消息）→ 立即重新 poll；错误 → 指数退避（见 §7）。`[SDK]`
- `errcode: -14` = 会话过期，需重新登录。`[协议]`
- 入站消息携带 `context_token`，**必须立刻记录**（见 §6）。`[协议][SDK]`

### 4.2 发消息 `sendmessage` `[协议][SDK]` ✅

```jsonc
POST /ilink/bot/sendmessage
Body: {
  "msg": {
    "from_user_id": "",
    "to_user_id": "<user_id>",
    "client_id": "<uuid>",          // 客户端去重用，每条随机
    "message_type": 2,               // BOT
    "message_state": 2,              // FINISH
    "context_token": "<来自该用户最近一条入站消息>",   // 关键，见 §6
    "item_list": [{ "type": 1, "text_item": { "text": "..." } }]
  },
  "base_info": {...}
}
→ { ret: 0 }   // 成功；非 0 见 §8
```

- 成功判定**必须检查 body 的 `ret`/`errcode`**，不能只看 HTTP 200，否则业务失败会被静默吞掉。`[本地文档][SDK]`
- 长文本要分块（见 §7.1）。
- 媒体消息把 `item_list` 换成图片/文件/视频条目（见 §4.5、§5）。

### 4.3 输入状态 `getconfig` + `sendtyping` `[协议][SDK]` ✅

```
POST /ilink/bot/getconfig
Body: { "ilink_user_id": "<id>", "context_token"?, "base_info": {...} }
→ { typing_ticket: "<ticket>" }

POST /ilink/bot/sendtyping
Body: { "ilink_user_id": "<id>", "typing_ticket": "<ticket>", "status": 1|2, "base_info": {...} }
```

- `status`：`1` = 开始输入，`2` = 停止输入。`[本地实现][协议]`
- `typing_ticket` 按用户缓存约 **10 分钟**。`[本地文档]`
- `status=1` 下发后约 **60 秒自动消失**；若需持续显示，需在 60 秒内重发。`status=2` 立即清除，通常可按单次开始/结束 best-effort 使用。`[本地文档][协议]`

### 4.4 媒体上传 `getuploadurl` `[协议]`

```
POST /ilink/bot/getuploadurl
→ { upload_param: "<encrypted>" }

POST <cdn>/upload?encrypted_query_param=<param>&filekey=<key>
Content-Type: application/octet-stream
Body: AES-128-ECB 加密后的字节
响应头: x-encrypted-param → 下载用 param
```

### 4.5 媒体下载 `[协议]`

```
GET <cdn>/download?encrypted_query_param=<param>
→ AES-128-ECB 密文 → 用 aes_key 解密
```

媒体走 **AES-128-ECB 加密 CDN**（不是裸 URL passthrough）。`[协议][本地文档]`

---

## 5. 数据模型与枚举 `[SDK]` ✅

### 5.1 枚举

```ts
enum MessageType     { USER = 1, BOT = 2 }
enum MessageState    { NEW = 0, GENERATING = 1, FINISH = 2 }
enum MessageItemType { TEXT = 1, IMAGE = 2, VOICE = 3, FILE = 4, VIDEO = 5 }
enum MediaType       { IMAGE = 1, VIDEO = 2, FILE = 3, VOICE = 4 }
```

- `message_type`：收到的用户消息是 `1(USER)`；bot 发出的是 `2(BOT)`。
- `message_state`：`2(FINISH)` 是完整消息；`1(GENERATING)` 可用于"生成中"流式占位（高级用法）。
- `item_list[].type` 用 `MessageItemType`。

### 5.2 消息条目结构（节选）`[SDK]`

```ts
interface WireMessageItem {
  type: MessageItemType
  text_item?:  { text: string }
  image_item?: { media?: CDNMedia; thumb_media?: CDNMedia; aeskey?: string; url?: string; ... }
  voice_item?: { media?: CDNMedia; text?: string; playtime?: number; ... }   // text=转写文本
  file_item?:  { media?: CDNMedia; file_name?: string; md5?: string; len?: string }
  video_item?: { media?: CDNMedia; thumb_media?: CDNMedia; play_length?: number; ... }
  ref_msg?:    { title?: string; message_item?: WireMessageItem }            // 引用消息
}

interface CDNMedia {
  encrypt_query_param: string
  aes_key: string            // 见 §5.3 三种格式
  encrypt_type?: 0 | 1
  full_url?: string          // 服务端给完整下载 URL 时直接用
}
```

### 5.3 AES 密钥三种格式 `[协议]`

| 格式 | 示例 | 用于 |
|------|------|------|
| base64(原始 16 字节) | `ABEiM0RVZneImaq7zN3u/w==` | `CDNMedia.aes_key`（格式 A） |
| base64(hex 字符串) | `MDAxMTIyMzM0NDU1...` | `CDNMedia.aes_key`（格式 B） |
| 直接 hex（32 字符） | `00112233445566778899aabbccddeeff` | `image_item.aeskey` |

---

## 6. `context_token`：最关键的约束 🔬✅

### 6.1 规则 `[协议][SDK]`

- **发任何消息（回复或主动）都必须带 `context_token`**——它把消息路由到正确的会话上下文。
- token **只来自用户的入站消息**：每条入站消息带一个 `context_token`，按 `(account, userId)` 缓存。
- 应 **持久化并在重启后恢复**；**会话过期/重新登录时清除**。
- 官方 SDK 行为模型：内存 Map 缓存 + 落盘（`ContextStore`），入站 `remember()` 更新，出站自动回填。`[SDK]`

### 6.2 官方 SDK 的硬性校验 `[SDK]`

`MessageSender.sendText` / `sendMedia`（`nodejs/src/messaging/sender.ts`）：

```ts
const ctx = contextToken ?? this.contextStore.get(userId)
if (!ctx) throw new NoContextError(userId)
// NoContextError: "No context_token cached for user <id>. A message from this user must be received first."
```

即 **没有 context_token 时官方 SDK 直接拒发**（连请求都不发），并明确提示"必须先收到该用户的消息"。

### 6.3 主动推送的本质限制（平台硬约束）🔬

iLink bot **不能脱离用户最近的上下文主动推送**——这是平台的**反骚扰硬约束**，类似公众号「48 小时客服消息窗口」。

**精确规则**(领域知识;iLink 服务端强制,**客户端代码与官方文档均不体现**,所以在 SDK / openclaw / corespeed 仓库里都搜不到):

- 用户每给 bot 发**一条**消息,就**刷新**出一个最新 `context_token`,并开启一个 **24 小时窗口**。
- 在该窗口内,bot 用这个 token **最多主动发 10 条**消息。
- **超过 24 小时** 或 **用满 10 条** → 主动推送被网关拒绝(返回 `-3`,见 §8)。
- 下一条用户入站消息会**刷新 token、重置 24 小时窗口与 10 条配额**。

也就是说,主动推送有**两个叠加的维度**:① 必须有有效 `context_token`(上下文);② 窗口内 24h / 10 条的**配额**。任一耗尽都发不出。

**结论:无法绕过。** 官方 SDK 自身的设计就是"无有效 token 即拒发"。让主动推送可用的唯一办法是 **维持新鲜 token**——而 token 只能由用户的新入站消息刷新。

工程上可做的:
- **持久化 token**(避免重启丢失);
- **本地记账**:按 `(account, userId)` 跟踪"窗口起点 + 已发条数",接近 10 条 / 临近 24h 时**主动降级提示**(告诉操作者"主动推送额度将尽/已尽,请让用户在微信发条消息以恢复"),而不是静默失败或谎报成功;
- 把回复/系统通知都计入配额——10 条很容易用完,非必要的主动消息应克制。

> 🔬 **判定实验**（本会话已验证）：在微信端给 bot 发一条消息刷新 token 后，立即在网页控制台连续多次新建会话——通知**全部送达**；长时间不发消息后再试——第二次起失败。证实根因为 token 时效 + 配额，而非代码去重或一次性消费。

---

## 7. 约束与限制清单

### 7.1 文本长度与分块 `[协议][SDK]` ✅

- 文本平台上限 **4000 字符**（SDK 常量 `MAX_TEXT_LENGTH = 4000`）。
- 未超限保持单条气泡；超限才分块。
- 分块优先级：**段落 `\n\n` → 换行 `\n` → 空格 → 硬切**；尽量不在代码块中间切。
- 多块之间建议加 **~0.3s** 延迟，避免微信限频丢消息。`[本地文档]`

> ⚠️ SDK `sender.ts` 注释写「2000 字符」，但实际常量是 `4000`——以 **4000** 为准（注释为笔误）。
> ⚠️ **本仓库差异**：当前 `weixin-direct` 未实现 4000 分块，长消息可能被平台拒收且（若不查 `ret`）静默丢失。

### 7.2 长轮询与重试退避 `[协议][SDK]`

- `getupdates` 服务端 hold 约 **35s**。
- 重试策略（官方）：第 1-2 次瞬时错误 **2s** 后重试；连续 3 次以上退避 **30s**；`errcode=-14` 会话过期暂停 **10 分钟**（通常需重新登录）；正常 timeout 立即重 poll。`[本地文档][SDK]`

### 7.3 去重 `[本地文档]`

- 按 message ID 做 **5 分钟窗口去重**，避免网络抖动/重复 poll 导致重复处理。

### 7.4 单 token 互斥 `[本地文档]`

- 同一个 `bot_token` 同时只能被一个本地 gateway 使用；若另一进程已持有同 token 的轮询，应启动失败（实例互斥），而不是并行 poll。

### 7.5 群聊不可靠 `[本地文档]`

- iLink bot 一般进不了普通群、也收不到群事件。群策略（`open`/`allowlist`/`disabled`）**只有在 iLink 实际投递群事件时才有意义**。默认按「私聊可用、群聊不保证」设计。

### 7.6 Markdown `[本地文档]`

- 微信客户端可渲染 Markdown（标题/表格/代码块）。发送前主要处理**长度与边界**，不要为兼容而过度去格式。

### 7.7 typing ticket `[本地文档]`

- `typing_ticket` 按用户缓存约 10 分钟。
- typing 指示在 `status=1` 后约 60 秒自动消失；`status=2` 立即清除。

---

## 8. 错误码

### 8.1 协议级（body 内）`[协议]` + 实测补充 🔬

| 返回 | 含义 | 处理 | 来源 |
|------|------|------|------|
| `ret: 0` | 成功 | — | `[协议]` |
| `errcode: -14` | 会话过期 | 重新登录；暂停轮询 ~10min | `[协议]` |
| `ret: -2` | 参数错误 | 检查请求体/字段 | `[协议]` |
| `-3 : unknown_error` | **官方文档未记载**；实测出现在主动推送**上下文失效或配额耗尽**时——即 `context_token` 过期(超 24h)、缺失、或 24h 窗口内已发满 10 条(见 §6.3) | 视为「需要用户发新消息刷新 token/配额」，降级提示，不要静默重试 | 🔬 `[实测]` |

> 务必同时检查 `errcode` 与 `ret`（官方 SDK 两者都判）。

### 8.2 SDK 错误类 `[SDK]`

| 类 | code | 含义 |
|----|------|------|
| `ApiError` | `API_ERROR` | iLink 服务端返回错误；`isSessionExpired` = `errcode === -14` |
| `AuthError` | `AUTH_ERROR` | 二维码过期 / 登录失败 |
| `NoContextError` | `NO_CONTEXT` | 该用户无 context_token（必须先收到其消息） |
| `MediaError` | `MEDIA_ERROR` | 加密 / 上传 / 下载失败 |
| `TransportError` | `TRANSPORT_ERROR` | 网络传输层错误 |

---

## 9. 调用方式

### 9.1 官方 Node.js SDK（最省心）`[SDK]`

```bash
npm install @wechatbot/wechatbot   # 需 Node >= 22（原生 fetch），零运行时依赖
```

```ts
import { WeChatBot } from '@wechatbot/wechatbot'

const bot = new WeChatBot({
  storage: 'file', storageDir: '~/.wechatbot', logLevel: 'info',
  loginCallbacks: { onQrUrl: (url) => renderQrCode(url), onScanned: () => {} },
})

bot.onMessage(async (msg) => {
  await bot.sendTyping(msg.userId)
  await bot.reply(msg, `Echo: ${msg.text}`)   // reply 自动带回 context_token
})

await bot.run()   // = login() + start()
```

常用 API：`login() / start() / run() / stop() / isRunning`；`onMessage() / download()`；`reply(msg, content) / send(userId, content)`（content 支持 `string | {text} | {image,caption} | {video,caption} | {file,fileName} | {url}`）；`sendTyping() / stopTyping()`；`use(middleware)`；事件 `login/message/session:expired/session:restored/error/poll:start/poll:stop/close`。

> 关键：`send(userId, ...)`（主动发）与 `reply(msg, ...)` 一样**都要求 context_token**，无则抛 `NoContextError`。

### 9.2 原始 HTTP（本仓库 weixin-direct 走这条）`[本地实现]`

发文本等价于：

```
POST {baseUrl}/ilink/bot/sendmessage
Headers: Content-Type/AuthorizationType/Authorization: Bearer {token}/X-WECHAT-UIN
Body: { msg: { to_user_id, client_id: <uuid>, message_type: 2, message_state: 2,
               item_list: [{type:1,text_item:{text}}], context_token? },
        base_info: { channel_version } }
```

---

## 10. 本仓库 `weixin-direct` 与官方协议的差异 / 改进建议

| # | 项 | 官方 | 本仓库现状 | 建议 |
|---|----|------|-----------|------|
| 1 | `base_info` | `{ channel_version }` `[协议]` | `{}`（apiClient.ts） | 补 `channel_version` ⚠️ |
| 2 | `X-WECHAT-UIN` | `base64(String(randomUint32))` `[协议]` | `base64(4 原始字节)`（managedAdapter.ts） | 对齐为「数字字符串再 base64」 ⚠️ |
| 3 | `context_token` 校验 | 无则拒发（`NoContextError`）`[SDK]` | 可选，有就带、没有也发 → 易被 `-3` 拒 | 发送前校验；缺失时不要硬发 |
| 4 | `context_token` 持久化 | 内存 + 落盘 + 重启恢复 `[SDK]` | 仅内存 `Map`（adapter.ts） | 持久化，避免重启丢上下文 |
| 5 | 4000 分块 | 有 `[SDK]` | 无 | 补长文本分块 + 块间延迟 |
| 6 | 发送成功判定 | 查 `ret`/`errcode` `[SDK]` | 已查 ✅（apiClient.ts:54-60） | 维持 |
| 7 | 主动通知失败处理 | —（SDK 不主动） | 已改 best-effort（不阻断创建）`[本地实现]` | 叠加降级提示（见 §6.3） |

---

## 11. 关于"主动推送 / 绕过 token 限制"的最终结论

**绕不过。** `context_token` 是 iLink 平台的反骚扰硬约束，官方 SDK 自身在无 token 时直接拒发。主动推送只能在「用户最近发过消息、token 仍新鲜」的窗口内进行。

可落地的应对：

1. **持久化 token**（重启不丢，延长可用窗口的连续性）。
2. **失败可见可恢复**：主动推送失败时，前端/调用方明确提示「通知未送达 · 请在微信端给 bot 发条消息以恢复推送」，不要静默或谎报成功。
3. 不要依赖「服务端定时主动 push」类设计——它在平台层面就不被支持。

---

## 12. 参考来源

- 官方仓库：<https://github.com/corespeed-io/wechatbot>
  - `docs/protocol.md`（协议）、`docs/architecture.md`
  - `nodejs/README.md`、`nodejs/src/{core,messaging,protocol,auth,media,message}/**`
- 官方文档站：<https://www.wechatbot.dev/zh/nodejs>
- 本仓库参考：`docs/2026-06-19-hermes-weixin-api-capabilities.md`、`docs/2026-06-14-openclaw-weixin-reference.md`、`docs/2026-06-14-aioncore-weixin-reference.md`
- 本仓库实现：`src/channels/weixin-direct/apiClient.ts`、`adapter.ts`、`managedAdapter.ts`
