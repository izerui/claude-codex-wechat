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
6. **唤起与排队**：离线时消息 A 恢复原生会话，启动中到达的 B 走 `MessageRouter` 的普通队列。provider 尚未就绪时返回插话未提交，不在 runner 中另存、补交或改开一轮重试；只要会话未换，A、B 都按正常队列处理。

### 出站（CLI 输出 → 微信）

1. Provider 适配器把 CLI 输出解析成统一的 `ProviderEvent` 流（`text_delta` / `message_done` / `tool_event` / `turn_end` / `background_tasks` / `user_prompt` / `session_state` / `error`）。
2. `MessageRouter` 只把每一轮的结论发出：助手文字先攒着，遇到 `tool_event`（工具调用、Codex 的 commentary）就当过程说明作废，`turn_end` 时一次发出；过程说明任何情况下都不发，一轮没有结论文字且没有后台任务时只发一条「本轮已结束，没有文字回复」的状态提示，不据此判失败或让用户重复执行任务。
3. **后台工作**：参考 imux，一轮结算后还有后台任务时补发任务说明，同一任务集合不重复提示。Claude 使用原生后台任务快照（兼容明确标为后台的任务事件），Codex 使用原生子代理状态；不把前台子代理或内部监控算作后台提示。后台跨轮时保留原生事件读取，后续结论不依赖用户再发消息。
4. **配额门控**：真实微信文本经 `WeixinOutboundGate`，按实际消息分段持久化、串行发送；额度不足保留未发部分，下一次刷新后继续发送，不吞用户新消息，不按内容年龄删除结果。确认使用送达回执，只有问题完整送达后才接受手机作答。已结束请求的待发确认不再推送。
5. 管理页通过 SSE（`POST /api/bridge-events`）实时收到同一批事件（状态、权限请求等）。CLI 默认不按沉默时长自动终止；空闲超时只在显式配置后启用。

### 权限审批

会话默认跳过权限（Claude `--dangerously-skip-permissions`、Codex `approvalMode: never`），只有必须由人决定的才停下来问：

- Claude 以 `--permission-prompt-tool stdio` 启动，AskUserQuestion、ExitPlanMode 及跳过权限仍要确认的调用经 stdout 的 `can_use_tool` 控制请求到达；Codex 的提问经 app-server 的 `item/tool/requestUserInput` 到达。
- provider 发出 `user_prompt`，`MessageRouter` 推到微信（提问逐题、多个请求排队），送达后收到的非命令纯文本消息作为回答，经 `respond` 写回 CLI（Claude 的 `control_response`、Codex 的请求结果）。不复述用户自己的选择；随口一句话被当成拒绝并转告或计划修改意见时，才说明并写明是哪一步。CLI 撤回请求或这一轮结束时，推到过手机的确认告诉用户已失效。问题尚未送达时先补推并提示再次作答；带附件的确认回复明确提示未提交。
- 电脑端无人值守，不设超时也不代答；`/stop`、换会话或这一轮结束时一律按拒绝交回，CLI 不会卡住。等待期间 provider 的卡死判定暂停。

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
- 关键环境变量：`BRIDGE_PORT`、`BRIDGE_HOST`（默认 `127.0.0.1`）、`BRIDGE_CONFIG`、`BRIDGE_CLAUDE_COMMAND`、`BRIDGE_CODEX_COMMAND`、`BRIDGE_WECHAT_*`。

---

## 8. 关键不变量（务必遵守）

摘自 [`AGENTS.md`](../AGENTS.md)，改动前请对照：

1. **原生 CLI 是事实源**：bridge 不得变成平行 agent runtime 或独立协议。
2. **双向会话连续性**：微信回合与终端回合必须落在同一原生 transcript，任一侧可经 CLI 原生 resume 接续。
3. **暴露而非重造原生能力**：session id、resume、消息流、权限提示都要镜像原生 CLI 语义。
4. **微信是人机控制面**：new/stop/approve/deny 等控制以微信纯文本为主，Web 管理页为辅。

> 若某改动为了 bridge 内部便利而偏离原生 CLI 行为，几乎一定是错的。
