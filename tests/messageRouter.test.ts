import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileWeixinStateStore } from '../src/channels/weixin-direct/weixinStateStore';
import { WeixinOutboundGate } from '../src/channels/weixin-direct/outboundGate';
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
import type { NativeProviderAdapter, ProviderEvent, ProviderSession, UserPrompt, UserPromptReply } from '../src/providers/types';
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


// 按脚本吐事件的 provider；ask() 发出 user_prompt 并等路由器交回决定。
class ScriptedProvider implements NativeProviderAdapter {
  readonly id = 'claude-code' as const;
  readonly received: string[] = [];
  readonly replies: UserPromptReply[] = [];
  interrupted = 0;

  constructor(private readonly script: (provider: ScriptedProvider) => AsyncGenerator<ProviderEvent, void, undefined>) {}

  async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    return { bridgeSessionId: input.bridgeSessionId, providerId: this.id, providerSessionId: `scripted_${input.bridgeSessionId}`, cwd: input.cwd, status: 'idle' };
  }

  sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    this.received.push(input.text);
    return this.script(this);
  }

  async *ask(prompt: UserPrompt): AsyncGenerator<ProviderEvent, UserPromptReply, undefined> {
    let resolve!: (reply: UserPromptReply) => void;
    const answered = new Promise<UserPromptReply>((r) => { resolve = r; });
    yield { type: 'user_prompt', prompt, respond: (reply) => { this.replies.push(reply); resolve(reply); } };
    return await answered;
  }

  async stopSession(): Promise<void> {}

  async interruptSession(): Promise<void> {
    this.interrupted += 1;
  }
}

function scriptedRouter(provider: ScriptedProvider, outboundGate?: OutboundDeliveryGate) {
  const channel = new MockChannelAdapter();
  const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
  const router = new MessageRouter({ channel, providers: [provider], sessions, resolveUser: () => authorizedUser, outboundGate });
  const sent: Array<{ kind: string; text: string }> = [];
  channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
  return { router, sent };
}

