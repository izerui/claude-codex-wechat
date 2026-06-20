import { describe, expect, it } from 'vitest';
import { composeInboundText } from '../src/session/messageRouter';

describe('composeInboundText', () => {
  it('returns plain text unchanged', () => {
    expect(composeInboundText({ type: 'text', text: 'hello' })).toBe('hello');
  });

  it('renders an image attachment as @path', () => {
    expect(composeInboundText({ type: 'image', attachments: [{ kind: 'image', localPath: '/m/a.png' }] }))
      .toBe('[图片] @/m/a.png');
  });

  it('combines text with multiple attachments, one per line', () => {
    const out = composeInboundText({
      type: 'mixed',
      text: '看这些',
      attachments: [
        { kind: 'image', localPath: '/a.png' },
        { kind: 'file', localPath: '/r.pdf', fileName: 'report.pdf' },
        { kind: 'video', localPath: '/c.mp4', fileName: 'clip.mp4' },
      ],
    });
    expect(out).toBe('看这些\n[图片] @/a.png\n[文件] report.pdf @/r.pdf\n[视频] clip.mp4 @/c.mp4');
  });

  it('downgrades a failed attachment instead of an @path', () => {
    expect(composeInboundText({ type: 'video', attachments: [{ kind: 'video', failed: true, failReason: 'too_large' }] }))
      .toBe('[视频] [下载失败:too_large]');
  });

  it('renders a quoted block with text and media', () => {
    const out = composeInboundText({
      type: 'text',
      text: '这个怎么改',
      quoted: { text: '原始内容', attachments: [{ kind: 'image', localPath: '/q.png' }] },
    });
    expect(out).toBe('这个怎么改\n[引用] 原始内容 [图片] @/q.png');
  });

  it('returns empty string when there is nothing actionable', () => {
    expect(composeInboundText({ type: 'text' })).toBe('');
  });
});
