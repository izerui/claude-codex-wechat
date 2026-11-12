import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeStreamingRunner, type ClaudeStreamChunk, type ClaudeStreamHandle } from '../src/providers/claude-code/claudeStreamingRunner';
import type { ClaudeRunnerEvent } from '../src/providers/claude-code/claudeRunner';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { CodexAppServerClient } from '../src/providers/codex/codexAppServerClient';

// 空闲回收：一次生成彻底结束后空闲满 idleCloseMs 就关掉 CLI 进程；
// 用户再发消息时以原会话自动拉起，把这条消息交过去继续。干活期间不计时、不关。

const IDLE = 30 * 60 * 1000;

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

async function collect(iter: AsyncIterable<ClaudeRunnerEvent>): Promise<ClaudeRunnerEvent[]> {
  const out: ClaudeRunnerEvent[] = [];
  for await (const event of iter) out.push(event);
  return out;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Claude 空闲回收', () => {
  function setup() {
    const handles: FakeHandle[] = [];
    const calls: string[][] = [];
    const runner = new ClaudeStreamingRunner({
      spawner: (call) => {
        calls.push(call.args);
        const handle = new FakeHandle();
        handles.push(handle);
        return handle;
      },
      capabilityProbe: async () => true,
      idleCloseMs: IDLE,
    });
    return { runner, handles, calls };
  }

  it('空闲满 30 分钟才关进程；之后的消息以 --resume 拉起新进程并交给它，回复照常', async () => {
    vi.useFakeTimers();
    const { runner, handles, calls } = setup();
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const first = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: '第一条' }));
    await vi.advanceTimersByTimeAsync(0);
    handles[0]!.feedLine({ type: 'result', session_id: 'sess-1' });
    await first;

    await vi.advanceTimersByTimeAsync(IDLE - 1000);
    expect(handles[0]!.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(handles[0]!.closed).toBe(true);

    const second = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: '第二条' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(handles).toHaveLength(2);
    handles[1]!.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '答二' }] } });
    handles[1]!.feedLine({ type: 'result', session_id: 'sess-1' });
    const events = await second;

    expect(calls[1]).toEqual(expect.arrayContaining(['--resume', 'sess-1']));
    expect(handles[1]!.writes.some((line) => line.includes('第二条'))).toBe(true);
    expect(events).toContainEqual({ type: 'text_delta', text: '答二' });
  });

  it('空闲未满 30 分钟又来消息：计时作废，沿用原进程', async () => {
    vi.useFakeTimers();
    const { runner, handles } = setup();
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const first = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: '一' }));
    await vi.advanceTimersByTimeAsync(0);
    handles[0]!.feedLine({ type: 'result', session_id: 'sess-1' });
    await first;
    await vi.advanceTimersByTimeAsync(IDLE - 60_000);

    const second = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: '二' }));
    await vi.advanceTimersByTimeAsync(0);
    handles[0]!.feedLine({ type: 'result', session_id: 'sess-1' });
    await second;
    // 第二次生成结束后重新计时：从上一次算起早已过了 30 分钟，也不能关
    await vi.advanceTimersByTimeAsync(120_000);

    expect(handles).toHaveLength(1);
    expect(handles[0]!.closed).toBe(false);
  });

  it('干活期间（这一轮还没结束）多久都不关', async () => {
    vi.useFakeTimers();
    const { runner, handles } = setup();
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const running = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: '长任务' }));
    await vi.advanceTimersByTimeAsync(3 * IDLE);
    expect(handles[0]!.closed).toBe(false);

    handles[0]!.feedLine({ type: 'result', session_id: 'sess-1' });
    await running;
  });
});

describe('Codex 空闲回收', () => {
  it('空闲满 30 分钟关掉 app-server；之后的消息重建并 thread/resume，这条消息照常开始新一轮', async () => {
    vi.useFakeTimers();
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    let initializeCount = 0;
    let disposeCount = 0;
    const turnInputs: string[] = [];
    const requests: string[] = [];
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockImplementation(async () => { initializeCount += 1; });
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method: string, params?: unknown) => {
      requests.push(method);
      if (method === 'thread/start' || method === 'thread/resume') return { threadId: 'thread-idle' };
      if (method === 'turn/start') {
        turnInputs.push((params as { input: Array<{ text: string }> }).input[0]!.text);
        const turnId = `turn-${turnInputs.length}`;
        queueMicrotask(() => {
          notificationHandlers.get('turn/completed')?.({ threadId: 'thread-idle', turn: { id: turnId, items: [] } });
        });
        return { turn: { id: turnId } };
      }
      return {};
    });
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => undefined;
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onClose').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockImplementation(async () => { disposeCount += 1; });

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true), idleCloseMs: IDLE });
    await runner.startSession({ bridgeSessionId: 'bs_idle', cwd: '/tmp/project' });
    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_idle', text: '第一条' })) { /* drain */ }

    await vi.advanceTimersByTimeAsync(IDLE - 1000);
    expect(disposeCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(disposeCount).toBe(1);

    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_idle', text: '第二条' })) { /* drain */ }

    expect(initializeCount).toBe(2);
    expect(requests).toContain('thread/resume');
    expect(turnInputs).toEqual(['第一条', '第二条']);
  });
});
