import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileWeixinStateStore } from '../src/channels/weixin-direct/weixinStateStore';

function tempConfigPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'wxstate-')), 'config.json');
}

describe('FileWeixinStateStore (config.json bridge.weixinChannel)', () => {
  it('returns empty state when the config file does not exist', () => {
    const store = new FileWeixinStateStore(tempConfigPath());
    expect(store.load()).toEqual({ contextTokens: {}, cursor: '' });
  });

  it('returns empty state when config.json has no weixin channel state', () => {
    const path = tempConfigPath();
    writeFileSync(path, JSON.stringify({ wechat: { token: 't' } }), 'utf8');
    expect(new FileWeixinStateStore(path).load()).toEqual({ contextTokens: {}, cursor: '' });
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
    expect(after.bridge.weixinChannel).toEqual({ contextTokens: { user_a: 'ctx_1' }, cursor: 'buf_9' });
  });

  it('clears channel state but keeps other config fields', () => {
    const path = tempConfigPath();
    const store = new FileWeixinStateStore(path);
    store.setContextToken('user_a', 'ctx_1');
    store.setCursor('buf_9');
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
