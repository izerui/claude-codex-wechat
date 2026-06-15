import { describe, expect, it, vi } from 'vitest';
import { CodexCliRunner } from '../src/providers/codex/codexCliRunner';
import { CodexProvider } from '../src/providers/codex/codexProvider';

describe('CodexProvider', () => {
  it('starts sessions through the runner and streams events', async () => {
    const provider = new CodexProvider({
      runner: new CodexCliRunner({
        processRunner: async () => ({
          code: 0,
          stdout: [
            JSON.stringify({ type: 'agent_message', message: { content: [{ type: 'output_text', text: 'codex-hi' }] } }),
            JSON.stringify({ type: 'exec_complete', session_id: 'codex-session-1' }),
          ].join('\n'),
          stderr: '',
        }),
      }),
    });

    const session = await provider.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });
    expect(session).toMatchObject({
      bridgeSessionId: 'bs_1',
      providerId: 'codex',
      cwd: '/tmp/project',
      status: 'idle',
    });

    const events = [];
    for await (const event of provider.sendMessage({ bridgeSessionId: 'bs_1', text: 'hello' })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(['text_delta', 'message_done', 'session_state', 'message_done']);
  });

  it('forwards permission decisions to the runner', async () => {
    const runner = new CodexCliRunner({ processRunner: async () => ({ code: 0, stdout: '', stderr: '' }) });
    const spy = vi.spyOn(runner, 'decidePermission');
    const provider = new CodexProvider({ runner });

    await provider.decidePermission({ requestId: 'ap_1', decision: 'deny' });

    expect(spy).toHaveBeenCalledWith({ requestId: 'ap_1', decision: 'deny' });
  });
});
