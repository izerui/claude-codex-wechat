import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'http://localhost:8787';

/** Locate the douyin-download script bundled with the project. */
function findDouyinScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Bundled with project (primary)
    join(here, '..', 'scripts', 'douyin-download.mjs'),
    // Built output
    join(here, '..', '..', 'mcp', 'scripts', 'douyin-download.mjs'),
    // User skills locations (cross-platform)
    join(homedir(), '.agents', 'skills', 'douyin-download', 'scripts', 'douyin-download.mjs'),
    join(homedir(), '.claude', 'skills', 'douyin-download', 'scripts', 'douyin-download.mjs'),
  ];
  for (const p of candidates) {
    const resolved = resolve(p);
    if (existsSync(resolved)) return resolved;
  }
  throw new Error('douyin-download 脚本未找到');
}

function runScript(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const script = findDouyinScript();
  return new Promise((resolve, reject) => {
    execFile('node', [script, ...args], { timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve({ stdout, stderr });
    });
  });
}

async function sendToWechat(filePath: string, kind: string): Promise<string> {
  const fileName = basename(filePath) || 'video.mp4';
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
  if (!result.ok) throw new Error(`发送失败: ${result.error ?? '未知错误'}`);
  return '发送成功';
}

export function registerDouyinTools(server: McpServer): void {
  server.tool(
    'download_douyin',
    '下载抖音无水印视频。支持短链(v.douyin.com)、完整链接、分享文案、纯 aweme_id。下载完成后可选择直接发送到微信。',
    {
      url: z.string().describe('抖音链接、分享文案或 aweme_id'),
      outputDir: z.string().optional().describe('保存目录（可选，默认 ~/Downloads）'),
      sendToWechat: z.boolean().optional().describe('下载后是否直接发送到当前微信对话（默认 true）'),
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
