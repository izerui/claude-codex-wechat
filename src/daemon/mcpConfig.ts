import { createRequire } from 'node:module';
import { nodeExecutable } from '../shared/platform.js';

/**
 * 生成写入 mcp-media.json 的 MCP server 启动命令，由 Claude CLI 负责 spawn。
 *
 * 关键点是不要交出裸命令名：Windows 上 npm 装的 tsx 是 .cmd shim，Node 不带 shell
 * 时既不会按 PATHEXT 解析裸名（ENOENT），也无法直接执行 .cmd（Node 18.20+/20.12+
 * 抛 EINVAL）。而我们控制不了 Claude CLI 内部怎么 spawn，所以两种模式都统一成
 * 「当前 node 绝对路径 + 脚本路径」，把平台差异消灭在配置生成阶段。
 */
export function buildMcpServerCommand(input: {
  /** 源码态入口（开发用 tsx 直跑）。 */
  tsEntry: string;
  /** 构建产物入口（安装态）。 */
  jsEntry: string;
  exists: (path: string) => boolean;
  resolveTsxCli?: () => string | undefined;
}): { command: string; args: string[] } {
  // dist 是安装态的真实形态，两者都在时以它为准。
  if (input.exists(input.jsEntry)) {
    return { command: nodeExecutable(), args: [input.jsEntry] };
  }

  const tsxCli = (input.resolveTsxCli ?? defaultResolveTsxCli)();
  if (tsxCli) {
    return { command: nodeExecutable(), args: [tsxCli, input.tsEntry] };
  }
  // 兜底：解析不到 tsx 的 JS 入口时退回裸命令，至少 POSIX 上仍能起来。
  return { command: 'tsx', args: [input.tsEntry] };
}

function defaultResolveTsxCli(): string | undefined {
  try {
    return createRequire(import.meta.url).resolve('tsx/dist/cli.mjs');
  } catch {
    return undefined;
  }
}
