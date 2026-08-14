#!/usr/bin/env node

/**
 * 抖音无水印视频下载脚本（自包含，无下载器依赖）。
 *
 * 用法：
 *   node douyin-download.mjs "<抖音链接>"
 *   node douyin-download.mjs "<抖音链接>" --output ./videos/
 *   node douyin-download.mjs "<分享文案含链接>"
 *
 * 要求：Node.js 20+。新版抖音页面回退路径需要本机安装 Chrome/Chromium。
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─── 常量 ───────────────────────────────────────────────────────────────────

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PLAYER_LOAD_TIMEOUT_MS = 35_000;
const PLAYER_VIRTUAL_TIME_MS = 15_000;
const PLAYER_ATTEMPTS = 2;
const MAX_DOM_BYTES = 2 * 1024 * 1024;
const ALLOWED_VIDEO_HOST_SUFFIXES = [".douyinvod.com", ".douyin.com", ".snssdk.com"];

// ─── 带重试/超时的 fetch ─────────────────────────────────────────────────────

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * fetch 包一层重试与超时，抵御瞬时网络抖动（"fetch failed" 之类的底层网络错误）。
 * 仅对网络层错误和 5xx/429 重试；4xx（除 429）视为确定性失败，不重试。
 */
async function fetchWithRetry(url, options = {}, { retries = 3, timeoutMs = 20_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(attempt * 800);
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const reason = error?.name === "AbortError" ? `请求超时（>${timeoutMs}ms）` : error?.message || String(error);
      if (attempt < retries) {
        await sleep(attempt * 800);
        continue;
      }
      throw new Error(`网络请求失败（已重试${retries}次）：${reason}`);
    }
  }
  throw lastError ?? new Error("网络请求失败");
}

// ─── 解析逻辑 ────────────────────────────────────────────────────────────────

/** 从任意文本里提取第一个抖音 URL。 */
export function extractDouyinUrl(text) {
  const matched = text.match(
    /https?:\/\/(?:v\.douyin\.com|www\.douyin\.com|www\.iesdouyin\.com|iesdouyin\.com)\/[^\s"'）)】]+/i,
  );
  return matched ? matched[0] : null;
}

/** 把任意输入解析成 aweme_id。 */
export async function resolveAwemeId(input) {
  const trimmed = input.trim();
  if (/^\d{15,}$/.test(trimmed)) return trimmed;

  const url = extractDouyinUrl(trimmed) ?? trimmed;
  const direct = url.match(/(?:share\/)?video\/(\d{15,})/);
  if (direct) return direct[1];

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`无法识别的输入（既不是抖音链接，也不是 aweme_id）：${trimmed}`);
  }

  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: { "User-Agent": MOBILE_UA },
    redirect: "follow",
  });
  const matched = response.url.match(/(\d{15,})/);
  if (!matched) throw new Error(`短链重定向后未找到 aweme_id，最终地址：${response.url}`);
  return matched[1];
}

/** 拼无水印播放入口（play 而非 playwm）。 */
function buildPlayUrlNoWatermark(videoId, ratio = "720p") {
  return `https://aweme.snssdk.com/aweme/v1/play/?ratio=${ratio}&video_id=${videoId}`;
}

