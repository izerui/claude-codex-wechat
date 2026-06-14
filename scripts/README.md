# Scripts Overview

`scripts/` 里的脚本分成两类：**正式使用入口** 和 **诊断 / 验收工具**。

## 正式使用入口

### `recover-weixin-runtime.sh`

最推荐的恢复入口。

作用：

- 拉微信扫码登录二维码
- 等待扫码确认
- 自动写出凭据文件
- 直接拉起最新 bridge runtime

适用场景：

- 微信 token 失效后恢复使用
- 个人日常重新授权

### `weixin-login-helper.ts`

微信扫码登录辅助工具。

作用：

- 生成并自动打开二维码 SVG
- 轮询扫码状态
- 自动续刷过期二维码
- 写出：
  - `/tmp/bridge-weixin-login-state.json`
  - `/tmp/bridge-weixin-credentials.json`
  - `/tmp/bridge-weixin.env`

适用场景：

- 只想先拿新 token，不想立刻起 runtime
- 需要观察扫码状态

### `start-runtime-check.sh`

带快照输出的 runtime 启动脚本。

作用：

- 自动加载 helper 生成的微信凭据
- 启动最新 runtime
- 打印启动后的关键 API 状态

适用场景：

- 扫码确认后单独启动最新实例
- 联调时确认新凭据是否真正生效

## 诊断 / 验收工具

### `check-runtime-readiness.sh`

检查最新 runtime 是否真的就绪。

重点输出：

- `weixin_connected`
- `weixin_status`
- `weixin_last_error`
- `claude_history_ready_count`
- `codex_title_ready_count`

### `check-runtime-recovery.sh`

查看 bridge 会话的恢复字段。

重点输出：

- `resumeTitle`
- `preferredResumeCommand`
- `providerResumeTitleSynced`
- `providerResumeHistorySynced`
- `providerNativePath`

### `check-weixin-updates.ts`

直连微信官方 `getupdates` 的底层探针。

作用：

- 判断 token / session 是否健康
- 区分“bridge 问题”和“微信上游问题”

### `check-codex-wechat-flow.sh`

Codex 专项闭环验收脚本。

作用：

- 等待新的 Codex bridge session 出现
- 打印该会话的恢复字段
- 自动试跑推荐的 Codex resume 命令

## 建议用法

### 日常恢复

```bash
bash ./scripts/recover-weixin-runtime.sh
```

如果你要直接做 Codex 专项恢复实验：

```bash
BRIDGE_DEFAULT_PROVIDER=codex bash ./scripts/recover-weixin-runtime.sh
```

### 手动分步恢复

```bash
pnpm tsx scripts/weixin-login-helper.ts
bash ./scripts/start-runtime-check.sh
```

同样也可以：

```bash
BRIDGE_DEFAULT_PROVIDER=codex bash ./scripts/start-runtime-check.sh
```

### 排障

```bash
BRIDGE_PORT=8788 bash ./scripts/check-runtime-readiness.sh
BRIDGE_PORT=8788 bash ./scripts/check-runtime-recovery.sh
BRIDGE_WECHAT_TOKEN='...' pnpm tsx scripts/check-weixin-updates.ts
```

### Codex 专项验收

```bash
BRIDGE_DEFAULT_PROVIDER=codex bash ./scripts/recover-weixin-runtime.sh
BRIDGE_PORT=8788 WAIT_SECONDS=120 bash ./scripts/check-codex-wechat-flow.sh
```
