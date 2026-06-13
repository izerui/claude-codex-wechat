# local-agent-wechat-bridge 运行说明

## 1. 项目定位

`local-agent-wechat-bridge` 是一个本地运行的桥接层，用来把：

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
cd /Users/liuyuhua/github/local-agent-wechat-bridge
```

安装依赖：

```bash
pnpm install
```

启动 daemon：

```bash
pnpm dev
```

启动 web 管理页开发模式：

```bash
pnpm web
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
~/.local-agent-wechat-bridge/config.json
```

也可以通过环境变量覆盖：

```bash
export BRIDGE_CONFIG=/absolute/path/to/config.json
```

最小配置示例：

```json
{
  "databasePath": "/Users/you/.local-agent-wechat-bridge/bridge.sqlite",
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

### SessionsPanel
- list sessions
- stop session
- archive session

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

---

## 10. 建议的日常使用顺序

1. 启动 daemon：

```bash
pnpm dev
```

2. 启动 web UI：

```bash
pnpm web
```

3. 在管理页点击 **Scan to Login**，完成微信扫码登录
4. 从微信发送第一条消息，触发 pairing
5. 在管理页审批 pairing
6. 在管理页观察 session / permissions / provider status
7. 如需验证真实 provider contract，再显式运行 `BRIDGE_REAL_*` 测试
