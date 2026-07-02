import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

// 原子写:先写同目录下的唯一临时文件并 fsync 落盘,再 rename 覆盖目标。
// - rename 在同一文件系统上是原子操作(POSIX 直接原子;Windows 经 libuv 的 MoveFileEx +
//   REPLACE_EXISTING 也原子),要么旧内容、要么完整新内容,不会留下截断的半截文件。
// - fsync 保证 rename 之前临时文件的数据块已真正落盘,否则真断电/内核 panic 下 rename 的
//   元数据可能先于数据持久化,恢复后目标指向空/旧内容。仅 tmp+rename 只能防"进程被杀"
//   (page cache 仍在),加 fsync 才能防断电。
// - 临时文件以 0o600 创建:config.json 含 relay token / 微信凭据,rename 覆盖会让目标继承
//   tmp 的权限位,用 0o600 避免把原本受保护的配置放宽为组/其他可读。
// - 临时文件名含 pid + 随机后缀,避免并发写者(同步或异步)互相覆盖对方的临时文件。
// 注意:本工具只保证"单次写不产生损坏文件";多个写者 rename 到同一路径时最后一个赢
// (lost-update)仍可能发生,那是调用层的并发合并问题,不在此处理。
const FILE_MODE = 0o600;

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
    const fd = openSync(tmp, 'w', FILE_MODE);
    try {
      writeSync(fd, data, null, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
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
    const handle = await open(tmp, 'w', FILE_MODE);
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
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

// 清理同目录下针对 targetPath 的陈旧临时文件。进程若在 write→rename 窗口被 SIGKILL/断电,
// catch 分支来不及执行,会残留 `.<name>.<pid>.<hex>.tmp`。启动时调用一次即可回收孤儿文件。
// 只删早于 maxAgeMs 的,避免误删其它进程正在写的临时文件。
export async function cleanupStaleTempFiles(targetPath: string, maxAgeMs = 3_600_000): Promise<void> {
  const dir = dirname(targetPath);
  const prefix = `.${basename(targetPath)}.`;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const now = Date.now();
  await Promise.all(entries.map(async (name) => {
    if (!name.startsWith(prefix) || !name.endsWith('.tmp')) return;
    const full = join(dir, name);
    try {
      const info = await stat(full);
      if (now - info.mtimeMs >= maxAgeMs) await unlink(full);
    } catch {
      // 文件可能已被其它进程删除或无权访问,忽略。
    }
  }));
}
