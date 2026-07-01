# claude-codex-wechat

`claude-codex-wechat` 是一个本地 bridge daemon。它把：

- WeChat direct 通道
- 本机原生 `Claude Code`
- 本机原生 `Codex CLI`

接起来，让 WeChat 用户可以直接驱动本机上的原生 CLI 会话，并尽量保留原生 resume 能力。

这个仓库的定位不是另起一套 agent runtime，也不是 ACP bridge。它的目标一直是：

- WeChat 作为人类控制面
- 本地原生 CLI 作为真实执行面
- 两边尽量共享同一条原生会话恢复链路

## 当前能力

当前实现覆盖的主能力：

- WeChat direct 模式接入
- WeChat 轮询收消息与主动回消息
- 本地原生 `Claude Code` / `Codex CLI` 会话桥接
- 会话持久化与当前会话恢复
- 原生 Claude / Codex recoverable session 列表与 attach
- 本地管理页
- npm 全局安装与生产 CLI 入口
- 本地发布 npm 包

## 项目结构

主要目录：

- `src/`
  - daemon、provider、session、channel、web 主实现
- `tests/`
  - 单元测试、运行态测试、前端测试
- `scripts/`
  - 诊断与辅助脚本
- `docs/`
  - 设计说明、对齐文档、参考资料

脚本说明见 [scripts/README.md](./scripts/README.md)。

## 安装

### 作为 npm 包安装

```bash
npm install -g claude-codex-wechat --registry=https://registry.npmmirror.com/
# 或
pnpm add -g claude-codex-wechat
```

说明：

- 该包依赖 `better-sqlite3`
- 大多数常见平台会直接下载预编译二进制
- 少数环境可能需要本地编译工具链
- Node 版本要求：`>=20`

## 快速开始

安装后按以下顺序跑通：

```bash
# 1. 后台启动（首次会自动注册为系统服务并守护运行；
#    首次启动自动生成 relay 接入凭据、自动连接默认中转，无需手动配置）
claude-codex-wechat start

# 2. 打开管理页，用微信扫码登录完成绑定
#    http://127.0.0.1:8787

# 3. 查看状态 / 日志
claude-codex-wechat status
claude-codex-wechat logs

# 可选：检查环境（配置、前端产物、claude/codex 是否就绪）
claude-codex-wechat doctor
```

启动后：

- 管理页：`http://127.0.0.1:8787`（在此扫码登录微信）
- 微信侧即可直接给机器人发消息，驱动本机 `Claude Code` / `Codex CLI` 会话

停止 / 重启 / 卸载：

```bash
claude-codex-wechat restart
claude-codex-wechat stop
claude-codex-wechat uninstall
```

### 从源码安装

```bash
cd /Users/liuyuhua/github/claude-codex-wechat
pnpm install
```

## CLI 命令

生产态 CLI 入口在 `dist/server/cli.js`，通过 `bin` 暴露为 `claude-codex-wechat`。

可用命令：

- `claude-codex-wechat start`
  - 后台启动服务（未安装则自动注册系统服务），默认命令
- `claude-codex-wechat stop`
  - 停止后台服务
- `claude-codex-wechat restart`
  - 重启后台服务
- `claude-codex-wechat status`
  - 查看运行状态
- `claude-codex-wechat logs` / `tail`
  - 打印 / 实时跟随日志
- `claude-codex-wechat doctor`
  - 检查配置、前端产物、`claude`/`codex` 可执行文件
- `claude-codex-wechat uninstall`
  - 卸载后台服务
- `claude-codex-wechat print-config`
  - 打印当前配置文件
- `claude-codex-wechat help`
  - 显示帮助

默认监听地址：

- `http://127.0.0.1:8787`

## 配置

默认配置文件路径：

```text
~/.claude-codex-wechat/config.json
```

该文件在**首次 `start` 时自动创建**（并自动写入生成的 relay 接入凭据），正常使用无需手动编辑。以下为可选的进阶自定义示例：

```json
{
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
  },
  "bridge": {
    "defaultProvider": "claude-code",
    "defaultWorkspace": "/absolute/path/to/workspace"
  }
}
```

如果要接入自建 `relay-server`，可在同一份配置里增加：

```json
{
  "tunnel": {
    "provider": "relay",
    "enabled": true,
    "relay": {
      "serverUrl": "wss://relay.style520.com/agent",
      "authToken": "replace-with-relay-auth-token"
    }
  }
}
```

说明：

- `relay-server` 可作为独立服务部署
- 当前 bridge 只需要配置 `serverUrl` 与 `authToken`
- 当前本地开发公网链路默认走 `relay-server`
- 启用后，bridge 连接 relay-server 时会获得一个随机公网访问路径
- 典型地址形如：`https://wechat.style520.com/sjdfh2xxx`

开发备注：

