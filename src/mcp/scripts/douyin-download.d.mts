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

export function resolveAwemeId(input: string): Promise<string>;
export function download(input: string, outputDir?: string): Promise<string>;
