import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { PermissionRouter } from '../src/permissions/permissionRouter';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';
import { SessionManager } from '../src/session/sessionManager';
import { MessageRouter } from '../src/session/messageRouter';
import { ProviderBindingRepository } from '../src/storage/providerBindingRepository';
import { RuntimeSessionRepository } from '../src/storage/runtimeSessionRepository';
import { schemaSql } from '../src/storage/schema';
import type { AuthorizedUserRecord } from '../src/storage/userRepository';

const authorizedUser: AuthorizedUserRecord = {
  id: 'user_a',
  platform: 'weixin',
  platformUserId: 'wx_user_1',
  role: 'user',
  defaultProvider: 'claude-code',
  defaultCwd: '/tmp/project',
  createdAt: 1,
};

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

  it('does not trigger a provider for unauthorized users', async () => {
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

  it('updates cwd and reports session status', async () => {
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
      content: { type: 'text', text: '/cwd /tmp/other-project' },
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

  it('persists bridge binding metadata when a new WeChat Claude session is created', async () => {
    const db = new Database(':memory:');
    db.exec(schemaSql);
    const sessionRepository = new RuntimeSessionRepository(db);
    const bindingRepository = new ProviderBindingRepository(db);
    const channel = new MockChannelAdapter();
    const permissions = new PermissionRouter();
    const sessions = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });
    const router = new MessageRouter({
      channel,
      permissions,
      providers: [new FakeProviderAdapter('claude-code')],
      sessions,
      resolveUser: () => authorizedUser,
      sessionRepository,
      bindingRepository,
    });

    await router.handleMessage({
      id: 'm1',
      platform: 'weixin',
      chatId: 'chat-a',
      user: { id: 'wx_user_1' },
      content: { type: 'text', text: 'hello' },
      timestamp: 1,
    });

    const activeSession = sessions.getActiveSession('chat-a');
    expect(activeSession?.providerSessionId).toMatch(/^claude-code_fake_/);
    expect(activeSession?.resumeTitle).toContain('[local-agent-wechat-bridge:');
    expect(bindingRepository.findByChat('weixin', 'chat-a', 'claude-code')).toMatchObject({
      platformUserId: 'wx_user_1',
      chatId: 'chat-a',
      providerId: 'claude-code',
      providerSessionId: activeSession?.providerSessionId,
      cwd: '/tmp/project',
    });
    expect(sessionRepository.getActiveByChat('chat-a')).toMatchObject({
      providerSessionId: activeSession?.providerSessionId,
      resumeTitle: activeSession?.resumeTitle,
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
});
