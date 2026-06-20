# 顶部驾驶舱重设计 — 双引擎舱 + 通道条

日期：2026-06-20
状态：已确认设计，待评审

## 背景与问题

控制台首屏当前是 `App.tsx` 里的 `StatusCards`，一行四张等宽卡：**Claude / Codex / 微信通道 / 当前会话**。其下是 `WeChatPanel`，里面的"微信通道"卡又重复展示了：网关、当前活跃用户，以及一整块当前会话详情（提供方徽章、状态、会话 ID、工作目录、创建/活跃时间）。

问题：
- 顶部"当前会话"卡只显示状态 + 路径，与下方面板的会话详情块是**同类信息的重复**。
- 四张等宽卡未体现一个核心事实：**当前会话只会承载在 Claude 或 Codex 二者之一上**。
- 通道信息（网关、活跃用户）在顶部缺席、却在下方面板出现，状态分散。

## 目标

把顶部四卡 + 微信通道信息整合为一个"驾驶舱"式状态区，要求：
- 不丢字段、不冗余：每类信息只出现一次。
- 突出状态：Claude / Codex 各自的检测状态，以及"当前会话二选一"的归属关系。
- 移动端友好。
- 视觉上像一块仪表盘，可脱离"一行多列"的等宽约束。

## 选定方案：A · 双引擎舱 + 通道条

驾驶舱 = 顶部状态仪表；面板 = 下方操作区。会话详情与通道信息**只在驾驶舱出现一次**，下方面板不再重复。

自上而下三段：

### 1. 通道条（Channel Strip）
一条窄卡，横跨整宽。承载从下方面板上移的通道信息 + 连接操作：
- 状态点 + "微信通道" + 连接状态徽章（已连接 / 连接中 / 会话超时 / 轮询异常 / 未连接）
- 活跃用户（连接时）
- 网关 baseUrl（连接时，等宽字体、超长省略号 + hover 全文）
- 右侧操作：已启用时显示"断开"按钮；未连接时显示"扫码登录 / 重新扫码登录"按钮
- 未连接态：点击登录后，二维码区在通道条**下方**展开（沿用现有 QR EventSource 流程与 `QRCodeSVG`）
- 提示/错误（`formatPluginHint` / `plugin.lastError`）保留，显示在通道条下方

### 2. 双引擎舱（Engine Bays）
两个并排卡：Claude 与 Codex。每个引擎舱展示该引擎的检测状态。承载当前会话的引擎为**活跃态**，另一个为**待命态**。

通用字段（两态都有）：
- 状态点 + 引擎名（Claude / Codex）
- 版本徽章 `vX.Y.Z`（detected）或检测失败原因（未找到可执行文件 / 命令执行失败 / 其他 reason）
- 可执行命令路径（等宽，省略号 + hover）

活跃态额外（仅承载当前会话的那一个）：
- 视觉提升：accent 边框 + 柔光（参考 mockup 的 `mk-active`），右上角徽章"运行中 · 当前会话"（按会话 status 着色）
- 展开会话详情块（从下方面板上移）：会话 ID、工作目录、原生标题（`nativeTitle ?? resumeTitle`，存在才显示）、创建时间 · 最后活跃时间
- 当 provider 检测失败但仍有会话时：仍显示会话详情，状态徽章按会话 status 走

待命态（未承载当前会话的那一个）：
- 收起，仅显示版本/检测状态 + 命令路径 + "待命"中性徽章
- 无会话时两个引擎舱都是待命态

判定"哪个引擎活跃"：`currentSession.providerId`（`'codex'` → Codex，否则 Claude）。无 `currentSession` 或通道未连接时无活跃舱。

### 3. 操作面板（精简后的 WeChatPanel 下半部）
保留：标签页（新建会话 / Claude 会话 / Codex 会话 / 会话默认值 / 帮助说明）+ 对应表单/列表（逻辑不变）。

删除：
- 原"微信通道"卡里的网关、活跃用户信息块（已上移到通道条）
- 原当前会话详情块（已上移到活跃引擎舱）
- 原 card-header 里的"断开"按钮（已上移到通道条）
- 登录按钮 + QR 区从原位置移到通道条下方

### 移动端
- 通道条：内部元素 flex-wrap 换行（状态行一行、网关一行、操作按钮换行）
- 双引擎舱：纵向堆叠，**活跃舱在上**（用 grid 让活跃舱 order 在前，或渲染顺序上把活跃的放前）
- 操作面板：保持现有响应式