/** 查找用户机器上已有的 Chrome/Chromium，不下载浏览器。 */
export function findChromeExecutable({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  const explicit = [env.DOUYIN_CHROME_EXECUTABLE, env.CHROME_PATH, env.GOOGLE_CHROME_BIN].filter(Boolean);
  const home = env.HOME || env.USERPROFILE || homedir();
  const candidates = [...explicit];

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      resolve(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    );
  } else if (platform === "win32") {
    for (const root of [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean)) {
      candidates.push(resolve(root, "Google/Chrome/Application/chrome.exe"), resolve(root, "Chromium/Application/chrome.exe"));
    }
  } else {
    candidates.push(
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    );
  }

  return candidates.find((candidate) => exists(candidate)) ?? "";
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

/** 从官方播放器渲染后的 DOM 中提取并校验视频 CDN 地址。 */
export function parseOfficialVideoUrl(dom) {
  const videoTag = dom.match(/<video\b[^>]*>/i)?.[0];
  const rawSource = videoTag?.match(/\bsrc=["']([^"']+)["']/i)?.[1];
  if (!rawSource) throw new Error("抖音官方播放器未返回视频地址，作品可能已删除、设为私密或触发风控");

  const normalized = decodeHtmlAttribute(rawSource);
  let url;
  try {
    url = new URL(normalized.startsWith("//") ? `https:${normalized}` : normalized);
  } catch {
    throw new Error("抖音官方播放器返回了无效的视频地址");
  }

  const allowed =
    url.protocol === "https:" && ALLOWED_VIDEO_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  if (!allowed) throw new Error(`抖音官方播放器返回了非预期的视频域名：${url.hostname}`);
  return url.toString();
}

async function renderOfficialPlayerDom(chrome, playerUrl) {
  const { stdout } = await execFileAsync(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--virtual-time-budget=${PLAYER_VIRTUAL_TIME_MS}`,
      "--dump-dom",
      playerUrl,
    ],
    { timeout: PLAYER_LOAD_TIMEOUT_MS, maxBuffer: MAX_DOM_BYTES },
  );
  return stdout;
}

/** 由抖音官方播放器完成访客 Cookie 与动态签名，再读取真实 CDN 地址。 */
export async function resolveOfficialDouyinVideoUrl(
  awemeId,
  { chrome = findChromeExecutable(), renderDom = renderOfficialPlayerDom } = {},
) {
  if (!/^\d{15,}$/.test(awemeId)) throw new Error(`无效的抖音 aweme_id：${awemeId}`);
  if (!chrome) {
    throw new Error(
      "旧分享页已不再提供 video_id，且未找到 Chrome/Chromium。请安装 Chrome，或设置 DOUYIN_CHROME_EXECUTABLE 指向浏览器可执行文件。",
    );
  }

  const playerUrl = `https://open.douyin.com/player/video?vid=${awemeId}&autoplay=0`;
  let lastError;
  for (let attempt = 1; attempt <= PLAYER_ATTEMPTS; attempt += 1) {
    try {
      return parseOfficialVideoUrl(await renderDom(chrome, playerUrl));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── 下载逻辑 ────────────────────────────────────────────────────────────────

async function fetchVideoSource(url, referer) {
  return fetchWithRetry(
    url,
    {
      headers: { "User-Agent": DESKTOP_UA, Referer: referer },
      redirect: "follow",
    },
    { timeoutMs: 60_000 },
  );
}

export async function download(input, outputDir) {
  console.log("正在解析...");

  const trimmed = input.trim();
  let awemeId = "";
  let videoId = "";
  let playUrl;
  let referer = "https://open.douyin.com/";

  if (/^v0[a-z0-9]{10,}$/i.test(trimmed)) {
    videoId = trimmed;
    playUrl = buildPlayUrlNoWatermark(videoId);
    referer = "https://www.douyin.com/";
  } else {
    awemeId = await resolveAwemeId(trimmed);
    playUrl = await resolveOfficialDouyinVideoUrl(awemeId);
  }

  console.log(`aweme_id: ${awemeId || "-"}  video_id: ${videoId || "-"}`);
  console.log("正在下载无水印视频...");

  const response = await fetchVideoSource(playUrl, referer);
  if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `douyin_${awemeId || videoId}.mp4`;
  const dir = outputDir ? resolve(outputDir) : process.cwd();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filepath = resolve(dir, filename);
  writeFileSync(filepath, buffer);

  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
  console.log(`✅ 已保存: ${filepath} (${sizeMB} MB)`);
  return filepath;
}

// ─── CLI 入口 ────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const outputIndex = argv.indexOf("--output");
  let outputDir;
  if (outputIndex !== -1) {
    outputDir = argv[outputIndex + 1];
    argv.splice(outputIndex, 2);
  }

  const input = argv.join(" ").trim();
  if (!input) {
    console.error('用法: node douyin-download.mjs "<抖音链接>" [--output <目录>]');
    process.exitCode = 2;
    return;
  }

  try {
    await download(input, outputDir);
  } catch (error) {
    console.error("❌ 错误:", error.message || error);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) await main();
