import { homedir } from 'node:os';

// 展开路径开头的 `~`,避免把字面量 `~/foo` 直接当作 spawn 的 cwd,
// 导致 Node 抛 `spawn <command> ENOENT`(报错指向 command,实为目录不存在)。
export function expandTilde(target: string | undefined): string | undefined {
  if (!target) return target;
  if (target === '~') return homedir();
  if (target.startsWith('~/')) return homedir() + target.slice(1);
  return target;
}
