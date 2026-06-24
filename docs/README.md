# claude-codex-wechat 运行说明

> 想先了解整体架构 / 数据流 / 目录结构？见 [ARCHITECTURE.md](./ARCHITECTURE.md)。本文聚焦运行与排障操作。

## 1. 项目定位

`claude-codex-wechat` 是一个本地运行的桥接层，用来把：

- 微信 channel（默认通过 AionCore / OpenClaw 风格 direct 模式接入）
- 本地原生 `claude` / `codex` CLI

连接起来，并提供一个本地管理页用于：

- pairing / approve / revoke
- session list / stop / archive
- permission request 审批
- settings 管理
- provider status 查看

本项目的目标是 **Native Provider Bridge**，不是 ACP bridge。

---

## 2. 安装与启动

工程目录：

```bash
cd /Users/liuyuhua/github/claude-codex-wechat
```

安装依赖：

```bash
pnpm install
```

启动 daemon（前端管理页通过内嵌 Vite middleware 在同一进程同端口提供，默认 `127.0.0.1:8787`）：

```bash
pnpm dev
```

生产构建前端：

```bash
pnpm build:web
```

基础校验：

```bash
pnpm typecheck
pnpm test
```

---

## 3. 配置文件

默认配置文件路径：

```text
~/.claude-codex-wechat/config.json
```

也可以通过环境变量覆盖：

```bash
export BRIDGE_CONFIG=/absolute/path/to/config.json
```

最小配置示例：

```json
{
  "databasePath": "/Users/you/.claude-codex-wechat/bridge.sqlite",
  "wechat": {
    "enabled": true,
    "mode": "direct",
    "baseUrl": "https://ilinkai.weixin.qq.com",
    "token": "your-weixin-bot-token",
    "accountId": "your-weixin-account-id"
  },
  "providers": {
    "claude": {
      "command": "/opt/homebrew/bin/claude"
    },
    "codex": {
      "command": "/opt/homebrew/bin/codex"
    }
  }
}
```

### 可用环境变量

#### 通用

- `BRIDGE_PORT`
- `BRIDGE_CONFIG`

#### Provider command 覆盖

- `BRIDGE_CLAUDE_COMMAND`
- `BRIDGE_CODEX_COMMAND`

这些环境变量会在配置文件没有设置 command 时作为回退值。

---

## 4. WeChat 接入

当前主路径默认对齐 `AionCore` / `openclaw-weixin` 的 direct 模式。

### 扫码登录

管理页通过：

```http
GET /api/channel/weixin/login
```

提供 SSE 登录事件流：

- `qr`
- `scanned`
- `done`
- `error`

`done` 事件返回：

- `accountId`
- `botToken`
- `baseUrl`

前端收到后会自动启用 `weixin` channel。

### 收消息

当前主实现通过官方 `getupdates` 长轮询拉取微信消息，而不是依赖外部 webhook。

如果管理页或 `/api/channel/plugins` 显示：

- `connected = false`
- `status = "session_timeout"`

说明当前微信 bot token 对应的拉取会话已经失效。此时不是 bridge 逻辑没接通，而是需要重新扫码登录，刷新一份新的 `botToken`。

也可以直接运行：

```bash
BRIDGE_PORT=8788 ./scripts/check-runtime-readiness.sh
```

重点看：

- `weixin_connected`
- `weixin_status`
- `weixin_last_error`

如果出现：

- `weixin_connected=false`
- `weixin_status=session_timeout`
- `weixin_last_error=weixin_get_updates_failed:-14:session timeout`

就说明需要重新扫码登录。

如果你想绕过管理页，直接在本地终端触发一次新的扫码登录，可以运行：

```bash
pnpm tsx scripts/weixin-login-helper.ts
```

它会：

- 调官方登录接口拉取一个新的二维码 ticket
- 在终端打印二维码数据与 ticket
- 生成一个本地 SVG 二维码文件，默认路径：
  - `/tmp/bridge-weixin-login-qr.svg`
