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
});
