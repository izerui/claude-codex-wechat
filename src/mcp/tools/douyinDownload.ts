import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendMediaToWeChat } from '../../media/sendClient.js';
import { locateDouyinScript } from '../../media/scriptLocator.js';
import { nodeExecutable } from '../../shared/platform.js';

/** Locate the douyin-download script bundled with the project. */
function findDouyinScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const found = locateDouyinScript({ baseDir: here });
  if (!found) throw new Error('douyin-download 脚本未找到');
  return found;
}

function runScript(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const script = findDouyinScript();
  return new Promise((resolve, reject) => {
    execFile(nodeExecutable(), [script, ...args], { timeout: 180_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve({ stdout, stderr });
    });
  });
}

async function sendToWechat(filePath: string, kind: 'video'): Promise<string> {
  // 下载来的文件名带 aweme_id，显式下发，避免微信端显示成无意义的临时名。
  return await sendMediaToWeChat({ kind, filePath, fileName: basename(filePath) || 'video.mp4' });
}

export function registerDouyinTools(server: McpServer): void {
  server.registerTool(
    'download_douyin',
    {
      description: '当用户发来抖音链接、分享文案或提到要下载抖音视频时，立即调用此工具。自动下载无水印高清视频并发送到用户微信。支持：短链(v.douyin.com)、完整链接(douyin.com/video/xxx)、分享文案（自动提取链接）、纯 aweme_id。默认下载后直接发送，无需额外操作。',
      inputSchema: {
        url: z.string().describe('抖音链接、分享文案或 aweme_id'),
        outputDir: z.string().optional().describe('保存目录（可选，默认 ~/Downloads）'),
        sendToWechat: z.boolean().optional().describe('下载后是否直接发送到当前微信对话（默认 true）'),
      },
    },
    async ({ url, outputDir, sendToWechat: shouldSend }) => {
      try {
        const args = [url];
        if (outputDir) args.push('--output', outputDir);
        else args.push('--output', join(homedir(), 'Downloads'));
        const { stdout } = await runScript(args);

        // Extract file path from script output: "✅ 已保存: /path/to/file.mp4 (1.23 MB)"
        const pathMatch = stdout.match(/(?:已保存|保存到|saved to|文件路径)[：:]\s*(.+?\.mp4)/i)
          || stdout.match(/(\/[^\s]+\.mp4)/);
        const filePath = pathMatch?.[1]?.trim();

        if (!filePath || !existsSync(filePath)) {
          return { content: [{ type: 'text', text: `下载完成但未找到文件路径。脚本输出:\n${stdout}` }] };
        }

        // Default: send to WeChat
        if (shouldSend !== false) {
          try {
            await sendToWechat(filePath, 'video');
            return { content: [{ type: 'text', text: `视频已下载并发送到微信。\n文件路径: ${filePath}` }] };
          } catch (sendErr) {
            return { content: [{ type: 'text', text: `视频已下载到 ${filePath}，但发送到微信失败: ${(sendErr as Error).message}` }] };
          }
        }

        return { content: [{ type: 'text', text: `视频已下载。\n文件路径: ${filePath}` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `下载失败: ${(e as Error).message}` }], isError: true };
      }
    },
  );
}
