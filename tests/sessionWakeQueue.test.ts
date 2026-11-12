import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageRouter } from '../src/session/messageRouter';
import { SessionManager } from '../src/session/sessionManager';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { ClaudeStreamingRunner, type ClaudeStreamChunk, type ClaudeStreamHandle } from '../src/providers/claude-code/claudeStreamingRunner';
import { ClaudeCodeProvider } from '../src/providers/claude-code/claudeProvider';
import { CodexInteractiveRunner } from '../src/providers/codex/codexInteractiveRunner';
import { CodexProvider } from '../src/providers/codex/codexProvider';
import { CodexAppServerClient } from '../src/providers/codex/codexAppServerClient';
import type { NativeProviderAdapter } from '../src/providers/types';

vi.mock('../src/providers/claude-code/nativeSessions', () => ({
  ensureClaudeSessionBridgeMetadata: async () => {},
  getClaudeNativeVersion: async () => null,
}));
vi.mock('../src/providers/codex/nativeSessions', () => ({ getCodexNativeVersion: async () => null }));
vi.mock('../src/providers/codex/sessionIndex', () => ({ upsertCodexSessionIndexEntry: async () => {} }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

async function setup(provider: NativeProviderAdapter) {
  const sessions = new SessionManager({ defaultCwd: '/tmp/nonexistent-wake-test', defaultProviderId: provider.id });
  const binding = sessions.createSession({ chatId: 'chat', ownerUserId: 'u', providerId: provider.id, cwd: '/tmp/nonexistent-wake-test' });
  sessions.updateSession(binding.id, { providerSessionId: 'native-wake' });
  // Like daemon bootstrap: register the persisted session without starting its process.
  await provider.startSession({ bridgeSessionId: binding.id, cwd: binding.cwd, options: { providerSessionId: 'native-wake' } });
  const channel = new MockChannelAdapter();
  const replies: string[] = [];
  channel.onSent((m) => replies.push(m.text));
  const router = new MessageRouter({
    channel, sessions, providers: [provider],
    resolveUser: () => ({ id: 'u', platform: 'weixin', platformUserId: 'wx', role: 'user', createdAt: 1 }),
  });
  const send = (text: string) => router.handleMessage({
    id: text, platform: 'weixin', chatId: 'chat', user: { id: 'wx' },
    content: { type: 'text', text }, timestamp: 1,
  });
  return { send, replies, binding, sessions };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('offline session wake and normal input queue', () => {
  it('Claude: A resumes the session and B waits in the router until A finishes', async () => {
    const starting = deferred<void>();
    const start = deferred<boolean>();
    const submittedA = deferred<void>();
    const inputs: string[] = [];
    const args: string[][] = [];
    const chunks: ClaudeStreamChunk[] = [];
    let reader: ((chunk: ClaudeStreamChunk) => void) | undefined;
    const feed = (value: unknown) => {
      const chunk: ClaudeStreamChunk = { type: 'line', line: JSON.stringify(value) };
      if (reader) { const resolve = reader; reader = undefined; resolve(chunk); }
      else chunks.push(chunk);
    };
    const handle: ClaudeStreamHandle = {
      write: (line) => {
        const text = JSON.parse(line).message.content as string;
        inputs.push(text);
        feed({ type: 'assistant', message: { content: [{ type: 'text', text: `reply:${text}` }] } });
        if (text === 'A') submittedA.resolve();
        else feed({ type: 'result', session_id: 'native-wake' });
      },
      read: () => chunks.length ? Promise.resolve(chunks.shift()!) : new Promise((r) => { reader = r; }),
      close: () => {},
    };
    const runner = new ClaudeStreamingRunner({
      idleCloseMs: 0, capabilityProbe: () => { starting.resolve(); return start.promise; },
      spawner: (call) => { args.push(call.args); return handle; },
    });
    const { send, replies, binding, sessions } = await setup(new ClaudeCodeProvider({ runner }));
    const a = send('A');
    await starting.promise;
    const b = send('B');
    start.resolve(true);
    await submittedA.promise;
    expect(inputs).toEqual(['A']);
    feed({ type: 'result', session_id: 'native-wake' });
    await Promise.all([a, b]);
    expect(inputs).toEqual(['A', 'B']);
    expect(replies).toEqual(['reply:A', 'reply:B']);
    expect(args).toHaveLength(1);
    expect(args[0]).toEqual(expect.arrayContaining(['--resume', 'native-wake']));
    expect(sessions.store.getCurrent()?.id).toBe(binding.id);
    await runner.stopSession(binding.id);
  });

  it('Codex: A resumes the session and B starts its next turn on the same thread', async () => {
    const starting = deferred<void>();
    const start = deferred<void>();
    const submittedA = deferred<void>();
    const handlers = new Map<string, (params: unknown) => void>();
    const inputs: Array<{ threadId: string; text: string }> = [];
    vi.spyOn(CodexAppServerClient.prototype, 'initialize').mockImplementation(() => { starting.resolve(); return start.promise; });
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method, handler) => { handlers.set(method, handler); return () => {}; });
    vi.spyOn(CodexAppServerClient.prototype, 'onRequest').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'onClose').mockReturnValue(() => {});
    vi.spyOn(CodexAppServerClient.prototype, 'dispose').mockResolvedValue();
    const complete = (text: string) => handlers.get('turn/completed')?.({
      threadId: 'native-wake', turn: { id: text, items: [{ type: 'agentMessage', id: text, text: `reply:${text}` }] },
    });
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async (method, params) => {
      if (method === 'thread/resume') return { threadId: 'native-wake' };
      if (method === 'turn/start') {
        const p = params as { threadId: string; input: Array<{ text: string }> };
        const text = p.input[0]!.text;
        inputs.push({ threadId: p.threadId, text });
        if (text === 'A') submittedA.resolve();
        else queueMicrotask(() => complete(text));
        return { turn: { id: text } };
      }
      throw new Error(`unexpected request: ${method}`);
    });
    const runner = new CodexInteractiveRunner({ idleCloseMs: 0, syncThreadForResume: async () => true });
    const { send, replies, binding, sessions } = await setup(new CodexProvider({ runner }));
    const a = send('A');
    await starting.promise;
    const b = send('B');
    start.resolve();
    await submittedA.promise;
    expect(inputs).toEqual([{ threadId: 'native-wake', text: 'A' }]);
    complete('A');
    await Promise.all([a, b]);
    expect(inputs).toEqual([{ threadId: 'native-wake', text: 'A' }, { threadId: 'native-wake', text: 'B' }]);
    expect(replies).toEqual(['reply:A', 'reply:B']);
    expect(sessions.store.getCurrent()?.id).toBe(binding.id);
    await runner.stopSession(binding.id);
  });
});
