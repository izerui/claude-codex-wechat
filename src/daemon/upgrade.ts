import { isNewerVersion } from './updateChecker';

// `claude-codex-wechat upgrade` 的核心流程。副作用（查 registry、跑 npm、重启服务）
// 全部通过依赖注入传入，便于测试时不真的动全局包。

export const UPGRADE_REGISTRY_URL = 'https://registry.npmmirror.com/';
const LATEST_MANIFEST_PATH = 'claude-codex-wechat/latest';
const FETCH_TIMEOUT_MS = 5000;

export type InstallResult = { ok: true } | { ok: false; message: string };

export type UpgradeOutcome =
  | { outcome: 'upgraded'; from: string; to: string }
  | { outcome: 'already-latest'; from: string; to: string }
  | { outcome: 'install-failed'; from: string; to: string; message: string }
  | { outcome: 'check-failed'; from: string; message: string };

export type UpgradeDeps = {
  currentVersion: string;
  install: () => Promise<InstallResult>;
  restart: () => Promise<void>;
  log: (message: string) => void;
  force?: boolean;
  fetchImpl?: typeof fetch;
  registryUrl?: string;
};

async function resolveLatestVersion(input: {
  fetchImpl: typeof fetch;
  registryUrl: string;
}): Promise<string> {
  const url = new URL(LATEST_MANIFEST_PATH, input.registryUrl).toString();
  const response = await input.fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`registry_responded_${response.status}`);
  const data = await response.json() as { version?: unknown };
  const version = typeof data?.version === 'string' ? data.version.trim() : '';
  if (!version) throw new Error('registry_missing_version');
  return version;
}

export async function performUpgrade(deps: UpgradeDeps): Promise<UpgradeOutcome> {
  const { currentVersion, force = false } = deps;
  const registryUrl = deps.registryUrl ?? UPGRADE_REGISTRY_URL;
  const fetchImpl = deps.fetchImpl ?? fetch;

  deps.log(`· 当前版本 ${currentVersion}`);

  let latest: string;
  try {
    latest = await resolveLatestVersion({ fetchImpl, registryUrl });
  } catch (err) {
    // 查不到最新版就什么都不做——宁可不升级，也不要盲目重装并重启服务。
    return {
      outcome: 'check-failed',
      from: currentVersion,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  deps.log(`· 最新版本 ${latest}`);

  if (!force && !isNewerVersion(latest, currentVersion)) {
    return { outcome: 'already-latest', from: currentVersion, to: latest };
  }

  deps.log('· 正在更新 …');
  const installed = await deps.install();
  if (!installed.ok) {
    return { outcome: 'install-failed', from: currentVersion, to: latest, message: installed.message };
  }

  // 只有装成功才重启：装失败时旧进程还能继续服务，比重启进一个坏状态好。
  deps.log('· 重启服务 …（微信桥接会短暂中断）');
  await deps.restart();

  return { outcome: 'upgraded', from: currentVersion, to: latest };
}
