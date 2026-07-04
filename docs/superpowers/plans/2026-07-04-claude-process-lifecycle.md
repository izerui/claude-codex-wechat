# Claude 持久进程生命周期治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给微信桥接的 Claude 持久子进程加生命周期治理,根治「Bash 卡死整轮挂起 / 进程内存膨胀 / 切会话孤儿堆积 / 缓冲区无界增长」。

**Architecture:** 全部进程治理收在 `ClaudeStreamingRunner`;`messageRouter` 只加「切会话回收旧进程」和「idle 超时定制文案」两处。急性卡死由 idle 超时(相邻事件最大间隔)兜底,慢性膨胀由 age/turns 阈值在轮间回收,所有重起走 `--resume <同id>` 保持会话延续。

**Tech Stack:** TypeScript、Node child_process、vitest。设计文档:`docs/superpowers/specs/2026-07-04-claude-process-lifecycle-design.md`。

---

## File Structure

- Modify `src/providers/types.ts` — `ProviderEvent` 的 error 事件加可选 `code`。
- Modify `src/providers/claude-code/claudeStreamingRunner.ts` — idle 超时、阈值回收、缓冲区上限、构造配置。
- Modify `src/providers/defaultProviders.ts` — 从 env 注入阈值配置。
- Modify `src/session/messageRouter.ts` — idle 超时文案、切会话回收旧进程。
- Test `tests/claudeStreamingRunner.test.ts` — idle 超时、阈值回收、capTail。
- Test `tests/messageRouter.test.ts` — idle 文案、切会话 stopSession。

---

### Task 1: ProviderEvent error 事件加 `code`

**Files:**
- Modify: `src/providers/types.ts:19`

- [ ] **Step 1: 修改类型**

`src/providers/types.ts` 第 19 行,把:
```ts
  | { type: 'error'; error: string };
```
改为:
```ts
  | { type: 'error'; error: string; code?: string };
```

- [ ] **Step 2: 编译验证**

Run: `pnpm typecheck`
Expected: PASS(纯增字段,现有代码不受影响)

- [ ] **Step 3: Commit**

```bash
git add src/providers/types.ts
git commit -m "feat: ProviderEvent error 事件支持可选 code 字段"
```

---

### Task 2: runner idle 超时(急性卡死兜底)

**Files:**
- Modify: `src/providers/claude-code/claudeStreamingRunner.ts`
- Test: `tests/claudeStreamingRunner.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/claudeStreamingRunner.test.ts` 的 `describe` 内追加:
```ts
  it('kills the process and emits idle_timeout when no events arrive', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true, idleTimeoutMs: 30 });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const events = await collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'hi' }));

    expect(handle.closed).toBe(true);
    expect(events).toEqual([{ type: 'error', error: 'idle_timeout', code: 'idle_timeout' }]);
  });

  it('does not idle-timeout while events keep arriving', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true, idleTimeoutMs: 60 });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'hi' }));
    await tick();
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: 'x' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    const events = await collected;

    expect(handle.closed).toBe(false);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/claudeStreamingRunner.test.ts`
Expected: FAIL —— 第一个测试拿不到 `idle_timeout` 事件(构造不认识 `idleTimeoutMs`,永不超时,测试超时或 events 为空)。

- [ ] **Step 3: 实现 idle 超时**

`claudeStreamingRunner.ts` 顶部(`export type ClaudeStreamSpawner = ...` 之后)加:
```ts
const IDLE_SENTINEL = Symbol('idle_timeout');

function readWithIdleTimeout(
  handle: ClaudeStreamHandle,
  ms: number,
): Promise<ClaudeStreamChunk | typeof IDLE_SENTINEL> {
  if (!ms || ms <= 0) return handle.read();
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(IDLE_SENTINEL); } }, ms);
    (timer as { unref?: () => void }).unref?.();
    void handle.read().then((chunk) => { if (!settled) { settled = true; clearTimeout(timer); resolve(chunk); } });
  });
}
```

