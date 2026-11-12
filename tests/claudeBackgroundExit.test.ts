import { describe, expect, it } from 'vitest';
import { ClaudeStreamingRunner, type ClaudeStreamChunk, type ClaudeStreamHandle } from '../src/providers/claude-code/claudeStreamingRunner';
import type { ClaudeRunnerEvent } from '../src/providers/claude-code/claudeRunner';

// 事件顺序取自真实 Claude CLI（后台 Bash）：前台一轮结束 → 后台完成通知 → init 开新一轮 → 结论 → result。

class FakeHandle implements ClaudeStreamHandle {
  private readonly queue: ClaudeStreamChunk[] = [];
  private resolveNext: ((chunk: ClaudeStreamChunk) => void) | null = null;
  write(): void {}
  read(): Promise<ClaudeStreamChunk> {
    const next = this.queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => { this.resolveNext = resolve; });
  }
  close(): void {}
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

describe('Claude 后台任务：前台停下、后台完成后的那一轮结论都发出，然后结束这次生成', () => {
  it('后台在跑时一轮结束不退出；完成通知那一轮的结论发出后退出，不一直挂着', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const events: ClaudeRunnerEvent[] = [];
    let finished = false;
    const reading = (async () => {
      for await (const event of runner.sendMessage({ bridgeSessionId: 'bs1', text: 'go' })) events.push(event);
      finished = true;
    })();
    await tick();
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { run_in_background: true } }] } });
    handle.feedLine({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'b1', description: 'sleep' }] });
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '已在后台启动' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await tick();
    // 前台停下、后台还在跑：不能结束
    expect(finished).toBe(false);

    handle.feedLine({ type: 'system', subtype: 'task_notification', task_id: 'b1', status: 'completed' });
    handle.feedLine({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    handle.feedLine({ type: 'system', subtype: 'init', session_id: 'sess-1' });
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '后台完成：BG-DONE' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await reading;

    const texts = events.filter((event) => event.type === 'text_delta').map((event) => (event as { text: string }).text);
    expect(texts).toEqual(['已在后台启动', '后台完成：BG-DONE']);
    expect(events.filter((event) => event.type === 'turn_end')).toHaveLength(2);
    expect(finished).toBe(true);
  });

  it('前台已停、只在等后台时插话：插话那一轮结束、后台也清空后就结束，不多等一轮', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    let finished = false;
    const reading = (async () => {
      for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs1', text: 'go' })) { /* drain */ }
      finished = true;
    })();
    await tick();
    handle.feedLine({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'b1' }] });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await tick();
    expect(await runner.steerSession('bs1', '把后台任务停了')).toBe(true);
    handle.feedLine({ type: 'system', subtype: 'init', session_id: 'sess-1' });
    handle.feedLine({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '已停掉' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, 200))]);

    expect(finished).toBe(true);
  });

  it('后台任务在前台这一轮里就已完成：前台结束后仍等完成通知那一轮，不提前退出', async () => {
    const handle = new FakeHandle();
    const runner = new ClaudeStreamingRunner({ spawner: () => handle, capabilityProbe: async () => true });
    await runner.startSession({ bridgeSessionId: 'bs1', cwd: '/tmp/project', options: { providerSessionId: 'sess-1' } });

    const texts: string[] = [];
    let finished = false;
    const reading = (async () => {
      for await (const event of runner.sendMessage({ bridgeSessionId: 'bs1', text: 'go' })) if (event.type === 'text_delta') texts.push(event.text);
      finished = true;
    })();
    await tick();
    handle.feedLine({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'b1' }] });
    handle.feedLine({ type: 'system', subtype: 'task_notification', task_id: 'b1', status: 'completed' });
    handle.feedLine({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '前台结论' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await tick();
    expect(finished).toBe(false);

    handle.feedLine({ type: 'system', subtype: 'init', session_id: 'sess-1' });
    handle.feedLine({ type: 'assistant', message: { content: [{ type: 'text', text: '通知那一轮的结论' }] } });
    handle.feedLine({ type: 'result', session_id: 'sess-1' });
    await reading;

    expect(texts).toEqual(['前台结论', '通知那一轮的结论']);
  });
});
