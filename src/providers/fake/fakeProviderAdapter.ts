import type { NativeProviderAdapter, ProviderEvent, ProviderId, ProviderSession } from '../types';

export class FakeProviderAdapter implements NativeProviderAdapter {
  private readonly sessions = new Map<string, ProviderSession>();

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
    yield { type: 'text_delta', text: `收到：${input.text}` };
    yield {
      type: 'permission_request',
      request: {
        id: 'pr_fake_1',
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
    this.sessions.delete(bridgeSessionId);
  }
}
