export function extractDouyinUrl(text: string): string | null;

export function findChromeExecutable(input?: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
}): string;

export function parseOfficialVideoUrl(dom: string): string;

export function resolveOfficialDouyinVideoUrl(
  awemeId: string,
  options?: {
    chrome?: string;
    renderDom?: (chrome: string, playerUrl: string) => Promise<string>;
  },
): Promise<string>;

export function downloadImage(
  candidates: string[],
  options?: { mirrorTimeoutMs?: number },
): Promise<{ buffer: Buffer; ext: string }>;

export function parseNoteImageUrls(dom: string, awemeId: string): string[][];

export function resolveDouyinNoteImages(
  awemeId: string,
  options?: {
    chrome?: string;
    renderDom?: (chrome: string, noteUrl: string) => Promise<string>;
  },
): Promise<string[][]>;

export function resolveAwemeId(input: string): Promise<string>;
/** 视频返回单个 mp4 路径；图集返回按顺序排列的图片路径。 */
export function download(input: string, outputDir?: string): Promise<string[]>;
