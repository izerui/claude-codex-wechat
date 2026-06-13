import { spawn } from 'node:child_process';

export type CommandRunnerResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; code: number | string; stdout: string; stderr: string };

export type CommandRunner = (command: string, args: string[]) => Promise<CommandRunnerResult>;

export type ClaudeDetectionResult =
  | { detected: true; version: string | null }
  | { detected: false; reason: 'missing_binary' | 'command_failed' };

export async function defaultCommandRunner(command: string, args: string[]): Promise<CommandRunnerResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error: NodeJS.ErrnoException) => {
      resolve({ ok: false, code: error.code ?? 'ERROR', stdout, stderr: stderr || error.message });
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, stdout, stderr });
      else resolve({ ok: false, code: code ?? 'SIGNAL', stdout, stderr });
    });
  });
}

function parseClaudeVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/);
  return match?.[1] ?? null;
}

export async function detectClaudeCode(input: { command?: string; commandRunner?: CommandRunner } = {}): Promise<ClaudeDetectionResult> {
  const runner = input.commandRunner ?? defaultCommandRunner;
  const result = await runner(input.command ?? 'claude', ['--version']);
  if (!result.ok) {
    return result.code === 'ENOENT'
      ? { detected: false, reason: 'missing_binary' }
      : { detected: false, reason: 'command_failed' };
  }
  return { detected: true, version: parseClaudeVersion(`${result.stdout}\n${result.stderr}`) };
}
