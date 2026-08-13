import { describe, expect, it } from 'vitest';
import { resolveDaemonEntrypoint } from '../src/daemon/entrypoint';

// daemon 是常驻服务，plist/systemd 里写死的路径要能长期存活。
// 若把开发目录写进去，用户一次 `git clean` 或重建 dist 就会让服务再也起不来，
// 所以这里始终优先选择「已安装的 npm 包」路径。
describe('resolveDaemonEntrypoint', () => {
  const GLOBAL_MAC = '/opt/homebrew/lib/node_modules/claude-codex-wechat/dist/server/cli.js';

  it('keeps the current path when it already lives inside node_modules', () => {
    const resolved = resolveDaemonEntrypoint({
      currentPath: GLOBAL_MAC,
      execPath: '/opt/homebrew/Cellar/node@22/22.22.0/bin/node',
      platform: 'darwin',
      exists: () => true,
    });

    expect(resolved).toBe(GLOBAL_MAC);
  });

  it('prefers the globally installed package when running from a source checkout', () => {
    const resolved = resolveDaemonEntrypoint({
      currentPath: '/Users/dev/github/claude-codex-wechat/dist/server/cli.js',
      execPath: '/opt/homebrew/Cellar/node@22/22.22.0/bin/node',
      platform: 'darwin',
      exists: (path) => path === GLOBAL_MAC,
    });

    expect(resolved).toBe(GLOBAL_MAC);
  });

  it('falls back to the current path when no global install exists', () => {
    const current = '/Users/dev/github/claude-codex-wechat/dist/server/cli.js';
    const resolved = resolveDaemonEntrypoint({
      currentPath: current,
      execPath: '/opt/homebrew/Cellar/node@22/22.22.0/bin/node',
      platform: 'darwin',
      exists: () => false,
    });

    expect(resolved).toBe(current);
  });

  // Windows 的 npm 全局包在 <node.exe 同级>\node_modules，而不是 ../lib/node_modules。
  it('resolves the windows global npm layout', () => {
    const globalWin = 'C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\claude-codex-wechat\\dist\\server\\cli.js';
    const resolved = resolveDaemonEntrypoint({
      currentPath: 'C:\\src\\claude-codex-wechat\\dist\\server\\cli.js',
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      platform: 'win32',
      exists: (path) => path === globalWin,
      globalNodeModules: ['C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules'],
    });

    expect(resolved).toBe(globalWin);
  });

  // 开发者显式指定时必须让路，否则本地调试永远被全局包劫持。
  it('honours an explicit override', () => {
    const resolved = resolveDaemonEntrypoint({
      currentPath: '/Users/dev/github/claude-codex-wechat/dist/server/cli.js',
      execPath: '/opt/homebrew/Cellar/node@22/22.22.0/bin/node',
      platform: 'darwin',
      exists: () => true,
      override: '/custom/entry.js',
    });

    expect(resolved).toBe('/custom/entry.js');
  });
});
