import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 读取本客户端(claude-codex-wechat)的当前版本号,来自打包进包的 package.json。
// dist/shared/version.js 与 src/shared/version.ts 到 package.json 的相对路径一致(../../)。
// 读取失败回退 '0.0.0'(不影响主流程,仅让更新检测退化为“查不到当前版本”)。
export function readClientVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
