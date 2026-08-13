# claude-codex-wechat

用微信，遥控你自己电脑上的 `Claude Code` 和 `Codex CLI`。

它是一个跑在你本机的小程序（bridge daemon）。启动后，你就能在**微信里直接给机器人发消息**，让它驱动本机上原生的 `Claude Code` / `Codex CLI` 会话干活——写代码、跑命令、查东西，随时随地用手机指挥你的开发机。

- 微信 = 你的遥控器
- 本机原生 CLI = 真正干活的人
- 两边共享同一条原生会话，随时可以恢复上次的对话

## 你需要准备什么

- 一台安装了 [Node.js](https://nodejs.org/) `20` 或更高版本的电脑（macOS 或 Linux）
- 本机已经装好并能正常使用 `Claude Code` 或 `Codex CLI`
- 一个微信号（用来扫码绑定机器人）

## 安装

```bash
npm install -g claude-codex-wechat --registry=https://registry.npmmirror.com/
# 或
pnpm add -g claude-codex-wechat
```

> 该包依赖 `better-sqlite3`。大多数电脑会直接下载预编译好的二进制；极少数环境可能需要本地编译工具链。

## 更新

```bash
claude-codex-wechat upgrade
```

会自动拉取最新版并重启服务（重启期间微信桥接会短暂中断）。若提示未知命令，说明当前版本还没有该命令，改用：

```bash
npm install -g claude-codex-wechat@latest --registry=https://registry.npmmirror.com/
claude-codex-wechat restart
```

## 开始使用

安装完，三步就能跑通：

```bash
# 1. 启动（首次会自动注册成系统后台服务，并自动配好接入公网中转，无需手动配置）
claude-codex-wechat start

# 2. 打开管理页，用微信扫码登录完成绑定
#    浏览器访问 http://127.0.0.1:8787

# 3. 绑定成功后，直接在微信里给机器人发消息即可
```

搞定。之后不管电脑锁屏还是你人在外面，只要开发机开着，就能用微信指挥它。

如果启动遇到问题，跑一下体检命令看看哪里没就绪：

```bash
claude-codex-wechat doctor
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `claude-codex-wechat start` | 启动（首次自动注册后台服务），默认命令 |
| `claude-codex-wechat status` | 查看运行状态 |
| `claude-codex-wechat logs` | 查看最近日志 |
| `claude-codex-wechat tail` | 实时跟随日志 |
| `claude-codex-wechat restart` | 重启 |
| `claude-codex-wechat stop` | 停止 |
| `claude-codex-wechat doctor` | 体检：检查配置、前端产物、`claude`/`codex` 是否就绪 |
| `claude-codex-wechat upgrade` | 更新到最新版并自动重启（`--force` 强制重装） |
| `claude-codex-wechat print-config` | 打印当前配置 |
| `claude-codex-wechat uninstall` | 卸载后台服务 |
| `claude-codex-wechat help` | 显示帮助 |

管理页固定监听：`http://127.0.0.1:8787`

后台服务由系统守护（macOS 用 `launchd`，Linux 用 `systemd --user`），崩溃会自动拉起，不需要额外的进程管理器。

## 配置（一般不用管）

配置文件在**首次 `start` 时自动生成**，路径：

```text
~/.claude-codex-wechat/config.json
```

正常使用**无需手动编辑**——接入公网中转的凭据会自动生成并写入。只有想做进阶自定义时才需要动它，例如指定 `claude` / `codex` 的可执行文件路径、默认工作目录：

```json
{
  "providers": {
    "claude": { "command": "/opt/homebrew/bin/claude" },
    "codex": { "command": "/opt/homebrew/bin/codex" }
  },
  "bridge": {
    "defaultProvider": "claude-code",
    "defaultWorkspace": "/absolute/path/to/workspace"
  }
}
```

默认配置只保留 relay 地址；`authToken` 会在首次启动时自动生成并写回 `config.json`。

如需改为接入自建的公网中转服务（relay-server），在同一份配置里覆盖 relay 地址，并把 `authToken` 换成该 relay 接受的真实 token：

```json
{
  "tunnel": {
    "relay": {
      "serverUrl": "wss://your-relay-host/agent",
      "authToken": "replace-with-relay-auth-token"
    }
  }
}
```

relay-server 的独立部署说明见 [relay-server/README.md](./relay-server/README.md)。

## 遇到问题

- 微信收不到消息 / 机器人没反应：先 `claude-codex-wechat status` 看服务是否在跑，再 `claude-codex-wechat logs` 看日志。
- 提示找不到 `claude` 或 `codex`：跑 `claude-codex-wechat doctor`，按提示在配置里指定可执行文件的绝对路径。
- 想彻底重来：`claude-codex-wechat uninstall` 卸载服务，删除 `~/.claude-codex-wechat/` 后重新 `start`。

更详细的微信侧使用玩法见 [docs/wechatbot-usage-guide.md](./docs/wechatbot-usage-guide.md)。

---

## 开发与维护

以下面向想改代码或自行构建发布的开发者，普通使用者可以忽略。

### 从源码运行

```bash
git clone https://github.com/izerui/claude-codex-wechat.git
cd claude-codex-wechat
pnpm install
pnpm dev        # 启动 daemon + Vite 前端热更新，管理页同上
```

开发检查：

```bash
pnpm typecheck
pnpm test
pnpm build      # 产出 dist/web/（前端）与 dist/server/cli.js（CLI/daemon 入口）
```

### 项目结构

- `src/` — daemon、provider、session、channel、web 主实现
- `relay-server/` — 独立的公网中转服务
- `tests/` — 单元 / 运行态 / 前端测试
- `scripts/` — 诊断与辅助脚本（见 [scripts/README.md](./scripts/README.md)）
- `docs/` — 设计说明与参考资料（架构见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)）

## 相关文件

- [package.json](./package.json)
- [relay-server/README.md](./relay-server/README.md)
- [scripts/README.md](./scripts/README.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/wechatbot-usage-guide.md](./docs/wechatbot-usage-guide.md)
