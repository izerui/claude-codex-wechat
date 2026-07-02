import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

// 原子写:先写同目录下的唯一临时文件,再 rename 覆盖目标。rename 在同一文件系统上是
// 原子操作(POSIX 直接原子;Windows 经 libuv 的 MoveFileEx + REPLACE_EXISTING 也原子),
// 要么旧内容、要么完整新内容,进程被杀/断电都不会留下截断的半截文件。
// 临时文件名含 pid + 随机后缀,避免并发写者(同步或异步)互相覆盖对方的临时文件。
// 注意:本工具只保证"不产生损坏文件";多个写者 rename 到同一路径时最后一个赢(lost-update)
// 仍可能发生,那是另一层问题,不在此处理。
function tempPathFor(path: string): string {
  return join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
}

// Windows 特有:目标文件被杀毒/搜索索引器/其它句柄短暂占用时,rename 会抛 EPERM/EACCES/EBUSY。
// POSIX 无此问题(rename 覆盖已打开文件也照常成功)。仅在 Windows 上对这些错误退避重试,
// 让原子写在三大平台都可靠。
const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const MAX_RENAME_RETRIES = 10;

function isRetriableRenameError(error: unknown): boolean {
  if (process.platform !== 'win32') return false;
  const code = (error as NodeJS.ErrnoException | null)?.code ?? '';
  return RENAME_RETRY_CODES.has(code);
}

function sleepSync(ms: number): void {
  // 同步阻塞等待,不依赖任何事件循环。仅在 Windows rename 重试的失败路径上触发。
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function writeFileAtomicSync(path: string, data: string): void {
  const tmp = tempPathFor(path);
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(tmp, data, 'utf8');
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(tmp, path);
        return;
      } catch (error) {
        if (attempt >= MAX_RENAME_RETRIES || !isRetriableRenameError(error)) throw error;
        sleepSync((attempt + 1) * 10);
      }
    }
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // 临时文件可能尚未创建或已被 rename 消耗,清理失败无妨。
    }
    throw error;
  }
}

export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const tmp = tempPathFor(path);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(tmp, data, 'utf8');
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, path);
        return;
      } catch (error) {
        if (attempt >= MAX_RENAME_RETRIES || !isRetriableRenameError(error)) throw error;
        await sleep((attempt + 1) * 10);
      }
    }
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}
