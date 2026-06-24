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
npm install -g claude-codex-wechat
# 或
pnpm add -g claude-codex-wechat
```

安装后会得到全局命令：

```bash
claude-codex-wechat help
claude-codex-wechat init
claude-codex-wechat doctor
claude-codex-wechat start
claude-codex-wechat print-config
```

说明：

- 该包依赖 `better-sqlite3`
- 大多数常见平台会直接下载预编译二进制
- 少数环境可能需要本地编译工具链
- Node 版本要求：`>=20`

### 从源码安装

```bash
cd /Users/liuyuhua/github/claude-codex-wechat
pnpm install
```

## CLI 命令

生产态 CLI 入口在 `dist/server/cli.js`，通过 `bin` 暴露为 `claude-codex-wechat`。

可用命令：

- `claude-codex-wechat start`
  - 前台启动 daemon
- `claude-codex-wechat init`
  - 写默认配置到 `~/.claude-codex-wechat/config.json`
- `claude-codex-wechat doctor`
  - 检查配置、前端产物、`claude`/`codex` 可执行文件
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

推荐先初始化：

```bash
claude-codex-wechat init
```

最小配置示例：

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

生产态通常按下面方式运行：

```bash
claude-codex-wechat start
```

注意：

- 这是前台进程
- npm 本身不负责守护
- 长期常驻建议交给进程管理器

### pm2

```bash
npm install -g pm2
pm2 start claude-codex-wechat --name ccwx -- start
pm2 logs ccwx
pm2 restart ccwx
pm2 startup && pm2 save
```

### systemd

示例：

```ini
[Unit]
Description=claude-codex-wechat bridge daemon
After=network.target

[Service]
Type=simple
User=youruser
Environment=BRIDGE_PORT=8787
ExecStart=/usr/bin/claude-codex-wechat start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### launchd

示例：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.claude-codex-wechat</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/claude-codex-wechat</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BRIDGE_PORT</key>
    <string>8787</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
```

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
- 再执行 `pnpm test`
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
pnpm test
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
