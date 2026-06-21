import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileWeixinStateStore, PUSH_QUOTA_LIMIT, PUSH_WINDOW_MS } from '../src/channels/weixin-direct/weixinStateStore';

function tempConfigPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'wxstate-')), 'config.json');
}

describe('FileWeixinStateStore — persistence', () => {
  it('returns empty state when the config file does not exist', () => {
    const store = new FileWeixinStateStore(tempConfigPath());
    expect(store.load()).toEqual({ contextTokens: {}, cursor: '' });
  });

  it('persists context tokens and cursor into config.json and reloads them', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setContextToken('user_a', 'ctx_1');
    store.setContextToken('user_b', 'ctx_2');
    store.setCursor('buf_9');

    expect(new FileWeixinStateStore(path).load()).toEqual({
      contextTokens: { user_a: 'ctx_1', user_b: 'ctx_2' },
      cursor: 'buf_9',
    });
  });

  it('preserves other config.json fields when writing channel state', () => {
    const path = tempConfigPath();
    writeFileSync(path, JSON.stringify({
      wechat: { token: 't', accountId: 'a', baseUrl: 'b' },
      bridge: { activeWeChatUser: { id: 'u1' }, defaultProvider: 'codex' },
    }), 'utf8');

    const store = new FileWeixinStateStore(path);
    store.setContextToken('user_a', 'ctx_1');
    store.setCursor('buf_9');

    const after = JSON.parse(readFileSync(path, 'utf8'));
    expect(after.wechat).toEqual({ token: 't', accountId: 'a', baseUrl: 'b' });
    expect(after.bridge.activeWeChatUser).toEqual({ id: 'u1' });
    expect(after.bridge.defaultProvider).toBe('codex');
    expect(after.bridge.weixinChannel.cursor).toBe('buf_9');
    expect(after.bridge.weixinChannel.users.user_a.contextToken).toBe('ctx_1');
  });

  it('clears channel state but keeps other config fields', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setContextToken('user_a', 'ctx_1');
    writeFileSync(path, JSON.stringify({
      ...JSON.parse(readFileSync(path, 'utf8')),
      wechat: { token: 't' },
    }), 'utf8');

    store.clear();

    const after = JSON.parse(readFileSync(path, 'utf8'));
    expect(after.wechat).toEqual({ token: 't' });
    expect(new FileWeixinStateStore(path).load()).toEqual({ contextTokens: {}, cursor: '' });
  });

  it('ignores empty userId/token writes', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setContextToken('', 'ctx');
    store.setContextToken('user_a', '');
    expect(new FileWeixinStateStore(path).load()).toEqual({ contextTokens: {}, cursor: '' });
  });
});

describe('FileWeixinStateStore — proactive quota & 24h window', () => {
  it('opens a fresh 24h window with full quota when a token is set', () => {
    const store = new FileWeixinStateStore(tempConfigPath());
    store.setContextToken('user_a', 'ctx_1');
    expect(store.canSend('user_a')).toBe(true);
    const q = store.getQuota('user_a');
    expect(q.remaining).toBe(PUSH_QUOTA_LIMIT);
    expect(q.sentCount).toBe(0);
    expect(q.expired).toBe(false);
  });

  it('cannot send without a context token', () => {
    const store = new FileWeixinStateStore(tempConfigPath());
    expect(store.canSend('user_a')).toBe(false);
    expect(store.getQuota('user_a')).toMatchObject({ remaining: 0, expired: true });
  });

  it('decrements remaining as messages are recorded and blocks at the limit', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setContextToken('user_a', 'ctx_1');
    for (let i = 0; i < PUSH_QUOTA_LIMIT; i += 1) {
      expect(store.canSend('user_a')).toBe(true);
      store.recordSent('user_a');
    }
    expect(store.canSend('user_a')).toBe(false);
    expect(store.getQuota('user_a').remaining).toBe(0);
    expect(store.getQuota('user_a').sentCount).toBe(PUSH_QUOTA_LIMIT);
  });

  it('refreshing the token resets the window and quota (bound to latest token)', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setContextToken('user_a', 'ctx_1');
    store.recordSent('user_a');
    store.recordSent('user_a');
    expect(store.getQuota('user_a').remaining).toBe(PUSH_QUOTA_LIMIT - 2);

    store.setContextToken('user_a', 'ctx_2'); // user messaged again → new token
    expect(store.load().contextTokens.user_a).toBe('ctx_2');
    expect(store.getQuota('user_a').remaining).toBe(PUSH_QUOTA_LIMIT);
    expect(store.canSend('user_a')).toBe(true);
  });

  it('treats an expired 24h window as not sendable', () => {
    const path = tempConfigPath();
    writeFileSync(path, JSON.stringify({
      bridge: {
        weixinChannel: {
          users: { user_a: { contextToken: 'ctx_1', windowStartAt: Date.now() - PUSH_WINDOW_MS - 1000, sentCount: 0 } },
        },
      },
    }), 'utf8');
    const store = new FileWeixinStateStore(path);
    expect(store.canSend('user_a')).toBe(false);
    expect(store.getQuota('user_a').expired).toBe(true);
    expect(store.getQuota('user_a').remaining).toBe(0);
  });
});

