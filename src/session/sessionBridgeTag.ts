export type SessionBridgeTag = {
  platform: 'weixin';
  platformUserId: string;
  chatId: string;
};

const PREFIX = 'claude-codex-wechat' as const;

export function buildSessionBridgeName(input: SessionBridgeTag): string {
  const payload = Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
  return `微信 · ${input.platformUserId} · [${PREFIX}:${payload}]`;
}

export function parseSessionBridgeName(value: string | undefined): SessionBridgeTag | null {
  if (!value) return null;
  const match = value.match(/\[claude-codex-wechat:([A-Za-z0-9_-]+)\]/);
  if (!match?.[1]) return null;
  try {
    const decoded = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (decoded.platform !== 'weixin') return null;
    if (typeof decoded.platformUserId !== 'string' || typeof decoded.chatId !== 'string') return null;
    return {
      platform: 'weixin',
      platformUserId: decoded.platformUserId,
      chatId: decoded.chatId,
    };
  } catch {
    return null;
  }
}
