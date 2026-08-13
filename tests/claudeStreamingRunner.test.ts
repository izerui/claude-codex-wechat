import { describe, expect, it } from 'vitest';
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
    ]);
  });

  it('renders an AskUserQuestion tool_use into a forwardable options message', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const collected = collect(runner.sendMessage({ bridgeSessionId: 'bs1', text: 'ask me' }));
    await tick();
    handle.feedLine({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: '晚饭吃米饭还是面条？',
                  header: '晚饭',
                  multiSelect: false,
                  options: [
                    { label: '米饭', description: '吃米饭' },
                    { label: '面条', description: '吃面条' },
                  ],
                },
              ],
            },
          },
        ],
      },
    });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    const events = await collected;

    const delta = events.find((event) => event.type === 'text_delta');
    expect(delta).toBeDefined();
    const text = (delta as { text: string }).text;
    expect(text).toContain('晚饭吃米饭还是面条？');
    expect(text).toContain('1. 米饭 —— 吃米饭');
    expect(text).toContain('2. 面条 —— 吃面条');

    const choice = events.find((event) => event.type === 'choice_prompt');
    expect(choice).toEqual({ type: 'choice_prompt', labels: ['米饭', '面条'], multiSelect: false });
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