## 架构与改动

为最小化扰动连接状态机，**驾驶舱作为 `WeChatPanel` 的顶部渲染**，复用其已持有的 `plugin / activeUser / runtimeConfig / currentSession / loginState / qrcodeData / disconnect / startQrLogin`。`providerStatus`（claude/codex 检测信息）由 `App` 下传给 `WeChatPanel`。

### 文件改动

**新增 `src/web/Cockpit.tsx`** — 纯展示组件 + 格式化函数：
- `ChannelStrip`：props 为 plugin、activeUser、gateway(baseUrl)、连接操作回调（onLogin / onDisconnect / busy / loginState）
- `EngineBay`：props 为引擎名、provider 检测信息、是否活跃、currentSession（活跃时）
- `EngineBays`：渲染两个 `EngineBay`，根据 currentSession 决定活跃归属与移动端排序
- 把 `formatProviderStatus / providerTone / readProviderCommand` 从 `App.tsx` 迁移到此（供引擎舱使用）

**`src/web/App.tsx`**：
- 删除 `StatusCards` 与 `StatusCard` 及仅其使用的 provider/plugin/session 格式化函数
- 把 `providerStatus` 作为 prop 传入 `<WeChatPanel>`
- header（标题 + 在线徽章 + 地址）保留不变

**`src/web/WeChatPanel.tsx`**：
- 接收新 prop `providerStatus`
- 顶部渲染 `ChannelStrip` + `EngineBays`（替换原"微信通道"信息卡里的网关/活跃用户/会话详情块、断开按钮、登录/QR 区的位置）
- QR 区、登录按钮、提示/错误移到 `ChannelStrip` 下方
- 标签页与表单逻辑不变

**`src/web/styles.css`**：
- 新增驾驶舱样式：`.engine-bay`、`.engine-bay-active`（accent 边框 + 柔光 + 渐变背景）、通道条相关布局类
- 复用现有 token 与 `.soft-card / .badge-* / .status-dot`

## 数据流

`App` 已在 `refresh()` 中并行拉取 `fetchStatus / fetchProviderStatus / fetchChannelState`，并已取用 `channelState.plugin`。`providerStatus` 已在 App state 中，直接下传即可。`activeUser / runtimeConfig.baseUrl` 仍由 `WeChatPanel` 自己的 `fetchChannelState` 提供（现状如此），无需在 App 额外取。bridge 事件订阅（plugin-status-changed / current-session-changed / user-authorized）逻辑不变。

## 状态枚举与着色（沿用现有规则）

- 通道状态徽章/文案：沿用 `formatPluginBadge / formatPluginBadgeClass`
- provider 状态：沿用 `formatProviderStatus / providerTone`
- 会话状态徽章：沿用 `formatSessionStatusBadgeClass`
- provider 标签：沿用 `formatProviderLabel`

## 测试影响

`tests/web/appDashboard.test.tsx` 断言：标题、Claude/Codex 文案、`在线`、`v2.0.1`、`未找到可执行文件`、`/opt/bin/claude`、`/opt/bin/codex` 均可见。新驾驶舱仍渲染引擎名、版本、检测失败原因、命令路径，因此这些断言应继续通过（用的是 `findAllByText`，允许多处出现）。`tests/web/appInteractions.test.tsx`、`providerDiagnostics.test.tsx`、`sessionLogs.test.tsx` 需在实现后跑一遍确认；若有针对旧 `StatusCard` 结构的断言，按新结构更新。

## 验收标准

- 顶部无独立"当前会话"卡；会话详情只出现在活跃引擎舱内一次
- 通道信息（网关/活跃用户/连接状态/断开/登录）只出现在通道条一次
- 当前会话归属在对应引擎舱高亮可辨，另一引擎舱为待命态
- 连接态 / 未连接态 / 无会话态 / provider 检测失败态均正确渲染
- 桌面与移动端（窄屏）布局均不溢出、不丢字段
- 既有微信通道功能（扫码登录、断开、新建/接入会话、默认值、帮助）行为不变
- `pnpm test` 全绿

## 不做（YAGNI）

- 不改后端 API
- 不改会话并发/接入逻辑
- 不引入新的图表/动画库；柔光用 CSS box-shadow 即可
