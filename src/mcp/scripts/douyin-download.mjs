#!/usr/bin/env node

/**
 * 抖音无水印视频/图集下载脚本（自包含，无下载器依赖）。
 *
 * 用法：
 *   node douyin-download.mjs "<抖音链接>"
 *   node douyin-download.mjs "<抖音链接>" --output ./videos/
 *   node douyin-download.mjs "<分享文案含链接>"
 *
 * 要求：Node.js 20+。新版抖音页面回退路径需要本机安装 Chrome/Chromium。
 * 视频保存为 douyin_<aweme_id>.mp4；图集保存为 douyin_<aweme_id>_01.jpeg 起的多张图片，
 * 每个文件输出一行"✅ 已保存: <路径>"。
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
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
const NOTE_RENDER_WAIT_MS = 12_000;
const PLAYER_ATTEMPTS = 2;
const MAX_DOM_BYTES = 2 * 1024 * 1024;
const ALLOWED_VIDEO_HOST_SUFFIXES = [".douyinvod.com", ".douyin.com", ".snssdk.com"];
const ALLOWED_VIDEO_HOSTS = new Set(["v3-dy-o.zjcdn.com"]);
const ALLOWED_IMAGE_HOST_SUFFIXES = [".douyinpic.com"];
const IMAGE_MIRROR_TIMEOUT_MS = 45_000;
const IMAGE_EXTENSIONS = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
// 确定性失败：重试同一页面不会有不同结果，直接放弃这条路径。
const UNEXPECTED_VIDEO_HOST = "UNEXPECTED_VIDEO_HOST";
const CHROME_MISSING = "CHROME_MISSING";
const NOT_A_NOTE = "NOT_A_NOTE";

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

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
      // 调用方传入的 signal 管整体时限（含读正文），与这里只管等响应头的超时合并。
      // AbortSignal.any 需 Node 20.3+；更早的 20.x 退回只用调用方的总时限。
      const signal = !options.signal
        ? controller.signal
        : typeof AbortSignal.any === "function"
          ? AbortSignal.any([controller.signal, options.signal])
          : options.signal;
      const response = await fetch(url, { ...options, signal });
      clearTimeout(timer);
      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(attempt * 800);
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      // 调用方的总时限已到，再重试也会立刻失败，不必空等退避。
      if (options.signal?.aborted) throw new Error(`请求超过总时限：${error?.message || error}`);
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
  const direct = url.match(/(?:share\/)?(?:video|note)\/(\d{15,})/);
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

/** 视频与图片共用的白名单校验：必须 HTTPS，且主机名精确命中或以指定后缀结尾。 */
function isAllowedHost(url, { hosts = new Set(), suffixes }) {
  return url.protocol === "https:" && (hosts.has(url.hostname) || suffixes.some((suffix) => url.hostname.endsWith(suffix)));
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

  if (!isAllowedHost(url, { hosts: ALLOWED_VIDEO_HOSTS, suffixes: ALLOWED_VIDEO_HOST_SUFFIXES })) throw codedError(`抖音官方播放器返回了非预期的视频域名：${url.hostname}`, UNEXPECTED_VIDEO_HOST);
  return url.toString();
}

// 正在运行的 Chrome；脚本被外层超时杀掉时一并结束，避免留下孤儿浏览器。
const activeBrowsers = new Set();

async function renderDomWithChrome(chrome, pageUrl, extraArgs) {
  const pending = execFileAsync(
    chrome,
    ["--headless=new", "--no-sandbox", "--disable-gpu", ...extraArgs, "--dump-dom", pageUrl],
    { timeout: PLAYER_LOAD_TIMEOUT_MS, maxBuffer: MAX_DOM_BYTES },
  );
  activeBrowsers.add(pending.child);
  try {
    return (await pending).stdout;
  } finally {
    activeBrowsers.delete(pending.child);
  }
}

const renderOfficialPlayerDom = (chrome, playerUrl) =>
  renderDomWithChrome(chrome, playerUrl, [`--virtual-time-budget=${PLAYER_VIRTUAL_TIME_MS}`]);
// 图集页只有手机 UA 才会在服务端渲染时带上完整作品数据（含 images）。
// 该页的长连接会让 --virtual-time-budget 偶发永不结束，改用墙钟 --timeout 到点导出 DOM。
const renderNotePageDom = (chrome, noteUrl) =>
  renderDomWithChrome(chrome, noteUrl, [`--user-agent=${MOBILE_UA}`, `--timeout=${NOTE_RENDER_WAIT_MS}`]);

function requireChrome(chrome) {
  if (!chrome) {
    throw codedError(
      "解析抖音视频和图集需要本机 Chrome/Chromium，但未找到。请安装 Chrome，或设置 DOUYIN_CHROME_EXECUTABLE 指向浏览器可执行文件。",
      CHROME_MISSING,
    );
  }
}

