import { describe, expect, it, vi } from 'vitest';

import {
  downloadImage,
  extractDouyinUrl,
  findChromeExecutable,
  parseNoteImageUrls,
  parseOfficialVideoUrl,
  resolveAwemeId,
  resolveDouyinNoteImages,
  resolveOfficialDouyinVideoUrl,
} from '../src/mcp/scripts/douyin-download.mjs';
import { missingImageNumbers, parseSavedFiles, parseWarnings } from '../src/mcp/tools/douyinDownload';

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

  it('支持官方播放器返回的 zjcdn 精确域名并保留签名参数', () => {
    const dom = '<video src="https://v3-dy-o.zjcdn.com/video/a.mp4?sign=abc&amp;expires=123"></video>';

    expect(parseOfficialVideoUrl(dom)).toBe(
      'https://v3-dy-o.zjcdn.com/video/a.mp4?sign=abc&expires=123',
    );
  });

  it.each([
    'http://v3-dy-o.zjcdn.com/video.mp4',
    'https://v3-dy-o.zjcdn.com.evil.example/video.mp4',
    'https://fake-v3-dy-o.zjcdn.com/video.mp4',
    'https://other.zjcdn.com/video.mp4',
    'https://evildouyin.com/video.mp4',
  ])('拒绝非 HTTPS 或未获准的相似域名：%s', (url) => {
    expect(() => parseOfficialVideoUrl(`<video src="${url}"></video>`)).toThrow(
      '非预期的视频域名',
    );
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

  it('播放器返回非预期域名是确定性结果，不重复加载', async () => {
    const renderDom = vi.fn().mockResolvedValue('<video src="https://sf6-cdn-tos.douyinstatic.com/obj/music"></video>');

    await expect(
      resolveOfficialDouyinVideoUrl(AWEME_ID, { chrome: '/custom/chrome', renderDom }),
    ).rejects.toThrow('非预期的视频域名');
    expect(renderDom).toHaveBeenCalledTimes(1);
  });

  it('浏览器超时等偶发故障仍重载一次', async () => {
    const renderDom = vi
      .fn()
      .mockRejectedValueOnce(new Error('Command failed: timeout'))
      .mockResolvedValueOnce('<video src="https://v26-web.douyinvod.com/ok.mp4"></video>');

    await expect(
      resolveOfficialDouyinVideoUrl(AWEME_ID, { chrome: '/custom/chrome', renderDom }),
    ).resolves.toBe('https://v26-web.douyinvod.com/ok.mp4');
    expect(renderDom).toHaveBeenCalledTimes(2);
  });

  it('图集完整链接直接取出 aweme_id，不走网络', async () => {
    await expect(resolveAwemeId(`https://www.douyin.com/note/${AWEME_ID}`)).resolves.toBe(AWEME_ID);
  });
});

function notePageDom(data: unknown): string {
  return `<html><script>window._ROUTER_DATA = ${JSON.stringify(data)}</script><div></div></html>`;
}

const pic = (name: string, ext: string) => `https://p26-sign.douyinpic.com/tos-cn-i-dy/${name}~q75.${ext}?x-signature=a%2Bb`;

describe('douyin-download 图集', () => {
  const noteData = {
    loaderData: {
      'note_(id)/page': {
        videoInfoRes: {
          item_list: [
            {
              aweme_id: AWEME_ID,
              aweme_type: 2,
              images: [
                {
                  url_list: [pic('a', 'webp'), pic('a', 'jpeg')],
                  download_url_list: ['https://p26-sign.douyinpic.com/tos-cn-i-dy/a~tplv-dy-water-v2.jpeg'],
                },
                { url_list: [pic('b', 'jpeg'), 'https://evil.example/b.jpeg', 'http://p3.douyinpic.com/b.jpeg'] },
              ],
            },
          ],
        },
      },
    },
  };

  it('按作品 ID 取 url_list，JPEG 优先，不取带水印的 download_url_list', () => {
    expect(parseNoteImageUrls(notePageDom(noteData), AWEME_ID)).toEqual([
      [pic('a', 'jpeg'), pic('a', 'webp')],
      [pic('b', 'jpeg')],
    ]);
  });

  it('页面里只有相关推荐的图集时不误下别人的作品', () => {
    expect(() => parseNoteImageUrls(notePageDom(noteData), '7000000000000000001')).toThrow('未返回该作品的数据');
  });

  it('单张图没有合法地址时保留其位置，不悄悄重新编号', () => {
    const data = {
      item: {
        aweme_id: AWEME_ID,
        images: [{ url_list: ['https://other.cdn.example/a.jpeg'] }, { url_list: [pic('b', 'jpeg')] }],
      },
    };

    expect(parseNoteImageUrls(notePageDom(data), AWEME_ID)).toEqual([[], [pic('b', 'jpeg')]]);
  });

  it('容忍 _ROUTER_DATA 赋值号两侧的空白差异', () => {
    const dom = `<script>window._ROUTER_DATA=${JSON.stringify(noteData)};</script>`;

    expect(parseNoteImageUrls(dom, AWEME_ID)).toHaveLength(2);
  });

  it('页面只有骨架数据（找不到作品）时重新渲染，而不是判成非图集', async () => {
    const skeleton = notePageDom({ loaderData: { 'note_(id)/page': { lastPath: AWEME_ID } } });
    const renderDom = vi.fn().mockResolvedValueOnce(skeleton).mockResolvedValueOnce(notePageDom(noteData));

    await expect(resolveDouyinNoteImages(AWEME_ID, { chrome: '/custom/chrome', renderDom })).resolves.toHaveLength(2);
    expect(renderDom).toHaveBeenCalledTimes(2);
  });

  it('作品存在但没有图片时判为非图集，不重复渲染', async () => {
    const videoData = { item: { aweme_id: AWEME_ID, aweme_type: 0, video: {} } };
    const renderDom = vi.fn().mockResolvedValue(notePageDom(videoData));

    await expect(resolveDouyinNoteImages(AWEME_ID, { chrome: '/custom/chrome', renderDom })).rejects.toThrow('作品可能不是图集');
    expect(renderDom).toHaveBeenCalledTimes(1);
  });

  it('页面只有相关推荐里的其他作品时重试后报错', async () => {
    const renderDom = vi.fn().mockResolvedValue(notePageDom(noteData));

    await expect(
      resolveDouyinNoteImages('7000000000000000001', { chrome: '/custom/chrome', renderDom }),
    ).rejects.toThrow('未返回该作品的数据');
    expect(renderDom).toHaveBeenCalledTimes(2);
  });

  it('图片地址全部不在抖音图床时拒绝下载', () => {
    const data = { item: { aweme_id: AWEME_ID, images: [{ url_list: ['https://evil.douyinpic.com.example/a.jpeg'] }] } };

    expect(() => parseNoteImageUrls(notePageDom(data), AWEME_ID)).toThrow('非预期的图片域名');
  });

  it('图集页数据未就绪时重新渲染一次', async () => {
    const renderDom = vi.fn().mockResolvedValueOnce('<html></html>').mockResolvedValueOnce(notePageDom(noteData));

    await expect(resolveDouyinNoteImages(AWEME_ID, { chrome: '/custom/chrome', renderDom })).resolves.toHaveLength(2);
    expect(renderDom).toHaveBeenCalledWith('/custom/chrome', `https://www.douyin.com/note/${AWEME_ID}`);
    expect(renderDom).toHaveBeenCalledTimes(2);
  });
});

