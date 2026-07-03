#!/usr/bin/env node

/**
 * 抖音无水印视频下载脚本（自包含，无外部依赖）。
 *
 * 用法：
 *   node douyin-download.mjs "<抖音链接>"
 *   node douyin-download.mjs "<抖音链接>" --output ./videos/
 *   node douyin-download.mjs "<分享文案含链接>"
 *
 * 要求：Node.js 18+（需要全局 fetch）
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── 常量 ───────────────────────────────────────────────────────────────────

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── 解析逻辑 ────────────────────────────────────────────────────────────────

/** 从任意文本里提取第一个抖音 URL */
function extractDouyinUrl(text) {
  const m = text.match(
    /https?:\/\/(?:v\.douyin\.com|www\.douyin\.com|www\.iesdouyin\.com|iesdouyin\.com)\/[^\s"'）)】]+/i
  );
  return m ? m[0] : null;
}

/** 把任意输入解析成 aweme_id */
async function resolveAwemeId(input) {
  const trimmed = input.trim();
  if (/^\d{15,}$/.test(trimmed)) return trimmed;

  const url = extractDouyinUrl(trimmed) ?? trimmed;

  const direct = url.match(/(?:share\/)?video\/(\d{15,})/);
  if (direct) return direct[1];

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`无法识别的输入（既不是抖音链接，也不是 aweme_id）：${trimmed}`);
  }

  const resp = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": MOBILE_UA },
    redirect: "follow",
  });
  const m = resp.url.match(/(\d{15,})/);
  if (!m) throw new Error(`短链重定向后未找到 aweme_id，最终地址：${resp.url}`);
  return m[1];
}

/** 从抖音分享页提取 video_id */
async function resolveVideoId(awemeId) {
  const shareUrl = `https://www.iesdouyin.com/share/video/${awemeId}/`;
  const resp = await fetch(shareUrl, { headers: { "User-Agent": MOBILE_UA } });
  if (!resp.ok) throw new Error(`分享页请求失败：HTTP ${resp.status}（aweme_id=${awemeId}）`);
  const html = await resp.text();
  const m =
    html.match(/video_id=([a-z0-9]+)/i) ??
    html.match(/"video_id"\s*:\s*"([a-z0-9]+)"/i) ??
    html.match(/playwm\/\?[^"'\\]*?video_id=([a-z0-9]+)/i);
  if (!m) throw new Error(`分享页里未找到 video_id（aweme_id=${awemeId}）`);
  return m[1];
}

/** 拼无水印播放入口（play 而非 playwm） */
function buildPlayUrlNoWatermark(videoId, ratio = "720p") {
  return `https://aweme.snssdk.com/aweme/v1/play/?ratio=${ratio}&video_id=${videoId}`;
}

// ─── 下载逻辑 ────────────────────────────────────────────────────────────────

async function download(input, outputDir) {
  console.log("正在解析...");

  const trimmed = input.trim();
  let awemeId = "";
  let videoId = "";

  if (/^v0[a-z0-9]{10,}$/i.test(trimmed)) {
    videoId = trimmed;
  } else {
    awemeId = await resolveAwemeId(trimmed);
    videoId = await resolveVideoId(awemeId);
  }

  console.log(`aweme_id: ${awemeId || "-"}  video_id: ${videoId}`);

  const playUrl = buildPlayUrlNoWatermark(videoId);
  console.log("正在下载无水印视频...");

  const resp = await fetch(playUrl, {
    headers: { "User-Agent": DESKTOP_UA, Referer: "https://www.douyin.com/" },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`下载失败: HTTP ${resp.status}`);
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  const filename = `douyin_${awemeId || videoId}.mp4`;

  const dir = outputDir ? resolve(outputDir) : process.cwd();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filepath = resolve(dir, filename);
  writeFileSync(filepath, buf);

  const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
  console.log(`✅ 已保存: ${filepath} (${sizeMB} MB)`);
  return filepath;
}

// ─── CLI 入口 ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const outputIdx = argv.indexOf("--output");
let outputDir;
if (outputIdx !== -1) {
  outputDir = argv[outputIdx + 1];
  argv.splice(outputIdx, 2);
}

const input = argv.join(" ").trim();
if (!input) {
  console.error('用法: node douyin-download.mjs "<抖音链接>" [--output <目录>]');
  process.exit(2);
}

download(input, outputDir).catch((error) => {
  console.error("❌ 错误:", error.message || error);
  process.exit(1);
});
