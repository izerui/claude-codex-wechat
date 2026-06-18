import { describe, expect, it } from 'vitest';
import { formatPermissionMessage } from '../src/permissions/formatPermissionMessage';
import { PermissionRouter } from '../src/permissions/permissionRouter';
import type { PermissionRequest } from '../src/providers/types';

const request: PermissionRequest = {
  id: 'pr_123',
  bridgeSessionId: 'bs_1',
  providerId: 'claude-code',
  toolName: 'Bash',
  summary: '运行 yarn test',
  details: { command: 'yarn test', cwd: '/tmp/project' },
  choices: ['approve', 'deny', 'abort'],
};

describe('PermissionRouter', () => {
  it('records and decides a permission request', () => {
    const router = new PermissionRouter();
    router.addRequest(request);

    expect(router.getPendingRequests()).toHaveLength(1);
    expect(router.decide({ requestId: 'pr_123', userId: 'user-a', decision: 'approve' })).toEqual({ ok: true });
    expect(router.getPendingRequests()).toHaveLength(0);
  });

  it('formats permission messages for WeChat commands', () => {
    expect(formatPermissionMessage(request)).toContain('请直接在微信里回复以下任一命令完成选择');
    expect(formatPermissionMessage(request)).toContain('/approve pr_123');
    expect(formatPermissionMessage(request)).toContain('运行 yarn test');
    expect(formatPermissionMessage(request)).toContain('Bash');
  });
});