describe('douyin-download 图片下载校验', () => {
  const fakeResponse = (url: string, contentType: string) => ({
    ok: true,
    status: 200,
    url,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => new TextEncoder().encode('x').buffer,
  });

  it('风控页以 200 返回 HTML 时换下一个镜像，不存成图片', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(pic('a', 'jpeg'), 'text/html; charset=utf-8'))
      .mockResolvedValueOnce(fakeResponse(pic('a', 'webp'), 'image/webp'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(downloadImage([pic('a', 'jpeg'), pic('a', 'webp')])).resolves.toMatchObject({ ext: 'webp' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('响应头到了但正文卡住时，到时限就换下一个镜像', async () => {
    const stalled = (init: RequestInit) => ({
      ...fakeResponse(pic('a', 'jpeg'), 'image/jpeg'),
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => stalled(init))
      .mockResolvedValueOnce(fakeResponse(pic('a', 'webp'), 'image/webp'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        downloadImage([pic('a', 'jpeg'), pic('a', 'webp')], { mirrorTimeoutMs: 50 }),
      ).resolves.toMatchObject({ ext: 'webp' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('重定向落到非抖音图床时拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse('https://evil.example/a.jpeg', 'image/jpeg')));
    try {
      await expect(downloadImage([pic('a', 'jpeg')])).rejects.toThrow('非预期的图片地址');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('download_douyin 输出解析', () => {
  it('取出视频与图集脚本输出中的全部文件路径', () => {
    const stdout = [
      '正在解析...',
      '✅ 已保存: /tmp/a b/douyin_1_01.jpeg (0.12 MB)',
      '✅ 已保存: /tmp/a b/douyin_1_02.webp (0.08 MB)',
      '✅ 已保存: /tmp/douyin_2.mp4 (12.30 MB)',
    ].join('\n');

    expect(parseSavedFiles(stdout)).toEqual([
      '/tmp/a b/douyin_1_01.jpeg',
      '/tmp/a b/douyin_1_02.webp',
      '/tmp/douyin_2.mp4',
    ]);
  });

  it('中途被杀时按总张数和已保存序号算出缺页', () => {
    const stdout = 'aweme_id: 1  图集: 5 张\n✅ 已保存: /tmp/douyin_1_01.jpeg (0.1 MB)\n✅ 已保存: /tmp/douyin_1_03.jpeg (0.1 MB)\n';

    expect(missingImageNumbers(stdout, parseSavedFiles(stdout))).toEqual([2, 4, 5]);
  });

  it('判断 JPEG 只看路径，查询参数里的 .jpg 不算', () => {
    const tricky = 'https://p3.douyinpic.com/tos-cn-i-dy/a~q75.webp?from=a.jpg';
    const data = { item: { aweme_id: AWEME_ID, images: [{ url_list: [tricky, pic('a', 'jpeg')] }] } };

    expect(parseNoteImageUrls(notePageDom(data), AWEME_ID)).toEqual([[pic('a', 'jpeg'), tricky]]);
  });

  it('取出图集缺页警告，转告用户', () => {
    const stdout = '✅ 已保存: /tmp/a_01.jpeg (0.1 MB)\n⚠️ 第 2 张下载失败: HTTP 403\n⚠️ 图集共 2 张，缺第 2 张\n';

    expect(parseWarnings(stdout)).toEqual(['⚠️ 第 2 张下载失败: HTTP 403', '⚠️ 图集共 2 张，缺第 2 张']);
  });
});
