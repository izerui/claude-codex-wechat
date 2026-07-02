import { spawn } from 'node:child_process';
import { useShellForCli } from '../../shared/platform';

// Probe whether the installed `claude` CLI supports `--append-system-prompt`.
// The bridge appends a fixed system prompt via that flag; on older Claude Code
// builds the flag doesn't exist, and passing it would make every turn fail with
// an unknown-option error. So we detect support once (cached per command) and
// degrade gracefully — omitting the flag when unsupported, which just falls back
// to the AskUserQuestion rendering + numeric-mapping path.
export type ClaudeCapabilityProbe = (command: string) => Promise<boolean>;

const cache = new Map<string, Promise<boolean>>();

export const probeAppendSystemPromptSupport: ClaudeCapabilityProbe = (command) => {
  const cached = cache.get(command);
  if (cached) return cached;
  const result = runHelpProbe(command);
  cache.set(command, result);
  return result;
};

function runHelpProbe(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, ['--help'], { stdio: ['ignore', 'pipe', 'pipe'], shell: useShellForCli() });
      let output = '';
      const collect = (data: unknown) => { output += String(data); };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);
      child.on('error', () => resolve(false));
      child.on('close', () => resolve(output.includes('--append-system-prompt')));
    } catch {
      resolve(false);
    }
  });
}
