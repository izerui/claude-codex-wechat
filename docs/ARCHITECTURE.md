# 架构总览（Architecture）

> 本文档讲清楚 `claude-codex-wechat` 的**整体架构、数据流与目录结构**，供开发者 / AI 快速建立全局心智模型。
>
> 设计基线（“唯一存在理由”）与不可变约束见 [`AGENTS.md`](../AGENTS.md)；安装与使用见根目录 [`README.md`](../README.md)；运行 / 排障操作见 [`docs/README.md`](./README.md)。

---

## 1. 一句话定位

这是一个**本地 bridge daemon**：把微信对话作为人机交互面，转发进本机原生 `claude` / `codex` CLI 会话，并把 CLI 输出推回微信。

核心原则：**原生 CLI 是事实源，bridge 只是传输/控制面**。bridge 不做平行的 agent runtime，不发明新协议——它让微信用户「像在终端前一样」操作真实 CLI（含 resume、权限审批等原生能力）。

---

## 2. 高层架构

```
┌──────────────┐   getupdates/      ┌────────────────────────────────────────────┐
│   微信用户    │   sendmessage      │            claude-codex-wechat daemon         │
│ (WeChat bot) │ ◄────HTTP 长轮询──► │                 (单进程 Fastify)              │
└──────────────┘                    │                                              │
                                    │  ┌────────────┐      ┌──────────────────┐    │
┌──────────────┐    HTTP/SSE        │  │  Channel    │      │  Session 路由     │    │
│  Web 管理页   │ ◄───/api/*───────► │  │  (weixin-   │─────►│  MessageRouter    │    │
│ (React SPA)  │                    │  │   direct)   │      │  + 会话/绑定存储   │    │
└──────────────┘                    │  └────────────┘      └─────────┬────────┘    │
                                    │         ▲                      │             │
                                    │         │ 出站(配额门控)        ▼             │
                                    │         │            ┌──────────────────┐    │
                                    │         └────────────│  Provider 适配层  │    │
                                    │                      │(claude-code/codex)│    │
                                    │                      └─────────┬────────┘    │
                                    └────────────────────────────────┼─────────────┘
                                                                     │ spawn / stdio
                                                                     ▼
                                                        ┌────────────────────────┐
                                                        │  本机原生 claude / codex │
                                                        │       CLI 进程           │
                                                        └────────────────────────┘
```

- **一个进程同时**提供：微信通道、`/api/*` 管理接口、Web 管理页（生产态由 `@fastify/static` 服务 `dist/web`，开发态由内嵌 Vite middleware 提供，含 HMR）。
- 组装中心是 [`src/daemon/server.ts`](../src/daemon/server.ts) 的 `createDaemonServer()`，它把 channel、router、provider、各 store 接线在一起。

---

## 3. 数据流

### 入站（微信消息 → CLI）

1. **拉取**：`weixin-direct` 通道通过官方 `getupdates` 长轮询收到微信消息（非 webhook）。
2. **鉴权/配对**：`MessageRouter` 判断发信人是否为授权用户；未授权进入 pairing，由管理页或自动授权处理。
3. **指令解析**：`commandParser` 先识别控制指令（如新建/停止/审批等纯文本命令）；普通文本则作为对话内容。
4. **会话归属**：从 `CurrentConversationStore` 取当前会话；若无，`providerAutoAttach` 尝试自动接入一个可恢复的原生会话（按历史绑定优先）。
5. **转发**：选定的 `NativeProviderAdapter` 把文本送进原生 CLI（`startSession` / `sendMessage`），CLI 进程被 spawn 并通过 stdio 通信。

### 出站（CLI 输出 → 微信）

1. Provider 适配器把 CLI 输出解析成统一的 `ProviderEvent` 流（`text_delta` / `message_done` / `tool_event` / `session_state` / `error`）。
2. `MessageRouter` 聚合事件成可读回复。
3. **配额门控**：真实微信通道经 `WeixinOutboundGate`（应对官方 10 条/24h 主动消息限制）后，调 `sendmessage` 推回微信。
4. 管理页通过 SSE（`POST /api/bridge-events`）实时收到同一批事件（状态、权限请求等）。

### 权限审批

