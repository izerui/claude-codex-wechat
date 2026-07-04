# Claude 持久进程生命周期治理 — 设计文档

- 日期:2026-07-04
- 范围:仅 Claude 侧(`src/providers/claude-code/claudeStreamingRunner.ts` + `src/session/messageRouter.ts` 一处)
- 状态:已批准,待实现

## 背景 / 问题

微信桥接与 Claude 对话「一段时间后」,Claude 开始声称「Bash 完全故障、不返回」「读不到文件」。排查确认这不是模型退化,而是 `ClaudeStreamingRunner` 的进程架构缺陷,叠加两类病症:

- **急性**:某轮 Bash 卡死(无 TTY 的交互命令、pipe 背压等)→ `sendMessage` 的 `while(true) await handle.read()`(`claudeStreamingRunner.ts:84-85`)永久阻塞,无超时、无 watchdog。用户看到打字消失后再无下文。
- **慢性**:
  - 单个 `claude` 子进程被整个会话复用,永不因失败/时长/轮数重启(`ensureHandle` `:175`),内存/句柄/context 只涨不回收。
  - `stopSession`(唯一真正杀进程处 `:169`)在 `src/session` 内无任何调用,只有 admin 路由触发 → `/new` 换会话时旧进程不回收,孤儿堆积(实测机器上一度 20 个 `claude` 进程,单个 RSS 600MB+)。
  - `stderr`(`:254`)与未完成行 `buffer`(`:232`)在会话生命周期内无上限累积。

## 目标

在**保留 native 会话温热**(不退化成每轮冷启,符合 AGENTS.md「provider 是与 CLI 对话的层」「resume 不变式」)的前提下,给持久进程加生命周期治理,根治上述两类病症。

## 非目标

- 不改 Codex 侧(`codexCliRunner` 生命周期模型不同,后续对照评估)。
- 不引入 RSS 内存采样(第一版;见下文 TODO)。
- 不破坏 `messageRouter` 现有的非阻塞 intake / 全局锁 / abort / steer 不变式(AGENTS.md「Concurrency invariants」)。

## 架构决策

### 决策一:治理逻辑收在 runner 层(方案 A)
全部进程生命周期治理集中在 `ClaudeStreamingRunner`;`messageRouter` 只在切会话命令处加一次 `stopSession(旧id)`。理由:进程知识集中在唯一该懂进程的层,messageRouter 几乎不动,不破坏其并发不变式。

### 决策二:idle 超时,而非整轮硬超时
卡死的特征是「一段时间内完全没有任何事件」。正常长任务(编译、跑测试、大文件处理)会持续吐 `partial`/`assistant` 事件。因此用 **idle timeout(相邻两个事件间的最大间隔)**:只要还在吐事件就不动它;连续 N 秒零字节才判卡死。避免误杀活跃长任务,精准捕获真卡死。

## 详细设计

### 组件与数据

`StreamingSession` 新增字段:

```ts
spawnedAt?: number;   // 当前 handle 对应进程的 spawn 时刻(Date.now())
turnCount: number;    // 该进程已完成的 turn 数,每个 result 事件 +1
```

`ClaudeStreamingRunner` 构造函数新增可配参数(带默认值),由 `defaultProviders.ts` 从 config/env 注入:
`idleTimeoutMs`、`maxProcessAgeMs`、`maxTurns`、`stderrCapBytes`、`maxLineBytes`。

### 四项治理

#### ① Turn idle 超时(急性,轮内)
`sendMessage` 的消费循环里,把 `handle.read()` 与一个 idle 计时器竞速;每收到一个 chunk 重置计时器。连续 `idleTimeoutMs` 无字节 → 判卡死:

```
session.handle.close()        // terminateChild = 杀进程
session.handle = undefined
yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' }
return
```

会话不丢:`resumeId` 仍在,下条消息 `ensureHandle` 自动 `--resume` 重起。实现要点:计时器可取消/可重置,循环退出时清理计时器避免泄漏。