在类里加字段 + 构造参数。把:
```ts
  private readonly mcpConfigPath?: string;

  constructor(input: { command?: string; spawner?: ClaudeStreamSpawner; capabilityProbe?: ClaudeCapabilityProbe; mcpConfigPath?: string } = {}) {
    this.command = input.command ?? 'claude';
    this.spawner = input.spawner ?? defaultClaudeStreamSpawner;
    this.capabilityProbe = input.capabilityProbe ?? probeAppendSystemPromptSupport;
    this.mcpConfigPath = input.mcpConfigPath;
  }
```
改为:
```ts
  private readonly mcpConfigPath?: string;
  private readonly idleTimeoutMs: number;
  private readonly maxProcessAgeMs: number;
  private readonly maxTurns: number;
  private readonly stderrCapBytes: number;
  private readonly maxLineBytes: number;

  constructor(input: {
    command?: string;
    spawner?: ClaudeStreamSpawner;
    capabilityProbe?: ClaudeCapabilityProbe;
    mcpConfigPath?: string;
    idleTimeoutMs?: number;
    maxProcessAgeMs?: number;
    maxTurns?: number;
    stderrCapBytes?: number;
    maxLineBytes?: number;
  } = {}) {
    this.command = input.command ?? 'claude';
    this.capabilityProbe = input.capabilityProbe ?? probeAppendSystemPromptSupport;
    this.mcpConfigPath = input.mcpConfigPath;
    this.idleTimeoutMs = input.idleTimeoutMs ?? 180_000;
    this.maxProcessAgeMs = input.maxProcessAgeMs ?? 2 * 60 * 60 * 1000;
    this.maxTurns = input.maxTurns ?? 50;
    this.stderrCapBytes = input.stderrCapBytes ?? 64 * 1024;
    this.maxLineBytes = input.maxLineBytes ?? 10 * 1024 * 1024;
    this.spawner = input.spawner
      ?? ((call) => defaultClaudeStreamSpawner(call, { stderrCapBytes: this.stderrCapBytes, maxLineBytes: this.maxLineBytes }));
  }
```

在 `sendMessage` 的读循环里,把:
```ts
    while (true) {
      const chunk = await handle.read();
      if (chunk.type === 'exit') {
```
改为:
```ts
    while (true) {
      const chunk = await readWithIdleTimeout(handle, this.idleTimeoutMs);
      if (chunk === IDLE_SENTINEL) {
        handle.close();
        session.handle = undefined;
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
        return;
      }
      if (chunk.type === 'exit') {
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/claudeStreamingRunner.test.ts`
Expected: PASS(含两个新测试与全部旧测试)。

- [ ] **Step 5: Commit**

```bash
git add src/providers/claude-code/claudeStreamingRunner.ts tests/claudeStreamingRunner.test.ts
git commit -m "feat: Claude runner idle 超时兜底,卡死自动杀进程并报 idle_timeout"
```

---

### Task 3: runner 阈值主动回收(慢性膨胀,轮间)

**Files:**
- Modify: `src/providers/claude-code/claudeStreamingRunner.ts`
- Test: `tests/claudeStreamingRunner.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/claudeStreamingRunner.test.ts` 追加:
```ts
  it('retires the process after maxTurns and respawns with --resume', async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const handles: FakeHandle[] = [];
    const runner = new ClaudeStreamingRunner({
      spawner: (call) => { calls.push(call); const h = new FakeHandle(); handles.push(h); return h; },
      capabilityProbe: async () => true,
      maxTurns: 1,
    });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const first = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'one' }));
    await tick();
    handles[0].feedLine({ type: 'result', session_id: 'sess-1' });
    await first;

    const second = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'two' }));
    await tick();
    handles[1].feedLine({ type: 'result', session_id: 'sess-1' });
    await second;

    expect(calls).toHaveLength(2);
    expect(handles[0].closed).toBe(true);
    const resumeIdx = calls[1].args.indexOf('--resume');
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(calls[1].args[resumeIdx + 1]).toBe('sess-1');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/claudeStreamingRunner.test.ts`
Expected: FAIL —— `calls` 只有 1 条(handle 被无条件复用,不回收)。

- [ ] **Step 3: 实现阈值回收**

