import type { NativeProviderAdapter, ProviderEvent, ProviderSession } from '../types';
import type { ClaudeRunner } from './claudeRunner';
import { getClaudeNativeVersion, listRecoverableClaudeSessions } from './nativeSessions';

export class ClaudeCodeProvider implements NativeProviderAdapter {
  readonly id = 'claude-code';

  constructor(private readonly options: { runner: ClaudeRunner }) {}

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

  async interruptSession(bridgeSessionId: string): Promise<void> {
    await this.options.runner.interruptSession?.(bridgeSessionId);
  }

  async steerSession(bridgeSessionId: string, text: string): Promise<void> {
    await this.options.runner.steerSession?.(bridgeSessionId, text);
  }

  async listRecoverableSessions() {
    return await listRecoverableClaudeSessions();
  }

  async getNativeVersion(input: { providerSessionId: string; cwd: string }) {
    return await getClaudeNativeVersion({
      sessionId: input.providerSessionId,
      cwd: input.cwd,
    });
  }

  async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
    return await this.options.runner.startSession({
      bridgeSessionId: input.bridgeSessionId,
      cwd: input.cwd,
      options: { providerSessionId: input.candidateId },
    });
  }
}
