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

const SCRIPT_TIMEOUT_MS = 240_000;

type ScriptResult = { stdout: string; stderr: string; interrupted?: string };

function runScript(args: string[]): Promise<ScriptResult> {
  const script = findDouyinScript();
  return new Promise((resolve, reject) => {
    // 图集要先试视频播放器再渲染图集页，比纯视频多一次浏览器渲染。
    execFile(nodeExecutable(), [script, ...args], { timeout: SCRIPT_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (!err) {
        resolve({ stdout, stderr });
        return;
      }
      // err.message 带完整命令行和本机路径，不适合转给用户；超时被杀时给一句人话。
      const reason = err.killed ? `超过 ${SCRIPT_TIMEOUT_MS / 1000} 秒` : stderr.trim() || '脚本异常退出';
      // 图集下到一半超时被杀时，已保存的图片仍然有效，交给调用方照常发送。
      if (parseSavedFiles(stdout).length) resolve({ stdout, stderr, interrupted: reason });
      else reject(new Error(reason));
    });
  });
}

async function sendToWechat(filePath: string, kind: 'video' | 'image'): Promise<string> {
  // 下载来的文件名带 aweme_id，显式下发，避免微信端显示成无意义的临时名。
  return await sendMediaToWeChat({ kind, filePath, fileName: basename(filePath) || (kind === 'video' ? 'video.mp4' : 'image.jpeg') });
}

/** 脚本每保存一个文件输出一行 "✅ 已保存: /path/to/file.ext (1.23 MB)"；图集会有多行。 */
export function parseSavedFiles(stdout: string): string[] {
  return [...stdout.matchAll(/已保存[：:]\s*(.+?)\s+\([\d.]+ MB\)\s*$/gm)].map((match) => match[1].trim());
}

/** 中途被杀时脚本来不及输出缺页汇总，按开头报的总张数和已保存文件的序号自己算。 */
export function missingImageNumbers(stdout: string, files: string[]): number[] {
  const total = Number(stdout.match(/图集[：:]\s*(\d+)\s*张/)?.[1] ?? 0);
  const saved = new Set(files.map((file) => Number(file.match(/_(\d+)\.\w+$/)?.[1])));
  return Array.from({ length: total }, (_, index) => index + 1).filter((seq) => !saved.has(seq));
}

/** 图集部分图片下载失败时脚本仍成功退出，只输出 "⚠️ ..." 行；要转告用户缺了哪几张。 */
export function parseWarnings(stdout: string): string[] {
  return stdout.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('⚠️'));
}

export function registerDouyinTools(server: McpServer): void {
  server.registerTool(
    'download_douyin',
    {
      description: '当用户发来抖音链接、分享文案或提到要下载抖音视频/图集时，立即调用此工具。视频下载无水印高清 mp4，图集（多张图片的作品）下载全部原图，并按顺序发送到用户微信。支持：短链(v.douyin.com)、完整链接(douyin.com/video/xxx)、分享文案（自动提取链接）、纯 aweme_id。默认下载后直接发送，无需额外操作。',
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
        const { stdout, interrupted } = await runScript(args);

        const files = parseSavedFiles(stdout).filter((file) => existsSync(file));
        if (!files.length) {
          return { content: [{ type: 'text', text: `下载完成但未找到文件路径。脚本输出:\n${stdout}` }] };
        }

        const isVideo = files.length === 1 && files[0].toLowerCase().endsWith('.mp4');
        const label = isVideo ? '视频' : `图集（${files.length} 张）`;
        const warnings = parseWarnings(stdout);
        if (interrupted) {
          const missing = missingImageNumbers(stdout, files);
          warnings.push(missing.length
            ? `⚠️ 下载中途中断（${interrupted}），缺第 ${missing.join('、')} 张`
            : `⚠️ 下载中途中断（${interrupted}），后面的文件可能没下完`);
        }
        const fileList = files.join('\n') + (warnings.length ? `\n${warnings.join('\n')}` : '');

        if (shouldSend === false) {
          return { content: [{ type: 'text', text: `${label}已下载。\n文件路径:\n${fileList}` }] };
        }

        // 图集逐张发送，保持原顺序；某张失败不影响其余几张。
        const failures: string[] = [];
        for (const file of files) {
          try {
            await sendToWechat(file, isVideo ? 'video' : 'image');
          } catch (sendErr) {
            failures.push(`${file}: ${(sendErr as Error).message}`);
          }
        }
        if (failures.length) {
          return { content: [{ type: 'text', text: `${label}已下载，但发送到微信失败 ${failures.length} 个:\n${failures.join('\n')}\n全部文件路径:\n${fileList}` }] };
        }
        return { content: [{ type: 'text', text: `${label}已下载并发送到微信。\n文件路径:\n${fileList}` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `下载失败: ${(e as Error).message}` }], isError: true };
      }
    },
  );
}
