# local-agent-wechat-bridge

`local-agent-wechat-bridge` 是一个本地桥接服务，用来把：

- 微信 bot 通道
- 本地原生 `Claude Code`
- 本地原生 `Codex CLI`

接起来，让你可以直接在微信里和本机上的 `Claude Code` / `Codex` 对话，并保留本地原生会话恢复能力。

这个项目的定位是：

- **本地运行**
- **微信 -> 本地原生 CLI**
- **Native Provider Bridge**
- **不是 ACP bridge**

---

## 项目做什么

这个仓库当前已经实现的主能力有：

- 微信 direct 模式接入，走官方 `getupdates` / `sendmessage`
- 微信扫码登录与 bot token 获取
- 微信消息路由到本地 `Claude Code` / `Codex CLI`
- 会话持久化到 SQLite
- 原生 Claude / Codex 会话扫描
- 原生会话手动接入
- 原生会话自动接入
- 桥接会话与原生会话绑定持久化
- 管理页支持：
  - pairing 审批
  - 授权用户管理
  - provider 切换
  - 会话停止 / 归档
  - 权限审批
  - 原生恢复修复
- Claude 原生恢复能力：
  - `claude --resume <sessionId>`
  - `claude -r '<完整标题>'`
- Codex 原生恢复能力：
  - `codex exec resume --json --last <sessionId>`
  - `codex exec resume --json --last '<thread_name>'`

---

## 当前实现目标

这个仓库的核心目标不是“做一个微信聊天 UI”，而是：

1. 把微信消息稳定接进本地 bridge
2. 把 bridge 会话稳定映射到本地原生 Claude / Codex 会话
3. 让微信侧会话尽可能和本地原生会话恢复链路对齐

其中 Claude 这条链路尤其强调：

- bridge session 有自己的 `resumeTitle`
- 原生会话文件里有对应标题
- `~/.claude/history.jsonl` 里也有对应标题

只有这几层都对齐，`claude -r '<完整标题>'` 才真正可用。

---

## 目录说明

主要目录：

- `src/`
  - bridge 主实现
  - 微信通道
  - provider 接入
  - daemon / admin routes / web
- `tests/`
  - 单元测试
  - bridge 运行态测试
  - 微信 direct 流程测试
  - 前端交互测试
- `scripts/`
  - 正式恢复入口
  - 联调启动脚本
  - 诊断脚本
- `docs/`
  - 详细运行说明
  - 对齐过程文档
  - 参考实现文档

脚本分层索引见：

- [scripts/README.md](/Users/liuyuhua/github/local-agent-wechat-bridge/scripts/README.md:1)

---

## 安装

```bash
cd /Users/liuyuhua/github/local-agent-wechat-bridge
pnpm install
```

---

## 本地启动

启动后端：

```bash
pnpm dev
```

启动前端管理页：

```bash
pnpm web
```

基础校验：

```bash
pnpm typecheck
pnpm test
pnpm build:web
```

---

## 配置

默认配置文件路径：

```text
~/.local-agent-wechat-bridge/config.json
```

可以从示例复制：

```bash
cp config.example.json ~/.local-agent-wechat-bridge/config.json
```

最小配置示例：

