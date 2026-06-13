import type { ClaudeRunner, ClaudeRunnerEvent, ClaudeRunnerSession } from './claudeRunner';

export class FakeClaudeRunner implements ClaudeRunner {
  private readonly sessions = new Map<string, ClaudeRunnerSession>();

  async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ClaudeRunnerSession> {
    const session: ClaudeRunnerSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: 'claude-code',
      providerSessionId: `claude_fake_${input.bridgeSessionId}`,
      claudeSessionId: `claude_fake_${input.bridgeSessionId}`,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ClaudeRunnerEvent> {
    if (!this.sessions.has(input.bridgeSessionId)) throw new Error('fake_claude_session_not_found');
    yield { type: 'text_delta', text: `Claude 收到：${input.text}` };
    yield {
      type: 'permission_request',
      request: {
        id: 'pr_claude_fake_1',
        bridgeSessionId: input.bridgeSessionId,
        providerId: 'claude-code',
        toolName: 'Bash',
        summary: '运行 fake Claude command',
        details: { command: 'echo claude', cwd: '/tmp/project' },
        choices: ['approve', 'deny', 'abort'],
      },
    };
    yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
  }
}
