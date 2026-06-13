import { ClaudeHeadlessRunner } from './claude-code/claudeHeadlessRunner';
import { ClaudeCodeProvider } from './claude-code/claudeProvider';
import { CodexCliRunner } from './codex/codexCliRunner';
import { CodexProvider } from './codex/codexProvider';
import type { NativeProviderAdapter } from './types';

export function createDefaultProviders(input: {
  claudeCommand?: string;
  codexCommand?: string;
} = {}): NativeProviderAdapter[] {
  return [
    new ClaudeCodeProvider({ runner: new ClaudeHeadlessRunner({ command: input.claudeCommand }) }),
    new CodexProvider({ runner: new CodexCliRunner({ command: input.codexCommand }) }),
  ];
}