```json
{
  "databasePath": "/Users/you/.local-agent-wechat-bridge/bridge.sqlite",
  "wechat": {
    "enabled": true,
    "baseUrl": "https://ilinkai.weixin.qq.com",
    "token": "replace-with-weixin-bot-token",
    "accountId": "replace-with-weixin-account-id"
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

常用环境变量：

- `BRIDGE_PORT`
- `BRIDGE_CONFIG`
- `BRIDGE_WECHAT_ENABLED`
- `BRIDGE_WECHAT_BASE_URL`
- `BRIDGE_WECHAT_TOKEN`
- `BRIDGE_WECHAT_ACCOUNT_ID`
- `BRIDGE_CLAUDE_COMMAND`
- `BRIDGE_CODEX_COMMAND`

---

## 正常使用路径

### 1. 首次使用或微信 token 失效后恢复

最推荐的正式入口：

```bash
bash ./scripts/recover-weixin-runtime.sh
```

这条命令会自动完成：

1. 拉取新的微信登录二维码
2. 生成并自动打开二维码 SVG
3. 等待扫码确认
4. 写出新的微信凭据文件
5. 启动最新 bridge runtime

二维码文件默认路径：

```text
/tmp/bridge-weixin-login-qr.svg
```

扫码状态文件默认路径：

```text
/tmp/bridge-weixin-login-state.json
```

凭据文件默认路径：

```text
/tmp/bridge-weixin-credentials.json
/tmp/bridge-weixin.env
```

### 2. 启动成功后检查 bridge 是否真的连通

```bash
BRIDGE_PORT=8788 bash ./scripts/check-runtime-readiness.sh
```

重点看：

- `weixin_connected`
- `weixin_status`
- `weixin_last_error`

如果是正常连通，通常应该看到：

- `weixin_connected=true`
- `weixin_status=connected`

### 3. 发微信消息开始对话

给当前 bot 账号发一条文本消息。

bridge 收到消息后会：

- 自动授权用户（如果设置中开启）
- 创建或接入 bridge session
- 默认用当前设置的 provider 对话

---

## 管理页有哪些功能

当前管理页主要分成 4 块：

### 1. Dashboard

- daemon 状态
- provider 状态
- 活跃会话数
- 待处理权限数

### 2. WeChatPanel

- 微信扫码登录
- pairing 待审批列表
- 批准 / 拒绝 pairing
- 已授权用户管理
- 撤销授权
- 扫描可恢复原生会话
- 手动接入原生会话
- 自动接入原生会话
- Claude recoverable session 修复

### 3. SessionsPanel

- 查看 bridge 会话
- 查看推荐恢复命令
- 查看 provider resume 命令
- 停止会话
- 归档会话
- 查看原生可达路径
- 查看绑定来源
- 单个 / 批量修复 Claude 原生恢复元数据

### 4. PermissionsPanel

- 批准 / 拒绝 / 中止高风险权限请求

---

## 原生恢复能力

### Claude

当前仓库支持两种恢复方式：

按原生 session id：

```bash
claude --resume <providerSessionId>
```

按 bridge 标题：

```bash
claude -r '<完整标题>'
```

要让 `claude -r` 真正可用，通常至少要满足：

- `providerResumeTitleSynced = true`
- `providerResumeHistorySynced = true`

### Codex

按 session id：

```bash
codex exec resume --json --last <providerSessionId>
```

按 bridge thread name：

```bash
codex exec resume --json --last '<thread_name>'
```

---

## 脚本怎么分

### 正式使用入口

- `scripts/recover-weixin-runtime.sh`
  最推荐的恢复入口
- `scripts/weixin-login-helper.ts`
  单独扫码与落盘凭据
- `scripts/start-runtime-check.sh`
  启动最新 runtime 并打印关键状态

### 诊断 / 验收工具

- `scripts/check-runtime-readiness.sh`
  看 bridge 是否真的连通
- `scripts/check-runtime-recovery.sh`
  看 bridge session 恢复字段
- `scripts/check-weixin-updates.ts`
  直接打微信官方 `getupdates`

如果只想记一个命令：

```bash
bash ./scripts/recover-weixin-runtime.sh
```

---

## 当前已知边界

这个仓库当前已经把工程内能做的链路基本铺平了，但仍有一个非常现实的边界：

- 微信 bot 新授权出来的 token 可能会很快再次 `session timeout`

也就是说，即使：

- 扫码成功
- 新 token 落盘成功
- 最新 runtime 能启动

微信官方 `getupdates` 会话本身仍可能在很短时间后再次失效。

如果出现：

- `weixin_connected=false`
- `weixin_status=session_timeout`
- `weixin_last_error=weixin_get_updates_failed:-14:session timeout`

这更像是微信侧登录 / updates 会话稳定性问题，而不一定是这个 bridge 的业务逻辑问题。

---

## 怎么判断真正成功

一个最小闭环应至少满足：

1. `check-runtime-readiness.sh` 显示：
   - `weixin_connected=true`
   - `weixin_status=connected`
2. 给 bot 发一条真实微信消息后：
   - `/api/channel/sessions` 出现新会话
3. Claude 会话里看到：
   - `providerResumeTitleSynced=true`
   - `providerResumeHistorySynced=true`
4. `claude -r '<完整标题>'` 真能恢复

如果要验 Codex，则再满足：

5. `codex exec resume --json --last '<thread_name>'` 真能恢复

---

## 更多文档

- [docs/README.md](/Users/liuyuhua/github/local-agent-wechat-bridge/docs/README.md:1)
- [scripts/README.md](/Users/liuyuhua/github/local-agent-wechat-bridge/scripts/README.md:1)
