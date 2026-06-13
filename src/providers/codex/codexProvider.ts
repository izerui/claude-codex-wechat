import type { NativeProviderAdapter, ProviderEvent, ProviderSession } from '../types';
import { CodexCliRunner } from './codexCliRunner';

export class CodexProvider implements NativeProviderAdapter {
  readonly id = 'codex';

  constructor(private readonly options: { runner: CodexCliRunner }) {}

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

  async decidePermission(input: { requestId: string; decision: 'approve' | 'deny' | 'abort' }): Promise<void> {
    await this.options.runner.decidePermission(input);
  }
}
