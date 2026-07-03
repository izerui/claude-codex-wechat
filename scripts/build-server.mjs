import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// 所有 dependencies 标为 external：不打进产物，由用户安装时一并装上。
// 关键是 better-sqlite3（native）必须 external，否则 esbuild 无法内联 .node 二进制。
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
];

const sharedOptions = {
  platform: 'node',
  format: 'esm',
  target: 'node20',
  bundle: true,
  sourcemap: false,
  external,
  banner: {
    // esm 产物中部分依赖可能用到 require，注入兼容垫片。
    js: "import { createRequire as __cjsCreateRequire } from 'node:module'; const require = __cjsCreateRequire(import.meta.url);",
  },
};

await build({
  ...sharedOptions,
  entryPoints: ['src/cli.ts'],
  outdir: 'dist/server',
});

await build({
  ...sharedOptions,
  entryPoints: ['src/mcp/mediaServer.ts'],
  outdir: 'dist/mcp',
});

// Copy douyin-download script to dist
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/mcp/scripts', { recursive: true });
cpSync('src/mcp/scripts/douyin-download.mjs', 'dist/mcp/scripts/douyin-download.mjs');

console.log('server build -> dist/server/cli.js');
console.log('mcp build    -> dist/mcp/mediaServer.js');
console.log('mcp scripts  -> dist/mcp/scripts/douyin-download.mjs');
