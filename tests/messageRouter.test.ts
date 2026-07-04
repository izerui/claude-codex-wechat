import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { CurrentConversationStore } from '../src/session/currentConversationStore';
import { attachProviderSessionToBridge } from '../src/session/providerAutoAttach';
import { SessionManager } from '../src/session/sessionManager';
import { MessageRouter } from '../src/session/messageRouter';
import type { OutboundDeliveryGate } from '../src/session/outboundGate';
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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
    ]);
  });

  it('refreshes typing as provider events arrive and clears it when the turn ends', async () => {
    class StreamingProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `stream_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        if (!this.sessions.has(input.bridgeSessionId)) throw new Error('codex_session_not_found');
        yield { type: 'text_delta', text: 'a' };
        yield { type: 'text_delta', text: 'b' };
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
    }
    const channel = new MockChannelAdapter();
    const typings: boolean[] = [];
    channel.onTyping(({ active }) => typings.push(active));
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new StreamingProvider()],
      sessions,
      resolveUser: () => authorizedUser,
      typingKeepaliveMs: 0, // no throttle: every event refreshes typing
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hi' },
      timestamp: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 10)); // let fire-and-forget refreshes settle

    // Initial start + a refresh per arriving event (provider is alive).
    expect(typings.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    // The turn's end still clears typing.
    expect(typings[typings.length - 1]).toBe(false);
  });

  it('translates a numeric reply into the option label after a choice_prompt', async () => {
    const received: string[] = [];
    class ChoiceProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `choice_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        received.push(input.text);
        if (received.length === 1) {
          yield { type: 'text_delta', text: '❓ 吃什么？\n1. 米饭\n2. 面条' };
          yield { type: 'choice_prompt', labels: ['米饭', '面条'], multiSelect: false };
          yield { type: 'message_done' };
        } else {
          yield { type: 'text_delta', text: `收到：${input.text}` };
          yield { type: 'message_done' };
        }
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
    }
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new ChoiceProvider()],
      sessions,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '问我吃什么' }, timestamp: 1,
    });
    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '2' }, timestamp: 2,
    });

    // The bare "2" reaching the provider was translated to the option label.
    expect(received[1]).toBe('面条');

    // Mapping is consumed once: a following bare number is forwarded verbatim.
    await router.handleMessage({
      id: 'm3', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '1' }, timestamp: 3,
    });
    expect(received[2]).toBe('1');
  });

  it('does not map a numeric reply from a previous session after /new', async () => {
    const received: string[] = [];
    class ChoiceProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `choice_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        received.push(input.text);
        yield { type: 'text_delta', text: '❓ 吃什么？\n1. 米饭\n2. 面条' };
        yield { type: 'choice_prompt', labels: ['米饭', '面条'], multiSelect: false };
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
    }
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new ChoiceProvider()],
      sessions,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '问我吃什么' }, timestamp: 1,
    });
    // Switch to a brand-new session, then reply with a bare number.
    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new' }, timestamp: 2,
    });
    await router.handleMessage({
      id: 'm3', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '1' }, timestamp: 3,
    });

    // The "1" must NOT be translated using the previous session's options.
    expect(received[received.length - 1]).toBe('1');
  });

  it('stops refreshing typing once the provider goes silent (no timer keepalive)', async () => {
    const neverResolves = new Promise<void>(() => {}); // provider hangs, emits nothing
    class SilentProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `silent_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        if (!this.sessions.has(input.bridgeSessionId)) throw new Error('codex_session_not_found');
        await neverResolves; // hangs without ever emitting an event
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
    }
    const channel = new MockChannelAdapter();
    const typings: boolean[] = [];
    channel.onTyping(({ active }) => typings.push(active));
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new SilentProvider()],
      sessions,
      resolveUser: () => authorizedUser,
      typingKeepaliveMs: 10, // a timer keepalive at this interval would have fired ~8 times below
    });

    // Fire-and-forget: this generation hangs forever. Typing is event-driven now,
    // so there's no watchdog — that's intentional; a new message would preempt it,
    // and meanwhile typing simply lapses via WeChat's TTL instead of sticking on.
    void router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hang forever' },
      timestamp: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 80));

    // No events arrived, so only the single initial start fired. The old
    // setInterval keepalive would have produced a growing series of starts here.
    expect(typings.filter(Boolean).length).toBe(1);
  });

  it('flushes the final buffered text when a provider stream ends without message_done', async () => {
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
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

  it('interrupts an in-flight generation on /stop and keeps the session', async () => {
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const provider = new GatedProvider();
    const router = new MessageRouter({
      channel,
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
      content: { type: 'text', text: '/stop' },
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const provider = new SteerableProvider();
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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
    expect(sent).toEqual([]);
  });

  it('creates a new session for /new codex and routes later chat to Codex', async () => {
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const hung = new HungProvider();
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const gated = new GatedNoSteerProvider();
    const codex = new FakeProviderAdapter('codex');
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
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

  it('resumes the session shown at a list number and switches to its working directory', async () => {
    class RecoverableProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly attached: string[] = [];
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `claude_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        if (!this.sessions.has(input.bridgeSessionId)) throw new Error('claude_session_not_found');
        yield { type: 'text_delta', text: `收到：${input.text}` };
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async listRecoverableSessions() {
        return [
          { id: 'sess_qb', providerId: this.id, resumeTitle: '题库批量提交审核', cwd: '/Users/liuyuhua/github/question-bank', lastActivityAt: 2000 },
          { id: 'sess_menu', providerId: this.id, resumeTitle: '菜单迁移', cwd: '/Users/liuyuhua/github/other', lastActivityAt: 1000 },
        ];
      }
      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        this.attached.push(input.candidateId);
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

    const conversation = new CurrentConversationStore(
      createRuntimeUserStore('message-router-resume-number-').configPath,
      { defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' },
    );
    const channel = new MockChannelAdapter();
    const provider = new RecoverableProvider();
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-r',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/sessions' }, timestamp: 1,
    });
    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-r',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/resume 1' }, timestamp: 2,
    });

    // 列表 #1 是最近活跃的 sess_qb：必须被恢复，且 current 切到它的工作目录。
    expect(provider.attached).toEqual(['sess_qb']);
    expect(conversation.getCurrent()?.providerSessionId).toBe('sess_qb');
    expect(conversation.getCurrent()?.cwd).toBe('/Users/liuyuhua/github/question-bank');
    expect(sent.some((m) => m.text.includes('已恢复会话'))).toBe(true);
  });

  it('resumes against the keyword-filtered list so the number maps to the shown subset', async () => {
    class RecoverableProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly attached: string[] = [];
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `claude_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(): AsyncIterable<ProviderEvent> {
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async listRecoverableSessions() {
        return [
          { id: 'sess_alpha', providerId: this.id, resumeTitle: 'alpha task', cwd: '/x', lastActivityAt: 3000 },
          { id: 'sess_qb', providerId: this.id, resumeTitle: '题库批量提交审核', cwd: '/Users/liuyuhua/github/question-bank', lastActivityAt: 2000 },
          { id: 'sess_gamma', providerId: this.id, resumeTitle: 'gamma', cwd: '/y', lastActivityAt: 1000 },
        ];
      }
      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        this.attached.push(input.candidateId);
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

    const conversation = new CurrentConversationStore(
      createRuntimeUserStore('message-router-resume-keyword-').configPath,
      { defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' },
    );
    const channel = new MockChannelAdapter();
    const provider = new RecoverableProvider();
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-kw',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/sessions 题库' }, timestamp: 1,
    });
    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-kw',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/resume 1' }, timestamp: 2,
    });

    // 全量列表 #1 是 sess_alpha；但关键词「题库」筛选后只剩 sess_qb，
    // /resume 1 必须命中筛选后的 #1（sess_qb），而非全量的 #1。
    expect(provider.attached).toEqual(['sess_qb']);
    expect(conversation.getCurrent()?.providerSessionId).toBe('sess_qb');
    expect(conversation.getCurrent()?.cwd).toBe('/Users/liuyuhua/github/question-bank');
  });

  it('lists the requested /sessions page with p<number> and resumes against that page numbering', async () => {
    class RecoverableProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly attached: string[] = [];
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `claude_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(): AsyncIterable<ProviderEvent> {
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async listRecoverableSessions() {
        return [
          { id: 'sess_12', providerId: this.id, resumeTitle: '12', cwd: '/12', lastActivityAt: 12000 },
          { id: 'sess_11', providerId: this.id, resumeTitle: '11', cwd: '/11', lastActivityAt: 11000 },
          { id: 'sess_10', providerId: this.id, resumeTitle: '10', cwd: '/10', lastActivityAt: 10000 },
          { id: 'sess_9', providerId: this.id, resumeTitle: '9', cwd: '/9', lastActivityAt: 9000 },
          { id: 'sess_8', providerId: this.id, resumeTitle: '8', cwd: '/8', lastActivityAt: 8000 },
          { id: 'sess_7', providerId: this.id, resumeTitle: '7', cwd: '/7', lastActivityAt: 7000 },
          { id: 'sess_6', providerId: this.id, resumeTitle: '6', cwd: '/6', lastActivityAt: 6000 },
          { id: 'sess_5', providerId: this.id, resumeTitle: '5', cwd: '/5', lastActivityAt: 5000 },
          { id: 'sess_4', providerId: this.id, resumeTitle: '4', cwd: '/4', lastActivityAt: 4000 },
          { id: 'sess_3', providerId: this.id, resumeTitle: '3', cwd: '/3', lastActivityAt: 3000 },
          { id: 'sess_2', providerId: this.id, resumeTitle: '2', cwd: '/2', lastActivityAt: 2000 },
          { id: 'sess_1', providerId: this.id, resumeTitle: '1', cwd: '/1', lastActivityAt: 1000 },
        ];
      }
      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        this.attached.push(input.candidateId);
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

    const conversation = new CurrentConversationStore(
      createRuntimeUserStore('message-router-sessions-page-').configPath,
      { defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' },
    );
    const channel = new MockChannelAdapter();
    const provider = new RecoverableProvider();
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-page',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/sessions p2' }, timestamp: 1,
    });

    const listMessage = sent.at(-1)?.text ?? '';
    expect(listMessage).toContain('1. 4');
    expect(listMessage).toContain('4. 1');
    expect(listMessage).toContain('第 2/2 页');

    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-page',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/resume 2' }, timestamp: 2,
    });

    expect(provider.attached).toEqual(['sess_3']);
    expect(conversation.getCurrent()?.providerSessionId).toBe('sess_3');
    expect(conversation.getCurrent()?.cwd).toBe('/3');
  });

  it('asks the user to list /sessions first when resuming a number with no cached list', async () => {
    class RecoverableProvider implements NativeProviderAdapter {
      readonly id = 'codex' as const;
      readonly attached: string[] = [];
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
      async *sendMessage(): AsyncIterable<ProviderEvent> {
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
      async listRecoverableSessions() {
        return [{ id: 'sess_qb', providerId: this.id, resumeTitle: '题库', cwd: '/tmp/qb', lastActivityAt: 2000 }];
      }
      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        this.attached.push(input.candidateId);
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
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const provider = new RecoverableProvider();
    const router = new MessageRouter({
      channel,
      providers: [provider],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-nolist',
      user: { id: 'wx_user_1' }, content: { type: 'text', text: '/resume 1' }, timestamp: 1,
    });

    expect(provider.attached).toEqual([]);
    expect(sent.some((m) => m.text.includes('/sessions'))).toBe(true);
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
    const codex = new FakeProviderAdapter('codex');
    const router = new MessageRouter({
      channel,
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


  it('persists bridge binding metadata when a new WeChat Claude session is created', async () => {    const store = createRuntimeUserStore('message-router-last-provider-');
    const bindingRepository = new LastProviderSessionStore(store.configPath);
    const conversation = new CurrentConversationStore(store.configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
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

  it('ignores provider permission requests instead of surfacing approval prompts', async () => {
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
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
    ]);
  });

  it('sends an error message back to the channel when the provider emits an error event', async () => {
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
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

  it('shows a friendly message and preserves the session on idle_timeout', async () => {
    class IdleTimeoutProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `stream_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        if (!this.sessions.has(input.bridgeSessionId)) throw new Error('claude_session_not_found');
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
    }
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new IdleTimeoutProvider()],
      sessions,
      resolveUser: () => authorizedUser,
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hi' }, timestamp: 1,
    });

    expect(sent.some((m) => m.text.includes('长时间无响应') && m.text.includes('保留会话'))).toBe(true);
    expect(sent.some((m) => m.text.startsWith('Provider error:'))).toBe(false);
    expect(sessions.listSessions()).toHaveLength(1);
  });

  it('flushes buffered reply text before reporting a provider error', async () => {
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
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

  it('stops the previous provider process when /new switches sessions', async () => {
    const stopCalls: string[] = [];
    class RecordingProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      private readonly sessions = new Map<string, ProviderSession>();
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `stream_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }
      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        if (!this.sessions.has(input.bridgeSessionId)) throw new Error('claude_session_not_found');
        yield { type: 'text_delta', text: 'ok' };
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        stopCalls.push(bridgeSessionId);
        this.sessions.delete(bridgeSessionId);
      }
    }
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new RecordingProvider()],
      sessions,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hi' }, timestamp: 1,
    });
    const firstId = sessions.listSessions()[0]?.id;
    expect(firstId).toBeTruthy();

    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new' }, timestamp: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 10)); // let fire-and-forget stopSession settle

    expect(stopCalls).toContain(firstId);
  });
});

describe('MessageRouter outbound gate', () => {
  function makeFakeGate(pending: boolean) {
    const delivered: Array<{ chatId: string; kind: string; text: string }> = [];
    let drainCount = 0;
    const gate: OutboundDeliveryGate = {
      hasPending: () => pending,
      shouldInterceptReply: () => false,
      deliver: async (chatId, msg) => { delivered.push({ chatId, kind: msg.kind, text: msg.text }); },
      drain: async () => { drainCount += 1; },
    };
    return { gate, delivered, getDrainCount: () => drainCount };
  }

  it('drains the outbound queue and skips AI when messages are pending', async () => {
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const { gate, getDrainCount } = makeFakeGate(true);
    const router = new MessageRouter({
      channel: new MockChannelAdapter(),
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
      outboundGate: gate,
    });

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '继续' }, timestamp: 1,
    });

    expect(getDrainCount()).toBe(1);
    // pending → message consumed for drain, never reaches the provider
    expect(sessions.listSessions()).toHaveLength(0);
  });

  it('intercepts arbitrary replies after a continuation hint even when no pending queue remains', async () => {
    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const delivered: Array<{ kind: string; text: string }> = [];
    const gate: OutboundDeliveryGate = {
      hasPending: () => false,
      shouldInterceptReply: () => true,
      deliver: async (_chatId, message) => { delivered.push({ kind: message.kind, text: message.text }); },
      drain: async () => undefined,
    };
    const router = new MessageRouter({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
      outboundGate: gate,
    });

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '随便回一句' }, timestamp: 1,
    });

    expect(delivered).toEqual([]);
    expect(sessions.listSessions()).toHaveLength(0);
  });

  it('silently consumes a continuation reply while the session is still running and no queue exists yet', async () => {
    let releaseGate: () => void = () => {};
    const gateOpen = new Promise<void>((resolve) => { releaseGate = resolve; });
    let started!: () => void;
    const generationStarted = new Promise<void>((resolve) => { started = resolve; });

    class GatedProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;

      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `claude_gated_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        started();
        yield { type: 'text_delta', text: `第一段：${input.text}` };
        await gateOpen;
        yield { type: 'text_delta', text: '第二段' };
        yield { type: 'message_done' };
      }

      async stopSession(): Promise<void> {}
    }

    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    let interceptCount = 0;
    const outboundGate: OutboundDeliveryGate = {
      hasPending: () => false,
      shouldInterceptReply: () => {
        interceptCount += 1;
        return interceptCount === 2;
      },
      deliver: async (chatId, message) => {
        await channel.sendMessage({ chatId, kind: message.kind as 'text', text: message.text });
      },
      drain: async () => undefined,
    };
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new GatedProvider()],
      sessions,
      resolveUser: () => authorizedUser,
      outboundGate,
    });

    const generation = router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '开始执行' }, timestamp: 1,
    });
    await generationStarted;

    await router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '随便回一句' }, timestamp: 2,
    });

    releaseGate();
    await generation;

    expect(sent).toEqual([
      { kind: 'text', text: '第一段：开始执行第二段' },
    ]);
  });

  it('routes outbound messages through the gate instead of the channel', async () => {
    const channel = new MockChannelAdapter();
    const directlySent: string[] = [];
    channel.onSent((m) => directlySent.push(m.text));
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const { gate, delivered } = makeFakeGate(false);
    const router = new MessageRouter({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
      outboundGate: gate,
    });

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'run tests' }, timestamp: 1,
    });

    // outbound flows through the gate, not directly to the channel
    expect(delivered.map((d) => d.text)).toContain('收到：run tests');
    expect(directlySent).toEqual([]);
  });
});
