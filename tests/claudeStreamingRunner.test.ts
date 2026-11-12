import { describe, expect, it, vi } from 'vitest';
import { ClaudeStreamingRunner, capTail, type ClaudeStreamChunk, type ClaudeStreamHandle } from '../src/providers/claude-code/claudeStreamingRunner';
import { BRIDGE_APPEND_SYSTEM_PROMPT } from '../src/providers/claude-code/bridgeSystemPrompt';
import type { ClaudeRunnerEvent } from '../src/providers/claude-code/claudeRunner';
import { readEnvInt } from '../src/providers/defaultProviders';

class FakeHandle implements ClaudeStreamHandle {
  readonly writes: string[] = [];
  closed = false;
  private readonly queue: ClaudeStreamChunk[] = [];
  private resolveNext: ((chunk: ClaudeStreamChunk) => void) | null = null;

  write(line: string): void {
    this.writes.push(line);
  }

  read(): Promise<ClaudeStreamChunk> {
    const next = this.queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => { this.resolveNext = resolve; });
  }

  close(): void {
    this.closed = true;
    this.resolveNext?.({ type: 'exit', code: 0, stderr: '' });
    this.resolveNext = null;
  }

  feedLine(value: unknown): void {
    const chunk: ClaudeStreamChunk = { type: 'line', line: JSON.stringify(value) };
    const resolve = this.resolveNext;
    if (resolve) {
      this.resolveNext = null;
      resolve(chunk);
    } else {
      this.queue.push(chunk);
    }
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function collect(iter: AsyncIterable<ClaudeRunnerEvent>): Promise<ClaudeRunnerEvent[]> {
  const out: ClaudeRunnerEvent[] = [];
  for await (const event of iter) out.push(event);
  return out;
}

describe('ClaudeStreamingRunner', () => {
  it('启动期间不暂存插话，返回未提交让路由使用正常队列', async () => {
    const handle = new FakeHandle();
    let probed!: (supported: boolean) => void;
    const probe = new Promise<boolean>((resolve) => { probed = resolve; });
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: () => probe });
    await runner.startSession({ bridgeSessionId: 'early', cwd: '/tmp' });
    // 还没有生成在读：交回路由排队，不能写进一个没人转发输出的进程
    expect(await runner.steerSession('early', 'too early')).toBe(false);
    const collected = collect(runner.sendMessage({ bridgeSessionId: 'early', text: 'build' }));
    await tick();
    expect(await runner.steerSession('early', 'also check logs')).toBe(false);
    probed(true);
    await tick();
    handle.feedLine({ type: 'result' });
    await collected;
    expect(handle.writes.map((line) => JSON.parse(line).message.content)).toEqual(['build']);
  });
  it('keeps consuming native background follow-up turns without a new user message', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bg', cwd: '/tmp', options: { providerSessionId: 'native-bg' } });
    const events: ClaudeRunnerEvent[] = [];
    const reading = (async () => { for await (const event of runner.sendMessage({ bridgeSessionId: 'bg', text: 'build' })) events.push(event); })();
    await tick();
    handle.feedLine({ type: 'system', subtype: 'background_tasks_changed', tasks: [
      { task_id: 'build', description: '完整构建', task_type: 'local_bash' },
      { task_id: 'watch', description: '内部监控', task_type: 'local_bash', ambient: true },
    ] });
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '已启动构建' }] } });
    handle.feedLine({ type: 'result', session_id: 'native-bg' });
    await tick();
    expect(events).toContainEqual({ type: 'background_tasks', tasks: [{ id: 'build', description: '完整构建' }] });
    expect(events.filter((e) => e.type === 'turn_end')).toHaveLength(1);
    handle.feedLine({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '构建通过' }] } });
    handle.feedLine({ type: 'result', session_id: 'native-bg' });
    await tick();
    expect(events).toContainEqual({ type: 'text_delta', text: '构建通过' });
    expect(events.filter((e) => e.type === 'turn_end')).toHaveLength(2);
    await runner.stopSession('bg');
    await reading;
  });

  it('drives a persistent process and maps a turn to events', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'hi' }));
    await tick();
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    const events = await collected;

    expect(handle.writes[0]).toContain('"type":"user"');
    expect(handle.writes[0]).toContain('hi');
    expect(events).toEqual([
      { type: 'text_delta', text: 'hello' },
      { type: 'message_done' },
      { type: 'message_done' },
      { type: 'turn_end' },
    ]);
  });

  it('每个工具调用（含提问类工具）都发出 tool_event：之前的文字是过程说明', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'go' }));
    await tick();
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '我先看看' }, { type: 'tool_use', name: 'Read', input: {} }] } });
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    const events = await collected;

    expect(events).toEqual([
      { type: 'text_delta', text: '我先看看' },
      { type: 'message_done' },
      { type: 'tool_event', title: 'Read' },
      { type: 'tool_event', title: 'AskUserQuestion' },
      { type: 'message_done' },
      { type: 'turn_end' },
    ]);
  });

  it('子代理的输出（parent_tool_use_id 非空）不当作助手回复', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'go' }));
    await tick();
    handle.feedLine({ type: 'assistant', parent_tool_use_id: 'toolu_task', message: { content: [{ type: 'text', text: '子代理的话' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    const events = await collected;

    expect(events.some((event) => event.type === 'text_delta')).toBe(false);
  });

  it('can_use_tool 的提问转成 user_prompt，作答写回 control_response，等待期间不判卡死', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true, idleTimeoutMs: 20 });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const input = {
      questions: [{
        question: '晚饭吃米饭还是面条？',
        header: '晚饭',
        multiSelect: false,
        options: [{ label: '米饭', description: '吃米饭' }, { label: '面条' }],
      }],
    };
    const iterator = runner.sendMessage({ bridgeSessionId: 'bs1', text: 'ask me' })[Symbol.asyncIterator]();
    const first = iterator.next();
    await tick();
    handle.feedLine({
      type: 'control_request',
      request_id: 'req-1',
      request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input, requires_user_interaction: true },
    });
    const step = await first;
    expect(step.done).toBe(false);
    const event = step.value as Extract<ClaudeRunnerEvent, { type: 'user_prompt' }>;
    expect(event.type).toBe('user_prompt');
    expect(event.prompt).toEqual({
      kind: 'question',
      questions: [{
        id: '晚饭吃米饭还是面条？',
        question: '晚饭吃米饭还是面条？',
        multiSelect: false,
        options: [{ label: '米饭', description: '吃米饭' }, { label: '面条' }],
      }],
    });

    // 远超 idleTimeoutMs 仍没人作答：进程不能被当成卡死杀掉
    const next = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(handle.closed).toBe(false);

    event.respond({ kind: 'answers', answers: { '晚饭吃米饭还是面条？': '面条' } });
    expect(JSON.parse(handle.writes.at(-1)!)).toEqual({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-1',
        response: { behavior: 'allow', updatedInput: { ...input, answers: { '晚饭吃米饭还是面条？': '面条' } } },
      },
    });

    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    expect((await next).value).toEqual({ type: 'message_done' });
  });

  it('作答之后从作答那一刻重新计卡死，不沿用等待期间计时器剩下的时间', async () => {
    vi.useFakeTimers();
    try {
      const handle = new FakeHandle();
      const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true, idleTimeoutMs: 100 });
      await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

      const iterator = runner.sendMessage({ bridgeSessionId: 'bs1', text: 'ask' })[Symbol.asyncIterator]();
      const first = iterator.next();
      await vi.advanceTimersByTimeAsync(0);
      handle.feedLine({ type: 'control_request', request_id: 'r', request: { subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan: 'p' } } });
      const event = (await first).value as Extract<ClaudeRunnerEvent, { type: 'user_prompt' }>;
      const next = iterator.next();

      // 等人期间跨过一个半计时周期也不判卡死；在 t=150 作答（等待期间的计时器此时只剩 50）
      await vi.advanceTimersByTimeAsync(150);
      expect(handle.closed).toBe(false);
      event.respond({ kind: 'approve' });

      // 沿用剩下的 50 会在 t=200 判卡死；从作答起算则要到 t=250
      await vi.advanceTimersByTimeAsync(90);
      expect(handle.closed).toBe(false);
      await vi.advanceTimersByTimeAsync(20);
      expect(handle.closed).toBe(true);
      expect((await next).value).toEqual({ type: 'error', error: 'idle_timeout', code: 'idle_timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('桥接不支持的控制请求回错误，CLI 不会一直等', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'hi' }));
    await tick();
    handle.feedLine({ type: 'control_request', request_id: 'el-1', request: { subtype: 'elicitation', message: '?' } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await collected;

    const response = JSON.parse(handle.writes.find((line) => line.includes('el-1'))!);
    expect(response.response).toMatchObject({ subtype: 'error', request_id: 'el-1' });
  });

  it('CLI 撤回还没作答的请求：发出 user_prompt_withdrawn，之后的作答不再回写', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const iterator = runner.sendMessage({ bridgeSessionId: 'bs1', text: 'go' })[Symbol.asyncIterator]();
    const first = iterator.next();
    await tick();
    handle.feedLine({ type: 'control_request', request_id: 'req-9', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'rm -f x' } } });
    const event = (await first).value as Extract<ClaudeRunnerEvent, { type: 'user_prompt' }>;
    expect(event.id).toBe('req-9');

    const next = iterator.next();
    handle.feedLine({ type: 'control_cancel_request', request_id: 'req-9' });
    expect((await next).value).toEqual({ type: 'user_prompt_withdrawn', id: 'req-9' });

    event.respond({ kind: 'approve' });
    expect(handle.writes.some((line) => line.includes('control_response') && line.includes('req-9'))).toBe(false);
    await iterator.return?.();
  });

  it('这次生成收尾后插话不接受：不写进没人转发输出的进程，否则之后每条回复都错开一条', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'A' }));
    await tick();
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await collected;

    expect(await runner.steerSession('bs1', 'B')).toBe(false);
    expect(handle.writes.some((line) => line.includes('"B"'))).toBe(false);
  });

  it('计划选「执行但逐个确认」：回复带上切到默认模式，这一轮结束时切回跳过权限；选「执行」不切回', async () => {
    for (const mode of ['default', 'bypassPermissions'] as const) {
      const handle = new FakeHandle();
      const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
      await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

      const iterator = runner.sendMessage({ bridgeSessionId: 'bs1', text: 'plan' })[Symbol.asyncIterator]();
      const first = iterator.next();
      await tick();
      handle.feedLine({ type: 'control_request', request_id: 'p1', request: { subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan: 'p' } } });
      const event = (await first).value as Extract<ClaudeRunnerEvent, { type: 'user_prompt' }>;
      event.respond({ kind: 'approve', permissionMode: mode });

      const response = JSON.parse(handle.writes.find((line) => line.includes('"p1"'))!);
      expect(response.response.response.updatedPermissions).toEqual([{ type: 'setMode', mode, destination: 'session' }]);

      const rest = collect({ [Symbol.asyncIterator]: () => iterator });
      handle.feedLine({ type: 'result', session_id: 'sess-1' });
      await rest;
      const restores = handle.writes.filter((line) => line.includes('set_permission_mode')).map((line) => JSON.parse(line).request);
      expect(restores).toEqual(mode === 'default' ? [{ subtype: 'set_permission_mode', mode: 'bypassPermissions' }] : []);
    }
  });

  it('拒绝写回 deny 与原因', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const iterator = runner.sendMessage({ bridgeSessionId: 'bs1', text: 'plan' })[Symbol.asyncIterator]();
    const first = iterator.next();
    await tick();
    handle.feedLine({
      type: 'control_request',
      request_id: 'req-2',
      request: { subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan: '1. 改 A' } },
    });
    const event = (await first).value as Extract<ClaudeRunnerEvent, { type: 'user_prompt' }>;
    expect(event.prompt).toEqual({ kind: 'plan', plan: '1. 改 A' });

    event.respond({ kind: 'deny', message: '先别改 A' });
    event.respond({ kind: 'approve' }); // 重复作答无效
    const responses = handle.writes.filter((line) => line.includes('control_response'));
    expect(responses).toHaveLength(1);
    expect(JSON.parse(responses[0]!).response.response).toEqual({ behavior: 'deny', message: '先别改 A' });
    await iterator.return?.();
  });

  it('启动参数带 --permission-prompt-tool stdio，提问才会交给桥接', async () => {
    const calls: Array<{ args: string[] }> = [];
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: (call) => { calls.push(call); return handle; }, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'hi' }));
    await tick();
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await collected;

    const idx = calls[0]!.args.indexOf('--permission-prompt-tool');
    expect(calls[0]!.args[idx + 1]).toBe('stdio');
    expect(calls[0]!.args).toContain('--dangerously-skip-permissions');
  });

  it('passes the fixed bridge system prompt via --append-system-prompt', async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: (call) => { calls.push(call); return handle; }, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'hi' }));
    await tick();
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await collected;

    const idx = calls[0].args.indexOf('--append-system-prompt');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(calls[0].args[idx + 1]).toBe(BRIDGE_APPEND_SYSTEM_PROMPT);
  });

  it('reuses the same handle across turns and resumes with --resume', async () => {
    let spawnCount = 0;
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => { spawnCount += 1; return handle; }, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const first = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'one' }));
    await tick();
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await first;

    const second = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'two' }));
    await tick();
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await second;

    expect(spawnCount).toBe(1);
    expect(handle.writes).toHaveLength(2);
  });

  it('consumes a steered follow-up turn within the same generation', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'start' }));
    await tick();
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: 'first' }] } });
    await tick();
    await runner.steerSession('bs1', 'also this');
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await tick();
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: 'second' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    const events = await collected;

    expect(handle.writes.some((w) => w.includes('also this'))).toBe(true);
    expect(events.filter((e) => e.type === 'text_delta')).toEqual([
      { type: 'text_delta', text: 'first' },
      { type: 'text_delta', text: 'second' },
    ]);
  });

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

  it('writes a native control_request interrupt envelope', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'go' }));
    await tick();
    await runner.interruptSession('bs1');
    handle.feedLine({ type: 'result', subtype: 'error_during_execution', session_id: 'sess-1' });
    await collected;

    const interruptWrite = handle.writes.find((w) => w.includes('control_request'));
    expect(interruptWrite).toBeTruthy();
    expect(interruptWrite).toContain('"subtype":"interrupt"');
  });

  it('capTail keeps only the last N chars and is a no-op under the cap', () => {
    expect(capTail('abcdef', 3)).toBe('def');
    expect(capTail('ab', 3)).toBe('ab');
    expect(capTail('abcdef', 0)).toBe('abcdef');
  });

  it('readEnvInt parses valid ints and falls back otherwise', () => {
    expect(readEnvInt('999', 10)).toBe(999);
    expect(readEnvInt(undefined, 10)).toBe(10);
    expect(readEnvInt('', 10)).toBe(10);
    expect(readEnvInt('abc', 10)).toBe(10);
    expect(readEnvInt('-5', 10)).toBe(10);
  });

  it('surfaces an errored result as an error event', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs_err', cwd: '/tmp/project', options: { providerSessionId: 'sess-err' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs_err', text: 'hi' }));
    await tick();
    // 真实形状取自 claude CLI：错误不走 type:"error"，而是 result + is_error。
    handle.feedLine({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      session_id: 'sess-err',
      errors: ['Reached maximum number of turns (1)'],
    });
    const events = await collected;

    expect(events).toContainEqual({
      type: 'error',
      error: 'Reached maximum number of turns (1)',
    });
  });

  it('does not emit an error event for a successful result', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs_ok', cwd: '/tmp/project', options: { providerSessionId: 'sess-ok' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs_ok', text: 'hi' }));
    await tick();
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } });
    handle.feedLine({ type: 'result', subtype: 'success', is_error: false, session_id: 'sess-ok', result: 'hello' });
    const events = await collected;

    expect(events.some((event) => event.type === 'error')).toBe(false);
  });
});
