import { describe, expect, it, vi } from 'vitest';
import { CodexCliRunner, type CodexProcessRunner } from '../src/providers/codex/codexCliRunner';

describe('CodexCliRunner', () => {
  it('creates a logical session before the first message', async () => {
    const calls: Parameters<CodexProcessRunner>[0][] = [];
    const runner = new CodexCliRunner({
      processRunner: async (call) => {
        calls.push(call);
        return { code: 0, stdout: '', stderr: '' };
      },
    });

    const session = await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    expect(session).toMatchObject({
      bridgeSessionId: 'bs_1',
      providerId: 'codex',
      cwd: '/tmp/project',
      status: 'idle',
    });
    expect(calls).toEqual([]);
  });

  it('spawns codex exec --json and maps assistant/result events', async () => {
    const calls: Parameters<CodexProcessRunner>[0][] = [];
    const runner = new CodexCliRunner({
      processRunner: async (call) => {
        calls.push(call);
        return {
          code: 0,
          stdout: [
            JSON.stringify({ type: 'agent_message', message: { content: [{ type: 'output_text', text: 'codex-hi' }] } }),
            JSON.stringify({ type: 'exec_complete', session_id: 'codex-session-1' }),
          ].join('\n'),
          stderr: '',
        };
      },
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'say hi' })) {
      events.push(event);
    }

    expect(calls).toEqual([
      {
        command: 'codex',
        args: ['exec', '--json', '-C', '/tmp/project', 'say hi'],
        cwd: '/tmp/project',
        input: '',
      },
    ]);
    expect(events).toEqual([
      { type: 'text_delta', text: 'codex-hi' },
      { type: 'session_state', state: expect.objectContaining({ providerSessionId: 'codex-session-1', cwd: '/tmp/project' }) },
      { type: 'message_done' },
    ]);
  });

  it('resumes the captured Codex session on later messages', async () => {
    const calls: Parameters<CodexProcessRunner>[0][] = [];
    const runner = new CodexCliRunner({
      processRunner: async (call) => {
        calls.push(call);
        return {
          code: 0,
          stdout: JSON.stringify({ type: 'exec_complete', session_id: 'codex-session-1' }),
          stderr: '',
        };
      },
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'first' })) {}
    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'second' })) {}

    expect(calls[1].args).toEqual([
      'exec',
      'resume',
      '--json',
      '--last',
      '-C',
      '/tmp/project',
      'second',
    ]);
  });

  it('can resume immediately from a persisted Codex session id', async () => {
    const calls: Parameters<CodexProcessRunner>[0][] = [];
    const runner = new CodexCliRunner({
      processRunner: async (call) => {
        calls.push(call);
        return {
          code: 0,
          stdout: JSON.stringify({ type: 'exec_complete', session_id: 'codex-session-1' }),
          stderr: '',
        };
      },
    });

    await runner.startSession({
      bridgeSessionId: 'bs_1',
      cwd: '/tmp/project',
      options: { providerSessionId: 'codex-session-1' } as { providerSessionId: string },
    });

    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'after restart' })) {}

    expect(calls[0].args).toEqual([
      'exec',
      'resume',
      '--json',
      '--last',
      '-C',
      '/tmp/project',
      'after restart',
    ]);
  });

  it('maps approval requests into unified permission requests', async () => {
    const runner = new CodexCliRunner({
      processRunner: async () => ({
        code: 0,
        stdout: [
          JSON.stringify({
            type: 'approval_request',
            id: 'ap_1',
            tool_name: 'CodexBash',
            message: 'Allow bash?',
            command: 'git status',
            cwd: '/tmp/project',
          }),
          JSON.stringify({ type: 'exec_complete', session_id: 'codex-session-1' }),
        ].join('\n'),
        stderr: '',
      }),
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'run git status' })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'permission_request',
      request: {
        id: 'ap_1',
        bridgeSessionId: 'bs_1',
        providerId: 'codex',
        toolName: 'CodexBash',
        summary: 'Allow bash?',
        details: { command: 'git status', cwd: '/tmp/project' },
        choices: ['approve', 'deny', 'abort'],
      },
    });
  });

  it('emits error events when codex exits unsuccessfully', async () => {
    const runner = new CodexCliRunner({
      processRunner: async () => ({ code: 1, stdout: '', stderr: 'codex failed' }),
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'hello' })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'error', error: 'codex failed' }]);
  });

  it('accepts permission decisions without throwing', async () => {
    const runner = new CodexCliRunner({ processRunner: async () => ({ code: 0, stdout: '', stderr: '' }) });

    await expect(runner.decidePermission({ requestId: 'ap_1', decision: 'approve' })).resolves.toBeUndefined();
  });
});