CLI 触发的高风险操作 → provider 发出权限请求事件 → 持久化 → 微信用户或管理页做决定 → 决定回流到 provider runtime 放行/拒绝。

---

## 4. 目录结构

```
src/
├── main.ts                  # 开发入口(tsx 直跑)：startDaemon + 内嵌 Vite middleware(HMR)
├── cli.ts                   # 生产 bin 入口：start/init/doctor/print-config 子命令
├── daemon/                  # 进程组装与配置
│   ├── server.ts            #   createDaemonServer() —— 所有模块的接线中心
│   ├── bootstrap.ts         #   startDaemon() —— 加载配置→建 server→挂前端→listen
│   ├── staticFrontend.ts    #   生产态：@fastify/static 服务 dist/web + SPA fallback
│   ├── config.ts            #   配置加载/归一化 + 默认路径(~/.claude-codex-wechat)
│   ├── configPersistence.ts #   把探测到的 provider command 回写配置
│   └── events.ts            #   BridgeEventHub —— 进程内事件总线(供 SSE 订阅)
├── channels/                # 通道抽象与实现
│   ├── types.ts             #   ChannelAdapter / Incoming|Outgoing Message 抽象
│   ├── platforms.ts         #   平台常量(weixin / mock)
│   ├── weixin-direct/       #   微信 direct 模式实现
│   │   ├── managedAdapter.ts   #  ManagedWeixinDirectAdapter(daemon 实际使用)
│   │   ├── adapter.ts          #  底层收发适配
│   │   ├── apiClient.ts        #  官方 getupdates / sendmessage HTTP 客户端
│   │   ├── loginClient.ts      #  扫码登录(拉二维码/轮询确认)
│   │   ├── weixinStateStore.ts #  FileWeixinStateStore —— 凭据/状态落盘
│   │   ├── outboundGate.ts     #  WeixinOutboundGate —— 主动消息配额限流
│   │   ├── mediaCrypto.ts / mediaDownloader.ts # 媒体加解密 / 下载
│   │   └── typingController.ts #  输入态(typing)控制
│   └── mock/                #   mockChannelAdapter(测试用)
├── session/                 # 会话路由与状态(bridge 侧大脑)
│   ├── messageRouter.ts     #   MessageRouter —— 入站消息→provider 的核心路由
│   ├── sessionManager.ts    #   BridgeSessionRecord 会话记录管理
│   ├── currentConversationStore.ts # 当前活跃会话绑定持久化
│   ├── commandParser.ts     #   解析微信文本里的控制指令
│   ├── providerAutoAttach.ts #  首条消息时自动接入可恢复原生会话
│   ├── sessionBridgeTag.ts  #   把 bridge 身份编码进原生会话名(双向绑定标识)
│   └── outboundGate.ts      #   出站投递门面接口
├── providers/               # 原生 CLI 适配层(详见第 5 节)
│   ├── types.ts             #   NativeProviderAdapter 接口 + ProviderEvent
│   ├── defaultProviders.ts  #   默认装配(Claude=Streaming / Codex=Interactive runner)
│   ├── providerRegistry.ts  #   provider 探测/状态(getStatus)
│   ├── claude-code/         #   Claude 适配 + 多种 runner + 恢复元数据修复
│   ├── codex/               #   Codex 适配 + runner + thread/session 扫描
│   └── fake/                #   测试用假 provider
├── storage/                 # 持久化存储
│   ├── runtimeUserStore.ts  #   授权用户(RuntimeUserStore)
│   ├── userStore.ts         #   用户存储接口
│   └── lastProviderSessionStore.ts # 上次 provider 会话(恢复优先级来源)
├── admin/                   # 管理 HTTP 接口
│   ├── channelAdminRoutes.ts #  pairing/授权/会话/恢复修复等 /api/channel/*
│   └── settingsRoutes.ts    #   默认 provider/工作目录/超时等设置
├── shared/                  # 通用工具
│   ├── platform.ts          #   findExecutable / 子进程终止 / 状态路径
│   ├── expandTilde.ts       #   ~ 展开
│   └── bridgeCommandHelp.ts #   微信侧指令帮助文案
└── web/                     # React 管理页前端(Vite 构建 → dist/web)
    ├── App.tsx / Cockpit.tsx / WeChatPanel.tsx
    ├── apiClient.ts         #   调 /api/*
    └── bridgeEventsSocket.ts #  订阅 /api/bridge-events (SSE)
```

