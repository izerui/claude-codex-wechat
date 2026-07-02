import { persistUpdateStatusToConfigFile } from './configPersistence';
import type { UpdateStatusConfig } from './config';

// 客户端版本更新检测：daemon 每小时（启动先查一次）向 registry 查最新版，
// 与当前版本比较，把结果持久化写进 config 文件。管理页与 CLI 只读 config。
// 任何网络/解析失败都静默忽略、保留上次结果，绝不打扰、绝不抛出。

const DEFAULT_REGISTRY_URL = 'https://registry.npmmirror.com/claude-codex-wechat/latest';
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 小时
const FETCH_TIMEOUT_MS = 5000;

// 解析语义化版本的数值核心（major.minor.patch），忽略预发布/构建元数据。
// 无法解析返回 null。
function parseCore(version: string): [number, number, number] | null {
  const core = version.trim().replace(/^v/, '').split(/[-+]/, 1)[0];
  const parts = core.split('.');
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return [nums[0], nums[1], nums[2]];
}

// 比较两个版本的数值核心：a>b 返回 1，相等 0，a<b 返回 -1；任一无法解析返回 null。
export function compareSemver(a: string, b: string): number | null {
  const ca = parseCore(a);
  const cb = parseCore(b);
  if (!ca || !cb) return null;
  for (let i = 0; i < 3; i += 1) {
    if (ca[i] > cb[i]) return 1;
    if (ca[i] < cb[i]) return -1;
  }
  return 0;
}

// 仅当 latest 是更高的正式版本时才算“有更新”。预发布版本（含 - 标签）一律忽略。
export function isNewerVersion(latest: string, current: string): boolean {
  if (/[-]/.test(latest.trim().replace(/^v/, ''))) return false; // 忽略预发布
  return compareSemver(latest, current) === 1;
}

export type UpdateChecker = {
  start(): Promise<void>;
  stop(): void;
  checkOnce(): Promise<void>;
};

export function createUpdateChecker(opts: {
  currentVersion: string;
  configPath: string;
  registryUrl?: string;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  persist?: (input: { configPath: string; status: UpdateStatusConfig }) => void | Promise<void>;
  now?: () => number;
}): UpdateChecker {
  const registryUrl = opts.registryUrl ?? DEFAULT_REGISTRY_URL;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const persist = opts.persist ?? persistUpdateStatusToConfigFile;
  const now = opts.now ?? (() => Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  async function checkOnce(): Promise<void> {
    try {
      const response = await fetchImpl(registryUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) return;
      const data = await response.json() as { version?: unknown };
      const latest = typeof data?.version === 'string' && data.version.trim() ? data.version.trim() : undefined;
      if (!latest) return;
      // 解析不了就当没查到，不写、不覆盖上次结果。
      if (compareSemver(latest, opts.currentVersion) === null) return;
      await Promise.resolve(persist({
        configPath: opts.configPath,
        status: {
          currentVersion: opts.currentVersion,
          latestVersion: latest,
          updateAvailable: isNewerVersion(latest, opts.currentVersion),
          lastCheckedAt: now(),
        },
      }));
    } catch {
      // 网络/超时/解析失败：静默忽略，保留上次结果。
    }
  }

  return {
    async start() {
      await checkOnce();
      timer = setInterval(() => { void checkOnce(); }, intervalMs);
      (timer as { unref?: () => void }).unref?.();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    checkOnce,
  };
}
