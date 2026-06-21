import type { ProviderEvent, ProviderSession } from '../types';

export type ClaudeRunnerEvent = ProviderEvent;

export type ClaudeRunnerSession = ProviderSession & {
  claudeSessionId?: string;
  transcriptPath?: string;
};

export interface ClaudeRunner {
  startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: {
      providerSessionId?: string;
      sessionName?: string;
    };
  }): Promise<ClaudeRunnerSession>;

  sendMessage(input: {
    bridgeSessionId: string;
    text: string;
  }): AsyncIterable<ClaudeRunnerEvent>;

  stopSession(bridgeSessionId: string): Promise<void>;

  interruptSession?(bridgeSessionId: string): Promise<void>;

  steerSession?(bridgeSessionId: string, text: string): Promise<void>;
}
