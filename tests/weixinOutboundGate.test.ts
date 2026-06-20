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

  it('appends the continuation hint on the last quota slot', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i += 1) store.recordSent('u'); // remaining = 1
    await gate.deliver('u', { kind: 'text', text: '第10条' });
    expect(sent).toEqual([{ chatId: 'u', kind: 'text', text: `第10条${CONTINUATION_HINT}` }]);
  });

  it('queues when quota is exhausted', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 10; i += 1) store.recordSent('u'); // remaining = 0
    await gate.deliver('u', { kind: 'text', text: 'overflow' });
    expect(sent).toEqual([]);
    expect(store.peekOutbound('u')).toEqual([{ kind: 'text', text: 'overflow' }]);
  });

  it('queues everything once a backlog exists (ordering)', async () => {
    const { store, sent, gate } = setup();
    store.setContextToken('u', 'ctx');
    store.enqueueOutbound('u', { kind: 'text', text: 'earlier' });
    await gate.deliver('u', { kind: 'text', text: 'later' });
    expect(sent).toEqual([]);
    expect(store.peekOutbound('u')).toEqual([
      { kind: 'text', text: 'earlier' },
      { kind: 'text', text: 'later' },
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
      { kind: 'text', text: 'm11' },
      { kind: 'text', text: 'm12' },
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