> 说明：不存在独立的 `src/permissions/` 目录——权限审批逻辑分布在 `admin/` 路由与 provider 事件流中。

---

## 5. Provider 适配层（核心子系统）

所有 provider 实现统一的 [`NativeProviderAdapter`](../src/providers/types.ts) 接口：

| 方法 | 作用 |
|---|---|
| `startSession` | 启动/恢复一个原生 CLI 会话 |
| `sendMessage` | 发送一轮消息，返回 `AsyncIterable<ProviderEvent>` 流 |
| `stopSession` | 结束会话 |
| `listRecoverableSessions?` | 扫描本机可恢复的原生会话 |
| `attachSession?` | 把某个原生会话接入为当前 bridge 会话 |
| `interruptSession?` / `steerSession?` | 中断 / 向进行中的回合注入消息(原生 steer) |

**装配**（`defaultProviders.ts`）：`ClaudeCodeProvider(ClaudeStreamingRunner)` + `CodexProvider(CodexInteractiveRunner)`。Provider = 协议适配，Runner = 实际驱动 CLI 进程的策略（streaming / headless / interactive / cli，另有 fake runner 供测试）。

### Claude 与 Codex 的 resume 差异

二者都支持「按原生 session id 恢复」和「按标题/名字恢复」，但机制不同：

- **Claude**：`claude --resume <id>` 或 `claude -r '<完整标题>'`。按标题恢复要求标题同步进 `~/.claude/history.jsonl`，因此有一套**恢复元数据修复**（`ensureClaudeSessionBridgeMetadata` 等），管理页可单个/批量修复，状态可观测（`providerResumeTitleSynced` / `providerResumeRepairable`）。
- **Codex**：`codex resume <id>` 或 `codex resume '<thread_name>'`，通过 `nativeThreads` / `sessionIndex` 扫描，`syncCodexThreadForResume` 对齐 thread 名。

`sessionBridgeTag` 把 bridge 身份编码进原生会话名，使「微信发起的回合」与「人在终端敲的回合」落在同一条原生 transcript，从而双向可续。

---

## 6. 入口与构建

| 入口 | 用途 | 前端挂载 |
|---|---|---|
| `src/main.ts` | 开发：`pnpm dev`（tsx 直跑 TS） | 内嵌 Vite middleware（HMR） |
| `src/cli.ts` | 生产：`bin` 命令 `claude-codex-wechat` | `@fastify/static` 服务 `dist/web` |

两者都调用 `daemon/bootstrap.ts` 的 `startDaemon()`，前端挂载方式以**回调注入**——因此 `bootstrap` 不依赖 vite，生产打包（esbuild）完全不会把 vite 带进产物。

构建链（`pnpm build`）：
- `vite build` → `dist/web/`（前端静态资源）
- `scripts/build-server.mjs`（esbuild）→ `dist/server/cli.js`（CLI/daemon，依赖 external，`better-sqlite3` 保持原生外置）

---

## 7. 配置与数据落盘

- 默认配置：`~/.claude-codex-wechat/config.json`（`BRIDGE_CONFIG` 可覆盖）。
- 同目录下落盘：SQLite、微信凭据/状态、媒体文件等。
- 关键环境变量：`BRIDGE_PORT`、`BRIDGE_CONFIG`、`BRIDGE_CLAUDE_COMMAND`、`BRIDGE_CODEX_COMMAND`、`BRIDGE_WECHAT_*`。

---

## 8. 关键不变量（务必遵守）

摘自 [`AGENTS.md`](../AGENTS.md)，改动前请对照：

1. **原生 CLI 是事实源**：bridge 不得变成平行 agent runtime 或独立协议。
2. **双向会话连续性**：微信回合与终端回合必须落在同一原生 transcript，任一侧可经 CLI 原生 resume 接续。
3. **暴露而非重造原生能力**：session id、resume、消息流、权限提示都要镜像原生 CLI 语义。
4. **微信是人机控制面**：new/stop/approve/deny 等控制以微信纯文本为主，Web 管理页为辅。

> 若某改动为了 bridge 内部便利而偏离原生 CLI 行为，几乎一定是错的。