- 如果二维码过期，会自动刷新下一张新的二维码并继续等待，不需要手动重跑脚本
- 持续轮询直到返回新的：
  - `accountId`
  - `botToken`
  - `baseUrl`
- 确认成功后自动写出两份可复用凭据文件：
  - `/tmp/bridge-weixin-credentials.json`
  - `/tmp/bridge-weixin.env`

其中：

- `bridge-weixin-credentials.json` 适合合并到 bridge 配置
- `bridge-weixin.env` 可以直接 `source` 后重启 runtime

例如：

```bash
source /tmp/bridge-weixin.env
BRIDGE_PORT=8788 BRIDGE_RUNTIME_DIR=/tmp/bridge-runtime-check bash ./scripts/start-runtime-check.sh
```

拿到新的 `botToken` 后，就可以继续做真实消息闭环验收。

如果你希望把“扫码登录 + 落盘凭据 + 拉起最新 runtime”合成一步，也可以直接运行：

```bash
bash ./scripts/recover-weixin-runtime.sh
```

这个脚本会在扫码确认后直接调用 `start-runtime-check.sh`，因此更适合做一次完整恢复。

### 发消息

当前主实现通过官方 `sendmessage` 发送微信消息，并自动带回 `context_token`。

---

## 5. 管理页主要功能

当前管理页已经支持：

### Dashboard
- daemon status
- provider status（Claude/Codex）
- active sessions
- pending permissions

### WeChatPanel
- pending pairings
- approve / reject
- authorized users list
- revoke user
- recoverable native Claude/Codex session scan
- manual attach native session
- auto-attach native session
- recoverable Claude native session repair
- recoverable Claude native session batch repair
- recoverable native session resume state visibility: `已同步 / 待修复 / 不可修复`

### SessionsPanel
- list sessions
- stop session
- archive session
- show preferred resume command
- show provider resume command
- show Claude resume-by-title command when the native session title belongs to the bridge
- show Codex resume-by-thread-name command when the native thread name is bridge-owned
- show provider native reachability/path
- show binding status
- show binding details
- show Claude native resume repair state
- repair attached Claude native resume metadata from the admin UI
- batch repair attached Claude native resume metadata from the admin UI

### PermissionsPanel
- approve / deny / abort permission requests

### SettingsPanel
- default provider
- default workspace
- permission timeout
- wechat throttle
- high-risk policy

---

## 6. Provider 状态与真实联调

### Claude
检测：

```bash
claude --version
```

项目当前已经根据真实 CLI 行为修正：

- `--print + --output-format stream-json` 需要 `--verbose`

常见状态：

- `detected · <version>`：CLI 可用
- `missing_binary`：当前 command path 找不到 `claude`
- `command_failed`：CLI 存在，但执行 `--version` 或消息流命令失败

### Codex
检测：

```bash
codex --version
```

当前 Codex 真实联调已经证明：

- 最小 contract 至少能完成执行并给出 `message_done`
- 但真实输出未必总会给出 parser 之前假设的 `text_delta/session_state`
- 因此当前 real contract 测试使用“已证实 contract”而不是过度假设

常见状态：

- `detected · <version>`：CLI 可用
- `missing_binary`：当前 command path 找不到 `codex`
- `command_failed`：CLI 存在，但执行 `--version` 或最小消息流命令失败

---

## 7. Real probe / real contract tests

默认情况下，真实 CLI 联调测试是跳过的，不影响日常开发。

### Claude real tests

```bash
BRIDGE_REAL_CLAUDE=1 pnpm test tests/claudeRealProbe.test.ts tests/claudeHeadlessRunner.real.test.ts
```

### Codex real tests

```bash
BRIDGE_REAL_CODEX=1 pnpm test tests/codexRealProbe.test.ts tests/codexCliRunner.real.test.ts
```

这些测试用于：

- 验证 CLI 是否真实可用
- 验证最小真实消息流 contract
- 在 CLI 行为变化时第一时间暴露 drift

---

## 8. 当前工程验证状态

当前还新增并已验证的能力：

- Claude bridge session 原生恢复状态可观测：
  - `providerResumeTitleSynced`
  - `providerResumeRepairable`
