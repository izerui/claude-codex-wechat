import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDaemonServer } from '../src/daemon/server';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';

function serverWithActiveUser(prefix: string) {
  const store = createRuntimeUserStore(prefix);
  seedRuntimeUserStore(store, { platform: 'weixin', platformUserId: 'wx_user_1', role: 'user' });
  return createDaemonServer({
    wechat: { enabled: true, baseUrl: 'https://ilinkai.weixin.qq.com', token: 'secret-token', accountId: 'wx-account-1' },
    activeUserStore: store.activeUserStore,
  });
}

describe('POST /api/channel/send-media', () => {
  // 端点此前不校验文件是否存在，凭空构造的路径也会拿到 200。
  // 实际后果：Codex 编了个不存在的路径调用它，得到 200 后告诉用户「已发送」，
  // 而用户微信什么都没收到——失败被伪装成了成功。
  it('rejects a filePath that does not exist', async () => {
    const { app } = serverWithActiveUser('send-media-missing-');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/send-media',
      payload: { kind: 'video', filePath: '/definitely/not/here/ghost.mp4' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().ok).toBe(false);
    expect(String(response.json().error)).toContain('/definitely/not/here/ghost.mp4');
  });

  // 相对路径同样无法被 channel 正确解析，早点拒绝比让它半路失败清楚。
  it('rejects a relative filePath', async () => {
    const { app } = serverWithActiveUser('send-media-relative-');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/send-media',
      payload: { kind: 'video', filePath: 'relative/path.mp4' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().ok).toBe(false);
  });

  // 已有的校验不能被破坏：缺 filePath、kind 非法仍要各自报错。
  it('still rejects a missing filePath before touching the disk', async () => {
    const { app } = serverWithActiveUser('send-media-nopath-');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/send-media',
      payload: { kind: 'video' },
    });

    expect(response.statusCode).toBe(400);
    expect(String(response.json().error)).toContain('filePath');
  });

  it('still rejects an invalid kind', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'send-media-kind-'));
    const file = join(dir, 'real.mp4');
    writeFileSync(file, 'x');

    const { app } = serverWithActiveUser('send-media-kind-');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/send-media',
      payload: { kind: 'hologram', filePath: file },
    });

    expect(response.statusCode).toBe(400);
    expect(String(response.json().error)).toContain('kind');
  });
});