在 `StreamingSession` 类型里加两个字段。把:
```ts
type StreamingSession = ClaudeRunnerSession & {
  claudeSessionId?: string;
  sessionName?: string;
  handle?: ClaudeStreamHandle;
  resumeId?: string;
  pendingFollowUps: number;
  supportsAppendSystemPrompt?: boolean;
};
```
改为:
```ts
type StreamingSession = ClaudeRunnerSession & {
  claudeSessionId?: string;
  sessionName?: string;
  handle?: ClaudeStreamHandle;
  resumeId?: string;
  pendingFollowUps: number;
  supportsAppendSystemPrompt?: boolean;
  spawnedAt?: number;
  turnCount: number;
};
```

在 `startSession` 里初始化 `turnCount`。把 `pendingFollowUps: 0,` 那一行下面补一行,即:
```ts
      pendingFollowUps: 0,
      turnCount: 0,
```

在 `sendMessage` 的 `result` 分支给 turnCount 递增。把:
```ts
      if (type === 'result') {
        const sessionId = typeof record.session_id === 'string' ? record.session_id : undefined;
        if (sessionId) {
          session.providerSessionId = sessionId;
          session.claudeSessionId = sessionId;
          session.resumeId = sessionId;
        }
        yield { type: 'message_done' };
```
改为(在 `yield { type: 'message_done' };` 之前加一行):
```ts
      if (type === 'result') {
        const sessionId = typeof record.session_id === 'string' ? record.session_id : undefined;
        if (sessionId) {
          session.providerSessionId = sessionId;
          session.claudeSessionId = sessionId;
          session.resumeId = sessionId;
        }
        session.turnCount += 1;
        yield { type: 'message_done' };
```

改 `ensureHandle` 增加退休判断。把:
```ts
  private ensureHandle(session: StreamingSession): ClaudeStreamHandle {
    if (session.handle) return session.handle;
    const args = buildStreamingArgs(session, this.mcpConfigPath);
    session.handle = this.spawner({ command: this.command, args, cwd: session.cwd });
    return session.handle;
  }
```
改为:
```ts
  private ensureHandle(session: StreamingSession): ClaudeStreamHandle {
    if (session.handle && !this.shouldRetire(session)) return session.handle;
    if (session.handle) {
      session.handle.close();
      session.handle = undefined;
    }
    const args = buildStreamingArgs(session, this.mcpConfigPath);
    session.handle = this.spawner({ command: this.command, args, cwd: session.cwd });
    session.spawnedAt = Date.now();
    session.turnCount = 0;
    return session.handle;
  }

  private shouldRetire(session: StreamingSession): boolean {
    if (this.maxTurns > 0 && session.turnCount >= this.maxTurns) return true;
    if (this.maxProcessAgeMs > 0 && session.spawnedAt && Date.now() - session.spawnedAt >= this.maxProcessAgeMs) return true;
    return false;
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/claudeStreamingRunner.test.ts`
Expected: PASS(含新测试与旧测试;注意「reuses the same handle across turns」旧测试仍应通过——它默认 maxTurns=50,两轮不触发回收)。

- [ ] **Step 5: Commit**

```bash
git add src/providers/claude-code/claudeStreamingRunner.ts tests/claudeStreamingRunner.test.ts
git commit -m "feat: Claude runner 按 turns/age 阈值轮间回收进程,--resume 无缝重起"
```

---

### Task 4: 缓冲区上限(内存兜底)

**Files:**
- Modify: `src/providers/claude-code/claudeStreamingRunner.ts`
- Test: `tests/claudeStreamingRunner.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/claudeStreamingRunner.test.ts` 顶部 import 加入 `capTail`:
```ts
import { ClaudeStreamingRunner, capTail, type ClaudeStreamChunk, type ClaudeStreamHandle } from '../src/providers/claude-code/claudeStreamingRunner';
```
并在 `describe` 内追加:
```ts
  it('capTail keeps only the last N chars and is a no-op under the cap', () => {
    expect(capTail('abcdef', 3)).toBe('def');
    expect(capTail('ab', 3)).toBe('ab');
    expect(capTail('abcdef', 0)).toBe('abcdef');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/claudeStreamingRunner.test.ts`
