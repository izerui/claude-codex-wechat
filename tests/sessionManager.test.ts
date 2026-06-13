import { describe, expect, it } from 'vitest';
import { SessionManager } from '../src/session/sessionManager';

describe('SessionManager', () => {
  it('creates and reuses one active session per chat', () => {
    const manager = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });

    const first = manager.getOrCreateSession({ chatId: 'chat-a', ownerUserId: 'user-a' });
    const second = manager.getOrCreateSession({ chatId: 'chat-a', ownerUserId: 'user-a' });

    expect(second.id).toBe(first.id);
    expect(first.providerId).toBe('claude-code');
    expect(first.cwd).toBe('/tmp/project');
  });

  it('switches provider by creating a new active session', () => {
    const manager = new SessionManager({ defaultCwd: '/tmp/project', defaultProviderId: 'claude-code' });

    const first = manager.getOrCreateSession({ chatId: 'chat-a', ownerUserId: 'user-a' });
    const next = manager.createSession({ chatId: 'chat-a', ownerUserId: 'user-a', providerId: 'codex', cwd: '/tmp/project' });

    expect(next.id).not.toBe(first.id);
    expect(manager.getActiveSession('chat-a')?.providerId).toBe('codex');
  });
});
