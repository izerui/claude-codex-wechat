import { describe, expect, it } from 'vitest';
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
      { type: 'message_done' },
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
      'codex-session-1',
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
      'codex-session-1',
      'after restart',
    ]);
  });

  it('streams completed assistant rounds incrementally', async () => {
    const runner = new CodexCliRunner({
      lineStreamer: async function* () {
        yield { type: 'line', line: JSON.stringify({ type: 'agent_message', message: { content: [{ type: 'output_text', text: 'round-1' }] } }) };
        await new Promise((resolve) => setTimeout(resolve, 5));
        yield { type: 'line', line: JSON.stringify({ type: 'agent_message', message: { content: [{ type: 'output_text', text: 'round-2' }] } }) };
        yield { type: 'line', line: JSON.stringify({ type: 'exec_complete', session_id: 'codex-session-1' }) };
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

  it('parses item.completed agent_message events from real codex resume output', async () => {
    const runner = new CodexCliRunner({
      processRunner: async () => ({
        code: 0,
        stdout: [
          JSON.stringify({ type: 'thread.started', thread_id: 'codex-session-1' }),
          JSON.stringify({ type: 'turn.started' }),
          JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'codex-real-hi' } }),
          JSON.stringify({ type: 'turn.completed' }),
        ].join('\n'),
        stderr: '',
      }),
    });
    await runner.startSession({
      bridgeSessionId: 'bs_1',
      cwd: '/tmp/project',
      options: { providerSessionId: 'codex-session-1' } as { providerSessionId: string },
    });

    const events = [];
    for await (const event of runner.sendMessage({ bridgeSessionId: 'bs_1', text: 'hello' })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: 'text_delta', text: 'codex-real-hi' });
    expect(events).toContainEqual({
      type: 'session_state',
      state: expect.objectContaining({ providerSessionId: 'codex-session-1', cwd: '/tmp/project' }),
    });
    expect(events).toContainEqual({ type: 'message_done' });
  });
});