- Claude recoverable native session 原生恢复状态可观测：
  - `providerResumeTitleSynced`
  - `providerResumeRepairable`
- Claude recoverable native session 可直接修复，不必先 attach
- Claude recoverable native session 支持批量修复
- Claude attached bridge session 支持批量修复

这些能力的目标是把“微信对话 -> 本地原生 `claude -r` 恢复”的历史遗留差异尽量压平，降低个人使用时逐个排障的成本。

---

## 9. 最新实例真实验收辅助脚本

当前已有三个和真实切换验收直接相关的辅助脚本：

```bash
./scripts/start-runtime-check.sh
./scripts/check-runtime-readiness.sh
./scripts/check-runtime-recovery.sh
```

它们分别用于：

- `start-runtime-check.sh`
  - 用独立端口和独立数据库拉起一份最新工作树实例
- `check-runtime-readiness.sh`
  - 汇总当前 runtime 是否已经具备真实验收前置条件
  - 包括：
    - 微信插件是否启用/连接/有 token
    - runtime-config 是否有 account/token
    - Claude/Codex 是否已有 title-mode 推荐恢复命令
    - Claude bridge session 是否已有 native resume sync / repairable 信号
- `check-runtime-recovery.sh`
  - 只聚焦当前 bridge session 的恢复字段汇总

截至当前，项目已验证：

- `pnpm typecheck` 通过
- `pnpm test` 通过
- `pnpm build:web` 通过

测试规模：

- 29 个测试文件
- 69 个通过
- 4 个 skip（real probe / real contract）

---

## 9. 当前已完成闭环

### 用户授权生命周期
- pairing request
- approve
- authorized user list
- revoke
- revoke 后重新进入 pairing

### session 生命周期
- create/list
- stop
- archive
- UI 可操作

### permission 生命周期
- provider request
- persistence
- admin decision
- decision 回流 provider runtime

### provider native 路线
- Claude native/headless runner 基线
- Codex native/CLI runner 基线
- provider command path 可配置
- provider status UI
- opt-in real contract tests
- native provider session_id persistence
- daemon restart resume
- recoverable native session scan
- manual attach
- admin auto-attach
- runtime auto-attach on first authorized message
- persistent provider binding priority

---

## 10. 当前“完全对齐”还差什么

当前工程已经做到：

- bridge 侧的微信消息与 Claude/Codex 原生 session 连续对话
- provider session_id 持久化
- bridge 重启后 resume
- recoverable session 扫描 / attach / auto-attach
- 历史绑定优先恢复
- 管理页可观测绑定状态、恢复来源、原生标题、推荐恢复命令、绑定详情、原生路径
- Claude 原生完整标题恢复
- Codex 原生 thread_name 恢复

但还没有完全做到：

- 原生 Claude 侧存在一个稳定、官方、bridge 可完全控制并可靠回读的绑定标识
- 因此当前恢复虽然已经具备高质量自动接管与本地确定性绑定，但原生侧还不是 100% 对称闭环

可以把当前状态理解为：

- **bridge 侧已高度对齐**
- **原生 Claude 存储侧还差最后一层确定性桥接标识**

---

## 11. 建议的日常使用顺序

1. 启动 daemon：

```bash
pnpm dev
```

2. 在管理页（同一进程同端口，默认 `127.0.0.1:8787`）点击 **Scan to Login**，完成微信扫码登录
3. 从微信发送第一条消息
4. 如果未开启自动授权，则在管理页审批 pairing
5. 如果需要恢复原生 Claude/Codex 会话：
   - 先试管理页的 **自动接入 Claude/Codex 会话**
   - 不满足时再用 **扫描原生会话** + **接入会话**
6. 在管理页观察 session / permissions / provider status / binding status
7. 如需验证真实 provider contract，再显式运行 `BRIDGE_REAL_*` 测试

### 最新实例切换与验收

如需在不打断旧实例的前提下，拉起**当前工作树**的新实例并验证真实微信链路，见：

- `docs/2026-06-14-runtime-cutover-checklist.md`
