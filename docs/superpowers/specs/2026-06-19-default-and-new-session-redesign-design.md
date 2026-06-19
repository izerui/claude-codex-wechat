# 「默认会话设置」重构设计

日期：2026-06-19
状态：待实现

## 背景与问题

web 端的「默认会话设置」卡（`src/web/WeChatPanel.tsx:396-429`）定位混乱：一张卡同时承担了两种性质不同的语义。

1. **工作目录（defaultWorkspace）** —— 纯默认值。仅在无当前会话、需新建时作 cwd 兜底，改它不影响任何正在进行的对话，也不发通知。
2. **提供方（defaultProvider）当默认值用** —— 新用户首次授权、autoAttach 无当前会话时用它选 provider。
3. **提供方当"实时开关"用** —— 改 provider 并保存，`src/admin/settingsRoutes.ts:38-49` 会立刻给微信用户推一条"对话模型已切换为 X"。

矛盾在于：卡名叫"默认设置"（像给以后用的配置），但改 provider 发"已切换"通知（像现在马上切）；而真相是若当前已有会话在跑，`getCurrent()` 非空、autoAttach 直接返回 null（`src/daemon/server.ts:116`），provider **根本不会切到当前会话**，只有下一个新会话才生效。那条"已切换"通知是误导的根源。

### 关键技术事实

切 provider 在技术上**不可能原地发生**：Claude 进程与 Codex 进程是两个独立进程，对话历史也无法跨 provider 迁移。代码里微信命令 `use_provider` 的实现（`src/session/messageRouter.ts:325-339`）就是 `conversation.create()` —— 开一个新会话。因此对 provider 而言，"真实切换" ≡ "开下一个新会话"，是同一件事。

## 目标

把一张语义打架的卡拆成两个定位清晰的功能：

1. **默认值**（名词，配置）：回答"未指定时用什么"。
2. **新建会话**（动词，动作）：回答"现在开一个什么"。

明确放弃：不做"原地改当前会话目录"（保留历史的 in-place 改目录），该需求继续由微信 `/cwd` 命令承担。

## 设计

### 功能一：会话默认值（保留，做减法）

- **定位**：纯兜底默认值。仅在微信端开启新会话、且未显式指定时按它新建。
- **字段**：提供方（claude-code / codex）+ 工作目录。
- **持久化**：保存到 config 文件（行为不变，`src/admin/settingsRoutes.ts` 的 persist 部分保留）。
- **改动**：
  - 删除 `src/admin/settingsRoutes.ts:38-49` 中"provider 变化 → 发微信'已切换'通知"的整段逻辑。
  - 改默认值 → 不发任何消息、不触碰当前会话。
- **UI**：留在原设置卡位置，卡名/副标题点明"仅在未指定时生效"（具体文案实现时定）。

### 功能二：新建会话（新功能）

- **定位**：显式选 provider + 目录，开一个新对话，立即成为当前会话。这就是 provider"切换"的真身，与微信 `/use`、`/new` 完全同源。
- **UI**：放到顶部「当前会话」信息块附近（`src/web/WeChatPanel.tsx:332-355` 一带），形态为：provider 下拉 + 目录输入框（预填默认值的 defaultWorkspace）+「新建会话」按钮。
- **后端**：新增端点 `POST /api/channel/sessions/new`（`src/admin/channelAdminRoutes.ts`）。
  - 入参：`{ providerId, cwd, platformUserId, chatId? }`，沿用 attach 端点的用户解析模式（`platformUserId → users.isActiveUser → user`，`chatId = body.chatId ?? user.platformUserId`，`ownerUserId = user.id`）。
  - 逻辑：`conversation.create({ chatId, ownerUserId, providerId, cwd })` → `events.emit({ type: 'channel.current-session-changed' })`。
  - 通知：给微信用户发一条**真实**的"已新建 {provider} 会话，目录：{cwd}"（不误导，因确实新建了）。

## 涉及文件

- `src/web/WeChatPanel.tsx` —— 拆 UI：默认值卡做减法；会话区新增"新建会话"表单。
- `src/admin/settingsRoutes.ts` —— 删除 provider 变化的"已切换"通知逻辑。
- `src/admin/channelAdminRoutes.ts` —— 新增 `POST /api/channel/sessions/new` 端点。
- `src/web/apiClient.ts` —— 新增调用新端点的客户端方法。

## 不做（YAGNI）

- 不做 web 端"原地改当前会话目录"（保留历史）—— 继续靠微信 `/cwd`。
- 不改微信端命令行为（`/use`、`/new`、`/cwd` 保持原样）。
- 不动 config 持久化结构。
