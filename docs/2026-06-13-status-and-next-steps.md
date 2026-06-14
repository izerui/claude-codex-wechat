# claude-codex-wechat 状态与下一步（2026-06-13）

## 1. 项目目标回顾

该工程的目标是做一个**本地 Native Agent ↔ 微信 clawbot Bridge**，而不是 ACP bridge。

核心方向保持不变：

- **微信入口**：对接现有个人微信 clawbot / clawbot wrapper，不在本项目里实现个人微信协议。
- **Claude Code**：优先走 native/headless 方向，不走 ACP。
- **Codex**：优先走 native 方向，不走 ACP。
- **管理页**：提供 pairing、授权用户、session、provider 状态、settings 等可视化入口。
- **权限桥接**：把 provider 的 permission request 映射到微信和管理页。

当前代码整体仍然与这个方向一致。

---

## 2. 已完成内容

### 2.1 工程骨架与基础设施

已完成：

- 独立新工程已创建：`/Users/liuyuhua/github/claude-codex-wechat`
- 基础技术栈已落地：
  - Node.js
  - TypeScript
  - pnpm
  - Fastify
  - better-sqlite3
  - Vitest
  - Vite + React
- 已有基础脚本：
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build:web`

### 2.2 核心桥接抽象

已完成核心接口：

- `src/channels/types.ts`
- `src/providers/types.ts`

已支持：

- `ChannelAdapter`
- `NativeProviderAdapter`
- `ProviderEvent`
- `PermissionRequest`
- `decidePermission()` provider hook

说明：
用户后续对 `src/providers/types.ts` 的修改是正确的，尤其是把：

- `decidePermission?(...)`

补进 `NativeProviderAdapter`，这与后续 messageRouter / permission forwarding 的方向完全一致，应保留。

### 2.3 Session / Permission 核心能力

已完成：

- `src/session/commandParser.ts`
- `src/session/sessionManager.ts`
- `src/permissions/permissionRouter.ts`

额外已对齐并确认正确的用户改动：

#### `SessionManager`
新增：
- `updateActiveSession(...)`
- `archiveSession(...)`

这是正确增强，原因：
- 已经开始支持 active session 的原地更新
- 后续 `/new codex`、切换 provider、stop/archive session 都需要这些能力
- 不偏离原设计

#### `PermissionRouter`
新增：
- `getRequest(requestId)`

这是正确增强，原因：
- 后续将 permission decision 路由到 provider runner 时，需要先回查 request
- 有助于实现 persistence、恢复、审计和 provider-level forwarding

### 2.4 Mock / Fake 验证闭环

已完成：

- `src/channels/mock/mockChannelAdapter.ts`
- `src/providers/fake/fakeProviderAdapter.ts`
- 对应测试

当前 fake provider 已增强：
- 记录 `permissionDecisions`
- 记录 `stoppedSessions`
- 实现 `decidePermission(...)`

这是正确增强，说明工程已经不只是“发消息”，而是在验证**权限回流链路**。

### 2.5 SQLite 持久化层

已完成并扩展：

- `src/storage/schema.ts`
- `src/storage/userRepository.ts`
- `src/storage/pairingRepository.ts`
- `src/storage/runtimeSessionRepository.ts`
- `src/storage/permissionRequestRepository.ts`
- `src/storage/messageLogRepository.ts`
- `src/storage/settingsRepository.ts`
- `src/storage/repositories.ts`

其中用户新增的 `settings` 表和 repository export 是合理的：

#### `schema.ts`
新增：
- `settings` 表

这是正确增强，原因：
- 管理页已经开始出现 settings routes
- clawbot config / channel plugin enable state / default workspace 等都应进入 settings 层

#### `repositories.ts`
现在已导出：
- `RuntimeSessionRepository`
- `PermissionRequestRepository`
- `MessageLogRepository`
- `SettingsRepository`

这也符合工程演化方向，说明该项目已经从 M1/M2 进入更完整的 runtime + admin 管理阶段。

### 2.6 WeChat clawbot HTTP adapter

已完成：

- `src/channels/wechat-clawbot/types.ts`
- `src/channels/wechat-clawbot/messageMapping.ts`
- `src/channels/wechat-clawbot/client.ts`
- `src/channels/wechat-clawbot/adapter.ts`

当前已支持：

- inbound payload → `ChannelIncomingMessage`
- `ChannelOutgoingMessage` → clawbot send body
- outbound HTTP send
- adapter 收发能力

这与原设计完全一致。

### 2.7 WeChat 入站 / pairing / admin 基础能力

已完成：

- `src/daemon/channelRoutes.ts`
- `src/admin/channelAdminRoutes.ts`
- `src/admin/settingsRoutes.ts`
- `src/session/messageRouter.ts`
- `src/daemon/config.ts`
- `src/providers/defaultProviders.ts`

现在实际能力已经超出最初 M2 的最低闭环：

已实现/已具备：
- 未授权用户触发 pairing
- approve pairing 时创建 authorized user
- 已授权用户发消息时通过 `messageRouter` 驱动 provider
- message、permission、runtime session、settings 已有持久化雏形
- provider defaults 已经开始统一装配

这些都说明项目已经从“只做 transport”前进到了“初步 runtime orchestration”。

### 2.8 管理页

已完成：

- `src/web/App.tsx`
- `src/web/apiClient.ts`
- `src/web/WeChatPanel.tsx`

管理页当前已支持：
- Daemon status
- Provider status
- Pairings list
- Authorized users list
- approve / reject pairing

### 2.9 Claude 方向

已完成：

- `src/providers/claude-code/claudeDetection.ts`
- `src/providers/claude-code/claudeRunner.ts`
- `src/providers/claude-code/fakeClaudeRunner.ts`
- `src/providers/claude-code/claudePermissionMapping.ts`
- `src/providers/claude-code/claudeProvider.ts`
- `src/providers/claude-code/claudeHeadlessRunner.ts`
- 对应测试：
  - `tests/claudeDetection.test.ts`
  - `tests/claudePermissionMapping.test.ts`
  - `tests/claudeProvider.test.ts`
  - `tests/claudeHeadlessRunner.test.ts`
  - `tests/claudeHeadlessRunner.real.test.ts`
- `tests/claudeRealProbe.test.ts`（默认 skip，`BRIDGE_REAL_CLAUDE=1` 时执行）

说明：
Claude 部分已经不只是 facade，而是已经开始进入 headless runner 实现阶段。

### 2.10 Codex 方向

用户已经新增：

- `src/providers/codex/codexDetection.ts`
- `src/providers/codex/codexCliRunner.ts`
- `src/providers/codex/codexProvider.ts`
- 对应测试：
  - `tests/codexDetection.test.ts`
  - `tests/codexCliRunner.test.ts`
  - `tests/codexProvider.test.ts`

这代表项目已经并行推进 Codex native 方向，不再只停留在 Claude M3。

### 2.11 ProviderRegistry

当前：

- `src/providers/providerRegistry.ts`

已经扩展为：
- Claude detection
- Codex detection

这是正确的，不需要回退。

---

## 3. 当前验证状态

截至目前，已确认：

- `pnpm typecheck` 通过
- `pnpm test` 通过
- `pnpm build:web` 通过

最近一次全量测试结果：
- **21 个测试文件**（其中 1 个 skipped）
- **57 个测试**（其中 1 个 skipped）
- 全部通过

这说明：
- 当前用户新增改动没有破坏已有架构
- 当前代码仍保持可继续演进状态

---

## 4. 与原设计方案的对齐判断

### 4.1 明确“正确并应保留”的改动

以下改动是正确的，应继续沿用：

1. `NativeProviderAdapter` 增加 `decidePermission()`
2. `SessionManager` 增加 `updateActiveSession()`
3. `SessionManager` 增加 `archiveSession()`
4. `PermissionRouter` 增加 `getRequest()`
5. `FakeProviderAdapter` 记录 permission decisions / stopped sessions
6. `schema.ts` 增加 `settings` 表
7. `repositories.ts` 扩展更多 runtime 仓库导出
8. `channelRoutes.ts` 接入 `messageRouter`
9. `providerRegistry.ts` 同时检测 Claude / Codex
10. `main.ts` 开始从 config 加载数据库路径和 wechat 配置

### 4.2 暂未发现需要回退的错误方向

目前没有看到必须整体回退的实现方向。

但有两类地方仍需要后续确认和约束：

#### A. Claude headless runner 的真实协议边界
目前已有：
- `claudeHeadlessRunner.ts`
- `claudeHeadlessRunner.real.test.ts`

需要继续确认：
- 是否真的稳定依赖 `claude` CLI 的某种输出协议
- 是否直接基于 `stream-json`
- 权限 request 的真实 payload shape 是否和当前 mapping 假设一致

结论：
- 方向是对的
- 但需要继续通过 real probe 和 contract test 固化

#### B. Codex native 路线的收敛
当前代码名是：
- `codexCliRunner.ts`

这意味着用户更偏向“Codex CLI runner”而不是我们之前建议的“appServer 为默认”。

结论：
- 这不一定错
- 但要尽快统一：
  - 是用 CLI text/structured stream？
  - 还是 appServer-style？
- 否则后续 provider contract 可能会变得不一致

建议：
- 以当前已写的 `codexCliRunner.ts` 为实际实现方向继续推进
- 不要强行拉回最初的 appServer 设想
- 只要它仍符合 `NativeProviderAdapter` 抽象即可

---

## 5. 已完成 vs 未完成清单

## 5.1 已完成

### 基础工程
- [x] 独立工程创建
- [x] TypeScript / Fastify / React / SQLite 基础设施
- [x] typecheck / test / build 管道
- [x] `.gitignore`

### 核心抽象
- [x] ChannelAdapter
- [x] NativeProviderAdapter
- [x] ProviderEvent
- [x] PermissionRequest

### 核心 runtime
- [x] command parser
- [x] session manager
- [x] permission router
- [x] message router
- [x] fake provider / mock channel

### 存储层
- [x] users
- [x] pairings
- [x] runtime sessions
- [x] permission requests
- [x] message log
- [x] settings

### WeChat
- [x] clawbot HTTP client
- [x] adapter
- [x] inbound route
- [x] pairing flow
- [x] approve 后创建 authorized user
- [x] admin pairing/users/settings APIs
- [x] 管理页基础 WeChatPanel

### Claude
- [x] detection
- [x] runner contract
- [x] fake runner
- [x] permission mapping
- [x] provider facade
- [x] headless runner 初稿
- [x] provider status UI

### Codex
- [x] detection 初稿
- [x] runner 初稿
- [x] provider facade 初稿
- [x] provider status UI

## 5.2 未完成

### 高优先级未完成
- [ ] Claude real runtime contract 固化
- [ ] Codex real runtime contract 固化
- [ ] permission decision 真正回流到真实 Claude/Codex runner
- [ ] provider session 生命周期在 SQLite 中完全对齐
- [ ] session stop/archive 的 API 与 UI
- [ ] message log 在管理页查看

### 中优先级未完成
- [ ] channel plugin enable/disable 与 settings 的完整闭环
- [ ] provider status UI 更清晰的展示
- [ ] authorized user revoke
- [ ] pairing expire / cleanup
- [ ] group chat mention / command prefix 规则

### 低优先级未完成
- [ ] attach existing Claude sessions
- [ ] attach existing Codex sessions
- [ ] 更细的权限 UI
- [ ] 远程 token auth / non-localhost admin access

---

## 6. 我建议的下一步顺序

### Step 1：先稳定 Claude/Codex real contract
优先原因：
- 现在抽象层已经足够完整
- 真正的不确定性主要在 provider runtime 协议
- 应优先把“外部不确定性”压实

建议顺序：
1. 固化 `claudeHeadlessRunner.real.test.ts`
2. 固化 `codexCliRunner` real probe / contract test
3. 只验证“探测 + 单轮消息 + 权限请求出现”的最小闭环

### Step 2：补全 permission 回流
需要验证：
- `/api/permissions/decide`
- `messageRouter.decidePermission(...)`
- provider.decidePermission(...)`
- 真实 runner 收到该决定

这是整个 bridge 真正成型的关键。

### Step 3：补 session admin API
增加：
- list sessions
- stop session
- archive session
- maybe switch provider

因为你已经有 `archiveSession()` 了，这一步顺势推进最自然。

### Step 4：补文档和 settings 管理页
最后做管理页的细节整理。

---

## 7. 现在最适合继续推进的技术任务

如果继续编码，我建议直接做下面这条：

### 下一任务建议
**把 `messageRouter` + `provider.decidePermission()` + `PermissionRequestRepository` 的链路做成完整闭环测试，并确保 Claude/Codex fake runner 都能接收到 decision。**

原因：
- 这是 bridge 的核心闭环
- 当前基础已经齐
- 改动范围清晰
- 能直接提升真实可用性

---

## 8. 当前工程状态结论

结论很明确：

1. 你的改动总体上是**沿着原设计正确推进**的。  
2. 当前项目已经从“概念桥接骨架”进入“可运行 runtime 雏形”。  
3. 目前不应回退已有改动，而应在现有方向上继续收敛：
   - 固化 provider 协议
   - 打通 permission 回流
   - 补 session 管理 API

如果后面继续推进，我应该以**你当前仓库状态为最新真实基线**，而不是按更早的计划机械回滚或重做。
