import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { MessageRouter } from '../src/session/messageRouter';
import { SessionManager } from '../src/session/sessionManager';
import type { NativeProviderAdapter, ProviderEvent, UserPromptReply } from '../src/providers/types';
import type { OutboundDeliveryGate } from '../src/session/outboundGate';
import type { ChannelIncomingMessage } from '../src/channels/types';

const message = (text: string): ChannelIncomingMessage => ({
  id: text, platform: 'weixin', chatId: 'chat', user: { id: 'wx' },
  content: { type: 'text', text }, timestamp: 1,
});

function setup(script: () => AsyncIterable<ProviderEvent>, gate?: OutboundDeliveryGate) {
  const sent: string[] = [];
  const received: string[] = [];
  const channel = new MockChannelAdapter();
  channel.onSent((m) => sent.push(m.text));
  const provider: NativeProviderAdapter = {
    id: 'claude-code',
    startSession: async (input) => ({ ...input, providerId: 'claude-code', providerSessionId: 'alignment-test', status: 'idle' }),
    sendMessage: (input) => { received.push(input.text); return script(); },
    stopSession: async () => {},
  };
  const router = new MessageRouter({
    channel, providers: [provider], outboundGate: gate,
    sessions: new SessionManager({ defaultCwd: '/tmp', defaultProviderId: 'claude-code' }),
    resolveUser: () => ({ id: 'u', platform: 'weixin', platformUserId: 'wx', role: 'user', createdAt: 1 }),
  });
  return { router, sent, received, provider };
}

describe('imux mobile conversation rules', () => {
  it('does not reinterpret input as an answer to a question that arrived later', async () => {
    let ask!: () => void;
    const askNow = new Promise<void>((r) => { ask = r; });
    let end!: () => void;
    const answered = new Promise<void>((r) => { end = r; });
    let drained!: () => void;
    const drainDone = new Promise<void>((r) => { drained = r; });
    let entered!: () => void;
    const draining = new Promise<void>((r) => { entered = r; });
    let shown!: () => void;
    const promptShown = new Promise<void>((r) => { shown = r; });
    let backlog = false;
    const steered: string[] = [];
    const replies: UserPromptReply[] = [];
    const { router, provider } = setup(async function* () {
      await askNow;
      yield { type: 'user_prompt', prompt: { kind: 'plan', plan: '计划' }, respond: (reply) => { replies.push(reply); end(); } };
      await answered;
      yield { type: 'turn_end' };
    }, {
      hasPending: () => backlog,
      deliver: async (_chat, msg) => { if (msg.text.includes('计划待确认')) shown(); return true; },
      drain: async () => { entered(); await drainDone; backlog = false; },
    });
    provider.steerSession = async (_id, text) => { steered.push(text); return true; };
    const turn = router.handleMessage(message('task'));
    // Let the generation register before starting the independently blocked drain.
    await new Promise((r) => setTimeout(r, 0));
    backlog = true;
    const followUp = router.handleMessage(message('补充要求'));
    await draining;
    ask();
    await promptShown;
    drained();
    await followUp;
    expect(steered).toEqual(['补充要求']);
    expect(replies).toEqual([]);
    await router.handleMessage(message('1'));
    await turn;
  });
  it('forwards new instructions even when older output needs draining', async () => {
    let drained = false;
    const { router, received } = setup(async function* () { yield { type: 'turn_end' }; }, {
      hasPending: () => true,
      deliver: async () => {},
      drain: async () => { drained = true; },
    });
    await router.handleMessage(message('检查配置'));
    expect(drained).toBe(true);
    expect(received).toEqual(['检查配置']);
  });

  it('delivers conclusions and only changed background task lists across turns', async () => {
    const { router, sent } = setup(async function* () {
      yield { type: 'background_tasks', tasks: [{ id: 'a', description: '完整构建' }] };
      yield { type: 'text_delta', text: '构建已启动' };
      yield { type: 'turn_end' };
      yield { type: 'text_delta', text: '另一个问题的回答' };
      yield { type: 'turn_end' };
      yield { type: 'background_tasks', tasks: [] };
      yield { type: 'text_delta', text: '构建通过' };
      yield { type: 'turn_end' };
    });
    await router.handleMessage(message('构建'));
    expect(sent).toEqual(['构建已启动', '还有后台任务在运行：\n- 完整构建', '另一个问题的回答', '构建通过']);
  });

  it('does not report no-output when a turn is waiting on background work', async () => {
    const { router, sent } = setup(async function* () {
      yield { type: 'background_tasks', tasks: [{ id: 'a', description: '审查' }] };
      yield { type: 'turn_end' };
    });
    await router.handleMessage(message('审查'));
    expect(sent).toEqual(['还有后台任务在运行：\n- 审查']);
  });

  it('requires a prompt to have reached the phone before interpreting an answer', async () => {
    const replies: UserPromptReply[] = [];
    let delivered: (() => void) | undefined;
    let pending = true;
    let ready!: () => void;
    const opened = new Promise<void>((r) => { ready = r; });
    let finish!: () => void;
    const answered = new Promise<void>((r) => { finish = r; });
    const { router } = setup(async function* () {
      yield { type: 'user_prompt', prompt: { kind: 'plan', plan: '修改配置' }, respond: (reply) => { replies.push(reply); finish(); } };
      yield { type: 'text_delta', text: '已处理' };
      await answered;
      yield { type: 'turn_end' };
    }, {
      hasPending: () => pending,
      deliver: async (_chat, msg, onDelivered) => {
        if (msg.text.includes('计划待确认')) { delivered = onDelivered; ready(); return false; }
        onDelivered?.();
        return true;
      },
      drain: async () => { pending = false; delivered?.(); },
    });
    const turn = router.handleMessage(message('执行任务'));
    await opened;
    pending = true;
    await router.handleMessage(message('1'));
    expect(replies).toEqual([]);
    await router.handleMessage(message('1'));
    await turn;
    expect(replies).toEqual([{ kind: 'approve', permissionMode: 'bypassPermissions' }]);
  });

  it('does not silently omit attachments when answering a confirmation', async () => {
    const replies: UserPromptReply[] = [];
    let ready!: () => void;
    const opened = new Promise<void>((r) => { ready = r; });
    let finish!: () => void;
    const answered = new Promise<void>((r) => { finish = r; });
    const { router, sent } = setup(async function* () {
      yield { type: 'user_prompt', prompt: { kind: 'plan', plan: '修改配置' }, respond: (reply) => { replies.push(reply); finish(); } };
      ready();
      await answered;
      yield { type: 'text_delta', text: '完成' };
      yield { type: 'turn_end' };
    });
    const turn = router.handleMessage(message('执行任务'));
    await opened;
    const input = message('按这个改');
    input.content.attachments = [{ kind: 'file', localPath: '/tmp/config.json' }];
    await router.handleMessage(input);
    expect(replies).toEqual([]);
    expect(sent.at(-1)).toContain('附件');
    const before = sent.length;
    await router.handleMessage(message('1'));
    await turn;
    expect(replies).toEqual([{ kind: 'approve', permissionMode: 'bypassPermissions' }]);
    // 选了「1」不复述：之后手机上只有结论
    expect(sent.slice(before)).toEqual(['完成']);
  });
});
