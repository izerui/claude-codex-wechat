import { describe, expect, it } from 'vitest';
import { parseBridgeCommand } from '../src/session/commandParser';

describe('parseBridgeCommand', () => {
  it('parses provider creation commands', () => {
    expect(parseBridgeCommand('/new')).toEqual({ kind: 'new_session', providerId: null });
    expect(parseBridgeCommand('/new claude')).toEqual({ kind: 'new_session', providerId: 'claude-code' });
    expect(parseBridgeCommand('/new codex')).toEqual({ kind: 'new_session', providerId: 'codex' });
  });

  it('parses reload command', () => {
    expect(parseBridgeCommand('/reload')).toEqual({ kind: 'reload' });
  });

  it('parses permission decisions', () => {
    expect(parseBridgeCommand('/approve pr_123')).toEqual({ kind: 'permission_decision', requestId: 'pr_123', decision: 'approve' });
    expect(parseBridgeCommand('/deny pr_123')).toEqual({ kind: 'permission_decision', requestId: 'pr_123', decision: 'deny' });
    expect(parseBridgeCommand('/abort pr_123')).toEqual({ kind: 'permission_decision', requestId: 'pr_123', decision: 'abort' });
  });

  it('parses cwd and plain text', () => {
    expect(parseBridgeCommand('/cwd /Users/liuyuhua/github/happier')).toEqual({ kind: 'set_cwd', cwd: '/Users/liuyuhua/github/happier' });
    expect(parseBridgeCommand('帮我检查这个项目')).toEqual({ kind: 'chat', text: '帮我检查这个项目' });
  });
});
