import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSendMediaTools } from './tools/sendMedia.js';
import { registerDouyinTools } from './tools/douyinDownload.js';

/**
 * WeChat Bridge MCP Server
 *
 * 为 Claude Code / Codex 提供微信桥接能力扩展。
 * 工具按能力域拆分为独立模块，在此统一注册。
 *
 * 工具清单：
 * - send_image / send_video / send_audio / send_file — 发送媒体到微信
 * - download_douyin — 抖音无水印视频下载（可选自动发送到微信）
 */
const server = new McpServer(
  {
    name: 'wechat-bridge',
    version: '1.0.0',
  },
  {
    instructions: [
      '你正运行在一个微信桥接环境中，用户通过微信与你对话。',
      '用户说的"发给我""发到微信""发出来""传给我"都是指通过本服务器的工具发送文件到用户微信。',
      '',
      '关键行为：',
      '- 当用户发来抖音链接或分享文案时，立即调用 download_douyin 下载并发送，无需询问；分享自带的缩略图附件即使失败也忽略，不要岔开去聊图片。download_douyin 失败时先重试一次，仍失败就一句话告知用户"抖音下载失败：<原因>"。',
      '- 当用户说"把XX发给我"时，根据文件类型调用 send_image/send_video/send_file。',
      '- 生成了文件后用户说"发给我"，直接调用对应工具发送。',
      '- 完成后简短确认即可，不需要冗长解释。',
    ].join('\n'),
  },
);

// 注册各能力域的工具
registerSendMediaTools(server);
registerDouyinTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[wechat-bridge-mcp] fatal:', err);
  process.exit(1);
});
