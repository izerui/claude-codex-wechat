import { describe, expect, it } from 'vitest';
import { ClaudeHeadlessRunner, type ClaudeProcessRunner } from '../src/providers/claude-code/claudeHeadlessRunner';

describe('ClaudeHeadlessRunner', () => {
  it('starts a logical bridge session without spawning Claude until a message is sent', async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string; input: string }> = [];
    const runner = new ClaudeHeadlessRunner({
      command: 'claude',
      processRunner: async (call) => {
        calls.push(call);
        return { code: 0, stdout: '', stderr: '' };
      },
    });

    const session = await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    expect(session).toMatchObject({
      bridgeSessionId: 'bs_1',
      providerId: 'claude-code',
      cwd: '/tmp/project',
      status: 'idle',
    });
    expect(calls).toEqual([]);
  });

  it('spawns Claude print stream-json and maps result events', async () => {
    const calls: Parameters<ClaudeProcessRunner>[0][] = [];
    const runner = new ClaudeHeadlessRunner({
      command: 'claude',
      processRunner: async (call) => {
        calls.push(call);
        return {
          code: 0,
          stdout: [
            JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }),
            JSON.stringify({ type: 'result', session_id: 'claude-session-1' }),
          ].join('\n'),
          stderr: '',
        };
      },
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'say hello' })) {
      events.push(event);
    }

    expect(calls).toEqual([
      {
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--include-partial-messages', 'say hello'],
        cwd: '/tmp/project',
        input: '',
      },
    ]);
    expect(events).toEqual([
      { type: 'text_delta', text: 'hello' },
      { type: 'session_state', state: expect.objectContaining({ providerSessionId: 'claude-session-1', cwd: '/tmp/project' }) },
      { type: 'message_done' },
    ]);
  });

  it('maps raw permission events into unified permission requests', async () => {
    const runner = new ClaudeHeadlessRunner({
      command: 'claude',
      processRunner: async () => ({
        code: 0,
        stdout: [
          JSON.stringify({
            type: 'permission_request',
            id: 'claude_perm_1',
            tool_name: 'Bash',
            command: 'yarn test',
            cwd: '/tmp/project',
          }),
          JSON.stringify({ type: 'result', session_id: 'claude-session-1' }),
        ].join('\n'),
        stderr: '',
      }),
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'run tests' })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'permission_request',
      request: {
        id: 'claude_perm_1',
        bridgeSessionId: 'bs_1',
        providerId: 'claude-code',
        toolName: 'Bash',
        summary: 'Bash: yarn test',
        details: {
          command: 'yarn test',
          cwd: '/tmp/project',
          raw: {
            type: 'permission_request',
            id: 'claude_perm_1',
            tool_name: 'Bash',
            command: 'yarn test',
            cwd: '/tmp/project',
          },
        },
        choices: ['approve', 'deny', 'abort'],
      },
    });
  });

  it('resumes the captured Claude session on later messages', async () => {
    const calls: Parameters<ClaudeProcessRunner>[0][] = [];
    const runner = new ClaudeHeadlessRunner({
      command: 'claude',
      processRunner: async (call) => {
        calls.push(call);
        return {
          code: 0,
          stdout: JSON.stringify({ type: 'result', session_id: call.args.includes('--resume') ? 'claude-session-1' : 'claude-session-1' }),
          stderr: '',
        };
      },
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'first' })) {}
    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'second' })) {}

    expect(calls[1].args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--resume',
      'claude-session-1',
      'second',
    ]);
  });

  it('emits error events when Claude exits unsuccessfully', async () => {
    const runner = new ClaudeHeadlessRunner({
      processRunner: async () => ({ code: 1, stdout: '', stderr: 'not logged in' }),
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'hello' })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'error', error: 'not logged in' }]);
  });
});
