import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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

  it('sends the final quota slot immediately', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i += 1) store.recordSent('u'); // remaining = 1
    await gate.deliver('u', { kind: 'text', text: '第10条' });
    expect(sent).toEqual([{ chatId: 'u', kind: 'text', text: '第10条' }]);
  });

  it('does not add a continuation hint when no more output is queued', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i += 1) store.recordSent('u'); // remaining = 1
    await gate.deliver('u', { kind: 'text', text: '第10条' });
    // Nothing followed → the last message goes out clean, no "未发完" nudge,
    // and no intercept marker that would swallow the user's next reply.
    expect(sent).toEqual([{ chatId: 'u', kind: 'text', text: '第10条' }]);
  });

  it('queues a later result after the final slot has already been delivered', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i += 1) store.recordSent('u'); // remaining = 1
    await gate.deliver('u', { kind: 'text', text: '第10条' });
    await gate.deliver('u', { kind: 'text', text: '第11条' });
    expect(sent).toEqual([{ chatId: 'u', kind: 'text', text: '第10条' }]);
    expect(store.peekOutbound('u')).toEqual([expect.objectContaining({ kind: 'text', text: '第11条' })]);
  });

  it('queues when quota is exhausted', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 10; i += 1) store.recordSent('u'); // remaining = 0
    await gate.deliver('u', { kind: 'text', text: 'overflow' });
    expect(sent).toEqual([]);
    expect(store.peekOutbound('u')).toEqual([expect.objectContaining({ kind: 'text', text: 'overflow' })]);
  });

  it('sends older queued output before new output when quota permits', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    store.enqueueOutbound('u', { kind: 'text', text: 'earlier' });
    await gate.deliver('u', { kind: 'text', text: 'later' });
    expect(sent.map((m) => m.text)).toEqual(['earlier', 'later']);
    expect(store.peekOutbound('u')).toEqual([]);
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

});

describe('WeixinOutboundGate 配额耗尽', () => {
  it('keeps all results without adding more quota-warning messages to the queue', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 10; i += 1) store.recordSent('u'); // remaining = 0
    // 配额归零时消息被静默入队：用户既收不到回复、也不知道为什么。
    // 续发提示只挂在 remaining===1 那条上，归零后反而毫无提示。
    await gate.deliver('u', { kind: 'text', text: 'overflow' });
    // 只提示一次，不要每条都刷。
    await gate.deliver('u', { kind: 'text', text: 'overflow2' });
    expect(store.peekOutbound('u').map((m) => m.text)).toEqual(['overflow', 'overflow2']);
    expect(sent).toEqual([]);
  });
});

describe('WeixinOutboundGate.discardPending', () => {
  it('clears undelivered output when the session is abandoned', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 10; i += 1) store.recordSent('u');
    await gate.deliver('u', { kind: 'text', text: '缓冲在最后一格' });
    store.enqueueOutbound('u', { kind: 'text', text: '排队中' });

    await gate.discardPending('u');
    store.setContextToken('u', 'fresh');
    await gate.drain('u');

    expect(sent).toEqual([]);
    expect(store.hasPendingOutbound('u')).toBe(false);
  });
});

describe('WeixinOutboundGate.drain 的结果保留', () => {
  it('delivers old queued results using the refreshed sending window', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    // 内容年龄不影响结果有效性。
    store.enqueueOutbound('u', { kind: 'text', text: '两天前的旧回复', enqueuedAt: Date.now() - 26 * 60 * 60 * 1000 });
    store.enqueueOutbound('u', { kind: 'text', text: '刚排队的新回复', enqueuedAt: Date.now() });

    await gate.drain('u');

    expect(sent.map((s) => s.text)).toEqual(['两天前的旧回复', '刚排队的新回复']);
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
