import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient } from '../src/providers/codex/codexAppServerClient';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import type { ProviderEvent } from '../src/providers/types';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Codex background mobile delivery', () => {
  beforeEach(() => {
    vi.spyOn(CodexAppServerClient.prototype, 'onClose').mockReturnValue(() => {});
  });
  it('keeps native background replies and does not forward child output as parent output', async () => {
    const handlers = new Map<string, (params: unknown) => void>();
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method, handler) => {
      handlers.set(method, handler);
      return () => {};
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue();
    const request = vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method) => {
      if (method === 'thread/start') return { threadId: 'parent' };
      if (method === 'turn/start') return { turn: { id: 'turn1' } };
      return {};
    });
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: async () => true });
    await runner.startSession({ bridgeSessionId: 'bg', cwd: '/tmp/nonexistent-alignment' });
    // 还没有生成在跑：插话不在 runner 里暂存，交回路由排队
    expect(await runner.steerTurn('bg', '也检查日志')).toBe(false);
    const events: ProviderEvent[] = [];
    const reading = (async () => { for await (const e of runner.sendMessage({ bridgeSessionId: 'bg', text: 'review' })) events.push(e); })();
    await tick();
    expect(request).not.toHaveBeenCalledWith('turn/steer', expect.anything());
    handlers.get('item/completed')?.({ threadId: 'parent', item: {
      type: 'collabAgentToolCall', id: 'spawn', tool: 'spawnAgent', status: 'completed',
      senderThreadId: 'parent', receiverThreadIds: ['child'], agentsStates: { child: { status: 'running' } },
      prompt: '审查配置',
    } });
    handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 'turn1', items: [{ type: 'agentMessage', id: 'reply', text: '审查已启动' }] } });
    await tick();
    expect(events).toContainEqual({ type: 'background_tasks', tasks: [{ id: 'child', description: '审查配置' }] });
    handlers.get('item/agentMessage/delta')?.({ threadId: 'child', itemId: 'child-text', delta: '内部子代理输出' });
    handlers.get('turn/completed')?.({ threadId: 'child', turn: { id: 'child-turn', items: [] } });
    handlers.get('turn/started')?.({ threadId: 'parent', turn: { id: 'turn2' } });
    handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 'turn2', items: [{ type: 'agentMessage', id: 'final', text: '审查完成' }] } });
    await tick();
    expect(events).toContainEqual({ type: 'text_delta', text: '审查完成' });
    expect(events).not.toContainEqual({ type: 'text_delta', text: '内部子代理输出' });
    // 后台已清空、最后一轮结论已发：这次生成结束；之后的消息由路由正常开新一轮，不再当插话
    await reading;
    expect(await runner.steerTurn('bg', '再检查日志')).toBe(false);
    await runner.stopSession('bg');
  });

  it('recovers a final-only item after streamed commentary', async () => {
    const handlers = new Map<string, (params: unknown) => void>();
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method, handler) => { handlers.set(method, handler); return () => {}; });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method) => {
      if (method === 'thread/start') return { threadId: 'parent' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          handlers.get('item/agentMessage/delta')?.({ threadId: 'parent', itemId: 'progress', delta: '我先检查' });
          handlers.get('item/completed')?.({ threadId: 'parent', item: { type: 'agentMessage', id: 'progress', phase: 'commentary' } });
          handlers.get('turn/completed')?.({ threadId: 'parent', turn: { id: 't', items: [
            { type: 'agentMessage', id: 'progress', phase: 'commentary', text: '我先检查' },
            { type: 'agentMessage', id: 'final', text: '配置正确' },
          ] } });
        });
        return { turn: { id: 't' } };
      }
      return {};
    });
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: async () => true });
    await runner.startSession({ bridgeSessionId: 'final', cwd: '/tmp/nonexistent-alignment' });
    const events: ProviderEvent[] = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'final', text: 'check' })) events.push(event);
    expect(events).toContainEqual({ type: 'text_delta', text: '配置正确' });
  });
});
