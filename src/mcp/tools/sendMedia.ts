import { basename } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'http://localhost:8787';

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

export function registerSendMediaTools(server: McpServer): void {
  server.registerTool(
    'send_image',
    {
      description: '将图片发送到用户微信。用户说"把图片发给我""把截图发出来""发到我微信"时调用。也适用于你生成了图片/图表/截图后主动发送给用户。',
      inputSchema: { filePath: z.string().describe('图片文件的绝对路径，如 /path/to/image.png') },
    },
    async ({ filePath }) => {
      try {
        const msg = await sendMedia('image', filePath);
        return { content: [{ type: 'text', text: msg }] };
      } catch (e) {
        return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
      }
    },
  );

  server.registerTool(
    'send_video',
    {
      description: '将视频发送到用户微信。用户说"把视频发给我""视频发出来"时调用。下载完视频后也应主动调用此工具发送。',
      inputSchema: { filePath: z.string().describe('视频文件的绝对路径，如 /path/to/video.mp4') },
    },
    async ({ filePath }) => {
      try {
        const msg = await sendMedia('video', filePath);
        return { content: [{ type: 'text', text: msg }] };
      } catch (e) {
        return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
      }
    },
  );

  server.registerTool(
    'send_audio',
    {
      description: '将音频文件以附件形式发送到用户微信（用户可点击播放）。用户说"把音频发给我""音乐发出来"时调用。',
      inputSchema: { filePath: z.string().describe('音频文件的绝对路径，如 /path/to/audio.mp3') },
    },
    async ({ filePath }) => {
      try {
        const fileName = basename(filePath) || 'audio.mp3';
        const msg = await sendMedia('file', filePath, fileName);
        return { content: [{ type: 'text', text: msg }] };
      } catch (e) {
        return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
      }
    },
  );

  server.registerTool(
    'send_file',
    {
      description: '将文件发送到用户微信。用户说"把文件发给我""文档发出来""把XX传给我"时调用。支持 PDF、文档、代码、压缩包等所有类型。',
      inputSchema: {
        filePath: z.string().describe('文件的绝对路径，如 /path/to/document.pdf'),
        fileName: z.string().optional().describe('显示给用户的文件名（可选，默认使用原文件名）'),
      },
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
}
