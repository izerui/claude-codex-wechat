import { describe, expect, it, vi } from 'vitest';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { CodexAppServerClient } from '../src/providers/codex/codexAppServerClient';

describe('CodexInteractiveRunner', () => {
  it('starts and reuses an interactive Codex thread id', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-started' };
      if (method === 'thread/resume') return { threadId: (params as { threadId: string }).threadId };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('turn/completed')?.({ threadId: 'thread-started', turn: { id: 'turn-1' } });
        });
        return { turn: { id: 'turn-1' } };
      }
      return {};
    });
    const notify = vi.fn(async () => undefined);
    const onNotification = vi.fn((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => {
        notificationHandlers.delete(method);
      };
    });
    const onRequest = vi.fn(() => () => undefined);
    const dispose = vi.fn(async () => undefined);

    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockImplementation(notify);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation(onNotification);
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(onRequest);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockImplementation(dispose);

    const syncThreadForResume = vi.fn(async () => true);
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume });
    await runner.startSession({
      bridgeSessionId: 'bs_1',
      cwd: '/tmp/project',
      options: { sessionName: '微信 · wx_user_1 · [claude-codex-wechat:test]' },
    });

    const first = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'first' })) first.push(event);
    const second = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'second' })) second.push(event);

    expect(request).toHaveBeenNthCalledWith(1, 'thread/start', expect.objectContaining({
      cwd: '/tmp/project',
      persistExtendedHistory: true,
      experimentalRawEvents: true,
      sandboxPolicy: { type: 'disabled' },
      approvalMode: 'never',
    }));
    expect(request).toHaveBeenNthCalledWith(2, 'turn/start', expect.objectContaining({
      threadId: 'thread-started',
      input: [{ type: 'text', text: 'first' }],
    }));
    expect(request).toHaveBeenNthCalledWith(3, 'thread/resume', expect.objectContaining({
      threadId: 'thread-started',
      persistExtendedHistory: true,
    }));
    expect(request).toHaveBeenNthCalledWith(4, 'turn/start', expect.objectContaining({
      threadId: 'thread-started',
      input: [{ type: 'text', text: 'second' }],
    }));

    expect(first).toContainEqual({
      type: 'session_state',
      state: expect.objectContaining({ providerSessionId: 'thread-started', cwd: '/tmp/project' }),
    });
    expect(second).toContainEqual({
      type: 'session_state',
      state: expect.objectContaining({ providerSessionId: 'thread-started', cwd: '/tmp/project' }),
    });
    expect(syncThreadForResume).toHaveBeenCalledWith({
      sessionId: 'thread-started',
      resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:test]',
      cwd: '/tmp/project',
    });
  });

  it('waits until turn completion before syncing native resume metadata', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-late-sync' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('turn/completed')?.({ threadId: 'thread-late-sync', turn: { id: 'turn-late' } });
        });
        return { turn: { id: 'turn-late' } };
      }
      return {};
    });
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => {
        notificationHandlers.delete(method);
      };
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const order: string[] = [];
    const syncThreadForResume = vi.fn(async () => {
      order.push('sync');
      return true;
    });
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume });
    await runner.startSession({
      bridgeSessionId: 'bs_wait',
      cwd: '/tmp/project',
      options: { sessionName: '微信 · wait test · [claude-codex-wechat:wait]' },
    });

    queueMicrotask(() => order.push('turn-completed-emitted'));
    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_wait', text: 'hello' })) {}

    expect(syncThreadForResume).toHaveBeenCalledWith({
      sessionId: 'thread-late-sync',
      resumeTitle: '微信 · wait test · [claude-codex-wechat:wait]',
      cwd: '/tmp/project',
    });
    expect(order).toContain('sync');
  });

  it('emits one provider message per agent message item within a single turn', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-multi-message' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-1', delta: '第一段' });
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-1', delta: '，继续' });
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-2', delta: '第二段' });
          notificationHandlers.get('turn/completed')?.({ threadId: 'thread-multi-message', turn: { id: 'turn-multi' } });
        });
        return { turn: { id: 'turn-multi' } };
      }
      return {};
    });
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => {
        notificationHandlers.delete(method);
      };
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const syncThreadForResume = vi.fn(async () => true);
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume });
    await runner.startSession({
      bridgeSessionId: 'bs_multi',
      cwd: '/tmp/project',
      options: { sessionName: '微信 · multi message · [claude-codex-wechat:multi]' },
    });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_multi', text: 'hello' })) events.push(event);

    expect(events).toEqual([
      {
        type: 'session_state',
        state: expect.objectContaining({ providerSessionId: 'thread-multi-message', cwd: '/tmp/project' }),
      },
      { type: 'text_delta', text: '第一段，继续' },
      { type: 'message_done' },
      { type: 'text_delta', text: '第二段' },
      { type: 'message_done' },
      {
        type: 'session_state',
        state: expect.objectContaining({ providerSessionId: 'thread-multi-message', cwd: '/tmp/project' }),
      },
    ]);
  });

  it('flushes the previous agent message immediately when itemId changes', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const syncThreadForResume = vi.fn(async () => true);
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-immediate-flush' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-1', delta: '先发这一条' });
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-2', delta: '再发下一条' });
          queueMicrotask(() => {
            notificationHandlers.get('turn/completed')?.({ threadId: 'thread-immediate-flush', turn: { id: 'turn-immediate' } });
          });
        });
        return { turn: { id: 'turn-immediate' } };
      }
      return {};
    });
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => {
        notificationHandlers.delete(method);
      };
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume });
    await runner.startSession({
      bridgeSessionId: 'bs_immediate',
      cwd: '/tmp/project',
      options: { sessionName: '微信 · immediate flush · [claude-codex-wechat:immediate]' },
    });

    const iterator = runner.sendMessage({ bridgeSessionId: 'bs_immediate', text: 'hello' })[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      value: {
        type: 'session_state',
        state: expect.objectContaining({ providerSessionId: 'thread-immediate-flush', cwd: '/tmp/project' }),
      },
      done: false,
    });
    expect(await iterator.next()).toEqual({
      value: { type: 'text_delta', text: '先发这一条' },
      done: false,
    });
    expect(await iterator.next()).toEqual({
      value: { type: 'message_done' },
      done: false,
    });
  });

  it('disposes the client and emits idle_timeout when a turn stays silent', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-stuck' };
      if (method === 'turn/start') return { turn: { id: 'turn-stuck' } };
      return {};
    });
    const dispose = vi.fn(async () => undefined);

    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => {
        notificationHandlers.delete(method);
      };
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockImplementation(dispose);

    const syncThreadForResume = vi.fn(async () => true);
    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume, idleTimeoutMs: 30 });
    await runner.startSession({
      bridgeSessionId: 'bs_stuck',
      cwd: '/tmp/project',
      options: { sessionName: '微信 · stuck · [claude-codex-wechat:stuck]' },
    });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_stuck', text: 'hello' })) events.push(event);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(syncThreadForResume).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: 'session_state',
        state: expect.objectContaining({ providerSessionId: 'thread-stuck', cwd: '/tmp/project' }),
      },
      { type: 'error', error: 'idle_timeout', code: 'idle_timeout' },
    ]);
  });

  it('recovers the reply from turn/completed items when no delta was streamed', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-nodelta' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          // 瞬时（非流式）回合：app-server 不发 item/agentMessage/delta，
          // 完整文本只出现在 turn/completed 的 items 里。
          notificationHandlers.get('turn/completed')?.({
            threadId: 'thread-nodelta',
            turn: {
              id: 'turn-nodelta',
              status: 'completed',
              error: null,
              items: [
                { type: 'agentMessage', id: 'msg-1', text: '已选择第 1 个视频。' },
              ],
            },
          });
        });
        return { turn: { id: 'turn-nodelta' } };
      }
      return {};
    });

    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => { notificationHandlers.delete(method); };
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true) });
    await runner.startSession({ bridgeSessionId: 'bs_nodelta', cwd: '/tmp/project', options: {} });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_nodelta', text: 'hi' })) events.push(event);

    expect(events).toContainEqual({ type: 'text_delta', text: '已选择第 1 个视频。' });
  });

  it('does not duplicate a streamed reply that also appears in turn/completed items', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-dup' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-1', delta: '流式内容' });
          notificationHandlers.get('turn/completed')?.({
            threadId: 'thread-dup',
            turn: {
              id: 'turn-dup',
              status: 'completed',
              error: null,
              items: [{ type: 'agentMessage', id: 'msg-1', text: '流式内容' }],
            },
          });
        });
        return { turn: { id: 'turn-dup' } };
      }
      return {};
    });

    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => { notificationHandlers.delete(method); };
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true) });
    await runner.startSession({ bridgeSessionId: 'bs_dup', cwd: '/tmp/project', options: {} });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_dup', text: 'hi' })) events.push(event);

    const texts = events.filter((event) => event.type === 'text_delta');
    expect(texts).toHaveLength(1);
  });

  it('surfaces the provider error carried by turn/completed', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-failing' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('turn/completed')?.({
            threadId: 'thread-failing',
            turn: {
              id: 'turn-failing',
              items: [],
              status: 'failed',
              error: { message: '{"error":{"message":"include is not supported"}}' },
            },
          });
        });
        return { turn: { id: 'turn-failing' } };
      }
      return {};
    });

    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => {
        notificationHandlers.delete(method);
      };
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true) });
    await runner.startSession({ bridgeSessionId: 'bs_err', cwd: '/tmp/project', options: {} });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_err', text: '11' })) events.push(event);

    expect(events).toContainEqual({
      type: 'error',
      error: '{"error":{"message":"include is not supported"}}',
    });
  });

  it('does not emit an error event when turn/completed carries no error', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-ok' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('turn/completed')?.({
            threadId: 'thread-ok',
            turn: { id: 'turn-ok', items: [], status: 'completed', error: null },
          });
        });
        return { turn: { id: 'turn-ok' } };
      }
      return {};
    });

    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(request);
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => {
        notificationHandlers.delete(method);
      };
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true) });
    await runner.startSession({ bridgeSessionId: 'bs_ok', cwd: '/tmp/project', options: {} });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_ok', text: 'hi' })) events.push(event);

    expect(events.some((event) => event.type === 'error')).toBe(false);
  });
});
