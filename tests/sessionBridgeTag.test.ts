import { describe, expect, it } from 'vitest';
import { buildSessionBridgeName, parseSessionBridgeName } from '../src/session/sessionBridgeTag';

describe('sessionBridgeTag', () => {
  it('builds short bridge titles without embedding a machine tag', () => {
    const title = buildSessionBridgeName({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      chatId: 'chat_1',
    });

    expect(title).toBe('微信 · wx_user_1');
    expect(parseSessionBridgeName(title)).toBeNull();
  });

  it('keeps readable summary prefixes in short bridge titles', () => {
    const title = buildSessionBridgeName({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      chatId: 'chat_1',
      summary: '最后一条：修复 resume',
    });

    expect(title).toBe('最后一条：修复 resume · 微信 · wx_user_1');
  });

  it('parses legacy bridge tags for backward compatibility', () => {
    expect(parseSessionBridgeName('微信 · wx_user_1 · [claude-codex-wechat:eyJwbGF0Zm9ybSI6IndlaXhpbiIsInBsYXRmb3JtVXNlcklkIjoid3hfdXNlcl8xIiwiY2hhdElkIjoiY2hhdF8xIn0]')).toEqual({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      chatId: 'chat_1',
    });
  });

  it('does not parse unrelated legacy bridge prefixes', () => {
    expect(parseSessionBridgeName('微信 · wx_user_1 · [local-agent-wechat-bridge:testpayload]')).toBeNull();
  });
});
