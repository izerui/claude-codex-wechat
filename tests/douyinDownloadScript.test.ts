import { describe, expect, it, vi } from 'vitest';

import {
  extractDouyinUrl,
  findChromeExecutable,
  parseOfficialVideoUrl,
  resolveOfficialDouyinVideoUrl,
} from '../src/mcp/scripts/douyin-download.mjs';

const AWEME_ID = '7654449534534289522';

describe('douyin-download 官方播放器回退', () => {
  it('保留从整段分享文案提取短链的能力', () => {
    expect(extractDouyinUrl(`复制打开抖音 https://v.douyin.com/abc123/ 看视频`)).toBe(
      'https://v.douyin.com/abc123/',
    );
  });

  it('从播放器 video 标签提取并解码 CDN 地址', () => {
    const dom = '<html><video src="//v26-web.douyinvod.com/video/a.mp4?x=1&amp;y=2"></video></html>';

    expect(parseOfficialVideoUrl(dom)).toBe('https://v26-web.douyinvod.com/video/a.mp4?x=1&y=2');
  });

  it('拒绝非抖音 CDN，避免把下载脚本变成任意 URL 拉取器', () => {
    expect(() => parseOfficialVideoUrl('<video src="https://evil.example/a.mp4"></video>')).toThrow(
      '非预期的视频域名',
    );
  });

  it('优先使用显式配置的 Chrome 路径', () => {
    const exists = vi.fn((path: string) => path === '/custom/chrome');

    expect(
      findChromeExecutable({
        platform: 'linux',
        env: { DOUYIN_CHROME_EXECUTABLE: '/custom/chrome' },
        exists,
      }),
    ).toBe('/custom/chrome');
  });

  it('macOS 自动发现系统 Chrome', () => {
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    expect(findChromeExecutable({ platform: 'darwin', env: {}, exists: (path: string) => path === chrome })).toBe(chrome);
  });

  it('首次播放器数据未就绪时重新加载一次', async () => {
    const renderDom = vi
      .fn()
      .mockResolvedValueOnce('<html></html>')
      .mockResolvedValueOnce('<video src="https://v26-web.douyinvod.com/retry.mp4"></video>');

    await expect(
      resolveOfficialDouyinVideoUrl(AWEME_ID, { chrome: '/custom/chrome', renderDom }),
    ).resolves.toBe('https://v26-web.douyinvod.com/retry.mp4');
    expect(renderDom).toHaveBeenCalledTimes(2);
  });

  it('没有可用浏览器时返回可操作的配置提示', async () => {
    await expect(resolveOfficialDouyinVideoUrl(AWEME_ID, { chrome: '' })).rejects.toThrow(
      'DOUYIN_CHROME_EXECUTABLE',
    );
  });
});