Expected: FAIL —— `capTail` 未导出(import 报错)。

- [ ] **Step 3: 实现 capTail 并接入 spawner**

在 `claudeStreamingRunner.ts` 导出纯函数(放在 `readWithIdleTimeout` 附近):
```ts
export function capTail(text: string, capBytes: number): string {
  if (capBytes <= 0 || text.length <= capBytes) return text;
  return text.slice(text.length - capBytes);
}
```

改 `defaultClaudeStreamSpawner` 签名与缓冲逻辑。把:
```ts
function defaultClaudeStreamSpawner(call: { command: string; args: string[]; cwd: string }): ClaudeStreamHandle {
  const child = spawn(call.command, call.args, { cwd: expandTilde(call.cwd) ?? call.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: useShellForCli() });
  let stderr = '';
  let buffer = '';
```
改为:
```ts
function defaultClaudeStreamSpawner(
  call: { command: string; args: string[]; cwd: string },
  opts: { stderrCapBytes?: number; maxLineBytes?: number } = {},
): ClaudeStreamHandle {
  const stderrCapBytes = opts.stderrCapBytes ?? 64 * 1024;
  const maxLineBytes = opts.maxLineBytes ?? 10 * 1024 * 1024;
  const child = spawn(call.command, call.args, { cwd: expandTilde(call.cwd) ?? call.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: useShellForCli() });
  let stderr = '';
  let buffer = '';
```

把 stdout data 处理里的行累积加保护。把:
```ts
  child.stdout.on('data', (data) => {
    buffer += String(data);
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      if (line.trim()) push({ type: 'line', line });
    }
  });
  child.stderr.on('data', (data) => { stderr += String(data); });
```
改为:
```ts
  child.stdout.on('data', (data) => {
    buffer += String(data);
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      if (line.trim()) push({ type: 'line', line });
    }
    // 单行未闭合且已超上限:丢弃防爆内存(正常 NDJSON 行不会这么大)。
    if (buffer.length > maxLineBytes) {
      stderr = capTail(stderr + `\n[bridge] dropped oversized line buffer (${buffer.length} bytes)\n`, stderrCapBytes);
      buffer = '';
    }
  });
  child.stderr.on('data', (data) => { stderr = capTail(stderr + String(data), stderrCapBytes); });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/claudeStreamingRunner.test.ts`
Expected: PASS

