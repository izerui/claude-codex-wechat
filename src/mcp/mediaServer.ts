import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'http://localhost:4800';

/**
 * MCP Server that exposes media-sending tools for WeChat.
 * Claude Code invokes these tools to send images/videos/audio/files
 * to the current WeChat chat via the bridge daemon's HTTP API.
 */
const server = new McpServer({
  name: 'wechat-media',
  version: '1.0.0',
});

async function sendMedia(kind: string, filePath: string, fileName?: string): Promise<string> {
  const response = await fetch(`${BRIDGE_API_URL}/api/channel/send-media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, filePath, fileName }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`发送失败 (HTTP ${response.status}): ${text}`);
  }
  const result = await response.json() as { ok: boolean; error?: string };
  if (!result.ok) {
    throw new Error(`发送失败: ${result.error ?? '未知错误'}`);
  }
  return '发送成功';
}

server.tool(
  'send_image',
  '发送图片文件到当前微信对话。传入图片文件的绝对路径。',
  { filePath: z.string().describe('图片文件的绝对路径，如 /path/to/image.png') },
  async ({ filePath }) => {
    try {
      const msg = await sendMedia('image', filePath);
      return { content: [{ type: 'text', text: msg }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  },
);

server.tool(
  'send_video',
  '发送视频文件到当前微信对话。传入视频文件的绝对路径。',
  { filePath: z.string().describe('视频文件的绝对路径，如 /path/to/video.mp4') },
  async ({ filePath }) => {
    try {
      const msg = await sendMedia('video', filePath);
      return { content: [{ type: 'text', text: msg }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  },
);

server.tool(
  'send_audio',
  '发送音频文件到当前微信对话。传入音频文件的绝对路径。',
  { filePath: z.string().describe('音频文件的绝对路径，如 /path/to/audio.mp3') },
  async ({ filePath }) => {
    try {
      const msg = await sendMedia('audio', filePath);
      return { content: [{ type: 'text', text: msg }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  },
);

server.tool(
  'send_file',
  '发送文件到当前微信对话。传入文件的绝对路径和可选的显示文件名。',
  {
    filePath: z.string().describe('文件的绝对路径，如 /path/to/document.pdf'),
    fileName: z.string().optional().describe('显示给用户的文件名（可选，默认使用原文件名）'),
  },
  async ({ filePath, fileName }) => {
    try {
      const msg = await sendMedia('file', filePath, fileName);
      return { content: [{ type: 'text', text: msg }] };
    } catch (e) {
      return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[wechat-media-mcp] fatal:', err);
  process.exit(1);
});
