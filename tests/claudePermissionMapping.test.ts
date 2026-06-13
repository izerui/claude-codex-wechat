import { describe, expect, it } from 'vitest';
import { mapClaudePermissionRequest } from '../src/providers/claude-code/claudePermissionMapping';

describe('mapClaudePermissionRequest', () => {
  it('maps Bash permission payload to unified request', () => {
    expect(mapClaudePermissionRequest({
      bridgeSessionId: 'bs_1',
      payload: {
        id: 'claude_perm_1',
        toolName: 'Bash',
        command: 'yarn test',
        cwd: '/tmp/project',
      },
    })).toEqual({
      id: 'claude_perm_1',
      bridgeSessionId: 'bs_1',
      providerId: 'claude-code',
      toolName: 'Bash',
      summary: 'Bash: yarn test',
      details: { command: 'yarn test', cwd: '/tmp/project' },
      choices: ['approve', 'deny', 'abort'],
    });
  });

  it('maps file edit permission payload to unified request', () => {
    expect(mapClaudePermissionRequest({
      bridgeSessionId: 'bs_1',
      payload: {
        id: 'claude_perm_2',
        toolName: 'Edit',
        file: 'src/index.ts',
        summary: 'Modify src/index.ts',
      },
    })).toMatchObject({
      id: 'claude_perm_2',
      toolName: 'Edit',
      summary: 'Modify src/index.ts',
      details: { file: 'src/index.ts' },
    });
  });
});
