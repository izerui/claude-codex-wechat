import { ClaudeStreamingRunner } from './claude-code/claudeStreamingRunner';
import { ClaudeCodeProvider } from './claude-code/claudeProvider';
import { CodexInteractiveRunner } from './codex/codexInteractiveRunner';
import { CodexProvider } from './codex/codexProvider';
import type { NativeProviderAdapter } from './types';

// 解析形如 "180000" 的环境变量为正整数,非法或非正则回退默认值。
export function readEnvInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function createDefaultProviders(input: {
  claudeCommand?: string;
  codexCommand?: string;
  mcpConfigPath?: string;
} = {}): NativeProviderAdapter[] {
  const claudeRunner = new ClaudeStreamingRunner({
    command: input.claudeCommand,
    mcpConfigPath: input.mcpConfigPath,
    idleTimeoutMs: readEnvInt(process.env.BRIDGE_CLAUDE_IDLE_TIMEOUT_MS, 180_000),
    maxProcessAgeMs: readEnvInt(process.env.BRIDGE_CLAUDE_MAX_PROCESS_AGE_MS, 2 * 60 * 60 * 1000),
    maxTurns: readEnvInt(process.env.BRIDGE_CLAUDE_MAX_TURNS, 50),
  });
  return [
    new ClaudeCodeProvider({ runner: claudeRunner }),
    new CodexProvider({ runner: new CodexInteractiveRunner({ command: input.codexCommand }) }),
  ];
}
