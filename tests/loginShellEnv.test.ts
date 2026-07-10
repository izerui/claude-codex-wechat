import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseEnvBlock,
  captureLoginShellEnv,
  resolveLoginShellEnv,
  resetLoginShellEnvCacheForTest,
  mergeSearchPath,
  type SpawnSyncLike,
} from '../src/shared/loginShellEnv';
import { delimiter } from 'node:path';

const DELIM = '__CCW_LOGIN_ENV_DELIM_5f3a2b7c__';

function fakeRun(stdout: string, status: number | null = 0): SpawnSyncLike {
  return () => ({ status, stdout });
}

describe('parseEnvBlock', () => {
  it('解析标准 KEY=VALUE 行', () => {
    const env = parseEnvBlock('PATH=/usr/bin\nHOME=/Users/x\nSHELL=/bin/zsh');
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/Users/x');
    expect(env.SHELL).toBe('/bin/zsh');
  });

  it('把不含 KEY= 的行当作上一变量的多行值延续', () => {
    const env = parseEnvBlock('KEY=line1\ncontinued\nOTHER=v');
    expect(env.KEY).toBe('line1\ncontinued');
    expect(env.OTHER).toBe('v');
  });

  it('值里包含 = 号时只按首个 = 切分', () => {
    const env = parseEnvBlock('URL=https://x/?a=1&b=2');
    expect(env.URL).toBe('https://x/?a=1&b=2');
  });
});

describe('captureLoginShellEnv', () => {
  it('从哨兵之间提取 env 块并解析', () => {
    const stdout = `some rc banner\n${DELIM}PATH=/opt/bin\nOPENAI_API_KEY=sk-real\n${DELIM}`;
    const env = captureLoginShellEnv({ run: fakeRun(stdout), platform: 'darwin' });
    expect(env).not.toBeNull();
    expect(env?.PATH).toBe('/opt/bin');
    expect(env?.OPENAI_API_KEY).toBe('sk-real');
  });

  it('Windows 平台直接返回 null（退回继承）', () => {
    const env = captureLoginShellEnv({ run: fakeRun(`${DELIM}PATH=x\n${DELIM}`), platform: 'win32' });
    expect(env).toBeNull();
  });

  it('缺少哨兵时返回 null', () => {
    const env = captureLoginShellEnv({ run: fakeRun('PATH=/opt/bin\n'), platform: 'darwin' });
    expect(env).toBeNull();
  });

  it('捕获到但没有 PATH 视为异常，返回 null', () => {
    const env = captureLoginShellEnv({ run: fakeRun(`${DELIM}FOO=bar\n${DELIM}`), platform: 'darwin' });
    expect(env).toBeNull();
  });

  it('run 抛异常时返回 null', () => {
    const throwing: SpawnSyncLike = () => { throw new Error('spawn failed'); };
    const env = captureLoginShellEnv({ run: throwing, platform: 'darwin' });
    expect(env).toBeNull();
  });
});

describe('resolveLoginShellEnv 缓存', () => {
  beforeEach(() => resetLoginShellEnvCacheForTest());

  it('非 posix 环境下返回 null 并缓存（不抛错）', () => {
    // 这里只验证可调用且结果稳定（真实 shell 行为依赖运行环境）。
    const first = resolveLoginShellEnv();
    const second = resolveLoginShellEnv();
    expect(first).toBe(second);
  });
});

describe('mergeSearchPath', () => {
  it('两段都在时终端 PATH 在前、daemon PATH 兜底', () => {
    expect(mergeSearchPath('/a/bin', '/b/bin')).toBe(`/a/bin${delimiter}/b/bin`);
  });

  it('primary 为空时用 fallback', () => {
    expect(mergeSearchPath(undefined, '/b/bin')).toBe('/b/bin');
  });

  it('fallback 为空时用 primary', () => {
    expect(mergeSearchPath('/a/bin', undefined)).toBe('/a/bin');
  });

  it('两段都空时返回 undefined', () => {
    expect(mergeSearchPath(undefined, undefined)).toBeUndefined();
  });
});
