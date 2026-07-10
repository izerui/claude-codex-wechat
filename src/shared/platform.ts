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
/**
 * 判断路径是否为临时目录下的 CLI shim（如桌面应用注入的 cmux-cli-shims）。
 * 这类 shim 不是用户安装的真实二进制，应跳过以优先使用 brew/npm 等正式安装的版本。
 */
function isTemporaryShim(candidate: string): boolean {
  const tempDir = tmpdir();
  return candidate.startsWith(tempDir);
}

/**
 * 跨平台从指定 PATH 查找可执行文件，返回首个匹配的绝对路径，找不到返回 undefined。
 * `pathEnv` 为必传，调用方须显式决定「在哪份 PATH 里找」——避免隐式落到 daemon 的
 * process.env.PATH（非终端启动时往往残缺）而找不到 provider。查找 provider 时应传
 * `resolveTerminalSearchPath()`。
 */
export async function findExecutable(command: string, pathEnv: string | undefined): Promise<string | undefined> {
  const extensions = executableExtensions();

  // 已带路径分隔符时按字面路径解析，不再走 PATH 扫描。
  if (command.includes('/') || command.includes('\\')) {
    for (const ext of extensions) {
      if (await isExecutableFile(command + ext)) return command + ext;
    }
    return undefined;
  }

  const dirs = (pathEnv ?? '').split(delimiter).filter(Boolean);
  let fallback: string | undefined;
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, command + ext);
      if (await isExecutableFile(candidate)) {
        // 跳过临时目录中的 shim，优先使用正式安装的版本
        if (isTemporaryShim(candidate)) {
          fallback ??= candidate;
          continue;
        }
        return candidate;
      }
    }
  }
  // 如果只有临时 shim 可用，退而求其次
  return fallback;
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

/**
 * 启动 claude/codex 这类 CLI 时是否需要经 shell。
 * Windows 上 npm 全局安装的可执行文件是 .cmd shim，Node 的 spawn 不带 shell 时
 * 既不会按 PATHEXT 解析裸命令（ENOENT），也无法直接执行 .cmd（Node 18.20+/20.12+ 抛 EINVAL）。
 * 交给 shell（cmd.exe）即可由其完成 PATHEXT 查找并执行 shim。posix 无此问题，返回 false。
 */
export function useShellForCli(): boolean {
  return isWindows;
}

/** 状态/缓存文件路径：放在系统临时目录下。 */
export function statePath(filename: string): string {
  return join(tmpdir(), filename);
}