#### ② 阈值主动回收(慢性,轮间)
`ensureHandle` 复用 handle 前判「该退休吗」:`now - spawnedAt > maxProcessAgeMs` **或** `turnCount >= maxTurns`。超则 `close()` 旧 handle → spawn 新的(带 `--resume <同id>`)→ 重置 `spawnedAt` / `turnCount`。对用户**无感**(会话无缝延续)。轮内膨胀由 ① 兜底,两者互补。

> **TODO(后续可选)**:RSS 内存阈值。第一版不做——每轮 spawn `ps -o rss=` 有开销且跨平台复杂;age + turns 已能防膨胀。

#### ③ 切会话回收旧进程(慢性,命令触发)
`messageRouter` 在 `/new`、`/use`、`/resume`、`/stop` **替换/清除 current session 之前**,对旧 claude `bridgeSessionId` 发:

```ts
void provider.stopSession(oldBridgeSessionId).catch(() => undefined);  // fire-and-forget,不 await
```

`stopSession` 内部是 `handle.close()`(SIGTERM),同步返回、不挂起,不违反「命令链不被卡死生成阻塞」的不变式(区别于可能挂起的 `interruptSession`)。实现时需在 messageRouter 精确定位这些命令「旧 current 被替换/清除」的点。

#### ④ 缓冲区限制(内存兜底)
`defaultClaudeStreamSpawner` 内:
- `stderr` 改为只保留最近 `stderrCapBytes`(默认 64KB,错误信息在尾部)。
- 未完成行 `buffer` 超 `maxLineBytes`(默认 10MB)则丢弃并告警,防畸形巨行爆内存。

### 默认阈值(全部可配)

| 参数 | 默认 | env |
|---|---|---|
| idleTimeoutMs | 180s(Claude Bash 工具默认超时 120s + 60s 余量) | `BRIDGE_CLAUDE_IDLE_TIMEOUT_MS` |
| maxProcessAgeMs | 2 小时 | `BRIDGE_CLAUDE_MAX_PROCESS_AGE_MS` |
| maxTurns | 50 轮 | `BRIDGE_CLAUDE_MAX_TURNS` |
| stderrCapBytes | 64KB | — |
| maxLineBytes | 10MB | — |

### 错误处理 / 用户文案

`ProviderEvent` 的 error 事件加可选 `code?: string`(类型安全,不靠字符串前缀)。`messageRouter` 收到 `code === 'idle_timeout'` 时发定制中文而非通用 `Provider error:`:

> ⚠️ 上一轮长时间无响应(疑似工具卡死),已自动终止并保留会话。直接重发消息即可继续。

②③④ 对用户无感,仅 ① 发提示。

## 测试策略

- **`tests/claudeStreamingRunner.test.ts`**
  - idle 超时:fake spawner 制造静默,测试传 `idleTimeoutMs: 50`(真实短超时,不依赖 fake timers)→ 验证 `close` 被调 + yield `code:'idle_timeout'` + handle 清空。
  - 阈值回收:构造 age/turns 超阈值 → `ensureHandle` 触发旧 `close` + 新 spawn,新 args 带 `--resume <同id>`。
  - 缓冲区:喂超大 stderr / 超长行 → 验证截断到上限。
- **`tests/messageRouter.test.ts`**
  - 收到 `code:'idle_timeout'` → 发指定中文提示且 current 会话保留。
  - `/new /use /resume /stop` → 对旧 claude `bridgeSessionId` 调 `stopSession`(spy)。
- 现有 hung-provider 测试(`tests/messageRouter.test.ts` 的 HungProvider / UninterruptibleHungProvider)保持通过。

## 不变式核对(AGENTS.md)

- **resume 不变式**:所有重起走 `--resume <同id>`,不 fork、不换 id,cwd 不变 → 会话延续到同一 `.jsonl`。✓
- **并发不变式**:`stopSession` 同步、fire-and-forget,不阻塞命令链;idle 超时在 runner 内自理,不改 messageRouter 的 intake / 全局锁 / steer 逻辑。✓
- **prompt 缓存不变式**:`BRIDGE_APPEND_SYSTEM_PROMPT` 保持字节稳定常量,本设计不触碰。✓
