import type { PermissionRequest, ProviderEvent, ProviderSession } from '../types';

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
  }): Promise<ClaudeRunnerSession>;

  sendMessage(input: {
    bridgeSessionId: string;
    text: string;
  }): AsyncIterable<ClaudeRunnerEvent>;

  decidePermission?(input: {
    requestId: string;
    decision: 'approve' | 'deny' | 'abort';
  }): Promise<void>;

  stopSession(bridgeSessionId: string): Promise<void>;
}

export type ClaudeRawPermissionPayload = {
  id: string;
  toolName: string;
  summary?: string;
  command?: string;
  cwd?: string;
  file?: string;
  details?: unknown;
  choices?: PermissionRequest['choices'];
};