function chat(id: string, text: string) {
  return { id, platform: 'weixin' as const, chatId: 'chat-a', user: { id: 'wx_user_1' }, content: { type: 'text' as const, text }, timestamp: 1 };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('waitFor timed out');
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

  it('blocks a chat send when the native session advanced elsewhere and cannot be reattached', async () => {
    class StaleAwareProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly sent: string[] = [];

      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: 'claude-stale-1',
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async getNativeVersion() {
        return { fingerprint: 'claude:claude-stale-1:conv:4:u4', observedAt: Date.now() };
      }

      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        this.sent.push(input.text);
        yield { type: 'text_delta', text: input.text };
        yield { type: 'message_done' };
      }

      async stopSession(): Promise<void> {}
    }

    const provider = new StaleAwareProvider();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const conversation = new CurrentConversationStore(createRuntimeUserStore('message-router-stale-').configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const session = conversation.create({
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      cwd: '/tmp/project',
      resumeTitle: 'stale session',
    });
    conversation.update({
      providerSessionId: 'claude-stale-1',
      status: 'idle',
      lastSeenNativeFingerprint: 'claude:claude-stale-1:conv:2:a2',
    }, session.id);
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '继续' },
      timestamp: 1,
    });

    expect(provider.sent).toEqual([]);
    expect(sent.at(-1)).toEqual({
      kind: 'status',
      text: '该会话已在另一端继续，当前桥接状态已过期。请先 /reload 后再继续。',
    });
    expect(conversation.getCurrent()?.staleReason).toBe('native_advanced_elsewhere');
  });

  it('auto-reattaches and continues when the native session advanced elsewhere', async () => {
    class ReattachingProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly sent: string[] = [];
      readonly attached: string[] = [];
      readonly stopped: string[] = [];

      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: 'claude-advanced-1',
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        this.attached.push(input.candidateId);
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: input.candidateId,
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async getNativeVersion() {
        return { fingerprint: 'claude:claude-advanced-1:conv:4:u4', observedAt: Date.now() };
      }

      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        this.sent.push(input.text);
        yield { type: 'text_delta', text: `收到：${input.text}` };
        yield { type: 'message_done' };
      }

      async stopSession(bridgeSessionId: string): Promise<void> {
        this.stopped.push(bridgeSessionId);
      }
    }

    const provider = new ReattachingProvider();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const conversation = new CurrentConversationStore(createRuntimeUserStore('message-router-auto-reattach-').configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const session = conversation.create({
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      cwd: '/tmp/project',
      resumeTitle: 'advanced session',
    });
    conversation.update({
      providerSessionId: 'claude-advanced-1',
      status: 'idle',
      lastSeenNativeFingerprint: 'claude:claude-advanced-1:conv:2:a2',
    }, session.id);
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '继续' },
      timestamp: 1,
    });

    expect(provider.stopped).toEqual([session.id]);
    expect(provider.attached).toEqual(['claude-advanced-1']);
    expect(provider.sent).toEqual(['继续']);
    expect(sent).toEqual([{ kind: 'text', text: '收到：继续' }]);
    expect(conversation.getCurrent()?.staleReason).toBeUndefined();
    expect(conversation.getCurrent()?.lastSeenNativeFingerprint).toBe('claude:claude-advanced-1:conv:4:u4');
  });

  it('silently rebaselines a legacy mtime/size fingerprint instead of treating it as stale', async () => {
    class LegacyBaselineProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly sent: string[] = [];
      attachCalls = 0;

      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: 'claude-legacy-1',
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        this.attachCalls += 1;
        return await this.startSession(input);
      }

      async getNativeVersion() {
        return { fingerprint: 'claude:claude-legacy-1:conv:2:a2', observedAt: Date.now() };
      }

      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        this.sent.push(input.text);
        yield { type: 'text_delta', text: `收到：${input.text}` };
        yield { type: 'message_done' };
      }

      async stopSession(): Promise<void> {}
    }

    const provider = new LegacyBaselineProvider();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const conversation = new CurrentConversationStore(createRuntimeUserStore('message-router-legacy-fp-').configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const session = conversation.create({
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      cwd: '/tmp/project',
      resumeTitle: 'legacy session',
    });
    conversation.update({
      providerSessionId: 'claude-legacy-1',
      status: 'idle',
      lastSeenNativeFingerprint: 'claude:claude-legacy-1:1791733241416:1142125',
    }, session.id);
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '继续' },
      timestamp: 1,
    });

    expect(provider.attachCalls).toBe(0);
    expect(provider.sent).toEqual(['继续']);
    expect(sent).toEqual([{ kind: 'text', text: '收到：继续' }]);
    expect(conversation.getCurrent()?.lastSeenNativeFingerprint).toBe('claude:claude-legacy-1:conv:2:a2');
  });

  it('allows send when the native fingerprint matches', async () => {
    class FreshProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly sent: string[] = [];

      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: 'claude-fresh-1',
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async getNativeVersion() {
        return { fingerprint: 'claude:claude-fresh-1:100:10', observedAt: Date.now() };
      }

      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        this.sent.push(input.text);
        yield { type: 'text_delta', text: `收到：${input.text}` };
        yield { type: 'message_done' };
      }

      async stopSession(): Promise<void> {}
    }

    const provider = new FreshProvider();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const conversation = new CurrentConversationStore(createRuntimeUserStore('message-router-fresh-').configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const session = conversation.create({
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      cwd: '/tmp/project',
      resumeTitle: 'fresh session',
    });
    conversation.update({
      providerSessionId: 'claude-fresh-1',
      status: 'idle',
      lastSeenNativeFingerprint: 'claude:claude-fresh-1:100:10',
    }, session.id);
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '继续' },
      timestamp: 1,
    });

    expect(provider.sent).toEqual(['继续']);
    expect(sent).toContainEqual({ kind: 'text', text: '收到：继续' });
    expect(conversation.getCurrent()?.lastSeenNativeFingerprint).toBe('claude:claude-fresh-1:100:10');
  });

  it('allows send when provider cannot read a native fingerprint', async () => {
    class FingerprintBlindProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly sent: string[] = [];

      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: 'claude-blind-1',
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async getNativeVersion() {
        return null;
      }

      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        this.sent.push(input.text);
        yield { type: 'text_delta', text: `收到：${input.text}` };
        yield { type: 'message_done' };
      }

      async stopSession(): Promise<void> {}
    }

    const provider = new FingerprintBlindProvider();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const conversation = new CurrentConversationStore(createRuntimeUserStore('message-router-blind-').configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const session = conversation.create({
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      cwd: '/tmp/project',
      resumeTitle: 'blind session',
    });
    conversation.update({
      providerSessionId: 'claude-blind-1',
      status: 'idle',
      lastSeenNativeFingerprint: 'claude:claude-blind-1:100:10',
    }, session.id);
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '继续' },
      timestamp: 1,
    });

    expect(provider.sent).toEqual(['继续']);
    expect(sent).toContainEqual({ kind: 'text', text: '收到：继续' });
  });

  it('allows send when provider fingerprint lookup throws', async () => {
    class ThrowingFingerprintProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly sent: string[] = [];

      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: 'claude-throw-1',
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async getNativeVersion(): Promise<never> {
        throw new Error('fingerprint_lookup_failed');
      }

      async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
        this.sent.push(input.text);
        yield { type: 'text_delta', text: `收到：${input.text}` };
        yield { type: 'message_done' };
      }

      async stopSession(): Promise<void> {}
    }

    const provider = new ThrowingFingerprintProvider();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const conversation = new CurrentConversationStore(createRuntimeUserStore('message-router-throwing-fingerprint-').configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const session = conversation.create({
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      cwd: '/tmp/project',
      resumeTitle: 'throwing session',
    });
    conversation.update({
      providerSessionId: 'claude-throw-1',
      status: 'idle',
      lastSeenNativeFingerprint: 'claude:claude-throw-1:100:10',
    }, session.id);
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '继续' },
      timestamp: 1,
    });

    expect(provider.sent).toEqual(['继续']);
    expect(sent).toContainEqual({ kind: 'text', text: '收到：继续' });
  });

  it('reloads the current session by re-attaching the same native provider session', async () => {
    class ReloadableProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      readonly attached: string[] = [];

      async startSession(input: { bridgeSessionId: string; cwd: string; options?: Record<string, unknown> }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: typeof input.options?.providerSessionId === 'string'
            ? input.options.providerSessionId
            : 'claude-reload-1',
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        this.attached.push(input.candidateId);
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: input.candidateId,
          cwd: input.cwd,
          status: 'idle',
        };
      }

      async getNativeVersion() {
        return { fingerprint: 'claude:claude-reload-1:300:30', observedAt: Date.now() };
      }

      async *sendMessage(): AsyncIterable<ProviderEvent> {}

      async stopSession(): Promise<void> {}
    }

    const provider = new ReloadableProvider();
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const conversation = new CurrentConversationStore(createRuntimeUserStore('message-router-reload-').configPath, {
      defaultCwd: '/tmp/project',
      defaultProviderId: 'claude-code',
    });
    const session = conversation.create({
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      cwd: '/tmp/project',
      resumeTitle: 'reload session',
    });
    conversation.update({
      providerSessionId: 'claude-reload-1',
      status: 'idle',
      lastSeenNativeFingerprint: 'claude:claude-reload-1:100:10',
      staleReason: 'native_advanced_elsewhere',
    }, session.id);
    const router = new MessageRouter({
      channel,
      providers: [provider],
      conversation,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/reload' },
      timestamp: 1,
    });

    expect(provider.attached).toEqual(['claude-reload-1']);
    expect(conversation.getCurrent()?.providerSessionId).toBe('claude-reload-1');
    // reload 清空基线,不抢跑取指纹(此刻 resume 子进程还没写盘,取到的是旧值,
    // 会导致下一条消息又误判 stale)。基线由下一轮生成结束后 refresh 重建。
    expect(conversation.getCurrent()?.lastSeenNativeFingerprint).toBeUndefined();
    expect(conversation.getCurrent()?.staleReason).toBeUndefined();
    expect(typeof conversation.getCurrent()?.lastReloadedAt).toBe('number');
    expect(sent.at(-1)).toEqual({ kind: 'status', text: '已重新加载当前会话，可继续对话。' });
  });

  it('returns a status message when /reload has no active session', async () => {
    const channel = new MockChannelAdapter();
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/reload' },
      timestamp: 1,
    });

    expect(sent.at(-1)).toEqual({ kind: 'status', text: 'No active session' });
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

  describe('只把每一轮的结论发到微信', () => {
    it('工具调用之前的过程说明不发，一轮结束只发结论', async () => {
      const provider = new ScriptedProvider(async function* () {
        yield { type: 'text_delta', text: '我先看看文件' };
        yield { type: 'message_done' };
        yield { type: 'tool_event', title: 'Read' };
        yield { type: 'text_delta', text: '接下来改代码' };
        yield { type: 'message_done' };
        yield { type: 'tool_event', title: 'Edit' };
        yield { type: 'text_delta', text: '改好了' };
        yield { type: 'message_done' };
        yield { type: 'text_delta', text: '测试也过了' };
        yield { type: 'message_done' };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      await router.handleMessage(chat('m1', '修个 bug'));

      expect(sent).toEqual([{ kind: 'text', text: '改好了\n\n测试也过了' }]);
    });

    it('同一次生成里排队的两轮各发一条结论', async () => {
      const provider = new ScriptedProvider(async function* () {
        yield { type: 'text_delta', text: '第一轮结论' };
        yield { type: 'message_done' };
        yield { type: 'turn_end' };
        yield { type: 'text_delta', text: '过程' };
        yield { type: 'tool_event', title: 'Bash' };
        yield { type: 'text_delta', text: '第二轮结论' };
        yield { type: 'message_done' };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      await router.handleMessage(chat('m1', 'go'));

      expect(sent.map((m) => m.text)).toEqual(['第一轮结论', '第二轮结论']);
    });

    it('最后没有结论文字时，工具调用前的说明与 Codex 的 commentary 都不拿来充数，只发状态提示', async () => {
      const provider = new ScriptedProvider(async function* () {
        yield { type: 'text_delta', text: '先读配置' };
        yield { type: 'tool_event', title: 'Read' };
        yield { type: 'text_delta', text: '我再核对一下' };
        yield { type: 'message_done' };
        yield { type: 'tool_event', title: 'commentary' };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      await router.handleMessage(chat('m1', 'go'));

      expect(sent).toEqual([{ kind: 'status', text: '本轮已结束，没有文字回复。' }]);
    });

    it('出错时先发已攒下的结论再报错', async () => {
      const provider = new ScriptedProvider(async function* () {
        yield { type: 'text_delta', text: '做了一半' };
        yield { type: 'message_done' };
        yield { type: 'error', error: 'boom' };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      await router.handleMessage(chat('m1', 'go'));

      expect(sent).toEqual([
        { kind: 'text', text: '做了一半' },
        { kind: 'status', text: 'Provider error: boom' },
      ]);
    });
  });

  describe('CLI 停下等人时由微信作答', () => {
    it('只推问题本身（之前的说明是过程说明、不发），回序号译成选项原文交回，不当作新消息', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        yield { type: 'text_delta', text: '有两种做法' };
        yield { type: 'message_done' };
        const reply = yield* p.ask({
          kind: 'question',
          questions: [{ id: 'q1', question: '用哪种？', multiSelect: false, options: [{ label: '方案A', description: '快' }, { label: '方案B' }] }],
        });
        yield { type: 'text_delta', text: `按 ${reply.kind === 'answers' ? reply.answers.q1 : '?'} 做完了` };
        yield { type: 'message_done' };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', '做个功能'));
      await waitFor(() => sent.length === 1);
      expect(sent[0]).toEqual({
        kind: 'text',
        text: '❓ 用哪种？\n1. 方案A —— 快\n2. 方案B\n（回复序号，如 1；也可以直接说你的要求）',
      });

      await router.handleMessage(chat('m2', '2'));
      await turn;

      expect(provider.replies).toEqual([{ kind: 'answers', answers: { q1: '方案B' } }]);
      expect(provider.received).toEqual(['做个功能']);
      // 不复述用户自己的选择：答完之后下一条就是结论
      expect(sent.slice(1)).toEqual([{ kind: 'text', text: '按 方案B 做完了' }]);
    });

    it('多道题逐题推送，非序号的回复原样作为答案，全部答完才交回', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        yield* p.ask({
          kind: 'question',
          questions: [
            { id: 'q1', question: '颜色？', multiSelect: true, options: [{ label: '红' }, { label: '绿' }, { label: '蓝' }] },
            { id: 'q2', question: '尺寸？', multiSelect: false, options: [{ label: '大' }, { label: '小' }] },
          ],
        });
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 1);
      expect(sent[0]!.text).toContain('颜色？（第 1/2 题）');

      await router.handleMessage(chat('m2', '1,3'));
      expect(sent[1]!.text).toContain('尺寸？（第 2/2 题）');
      expect(provider.replies).toEqual([]);

      await router.handleMessage(chat('m3', '要中号的'));
      await turn;

      expect(provider.replies).toEqual([{ kind: 'answers', answers: { q1: '红, 蓝', q2: '要中号的' } }]);
    });

    it('计划确认：回 1 执行并照常自动放行，其他话不执行并作为修改意见', async () => {
      const replies: UserPromptReply[] = [];
      for (const answer of ['1', '先别动数据库']) {
        const provider = new ScriptedProvider(async function* (p) {
          replies.push(yield* p.ask({ kind: 'plan', plan: '1. 改表结构' }));
          yield { type: 'turn_end' };
        });
        const { router, sent } = scriptedRouter(provider);
        const turn = router.handleMessage(chat('m1', 'go'));
        await waitFor(() => sent.length === 1);
        expect(sent[0]!.text).toContain('📋 计划待确认');
        await router.handleMessage(chat('m2', answer));
        await turn;
      }

      expect(replies).toEqual([{ kind: 'approve', permissionMode: 'bypassPermissions' }, { kind: 'deny', message: '先别动数据库' }]);
    });

    it('回的是选项（允许、拒绝、2、不执行）时不复述用户自己的选择，手机上不多一条', async () => {
      for (const [prompt, answer] of [
        [{ kind: 'permission', toolName: 'Bash', detail: 'rm -rf build' }, '允许'],
        [{ kind: 'permission', toolName: 'Bash', detail: 'rm -rf build' }, '拒绝'],
        [{ kind: 'plan', plan: '计划' }, '2'],
        [{ kind: 'plan', plan: '计划' }, '不执行'],
      ] as Array<[UserPrompt, string]>) {
        const provider = new ScriptedProvider(async function* (p) {
          yield* p.ask(prompt);
          yield { type: 'text_delta', text: '结论' };
          yield { type: 'turn_end' };
        });
        const { router, sent } = scriptedRouter(provider);
        const turn = router.handleMessage(chat('m1', 'go'));
        await waitFor(() => sent.length === 1);
        await router.handleMessage(chat('m2', answer));
        await turn;
        expect(sent.slice(1)).toEqual([{ kind: 'text', text: '结论' }]);
      }
    });

    it('随口一句话被当成拒绝或计划的修改意见时说清楚，并写明是哪一步', async () => {
      const notices: string[] = [];
      for (const prompt of [
        { kind: 'permission', toolName: 'Bash', detail: 'rm -f /tmp/out/*.png\n第二行' },
        { kind: 'plan', plan: '1. 改表结构' },
      ] as UserPrompt[]) {
        const provider = new ScriptedProvider(async function* (p) {
          yield* p.ask(prompt);
          yield { type: 'turn_end' };
        });
        const { router, sent } = scriptedRouter(provider);
        const turn = router.handleMessage(chat('m1', 'go'));
        await waitFor(() => sent.length === 1);
        await router.handleMessage(chat('m2', '做到什么程度了？'));
        await turn;
        notices.push(sent[1]!.text);
      }

      expect(notices[0]).toBe('你这句话被当作对上面确认的回复：已拒绝「rm -f /tmp/out/*.png」，并把你的话转给了 Claude，它会按你的话换个做法。想问别的事，请先回「1」或「拒绝」把确认答掉。');
      expect(notices[1]).toBe('你这句话被当作对上面计划「1. 改表结构」的修改意见，已转给 Claude，它会按你的意见改计划。想问别的事，请先回「1」「2」或「不执行」把计划答掉。');
    });

    it('CLI 撤回了已推到手机的确认、这一轮还没结束：告诉手机已失效，之后的话照常交给 AI，不被当成回答', async () => {
      // 复现 imux 的事故：失效的确认留在队首，用户问「做到什么程度了」被当成了拒绝
      let release!: () => void;
      const stillWorking = new Promise<void>((resolve) => { release = resolve; });
      const provider = new ScriptedProvider(async function* (p) {
        if (p.received.length === 1) {
          yield { type: 'user_prompt', id: 'r1', prompt: { kind: 'permission', toolName: 'Bash', detail: 'rm -f /tmp/out/*.png' }, respond: (reply) => { p.replies.push(reply); } };
          yield { type: 'user_prompt_withdrawn', id: 'r1' };
          await stillWorking;
        }
        yield { type: 'text_delta', text: `答：${p.received.at(-1)}` };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const first = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 2);
      expect(sent[1]!.text).toBe('「rm -f /tmp/out/*.png」这条确认已失效，不用再回了：Claude 没有等手机的回复，这一步已经过去了。之后发的话会照常交给 Claude。');

      const second = router.handleMessage(chat('m2', '做到什么程度了？'));
      release();
      await Promise.all([first, second]);

      expect(provider.replies).toEqual([]);
      expect(provider.received).toEqual(['go', '做到什么程度了？']);
      expect(sent.map((m) => m.text).slice(2)).toEqual(['答：go', '答：做到什么程度了？']);
    });

    it('还在排队、没推到手机的确认被撤回：不打扰用户，队首的照常等回答', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        let resolveA!: (r: UserPromptReply) => void;
        const a = new Promise<UserPromptReply>((r) => { resolveA = r; });
        yield { type: 'user_prompt', id: 'a', prompt: { kind: 'permission', toolName: 'Edit', detail: 'a.ts' }, respond: (r) => { p.replies.push(r); resolveA(r); } };
        yield { type: 'user_prompt', id: 'b', prompt: { kind: 'permission', toolName: 'Edit', detail: 'b.ts' }, respond: (r) => { p.replies.push(r); } };
        yield { type: 'user_prompt_withdrawn', id: 'b' };
        await a;
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sent).toHaveLength(1);
      await router.handleMessage(chat('m2', '允许'));
      await turn;

      expect(provider.replies).toEqual([{ kind: 'approve' }]);
      expect(sent.some((m) => m.text.includes('b.ts'))).toBe(false);
    });

    it('计划确认回了含糊的同意（「好的」）：不替用户选，再问一次 1 还是 2，确认留着；之后回 2 按逐个确认执行', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        yield* p.ask({ kind: 'plan', plan: '# 改配置' });
        yield { type: 'text_delta', text: '改好了' };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 1);
      await router.handleMessage(chat('m2', '好的'));
      expect(provider.replies).toEqual([]);
      expect(sent[1]).toEqual({ kind: 'status', text: '请回「1」或「2」选择怎么执行，回「不执行」不执行，或直接说要改什么。' });

      await router.handleMessage(chat('m3', '2'));
      await turn;
      expect(provider.replies).toEqual([{ kind: 'approve', permissionMode: 'default' }]);
      expect(sent.slice(2)).toEqual([{ kind: 'text', text: '改好了' }]);
    });

    it('等待作答时 /stop：拒掉请求、中断，中断前的半截不发', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        yield* p.ask({ kind: 'permission', toolName: 'Bash', detail: 'rm -rf build' });
        yield { type: 'text_delta', text: '半截' };
        yield { type: 'message_done' };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 1);
      await router.handleMessage(chat('m2', '/stop'));
      await turn;

      expect(provider.replies).toEqual([{ kind: 'deny', message: '用户在微信上中止了这一轮。' }]);
      expect(provider.interrupted).toBe(1);
      expect(sent.map((m) => m.text)).toEqual([sent[0]!.text, '已中断当前生成，会话保留']);
    });

    it('/stop 只作用于被中断的那一轮：它的报错不发，之后排队的那一轮结论照常发出', async () => {
      let release!: () => void;
      const stopped = new Promise<void>((resolve) => { release = resolve; });
      const provider = new ScriptedProvider(async function* () {
        yield { type: 'text_delta', text: '半截' };
        yield { type: 'message_done' };
        await stopped;
        // Claude 中断后的收尾：被中断那一轮以出错结束，接着跑插话排队的下一轮
        yield { type: 'error', error: 'error_during_execution' };
        yield { type: 'turn_end' };
        yield { type: 'text_delta', text: '追加问题的答案' };
        yield { type: 'message_done' };
        yield { type: 'turn_end' };
      });
      provider.interruptSession = async () => { provider.interrupted += 1; release(); };
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => provider.received.length === 1);
      await router.handleMessage(chat('m2', '/stop'));
      await turn;

      expect(sent.map((m) => m.text)).toEqual(['已中断当前生成，会话保留', '追加问题的答案']);
    });

    it('只剩后台任务时 /stop：如实说明前台已停、不假装中断，后台完成后那一轮的结论照常发出', async () => {
      let release!: () => void;
      const backgroundDone = new Promise<void>((resolve) => { release = resolve; });
      const provider = new ScriptedProvider(async function* () {
        yield { type: 'text_delta', text: '已在后台启动' };
        yield { type: 'background_tasks', tasks: [{ id: 'b1', description: '构建' }] };
        yield { type: 'turn_end' };
        await backgroundDone;
        yield { type: 'background_tasks', tasks: [] };
        yield { type: 'text_delta', text: '构建通过' };
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 2);
      await router.handleMessage(chat('m2', '/stop'));
      release();
      await turn;

      expect(provider.interrupted).toBe(0);
      expect(sent.map((m) => m.text)).toEqual([
        '已在后台启动',
        '还有后台任务在运行：\n- 构建',
        '前台已经停下，没有正在进行的回复；后台任务仍在运行，完成后会把结果发给你。不要它的结果可以发 /new 换会话。',
        '构建通过',
      ]);
    });

    it('没有识别出文字的语音：告诉用户改发文字，不交给 AI', async () => {
      const provider = new ScriptedProvider(async function* () {
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      await router.handleMessage({ ...chat('m1', ''), content: { type: 'text', unrecognizedVoice: true } });

      expect(provider.received).toEqual([]);
      expect(sent).toEqual([{ kind: 'status', text: '这条语音没有识别出文字，请改发文字。' }]);
    });

    it('续发积压期间那条确认被撤掉、没有别的在等：这句话照常交给 AI，不被吞掉', async () => {
      let backlog = false;
      let withdraw!: () => void;
      const delivered: string[] = [];
      const gate: OutboundDeliveryGate = {
        hasPending: () => backlog,
        deliver: async (_chatId, message) => { delivered.push(message.text); },
        drain: async () => { backlog = false; withdraw(); await new Promise((resolve) => setTimeout(resolve, 10)); },
      };
      const provider = new ScriptedProvider(async function* (p) {
        if (p.received.length === 1) {
          let resolve!: () => void;
          const withdrawn = new Promise<void>((r) => { resolve = r; });
          withdraw = resolve;
          yield { type: 'user_prompt', id: 'r1', prompt: { kind: 'plan', plan: '计划' }, respond: (reply) => { p.replies.push(reply); } };
          await withdrawn;
          yield { type: 'user_prompt_withdrawn', id: 'r1' };
        }
        yield { type: 'text_delta', text: `答：${p.received.at(-1)}` };
        yield { type: 'turn_end' };
      });
      const { router } = scriptedRouter(provider, gate);

      const first = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => delivered.length === 1);
      backlog = true;
      await router.handleMessage(chat('m2', '你在干嘛'));
      await first;
      await waitFor(() => provider.received.length === 2);

      expect(provider.replies).toEqual([]);
      expect(provider.received).toEqual(['go', '你在干嘛']);
    });

    it('等待作答时 /new：请求作废，CLI 不会一直卡着', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        yield* p.ask({ kind: 'plan', plan: '计划' });
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 1);
      await router.handleMessage(chat('m2', '/new'));
      await turn;

      expect(provider.replies).toEqual([{ kind: 'deny', message: '会话已切换，这次调用作废。' }]);
    });

    it('引用那条提问来回复，答案只取用户自己写的字', async () => {
      const replies: UserPromptReply[] = [];
      for (const prompt of [
        { kind: 'plan', plan: '计划' } as UserPrompt,
        { kind: 'question', questions: [{ id: 'q', question: '选哪个？', multiSelect: false, options: [{ label: '甲' }, { label: '乙' }] }] } as UserPrompt,
      ]) {
        const provider = new ScriptedProvider(async function* (p) {
          replies.push(yield* p.ask(prompt));
          yield { type: 'turn_end' };
        });
        const { router, sent } = scriptedRouter(provider);
        const turn = router.handleMessage(chat('m1', 'go'));
        await waitFor(() => sent.length === 1);
        await router.handleMessage({
          ...chat('m2', ''),
          content: { type: 'text', text: prompt.kind === 'plan' ? '1' : '2', quoted: { text: sent[0]!.text } },
        });
        await turn;
      }

      expect(replies).toEqual([{ kind: 'approve', permissionMode: 'bypassPermissions' }, { kind: 'answers', answers: { q: '乙' } }]);
    });

    it('挂着提问时发了没执行成的 /resume（缺编号、编号无从解析），这一轮不被打断，结论照常发出', async () => {
      for (const [command, notice] of [['/resume', '用法：/resume <编号>'], ['/resume 5', '请先用 /sessions 列出会话，再用 /resume <编号> 恢复']] as const) {
        const provider = new ScriptedProvider(async function* (p) {
          yield* p.ask({ kind: 'plan', plan: '计划' });
          yield { type: 'text_delta', text: '按计划做完了' };
          yield { type: 'message_done' };
          yield { type: 'turn_end' };
        });
        const { router, sent } = scriptedRouter(provider);

        const turn = router.handleMessage(chat('m1', 'go'));
        await waitFor(() => sent.length === 1);
        await router.handleMessage(chat('m2', command));
        await router.handleMessage(chat('m3', '1'));
        await turn;

        expect(provider.interrupted).toBe(0);
        expect(provider.replies).toEqual([{ kind: 'approve', permissionMode: 'bypassPermissions' }]);
        expect(sent.map((m) => m.text).slice(1)).toEqual([notice, '按计划做完了']);
      }
    });

    it('作答之后这一轮没有任何结论文字，照样告知用户', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        yield* p.ask({ kind: 'plan', plan: '计划' });
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 1);
      await router.handleMessage(chat('m2', '1'));
      await turn;

      expect(sent.slice(1)).toEqual([{ kind: 'status', text: '本轮已结束，没有文字回复。' }]);
    });

    it('只发图片回答计划确认：不当作拒绝，再说明一次怎么回', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        yield* p.ask({ kind: 'plan', plan: '计划' });
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 1);
      await router.handleMessage({ ...chat('m2', ''), content: { type: 'image', attachments: [{ kind: 'image', localPath: '/tmp/a.png' }] } });
      expect(provider.replies).toEqual([]);
      expect(sent[1]!.text).toContain('附件');

      await router.handleMessage(chat('m3', '1'));
      await turn;
      expect(provider.replies).toEqual([{ kind: 'approve', permissionMode: 'bypassPermissions' }]);
    });

    it('一轮收尾（turn_end）时就拒掉还挂着的请求，不等整次生成结束', async () => {
      let orphan: UserPromptReply | undefined;
      let release!: () => void;
      const followUpRunning = new Promise<void>((resolve) => { release = resolve; });
      const provider = new ScriptedProvider(async function* () {
        // CLI 发出请求后又取消了它，随即结束这一轮；同一次生成里还在跑插话排队的下一轮
        yield { type: 'user_prompt', prompt: { kind: 'plan', plan: '计划' }, respond: (reply) => { orphan = reply; } };
        yield { type: 'turn_end' };
        await followUpRunning;
        yield { type: 'turn_end' };
      });
      const { router } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      // 下一轮还没跑完：此时就必须已拒掉，否则用户这期间发的消息会被当成对它的回答吞掉
      await waitFor(() => orphan !== undefined);
      expect(orphan).toEqual({ kind: 'deny', message: '这一轮已结束。' });
      release();
      await turn;
    });

    it('同时到达的两个请求排队逐个推送，前一个不会被后一个顶掉', async () => {
      const provider = new ScriptedProvider(async function* (p) {
        const replies: Promise<UserPromptReply>[] = [];
        let resolveA!: (r: UserPromptReply) => void;
        let resolveB!: (r: UserPromptReply) => void;
        replies.push(new Promise((r) => { resolveA = r; }), new Promise((r) => { resolveB = r; }));
        yield { type: 'user_prompt', prompt: { kind: 'permission', toolName: 'Edit', detail: 'a.ts' }, respond: (r) => { p.replies.push(r); resolveA(r); } };
        yield { type: 'user_prompt', prompt: { kind: 'permission', toolName: 'Edit', detail: 'b.ts' }, respond: (r) => { p.replies.push(r); resolveB(r); } };
        await Promise.all(replies);
        yield { type: 'turn_end' };
      });
      const { router, sent } = scriptedRouter(provider);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => sent.length === 1);
      // 第二个请求已到达但还没推：等第一个答完
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sent).toHaveLength(1);
      expect(sent[0]!.text).toContain('a.ts');
      expect(provider.replies).toEqual([]);

      await router.handleMessage(chat('m2', '允许'));
      expect(sent.some((m) => m.text.includes('b.ts'))).toBe(true);
      await router.handleMessage(chat('m3', '拒绝'));
      await turn;

      expect(provider.replies).toEqual([{ kind: 'approve' }, { kind: 'deny', message: '用户在微信上拒绝了这次调用。' }]);
    });

    it('真实微信额度闸门：剩最后一格时提问立即发出；额度用完时回复先续发提问，下一条才是答案', async () => {
      for (const used of [9, 10]) {
        const store = new FileWeixinStateStore(join(mkdtempSync(join(tmpdir(), 'router-gate-')), 'config.json'));
        const delivered: string[] = [];
        const gate = new WeixinOutboundGate({
          store,
          send: async (_chatId, message) => { delivered.push(message.text); store.recordSent('chat-a'); },
        });
        store.setContextToken('chat-a', 'ctx');
        for (let i = 0; i < used; i += 1) store.recordSent('chat-a');
        const provider = new ScriptedProvider(async function* (p) {
          yield* p.ask({ kind: 'question', questions: [{ id: 'q', question: '选哪个？', multiSelect: false, options: [{ label: '甲' }, { label: '乙' }] }] });
          yield { type: 'turn_end' };
        });
        const { router } = scriptedRouter(provider, gate);
        // 与真实适配器一致：每条入站消息先刷新 token 与额度，再交给路由
        const inbound = async (id: string, text: string) => {
          store.setContextToken('chat-a', `ctx-${id}`);
          await router.handleMessage(chat(id, text));
        };

        const turn = router.handleMessage(chat('m1', 'go'));
        if (used === 9) {
          await waitFor(() => delivered.length === 1);
        } else {
          await waitFor(() => store.hasPendingOutbound('chat-a'));
          expect(delivered).toEqual([]);
          await inbound('m2', '在吗');
          expect(delivered[0]).toContain('选哪个？');
          expect(provider.replies).toEqual([]);
        }
        expect(delivered[0]).toContain('选哪个？');
        await inbound('m3', '2');
        await turn;
        expect(provider.replies).toEqual([{ kind: 'answers', answers: { q: '乙' } }]);
      }
    });

    it('配额耗尽、提问还排着时，用户的回复先用来续发，不当作答案', async () => {
      const queued: string[] = [];
      const delivered: string[] = [];
      const receipts: Array<() => void> = [];
      const gate: OutboundDeliveryGate = {
        hasPending: () => queued.length > 0,
        deliver: async (_chatId, message, onDelivered) => { queued.push(message.text); if (onDelivered) receipts.push(onDelivered); return false; },
        drain: async () => { delivered.push(...queued.splice(0)); for (const receipt of receipts.splice(0)) receipt(); },
      };
      const provider = new ScriptedProvider(async function* (p) {
        yield* p.ask({ kind: 'question', questions: [{ id: 'q1', question: '选哪个？', multiSelect: false, options: [{ label: '甲' }, { label: '乙' }] }] });
        yield { type: 'turn_end' };
      });
      const { router } = scriptedRouter(provider, gate);

      const turn = router.handleMessage(chat('m1', 'go'));
      await waitFor(() => queued.length === 1);

      await router.handleMessage(chat('m2', '继续'));
      expect(delivered[0]).toContain('选哪个？');
      expect(provider.replies).toEqual([]);

      await router.handleMessage(chat('m3', '2'));
      await turn;
      expect(provider.replies).toEqual([{ kind: 'answers', answers: { q1: '乙' } }]);
    });
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

  it('消息属于到达那一刻的会话：排队期间会话被 /new 换掉，这条消息作废，不改投新会话', async () => {
    // 一刀切规则（AGENTS.md）：task two 到达时当前是旧会话，执行前已被 /new 换掉。
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

  it('消息属于到达那一刻的会话：参数输错的 /resume 没换掉会话，排队的消息照常处理', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const provider = new ScriptedProvider(async function* (p) {
      if (p.received.length === 1) await gate;
      yield { type: 'text_delta', text: `答：${p.received.at(-1)}` };
      yield { type: 'turn_end' };
    });
    const { router, sent } = scriptedRouter(provider);

    const first = router.handleMessage(chat('m1', '一'));
    await waitFor(() => provider.received.length === 1);
    const second = router.handleMessage(chat('m2', '二'));
    await router.handleMessage(chat('m3', '/resume'));
    release();
    await Promise.all([first, second]);

    expect(provider.received).toEqual(['一', '二']);
    expect(sent.map((m) => m.text)).toEqual(['用法：/resume <编号>', '答：一', '答：二']);
  });

  it('到达时还没有会话的消息跟着第一个建起来的会话走，连发的第二条不会被丢', async () => {
    const provider = new ScriptedProvider(async function* (p) {
      yield { type: 'text_delta', text: `答：${p.received.at(-1)}` };
      yield { type: 'turn_end' };
    });
    const { router, sent } = scriptedRouter(provider);

    await Promise.all([router.handleMessage(chat('m1', '一')), router.handleMessage(chat('m2', '二'))]);

    expect(provider.received).toEqual(['一', '二']);
    expect(sent.map((m) => m.text)).toEqual(['答：一', '答：二']);
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

  it('stops the previous provider process on /new even before a native session id exists', async () => {
    const stopCalls: string[] = [];
    class RecordingProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `stream_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
      }
      async *sendMessage(): AsyncIterable<ProviderEvent> {
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        stopCalls.push(bridgeSessionId);
      }
    }
    const conversation = new CurrentConversationStore(
      createRuntimeUserStore('message-router-new-preinit-stop-').configPath,
      { defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' },
    );
    const current = conversation.create({
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      cwd: '/tmp/project',
      resumeTitle: 'pre-init session',
    });
    expect(current.providerSessionId).toBeUndefined();

    const channel = new MockChannelAdapter();
    const router = new MessageRouter({
      channel,
      providers: [new RecordingProvider()],
      conversation,
      resolveUser: () => authorizedUser,
    });

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new' }, timestamp: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(stopCalls).toContain(current.id);
  });

  it('does not stop the active provider process when /resume target is invalid', async () => {
    const stopCalls: string[] = [];
    class RecoverableProvider implements NativeProviderAdapter {
      readonly id = 'claude-code' as const;
      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `stream_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
      }
      async *sendMessage(): AsyncIterable<ProviderEvent> {
        yield { type: 'message_done' };
      }
      async stopSession(bridgeSessionId: string): Promise<void> {
        stopCalls.push(bridgeSessionId);
      }
      async listRecoverableSessions() {
        return [
          { id: 'sess_ok', providerId: this.id, resumeTitle: '可恢复会话', cwd: '/tmp/recoverable', lastActivityAt: 1 },
        ];
      }
      async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        return {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: input.candidateId,
          cwd: input.cwd,
          status: 'idle',
        };
      }
    }
    const conversation = new CurrentConversationStore(
      createRuntimeUserStore('message-router-resume-invalid-keeps-current-').configPath,
      { defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' },
    );
    const current = conversation.setCurrent({
      id: 'bs_active',
      chatId: 'chat-a',
      ownerUserId: authorizedUser.id,
      providerId: 'claude-code',
      providerSessionId: 'active_session',
      recoverySource: 'runtime',
      resumeTitle: 'active session',
      cwd: '/tmp/project',
      status: 'idle',
      createdAt: 1,
      lastActivityAt: 1,
    });
    const channel = new MockChannelAdapter();
    const router = new MessageRouter({
      channel,
      providers: [new RecoverableProvider()],
      conversation,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/resume missing_session' }, timestamp: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(stopCalls).toEqual([]);
    expect(conversation.getCurrent()).toEqual(current);
    expect(sent.some((message) => message.text.includes('找不到会话'))).toBe(true);
  });
});

describe('MessageRouter outbound gate', () => {
  function makeFakeGate(pending: boolean) {
    const delivered: Array<{ chatId: string; kind: string; text: string }> = [];
    let drainCount = 0;
    const gate: OutboundDeliveryGate = {
      hasPending: () => pending,
      deliver: async (chatId, msg) => { delivered.push({ chatId, kind: msg.kind, text: msg.text }); },
      drain: async () => { drainCount += 1; },
    };
    return { gate, delivered, getDrainCount: () => drainCount };
  }

  it('drains the outbound queue and still forwards new input to AI', async () => {
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
    expect(sessions.listSessions()).toHaveLength(1);
  });

  it('有积压消息时 /stop 照常执行：先续发积压，再中止挂着确认的这一轮', async () => {
    let drained = 0;
    let backlog = false;
    const delivered: string[] = [];
    const gate: OutboundDeliveryGate = {
      hasPending: () => backlog,
      deliver: async (_chatId, message) => { delivered.push(message.text); },
      drain: async () => { drained += 1; backlog = false; },
    };
    const provider = new ScriptedProvider(async function* (p) {
      yield* p.ask({ kind: 'plan', plan: '计划' });
      yield { type: 'turn_end' };
    });
    const { router } = scriptedRouter(provider, gate);

    const turn = router.handleMessage(chat('m1', 'go'));
    await waitFor(() => delivered.length === 1);
    backlog = true;
    await router.handleMessage(chat('m2', '/stop'));
    await turn;

    expect(drained).toBe(1);
    expect(provider.interrupted).toBe(1);
    expect(provider.replies).toEqual([{ kind: 'deny', message: '用户在微信上中止了这一轮。' }]);
    expect(delivered).toContain('已中断当前生成，会话保留');
  });

  it('续发积压消息失败时，/stop 照常执行', async () => {
    let backlog = false;
    const delivered: string[] = [];
    const gate: OutboundDeliveryGate = {
      hasPending: () => backlog,
      deliver: async (_chatId, message) => { delivered.push(message.text); },
      drain: async () => { throw new Error('sendmessage failed'); },
    };
    const provider = new ScriptedProvider(async function* (p) {
      yield* p.ask({ kind: 'plan', plan: '计划' });
      yield { type: 'turn_end' };
    });
    const { router } = scriptedRouter(provider, gate);

    const turn = router.handleMessage(chat('m1', 'go'));
    await waitFor(() => delivered.length === 1);
    backlog = true;
    await router.handleMessage(chat('m2', '/stop'));
    await turn;

    expect(provider.interrupted).toBe(1);
    expect(provider.replies).toEqual([{ kind: 'deny', message: '用户在微信上中止了这一轮。' }]);
  });

  it('有积压消息时 /new 照常执行：先续发积压，再换新会话', async () => {
    let backlog = true;
    let drained = 0;
    const gate: OutboundDeliveryGate = {
      hasPending: () => backlog,
      deliver: async () => undefined,
      drain: async () => { drained += 1; backlog = false; },
    };
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel: new MockChannelAdapter(),
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
      outboundGate: gate,
    });

    await router.handleMessage(chat('m1', '/new'));

    expect(drained).toBe(1);
    expect(sessions.listSessions()).toHaveLength(1);
  });

  it('queues new input while the session is still running', async () => {
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
    const outboundGate: OutboundDeliveryGate = {
      hasPending: () => false,
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

    const followUp = router.handleMessage({
      id: 'm2', platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' },
      content: { type: 'text', text: '随便回一句' }, timestamp: 2,
    });

    releaseGate();
    await Promise.all([generation, followUp]);

    expect(sent).toEqual([
      { kind: 'text', text: '第一段：开始执行第二段' },
      { kind: 'text', text: '第一段：随便回一句第二段' },
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

  it('reports a thrown provider failure to the user instead of failing silently', async () => {
    // codex 启动失败走的是 throw 而不是 yield error（二进制缺失/未登录/spawn 失败）。
    // 没有顶层兜底时异常直接冒泡出路由，用户永远等不到任何回应。
    class ThrowingProviderAdapter implements NativeProviderAdapter {
      readonly id = 'codex' as const;

      async startSession(): Promise<ProviderSession> {
        throw new Error('spawn codex ENOENT');
      }

      async *sendMessage(): AsyncIterable<ProviderEvent> {
        // unreachable
      }

      async stopSession(): Promise<void> {}
    }

    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
      providers: [new ThrowingProviderAdapter()],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-throw',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.kind).toBe('status');
    expect(sent[0]!.text).toContain('spawn codex ENOENT');
  });

  it('discards queued messages from the old session when /new switches sessions', async () => {
    // 旧会话排队未发的回复不该串进新会话——/new 就是明确的“翻篇”信号。
    const channel = new MockChannelAdapter();
    const cleared: string[] = [];
    const outboundGate: OutboundDeliveryGate = {
      hasPending: () => false,
      deliver: async (chatId, message) => {
        await channel.sendMessage({ chatId, kind: message.kind as 'text', text: message.text });
      },
      drain: async () => undefined,
      discardPending: async (chatId: string) => { cleared.push(chatId); },
    };
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
      outboundGate,
      defaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-new',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: '/new' },
      timestamp: 1,
    });

    expect(cleared).toEqual(['chat-new']);
  });

  it('tells the user when a turn produced neither text nor error', async () => {
    // provider 正常跑完但一个事件都没吐（如 codex 非流式回合内容丢失）。
    // 用户不该干等——必须收到明确提示。
    class SilentProviderAdapter implements NativeProviderAdapter {
      readonly id = 'codex' as const;
      private readonly sessions = new Map<string, ProviderSession>();

      async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
        const session: ProviderSession = {
          bridgeSessionId: input.bridgeSessionId,
          providerId: this.id,
          providerSessionId: `codex_silent_${input.bridgeSessionId}`,
          cwd: input.cwd,
          status: 'idle',
        };
        this.sessions.set(input.bridgeSessionId, session);
        return session;
      }

      async *sendMessage(): AsyncIterable<ProviderEvent> {
        // 什么都不产出，直接结束。
      }

      async stopSession(bridgeSessionId: string): Promise<void> {
        this.sessions.delete(bridgeSessionId);
      }
    }

    const channel = new MockChannelAdapter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'codex' });
    const router = new MessageRouter({
      channel,
      providers: [new SilentProviderAdapter()],
      sessions,
      resolveUser: () => authorizedUser,
      defaults: { defaultProvider: 'codex', defaultWorkspace: '/tmp/project' },
    });
    const sent: Array<{ kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ kind: message.kind, text: message.text }));

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-silent',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.kind).toBe('status');
    expect(sent[0]!.text).toContain('没有文字回复');
  });
});
