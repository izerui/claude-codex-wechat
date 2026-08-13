import { describe, expect, it } from 'vitest';
import {
  BRIDGE_RULES,
  renderClaudeSystemPrompt,
  renderCodexInstructions,
  renderMcpInstructions,
} from '../src/media/behavior';

// 同一套行为规则此前散落在四个文件里各写一遍，改一处忘三处就会行为漂移，
// 且没有任何测试守着。规则收敛到 BRIDGE_RULES 后，这里负责钉死三件事：
// 规则一致、Claude 侧缓存稳定、Codex 侧跨平台。
describe('规则单一来源', () => {
  it('三种渲染都表达了「抖音链接立即处理、不要反问」', () => {
    const rendered = [
      renderClaudeSystemPrompt(),
      renderMcpInstructions(),
      renderCodexInstructions({ platform: 'darwin', apiBaseUrl: 'http://127.0.0.1:8787', douyinScriptPath: '/pkg/d.mjs' }),
    ];

    for (const text of rendered) {
      expect(text).toContain('抖音');
      expect(text).toContain(BRIDGE_RULES.douyinNoAsking);
    }
  });

  it('三种渲染都说明了「发给我」等于发到微信', () => {
    const rendered = [
      renderClaudeSystemPrompt(),
      renderMcpInstructions(),
      renderCodexInstructions({ platform: 'linux', apiBaseUrl: 'http://127.0.0.1:8787', douyinScriptPath: '/pkg/d.mjs' }),
    ];

    for (const text of rendered) expect(text).toContain(BRIDGE_RULES.sendMeansWeChat);
  });
});

// bridgeSystemPrompt.ts 的原注释：它坐在 prompt 前缀上，掺进任何每轮会变的值
// 都会让缓存逐轮失效。这条约束靠测试守住，而不是靠下一个人记得读注释。
describe('Claude 侧必须 byte-stable', () => {
  it('多次渲染结果完全一致', () => {
    expect(renderClaudeSystemPrompt()).toBe(renderClaudeSystemPrompt());
  });

  it('不含任何文件系统路径或平台特征', () => {
    const prompt = renderClaudeSystemPrompt();

    expect(prompt).not.toMatch(/[/\\]tmp|dist[/\\]|\.mjs|curl/);
    expect(prompt).not.toContain('8787');
  });

  // Claude 走 MCP 工具，指令里必须给工具名而不是 shell 命令。
  it('给出的是 MCP 工具名', () => {
    expect(renderClaudeSystemPrompt()).toContain('download_douyin');
    expect(renderClaudeSystemPrompt()).toContain('send_video');
  });
});

describe('Codex 侧跨平台', () => {
  const base = { apiBaseUrl: 'http://127.0.0.1:8787', douyinScriptPath: 'C:\\pkg\\d.mjs' };

  // PowerShell 里裸写 curl 会命中 Invoke-WebRequest 别名，-sS -X -H -d 全部报错；
  // 写全 curl.exe 才会走到真正的 curl。
  it('windows 用 curl.exe 而非 curl', () => {
    const text = renderCodexInstructions({ ...base, platform: 'win32', tmpDir: 'C:\\Temp' });

    expect(text).toContain('curl.exe');
    expect(text).not.toMatch(/[^.]curl -/);
  });

  it('windows 不出现 POSIX 的 /tmp', () => {
    const text = renderCodexInstructions({ ...base, platform: 'win32', tmpDir: 'C:\\Temp' });

    expect(text).toContain('C:\\Temp');
    expect(text).not.toContain('/tmp');
  });

  // PowerShell 的续行符是反引号，POSIX 的 `\` 会被当成一个参数传给 curl.exe。
  // 与其教模型用哪种续行，不如在 Windows 上直接给单行命令。
  it('windows 命令不使用 POSIX 续行符', () => {
    const text = renderCodexInstructions({ ...base, platform: 'win32', tmpDir: 'C:\\Temp' });

    expect(text).not.toMatch(/\\\n/);
  });

  it('posix 保持使用 curl', () => {
    const text = renderCodexInstructions({
      platform: 'darwin', apiBaseUrl: 'http://127.0.0.1:8787', douyinScriptPath: '/pkg/d.mjs', tmpDir: '/tmp',
    });

    expect(text).toContain('curl -sS');
    expect(text).not.toContain('curl.exe');
  });

  // Codex 没有 MCP 工具，指令里出现工具名只会让它去找不存在的东西。
  it('不提及 MCP 工具名', () => {
    const text = renderCodexInstructions({ ...base, platform: 'darwin', tmpDir: '/tmp' });

    expect(text).not.toContain('download_douyin');
    expect(text).not.toContain('send_video');
  });

  it('带上端点与脚本路径', () => {
    const text = renderCodexInstructions({
      platform: 'darwin', apiBaseUrl: 'http://127.0.0.1:9999', douyinScriptPath: '/pkg/d.mjs', tmpDir: '/tmp',
    });

    expect(text).toContain('http://127.0.0.1:9999/api/channel/send-media');
    expect(text).toContain('/pkg/d.mjs');
  });
});
