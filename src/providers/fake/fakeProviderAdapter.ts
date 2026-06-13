import type { NativeProviderAdapter, ProviderEvent, ProviderId, ProviderSession } from '../types';

export class FakeProviderAdapter implements NativeProviderAdapter {
  private readonly sessions = new Map<string, ProviderSession>();
  private permissionCounter = 0;
  readonly permissionDecisions: Array<{ requestId: string; decision: 'approve' | 'deny' | 'abort' }> = [];
  readonly stoppedSessions: string[] = [];

  constructor(readonly id: ProviderId) {}

  async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    const session: ProviderSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: this.id,
      providerSessionId: `${this.id}_fake_${input.bridgeSessionId}`,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    if (!this.sessions.has(input.bridgeSessionId)) throw new Error('fake_provider_session_not_found');
    const permissionId = `pr_fake_${++this.permissionCounter}`;
    yield { type: 'text_delta', text: `收到：${input.text}` };
    yield {
      type: 'permission_request',
      request: {
        id: permissionId,
        bridgeSessionId: input.bridgeSessionId,
        providerId: this.id,
        toolName: 'Bash',
        summary: '允许执行 fake command?',
        details: { command: 'echo fake', cwd: '/tmp/project' },
        choices: ['approve', 'deny', 'abort'],
      },
    };
    yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.stoppedSessions.push(bridgeSessionId);
    this.sessions.delete(bridgeSessionId);
  }

  async decidePermission(input: { requestId: string; decision: 'approve' | 'deny' | 'abort' }): Promise<void> {
    this.permissionDecisions.push(input);
  }
}
