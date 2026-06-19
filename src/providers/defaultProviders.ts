import { ClaudeStreamingRunner } from './claude-code/claudeStreamingRunner';
import { ClaudeCodeProvider } from './claude-code/claudeProvider';
import { CodexInteractiveRunner } from './codex/codexInteractiveRunner';
import { CodexProvider } from './codex/codexProvider';
import type { NativeProviderAdapter } from './types';

export function createDefaultProviders(input: {
  claudeCommand?: string;
  codexCommand?: string;
} = {}): NativeProviderAdapter[] {
  return [
    new ClaudeCodeProvider({ runner: new ClaudeStreamingRunner({ command: input.claudeCommand }) }),
    new CodexProvider({ runner: new CodexInteractiveRunner({ command: input.codexCommand }) }),
  ];
}
