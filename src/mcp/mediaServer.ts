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
const server = new McpServer({
  name: 'wechat-bridge',
  version: '1.0.0',
});

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
