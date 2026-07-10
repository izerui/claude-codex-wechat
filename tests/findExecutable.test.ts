import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { findExecutable } from '../src/shared/platform';

// Windows 的可执行判定/后缀逻辑不同，这里只在 posix 下验证 PATH 注入语义。
const posix = process.platform !== 'win32';

describe.skipIf(!posix)('findExecutable 尊重传入的 PATH', () => {
  let dir: string;
  const bin = 'ccw-fake-codex';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ccw-findexec-'));
    const file = join(dir, bin);
    writeFileSync(file, '#!/bin/sh\necho ok\n');
    chmodSync(file, 0o755);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('在传入的 PATH 目录里能找到可执行文件', async () => {
    const found = await findExecutable(bin, dir);
    expect(found).toBe(join(dir, bin));
  });

  it('传入不含该目录的 PATH 时找不到（证明用的是传入值而非 process.env.PATH）', async () => {
    const found = await findExecutable(bin, '/nonexistent-dir-xyz');
    expect(found).toBeUndefined();
  });

  it('合并 PATH（终端在前，daemon 兜底）能命中兜底段里的目录', async () => {
    const merged = `/nonexistent-dir-xyz${delimiter}${dir}`;
    const found = await findExecutable(bin, merged);
    expect(found).toBe(join(dir, bin));
  });

  it('传入 undefined（无 PATH）时找不到', async () => {
    const found = await findExecutable(bin, undefined);
    expect(found).toBeUndefined();
  });
});
