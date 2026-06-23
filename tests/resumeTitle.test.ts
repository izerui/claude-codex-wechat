import { describe, expect, it } from 'vitest';
import { resumeTitleFromContent } from '../src/session/messageRouter';

describe('resumeTitleFromContent', () => {
  it('uses the user text when present', () => {
    expect(resumeTitleFromContent({ type: 'text', text: '帮我看下这段代码' })).toBe('帮我看下这段代码');
  });

  it('prefers the user text even when attachments are present', () => {
    expect(resumeTitleFromContent({
      type: 'mixed',
      text: '看看这张图',
      attachments: [{ kind: 'image', localPath: '/tmp/a.jpg' }],
    })).toBe('看看这张图');
  });

  it('falls back to an attachment-type title when an image has no text', () => {
    expect(resumeTitleFromContent({
      type: 'image',
      attachments: [{ kind: 'image', localPath: '/tmp/a.jpg' }],
    })).toBe('微信会话 · 图片');
  });

  it('falls back to an attachment-type title for video-only messages', () => {
    expect(resumeTitleFromContent({
      type: 'video',
      attachments: [{ kind: 'video', localPath: '/tmp/a.mp4' }],
    })).toBe('微信会话 · 视频');
  });

  it('does not leak the raw attachment path into the title', () => {
    const title = resumeTitleFromContent({
      type: 'image',
      attachments: [{ kind: 'image', localPath: '/var/folders/T/abc.jpg' }],
    });
    expect(title).not.toContain('/var/folders');
    expect(title).not.toContain('@');
  });
});
