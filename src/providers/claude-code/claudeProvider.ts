import type { NativeProviderAdapter, ProviderEvent, ProviderSession } from '../types';
import type { ClaudeRunner } from './claudeRunner';

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
}
