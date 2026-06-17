import { describe, expect, it } from 'vitest';
import { selectBestRecoverableSession } from '../src/session/providerAutoAttach';
import type { NativeProviderAdapter } from '../src/providers/types';

describe('selectBestRecoverableSession', () => {
  it('prefers the newest matching cwd session even when bridgeTag belongs to another user', async () => {
    const provider: NativeProviderAdapter = {
      id: 'claude-code',
      async startSession() {
        throw new Error('not_used');
      },
      async *sendMessage() {
        throw new Error('not_used');
      },
      async stopSession() {
        throw new Error('not_used');
      },
      async listRecoverableSessions() {
        return [
          {
            id: 'session-other-user',
            providerId: 'claude-code',
            cwd: '/tmp/project',
            lastActivityAt: 100,
            bridgeBindingSource: 'sidecar',
            bridgeTag: {
              platform: 'weixin',
              platformUserId: 'wx_user_other',
              chatId: 'chat-other',
            },
          },
          {
            id: 'session-latest-same-cwd',
            providerId: 'claude-code',
            cwd: '/tmp/project',
            lastActivityAt: 200,
          },
        ];
      },
    };

    const selected = await selectBestRecoverableSession({
      provider,
      providerId: 'claude-code',
      targetCwd: '/tmp/project',
      allowHeuristicMatch: true,
    });

    expect(selected).toMatchObject({
      candidate: { id: 'session-latest-same-cwd' },
      matchedBinding: false,
      bindingSource: 'heuristic',
    });
  });
});
