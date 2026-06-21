import { describe, expect, it } from 'vitest';
import { ClaudeCodeProvider } from '../src/providers/claude-code/claudeProvider';
import { FakeClaudeRunner } from '../src/providers/claude-code/fakeClaudeRunner';

describe('ClaudeCodeProvider', () => {
  it('starts Claude sessions through the runner', async () => {
    const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });

    const session = await provider.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    expect(session).toMatchObject({
      bridgeSessionId: 'bs_1',
      providerId: 'claude-code',
      cwd: '/tmp/project',
      status: 'idle',
    });
  });

  it('streams text events', async () => {
    const provider = new ClaudeCodeProvider({ runner: new FakeClaudeRunner() });
    await provider.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });

    const events = [];
    for await (const event of provider.sendMessage({ bridgeSessionId: 'bs_1', text: 'hello' })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(['text_delta', 'message_done']);
    expect(events[0]).toMatchObject({ type: 'text_delta', text: 'Claude 收到：hello' });
  });
});
