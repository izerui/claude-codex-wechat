import { describe, expect, it } from 'vitest';
import { parseBridgeCommand } from '../src/session/commandParser';

describe('parseBridgeCommand', () => {
  it('parses provider creation commands', () => {
    expect(parseBridgeCommand('/new')).toEqual({ kind: 'new_session', providerId: null, cwd: null });
    expect(parseBridgeCommand('/new claude')).toEqual({ kind: 'new_session', providerId: 'claude-code', cwd: null });
    expect(parseBridgeCommand('/new codex')).toEqual({ kind: 'new_session', providerId: 'codex', cwd: null });
  });

  it('parses /new with an explicit working directory', () => {
    expect(parseBridgeCommand('/new /home/project')).toEqual({ kind: 'new_session', providerId: null, cwd: '/home/project' });
    expect(parseBridgeCommand('/new ~/work/app')).toEqual({ kind: 'new_session', providerId: null, cwd: '~/work/app' });
    expect(parseBridgeCommand('/new claude:/home/project')).toEqual({ kind: 'new_session', providerId: 'claude-code', cwd: '/home/project' });
    expect(parseBridgeCommand('/new codex:~/work/app')).toEqual({ kind: 'new_session', providerId: 'codex', cwd: '~/work/app' });
  });

  it('treats malformed /new arguments as plain chat', () => {
    expect(parseBridgeCommand('/new foo')).toEqual({ kind: 'chat', text: '/new foo' });
    expect(parseBridgeCommand('/new claude:foo')).toEqual({ kind: 'chat', text: '/new claude:foo' });
  });

  it('parses permission decisions', () => {
    expect(parseBridgeCommand('/approve pr_123')).toEqual({ kind: 'permission_decision', requestId: 'pr_123', decision: 'approve' });
    expect(parseBridgeCommand('/deny pr_123')).toEqual({ kind: 'permission_decision', requestId: 'pr_123', decision: 'deny' });
    expect(parseBridgeCommand('/abort pr_123')).toEqual({ kind: 'permission_decision', requestId: 'pr_123', decision: 'abort' });
    expect(parseBridgeCommand('/always pr_123')).toEqual({ kind: 'permission_decision', requestId: 'pr_123', decision: 'approve_for_session' });
  });

  it('treats /cwd as plain text now that it is removed', () => {
    expect(parseBridgeCommand('/cwd /Users/liuyuhua/github/happier')).toEqual({ kind: 'chat', text: '/cwd /Users/liuyuhua/github/happier' });
    expect(parseBridgeCommand('帮我检查这个项目')).toEqual({ kind: 'chat', text: '帮我检查这个项目' });
  });

  it('parses session listing commands', () => {
    expect(parseBridgeCommand('/sessions')).toEqual({ kind: 'list_sessions', scope: 'all', keyword: null });
    expect(parseBridgeCommand('/sessions mine')).toEqual({ kind: 'list_sessions', scope: 'mine', keyword: null });
    expect(parseBridgeCommand('/sessions 登录 重构')).toEqual({ kind: 'list_sessions', scope: 'all', keyword: '登录 重构' });
  });

  it('parses resume commands by index or id', () => {
    expect(parseBridgeCommand('/resume 3')).toEqual({ kind: 'resume_session', ref: '3' });
    expect(parseBridgeCommand('/resume bs_abc')).toEqual({ kind: 'resume_session', ref: 'bs_abc' });
    expect(parseBridgeCommand('/resume')).toEqual({ kind: 'resume_session', ref: '' });
  });

  it('parses archive commands with optional target', () => {
    expect(parseBridgeCommand('/archive')).toEqual({ kind: 'archive_session', ref: '' });
    expect(parseBridgeCommand('/archive 2')).toEqual({ kind: 'archive_session', ref: '2' });
    expect(parseBridgeCommand('/archive sess_xyz')).toEqual({ kind: 'archive_session', ref: 'sess_xyz' });
  });

  it('parses cancel/interrupt commands', () => {
    expect(parseBridgeCommand('/cancel')).toEqual({ kind: 'cancel_generation' });
    expect(parseBridgeCommand('/interrupt')).toEqual({ kind: 'cancel_generation' });
  });
});
