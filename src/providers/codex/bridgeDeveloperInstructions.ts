import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCodexInstructions } from '../../media/behavior.js';
import { locateDouyinScript } from '../../media/scriptLocator.js';

/**
 * 注入每个桥接 Codex 会话的 developer 指令（thread/start 与 thread/resume 都要带）。
 *
 * 内容本身由 media/behavior.ts 统一渲染，与 Claude 侧共用同一套规则；
 * 这里只负责把运行时才知道的三件事喂进去：端点地址、脚本路径、当前平台。
 *
 * 不注入的后果：Codex 收到抖音链接只会反问"要下载还是要总结"，而 Claude 会直接
 * 下载并发送——同一个微信入口两种行为，用户会以为是坏了。
 */
export function buildCodexBridgeInstructions(input: {
  apiBaseUrl?: string;
  douyinScriptPath?: string;
  platform?: NodeJS.Platform;
  tmpDir?: string;
} = {}): string {
  return renderCodexInstructions({
    platform: input.platform ?? process.platform,
    apiBaseUrl: input.apiBaseUrl ?? defaultApiBaseUrl(),
    douyinScriptPath: input.douyinScriptPath ?? defaultDouyinScriptPath(),
    tmpDir: input.tmpDir ?? tmpdir(),
  });
}

function defaultApiBaseUrl(): string {
  const port = process.env.BRIDGE_PORT ?? '8787';
  return `http://127.0.0.1:${port}`;
}

// 与 MCP 工具共用同一组候选：打包后在 dist/server/，开发态在 src/providers/codex/，
// 两种布局回到 mcp/scripts 的层级不同，自己推路径必错（历史教训）。
function defaultDouyinScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return locateDouyinScript({ baseDir: here })
    ?? join(here, '..', 'mcp', 'scripts', 'douyin-download.mjs');
}
