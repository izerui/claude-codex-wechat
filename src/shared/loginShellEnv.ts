import { spawnSync } from 'node:child_process';
import { delimiter } from 'node:path';

/**
 * 复刻「用户在终端里拉起 CLI」时的环境变量。
 *
 * 背景：桥接层用 spawn 拉起 claude/codex 时，子进程默认继承的是 daemon 进程的
 * `process.env`。如果 daemon 不是从交互终端启动（GUI 双击 / launchd / pm2 等），
 * 它的环境和用户终端里的不一样——PATH（选错二进制）、HOME（读错 ~/.codex）、
 * 以及 shell profile 里 export 的变量都可能缺失或过期，导致 CLI 手动能用、桥接层里报错。
 *
 * 这里跑一次用户的「登录 + 交互」shell（`$SHELL -l -i -c`），让它 source 完
 * rc 文件后把此刻的完整环境 dump 出来，作为 spawn claude/codex 的 env——也就是
 * 让子进程的起跑线和终端对齐。结果缓存，只在首次调用时真正执行一次。
 *
 * 失败/超时/非 posix 平台一律返回 null，调用方据此退回 `process.env`（即现状行为，零回归）。
 */

// 用于在 shell 输出里定位 env 块的哨兵；两侧包裹 env 输出，避开 rc 打印的 banner 干扰。
const DELIMITER = '__CCW_LOGIN_ENV_DELIM_5f3a2b7c__';

export type SpawnSyncLike = (
  command: string,
  args: string[],
  options: { timeout: number; encoding: 'utf8'; maxBuffer: number },
) => { status: number | null; stdout?: string | null; error?: unknown };

export type CaptureDeps = {
  run?: SpawnSyncLike;
  platform?: NodeJS.Platform;
  shell?: string;
  timeoutMs?: number;
};

/**
 * 把 `env` 命令输出的文本块解析成环境变量 map。
 * 逐行解析 `KEY=VALUE`；不匹配 `KEY=` 形式的行视为上一个变量多行值的延续。
 */
export function parseEnvBlock(block: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  let currentKey: string | null = null;
  // `env` 每行（含最后一行）都以 \n 结尾，去掉块尾这个行终止符，
  // 否则它会被当成最后一个变量多行值的延续。
  const normalized = block.replace(/\n$/, '');
  for (const line of normalized.split('\n')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      currentKey = match[1];
      env[currentKey] = match[2];
    } else if (currentKey) {
      // 上一个变量的多行值延续。
      env[currentKey] = `${env[currentKey]}\n${line}`;
    }
  }
  return env;
}

/**
 * 执行一次捕获（不带缓存）。用于测试可注入 run/platform/shell。
 */
export function captureLoginShellEnv(deps: CaptureDeps = {}): NodeJS.ProcessEnv | null {
  const platform = deps.platform ?? process.platform;
  // Windows 没有 `$SHELL -lic` 这套 posix 概念，直接放弃复刻，退回继承。
  if (platform === 'win32') return null;

  const run = deps.run ?? (spawnSync as unknown as SpawnSyncLike);
  const shell = deps.shell ?? process.env.SHELL ?? '/bin/zsh';
  const timeoutMs = deps.timeoutMs ?? 5000;
  const command = `printf %s '${DELIMITER}'; env; printf %s '${DELIMITER}'`;

  try {
    const result = run(shell, ['-l', '-i', '-c', command], {
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    const start = stdout.indexOf(DELIMITER);
    const end = stdout.indexOf(DELIMITER, start + DELIMITER.length);
    if (start === -1 || end === -1 || end <= start) return null;
    const block = stdout.slice(start + DELIMITER.length, end);
    const env = parseEnvBlock(block);
    // 至少要有 PATH 才算捕获成功，否则视为异常输出，退回继承。
    if (!env.PATH) return null;
    return env;
  } catch {
    return null;
  }
}

let cache: NodeJS.ProcessEnv | null | undefined;

/**
 * 生产入口：带缓存，进程内只真正捕获一次。
 * 返回终端环境（复刻成功）或 null（失败/超时/Windows）。
 */
export function resolveLoginShellEnv(): NodeJS.ProcessEnv | null {
  if (cache !== undefined) return cache;
  cache = captureLoginShellEnv();
  return cache;
}

/** 仅供测试：重置缓存。 */
export function resetLoginShellEnvCacheForTest(): void {
  cache = undefined;
}

/**
 * 查找 claude/codex 等 provider 可执行文件时应使用的 PATH：
 * 「终端 PATH（复刻登录 shell）」在前优先命中，daemon 自身 PATH 兜底。
 *
 * daemon 若非从交互终端启动（GUI/launchd/pm2），其 `process.env.PATH` 往往缺少
 * nvm/brew 等目录；用这份合并 PATH 才能像用户在终端里那样找到 provider。
 * 终端 PATH 抓取失败时退回 `process.env.PATH`（即原行为，零回归）。
 */
export function resolveTerminalSearchPath(): string | undefined {
  return mergeSearchPath(resolveLoginShellEnv()?.PATH, process.env.PATH);
}

/** 合并两段 PATH：primary 在前（优先命中），fallback 兜底；任一为空则用另一段。 */
export function mergeSearchPath(
  primary: string | undefined,
  fallback: string | undefined,
): string | undefined {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return `${primary}${delimiter}${fallback}`;
}
