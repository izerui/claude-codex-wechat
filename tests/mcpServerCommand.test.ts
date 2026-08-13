import { describe, expect, it } from 'vitest';
import { buildMcpServerCommand } from '../src/daemon/mcpConfig';

const TS = '/repo/src/mcp/mediaServer.ts';
const JS = '/repo/dist/mcp/mediaServer.js';

// 这段配置被写进 mcp-media.json，由 Claude CLI 去 spawn。
// 裸写 'tsx' 在 Windows 上是 .cmd shim：Node 不带 shell 时既无法按 PATHEXT 解析，
// 也不能直接执行 .cmd（Node 18.20+/20.12+ 抛 EINVAL）。所以两种模式都走 node 绝对路径。
describe('buildMcpServerCommand', () => {
  it('runs the built js directly with the current node interpreter', () => {
    const result = buildMcpServerCommand({
      tsEntry: TS,
      jsEntry: JS,
      exists: (path) => path === JS,
    });

    expect(result.command).toBe(process.execPath);
    expect(result.args).toEqual([JS]);
  });

  it('runs the ts entry through tsx cli.mjs instead of the tsx shim', () => {
    const result = buildMcpServerCommand({
      tsEntry: TS,
      jsEntry: JS,
      exists: (path) => path === TS,
      resolveTsxCli: () => '/repo/node_modules/tsx/dist/cli.mjs',
    });

    expect(result.command).toBe(process.execPath);
    expect(result.args).toEqual(['/repo/node_modules/tsx/dist/cli.mjs', TS]);
  });

  // tsx 解析不到时不能连 MCP 都起不来，退回裸命令让 POSIX 仍可用。
  it('falls back to the tsx shim when its cli entry cannot be resolved', () => {
    const result = buildMcpServerCommand({
      tsEntry: TS,
      jsEntry: JS,
      exists: (path) => path === TS,
      resolveTsxCli: () => undefined,
    });

    expect(result.command).toBe('tsx');
    expect(result.args).toEqual([TS]);
  });

  // 两者都在时以构建产物为准：dist 是安装态的真实形态。
  it('prefers the built js when both entries exist', () => {
    const result = buildMcpServerCommand({
      tsEntry: TS,
      jsEntry: JS,
      exists: () => true,
    });

    expect(result.args).toEqual([JS]);
  });
});
