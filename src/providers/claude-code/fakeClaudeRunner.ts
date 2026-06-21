import type { ClaudeRunner, ClaudeRunnerEvent, ClaudeRunnerSession } from './claudeRunner';

export class FakeClaudeRunner implements ClaudeRunner {
  private readonly sessions = new Map<string, ClaudeRunnerSession>();
  private attachedByBridgeSession = new Map<string, string>();

  async startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    options?: { providerSessionId?: string; sessionName?: string };
  }): Promise<ClaudeRunnerSession> {
    const session: ClaudeRunnerSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: 'claude-code',
      providerSessionId: input.options?.providerSessionId ?? `claude_fake_${input.bridgeSessionId}`,
      claudeSessionId: input.options?.providerSessionId ?? `claude_fake_${input.bridgeSessionId}`,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    if (input.options?.providerSessionId) {
      this.attachedByBridgeSession.set(input.bridgeSessionId, input.options.providerSessionId);
    }
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ClaudeRunnerEvent> {
    if (!this.sessions.has(input.bridgeSessionId)) throw new Error('fake_claude_session_not_found');
    yield { type: 'text_delta', text: `Claude 收到：${input.text}` };
    yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
    this.attachedByBridgeSession.delete(bridgeSessionId);
  }
}
