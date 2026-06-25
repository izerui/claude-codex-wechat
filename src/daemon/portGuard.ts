import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type PortOccupant = {
  pid: number;
  command: string;
};

export async function findListeningProcess(port: number): Promise<PortOccupant | null> {
  if (process.platform === 'win32') return null;
  try {
    const { stdout } = await execFileAsync('lsof', ['-n', '-P', `-iTCP:${port}`, '-sTCP:LISTEN']);
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
    const record = lines.slice(1)[0];
    if (!record) return null;
    const parts = record.trim().split(/\s+/);
    const command = parts[0] ?? '';
    const pid = Number(parts[1] ?? '');
    if (!command || !Number.isFinite(pid)) return null;
    return { pid, command };
  } catch {
    return null;
  }
}
