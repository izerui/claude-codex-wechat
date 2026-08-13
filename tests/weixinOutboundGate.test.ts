import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FileWeixinStateStore } from '../src/channels/weixin-direct/weixinStateStore';
import { CONTINUATION_HINT, WeixinOutboundGate } from '../src/channels/weixin-direct/outboundGate';

function setup() {
  const path = join(mkdtempSync(join(tmpdir(), 'wxgate-')), 'config.json');
  const store = new FileWeixinStateStore(path);
  const sent: Array<{ chatId: string; kind: string; text: string }> = [];
  const gate = new WeixinOutboundGate({
    store,
    // The real send path (adapter.sendMessage) records exactly one quota slot per
    // logical message. The fake mirrors that so the gate is the decision layer only.
    send: async (chatId, msg) => {
      sent.push({ chatId, kind: msg.kind, text: msg.text });
      store.recordSent(chatId);
    },
  });
  return { store, sent, gate };
}

describe('WeixinOutboundGate.deliver', () => {
  it('sends directly while quota is plentiful', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx'); // remaining = 10
    await gate.deliver('u', { kind: 'text', text: 'hi' });
    expect(sent).toEqual([{ chatId: 'u', kind: 'text', text: 'hi' }]);
    expect(store.getQuota('u').sentCount).toBe(1);
    expect(store.hasPendingOutbound('u')).toBe(false);
  });

  it('buffers the final quota slot instead of sending immediately', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i += 1) store.recordSent('u'); // remaining = 1
    await gate.deliver('u', { kind: 'text', text: '第10条' });
    // Held back, not sent: we can't yet tell whether more will follow.
    expect(sent).toEqual([]);
    expect(gate.shouldInterceptReply('u')).toBe(false);
  });

  it('flushes the buffered final message WITHOUT a hint when the turn ends (genuinely last)', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i += 1) store.recordSent('u'); // remaining = 1
    await gate.deliver('u', { kind: 'text', text: '第10条' });
    await gate.finalize('u');
    // Nothing followed → the last message goes out clean, no "未发完" nudge,
    // and no intercept marker that would swallow the user's next reply.
    expect(sent).toEqual([{ chatId: 'u', kind: 'text', text: '第10条' }]);
    expect(gate.shouldInterceptReply('u')).toBe(false);
  });

  it('flushes the buffered message WITH a hint once a follow-up actually arrives', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i += 1) store.recordSent('u'); // remaining = 1
    await gate.deliver('u', { kind: 'text', text: '第10条' });
    await gate.deliver('u', { kind: 'text', text: '第11条' });
    // A follow-up proves more is coming → hint rides the 10th, 11th queues.
    expect(sent).toEqual([{ chatId: 'u', kind: 'text', text: `第10条${CONTINUATION_HINT}` }]);
    expect(store.peekOutbound('u')).toEqual([expect.objectContaining({ kind: 'text', text: '第11条' })]);
    expect(gate.shouldInterceptReply('u')).toBe(true);
    expect(gate.shouldInterceptReply('u')).toBe(false);
  });

  it('queues when quota is exhausted', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 10; i += 1) store.recordSent('u'); // remaining = 0
    await gate.deliver('u', { kind: 'text', text: 'overflow' });
    expect(sent).toEqual([]);
    expect(store.peekOutbound('u')).toEqual([expect.objectContaining({ kind: 'text', text: 'overflow' })]);
  });

  it('queues everything once a backlog exists (ordering)', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    store.enqueueOutbound('u', { kind: 'text', text: 'earlier' });
    await gate.deliver('u', { kind: 'text', text: 'later' });
    expect(sent).toEqual([]);
    expect(store.peekOutbound('u')).toEqual([
      expect.objectContaining({ kind: 'text', text: 'earlier' }),
      expect.objectContaining({ kind: 'text', text: 'later' }),
    ]);
  });
});

describe('WeixinOutboundGate.drain', () => {
  it('replays up to the 10th (hinted) message, leaving the rest queued', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx'); // remaining = 10 after refresh
    for (let i = 1; i <= 12; i += 1) store.enqueueOutbound('u', { kind: 'text', text: `m${i}` });

    await gate.drain('u');

    expect(sent).toHaveLength(10);
    expect(sent.slice(0, 9).map((m) => m.text)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']);
    expect(sent[9]!.text).toBe(`m10${CONTINUATION_HINT}`);
    expect(store.peekOutbound('u')).toEqual([
      expect.objectContaining({ kind: 'text', text: 'm11' }),
      expect.objectContaining({ kind: 'text', text: 'm12' }),
    ]);
    expect(gate.shouldInterceptReply('u')).toBe(true);
  });

  it('drains a queue that fits exactly, with no hint on the final message', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 1; i <= 10; i += 1) store.enqueueOutbound('u', { kind: 'text', text: `m${i}` });

    await gate.drain('u');

    expect(sent).toHaveLength(10);
    expect(sent[9]!.text).toBe('m10'); // exactly fits → no continuation hint
    expect(store.hasPendingOutbound('u')).toBe(false);
  });

  it('does nothing when quota is exhausted', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 10; i += 1) store.recordSent('u'); // remaining = 0
    store.enqueueOutbound('u', { kind: 'text', text: 'm1' });

    await gate.drain('u');

    expect(sent).toEqual([]);
    expect(store.hasPendingOutbound('u')).toBe(true);
  });

  it('expires a stale continuation-hint intercept marker', async () => {
    vi.useFakeTimers();
    try {
      const { store, gate } = setup();
      store.setContextToken('u', 'ctx');
      for (let i = 0; i < 9; i += 1) store.recordSent('u');

      // A follow-up makes the hint (and its intercept marker) real.
      await gate.deliver('u', { kind: 'text', text: '第10条' });
      await gate.deliver('u', { kind: 'text', text: '第11条' });
      vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);

      expect(gate.shouldInterceptReply('u')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('WeixinOutboundGate.discardPending', () => {
  it('clears the queue and the buffered final message', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i += 1) store.recordSent('u'); // remaining = 1
    await gate.deliver('u', { kind: 'text', text: '缓冲在最后一格' });
    store.enqueueOutbound('u', { kind: 'text', text: '排队中' });

    await gate.discardPending('u');
    await gate.finalize('u'); // 缓冲那条也该被丢掉，不能在这里冒出来
    await gate.drain('u');

    expect(sent).toEqual([]);
    expect(store.hasPendingOutbound('u')).toBe(false);
  });
});

describe('WeixinOutboundGate.drain 的过期丢弃', () => {
  it('drops queued messages older than the push window instead of sending them', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    // 26 小时前排队的陈旧消息：早已超出微信 24h 推送窗口，发出去只会让用户困惑。
    store.enqueueOutbound('u', { kind: 'text', text: '两天前的旧回复', enqueuedAt: Date.now() - 26 * 60 * 60 * 1000 });
    store.enqueueOutbound('u', { kind: 'text', text: '刚排队的新回复', enqueuedAt: Date.now() });

    await gate.drain('u');

    expect(sent.map((s) => s.text)).toEqual(['刚排队的新回复']);
    expect(store.hasPendingOutbound('u')).toBe(false);
  });

  it('keeps sending queue items that have no timestamp (queued by an older version)', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    // 老版本入队的消息没有 enqueuedAt，无法判断新旧——不能一律丢掉，否则升级即丢消息。
    store.enqueueOutbound('u', { kind: 'text', text: '无时间戳的旧格式' });

    await gate.drain('u');

    expect(sent.map((s) => s.text)).toEqual(['无时间戳的旧格式']);
  });
});
