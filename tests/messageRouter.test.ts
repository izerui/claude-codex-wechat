import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { PermissionRouter } from '../src/permissions/permissionRouter';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { CurrentConversationStore } from '../src/session/currentConversationStore';
import { attachProviderSessionToBridge } from '../src/session/providerAutoAttach';
import { SessionManager } from '../src/session/sessionManager';
import { MessageRouter } from '../src/session/messageRouter';
import { LastProviderSessionStore } from '../src/storage/lastProviderSessionStore';
import type { ActiveWeChatUserRecord } from '../src/storage/userStore';
import type { NativeProviderAdapter, ProviderEvent, ProviderSession } from '../src/providers/types';
import { createRuntimeUserStore } from './helpers/runtimeUserStore';

const authorizedUser: ActiveWeChatUserRecord = {
  id: 'user_a',
  platform: 'weixin',
  platformUserId: 'wx_user_1',
  role: 'user',
  createdAt: 1,
};

class ErrorProviderAdapter implements NativeProviderAdapter {
  readonly id = 'codex' as const;
  private readonly sessions = new Map<string, ProviderSession>();

  async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    const session: ProviderSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: this.id,
      providerSessionId: `codex_error_${input.bridgeSessionId}`,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    if (!this.sessions.has(input.bridgeSessionId)) throw new Error('codex_session_not_found');
    yield { type: 'error', error: `provider_failed:${input.text}` };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
  }
}

class PartialThenErrorProviderAdapter implements NativeProviderAdapter {
  readonly id = 'codex' as const;
  private readonly sessions = new Map<string, ProviderSession>();

  async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    const session: ProviderSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: this.id,
      providerSessionId: `codex_partial_error_${input.bridgeSessionId}`,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    if (!this.sessions.has(input.bridgeSessionId)) throw new Error('codex_session_not_found');
    yield { type: 'text_delta', text: `partial:${input.text}` };
    yield { type: 'error', error: `provider_failed:${input.text}` };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
  }
}

class PartialWithoutDoneProviderAdapter implements NativeProviderAdapter {
  readonly id = 'codex' as const;
  private readonly sessions = new Map<string, ProviderSession>();

  async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    const session: ProviderSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: this.id,
      providerSessionId: `codex_partial_no_done_${input.bridgeSessionId}`,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    if (!this.sessions.has(input.bridgeSessionId)) throw new Error('codex_session_not_found');
    yield { type: 'text_delta', text: `partial:${input.text}` };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
  }
}