/** 由抖音官方播放器完成访客 Cookie 与动态签名，再读取真实 CDN 地址。 */
export async function resolveOfficialDouyinVideoUrl(
  awemeId,
  { chrome = findChromeExecutable(), renderDom = renderOfficialPlayerDom } = {},
) {
  if (!/^\d{15,}$/.test(awemeId)) throw new Error(`无效的抖音 aweme_id：${awemeId}`);
  requireChrome(chrome);

  const playerUrl = `https://open.douyin.com/player/video?vid=${awemeId}&autoplay=0`;
  // 域名不符是确定性结果（如图集返回的配乐地址），重载无益；超时、数据未就绪等仍重试。
  return renderAndParse(() => renderDom(chrome, playerUrl), parseOfficialVideoUrl, UNEXPECTED_VIDEO_HOST);
}

/** 渲染并解析，最多 PLAYER_ATTEMPTS 次；遇到 stopCode 这类确定性失败立即放弃。 */
async function renderAndParse(render, parse, stopCode) {
  let lastError;
  for (let attempt = 1; attempt <= PLAYER_ATTEMPTS; attempt += 1) {
    try {
      return parse(await render());
    } catch (error) {
      lastError = error;
      if (error?.code === stopCode) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// 只看路径扩展名，查询参数里偶然出现的 .jpg 不算。
const isJpegUrl = (raw) => /\.jpe?g$/i.test(new URL(raw).pathname);

function isAllowedImageUrl(raw) {
  try {
    return isAllowedHost(new URL(raw), { suffixes: ALLOWED_IMAGE_HOST_SUFFIXES });
  } catch {
    return false;
  }
}

/** 找 aweme_id 匹配的作品对象；有图片的优先，避免命中只带 ID 的引用。 */
function findAweme(node, awemeId) {
  let fallback = null;
  const visit = (current) => {
    if (Array.isArray(current)) return current.some(visit);
    if (!current || typeof current !== "object") return false;
    if (String(current.aweme_id ?? current.awemeId ?? "") === awemeId) {
      if (Array.isArray(current.images) && current.images.length) {
        fallback = current;
        return true;
      }
      fallback ??= current;
    }
    return Object.values(current).some(visit);
  };
  visit(node);
  return fallback;
}

/**
 * 从图集页渲染后的 DOM 中提取每张图的候选原图地址（每项是一组镜像，JPEG 优先）。
 * 只取 url_list：download_url_list 是加了抖音水印的版本。
 */
export function parseNoteImageUrls(dom, awemeId) {
  const marker = /window\._ROUTER_DATA\s*=\s*/.exec(dom);
  const start = marker ? marker.index + marker[0].length : -1;
  const end = start === -1 ? -1 : dom.indexOf("</script>", start);
  if (end === -1) throw new Error("抖音图集页未返回作品数据，作品可能已删除、设为私密或触发风控");

  let data;
  try {
    data = JSON.parse(dom.slice(start, end).trim().replace(/;$/, ""));
  } catch {
    throw new Error("抖音图集页返回了无法解析的作品数据");
  }

  const aweme = findAweme(data, awemeId);
  // 页面没加载完或被风控时只有骨架数据、找不到作品，值得重试；找到了作品却没有图片才是确定的"不是图集"。
  if (!aweme) throw new Error("抖音图集页未返回该作品的数据，作品可能已删除、设为私密或触发风控");
  if (!Array.isArray(aweme.images) || !aweme.images.length) {
    throw codedError("抖音图集页中没有该作品的图片，作品可能不是图集", NOT_A_NOTE);
  }

  // 保留空候选的位置：下载时据此报出缺了第几张，而不是悄悄重新编号。
  const images = aweme.images.map((image) =>
    (image?.url_list ?? [])
      .filter(isAllowedImageUrl)
      .sort((a, b) => Number(!isJpegUrl(a)) - Number(!isJpegUrl(b))),
  );
  if (!images.some((candidates) => candidates.length)) throw new Error("抖音图集页返回了非预期的图片域名");
  return images;
}

/** 图集（aweme_type 2）没有视频流，官方播放器只给配乐；改从图集页读取原图地址。 */
export async function resolveDouyinNoteImages(
  awemeId,
  { chrome = findChromeExecutable(), renderDom = renderNotePageDom } = {},
) {
  if (!/^\d{15,}$/.test(awemeId)) throw new Error(`无效的抖音 aweme_id：${awemeId}`);
  requireChrome(chrome);

  const noteUrl = `https://www.douyin.com/note/${awemeId}`;
  return renderAndParse(() => renderDom(chrome, noteUrl), (dom) => parseNoteImageUrls(dom, awemeId), NOT_A_NOTE);
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

function ensureOutputDir(outputDir) {
  const dir = outputDir ? resolve(outputDir) : process.cwd();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function saveBuffer(dir, filename, buffer) {
  const filepath = resolve(dir, filename);
  writeFileSync(filepath, buffer);
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
  console.log(`✅ 已保存: ${filepath} (${sizeMB} MB)`);
  return filepath;
}

/** 依次尝试同一张图的各个镜像地址，单个 CDN 节点超时不影响整组。 */
export async function downloadImage(candidates, { mirrorTimeoutMs = IMAGE_MIRROR_TIMEOUT_MS } = {}) {
  if (!candidates.length) throw new Error("没有可用的抖音图床地址");
  let lastError;
  for (const url of candidates) {
    try {
      // fetchWithRetry 拿到响应头就停表；节点发完头后卡住正文时，靠这个总时限切到下一个镜像。
      const response = await fetchWithRetry(url, {
        signal: AbortSignal.timeout(mirrorTimeoutMs),
        headers: { "User-Agent": MOBILE_UA, Referer: "https://www.douyin.com/" },
        redirect: "follow",
      });
      // 白名单只校验了初始地址，跟随重定向后要再校验一次落点；
      // 风控页常以 200 返回 HTML，按类型把关，避免把网页存成 .jpeg 发出去。
      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const ext = IMAGE_EXTENSIONS[type];
      const rejection = !response.ok
        ? `HTTP ${response.status}`
        : !isAllowedImageUrl(response.url)
          ? `重定向到了非预期的图片地址：${response.url || "空"}`
          : !ext
            ? `返回的不是图片（content-type: ${type || "未知"}）`
            : "";
      if (rejection) {
        // 放弃这个镜像前释放响应体，免得连接一直挂着。
        await response.body?.cancel().catch(() => {});
        throw new Error(rejection);
      }
      return { buffer: Buffer.from(await response.arrayBuffer()), ext };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`图片下载失败: ${lastError?.message || lastError}`);
}

async function downloadNoteImages(awemeId, images, outputDir) {
  console.log(`aweme_id: ${awemeId}  图集: ${images.length} 张`);
  console.log("正在下载图集原图...");

  const dir = ensureOutputDir(outputDir);
  const width = Math.max(2, String(images.length).length);
  const files = [];
  const failed = [];
  for (const [index, candidates] of images.entries()) {
    // 序号按原图顺序，缺页时编号留空，便于看出少了哪一张。
    const seq = String(index + 1).padStart(width, "0");
    try {
      const { buffer, ext } = await downloadImage(candidates);
      files.push(saveBuffer(dir, `douyin_${awemeId}_${seq}.${ext}`, buffer));
    } catch (error) {
      failed.push(index + 1);
      // 明细走 stderr 留作排查；stdout 只出一行汇总，免得转给用户时同一件事说两遍。
      console.error(`第 ${index + 1} 张下载失败: ${error.message || error}`);
    }
  }
  if (!files.length) throw new Error(`图集 ${images.length} 张全部下载失败`);
  if (failed.length) console.log(`⚠️ 图集共 ${images.length} 张，缺第 ${failed.join("、")} 张`);
  return files;
}

/** 下载作品；视频返回单个 mp4 路径，图集返回按顺序排列的图片路径。 */
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
    // 明确的 /note/ 链接直接按图集处理，省掉视频播放器的渲染。
    if (/\/note\/\d{15,}/.test(extractDouyinUrl(trimmed) ?? trimmed)) {
      return downloadNoteImages(awemeId, await resolveDouyinNoteImages(awemeId), outputDir);
    }
    try {
      playUrl = await resolveOfficialDouyinVideoUrl(awemeId);
    } catch (videoError) {
      if (videoError?.code === CHROME_MISSING) throw videoError;
      // 短链对图集也重定向到 /share/video/，事先分辨不出类型，只能在视频解析失败后按图集再试。
      console.log("未解析到视频，尝试按图集解析...");
      let images;
      try {
        images = await resolveDouyinNoteImages(awemeId);
      } catch (noteError) {
        throw new Error(`${videoError.message}；按图集解析也失败：${noteError.message}`);
      }
      return downloadNoteImages(awemeId, images, outputDir);
    }
  }

  console.log(`aweme_id: ${awemeId || "-"}  video_id: ${videoId || "-"}`);
  console.log("正在下载无水印视频...");

  const response = await fetchVideoSource(playUrl, referer);
  if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  return [saveBuffer(ensureOutputDir(outputDir), `douyin_${awemeId || videoId}.mp4`, buffer)];
}

// ─── CLI 入口 ────────────────────────────────────────────────────────────────

async function main() {
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      for (const browser of activeBrowsers) browser.kill();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }

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

// 解析软链接再比较：skill 目录常是软链接，argv[1] 与 import.meta.url 的真实路径会不一致。
function realPathOrSelf(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

const entryPath = process.argv[1] ? realPathOrSelf(resolve(process.argv[1])) : "";
if (entryPath === realPathOrSelf(fileURLToPath(import.meta.url))) await main();
