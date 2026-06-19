import type { NativeProviderAdapter, ProviderEvent, ProviderSession } from '../types';
import { listRecoverableCodexSessions } from './nativeSessions';

type CodexRunner = {
  startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: { providerSessionId?: string; sessionName?: string };
  }): Promise<ProviderSession>;
  sendMessage(input: {
    bridgeSessionId: string;
    text: string;
  }): AsyncIterable<ProviderEvent>;
  stopSession(bridgeSessionId: string): Promise<void>;
  decidePermission(input: { requestId: string; decision: 'approve' | 'deny' | 'abort' }): Promise<void>;
  archiveSession?(providerSessionId: string): Promise<void>;
  interruptTurn?(bridgeSessionId: string): Promise<void>;
  steerTurn?(bridgeSessionId: string, text: string): Promise<void>;
};

export class CodexProvider implements NativeProviderAdapter {
  readonly id = 'codex';

  constructor(private readonly options: { runner: CodexRunner }) {}

  async startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: Record<string, unknown>;
  }): Promise<ProviderSession> {
    return await this.options.runner.startSession({
      bridgeSessionId: input.bridgeSessionId,
      cwd: input.cwd,
      initialPrompt: input.initialPrompt,
      options: typeof input.options === 'object' && input.options ? {
        providerSessionId: typeof input.options.providerSessionId === 'string' ? input.options.providerSessionId : undefined,
        sessionName: typeof input.options.sessionName === 'string' ? input.options.sessionName : undefined,
      } : undefined,
    });
  }

  async *sendMessage(input: {
    bridgeSessionId: string;
    text: string;
    attachments?: Array<{ localPath: string; mimeType?: string }>;
  }): AsyncIterable<ProviderEvent> {
    yield* this.options.runner.sendMessage({
      bridgeSessionId: input.bridgeSessionId,
      text: input.text,
    });
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    await this.options.runner.stopSession(bridgeSessionId);
  }

  async decidePermission(input: { requestId: string; decision: 'approve' | 'deny' | 'abort' }): Promise<void> {
    await this.options.runner.decidePermission(input);
  }

  async listRecoverableSessions() {
    return await listRecoverableCodexSessions();
  }

  async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    return await this.options.runner.startSession({
      bridgeSessionId: input.bridgeSessionId,
      cwd: input.cwd,
      options: { providerSessionId: input.candidateId },
    });
  }

  async archiveSession(providerSessionId: string): Promise<void> {
    if (!this.options.runner.archiveSession) throw new Error('codex_archive_not_supported');
    await this.options.runner.archiveSession(providerSessionId);
  }

  async interruptSession(bridgeSessionId: string): Promise<void> {
    await this.options.runner.interruptTurn?.(bridgeSessionId);
  }

  async steerSession(bridgeSessionId: string, text: string): Promise<void> {
    await this.options.runner.steerTurn?.(bridgeSessionId, text);
  }
}
