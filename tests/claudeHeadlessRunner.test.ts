import { describe, expect, it } from 'vitest';
import { ClaudeHeadlessRunner, type ClaudeProcessRunner } from '../src/providers/claude-code/claudeHeadlessRunner';
import { BRIDGE_APPEND_SYSTEM_PROMPT } from '../src/providers/claude-code/bridgeSystemPrompt';

describe('ClaudeHeadlessRunner', () => {
  it('starts a logical bridge session without spawning Claude until a message is sent', async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string; input: string }> = [];
    const runner = new ClaudeHeadlessRunner({ capabilityProbe: async () => true,
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
    const runner = new ClaudeHeadlessRunner({ capabilityProbe: async () => true,
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
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project', options: { sessionName: '微信 · Alice' } as { sessionName: string } });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'say hello' })) {
      events.push(event);
    }

    expect(calls).toEqual([
      expect.objectContaining({
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--dangerously-skip-permissions', '--append-system-prompt', BRIDGE_APPEND_SYSTEM_PROMPT, '-n', '微信 · Alice', 'say hello'],
        cwd: '/tmp/project',
        input: '',
      }),
    ]);
    expect(events).toEqual([
      { type: 'text_delta', text: 'hello' },
      { type: 'message_done' },
      { type: 'session_state', state: expect.objectContaining({ providerSessionId: 'claude-session-1', cwd: '/tmp/project' }) },
      { type: 'message_done' },
    ]);
  });

  it('streams completed assistant rounds incrementally', async () => {
    const runner = new ClaudeHeadlessRunner({ capabilityProbe: async () => true,
      lineStreamer: async function* () {
        yield { type: 'line', line: JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'round-1' }] } }) };
        await new Promise((resolve) => setTimeout(resolve, 5));
        yield { type: 'line', line: JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'round-2' }] } }) };
        yield { type: 'line', line: JSON.stringify({ type: 'result', session_id: 'claude-session-1' }) };
        yield { type: 'exit', code: 0, stderr: '' };
      },
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    const seen: Array<string> = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'hello' })) {
      if (event.type === 'text_delta') seen.push(event.text);
      if (seen.length === 1) break;
    }

    expect(seen).toEqual(['round-1']);
  });

  it('resumes the captured Claude session on later messages', async () => {
    const calls: Parameters<ClaudeProcessRunner>[0][] = [];
    const runner = new ClaudeHeadlessRunner({ capabilityProbe: async () => true,
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
      '--verbose',
      '--dangerously-skip-permissions',
      '--append-system-prompt',
      BRIDGE_APPEND_SYSTEM_PROMPT,
      '--resume',
      'claude-session-1',
      'second',
    ]);
  });

  it('can resume immediately from a persisted Claude session id', async () => {
    const calls: Parameters<ClaudeProcessRunner>[0][] = [];
    const runner = new ClaudeHeadlessRunner({ capabilityProbe: async () => true,
      command: 'claude',
      processRunner: async (call) => {
        calls.push(call);
        return {
          code: 0,
          stdout: JSON.stringify({ type: 'result', session_id: 'claude-session-1' }),
          stderr: '',
        };
      },
    });

    await runner.startSession({
      bridgeSessionId: 'bs_1',
      cwd: '/tmp/project',
      options: { providerSessionId: 'claude-session-1' } as { providerSessionId: string },
    });

    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'after restart' })) {}

    expect(calls[0].args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--dangerously-skip-permissions',
      '--append-system-prompt',
      BRIDGE_APPEND_SYSTEM_PROMPT,
      '--resume',
      'claude-session-1',
      'after restart',
    ]);
  });

  it('omits --append-system-prompt when the CLI does not support it', async () => {
    const calls: Parameters<ClaudeProcessRunner>[0][] = [];
    const runner = new ClaudeHeadlessRunner({
      capabilityProbe: async () => false,
      command: 'claude',
      processRunner: async (call) => {
        calls.push(call);
        return { code: 0, stdout: JSON.stringify({ type: 'result', session_id: 'claude-session-1' }), stderr: '' };
      },
    });
    await runner.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    for await (const _event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'hi' })) {}

    expect(calls[0].args).not.toContain('--append-system-prompt');
    expect(calls[0].args).not.toContain(BRIDGE_APPEND_SYSTEM_PROMPT);
  });

  it('emits error events when Claude exits unsuccessfully', async () => {
    const runner = new ClaudeHeadlessRunner({ capabilityProbe: async () => true,
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
