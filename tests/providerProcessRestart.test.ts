import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeStreamingRunner, type ClaudeStreamChunk, type ClaudeStreamHandle } from '../src/providers/claude-code/claudeStreamingRunner';
import type { ClaudeRunnerEvent } from '../src/providers/claude-code/claudeRunner';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { CodexAppServerClient } from '../src/providers/codex/codexAppServerClient';

// CLI 进程在两条消息之间自己退出了（崩溃、被关掉）：用户下一条消息要当场重新拉起、
// 接回同一个原生会话并处理这条消息，不能发给已经死掉的进程而丢掉。

class FakeHandle implements ClaudeStreamHandle {
  readonly writes: string[] = [];
  exited = false;
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

  close(): void {}

  feed(chunk: ClaudeStreamChunk): void {
    if (chunk.type === 'exit') this.exited = true;
    const resolve = this.resolveNext;
    if (resolve) {
      this.resolveNext = null;
      resolve(chunk);
    } else {
      this.queue.push(chunk);
    }
  }

  feedLine(value: unknown): void {
    this.feed({ type: 'line', line: JSON.stringify(value) });
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function collect(iter: AsyncIterable<ClaudeRunnerEvent>): Promise<ClaudeRunnerEvent[]> {
  const out: ClaudeRunnerEvent[] = [];
  for await (const event of iter) out.push(event);
  return out;
}

describe('CLI 进程在两条消息之间退出后，下一条消息自动接上', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Claude：重新拉起进程并 --resume 原会话，这条消息交给新进程、回复照常发出', async () => {
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
    });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const first = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: '第一条' }));
    await tick();
    handles[0]!.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '答一' }] } });
    handles[0]!.feedLine({ type: 'result', session_id: 'sess-1' });
    await first;

    // 两条消息之间进程自己退出了
    handles[0]!.feed({ type: 'exit', code: 1, stderr: 'crashed' });

    const second = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: '第二条' }));
    await tick();
    expect(handles).toHaveLength(2);
    handles[1]!.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '答二' }] } });
    handles[1]!.feedLine({ type: 'result', session_id: 'sess-1' });
    const events = await second;

    expect(calls[1]).toEqual(expect.arrayContaining(['--resume', 'sess-1']));
    expect(handles[1]!.writes.some((line) => line.includes('第二条'))).toBe(true);
    expect(handles[0]!.writes.some((line) => line.includes('第二条'))).toBe(false);
    expect(events).toContainEqual({ type: 'text_delta', text: '答二' });
    expect(events.some((event) => event.type === 'error')).toBe(false);
  });

  it('Codex：app-server 退出后重建并 thread/resume 原线程，这条消息照常开始新一轮', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const closeHandlers: Array<(error: Error) => void> = [];
    let initializeCount = 0;
    const turnInputs: string[] = [];
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockImplementation(async () => { initializeCount += 1; });
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method: string, params?: unknown) => {
      if (method === 'thread/start') return { threadId: 'thread-restart' };
      if (method === 'thread/resume') return { threadId: 'thread-restart' };
      if (method === 'turn/start') {
        const input = (params as { input: Array<{ text: string }> }).input[0]!.text;
        turnInputs.push(input);
        const turnId = `turn-${turnInputs.length}`;
        queueMicrotask(() => {
          notificationHandlers.get('turn/completed')?.({ threadId: 'thread-restart', turn: { id: turnId, items: [] } });
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
    vi.spyOn(CodexAppServerClient.prototype, 'onClose').mockImplementation((handler: (error: Error) => void) => {
      closeHandlers.push(handler);
      return () => undefined;
    });
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true) });
    await runner.startSession({ bridgeSessionId: 'bs_restart', cwd: '/tmp/project' });
    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_restart', text: '第一条' })) { /* drain */ }

    // 两条消息之间 app-server 自己退出了
    for (const handler of closeHandlers) handler(new Error('codex_app_server_closed:1'));

    const events: unknown[] = [];
    const second = (async () => {
      for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_restart', text: '第二条' })) events.push(event);
    })();
    const finished = await Promise.race([second.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 1000))]);

    expect(finished).toBe(true);
    expect(initializeCount).toBe(2);
    expect(turnInputs).toEqual(['第一条', '第二条']);
    expect(events.some((event) => (event as { type: string }).type === 'error')).toBe(false);
  });
});
