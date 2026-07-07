import type { NativeProviderAdapter, ProviderEvent, ProviderId, ProviderSession } from '../types';

export class FakeProviderAdapter implements NativeProviderAdapter {
  private readonly sessions = new Map<string, ProviderSession>();
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
    yield { type: 'text_delta', text: `收到：${input.text}` };
    yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.stoppedSessions.push(bridgeSessionId);
    this.sessions.delete(bridgeSessionId);
  }

  async getNativeVersion() {
    return null;
  }

  async listRecoverableSessions() {
    return [{
      id: `${this.id}_recoverable_1`,
      providerId: this.id,
      title: `${this.id} recoverable session`,
    }];
  }

  async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    const session: ProviderSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: this.id,
      providerSessionId: input.candidateId,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }
}
