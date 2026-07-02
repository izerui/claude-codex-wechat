import { describe, expect, it } from 'vitest';
import { ClaudeStreamingRunner, type ClaudeStreamChunk, type ClaudeStreamHandle } from '../src/providers/claude-code/claudeStreamingRunner';
import type { ClaudeRunnerEvent } from '../src/providers/claude-code/claudeRunner';

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
    const runner = new ClaudeStreamingRunner({ spawner: () => handle });
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
    const runner = new ClaudeStreamingRunner({ spawner: () => handle });
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

  it('reuses the same handle across turns and resumes with --resume', async () => {
    let spawnCount = 0;
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => { spawnCount += 1; return handle; } });
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
    const runner = new ClaudeStreamingRunner({ spawner: () => handle });
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

  it('writes a native control_request interrupt envelope', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle });
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
});
