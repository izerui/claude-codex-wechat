import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { CodexAppServerClient } from '../src/providers/codex/codexAppServerClient';

describe('CodexInteractiveRunner', () => {
  beforeEach(() => {
    vi.spyOn(CodexAppServerClient.prototype, 'onClose').mockReturnValue(() => {});
  });
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

  it('每条助手消息各自结束，工具调用与过程说明发 tool_event，turn/completed 收尾发 turn_end', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === 'initialize') return { serverInfo: { name: 'fake-codex-app-server', version: '0.0.0' } };
      if (method === 'thread/start') return { threadId: 'thread-multi-message' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-1', delta: '第一段' });
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-1', delta: '，继续' });
          // 非工具条目不算干活
          notificationHandlers.get('item/started')?.({ item: { type: 'reasoning', id: 'r-1' } });
          notificationHandlers.get('item/started')?.({ item: { type: 'commandExecution', id: 'cmd-1' } });
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-2', delta: '第二段' });
          // 标明为过程说明的消息：和工具调用前的文字一样作废
          notificationHandlers.get('item/agentMessage/delta')?.({ itemId: 'msg-3', delta: '我再看看' });
          notificationHandlers.get('item/completed')?.({ item: { type: 'agentMessage', id: 'msg-3', phase: 'commentary' } });
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
      { type: 'tool_event', title: 'commandExecution' },
      { type: 'text_delta', text: '第二段' },
      { type: 'message_done' },
      { type: 'text_delta', text: '我再看看' },
      { type: 'message_done' },
      { type: 'tool_event', title: 'commentary' },
      { type: 'turn_end' },
      {
        type: 'session_state',
        state: expect.objectContaining({ providerSessionId: 'thread-multi-message', cwd: '/tmp/project' }),
      },
    ]);
  });

  it('requestUserInput 转成 user_prompt，作答按题目 id 交回，等待期间不判卡死', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const requestHandlers = new Map<string, (id: string | number, params: unknown) => unknown>();
    let pendingAnswer: unknown;
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method: string) => {
      if (method === 'thread/start') return { threadId: 'thread-ask' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          pendingAnswer = requestHandlers.get('item/tool/requestUserInput')?.(7, {
            threadId: 'thread-ask',
            turnId: 'turn-ask',
            itemId: 'item-ask',
            isBlocking: true,
            questions: [{ id: 'db', header: '数据库', question: '用哪个数据库？', isOther: true, isSecret: false, options: [{ label: 'Postgres', description: '推荐' }, { label: 'SQLite', description: '' }] }],
          });
        });
        return { turn: { id: 'turn-ask' } };
      }
      return {};
    });
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => undefined;
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation((method: string, handler: (id: string | number, params: unknown) => unknown) => {
      requestHandlers.set(method, handler);
      return () => undefined;
    });
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true), idleTimeoutMs: 20 });
    await runner.startSession({ bridgeSessionId: 'bs_ask', cwd: '/tmp/project' });
    const iterator = runner.sendMessage({ bridgeSessionId: 'bs_ask', text: 'hi' })[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ type: 'session_state' });

    const event = (await iterator.next()).value as { type: string; prompt: unknown; respond(reply: unknown): void };
    expect(event.type).toBe('user_prompt');
    expect(event.prompt).toEqual({
      kind: 'question',
      questions: [{ id: 'db', question: '用哪个数据库？', multiSelect: false, options: [{ label: 'Postgres', description: '推荐' }, { label: 'SQLite' }] }],
    });

    // 远超 idleTimeoutMs 仍没人作答：不能当成卡死收掉
    const next = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 60));

    event.respond({ kind: 'answers', answers: { db: 'SQLite' } });
    await expect(pendingAnswer).resolves.toEqual({ answers: { db: { answers: ['SQLite'] } } });

    notificationHandlers.get('turn/completed')?.({ threadId: 'thread-ask', turn: { id: 'turn-ask' } });
    expect((await next).value).toEqual({ type: 'turn_end' });
  });

  it('requestUserInput 被拒时把原因作为每道题的回答交回，不交空答案', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const requestHandlers = new Map<string, (id: string | number, params: unknown) => unknown>();
    let pendingAnswer: unknown;
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method: string) => {
      if (method === 'thread/start') return { threadId: 'thread-ask' };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          pendingAnswer = requestHandlers.get('item/tool/requestUserInput')?.(7, {
            threadId: 'thread-ask',
            turnId: 'turn-ask',
            itemId: 'item-ask',
            isBlocking: true,
            questions: [{ id: 'db', header: '数据库', question: '用哪个数据库？', isOther: true, isSecret: false, options: [{ label: 'Postgres', description: '推荐' }, { label: 'SQLite', description: '' }] }],
          });
        });
        return { turn: { id: 'turn-ask' } };
      }
      return {};
    });
    vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
      notificationHandlers.set(method, handler);
      return () => undefined;
    });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation((method: string, handler: (id: string | number, params: unknown) => unknown) => {
      requestHandlers.set(method, handler);
      return () => undefined;
    });
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);

    const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true), idleTimeoutMs: 20 });
    await runner.startSession({ bridgeSessionId: 'bs_ask', cwd: '/tmp/project' });
    const iterator = runner.sendMessage({ bridgeSessionId: 'bs_ask', text: 'hi' })[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ type: 'session_state' });

    const event = (await iterator.next()).value as { type: string; prompt: unknown; respond(reply: unknown): void };
    expect(event.type).toBe('user_prompt');
    expect(event.prompt).toEqual({
      kind: 'question',
      questions: [{ id: 'db', question: '用哪个数据库？', multiSelect: false, options: [{ label: 'Postgres', description: '推荐' }, { label: 'SQLite' }] }],
    });

    const next = iterator.next();
    event.respond({ kind: 'deny', message: '用户在微信上中止了这一轮。' });
    await expect(pendingAnswer).resolves.toEqual({ answers: { db: { answers: ['用户在微信上中止了这一轮。'] } } });

    notificationHandlers.get('turn/completed')?.({ threadId: 'thread-ask', turn: { id: 'turn-ask' } });
    expect((await next).value).toEqual({ type: 'turn_end' });
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

  it('从 turn/completed 兜底补发时只补结论：工具调用之前的文字与 commentary 都不补，只有 commentary 的回合一条不补', async () => {
    async function recovered(items: unknown[]): Promise<string[]> {
      const notificationHandlers = new Map<string, (params: unknown) => void>();
      vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockResolvedValue(undefined);
      vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method: string) => {
        if (method === 'thread/start') return { threadId: 'thread-recover' };
        if (method === 'turn/start') {
          queueMicrotask(() => {
            notificationHandlers.get('turn/completed')?.({ threadId: 'thread-recover', turn: { id: 't', status: 'completed', error: null, items } });
          });
          return { turn: { id: 't' } };
        }
        return {};
      });
      vi.spyOn(CodexAppServerClient.prototype, 'notify').mockResolvedValue(undefined);
      vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method: string, handler: (params: unknown) => void) => {
        notificationHandlers.set(method, handler);
        return () => undefined;
      });
      vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockImplementation(() => () => undefined);
      vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue(undefined);
      const runner = new CodexInteractiveRunner({ command: 'codex', syncThreadForResume: vi.fn(async () => true) });
      await runner.startSession({ bridgeSessionId: 'bs_recover', cwd: '/tmp/project' });
      const texts: string[] = [];
      for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_recover', text: 'hi' })) {
        if (event.type === 'text_delta') texts.push(event.text);
      }
      return texts;
    }

    expect(await recovered([
      { type: 'agentMessage', id: 'm1', text: '先查一下', phase: null },
      { type: 'commandExecution', id: 'c1' },
      { type: 'agentMessage', id: 'm2', text: '再核对一遍', phase: 'commentary' },
      { type: 'agentMessage', id: 'm3', text: '结论：已修好', phase: 'final_answer' },
    ])).toEqual(['结论：已修好']);
    expect(await recovered([
      { type: 'agentMessage', id: 'm1', text: '我看看', phase: 'commentary' },
    ])).toEqual([]);
    expect(await recovered([
      { type: 'agentMessage', id: 'm1', text: '改一下配置', phase: null },
      { type: 'fileChange', id: 'f1' },
    ])).toEqual([]);
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

  // Codex 0.147 起 MCP 工具不再暴露给模型（ToolSearchAlwaysDeferMcpTools），
  // 所以微信侧的发文件能力只能靠 developerInstructions 告知它 HTTP 端点。
  // 续接会话同样要带上，否则第二轮之后 Codex 就忘了自己能发文件。
  it('injects wechat bridge developer instructions on both thread start and resume', async () => {
    const notificationHandlers = new Map<string, (params: unknown) => void>();
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === 'thread/start') return { threadId: 'thread-di' };
      if (method === 'thread/resume') return { threadId: (params as { threadId: string }).threadId };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          notificationHandlers.get('turn/completed')?.({
            threadId: 'thread-di',
            turn: { id: 't1', items: [{ type: 'agentMessage', text: 'ok' }] },
          });
        });
        return { turn: { id: 't1' } };
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
    await runner.startSession({ bridgeSessionId: 'bs_di', cwd: '/tmp/project', options: {} });
    for await (const _ of runner.sendMessage({ bridgeSessionId: 'bs_di', text: 'first' })) { /* drain */ }
    for await (const _ of runner.sendMessage({ bridgeSessionId: 'bs_di', text: 'second' })) { /* drain */ }

    const startCall = request.mock.calls.find(([method]) => method === 'thread/start');
    const resumeCall = request.mock.calls.find(([method]) => method === 'thread/resume');
    for (const [label, call] of [['start', startCall], ['resume', resumeCall]] as const) {
      const instructions = (call?.[1] as { developerInstructions?: string })?.developerInstructions;
      expect(instructions, `${label} 应带上桥接指令`).toBeTruthy();
      expect(instructions, `${label} 应告知发送端点`).toContain('/api/channel/send-media');
      expect(instructions, `${label} 应告知抖音处理方式`).toContain('douyin');
    }
  });
});
