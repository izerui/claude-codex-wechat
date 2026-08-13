import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * 定位随包分发的 douyin-download.mjs。
 *
 * 调用方分布在不同层级（MCP 工具在 mcp/tools，Codex 指令生成器在 providers/codex），
 * 且开发态跑 src/、安装态跑打包后的 dist/，所以只能给一组候选逐个探测。
 *
 * 曾经 providers/codex 侧自己推了一次路径且推错（得到 src/providers/mcp/scripts），
 * 让 Codex 拿到一条跑不通的命令——统一到这里后，两边共用同一组候选。
 */
export function douyinScriptCandidates(baseDir: string): string[] {
  return [
    // 源码布局：src/mcp/tools -> src/mcp/scripts
    join(baseDir, '..', 'scripts', 'douyin-download.mjs'),
    // 打包布局：dist/mcp/mediaServer.js -> dist/mcp/scripts
    join(baseDir, 'scripts', 'douyin-download.mjs'),
    // 同级包：dist/server -> dist/mcp/scripts（打包后 cli.js 与 mcp/ 平级）
    join(baseDir, '..', 'mcp', 'scripts', 'douyin-download.mjs'),
    // 深一层：src/providers/codex -> src/mcp/scripts
    join(baseDir, '..', '..', 'mcp', 'scripts', 'douyin-download.mjs'),
    // 用户 skills 目录（跨平台）
    join(homedir(), '.agents', 'skills', 'douyin-download', 'scripts', 'douyin-download.mjs'),
    join(homedir(), '.claude', 'skills', 'douyin-download', 'scripts', 'douyin-download.mjs'),
  ];
}

export function locateDouyinScript(input: {
  baseDir: string;
  exists?: (path: string) => boolean;
}): string | undefined {
  const exists = input.exists ?? existsSync;
  for (const candidate of douyinScriptCandidates(input.baseDir)) {
    const resolved = resolve(candidate);
    if (exists(resolved)) return resolved;
  }
  return undefined;
}