- [ ] **Step 5: 全量 typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/providers/claude-code/claudeStreamingRunner.ts tests/claudeStreamingRunner.test.ts
git commit -m "feat: Claude spawner stderr/行缓冲加上限,防止内存无界增长"
```

---

### Task 5: messageRouter idle 超时定制文案

**Files:**
- Modify: `src/session/messageRouter.ts:380-391`
- Test: `tests/messageRouter.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/messageRouter.test.ts` 的 `describe` 内追加:
```ts
  it('shows a friendly message and preserves the session on idle_timeout', async () => {
    class IdleTimeoutProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `stream_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        if (!this.sessions.has(input.bridgeSessionId)) throw new Error('claude_session_not_found');
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
    }
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new IdleTimeoutProvider()],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hi' }, timestamp: 1,
    });

    expect(sent.some((m) => m.text.includes('长时间无响应') && m.text.includes('保留会话'))).toBe(true);
    expect(sent.some((m) => m.text.startsWith('Provider error:'))).toBe(false);
    expect(sessions.listSessions()).toHaveLength(1); // 会话保留
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/messageRouter.test.ts`
Expected: FAIL —— 现在发的是 `Provider error: idle_timeout`,不含定制文案。

- [ ] **Step 3: 实现定制文案**

`src/session/messageRouter.ts` 的 error 分支,把:
```ts
        if (event.type === 'error' && event.error) {
          if (bufferedText.trim()) {
            await this.sendToChat({ chatId: message.chatId, kind: 'text', text: bufferedText });
            bufferedText = '';
          }
          const errorText = `Provider error: ${event.error}`;
          await this.sendToChat({
            chatId: message.chatId,
            kind: 'status',
            text: errorText,
          });
        }
```
改为:
```ts
        if (event.type === 'error' && event.error) {
          if (bufferedText.trim()) {
            await this.sendToChat({ chatId: message.chatId, kind: 'text', text: bufferedText });
            bufferedText = '';
          }
          const errorText = event.code === 'idle_timeout'
            ? '⚠️ 上一轮长时间无响应(疑似工具卡死),已自动终止并保留会话。直接重发消息即可继续。'
            : `Provider error: ${event.error}`;
          await this.sendToChat({
            chatId: message.chatId,
            kind: 'status',
            text: errorText,
          });
        }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/messageRouter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/messageRouter.ts tests/messageRouter.test.ts
git commit -m "feat: idle_timeout 向微信显示友好提示而非原始 Provider error"
```

---

### Task 6: messageRouter 切会话回收旧进程

**Files:**
- Modify: `src/session/messageRouter.ts`(新增私有方法 + `new_session`/`resume_session` 各调用一次)
- Test: `tests/messageRouter.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/messageRouter.test.ts` 追加:
```ts
  it('stops the previous provider process when /new switches sessions', async () => {
    const stopCalls: string[] = [];
    class RecordingProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `stream_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        if (!this.sessions.has(input.bridgeSessionId)) throw new Error('claude_session_not_found');
        yield { type: 'text_delta', text: 'ok' };
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        stopCalls.push(bridgeSessionId);
        this.sessions.delete(bridgeSessionId);
      }
    }
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new RecordingProvider()],
      sessions,
      resolveUser: () => authorizedUser,
    });

    // 先聊天建立一个会话
    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hi' }, timestamp: 1,
    });
    const firstId = sessions.listSessions()[0]?.id;
    expect(firstId).toBeTruthy();

    // /new 切换会话 → 应回收旧会话进程
    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new' }, timestamp: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 10)); // 让 fire-and-forget 的 stopSession settle

    expect(stopCalls).toContain(firstId);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/messageRouter.test.ts`
Expected: FAIL —— `stopCalls` 不含 `firstId`(当前 `/new` 只 preempt,不回收旧进程)。

- [ ] **Step 3: 实现回收方法并接入**

在 `MessageRouter` 类里(紧接 `preemptActiveGeneration` 方法之后)新增:
```ts
  // 切换/清除当前会话前,回收旧 provider 的持久子进程,防止孤儿堆积。
  // stopSession 内部是同步 close/kill,不会挂起;fire-and-forget,不阻塞命令链。
  private recycleCurrentProviderProcess(): void {
    const current = this.conversation.getCurrent();
    if (!current?.providerSessionId) return;
    const provider = this.providers.get(current.providerId);
    void Promise.resolve(provider?.stopSession(current.id)).catch(() => undefined);
  }
