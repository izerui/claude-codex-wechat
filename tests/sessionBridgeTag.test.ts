import { describe, expect, it } from 'vitest';
import { buildSessionBridgeName, parseSessionBridgeName } from '../src/session/sessionBridgeTag';

describe('sessionBridgeTag', () => {
  it('builds and parses bridge titles with the renamed prefix', () => {
    const title = buildSessionBridgeName({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      chatId: 'chat_1',
    });

    expect(title).toContain('[claude-codex-wechat:');
    expect(parseSessionBridgeName(title)).toEqual({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      chatId: 'chat_1',
    });
  });

  it('does not parse legacy bridge prefixes', () => {
    expect(parseSessionBridgeName('微信 · wx_user_1 · [local-agent-wechat-bridge:testpayload]')).toBeNull();
  });
});
