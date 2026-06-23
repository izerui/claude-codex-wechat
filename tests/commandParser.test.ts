import { describe, expect, it } from 'vitest';
import { parseBridgeCommand } from '../src/session/commandParser';
import { buildBridgeCommandHelpMarkdown } from '../src/shared/bridgeCommandHelp';

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

  it('treats removed /use commands as plain chat', () => {
    expect(parseBridgeCommand('/use codex')).toEqual({ kind: 'chat', text: '/use codex' });
    expect(parseBridgeCommand('/use claude')).toEqual({ kind: 'chat', text: '/use claude' });
  });

  it('treats removed permission commands as plain chat', () => {
    expect(parseBridgeCommand('/approve pr_123')).toEqual({ kind: 'chat', text: '/approve pr_123' });
    expect(parseBridgeCommand('/deny pr_123')).toEqual({ kind: 'chat', text: '/deny pr_123' });
    expect(parseBridgeCommand('/abort pr_123')).toEqual({ kind: 'chat', text: '/abort pr_123' });
    expect(parseBridgeCommand('/always pr_123')).toEqual({ kind: 'chat', text: '/always pr_123' });
  });

  it('treats /cwd as plain text now that it is removed', () => {
    expect(parseBridgeCommand('/cwd /Users/liuyuhua/github/happier')).toEqual({ kind: 'chat', text: '/cwd /Users/liuyuhua/github/happier' });
    expect(parseBridgeCommand('帮我检查这个项目')).toEqual({ kind: 'chat', text: '帮我检查这个项目' });
  });

  it('parses session listing commands', () => {
    expect(parseBridgeCommand('/sessions')).toEqual({ kind: 'list_sessions', scope: 'all', keyword: null, page: 1 });
    expect(parseBridgeCommand('/sessions mine')).toEqual({ kind: 'chat', text: '/sessions mine' });
    expect(parseBridgeCommand('/sessions 登录 重构')).toEqual({ kind: 'list_sessions', scope: 'all', keyword: '登录 重构', page: 1 });
  });

  it('parses paginated session listing commands with p<number>', () => {
    expect(parseBridgeCommand('/sessions p2')).toEqual({ kind: 'list_sessions', scope: 'all', keyword: null, page: 2 });
    expect(parseBridgeCommand('/sessions 题库 p3')).toEqual({ kind: 'list_sessions', scope: 'all', keyword: '题库', page: 3 });
    expect(parseBridgeCommand('/sessions 题库 2')).toEqual({ kind: 'list_sessions', scope: 'all', keyword: '题库 2', page: 1 });
  });

  it('parses resume commands by list number or id', () => {
    expect(parseBridgeCommand('/resume 3')).toEqual({ kind: 'resume_session', ref: '3' });
    expect(parseBridgeCommand('/resume bs_abc')).toEqual({ kind: 'resume_session', ref: 'bs_abc' });
    expect(parseBridgeCommand('/resume')).toEqual({ kind: 'resume_session', ref: '' });
  });

  it('treats removed /archive commands as plain chat', () => {
    expect(parseBridgeCommand('/archive')).toEqual({ kind: 'chat', text: '/archive' });
    expect(parseBridgeCommand('/archive 2')).toEqual({ kind: 'chat', text: '/archive 2' });
    expect(parseBridgeCommand('/archive sess_xyz')).toEqual({ kind: 'chat', text: '/archive sess_xyz' });
  });

  it('parses /stop as interrupt and treats removed aliases as plain chat', () => {
    expect(parseBridgeCommand('/stop')).toEqual({ kind: 'cancel_generation' });
    expect(parseBridgeCommand('/cancel')).toEqual({ kind: 'chat', text: '/cancel' });
    expect(parseBridgeCommand('/interrupt')).toEqual({ kind: 'chat', text: '/interrupt' });
  });

  it('documents only /stop for interrupt help text', () => {
    const help = buildBridgeCommandHelpMarkdown();
    expect(help).toContain('`/stop`');
    expect(help).toContain('中断当前正在生成的回复（会话保留）');
    expect(help).not.toContain('`/cancel`');
    expect(help).not.toContain('`/sessions mine`');
    expect(help).toContain('`/sessions p2`');
    expect(help).toContain('`/sessions <关键词> p2`');
    expect(help).not.toContain('`/use claude|codex`');
    expect(help).toContain('`/resume <编号>`');
    expect(help).not.toContain('`/archive [编号]`');
    expect(help).not.toContain('`/approve <id>`');
    expect(help).not.toContain('`/always <id>`');
    expect(help).not.toContain('`/deny <id>`');
    expect(help).not.toContain('`/abort <id>`');
  });
});