- 前端侧“接入码”主实现位于 [src/web/accessCode.ts](./src/web/accessCode.ts)
- [src/web/activationCode.ts](./src/web/activationCode.ts) 仅保留为兼容 re-export，新的实现不要继续写入该文件
- 迁移剩余兼容项与对应测试证据见 [docs/2026-06-28-access-code-migration-notes.md](./docs/2026-06-28-access-code-migration-notes.md)

环境变量：

- `BRIDGE_PORT`
- `BRIDGE_CONFIG`
- `BRIDGE_WECHAT_ENABLED`
- `BRIDGE_WECHAT_BASE_URL`
- `BRIDGE_WECHAT_TOKEN`
- `BRIDGE_WECHAT_ACCOUNT_ID`
- `BRIDGE_CLAUDE_COMMAND`
- `BRIDGE_CODEX_COMMAND`

## 本地开发

开发模式启动：

```bash
pnpm dev
```

这会：

- 启动 daemon
- 在同一进程里挂 Vite middleware
- 提供本地管理页与前端热更新

开发检查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

构建产物：

- `dist/web/`
  - 前端静态资源
- `dist/server/cli.js`
  - 生产 CLI / daemon 入口

## 生产运行

首次跑通流程见上方「快速开始」。`start` 会把当前 CLI 注册成操作系统服务并守护拉起。

常用管理命令：

```bash
claude-codex-wechat start      # 后台启动 / 启动已安装服务
claude-codex-wechat restart    # 重启
claude-codex-wechat status     # 状态
claude-codex-wechat logs       # 最近日志
claude-codex-wechat tail       # 实时日志
claude-codex-wechat stop       # 停止
claude-codex-wechat uninstall  # 卸载服务
```

当前支持：

- macOS：`launchd`（`~/Library/LaunchAgents/`）
- Linux：`systemd --user`（`~/.config/systemd/user/`）

服务会以 `KeepAlive` / `Restart=on-failure` 守护，崩溃后自动拉起，无需额外进程管理器。

## 发布 npm 包

当前仓库只保留本地发布流，不再使用 GitHub Action 自动发布。

### 发布行为

本地执行 `npm publish` 时，会自动触发：

- `npm version patch --no-git-tag-version`

也就是说：

- 每次成功发布都会自动把版本加一位 `patch`
- 版本 bump 发生在真正 publish 之前

完整的发布前校验定义在 [release.sh](./release.sh)，`prepublishOnly` 只负责自动递增版本，避免在 `npm publish` 阶段重复再跑一遍测试和构建。

### 直接发布

如果不需要自动提交版本变更：

```bash
cd /Users/liuyuhua/github/claude-codex-wechat
npm publish --access public --registry=https://registry.npmjs.org/
```

如果必须走代理：

```bash
cd /Users/liuyuhua/github/claude-codex-wechat
HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 npm publish --access public --registry=https://registry.npmjs.org/
```

### 使用 release.sh

如果希望：

- 发布前先提交当前工作区
- 发布后把自动 bump 的版本提交回当前分支
- 自动 `git push`

使用：

```bash
cd /Users/liuyuhua/github/claude-codex-wechat
chmod +x release.sh
./release.sh
```

脚本默认会使用本地代理：

```text
http://127.0.0.1:7890
```

如果你要覆盖默认代理：

```bash
cd /Users/liuyuhua/github/claude-codex-wechat
chmod +x release.sh
HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 ./release.sh
```

这个脚本会：

- 先执行 `pnpm typecheck`
- 再执行 `pnpm build`
- 提交当前改动
- 以默认参数执行 `npm publish --access public --registry=https://registry.npmjs.org/`
- 提交自动 bump 后的 `package.json`
- 推送到当前分支

### 发布前建议检查

```bash
cd /Users/liuyuhua/github/claude-codex-wechat
npm whoami
npm config get registry
npm pack --dry-run
pnpm typecheck
pnpm build
```

如果包名是否可用要先确认：

```bash
npm view claude-codex-wechat
```

## 常见问题

### `npm publish` 报 `EPERM scandir ~/.Trash`

一般是因为你不在项目目录，而是在家目录执行了 `npm publish`。

先确认：

```bash
pwd
```

应该在：

```bash
/Users/liuyuhua/github/claude-codex-wechat
```

### `Public registration is not allowed`

通常是下面几类问题：

- `registry` 不是官方 npm
- 正在往私有 registry 发包
- scoped package 没带 `--access public`
- 账号没有该包名或 scope 的发布权限

检查：

```bash
npm config get registry
npm whoami
node -p "require('./package.json').name"
```

### 本地必须走代理

临时发布可直接这样：

```bash
HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 npm publish --access public --registry=https://registry.npmjs.org/
```

## 相关文件

- [package.json](./package.json)
- [release.sh](./release.sh)
- [scripts/README.md](./scripts/README.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/wechatbot-usage-guide.md](./docs/wechatbot-usage-guide.md)
