import { describe, expect, it } from 'vitest';
import { douyinScriptCandidates, locateDouyinScript } from '../src/media/scriptLocator';

// 抖音脚本随包分发，但调用方位置各不相同（MCP 工具、Codex 指令生成器），
// 且开发态跑 src/、安装态跑 dist/。此前两处各写了一份定位逻辑，Codex 那份写错了。
describe('douyinScriptCandidates', () => {
  it('covers the mcp tools source layout', () => {
    expect(douyinScriptCandidates('/repo/src/mcp/tools'))
      .toContain('/repo/src/mcp/scripts/douyin-download.mjs');
  });

  it('covers the bundled mcp layout', () => {
    expect(douyinScriptCandidates('/repo/dist/mcp'))
      .toContain('/repo/dist/mcp/scripts/douyin-download.mjs');
  });

  // 这两条是 Codex 指令生成器所在的位置——之前它自己推路径，开发态推成了
  // src/providers/mcp/scripts（不存在），导致 Codex 拿到一条跑不通的命令。
  it('covers the codex provider source layout', () => {
    expect(douyinScriptCandidates('/repo/src/providers/codex'))
      .toContain('/repo/src/mcp/scripts/douyin-download.mjs');
  });

  it('covers the bundled server layout', () => {
    expect(douyinScriptCandidates('/repo/dist/server'))
      .toContain('/repo/dist/mcp/scripts/douyin-download.mjs');
  });
});

describe('locateDouyinScript', () => {
  it('returns the first candidate that exists on disk', () => {
    const found = locateDouyinScript({
      baseDir: '/repo/src/providers/codex',
      exists: (path) => path === '/repo/src/mcp/scripts/douyin-download.mjs',
    });

    expect(found).toBe('/repo/src/mcp/scripts/douyin-download.mjs');
  });

  it('returns undefined when no candidate exists', () => {
    const found = locateDouyinScript({
      baseDir: '/repo/src/providers/codex',
      exists: () => false,
    });

    expect(found).toBeUndefined();
  });
});
