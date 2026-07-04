import { describe, expect, it } from 'vitest';
import { douyinScriptCandidates } from '../src/mcp/tools/douyinDownload';

describe('douyinScriptCandidates', () => {
  it('includes the source-layout script path for tsx/dev runs', () => {
    const candidates = douyinScriptCandidates('/repo/src/mcp/tools');

    expect(candidates).toContain('/repo/src/mcp/scripts/douyin-download.mjs');
  });

  it('includes the bundled dist script path for npm package runs', () => {
    const candidates = douyinScriptCandidates('/repo/dist/mcp');

    expect(candidates).toContain('/repo/dist/mcp/scripts/douyin-download.mjs');
  });
});
