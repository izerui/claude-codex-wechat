import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { CurrentConversationStore } from '../src/session/currentConversationStore';
import { MessageRouter } from '../src/session/messageRouter';
import { SessionManager } from '../src/session/sessionManager';
import type { NativeProviderAdapter, ProviderEvent, ProviderSession } from '../src/providers/types';
import type { ActiveWeChatUserRecord } from '../src/storage/userStore';
import { createRuntimeUserStore } from './helpers/runtimeUserStore';

const user: ActiveWeChatUserRecord = { id: 'user_a', platform: 'weixin', platformUserId: 'wx_user_1', role: 'user', createdAt: 1 };

// 模拟 Claude 流式 runner：启动返回 idle，回合开始发 session_state running，结束只发 message_done（不会发 idle）。
class GatedClaudeLikeProvider implements NativeProviderAdapter {
  readonly id = 'claude-code' as const;
  release: () => void = () => {};
  private markStarted: () => void = () => {};
  readonly started = new Promise<void>((resolve) => { this.markStarted = resolve; });
  constructor(private readonly mode: 'ok' | 'error' | 'throw' = 'ok') {}

  async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    return { bridgeSessionId: input.bridgeSessionId, providerId: this.id, providerSessionId: 'claude_1', cwd: input.cwd, status: 'idle' };
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    yield { type: 'session_state', state: { bridgeSessionId: input.bridgeSessionId, providerId: this.id, providerSessionId: 'claude_1', cwd: '/tmp', status: 'running' } };
    const gate = new Promise<void>((resolve) => { this.release = resolve; });
    this.markStarted();
    await gate;
    if (this.mode === 'throw') throw new Error('boom');
    if (this.mode === 'error') {
      yield { type: 'error', error: 'provider_failed' };
      return;
    }
    yield { type: 'text_delta', text: `回复：${input.text}` };
    yield { type: 'message_done' };
  }

  async stopSession(): Promise<void> {}
}

function setup(provider: NativeProviderAdapter) {
  const channel = new MockChannelAdapter();
  const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
  const emitted: string[] = [];
  const router = new MessageRouter({
    channel,
    providers: [provider],
    sessions,
    resolveUser: () => user,
    events: { emit: (event: { type: string }) => { emitted.push(`${event.type}:${sessions.store.getCurrent()?.status}`); } } as never,
  });
  const send = (text: string) => router.handleMessage({
    id: `m_${text}`, platform: 'weixin', chatId: 'chat-a', user: { id: 'wx_user_1' }, content: { type: 'text', text }, timestamp: 1,
  });
  return { router, sessions, emitted, send };
}

describe('会话状态生命周期', () => {
  it('回复进行中为 running，回复结束后回到 idle 并通知前端', async () => {
    const provider = new GatedClaudeLikeProvider();
    const { sessions, emitted, send } = setup(provider);
    const done = send('hi');
    await provider.started;
    expect(sessions.store.getCurrent()?.status).toBe('running');
    provider.release();
    await done;
    expect(sessions.store.getCurrent()?.status).toBe('idle');
    expect(emitted.at(-1)).toBe('channel.current-session-changed:idle');
  });

  it('回复出错后也回到 idle', async () => {
    const provider = new GatedClaudeLikeProvider('error');
    const { sessions, send } = setup(provider);
    const done = send('hi');
    await provider.started;
    provider.release();
    await done;
    expect(sessions.store.getCurrent()?.status).toBe('idle');
  });

  it('provider 抛异常后也回到 idle', async () => {
    const provider = new GatedClaudeLikeProvider('throw');
    const { sessions, send } = setup(provider);
    const done = send('hi');
    await provider.started;
    provider.release();
    await done.catch(() => undefined);
    expect(sessions.store.getCurrent()?.status).toBe('idle');
  });

  it('重启加载时把残留的 running / starting 修正为 idle', () => {
    const { configPath } = createRuntimeUserStore('session-status-normalize-');
    const defaults = { defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' as const };
    const before = new CurrentConversationStore(configPath, defaults);
    const created = before.create({ chatId: 'chat-a', ownerUserId: 'user_a' });
    before.update({ status: 'running', providerSessionId: 'claude_1' }, created.id);

    const after = new CurrentConversationStore(configPath, defaults);
    after.resetInterruptedStatus();
    expect(after.getCurrent()?.status).toBe('idle');
    expect(after.getCurrent()?.providerSessionId).toBe('claude_1');
  });
});