describe('FileWeixinStateStore — typing active set', () => {
  it('records and reports active typing chats across instances', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    expect(store.getActiveTypingChats()).toEqual([]);

    store.setTypingActive('user_a', true);
    store.setTypingActive('user_b', true);

    const reopened = new FileWeixinStateStore(path);
    expect(reopened.getActiveTypingChats().sort()).toEqual(['user_a', 'user_b']);
  });

  it('drops a chat once its typing is marked inactive', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setTypingActive('user_a', true);
    store.setTypingActive('user_b', true);
    store.setTypingActive('user_a', false);
    expect(new FileWeixinStateStore(path).getActiveTypingChats()).toEqual(['user_b']);
  });

  it('clear() wipes the active typing set', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setTypingActive('user_a', true);
    store.clear();
    expect(store.getActiveTypingChats()).toEqual([]);
  });

  it('preserves context tokens / outbox when mutating typing state', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setContextToken('user_a', 'ctx_1');
    store.enqueueOutbound('user_a', { kind: 'text', text: 'm1' });
    store.setTypingActive('user_a', true);

    const reopened = new FileWeixinStateStore(path);
    expect(reopened.load().contextTokens.user_a).toBe('ctx_1');
    expect(reopened.peekOutbound('user_a')).toEqual([{ kind: 'text', text: 'm1' }]);
    expect(reopened.getActiveTypingChats()).toEqual(['user_a']);
  });
});

describe('FileWeixinStateStore — outbound queue', () => {
  it('enqueues, peeks, shifts and reports pending across instances', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    expect(store.hasPendingOutbound('user_a')).toBe(false);

    store.enqueueOutbound('user_a', { kind: 'text', text: 'm1' });
    store.enqueueOutbound('user_a', { kind: 'text', text: 'm2' });

    const reopened = new FileWeixinStateStore(path);
    expect(reopened.hasPendingOutbound('user_a')).toBe(true);
    expect(reopened.peekOutbound('user_a')).toEqual([
      { kind: 'text', text: 'm1' },
      { kind: 'text', text: 'm2' },
    ]);

    reopened.shiftOutbound('user_a');
    expect(reopened.peekOutbound('user_a')).toEqual([{ kind: 'text', text: 'm2' }]);
    reopened.shiftOutbound('user_a');
    expect(reopened.hasPendingOutbound('user_a')).toBe(false);
  });

  it('isolates queues per chat and clears one chat', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.enqueueOutbound('a', { kind: 'text', text: 'a1' });
    store.enqueueOutbound('b', { kind: 'text', text: 'b1' });
    store.clearOutbound('a');
    expect(store.hasPendingOutbound('a')).toBe(false);
    expect(store.peekOutbound('b')).toEqual([{ kind: 'text', text: 'b1' }]);
  });

  it('preserves context tokens / quota when mutating the outbox', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setContextToken('user_a', 'ctx_1');
    store.recordSent('user_a');
    store.enqueueOutbound('user_a', { kind: 'text', text: 'm1' });

    const reopened = new FileWeixinStateStore(path);
    expect(reopened.load().contextTokens.user_a).toBe('ctx_1');
    expect(reopened.getQuota('user_a').sentCount).toBe(1);
    expect(reopened.peekOutbound('user_a')).toEqual([{ kind: 'text', text: 'm1' }]);
  });
});
