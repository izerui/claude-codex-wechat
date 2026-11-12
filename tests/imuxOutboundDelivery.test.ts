import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WeixinOutboundGate } from '../src/channels/weixin-direct/outboundGate';
import { FileWeixinStateStore } from '../src/channels/weixin-direct/weixinStateStore';

describe('imux-style output delivery', () => {
  it('does not deliver an expired confirmation after the native request has ended', async () => {
    const store = new FileWeixinStateStore(join(mkdtempSync(join(tmpdir(), 'delivery-')), 'config.json'));
    const sent: string[] = [];
    let active = true;
    const gate = new WeixinOutboundGate({ store, send: async (_chat, msg) => { sent.push(msg.text); } });
    await gate.deliver('u', { kind: 'text', text: '允许修改吗？' }, () => {}, () => active);
    active = false;
    store.setContextToken('u', 'fresh');
    await gate.drain('u');
    expect(sent).toEqual([]);
    expect(store.hasPendingOutbound('u')).toBe(false);
  });

  it('preserves a result after a send failure for a later delivery attempt', async () => {
    const store = new FileWeixinStateStore(join(mkdtempSync(join(tmpdir(), 'delivery-')), 'config.json'));
    let failing = true;
    const sent: string[] = [];
    const gate = new WeixinOutboundGate({ store, send: async (chat, msg) => {
      if (failing) throw new Error('transport unavailable');
      sent.push(msg.text);
      store.recordSent(chat);
    } });
    store.setContextToken('u', 'fresh');
    expect(await gate.deliver('u', { kind: 'text', text: '结果' })).toBe(false);
    expect(store.peekOutbound('u').map((m) => m.text)).toEqual(['结果']);
    failing = false;
    await gate.drain('u');
    expect(sent).toEqual(['结果']);
  });
  it('queues only the unsent tail of a long result when one quota slot remains', async () => {
    const store = new FileWeixinStateStore(join(mkdtempSync(join(tmpdir(), 'delivery-')), 'config.json'));
    const sent: string[] = [];
    let delivered = false;
    const gate = new WeixinOutboundGate({ store, send: async (chat, msg) => { sent.push(msg.text); store.recordSent(chat); } });
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i++) store.recordSent('u');
    await gate.deliver('u', { kind: 'text', text: 'A'.repeat(4500) }, () => { delivered = true; });
    expect(sent).toEqual(['A'.repeat(4000)]);
    expect(delivered).toBe(false);
    expect(store.peekOutbound('u').map((m) => m.text)).toEqual(['A'.repeat(500)]);
    store.setContextToken('u', 'fresh');
    await gate.drain('u');
    expect(sent.join('')).toBe('A'.repeat(4500));
    expect(delivered).toBe(true);
  });
  it('同一条被微信服务端屡次拒收：第 3 次跳过并告诉用户，后面的照常发；网络错误一直保留不跳过', async () => {
    const store = new FileWeixinStateStore(join(mkdtempSync(join(tmpdir(), 'delivery-')), 'config.json'));
    const sent: string[] = [];
    const gate = new WeixinOutboundGate({ store, send: async (chat, msg) => {
      if (msg.text.startsWith('坏')) throw new Error('weixin_send_message_failed:-2:invalid content');
      if (msg.text.startsWith('断网')) throw new TypeError('fetch failed');
      sent.push(msg.text);
      store.recordSent(chat);
    } });
    store.setContextToken('u', 'ctx');
    await gate.deliver('u', { kind: 'text', text: '坏消息内容' });
    await gate.deliver('u', { kind: 'text', text: '后面的结论' });
    expect(sent).toEqual([]);
    await gate.drain('u').catch(() => undefined);
    expect(sent).toEqual(['有一条消息被微信拒收，重试 3 次后已跳过：「坏消息内容…」', '后面的结论']);

    const offline = new FileWeixinStateStore(join(mkdtempSync(join(tmpdir(), 'delivery-')), 'config.json'));
    const offlineGate = new WeixinOutboundGate({ store: offline, send: async () => { throw new TypeError('fetch failed'); } });
    offline.setContextToken('u', 'ctx');
    await offlineGate.deliver('u', { kind: 'text', text: '断网时的结论' });
    for (let i = 0; i < 5; i += 1) await offlineGate.drain('u').catch(() => undefined);
    expect(offline.peekOutbound('u').map((item) => item.text)).toEqual(['断网时的结论']);
  });

  it('uses the final quota slot immediately and retains older queued results', async () => {
    const store = new FileWeixinStateStore(join(mkdtempSync(join(tmpdir(), 'delivery-')), 'config.json'));
    const sent: string[] = [];
    const gate = new WeixinOutboundGate({ store, send: async (chat, msg) => { sent.push(msg.text); store.recordSent(chat); } });
    store.setContextToken('u', 'ctx');
    for (let i = 0; i < 9; i++) store.recordSent('u');
    await gate.deliver('u', { kind: 'text', text: '结论' });
    expect(sent).toEqual(['结论']);
    store.enqueueOutbound('u', { kind: 'text', text: '昨天的结果', enqueuedAt: Date.now() - 26 * 3600_000 });
    store.setContextToken('u', 'fresh');
    await gate.drain('u');
    expect(sent).toEqual(['结论', '昨天的结果']);
  });

  it('acknowledges prompts only after actual delivery and serializes concurrent drains', async () => {
    const store = new FileWeixinStateStore(join(mkdtempSync(join(tmpdir(), 'delivery-')), 'config.json'));
    const sent: string[] = [];
    const receipts: string[] = [];
    const gate = new WeixinOutboundGate({ store, send: async (chat, msg) => {
      await Promise.resolve();
      sent.push(msg.text);
      store.recordSent(chat);
    } });
    await gate.deliver('u', { kind: 'text', text: '确认？' }, () => receipts.push('delivered'));
    expect(receipts).toEqual([]);
    store.setContextToken('u', 'ctx');
    await Promise.all([gate.drain('u'), gate.drain('u')]);
    expect(sent).toEqual(['确认？']);
    expect(receipts).toEqual(['delivered']);
  });
});
