import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { CodexAppServerClient } from '../src/providers/codex/codexAppServerClient';
import type { ProviderEvent } from '../src/providers/types';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Codex 进程重建', () => {
  it('后台子任务在跑时 app-server 崩溃：下一条消息重建后不继承旧的后台状态，这一轮结束就结束', async () => {
    const handlers = new Map<string, (params: unknown) => void>();
    const closeHandlers: Array<(error: Error) => void> = [];
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method, handler) => { handlers.set(method, handler); return () => {}; });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'onClose').mockImplementation((handler) => { closeHandlers.push(handler); return () => {}; });
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue();
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method) => {
      if (method === 'thread/start' || method === 'thread/resume') return { threadId: 'parent' };
      if (method === 'turn/start') return { turn: { id: 't' } };
      return {};
    });
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: async () => true });
    await runner.startSession({ bridgeSessionId: 'cr', cwd: '/tmp/nonexistent-crash' });

    const first = (async () => { for await (const _e of runner.sendMessage({ bridgeSessionId: 'cr', text: '一' })) { /* drain */ } })();
    await tick();
    handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 't', items: [
      { type: 'collabAgentToolCall', id: 's', agentsStates: { child: { status: 'running' } }, prompt: '审查' },
    ] } });
    await tick();
    for (const handler of closeHandlers) handler(new Error('codex_app_server_closed:1'));
    await first;

    let finished = false;
    const second = (async () => { for await (const _e of runner.sendMessage({ bridgeSessionId: 'cr', text: '二' })) { /* drain */ } finished = true; })();
    await tick();
    handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 't', items: [{ type: 'agentMessage', id: 'r', text: '好了' }] } });
    await Promise.race([second, new Promise((resolve) => setTimeout(resolve, 200))]);

    expect(finished).toBe(true);
  });
});

describe('Codex 插话请求失败', () => {
  it('插话被 app-server 拒绝（这一轮刚结束）：返回 false 交回路由排队，不留在暂存里事后乱序补送', async () => {
    const handlers = new Map<string, (params: unknown) => void>();
    const requests: Array<{ method: string; text?: string }> = [];
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method, handler) => { handlers.set(method, handler); return () => {}; });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'onClose').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue();
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method, params) => {
      requests.push({ method, text: (params as { input?: Array<{ text: string }> } | undefined)?.input?.[0]?.text });
      if (method === 'thread/start') return { threadId: 'parent' };
      if (method === 'turn/start') return { turn: { id: 'turn1' } };
      if (method === 'turn/steer') throw new Error('expected turn mismatch');
      return {};
    });
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: async () => true });
    await runner.startSession({ bridgeSessionId: 'st', cwd: '/tmp/nonexistent-steer' });
    const reading = (async () => { for await (const _event of runner.sendMessage({ bridgeSessionId: 'st', text: '第一条' })) { /* drain */ } })();
    await tick();

    expect(await runner.steerTurn('st', '补充')).toBe(false);

    handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 'turn1', items: [] } });
    await reading;
    // 补充没有留在暂存里：后面再开新一轮时不会被夹带送出
    const startsBefore = requests.filter((r) => r.method === 'turn/start').length;
    const second = (async () => { for await (const _event of runner.sendMessage({ bridgeSessionId: 'st', text: '第二条' })) { /* drain */ } })();
    await tick();
    handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 'turn1', items: [] } });
    await second;
    expect(requests.filter((r) => r.method === 'turn/start').slice(startsBefore).map((r) => r.text)).toEqual(['第二条']);
    expect(requests.filter((r) => r.method === 'turn/steer').map((r) => r.text)).toEqual(['补充']);
  });
});

describe('Codex 后台子任务：前台停下、子任务结束后的那一轮结论都发出，然后结束这次生成', () => {
  it('子任务还在跑时一轮结束不退出；它结束、Codex 再开的那一轮结论发出后退出，不一直挂着', async () => {
    const handlers = new Map<string, (params: unknown) => void>();
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method, handler) => {
      handlers.set(method, handler);
      return () => {};
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'onClose').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue();
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method) => {
      if (method === 'thread/start') return { threadId: 'parent' };
      if (method === 'turn/start') return { turn: { id: 'turn1' } };
      return {};
    });
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: async () => true });
    await runner.startSession({ bridgeSessionId: 'bg', cwd: '/tmp/nonexistent-exit' });

    const events: ProviderEvent[] = [];
    let finished = false;
    const reading = (async () => {
      for await (const event of runner.sendMessage({ bridgeSessionId: 'bg', text: 'review' })) events.push(event);
      finished = true;
    })();
    await tick();
    handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 'turn1', items: [
      { type: 'collabAgentToolCall', id: 'spawn', tool: 'spawnAgent', status: 'completed', agentsStates: { child: { status: 'running' } }, prompt: '审查配置' },
      { type: 'agentMessage', id: 'r1', text: '审查已启动' },
    ] } });
    await tick();
    // 前台停下、子任务还在跑：不能结束
    expect(finished).toBe(false);

    handlers.get('turn/completed')?.({ threadId: 'child', turn: { id: 'child-turn', items: [] } });
    await tick();
    // 子任务已结束，但 Codex 还要为它再开一轮：仍不能结束
    expect(finished).toBe(false);

    handlers.get('turn/started')?.({ threadId: 'parent', turn: { id: 'turn2' } });
    handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 'turn2', items: [{ type: 'agentMessage', id: 'final', text: '审查完成' }] } });
    await reading;

    const texts = events.filter((event) => event.type === 'text_delta').map((event) => (event as { text: string }).text);
    expect(texts).toEqual(['审查已启动', '审查完成']);
    expect(finished).toBe(true);
  });
});
