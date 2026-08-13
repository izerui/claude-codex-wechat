import { describe, expect, it } from 'vitest';
import { nodeExecutable } from '../src/shared/platform';

// 子进程跑 .mjs 脚本时不能写裸 'node'：Windows 上要靠 PATH + PATHEXT 解析，
// nvm/volta 之类的版本管理器还可能让 PATH 里的 node 与当前进程不是同一个。
// process.execPath 是当前解释器的绝对路径，跨平台且版本一致。
describe('nodeExecutable', () => {
  it('returns the absolute path of the running interpreter', () => {
    expect(nodeExecutable()).toBe(process.execPath);
  });

  it('is an absolute path, never a bare command name', () => {
    const exe = nodeExecutable();

    expect(exe).not.toBe('node');
    expect(exe.length).toBeGreaterThan('node'.length);
  });
});
