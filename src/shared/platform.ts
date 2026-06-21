import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';

const isWindows = process.platform === 'win32';

async function isExecutableFile(candidate: string): Promise<boolean> {
  try {
    // Windows 没有 POSIX 执行位概念，存在即可执行；posix 校验 X_OK。
    await access(candidate, isWindows ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableExtensions(): string[] {
  if (!isWindows) return [''];
  const pathext = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD';
  return ['', ...pathext.split(';').filter(Boolean)];
}

/**
 * 跨平台从 PATH 查找可执行文件，返回首个匹配的绝对路径，找不到返回 undefined。
 * 行为对齐 POSIX `command -v`：扫描 PATH 各目录取第一个命中。
 * Windows 额外按 PATHEXT 尝试 .EXE/.CMD/.BAT 等后缀。
 */
export async function findExecutable(command: string): Promise<string | undefined> {
  const extensions = executableExtensions();

  // 已带路径分隔符时按字面路径解析，不再走 PATH 扫描。
  if (command.includes('/') || command.includes('\\')) {
    for (const ext of extensions) {
      if (await isExecutableFile(command + ext)) return command + ext;
    }
    return undefined;
  }

  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, command + ext);
      if (await isExecutableFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * 跨平台终止子进程。
 * posix：发送信号（默认 SIGTERM），与原 child.kill('SIGTERM') 字节级等价。
 * Windows：用 taskkill /T 级联终止进程树（Node 的 kill 不会终止子进程树）。
 */
export function terminateChild(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  if (isWindows) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      // taskkill 不可用时退回到信号终止。
    }
  }
  try {
    child.kill(signal);
  } catch {
    // 进程可能已退出，忽略。
  }
}

/** 默认工作目录：系统临时目录下的 project 子目录。 */
export function defaultWorkspaceDir(): string {
  return join(tmpdir(), 'project');
}

/** 状态/缓存文件路径：放在系统临时目录下。 */
export function statePath(filename: string): string {
  return join(tmpdir(), filename);
}
