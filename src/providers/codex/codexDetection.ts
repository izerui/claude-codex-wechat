import { spawn } from 'node:child_process';

export type CodexCommandRunnerResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; code: number | string; stdout: string; stderr: string };

export type CodexCommandRunner = (command: string, args: string[]) => Promise<CodexCommandRunnerResult>;

export type CodexDetectionResult =
  | { detected: true; version: string | null }
  | { detected: false; reason: 'missing_binary' | 'command_failed' };

export async function defaultCodexCommandRunner(command: string, args: string[]): Promise<CodexCommandRunnerResult> {
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

export async function detectCodexCli(input: { command?: string; commandRunner?: CodexCommandRunner } = {}): Promise<CodexDetectionResult> {
  const runner = input.commandRunner ?? defaultCodexCommandRunner;
  const result = await runner(input.command ?? 'codex', ['--version']);
  if (!result.ok) {
    return result.code === 'ENOENT'
      ? { detected: false, reason: 'missing_binary' }
      : { detected: false, reason: 'command_failed' };
  }
  return { detected: true, version: parseCodexVersion(`${result.stdout}\n${result.stderr}`) };
}

function parseCodexVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/);
  return match?.[1] ?? null;
}
