import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 注入每个桥接 Codex 会话的 developer 指令（thread/start 与 thread/resume 都要带）。
 *
 * 为什么 Codex 需要单独一份、不能照抄 Claude 的：
 * Claude 侧通过 `--mcp-config` 加载了 wechat-media MCP，拥有 send_video / download_douyin
 * 等工具；Codex 侧没有加载任何 MCP，那些工具名对它而言并不存在。所以这里告诉它的是
 * 它真正能用的手段——用 shell 调桥接层的 HTTP 端点，以及直接跑随包分发的下载脚本。
 *
 * 若不注入，Codex 收到抖音链接只会反问"要下载还是要总结"，而 Claude 会直接下载并发送
 * ——同一个微信入口两种行为，用户会以为是坏了。
 */
export function buildCodexBridgeInstructions(input: {
  apiBaseUrl?: string;
  douyinScriptPath?: string;
} = {}): string {
  const apiBaseUrl = input.apiBaseUrl ?? defaultApiBaseUrl();
  const douyinScript = input.douyinScriptPath ?? defaultDouyinScriptPath();
  return [
    '你正运行在一个微信桥接环境中，用户通过微信与你对话。',
    '',
    '## 环境说明',
    '- 用户看到的是微信聊天界面，没有交互式弹窗或按钮；需要用户做选择时用序号列表。',
    '- 用户说的"发给我""发到微信""发出来""传给我"，都是指把文件发送到他的微信。',
    '',
    '## 发送文件到用户微信',
    '用 shell 调用桥接层的发送端点即可（kind 取 image / video / audio / file）：',
    '```bash',
    `curl -sS -X POST ${apiBaseUrl}/api/channel/send-media \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -d '{"kind":"video","filePath":"/absolute/path/to/file.mp4"}'`,
    '```',
    '- filePath 必须是绝对路径。',
    '- 返回 {"ok":true} 即发送成功；失败时把错误原文告诉用户，并给出文件本地路径。',
    '',
    '## 抖音视频下载',
    '当用户发来含抖音链接（v.douyin.com、douyin.com）的消息或分享文案时：',
    '- 立即执行下载，不要反问用户"要下载还是要总结"——下载并发送就是默认预期。',
    '```bash',
    `node ${douyinScript} "<抖音链接或整段分享文案>" --output /tmp`,
    '```',
    '- 脚本成功时输出 `✅ 已保存: <文件绝对路径>`；取该路径，按上面的方式以 kind=video 发送到微信。',
    '- 支持短链、完整链接、分享文案、纯 aweme_id，可以把整段文案原样传进去。',
    '- 分享消息常附带卡片缩略图，加载失败无关紧要，直接忽略，不要因此改聊图片。',
    '- 下载失败先原样重试一次；仍失败就一句话告诉用户"抖音下载失败：<原因>"，不要岔开话题。',
    '',
    '## 行为准则',
    '- 用户的"我"就是他的微信，"发给我"就是发到微信。',
    '- 执行完成后简短确认（如"已发送"），不需要冗长解释。',
    '- 你生成了文件（图表、代码、文档等）后，用户说"发给我"就直接按上面的方式发送。',
  ].join('\n');
}

function defaultApiBaseUrl(): string {
  const port = process.env.BRIDGE_PORT ?? '8787';
  return `http://127.0.0.1:${port}`;
}

// 打包后本文件位于 dist/server/，脚本位于 dist/mcp/scripts/。
function defaultDouyinScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'mcp', 'scripts', 'douyin-download.mjs');
}
