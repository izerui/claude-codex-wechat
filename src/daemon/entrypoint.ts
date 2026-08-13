import { posix, win32 } from 'node:path';

/** 包名与包内入口，需与 package.json 的 name / bin 保持一致。 */
const PACKAGE_NAME = 'claude-codex-wechat';
const PACKAGE_ENTRY = ['dist', 'server', 'cli.js'];

export type ResolveDaemonEntrypointInput = {
  /** 当前正在执行的 cli.js 绝对路径（通常来自 import.meta.url）。 */
  currentPath: string;
  /** node 可执行文件路径，用于推断同装的全局 node_modules。 */
  execPath: string;
  platform: NodeJS.Platform;
  exists: (path: string) => boolean;
  /** 显式覆盖，优先级最高。 */
  override?: string;
  /** 额外的全局 node_modules 目录（测试注入或未来扩展用）。 */
  globalNodeModules?: string[];
};

/**
 * 决定写进 launchd / systemd / pid 服务里的 daemon 入口路径。
 *
 * 服务配置是长期存活的：一旦把源码检出目录写进去，用户重建 dist、切分支或删仓库，
 * 常驻服务就再也起不来。所以只要能找到已安装的 npm 包，就优先用它。
 */
export function resolveDaemonEntrypoint(input: ResolveDaemonEntrypointInput): string {
  if (input.override) return input.override;

  const path = input.platform === 'win32' ? win32 : posix;
  // 已经跑在 node_modules 里 = 安装态，它自己就是最可靠的答案。
  if (isInsideNodeModules(input.currentPath, path)) return input.currentPath;

  for (const root of globalNodeModulesCandidates(input, path)) {
    const candidate = path.join(root, PACKAGE_NAME, ...PACKAGE_ENTRY);
    if (input.exists(candidate)) return candidate;
  }

  // 没装全局包（纯源码开发），保持现状比猜一个不存在的路径更安全。
  return input.currentPath;
}

function isInsideNodeModules(target: string, path: typeof posix | typeof win32): boolean {
  return target.split(path.sep).includes('node_modules');
}

function globalNodeModulesCandidates(
  input: ResolveDaemonEntrypointInput,
  path: typeof posix | typeof win32,
): string[] {
  const nodeDir = path.dirname(input.execPath);
  const candidates = [...(input.globalNodeModules ?? [])];

  if (input.platform === 'win32') {
    // npm 全局包与 node.exe 同级：<...>\npm\node_modules。
    candidates.push(path.join(nodeDir, 'node_modules'));
    return candidates;
  }

  // 相对 node 自身的标准布局（nvm、官方安装包等）。
  candidates.push(path.join(nodeDir, '..', 'lib', 'node_modules'));
  // Homebrew 把 node 放在 Cellar 里，全局包却在前缀目录下，推不出来只能枚举。
  candidates.push('/opt/homebrew/lib/node_modules');
  candidates.push('/usr/local/lib/node_modules');
  candidates.push('/usr/lib/node_modules');
  return candidates;
}
