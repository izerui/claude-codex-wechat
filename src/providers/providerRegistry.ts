import { detectClaudeCode, type ClaudeDetectionResult } from './claude-code/claudeDetection';
import { detectCodexCli, type CodexDetectionResult } from './codex/codexDetection';

export type ProviderStatus = {
  claude: ClaudeDetectionResult;
  codex: CodexDetectionResult;
};

export class ProviderRegistry {
  async getStatus(): Promise<ProviderStatus> {
    return {
      claude: await detectClaudeCode(),
      codex: await detectCodexCli(),
    };
  }
}
