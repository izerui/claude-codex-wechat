# relay-server

`claude-codex-wechat` 的独立公网中转服务。

本机上的 bridge 只监听 `127.0.0.1`，外网访问不到。relay-server 部署在一台有公网 IP 的机器上，bridge 通过 WebSocket 主动连上来注册，relay 就为它分配一个**随机路径的公网地址**，再把公网请求反向转发回 bridge。这样人在外面时，微信侧的回调也能打到你家里/公司的开发机。

> 普通使用者不需要自己部署——首次 `claude-codex-wechat start` 会自动接入默认中转。本文档面向**想自建 relay 的运维者**。

## 工作方式

理解一件事就够了：**relay 本身不管鉴权，只做转发**。

- bridge 连上 `wss://<host>/agent`，在 `register` 消息里自报一个 `authToken`。
- relay 拿这个 `authToken` 派生出一个确定性的随机路径（形如 `sjdfh2xxx`），组成公网地址返回给 bridge。
- 此后打到 `https://<host>/sjdfh2xxx/...` 的请求，就被转发回对应的 bridge。
- `authToken` 是 bridge 侧自己生成并持久化的（见 `config.json` 的 `tunnel.relay.authToken`）。**relay 不校验它、不比对白名单**——任何 token 都能注册成功。它在 relay 侧只用来：作为在线连接的身份标识，以及同一 token 重连时顶替旧连接、保持公网地址稳定。

也就是说，relay 的访问控制**不是靠 token**，而是靠「公网路径足够随机、不可枚举」。

## 安装

```bash
npm install -g @liuyuhua/relay-server
```

要求 Node.js `20` 或更高版本。

## 快速启动

```bash
RELAY_ADMIN_TOKEN=换成一段足够长的随机管理密钥 \
relay-server
```

启动后：

- 健康检查：`http://<你的主机>:8788/healthz`
- bridge 接入地址：`wss://<你的主机>/agent`

## 用 Docker 运行

仓库在每次推送 `main` 时会构建镜像到 GHCR：

```bash
docker run -d \
  --name relay-server \
  -p 8788:8788 \
  -e RELAY_ADMIN_TOKEN=换成一段足够长的随机管理密钥 \
  ghcr.io/<github-owner>/relay-server:latest
```

Docker Compose：

```yaml
services:
  relay-server:
    image: ghcr.io/<github-owner>/relay-server:latest
    restart: unless-stopped
    ports:
      - "8788:8788"
    environment:
      RELAY_ADMIN_TOKEN: 换成一段足够长的随机管理密钥
```

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `RELAY_ADMIN_TOKEN` | **强烈建议设置**。用于保护管理端接口 |
| `RELAY_HOST` | 监听地址，默认 `0.0.0.0`（监听所有网卡）；只想绑定内网时可指定 |
| `RELAY_PORT` | 监听端口，默认 `8788` |

> 客户端接入不需要在 relay 侧配任何 token——如上所述，relay 不做 token 准入校验。

## 关于 token 工具

relay 附带一个 `relay-server-token` 命令，它只做一件事：**生成一个符合格式的随机字符串**（`clrt_<24位十六进制>`）。

```bash
relay-server-token
# 输出：clrt_ab12cd34ef56...
```

带 `--file` 时，顺手把它追加到指定文本文件（每行一个）：

```bash
relay-server-token --file ./relay-auth-tokens.txt
```

需要说明的是：这个工具**只是生成字符串**，relay 服务端并不会读取该文件去做准入校验。正常流程里 bridge 会自己生成并持久化 `authToken`，通常你并不需要手动跑这个命令。

## 反向代理与 HTTPS

公网 URL 是**从进来的 HTTP 请求头动态推导**的（优先读 `x-forwarded-host` / `x-forwarded-proto`，回退到 `host`）。所以在生产环境你需要在 relay 前面挂一层反向代理（Nginx / Caddy 等）负责 HTTPS，并**正确透传这两个头**，否则推导出的公网地址会不对。

DNS 把公网域名指向 relay 主机：

```text
wechat.example.com -> relay 服务器公网 IP
```

bridge 侧连接时使用 `wss://<你的host>/agent`。连接成功后最终公网地址形如：

```text
https://wechat.example.com/sjdfh2xxx
```

同一 `authToken` 重连会顶替旧连接、保留原路径，所以地址是稳定的。

## 上线前检查清单

在把 relay 暴露到公网之前，确认：

- `RELAY_ADMIN_TOKEN` 是一段独立的、足够长的随机密钥
- 前面挂了反向代理，站点走 `HTTPS`，且正确透传 `x-forwarded-host` / `x-forwarded-proto`
- 公网域名已指向 relay 主机
- bridge 侧用的是 `wss://<你的host>/agent`

上线顺序：

1. 配好 DNS
2. 设置 `RELAY_ADMIN_TOKEN`
3. 启动 `relay-server`（并配好前置反代 + HTTPS）
4. 等目标 bridge 客户端连上后，确认其公网地址可访问

## 本地开发

在仓库根目录有两个便捷脚本。只启动 relay（带 dev 默认值 `RELAY_PORT=8788`、`RELAY_ADMIN_TOKEN=dev-admin-token`）：

```bash
pnpm dev:relay
```

bridge 侧复用 `~/.claude-codex-wechat/config.json` 里持久化的 `tunnel.relay.authToken`（若还是旧的 `client-token-a`，会自动升级成生成的 `clrt_<24hex>` 并写回）。

同时拉起 relay 和本地 bridge：

```bash
pnpm dev:all
```

这还会在 `config.json` 不存在时初始化它，并把 bridge 指向 `ws://127.0.0.1:8788/agent`。

本地端点：

- relay 健康检查：`http://127.0.0.1:8788/healthz`
- bridge 管理页：`http://127.0.0.1:8787`

运行测试：

```bash
pnpm --dir relay-server test
```

## 安全说明

- relay 的访问控制依赖随机不可枚举的公网路径，务必让站点走 `HTTPS`。
- `RELAY_ADMIN_TOKEN` 用于保护管理端，与客户端 `authToken` 是两回事，请用不同的密钥。
- relay 不校验客户端 `authToken`，请勿把它当作准入凭据。
