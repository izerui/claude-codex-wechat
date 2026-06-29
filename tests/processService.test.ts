import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildProcessSpec,
  isProcessAlive,
  readPidFile,
  writePidFile,
  removePidFile,
} from '../src/daemon/service';

describe('windows process service (PID file model)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ccw-pid-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('buildProcessSpec', () => {
    it('生成 __daemon 启动命令与 PID/日志路径', () => {
      const spec = buildProcessSpec({
        cliEntrypointPath: '/opt/app/cli.js',
        nodePath: '/usr/bin/node',
        configPath: '/home/u/.claude-codex-wechat/config.json',
        port: 8787,
      });
      expect(spec.command).toEqual(['/usr/bin/node', '/opt/app/cli.js', '__daemon']);
      expect(spec.pidPath.endsWith('service.pid')).toBe(true);
      expect(spec.stdoutPath.endsWith(join('logs', 'service.stdout.log'))).toBe(true);
      expect(spec.stderrPath.endsWith(join('logs', 'service.stderr.log'))).toBe(true);
      expect(spec.environment.BRIDGE_CONFIG).toBe('/home/u/.claude-codex-wechat/config.json');
      expect(spec.environment.BRIDGE_PORT).toBe('8787');
    });

    it('缺省 nodePath 时回退到 process.execPath', () => {
      const spec = buildProcessSpec({ cliEntrypointPath: '/opt/app/cli.js' });
      expect(spec.command[0]).toBe(process.execPath);
    });
  });

  describe('pid 文件读写', () => {
    it('write/read 往返一致', async () => {
      const pidPath = join(dir, 'service.pid');
      await writePidFile(pidPath, 4242);
      expect(await readPidFile(pidPath)).toBe(4242);
      expect((await readFile(pidPath, 'utf8')).trim()).toBe('4242');
    });

    it('文件不存在时 readPidFile 返回 null', async () => {
      expect(await readPidFile(join(dir, 'missing.pid'))).toBeNull();
    });

    it('内容非法时 readPidFile 返回 null', async () => {
      const pidPath = join(dir, 'bad.pid');
      await writePidFile(pidPath, 1);
      await rm(pidPath, { force: true });
      // 写入非数字内容
      const { writeFile } = await import('node:fs/promises');
      await writeFile(pidPath, 'not-a-pid\n', 'utf8');
      expect(await readPidFile(pidPath)).toBeNull();
    });

    it('removePidFile 删除后再读为 null（且对不存在文件不报错）', async () => {
      const pidPath = join(dir, 'service.pid');
      await writePidFile(pidPath, 9);
      await removePidFile(pidPath);
      expect(await readPidFile(pidPath)).toBeNull();
      await expect(removePidFile(pidPath)).resolves.toBeUndefined();
    });
  });

  describe('isProcessAlive', () => {
    it('当前进程存活', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('非法 pid 视为不存活', () => {
      expect(isProcessAlive(0)).toBe(false);
      expect(isProcessAlive(-1)).toBe(false);
      expect(isProcessAlive(Number.NaN)).toBe(false);
    });

    it('极大 pid（几乎不可能存在）视为不存活', () => {
      expect(isProcessAlive(2_147_483_646)).toBe(false);
    });
  });
});
