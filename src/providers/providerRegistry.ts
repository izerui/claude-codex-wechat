import { detectClaudeCode, type ClaudeDetectionResult } from './claude-code/claudeDetection';
import { detectCodexCli, type CodexDetectionResult } from './codex/codexDetection';

export type ProviderStatus = {
  claude: ClaudeDetectionResult & { command?: string; checkedAt: number };
  codex: CodexDetectionResult & { command?: string; checkedAt: number };
};

export class ProviderRegistry {
  constructor(private readonly options: {
    claudeCommand?: string;
    codexCommand?: string;
    detectClaude?: (input?: { command?: string }) => Promise<ClaudeDetectionResult>;
    detectCodex?: (input?: { command?: string }) => Promise<CodexDetectionResult>;
    now?: () => number;
  } = {}) {}

  async getStatus(): Promise<ProviderStatus> {
    const detectClaude = this.options.detectClaude ?? detectClaudeCode;
    const detectCodex = this.options.detectCodex ?? detectCodexCli;
    const checkedAt = this.options.now ? this.options.now() : Date.now();
    return {
      claude: {
        ...(await detectClaude({ command: this.options.claudeCommand })),
        command: this.options.claudeCommand,
        checkedAt,
      },
      codex: {
        ...(await detectCodex({ command: this.options.codexCommand })),
        command: this.options.codexCommand,
        checkedAt,
      },
    };
  }
}