```

在 `new_session` 分支,把:
```ts
    if (command.kind === 'new_session') {
      this.pendingChoices.delete(chatId);
      await this.preemptActiveGeneration(chatId);
```
改为:
```ts
    if (command.kind === 'new_session') {
      this.pendingChoices.delete(chatId);
      await this.preemptActiveGeneration(chatId);
      this.recycleCurrentProviderProcess();
```

在 `resume_session` 分支,把:
```ts
      await this.preemptActiveGeneration(chatId);
      let providerId = this.conversation.getCurrent()?.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
```
改为:
```ts
      await this.preemptActiveGeneration(chatId);
      this.recycleCurrentProviderProcess();
      let providerId = this.conversation.getCurrent()?.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
```

> 说明:`recycleCurrentProviderProcess` 读的是回收调用**当时**的 current。`new_session` 里它在 `conversation.create` 之前执行,回收的是旧 current;`resume_session` 里它在 `attachProviderSessionToBridge` 之前执行,回收被替换掉的旧 current。若被恢复的正是当前会话(重复 resume),回收后下一条消息会 `--resume` 同 id 重起,无害。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/messageRouter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session/messageRouter.ts tests/messageRouter.test.ts
git commit -m "feat: /new 与 /resume 切会话时回收旧 provider 进程,杜绝孤儿堆积"
```

---

### Task 7: 从环境变量注入阈值配置

**Files:**
- Modify: `src/providers/defaultProviders.ts`
- Test: `tests/claudeStreamingRunner.test.ts`(测纯函数 `readEnvInt`)

- [ ] **Step 1: 写失败测试**

在 `tests/claudeStreamingRunner.test.ts` 顶部 import `defaultProviders` 的 helper。先在 `describe` 内追加(import 语句在 Step 3 建立后加入):
```ts
  it('readEnvInt parses valid ints and falls back otherwise', () => {
    expect(readEnvInt('999', 10)).toBe(999);
    expect(readEnvInt(undefined, 10)).toBe(10);
    expect(readEnvInt('', 10)).toBe(10);
    expect(readEnvInt('abc', 10)).toBe(10);
    expect(readEnvInt('-5', 10)).toBe(10); // 负数无意义,回退默认
  });
```
并在文件顶部 import 区加入:
```ts
import { readEnvInt } from '../src/providers/defaultProviders';
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/claudeStreamingRunner.test.ts`
Expected: FAIL —— `readEnvInt` 未导出。

- [ ] **Step 3: 实现 readEnvInt 与注入**

`src/providers/defaultProviders.ts` 全文改为:
```ts
import { ClaudeStreamingRunner } from './claude-code/claudeStreamingRunner';
import { ClaudeCodeProvider } from './claude-code/claudeProvider';
import { CodexInteractiveRunner } from './codex/codexInteractiveRunner';
import { CodexProvider } from './codex/codexProvider';
import type { NativeProviderAdapter } from './types';

// 解析形如 "180000" 的环境变量为正整数,非法或非正则回退默认值。
export function readEnvInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function createDefaultProviders(input: {
  claudeCommand?: string;
  codexCommand?: string;
  mcpConfigPath?: string;
} = {}): NativeProviderAdapter[] {
  const claudeRunner = new ClaudeStreamingRunner({
    command: input.claudeCommand,
    mcpConfigPath: input.mcpConfigPath,
    idleTimeoutMs: readEnvInt(process.env.BRIDGE_CLAUDE_IDLE_TIMEOUT_MS, 180_000),
    maxProcessAgeMs: readEnvInt(process.env.BRIDGE_CLAUDE_MAX_PROCESS_AGE_MS, 2 * 60 * 60 * 1000),
    maxTurns: readEnvInt(process.env.BRIDGE_CLAUDE_MAX_TURNS, 50),
  });
  return [
    new ClaudeCodeProvider({ runner: claudeRunner }),
    new CodexProvider({ runner: new CodexInteractiveRunner({ command: input.codexCommand }) }),
  ];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test tests/claudeStreamingRunner.test.ts`
Expected: PASS

- [ ] **Step 5: 全量验证**

Run: `pnpm typecheck && pnpm test`
Expected: PASS(全部测试)

- [ ] **Step 6: Commit**

```bash
git add src/providers/defaultProviders.ts tests/claudeStreamingRunner.test.ts
git commit -m "feat: 阈值配置支持 BRIDGE_CLAUDE_* 环境变量覆盖"
```

---

## Self-Review 结果

- **Spec coverage**:① idle 超时 → Task 2;② 阈值回收 → Task 3;③ 切会话回收 → Task 6;④ 缓冲区上限 → Task 4;error code 字段 → Task 1;用户文案 → Task 5;可配置 → Task 7。全覆盖。RSS 采样是 spec 明确标注的后续 TODO,不在本计划。
- **类型一致性**:`code?: string`(Task 1)被 Task 2/5 一致使用;`turnCount`/`spawnedAt`(Task 3)、`capTail`(Task 4)、`readEnvInt`(Task 7)签名前后一致。
- **占位扫描**:无 TODO/TBD,每步含完整代码与命令。

## 不变式核对

- resume 不变式:回收/重起均走 `--resume <同id>`(`buildStreamingArgs` 现有逻辑),不 fork、不换 id。
- 并发不变式:`recycleCurrentProviderProcess` 用 `void Promise.resolve(...).catch()`,fire-and-forget 不阻塞命令链;`stopSession` 内部同步 close。
- prompt 缓存不变式:`BRIDGE_APPEND_SYSTEM_PROMPT` 不触碰。
