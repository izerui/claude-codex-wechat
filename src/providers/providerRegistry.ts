import { detectClaudeCode, type ClaudeDetectionResult } from './claude-code/claudeDetection';
import { detectCodexCli, type CodexDetectionResult } from './codex/codexDetection';

export type ProviderStatus = {
  claude: ClaudeDetectionResult;
  codex: CodexDetectionResult;
};

export class ProviderRegistry {
  constructor(private readonly options: {
    claudeCommand?: string;
    codexCommand?: string;
    detectClaude?: (input?: { command?: string }) => Promise<ClaudeDetectionResult>;
    detectCodex?: (input?: { command?: string }) => Promise<CodexDetectionResult>;
  } = {}) {}

  async getStatus(): Promise<ProviderStatus> {
    const detectClaude = this.options.detectClaude ?? detectClaudeCode;
    const detectCodex = this.options.detectCodex ?? detectCodexCli;
    return {
      claude: await detectClaude({ command: this.options.claudeCommand }),
      codex: await detectCodex({ command: this.options.codexCommand }),
    };
  }
}
