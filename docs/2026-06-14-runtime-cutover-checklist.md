# 最新 bridge 实例切换与验收清单

目标：

- 不影响当前旧 bridge 实例的前提下，拉起一份基于**当前工作树**的新 bridge 实例
- 用真实微信通道验证：
  - 微信消息进入新实例
  - Claude 原生恢复可用
  - Codex 原生恢复可用

---

## 1. 前提

当前工作树已经具备：

- Claude `resumeTitle`
- Claude `claude -r <title>` 推荐恢复
- Codex `thread_name`
- Codex `codex exec resume --json --last <thread_name>` 推荐恢复
- Codex `session_index.jsonl` bridge 写回
- `GET /api/channel/wechat/runtime-config`
- 环境变量注入微信配置：
  - `BRIDGE_WECHAT_ENABLED`
  - `BRIDGE_WECHAT_BASE_URL`
  - `BRIDGE_WECHAT_TOKEN`
  - `BRIDGE_WECHAT_ACCOUNT_ID`

---

## 2. 不要直接动旧实例

当前旧实例仍在跑：

- `http://127.0.0.1:8787`

而且旧实例已经接入真实微信。

因此验收原则是：

- **先并行起新实例**
- **新实例使用不同端口**
- **确认新实例一切正常后，再考虑切换旧实例**

---

## 3. 启动新实例

建议使用独立目录和独立数据库：

```bash
mkdir -p /tmp/bridge-runtime-check
```

也可以直接用脚本：

```bash
BRIDGE_WECHAT_TOKEN='<真实 token>' ./scripts/start-runtime-check.sh
```

如果你刚通过 `scripts/weixin-login-helper.ts` 完成扫码确认，并且已经拿到：

- `/tmp/bridge-weixin.env`
- `/tmp/bridge-weixin-credentials.json`

那么 `start-runtime-check.sh` 会优先自动加载这些凭据文件，此时可以直接运行：

```bash
bash ./scripts/start-runtime-check.sh
```

如果你想把“扫码确认 + 读取新凭据 + 拉起最新实例”合成一条命令，可以直接运行：

```bash
bash ./scripts/recover-weixin-runtime.sh
```

启动后查看恢复字段汇总：

```bash
BRIDGE_PORT=8788 ./scripts/check-runtime-recovery.sh
```

启动后先跑 readiness 检查：

```bash
BRIDGE_PORT=8788 ./scripts/check-runtime-readiness.sh
```

使用环境变量而不是依赖本地配置文件：

```bash
BRIDGE_PORT=8788 \
BRIDGE_WECHAT_ENABLED=1 \
BRIDGE_WECHAT_BASE_URL='https://ilinkai.weixin.qq.com' \
BRIDGE_WECHAT_TOKEN='<真实 token>' \
BRIDGE_WECHAT_ACCOUNT_ID='7b6cb4639d9e@im.bot' \
BRIDGE_CLAUDE_COMMAND='/Applications/cmux.app/Contents/Resources/bin/claude' \
BRIDGE_CODEX_COMMAND='/opt/homebrew/bin/codex' \
BRIDGE_CONFIG=/tmp/bridge-runtime-check/config.json \
pnpm dev
```

如果不用 `BRIDGE_CONFIG` 也可以，只要 env 已经完整提供。

---

## 4. 启动后先验证 API

检查：

```bash
curl -s http://127.0.0.1:8788/api/channel/plugins | jq .
curl -s http://127.0.0.1:8788/api/channel/wechat/runtime-config | jq .
curl -s http://127.0.0.1:8788/api/settings | jq .
curl -s http://127.0.0.1:8788/api/channel/sessions | jq .
```

也可以直接用：

```bash
BRIDGE_PORT=8788 ./scripts/check-runtime-readiness.sh
```

期望：

- `plugins` 中 `weixin.enabled = true`
- `weixin.connected = true`
- `runtime-config` 返回真实 `baseUrl/token/accountId`

---

## 5. 真实微信消息验收

从微信向 clawbot 发一条新消息。

然后观察：

```bash
curl -s http://127.0.0.1:8788/api/channel/sessions | jq .
```

重点字段：

- `providerId`
- `providerSessionId`
- `resumeTitle`
- `preferredResumeMode`
- `preferredResumeCommand`
- `providerResumeCommand`
- `providerResumeByTitleCommand`
- `providerResumeTitleSynced`
- `providerResumeHistorySynced`

期望：

- Claude 会话：
  - `preferredResumeMode = "title"`
  - `preferredResumeCommand` 是 `claude -r ...`
  - `providerResumeTitleSynced = true`
  - `providerResumeHistorySynced = true`
- Codex 会话：
  - `preferredResumeMode = "title"`
  - `preferredResumeCommand` 是 `codex exec resume --json --last ...`

---

## 6. 原生 CLI 验收

### Claude

直接执行：

```bash
claude -r '<完整标题>'
```

或者：

```bash
claude --resume <providerSessionId>
```

### Codex

直接执行：

```bash
codex exec resume --json --last '<thread_name>' 'Reply with exactly: codex-resume-ok'
```

或者：

```bash
codex exec resume --json --last <providerSessionId> 'Reply with exactly: codex-resume-ok'
```

---

## 7. 切换旧实例前的结论标准

只有当下面都成立时，才算“最新工作树实例通过真实验收”：

- 新实例成功接入微信
- 新实例创建/接入的会话能在 API 中看到完整恢复字段
- Claude 的推荐恢复命令实际可用
- Codex 的推荐恢复命令实际可用
- 对 Claude 来说，`providerResumeHistorySynced = true`，否则说明 `claude -r '<完整标题>'` 仍可能不可见

如果缺任何一项，就不要切旧实例。