describe('MessageRouter', () => {
  it('routes authorized chat text through a provider and sends output to the channel', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    expect(sessions.listSessions()).toHaveLength(1);
    expect(sent).toEqual([
      { kind: 'text', text: '收到：run tests' },
      { kind: 'permission_request', text: expect.stringContaining('/approve pr_fake_1') },
    ]);
    expect(permissions.getPendingRequests()).toHaveLength(1);
  });

  it('flushes the final buffered text when a provider stream ends without message_done', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new PartialWithoutDoneProviderAdapter()],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm-no-done',
      platform: 'weixin',
      chatId: 'chat-no-done',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'tail' },
      timestamp: 1,
    });

    expect(sent).toEqual([
      { kind: 'text', text: 'partial:tail' },
    ]);
  });

  it('interrupts an in-flight generation on /cancel and keeps the session', async () => {
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    class GatedProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly interrupted: string[] = [];
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `claude_gated_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        signalStarted();
        yield { type: 'text_delta', text: `生成中：${input.text}` };
        await gate;
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async interruptSession(bridgeSessionId: string): Promise<void> {
        this.interrupted.push(bridgeSessionId);
        releaseGate();
      }
    }

    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const provider = new GatedProvider();
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [provider],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    // Fire the chat without awaiting so the generation is in flight (gated),
    // mirroring the non-blocking dispatch of the real channel adapter.
    const generation = router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-cancel',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'count to 100' },
      timestamp: 1,
    });
    await started;

    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-cancel',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/cancel' },
      timestamp: 2,
    });

    expect(provider.interrupted).toHaveLength(1);
    expect(sent.some((message) => message.text === '已中断当前生成，会话保留')).toBe(true);
    expect(sessions.listSessions()).toHaveLength(1);

    await generation;
  });

  it('steers a follow-up chat into the in-flight turn when the provider supports it', async () => {
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    let startCount = 0;
    class SteerableProvider implements NativeProviderAdapter {
      readonly id = 'codex' as const;
      readonly steered: string[] = [];
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        startCount += 1;
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `codex_steer_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        signalStarted();
        yield { type: 'text_delta', text: `生成中：${input.text}` };
        await gate;
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async steerSession(_bridgeSessionId: string, text: string): Promise<void> {
        this.steered.push(text);
        releaseGate();
      }
    }

    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const provider = new SteerableProvider();
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [provider],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });

    const generation = router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-steer',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'start a long task' },
      timestamp: 1,
    });
    await started;

    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-steer',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'also handle the edge case' },
      timestamp: 2,
    });

    expect(provider.steered).toEqual(['also handle the edge case']);
    expect(startCount).toBe(1);

    await generation;
  });

  it('toggles typing state around a normal chat turn', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const typingStates: Array<{ chatId: string; active: boolean }> = [];
    channel.onTyping((state) => typingStates.push(state));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });

    expect(typingStates).toEqual([
      { chatId: 'chat-a', active: true },
      { chatId: 'chat-a', active: false },
    ]);
  });

  it('shows typing around command status replies', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const typingStates: Array<{ chatId: string; active: boolean }> = [];
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onTyping((state) => typingStates.push(state));
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm-status',
      platform: 'weixin',
      chatId: 'chat-status',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/status' },
      timestamp: 1,
    });

    expect(typingStates).toEqual([
      { chatId: 'chat-status', active: true },
      { chatId: 'chat-status', active: false },
    ]);
    expect(sent).toEqual([
      { kind: 'status', text: 'No active session' },
    ]);
  });


  it('does not trigger a provider for unactive wechat users', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => null,
    });
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });

    expect(sessions.listSessions()).toHaveLength(0);
    expect(permissions.getPendingRequests()).toHaveLength(0);
    expect(sent).toEqual([]);
  });

  it('routes permission commands to the permission router', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const provider = new FakeProviderAdapter('claude-code');
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [provider],
      sessions,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run tests' },
      timestamp: 1,
    });
    expect(permissions.getPendingRequests()).toHaveLength(1);

    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/approve pr_fake_1' },
      timestamp: 2,
    });

    expect(permissions.getPendingRequests()).toHaveLength(0);
    expect(provider.permissionDecisions).toEqual([{ requestId: 'pr_fake_1', decision: 'approve' }]);
  });

  it('creates a new session for /new codex and routes later chat to Codex', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code'), new FakeProviderAdapter('codex')],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new codex' },
      timestamp: 1,
    });

    expect(sessions.getActiveSession('chat-a')).toMatchObject({ providerId: 'codex', status: 'starting' });
    expect(sent[0]).toEqual({ kind: 'status', text: expect.stringContaining('Started new codex session') });

    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'review this repo' },
      timestamp: 2,
    });

    expect(sent).toContainEqual({ kind: 'text', text: '收到：review this repo' });
    expect(sessions.getActiveSession('chat-a')?.providerId).toBe('codex');
  });

  it('creates a new session for /new using the default provider', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code'), new FakeProviderAdapter('codex')],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new' },
      timestamp: 1,
    });

    expect(sessions.getActiveSession('chat-a')).toMatchObject({ providerId: 'claude-code', status: 'starting' });
    expect(sent[0]).toEqual({ kind: 'status', text: expect.stringContaining('Started new claude-code session') });
  });

  it('creates a session with the given cwd via /new <path> and reports session status', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new /tmp/other-project' },
      timestamp: 1,
    });
    expect(sessions.getActiveSession('chat-a')).toMatchObject({ cwd: '/tmp/other-project' });

    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/status' },
      timestamp: 2,
    });

    expect(sent.at(-1)).toContain('/tmp/other-project');
    expect(sent.at(-1)).toContain('claude-code');
  });

  it('lets /new preempt and bypass a hung generation instead of queueing behind it', async () => {
    // 复现 bug：一次生成挂住不结束（gated），命令不应被它阻塞。
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    class HungProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly interrupted: string[] = [];
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `claude_hung_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        signalStarted();
        yield { type: 'text_delta', text: `生成中：${input.text}` };
        await gate; // 永不自行结束，只有 interruptSession 才放行
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async interruptSession(bridgeSessionId: string): Promise<void> {
        this.interrupted.push(bridgeSessionId);
        releaseGate();
      }
    }

    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const hung = new HungProvider();
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [hung, new FakeProviderAdapter('codex')],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    // 不 await：让生成处于挂起状态，模拟真实 channel 的非阻塞分发。
    const generation = router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-hung',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'long task' },
      timestamp: 1,
    });
    await started;

    // /new 必须立即完成，而不是排在挂住的生成后面。
    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-hung',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new codex' },
      timestamp: 2,
    });

    expect(hung.interrupted).toHaveLength(1);
    expect(sent.some((m) => m.kind === 'status' && m.text.includes('Started new codex session'))).toBe(true);
    expect(sessions.getActiveSession('chat-hung')?.providerId).toBe('codex');

    await generation;
  });

  it('discards a queued chat that a later session-mutating command superseded (no wrong-session delivery)', async () => {
    // Codex P1 回归：一条聊天排在 sessionOpChain 上还没跑，/new 从 commandChain
    // 插队换掉 current；这条排队聊天不得再投递到新会话。
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    // 故意不实现 steerSession：第二条聊天只能排队，而非被注入。
    class GatedNoSteerProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly seen: string[] = [];
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `claude_q_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        this.seen.push(input.text);
        signalStarted();
        yield { type: 'text_delta', text: `生成中：${input.text}` };
        await gate;
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async interruptSession(): Promise<void> {
        releaseGate();
      }
    }

    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const gated = new GatedNoSteerProvider();
    const codex = new FakeProviderAdapter('codex');
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [gated, codex],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    // chat1 在跑（gated）。
    const gen1 = router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-q',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: 'task one' }, timestamp: 1,
    });
    await started;

    // chat2 到达：无 steer，排在 sessionOpChain 上等 chat1。
    const gen2 = router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-q',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: 'task two' }, timestamp: 2,
    });

    // /new codex 从 commandChain 插队：换掉 current，并抢占 chat1（释放 gate）。
    await router.handleMessage({
      id: 'm3', platform: 'weixin', chatId: 'chat-q',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/new codex' }, timestamp: 3,
    });

    await Promise.all([gen1, gen2]);

    // chat2 必须作废：从未进入任何 provider 的 sendMessage，也没有它的输出。
    expect(gated.seen).toEqual(['task one']);
    expect(sent.some((m) => m.text.includes('task two') || m.text === '生成中：task two')).toBe(false);
    expect(sessions.getActiveSession('chat-q')?.providerId).toBe('codex');
  });

  it('frees the generation chain after preempting a provider that cannot be interrupted', async () => {
    // Codex P1 回归：provider 没有 interruptSession 且永不结束，/new 抢占后
    // 旧生成必须靠 abort 跳出循环、让出 sessionOpChain，否则之后的聊天永久排队。
    let signalStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    class UninterruptibleHungProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `claude_stuck_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        signalStarted();
        yield { type: 'text_delta', text: `生成中：${input.text}` };
        // 永不结束，且没有 interruptSession：只能靠 abort 信号让消费侧退出。
        await new Promise<void>(() => {});
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      // 故意不实现 interruptSession。
    }

    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new UninterruptibleHungProvider(), new FakeProviderAdapter('codex')],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    // 不可中断的生成挂起。
    void router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-stuck',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: 'forever' }, timestamp: 1,
    });
    await started;

    // /new codex 切走 provider 并抢占挂起的生成。
    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-stuck',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/new codex' }, timestamp: 2,
    });
    expect(sessions.getActiveSession('chat-stuck')?.providerId).toBe('codex');

    // 关键断言：后续普通聊天必须能跑（sessionOpChain 已释放），否则这里会超时挂死。
    await router.handleMessage({
      id: 'm3', platform: 'weixin', chatId: 'chat-stuck',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: 'new task' }, timestamp: 3,
    });
    expect(sent).toContainEqual({ kind: 'text', text: '收到：new task' });
  });

  it('does not block a later chat on a slow/stuck session-mutating command', async () => {
    // 设计取舍：命令与聊天分属两条链、互不阻塞。即便一条会话变更命令卡在 provider
    // 工作里，后续聊天也必须照常处理，不会被它堵死。
    let releaseResume: () => void = () => {};
    const resumeGate = new Promise<void>((resolve) => { releaseResume = resolve; });
    class SlowResumeProvider implements NativeProviderAdapter {
      readonly id = 'codex' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `codex_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        if (!this.sessions.has(input.bridgeSessionId)) throw new Error('codex_session_not_found');
        yield { type: 'text_delta', text: `收到：${input.text}` };
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async listRecoverableSessions() {
        return [{ id: 'codex_recoverable_1', providerId: this.id, title: 'recoverable', cwd: '/tmp/project' }];
      }
      // 故意让 attach 卡住，模拟一条迟迟不返回的 /resume。
      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        await resumeGate;
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: input.candidateId,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
    }

    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new SlowResumeProvider()],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    // /resume 卡在 attachSession（不 await）。
    void router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-slow',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/resume codex_recoverable_1' }, timestamp: 1,
    });

    // 关键断言：后续聊天必须能跑完，不被卡住的 /resume 堵死（否则这里超时挂死）。
    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-slow',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: 'still works' }, timestamp: 2,
    });
    expect(sent).toContainEqual({ kind: 'text', text: '收到：still works' });

    releaseResume();
  });

  it('does not let an in-flight auto-attach overwrite a session chosen by a concurrent command', async () => {
    // Codex P1：auto-attach 在做 provider I/O 期间若有 /new 到达，attach 完成后
    // 不得用恢复出的会话覆盖 /new 选定的会话（shouldCommit 守卫）。
    let releaseAttach: () => void = () => {};
    const attachGate = new Promise<void>((resolve) => { releaseAttach = resolve; });
    let signalAttachStarted: () => void = () => {};
    const attachStarted = new Promise<void>((resolve) => { signalAttachStarted = resolve; });

    const conversation = new CurrentConversationStore(
      createRuntimeUserStore('message-router-autoattach-').configPath,
      { defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' },
    );
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const codex = new FakeProviderAdapter('codex');
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code'), codex],
      conversation,
      resolveUser: () => authorizedUser,
      // auto-attach 卡在 attach 阶段，期间放行 /new。
      autoAttachSession: async (_message, user, opts) => {
        signalAttachStarted();
        await attachGate;
        return attachProviderSessionToBridge({
          conversationStore: conversation,
          provider: codex,
          user,
          providerId: 'codex',
          providerSessionId: 'codex_recovered_1',
          chatId: 'chat-aa',
          cwd: '/tmp/project',
          recoverySource: 'binding_table',
          ...(opts?.shouldCommit ? { shouldCommit: opts.shouldCommit } : {}),
        });
      },
    });

    // 触发一条聊天（无 current）→ 进入 auto-attach 并卡住。
    void router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-aa',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: 'hello' }, timestamp: 1,
    });
    await attachStarted;

    // auto-attach 进行中发 /new claude → 选定 claude-code 会话。
    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-aa',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/new claude' }, timestamp: 2,
    });
    const afterCommand = conversation.getCurrent();
    expect(afterCommand?.providerId).toBe('claude-code');

    // 放行迟到的 auto-attach：它不得覆盖 /new 选定的 claude-code 会话。
    releaseAttach();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const final = conversation.getCurrent();
    expect(final?.providerId).toBe('claude-code');
    expect(final?.id).toBe(afterCommand?.id);
  });


  it('stops the active session on /stop', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const provider = new FakeProviderAdapter('claude-code');
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [provider],
      sessions,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });
    const active = sessions.getActiveSession('chat-a');
    expect(active).not.toBeNull();

    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/stop' },
      timestamp: 2,
    });

    expect(sessions.getActiveSession('chat-a')).toBeNull();
    expect(provider.stoppedSessions).toEqual([active!.id]);
  });

  it('reloads the active session without creating a new bridge session', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const provider = new FakeProviderAdapter('claude-code');
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [provider],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });
    const activeBeforeReload = sessions.getActiveSession('chat-a');
    expect(activeBeforeReload?.providerSessionId).toMatch(/^claude-code_fake_/);

    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/reload' },
      timestamp: 2,
    });

    const activeAfterReload = sessions.getActiveSession('chat-a');
    expect(activeAfterReload?.id).toBe(activeBeforeReload?.id);
    expect(activeAfterReload?.providerId).toBe('claude-code');
    expect(activeAfterReload?.providerSessionId).toMatch(/^claude-code_fake_/);
    expect(provider.stoppedSessions).toEqual([activeBeforeReload!.id]);
    expect(sent.at(-1)).toContain(`Reloaded active claude-code session ${activeBeforeReload?.id}`);
  });

  it('reports when reload is requested without an active session', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/reload' },
      timestamp: 1,
    });

    expect(sent.at(-1)).toBe('No active session to reload');
  });

  it('persists bridge binding metadata when a new WeChat Claude session is created', async () => {
    const store = createRuntimeUserStore('message-router-last-provider-');
    const bindingRepository = new LastProviderSessionStore(store.configPath);
    const conversation = new CurrentConversationStore(store.configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code')],
      conversation,
      sessions,
      resolveUser: () => authorizedUser,
      lastProviderSessions: bindingRepository,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });

    const activeSession = conversation.getCurrent();
    expect(activeSession?.providerSessionId).toMatch(/^claude-code_fake_/);
    expect(activeSession?.resumeTitle).toContain('hello');
    expect(activeSession?.resumeTitle).toBe('hello');
    expect(bindingRepository.get('claude-code')).toMatchObject({
      providerSessionId: activeSession?.providerSessionId,
      cwd: '/tmp/project',
    });
    expect(JSON.parse(readFileSync(store.configPath, 'utf8'))).toMatchObject({
      bridge: {
        activeWeChatUser: {
          currentConversation: {
            providerSessionId: activeSession?.providerSessionId,
            resumeTitle: activeSession?.resumeTitle,
            chatId: 'chat-a',
          },
        },
      },
    });
  });

  it('generates distinct permission request ids across multiple sessions', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const provider = new FakeProviderAdapter('claude-code');
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [provider],
      sessions,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'first run' },
      timestamp: 1,
    });
    await router.handleMessage({
      id: 'm2',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/stop' },
      timestamp: 2,
    });
    await router.handleMessage({
      id: 'm3',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'second run' },
      timestamp: 3,
    });

    const requestIds = permissions.getPendingRequests().map((request) => request.id);
    expect(new Set(requestIds).size).toBe(requestIds.length);
    expect(requestIds).toHaveLength(2);
  });

  it('sends permission requests back to the channel without bridge event history', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('codex')],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-outbound',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello codex' },
      timestamp: 1,
    });

    expect(sent).toEqual([
      { kind: 'text', text: '收到：hello codex' },
      { kind: 'permission_request', text: expect.stringContaining('请直接在微信里回复以下任一命令完成选择') },
    ]);
  });

  it('sends an error message back to the channel when the provider emits an error event', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new ErrorProviderAdapter()],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-error',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'news' },
      timestamp: 1,
    });

    expect(sent).toEqual([
      { kind: 'status', text: 'Provider error: provider_failed:news' },
    ]);
  });

  it('flushes buffered reply text before reporting a provider error', async () => {
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new PartialThenErrorProviderAdapter()],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-partial-error',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'news' },
      timestamp: 1,
    });

    expect(sent).toEqual([
      { kind: 'text', text: 'partial:news' },
      { kind: 'status', text: 'Provider error: provider_failed:news' },
    ]);
  });
});
