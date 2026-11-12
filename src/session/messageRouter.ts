import type { ChannelAdapter, ChannelAttachment, ChannelIncomingMessage, ChannelOutgoingMessage } from '../channels/types';
import type { NativeProviderAdapter, ProviderId, ProviderSessionCandidate, ProviderEvent, ProviderSessionStatus, UserPrompt, UserPromptReply } from '../providers/types';
import type { ActiveWeChatUserRecord } from '../storage/userStore';
import { parseBridgeCommand, type BridgeCommand } from './commandParser';
import type { OutboundDeliveryGate } from './outboundGate';
import { buildBridgeCommandHelpMarkdown } from '../shared/bridgeCommandHelp';
import { defaultWorkspaceDir, statePath } from '../shared/platform';
import { CurrentConversationStore, type CurrentConversationBinding } from './currentConversationStore';
import { attachProviderSessionToBridge } from './providerAutoAttach';
import type { SessionManager } from './sessionManager';
import type { BridgeEventHub } from '../daemon/events';
import { buildSessionBridgeName } from './sessionBridgeTag';
import { upsertCodexSessionIndexEntry } from '../providers/codex/sessionIndex';
import { ensureClaudeSessionBridgeMetadata } from '../providers/claude-code/nativeSessions';
import { answerQuestion, decideConfirmation, PLAN_CHOOSE, promptStep, renderPrompt, renderQuestion } from './userPrompts';
import type { LastProviderSessionStore } from '../storage/lastProviderSessionStore';

export class MessageRouter {
  private static readonly SESSION_LIST_LIMIT = 8;
  private readonly providers = new Map<ProviderId, NativeProviderAdapter>();
  private readonly sessionListCache = new Map<string, { providerId: ProviderId; ids: string[] }>();
  // Single global lock: the bridge stores one current conversation, so every
  // session-mutating operation (chat generation + state-changing commands) must
  // run one at a time. /stop and read-only commands bypass this lock.
  private sessionOpChain: Promise<void> = Promise.resolve();
  // Commands run on their own chain, independent of sessionOpChain, so a hung
  // generation can never block /new, /stop, etc.
  private commandChain: Promise<void> = Promise.resolve();
  private generationSeq = 0;
  // stopped：用户 /stop 了这一轮，之后收尾时攒下的半截回复不再发出。
  // foreground：前台此刻有没有一轮在跑；background：还有没有后台任务在跑。
  private readonly activeGenerations = new Map<string, { genId: number; providerId: ProviderId; bridgeSessionId: string; abort: () => void; stopped?: boolean; foreground: boolean; background: boolean }>();
  // CLI 停下等人作答的请求，按 chatId 排队。电脑端无人值守，微信是唯一的作答入口：
  // 挂着请求时，下一条非命令消息就是对队首的回答，不进 AI、不 steer。
  // 同时到达的多个请求（例如并行的工具调用）逐个推送；一个请求里的多道题也逐题推送，答完一次性交回。
  private readonly pendingPrompts = new Map<string, PendingPrompt[]>();

  constructor(
    private readonly options: {
      channel: ChannelAdapter;
      providers: NativeProviderAdapter[];
      conversation?: CurrentConversationStore;
      sessions?: SessionManager;
      resolveUser(message: ChannelIncomingMessage): ActiveWeChatUserRecord | null;
      autoAuthorizeUser?(message: ChannelIncomingMessage): ActiveWeChatUserRecord | null;
      autoAttachSession?(message: ChannelIncomingMessage, user: ActiveWeChatUserRecord, options?: { shouldCommit: () => boolean }): Promise<CurrentConversationBinding | null>;
      lastProviderSessions?: LastProviderSessionStore;
      events?: BridgeEventHub;
      defaults?: { defaultProvider: ProviderId; defaultWorkspace: string };
      getHelpAddress?(): Promise<string | undefined>;
      outboundGate?: OutboundDeliveryGate;
      /**
       * Minimum interval between typing re-assertions (ms). Typing is event-driven
       * — refreshed as provider events arrive, throttled to this interval — so a
       * silent or wedged provider simply stops refreshing and WeChat's ~60s TTL
       * clears the indicator on its own. Default 5s.
       */
      typingKeepaliveMs?: number;
    },
  ) {
    for (const provider of options.providers) this.providers.set(provider.id, provider);
    if (!this.options.conversation) {
      const fallbackSessions = this.options.sessions;
      this.options.conversation = fallbackSessions?.store
        ? fallbackSessions.store
        : new CurrentConversationStore(statePath('claude-codex-wechat-message-router.json'), {
            defaultCwd: defaultWorkspaceDir(),
            defaultProviderId: 'claude-code',
          });
    }
  }

  private get conversation(): CurrentConversationStore {
    return this.options.conversation as CurrentConversationStore;
  }

  /**
   * Single outbound exit. With a quota gate (WeChat), messages flow through it
   * (sent now, hinted, or queued). Without a gate, sent directly.
   */
  private async sendToChat(message: ChannelOutgoingMessage, onDelivered?: () => void, isCurrent?: () => boolean): Promise<void> {
    let delivered = false;
    const receipt = () => {
      if (delivered) return;
      delivered = true;
      onDelivered?.();
    };
    if (this.options.outboundGate) {
      const result = await this.options.outboundGate.deliver(message.chatId, {
        kind: message.kind,
        text: message.text,
        ...(message.filePath ? { filePath: message.filePath } : {}),
        ...(message.fileName ? { fileName: message.fileName } : {}),
      }, receipt, isCurrent);
      if (result !== false) receipt();
    } else {
      await this.options.channel.sendMessage(message);
      receipt();
    }
  }

  private conversationSignature(): string {
    const current = this.conversation.getCurrent();
    if (!current) return '';
    return `${current.id}|${current.providerId}|${current.providerSessionId ?? ''}|${current.cwd}|${current.status}`;
  }

  // 状态变化要实时推给前端：聊天生成不走 withSessionChangeNotification 的收尾通知。
  private setConversationStatus(sessionId: string, status: ProviderSessionStatus): void {
    const current = this.conversation.getCurrent();
    if (!current || current.id !== sessionId || current.status === status) return;
    this.conversation.update({ status }, sessionId);
    this.options.events?.emit({ type: 'channel.current-session-changed' });
  }

  private async withSessionChangeNotification<T>(run: () => Promise<T>): Promise<T> {
    const before = this.conversationSignature();
    try {
      return await run();
    } finally {
      if (this.conversationSignature() !== before) {
        this.options.events?.emit({ type: 'channel.current-session-changed' });
      }
    }
  }

  async handleMessage(message: ChannelIncomingMessage): Promise<
    { status: 'accepted' } | { status: 'pairing_required'; code: string }
  > {
    try {
      return await this.withSessionChangeNotification(() => this.handleMessageInner(message));
    } catch (error) {
      // 顶层兜底：在此之前，任何未预期异常（provider 二进制缺失、startSession 抛错、
      // 会话创建失败……）都只会冒泡到一行 console.error，用户端毫无反应——分不清
      // 是「系统崩了」还是「AI 还在想」，只能一直干等。异常必须让用户看见。
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[bridge] handleMessage failed:', message.chatId, error);
      // 告知失败本身也可能失败（如微信 token 过期）；此处绝不能再抛，
      // 否则又变回静默，还会污染上层。
      await this.sendToChat({
        chatId: message.chatId,
        kind: 'status',
        text: `⚠️ 桥接层内部错误：${detail}\n可重发消息重试；若持续失败，请检查 provider 是否可用（claude-codex-wechat doctor）。`,
      }).catch(() => undefined);
      return { status: 'accepted' };
    }
  }

  private async handleMessageInner(message: ChannelIncomingMessage): Promise<
    { status: 'accepted' } | { status: 'pairing_required'; code: string }
  > {
    let user = this.options.resolveUser(message);
    if (!user) {
      user = this.options.autoAuthorizeUser?.(message) ?? null;
    }
    if (!user) {
      return { status: 'pairing_required', code: 'pairing_required' };
    }
    const composedText = composeInboundText(message.content);
    // 媒体/引用消息按普通对话处理(不解析为 bridge 命令);纯文本仍可触发命令。
    const isPlainText = message.content.type === 'text'
      && !message.content.attachments?.length
      && !message.content.quoted;
    const command = isPlainText
      ? parseBridgeCommand(message.content.text ?? '')
      : { kind: 'chat' as const, text: composedText };
    // 续发不吞新输入；尚未送达的提问不能当成用户已经看过了。
    const arrivedIn = this.conversation.getCurrent()?.id;
    const promptAtArrival = this.pendingPrompts.get(message.chatId)?.[0];
    const questionAtArrival = promptAtArrival?.index;
    const couldAnswer = promptAtArrival?.delivered === true;
    if (this.options.outboundGate?.hasPending(message.chatId)) {
      // 续发失败（网络、token 失效）不能连累命令：记下来，命令照常执行
      await this.options.outboundGate.drain(message.chatId).catch((error) => {
        console.error('[bridge] drain outbound queue failed:', message.chatId, error);
      });
    }
    if (!composedText) {
      // 语音没给转写文字：AI 听不了语音，如实告诉用户改发文字，不能让这条话悄无声息地消失
      if (message.content.unrecognizedVoice) {
        await this.sendToChat({ chatId: message.chatId, kind: 'status', text: '这条语音没有识别出文字，请改发文字。' });
      }
      return { status: 'accepted' };
    }

    // 有请求在等人作答：这条消息就是回答。命令（/stop 等）照常走命令路径。
    // 引用那条提问来回复是微信里的自然动作：答案只取用户自己写的字，引用的提问原文不算，
    // 否则「1」带着引用就对不上允许词或选项序号，同意会被当成拒绝。
    const head = this.pendingPrompts.get(message.chatId)?.[0];
    // 续发期间那条确认已经撤掉、也没有别的在等：这句话没人当答案等着，照常交给 AI，不能吞掉
    if (command.kind === 'chat' && promptAtArrival && head) {
      const ownText = message.content.text?.trim();
      if (head !== promptAtArrival || head.index !== questionAtArrival) {
        await this.sendToChat({ chatId: message.chatId, kind: 'status', text: '这条回复没有提交：它到达时要回答的问题已经换了。请看最新的问题再回复。' });
        return { status: 'accepted' };
      }
      if (!couldAnswer) {
        await this.sendToChat({ chatId: message.chatId, kind: 'status', text: '确认问题刚刚补发，请看到问题后再回复；这条消息还没有作为答案提交。' });
        return { status: 'accepted' };
      }
      if (message.content.attachments?.length || message.content.localPath) {
        await this.sendToChat({ chatId: message.chatId, kind: 'status', text: '当前正在等你确认，这条消息带有附件，尚未提交。请先用文字回答，再发送附件。' });
        return { status: 'accepted' };
      }
      // 没有自己写的字（例如只引用了那条确认）：判不出同意与否，不能默认按拒绝处理，再说明一次怎么回
      if (!ownText && head.prompt.kind !== 'question') {
        await this.sendToChat({ chatId: message.chatId, kind: 'status', text: confirmationHint(head.prompt.kind) });
        return { status: 'accepted' };
      }
      await this.answerPrompt(message.chatId, ownText || command.text);
      return { status: 'accepted' };
    }
    if (command.kind !== 'chat') {
      // 命令跑在独立的 commandChain 上，与生成链 sessionOpChain 互不依赖，
      // 所以卡住的生成永远不会阻塞 /new 等命令。/stop 和只读命令
      // 仍立即执行。setTyping 在回调内部切换（不在 runOnCommandChain 之前），
      // 避免被前一次生成 finally 里的 setTyping(false) 清掉。
      const runWithTyping = async () => {
        await this.options.channel.setTyping?.(message.chatId, true);
        try {
          await this.handleCommand(message.chatId, user, command);
        } finally {
          await this.options.channel.setTyping?.(message.chatId, false);
        }
      };
      if (isImmediateCommand(command.kind)) {
        await runWithTyping();
      } else {
        await this.runOnCommandChain(runWithTyping);
      }
      return { status: 'accepted' };
    }

    // 一刀切：消息到达那一刻是哪个会话，它就属于哪个会话（见 AGENTS.md）。
    if (await this.maybeSteer(message.chatId, command.text, arrivedIn)) {
      return { status: 'accepted' };
    }
    await this.runExclusive(async () => {
      try {
        await this.runChatGeneration(message, user, command.text, arrivedIn);
      } finally {
        // 无论正常结束、/stop、出错还是抛异常，本轮结束都回到「就绪」。provider 只在回合开始时
        // 报 running、结束时不会报 idle，所以由这里收口；仍有新生成在跑（被新消息抢占）时不动它。
        if (!this.activeGenerations.has(message.chatId)) {
          const current = this.conversation.getCurrent();
          if (current?.status === 'running') this.setConversationStatus(current.id, 'idle');
        }
      }
    });
    return { status: 'accepted' };
  }

  // 登记等人作答的请求；前面没有在等的就立即推送。
  private async openPrompt(
    chatId: string,
    genId: number,
    prompt: UserPrompt,
    respond: (reply: UserPromptReply) => void,
    id?: string,
  ): Promise<void> {
    const queue = this.pendingPrompts.get(chatId) ?? [];
    queue.push({ id, genId, prompt, index: 0, answers: {}, respond, delivered: false });
    this.pendingPrompts.set(chatId, queue);
    if (queue.length === 1) await this.pushPrompt(chatId, queue[0]!);
  }

  private async pushPrompt(chatId: string, pending: PendingPrompt): Promise<void> {
    const text = pending.index === 0 ? renderPrompt(pending.prompt) : renderQuestionOf(pending);
    pending.delivered = false;
    const questionIndex = pending.index;
    await this.sendToChat(
      { chatId, kind: 'text', text },
      () => { pending.delivered = true; },
      () => this.pendingPrompts.get(chatId)?.includes(pending) === true && pending.index === questionIndex,
    );
    // 停下等人：没人在干活，不显示「正在输入」
    await this.options.channel.setTyping?.(chatId, false);
  }

  private async answerPrompt(chatId: string, text: string): Promise<void> {
    const queue = this.pendingPrompts.get(chatId);
    const pending = queue?.[0];
    if (!queue || !pending) return;
    const { prompt } = pending;
    let reply: UserPromptReply;
    let asFeedback = false;
    if (prompt.kind === 'question') {
      const question = prompt.questions[pending.index]!;
      pending.answers[question.id] = answerQuestion(question, text);
      pending.index += 1;
      if (pending.index < prompt.questions.length) {
        await this.pushPrompt(chatId, pending);
        return;
      }
      reply = { kind: 'answers', answers: pending.answers };
    } else {
      const decision = decideConfirmation(prompt.kind, text);
      // 计划确认里回了含糊的同意：判不出选 1 还是 2，确认留着，再问一次
      if (!decision) {
        await this.sendToChat({ chatId, kind: 'status', text: PLAN_CHOOSE });
        return;
      }
      reply = decision.reply;
      asFeedback = decision.asFeedback;
    }
    queue.shift();
    if (queue.length === 0) this.pendingPrompts.delete(chatId);
    pending.respond(reply);
    // 不复述用户自己刚做的选择（选了允许、拒绝、计划选项、提问答案）；只有这句话被当成了
    // 别的用途（拒绝并转告、计划的修改意见）时说清楚——用户自己看不出来
    if (asFeedback && prompt.kind !== 'question') {
      const name = providerLabel(this.activeGenerations.get(chatId)?.providerId);
      await this.sendToChat({
        chatId,
        kind: 'status',
        text: prompt.kind === 'plan'
          ? `你这句话被当作对上面计划「${promptStep(prompt)}」的修改意见，已转给 ${name}，它会按你的意见改计划。想问别的事，请先回「1」「2」或「不执行」把计划答掉。`
          : `你这句话被当作对上面确认的回复：已拒绝「${promptStep(prompt)}」，并把你的话转给了 ${name}，它会按你的话换个做法。想问别的事，请先回「1」或「拒绝」把确认答掉。`,
      });
    }
    const next = queue[0];
    if (next) {
      await this.pushPrompt(chatId, next);
      return;
    }
    await this.options.channel.setTyping?.(chatId, true);
  }

  /** 拒掉这个 chat 挂着的全部请求（中止、换会话、这一轮已结束）；没有请求时什么都不做。 */
  private denyPrompts(chatId: string, message: string): void {
    const queue = this.pendingPrompts.get(chatId);
    if (!queue) return;
    this.pendingPrompts.delete(chatId);
    for (const pending of queue) pending.respond({ kind: 'deny', message });
  }

  /**
   * 这一轮或这次生成已结束（不是用户 /stop、换会话撤掉的）：还挂着的请求拒掉。
   * 推到过手机的要告诉用户已失效——手机上那条还在，不说的话他回过去会落空或被当成别的话。
   */
  private async denyPromptsOf(chatId: string, genId: number): Promise<void> {
    const queue = this.pendingPrompts.get(chatId);
    if (!queue?.some((pending) => pending.genId === genId)) return;
    const seen = queue.filter((pending) => pending.delivered);
    this.denyPrompts(chatId, '这一轮已结束。');
    for (const pending of seen) await this.notifyExpired(chatId, pending);
  }

  /** CLI 撤回了这个请求（不再等回答）：移出队列，推到过手机的告诉用户已失效，后面排着的接着推。 */
  private async withdrawPrompt(chatId: string, id: string): Promise<void> {
    const queue = this.pendingPrompts.get(chatId);
    const index = queue?.findIndex((pending) => pending.id === id) ?? -1;
    if (!queue || index < 0) return;
    const [removed] = queue.splice(index, 1);
    if (queue.length === 0) this.pendingPrompts.delete(chatId);
    if (removed!.delivered) await this.notifyExpired(chatId, removed!);
    if (index === 0 && queue[0]) await this.pushPrompt(chatId, queue[0]);
  }

  private async notifyExpired(chatId: string, pending: PendingPrompt): Promise<void> {
    const name = providerLabel(this.activeGenerations.get(chatId)?.providerId);
    const what = pending.prompt.kind === 'question' ? '这个问题' : '这条确认';
    await this.sendToChat({
      chatId,
      kind: 'status',
      text: `「${promptStep(pending.prompt)}」${what}已失效，不用再回了：${name} 没有等手机的回复，这一步已经过去了。之后发的话会照常交给 ${name}。`,
    });
  }

  // A chat message arriving while a turn is in flight: if the provider supports
  // native steer (Codex turn/steer), inject it into the running turn instead of
  // queueing a new turn. Otherwise fall back to the serialized lock (queue).
  private maybeSteer(chatId: string, text: string, arrivedIn: string | undefined): Promise<boolean> {
    const active = this.activeGenerations.get(chatId);
    // 一刀切：只插进消息到达时那个会话的生成
    if (!active || (arrivedIn !== undefined && active.bridgeSessionId !== arrivedIn)) return Promise.resolve(false);
    const provider = this.providers.get(active.providerId);
    if (!provider?.steerSession) return Promise.resolve(false);
    return provider.steerSession(active.bridgeSessionId, text).then((accepted) => {
      if (accepted === false) return false;
      // 插话会开出新的一轮
      active.foreground = true;
      return true;
    });
  }

  // Serialize session-mutating work onto one global chain. The chain is updated
  // synchronously (no await before the assignment) so two non-blocking channel
  // dispatches enqueue in arrival order without racing.
  private runExclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = this.sessionOpChain.then(() => run());
    this.sessionOpChain = result.then(() => undefined, () => undefined);
    return result;
  }

  // Commands serialize among themselves on a chain that is independent of the
  // generation chain, so they never wait behind a (possibly hung) generation.
  private runOnCommandChain<T>(run: () => Promise<T>): Promise<T> {
    const result = this.commandChain.then(() => run());
    this.commandChain = result.then(() => undefined, () => undefined);
    return result;
  }

  // Abandon the live generation for a chat before a command swaps/clears the
  // current session. Signalling abort makes the generation loop release
  // sessionOpChain immediately even if the provider can't be interrupted (a hung
  // CLI or a provider without interruptSession), so later chats never queue
  // forever behind it. Interrupting the provider is then best-effort cleanup.
  private async preemptActiveGeneration(chatId: string): Promise<void> {
    const active = this.activeGenerations.get(chatId);
    if (!active) return;
    this.activeGenerations.delete(chatId);
    // CLI 正停着等回答：先拒掉，它才能收尾
    this.denyPrompts(chatId, '会话已切换，这次调用作废。');
    active.abort();
    // 中断 provider 仅作尽力而为的清理，且不等待：abort 已让生成跳出循环、让出
    // 生成链，而 interruptSession 本身可能在卡死的 CLI 上挂起，绝不能让它拖住命令。
    void Promise.resolve(this.providers.get(active.providerId)?.interruptSession?.(active.bridgeSessionId)).catch(() => undefined);
  }

  // 切换/清除当前会话前,回收旧 provider 的持久子进程,防止孤儿堆积。
  // stopSession 内部是同步 close/kill,不会挂起;fire-and-forget,不阻塞命令链。
  private recycleProviderProcess(session: CurrentConversationBinding | null | undefined): void {
    if (!session) return;
    const provider = this.providers.get(session.providerId);
    void Promise.resolve(provider?.stopSession(session.id)).catch(() => undefined);
  }

  private async ensureSessionFresh(
    session: CurrentConversationBinding,
    provider: NativeProviderAdapter,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!session.providerSessionId || !provider.getNativeVersion) return { ok: true };
    const version = await provider.getNativeVersion({
      providerSessionId: session.providerSessionId,
      cwd: session.cwd,
    }).catch(() => null);
    if (!version || !session.lastSeenNativeFingerprint) return { ok: true };
    if (version.fingerprint === session.lastSeenNativeFingerprint) return { ok: true };
    // 旧版按 mtime/size 取的基线与新指纹不可比，静默重建基线，不当作另一端有进展。
    if (LEGACY_NATIVE_FINGERPRINT.test(session.lastSeenNativeFingerprint)) {
      this.conversation.update({ lastSeenNativeFingerprint: version.fingerprint }, session.id);
      return { ok: true };
    }
    // 另一端确实推进了对话：能重挂载就自动同步，不让微信端人工 /reload。
    if (provider.attachSession) {
      try {
        await this.reattachSession(session, provider);
        return { ok: true };
      } catch {
        // 自动同步失败时退回人工提示
      }
    }
    this.conversation.update({
      staleReason: 'native_advanced_elsewhere',
      lastActivityAt: Date.now(),
    }, session.id);
    return {
      ok: false,
      message: '该会话已在另一端继续，当前桥接状态已过期。请先 /reload 后再继续。',
    };
  }

  // 回收旧子进程并以 resume 方式重新挂载同一原生会话，使其加载另一端追加的最新历史。
  private async reattachSession(
    current: CurrentConversationBinding,
    provider: NativeProviderAdapter,
  ): Promise<void> {
    if (!current.providerSessionId || !provider.attachSession) return;
    this.recycleProviderProcess(current);
    const reattached = await provider.attachSession({
      candidateId: current.providerSessionId,
      bridgeSessionId: current.id,
      cwd: current.cwd,
    });
    // 不在此处抢跑取指纹:attachSession 的 resume 子进程写会话文件是异步的,
    // 此刻取到的可能是写盘前的旧状态,存下后下一条消息又会误判 stale(死循环)。
    // 改为清空基线,让下一条消息经 ensureSessionFresh 的空指纹放行,并在那一轮
    // 生成结束后由 refreshNativeFingerprint 在文件写稳后重建正确基线。
    this.conversation.update({
      providerSessionId: reattached.providerSessionId ?? current.providerSessionId,
      status: reattached.status,
      lastSeenNativeFingerprint: undefined,
      lastReloadedAt: Date.now(),
      staleReason: undefined,
      lastActivityAt: Date.now(),
    }, current.id);
  }

  private async refreshNativeFingerprint(
    session: CurrentConversationBinding,
    provider: NativeProviderAdapter,
  ): Promise<void> {
    if (!session.providerSessionId || !provider.getNativeVersion) return;
    const version = await provider.getNativeVersion({
      providerSessionId: session.providerSessionId,
      cwd: session.cwd,
    }).catch(() => null);
    if (!version) return;
    this.conversation.update({
      lastSeenNativeFingerprint: version.fingerprint,
      staleReason: undefined,
      lastActivityAt: Date.now(),
    }, session.id);
  }

  private async runChatGeneration(
    message: ChannelIncomingMessage,
    user: ActiveWeChatUserRecord,
    rawText: string,
    arrivedIn: string | undefined,
  ): Promise<void> {
    // 到达时所属的会话已被换掉：这条消息作废，不改投新会话（切换空档漏消息可以接受）。
    // 到达时还没有会话的，跟着第一个建起来的会话走。
    const switchedAway = () => arrivedIn !== undefined && this.conversation.getCurrent()?.id !== arrivedIn;
    if (switchedAway()) return;
    const sessionResumeTitle = buildSessionBridgeName({
      platform: 'weixin',
      platformUserId: message.user.id,
      chatId: message.chatId,
      summary: resumeTitleFromContent(message.content),
    });
    let session = this.conversation.getCurrent();
    if (!session) {
      // auto-attach 自身会写 current（attachProviderSessionToBridge → setCurrent）；
      // 期间 /new、/resume 已建好会话时，不能再覆盖它
      const attached = await this.options.autoAttachSession?.(message, user, { shouldCommit: () => !this.conversation.getCurrent() });
      session = this.conversation.getCurrent()
        ?? attached
        ?? this.conversation.create({
          chatId: message.chatId,
          ownerUserId: user.id,
          ...(this.options.defaults?.defaultProvider ? { providerId: this.options.defaults.defaultProvider } : {}),
          ...(this.options.defaults?.defaultWorkspace ? { cwd: this.options.defaults.defaultWorkspace } : {}),
          resumeTitle: sessionResumeTitle,
        });
    }
    const provider = this.providers.get(session.providerId);
    if (!provider) throw new Error(`provider_not_registered:${session.providerId}`);
    // 从收到消息起就显示「回复中」，首条消息拉起 provider 的那几秒也算在内。
    this.setConversationStatus(session.id, 'running');

    if (!session.providerSessionId) {
      const resumeTitle = session.resumeTitle ?? sessionResumeTitle;
      this.conversation.update({
        resumeTitle,
        lastActivityAt: Date.now(),
      }, session.id);
      const providerSession = await provider.startSession({
        bridgeSessionId: session.id,
        cwd: session.cwd,
        options: {
          sessionName: resumeTitle,
        },
      });
      const updated = this.conversation.update({
        providerSessionId: providerSession.providerSessionId,
        resumeTitle,
        status: providerSession.status,
        lastActivityAt: Date.now(),
      }, session.id) ?? session;
      if (updated.providerId === 'codex' && updated.providerSessionId && updated.resumeTitle) {
        await upsertCodexSessionIndexEntry({
          sessionId: updated.providerSessionId,
          threadName: updated.resumeTitle,
        });
      }
      await this.persistBridgeMetadata(updated);
    }

    const freshness = await this.ensureSessionFresh(this.conversation.getCurrent() ?? session, provider);
    if (!freshness.ok) {
      await this.sendToChat({ chatId: message.chatId, kind: 'status', text: freshness.message });
      return;
    }

    // 准备期间（拉起 provider 等）会话被换掉了：同样作废。登记为进行中的生成之后，
    // 换会话的命令会经 preemptActiveGeneration 主动抢占它，不再需要判断
    if (switchedAway()) return;
    const genId = ++this.generationSeq;
    let abortGeneration!: () => void;
    const aborted = new Promise<'aborted'>((resolve) => { abortGeneration = () => resolve('aborted'); });
    const entry = {
      genId,
      providerId: session.providerId,
      bridgeSessionId: session.id,
      abort: abortGeneration,
      foreground: true,
      background: false,
    };
    this.activeGenerations.set(message.chatId, entry);
    // 存活判定：没被新生成顶替、也没被换会话的命令抢占（两者都会换掉 activeGenerations 里的登记）。
    const isLive = () => this.activeGenerations.get(message.chatId)?.genId === genId;
    // 只把每一轮的结论发给用户（微信推送有配额）：助手文字先攒着，调用工具时之前的
    // 文字只是过程说明、直接作废；一轮结束（turn_end）时把攒下的一次发出。
    let bufferedText = '';
    let turnReply = '';
    const commitBuffered = () => {
      if (bufferedText.trim()) turnReply = turnReply ? `${turnReply}\n\n${bufferedText}` : bufferedText;
      bufferedText = '';
    };
    const takeReply = (): string => {
      commitBuffered();
      const reply = turnReply.trim();
      turnReply = '';
      return reply;
    };
    // /stop 到达时正在跑的那一轮：收尾前的输出都不发（已回过「已中断」），它一收尾就撤掉标记。
    // Claude 在同一次生成里还会接着跑之后插话排队的轮次，那些轮次照常发。
    const stoppedByUser = () => this.activeGenerations.get(message.chatId)?.stopped === true;
    const sendReply = async () => {
      const reply = takeReply();
      // 用户 /stop 的那一轮，中断前的半截不再发出
      if (!reply || stoppedByUser()) return;
      await this.sendToChat({ chatId: message.chatId, kind: 'text', text: reply });
      deliveredThisTurn = true;
    };
    // 当前这一轮是否向用户产出过结论或错误（提问不算：答完之后这一轮仍要有个交代）。
    // 一轮收尾时什么都没给是异常，要告知用户，否则 provider 侧任何「内容丢失」类缺陷
    // 都会表现为微信永远等不到回复、且毫无线索。turnOpen：上次 turn_end 之后是否又开了一轮。
    let deliveredThisTurn = false;
    let turnOpen = true;
    let backgroundTasks: Array<{ id: string; description?: string }> = [];
    let lastBackgroundHint = '';
    const sendBackgroundHint = async () => {
      const signature = JSON.stringify(backgroundTasks.map((task) => task.id).sort());
      if (backgroundTasks.length && signature !== lastBackgroundHint) {
        await this.sendToChat({
          chatId: message.chatId, kind: 'status',
          text: `还有后台任务在运行：\n${backgroundTasks.map((task) => `- ${taskLabel(task.description)}`).join('\n')}`,
        });
        deliveredThisTurn = true;
      }
      lastBackgroundHint = signature;
    };
    const notifyIfSilent = async () => {
      if (deliveredThisTurn || stoppedByUser()) return;
      await this.sendToChat({
        chatId: message.chatId,
        kind: 'status',
        text: '本轮已结束，没有文字回复。',
      });
    };
    // Typing is event-driven: refreshed as provider events arrive (throttled to
    // typingKeepaliveMs), never on a timer. A silent or wedged provider stops
    // emitting → we stop refreshing → WeChat's ~60s TTL clears the indicator on
    // its own. No setInterval to leak, no watchdog needed. Trade-off: a >60s gap
    // between events (e.g. one long-running tool) lets typing lapse until the
    // next event re-lights it.
    const typingMinIntervalMs = this.options.typingKeepaliveMs ?? 5_000;
    let lastTypingAt = Date.now();
    await this.options.channel.setTyping?.(message.chatId, true);
    const refreshTyping = () => {
      const now = Date.now();
      if (now - lastTypingAt < typingMinIntervalMs) return;
      lastTypingAt = now;
      void this.options.channel.setTyping?.(message.chatId, true);
    };
    let iterator: AsyncIterator<ProviderEvent> | null = null;
    try {
      // 手动驱动迭代器并与 abort 信号竞速：被抢占时即便 provider 卡死、迭代器永不
      // 返回下一个事件，也能立即跳出循环、释放 sessionOpChain，后续聊天不再永久排队。
      iterator = provider.sendMessage({ bridgeSessionId: session.id, text: rawText })[Symbol.asyncIterator]();
      while (isLive()) {
        const step = await Promise.race([iterator.next(), aborted]);
        if (step === 'aborted' || step.done) break;
        if (!isLive()) {
          // 已被抢占：这个请求没人会推给用户，直接拒掉，CLI 才不会一直等
          if (step.value.type === 'user_prompt') step.value.respond({ kind: 'deny', message: '会话已切换，这次调用作废。' });
          break;
        }
        refreshTyping(); // an event arrived → provider is alive, keep typing lit (throttled)
        const event = step.value;
        if (event.type !== 'turn_end' && event.type !== 'session_state' && event.type !== 'background_tasks') {
          turnOpen = true;
          entry.foreground = true;
        }
        if (event.type === 'background_tasks') {
          entry.background = event.tasks.length > 0;
          backgroundTasks = event.tasks;
          if (backgroundTasks.length === 0) lastBackgroundHint = '';
        }
        if (event.type === 'text_delta' && event.text) {
          this.setConversationStatus(session.id, 'running');
          bufferedText += event.text;
        }
        if (event.type === 'message_done') commitBuffered();
        if (event.type === 'tool_event') {
          bufferedText = '';
          turnReply = '';
        }
        if (event.type === 'turn_end') {
          // 前台这一轮已停：先记下，收尾（发结论、后台提醒）期间到达的 /stop 才不会被当成中断前台
          entry.foreground = false;
          // 请求只活在它所在的那一轮：还挂着（例如 CLI 取消了它）就拒掉，免得吞掉用户下一条消息
          await this.denyPromptsOf(message.chatId, genId);
          await sendReply();
          await sendBackgroundHint();
          await notifyIfSilent();
          this.setConversationStatus(session.id, 'idle');
          await this.options.channel.setTyping?.(message.chatId, false);
          const binding = this.conversation.getCurrent();
          if (binding?.id === session.id) {
            await this.persistBridgeMetadata(binding).catch(() => undefined);
            await this.refreshNativeFingerprint(binding, provider).catch(() => undefined);
          }
          const active = this.activeGenerations.get(message.chatId);
          if (active?.genId === genId) active.stopped = false;
          deliveredThisTurn = false;
          turnOpen = false;
        }
        if (event.type === 'user_prompt') {
          // 提问之前的文字同样是过程说明，不随问题发出：手机上只推问题本身
          bufferedText = '';
          turnReply = '';
          await this.openPrompt(message.chatId, genId, event.prompt, event.respond, event.id);
        }
        if (event.type === 'user_prompt_withdrawn') {
          await this.withdrawPrompt(message.chatId, event.id);
        }
        if (event.type === 'session_state') {
          const updated = this.conversation.update({
            providerSessionId: event.state.providerSessionId,
            status: event.state.status,
            lastActivityAt: Date.now(),
          }, session.id) ?? session;
          if (updated.providerId === 'codex' && updated.providerSessionId && updated.resumeTitle) {
            await upsertCodexSessionIndexEntry({
              sessionId: updated.providerSessionId,
              threadName: updated.resumeTitle,
            });
          }
          await this.persistBridgeMetadata(updated);
        }
        if (event.type === 'error' && event.error && stoppedByUser()) {
          // 被中断的那一轮以出错收尾是中断本身造成的，不再报错、不多占一条
          takeReply();
        } else if (event.type === 'error' && event.error) {
          await sendReply();
          const errorText = event.code === 'idle_timeout'
            ? '⚠️ 上一轮长时间无响应(疑似工具卡死),已自动终止并保留会话。直接重发消息即可继续。'
            : `Provider error: ${event.error}`;
          await this.sendToChat({
            chatId: message.chatId,
            kind: 'status',
            text: errorText,
          });
          deliveredThisTurn = true;
        }
      }
      // provider 没报 turn_end 就结束了（被中断、不报 turn_end 的 provider）：攒下的照样发出，
      // 最后这一轮什么都没给也要说一声；已由 turn_end 收尾的轮次不重复提示
      if (isLive()) await sendReply();
      if (isLive() && turnOpen) await notifyIfSilent();
      // The session .jsonl is only fully on disk once the turn ends. Re-persist
      // now so normalizeClaudeSessionFileForResume can rewrite the just-flushed
      // sdk-cli entrypoint records to cli; the in-turn persist (on session_state)
      // fires before those records exist, which left short one-shot sessions
      // stuck as sdk-cli and hidden from `claude -r`.
      if (isLive()) {
        const finalBinding = this.conversation.getCurrent();
        if (finalBinding?.id === session.id && finalBinding.providerSessionId) {
          await this.persistBridgeMetadata(finalBinding).catch(() => undefined);
          const refreshedBinding = this.conversation.getCurrent();
          if (refreshedBinding?.id === session.id && refreshedBinding.providerSessionId) {
            await this.refreshNativeFingerprint(refreshedBinding, provider).catch(() => undefined);
          }
        }
      }
    } finally {
      // 生成已结束（正常、出错或被抢占）：还挂着的请求没人会再等它的回答
      await this.denyPromptsOf(message.chatId, genId).catch(() => undefined);
      void iterator?.return?.().catch(() => undefined);
      // 只有当 entry 仍是本次生成时才清除并复位 typing；被抢占时新生成会自行管理，
      // 这里不能动，避免抹掉它的 entry 或清掉它的 typing。
      const stillMine = this.activeGenerations.get(message.chatId)?.genId === genId;
      if (stillMine) this.activeGenerations.delete(message.chatId);
      if (stillMine) await this.options.channel.setTyping?.(message.chatId, false);
    }
  }

  private async handleCommand(
    chatId: string,
    user: ActiveWeChatUserRecord,
    command: Exclude<ReturnType<typeof parseBridgeCommand>, { kind: 'chat' }>,
  ): Promise<void> {
    if (command.kind === 'help') {
      const helpAddress = await this.options.getHelpAddress?.();
      await this.sendToChat({
        chatId,
        kind: 'markdown',
        text: buildBridgeCommandHelpMarkdown({ publicUrl: helpAddress }),
      });
      return;
    }

    if (command.kind === 'cancel_generation') {
      const active = this.activeGenerations.get(chatId);
      if (!active) {
        await this.sendToChat({ chatId, kind: 'status', text: '当前没有正在进行的生成' });
        return;
      }
      // 前台已停、只在等后台任务：没有可中断的一轮，如实说（中断标记也不能设，否则没有一轮会结束来撤掉它，
      // 之后的回复都会被当成被中断那一轮的半截吞掉）
      if (!active.foreground) {
        await this.sendToChat({
          chatId,
          kind: 'status',
          text: active.background
            ? '前台已经停下，没有正在进行的回复；后台任务仍在运行，完成后会把结果发给你。不要它的结果可以发 /new 换会话。'
            : '当前没有正在进行的生成',
        });
        return;
      }
      const provider = this.providers.get(active.providerId);
      if (!provider?.interruptSession) {
        await this.sendToChat({ chatId, kind: 'status', text: `${active.providerId} 暂不支持中断` });
        return;
      }
      active.stopped = true;
      // CLI 正停着等回答：先拒掉，中断才能生效
      this.denyPrompts(chatId, '用户在微信上中止了这一轮。');
      await provider.interruptSession(active.bridgeSessionId);
      await this.sendToChat({ chatId, kind: 'status', text: '已中断当前生成，会话保留' });
      return;
    }

    if (command.kind === 'reload_session') {
      const current = this.conversation.getCurrent();
      if (!current) {
        await this.sendToChat({ chatId, kind: 'status', text: 'No active session' });
        return;
      }
      if (!current.providerSessionId) {
        await this.sendToChat({ chatId, kind: 'status', text: '当前会话还没有原生 provider 会话可重载' });
        return;
      }
      const provider = this.providers.get(current.providerId);
      if (!provider?.attachSession) {
        await this.sendToChat({ chatId, kind: 'status', text: `当前 provider（${current.providerId}）不支持会话重载` });
        return;
      }

      await this.preemptActiveGeneration(chatId);
      await this.reattachSession(current, provider);
      await this.sendToChat({ chatId, kind: 'status', text: '已重新加载当前会话，可继续对话。' });
      return;
    }

    if (command.kind === 'new_session') {
      const previousSession = this.conversation.getCurrent();
      await this.preemptActiveGeneration(chatId);
      this.recycleProviderProcess(previousSession);
      const providerId = command.providerId
        ?? previousSession?.providerId
        ?? this.options.defaults?.defaultProvider
        ?? 'claude-code';
      const cwd = command.cwd
        ?? previousSession?.cwd
        ?? this.options.defaults?.defaultWorkspace
        ?? defaultWorkspaceDir();
      const session = this.conversation.create({
        chatId,
        ownerUserId: user.id,
        providerId,
        cwd,
      });
      // 换会话即翻篇：旧会话没发出去的排队回复不该串进新会话。
      await Promise.resolve(this.options.outboundGate?.discardPending?.(chatId)).catch(() => undefined);
      await this.sendToChat({
        chatId,
        kind: 'status',
        text: `Started new ${providerId} session: ${session.id}`,
      });
      return;
    }

    if (command.kind === 'status') {
      const session = this.conversation.getCurrent();
      await this.sendToChat({
        chatId,
        kind: 'status',
        text: session
          ? `Active session ${session.id} · ${session.providerId} · ${session.cwd} · ${session.status}`
          : 'No active session',
      });
      return;
    }

    if (command.kind === 'list_sessions') {
      const current = this.conversation.getCurrent();
      const providerId = current?.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
      const provider = this.providers.get(providerId);
      if (!provider?.listRecoverableSessions) {
        await this.sendToChat({ chatId, kind: 'status', text: `当前 provider（${providerId}）不支持会话列表` });
        return;
      }
      // 列出所有可恢复会话（包括当前激活的），当前激活的会话用「（当前会话）」标记
      let candidates = await provider.listRecoverableSessions();
      if (command.keyword) {
        const keyword = command.keyword.toLowerCase();
        candidates = candidates.filter((candidate) =>
          (candidate.resumeTitle ?? candidate.title ?? '').toLowerCase().includes(keyword)
          || (candidate.cwd ?? '').toLowerCase().includes(keyword),
        );
      }
      candidates.sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
      const totalPages = Math.max(1, Math.ceil(candidates.length / MessageRouter.SESSION_LIST_LIMIT));
      const page = Math.min(command.page, totalPages);
      const start = (page - 1) * MessageRouter.SESSION_LIST_LIMIT;
      const shown = candidates.slice(start, start + MessageRouter.SESSION_LIST_LIMIT);
      if (shown.length === 0) {
        await this.sendToChat({ chatId, kind: 'status', text: '没有可恢复的会话' });
        return;
      }
      this.sessionListCache.set(chatId, { providerId, ids: shown.map((candidate) => candidate.id) });
      const activeProviderSessionId = current?.providerId === providerId ? current.providerSessionId : undefined;
      const lines = [`**可恢复会话（${providerId}）**`, `第 ${page}/${totalPages} 页`, ''];
      shown.forEach((candidate, index) => {
        const isActive = activeProviderSessionId && candidate.id === activeProviderSessionId;
        const marker = isActive ? '（当前会话）' : '';
        lines.push(`${index + 1}. ${this.formatSessionLine(candidate)}${marker}`);
      });
      if (page < totalPages) {
        const nextPageCommand = command.keyword ? `/sessions ${command.keyword} p${page + 1}` : `/sessions p${page + 1}`;
        lines.push('', `回复 \`${nextPageCommand}\` 查看下一页`);
      } else if (candidates.length > shown.length) {
        lines.push('', `（还有 ${candidates.length - shown.length} 条，用 \`/sessions <关键词>\` 筛选）`);
      }
      lines.push('', '回复 `/resume <编号>` 恢复');
      await this.sendToChat({ chatId, kind: 'markdown', text: lines.join('\n') });
      return;
    }

    if (command.kind === 'resume_session') {
      const ref = command.ref.trim();
      if (!ref) {
        await this.sendToChat({ chatId, kind: 'status', text: '用法：/resume <编号>' });
        return;
      }
      const previousSession = this.conversation.getCurrent();
      let providerId = previousSession?.providerId ?? this.options.defaults?.defaultProvider ?? 'claude-code';
      // 纯数字按最近一次 /sessions 列表的编号解析：用缓存翻译成真实会话 id，
      // 并沿用列表当时的 provider（列表与恢复之间 current 可能已变）。
      let resolvedId = ref;
      if (/^\d+$/.test(ref)) {
        const cached = this.sessionListCache.get(chatId);
        if (!cached) {
          await this.sendToChat({ chatId, kind: 'status', text: '请先用 /sessions 列出会话，再用 /resume <编号> 恢复' });
          return;
        }
        const target = cached.ids[Number(ref) - 1];
        if (!target) {
          await this.sendToChat({ chatId, kind: 'status', text: `编号 ${ref} 超出范围，请用 /sessions 重新列出` });
          return;
        }
        resolvedId = target;
        providerId = cached.providerId;
      }
      const previousCwd = previousSession?.cwd;
      const provider = this.providers.get(providerId);
      if (!provider?.attachSession || !provider.listRecoverableSessions) {
        await this.sendToChat({ chatId, kind: 'status', text: `当前 provider（${providerId}）不支持会话恢复` });
        return;
      }
      const candidate = (await provider.listRecoverableSessions()).find((item) => item.id === resolvedId);
      if (!candidate) {
        await this.sendToChat({ chatId, kind: 'status', text: `找不到会话 ${ref}` });
        return;
      }
      // 校验都通过、确定要换会话了才打断当前这一轮：编号输错不该把挂着的确认当成拒绝
      await this.preemptActiveGeneration(chatId);
      this.recycleProviderProcess(previousSession);
      const cwdUnresolved = !candidate.cwd;
      const attached = await attachProviderSessionToBridge({
        conversationStore: this.conversation,
        lastProviderSessions: this.options.lastProviderSessions,
        provider,
        user,
        providerId,
        providerSessionId: resolvedId,
        chatId,
        cwd: candidate.cwd ?? this.options.defaults?.defaultWorkspace ?? defaultWorkspaceDir(),
        recoverySource: 'manual_attach',
        resumeTitle: candidate.resumeTitle,
      });
      await this.options.outboundGate?.discardPending?.(chatId);
      const head = `已恢复会话 ${attached.id} · ${attached.providerId}`;
      const text = cwdUnresolved
        ? `${head}\n⚠️ 无法确定该会话的原始目录，已使用默认目录 ${attached.cwd}，如需切换请用 /new <目录> 开新会话`
        : previousCwd && previousCwd !== attached.cwd
          ? `${head}\n已切换工作目录到 ${attached.cwd}`
          : `${head} · ${attached.cwd}`;
      await this.sendToChat({ chatId, kind: 'status', text });
      return;
    }

  }
  private formatSessionLine(candidate: ProviderSessionCandidate): string {
    const title = candidate.resumeTitle ?? candidate.title ?? `未命名会话 · ${candidate.id.slice(0, 8)}`;
    const cwd = candidate.cwd ? ` · ${candidate.cwd}` : '';
    const when = candidate.lastActivityAt ? ` · ${formatRelativeTime(candidate.lastActivityAt)}` : '';
    return `${title}${cwd}${when}`;
  }

  private async persistBridgeMetadata(session: CurrentConversationBinding): Promise<void> {
    if (!session.providerSessionId || !session.resumeTitle) return;
    this.options.lastProviderSessions?.set(session.providerId, {
      providerSessionId: session.providerSessionId,
      cwd: session.cwd,
    });
    if (session.providerId === 'codex') {
      await upsertCodexSessionIndexEntry({
        sessionId: session.providerSessionId,
        threadName: session.resumeTitle,
      });
      return;
    }
    if (session.providerId === 'claude-code') {
      await ensureClaudeSessionBridgeMetadata({
        sessionId: session.providerSessionId,
        resumeTitle: session.resumeTitle,
        cwd: session.cwd,
      });
    }
  }
}

type PendingPrompt = {
  /** provider 给的请求 id，CLI 撤回时据此找到它。 */
  id?: string;
  delivered: boolean;
  genId: number;
  prompt: UserPrompt;
  /** 提问推到第几题（从 0 起）。 */
  index: number;
  answers: Record<string, string>;
  respond: (reply: UserPromptReply) => void;
};

/** 后台任务的说明只取第一行、截短：Codex 会拿子代理的整段指令当说明。 */
function taskLabel(description: string | undefined): string {
  const line = description?.split('\n').map((part) => part.trim()).find(Boolean);
  if (!line) return '后台任务';
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

function providerLabel(providerId: ProviderId | undefined): string {
  return providerId === 'codex' ? 'Codex' : 'Claude';
}

function confirmationHint(kind: 'plan' | 'permission'): string {
  return kind === 'plan'
    ? `还在等你确认计划：${PLAN_CHOOSE}`
    : '还在等你确认权限：回复 1 允许，回复 2 拒绝，或直接用文字说你的意见。';
}

function renderQuestionOf(pending: PendingPrompt): string {
  return pending.prompt.kind === 'question' ? renderQuestion(pending.prompt.questions, pending.index) : renderPrompt(pending.prompt);
}

// 0.1.59 及之前的原生指纹格式：<provider>:<sessionId>:<mtimeMs>:<size>
const LEGACY_NATIVE_FINGERPRINT = /^(claude|codex):[^:]+:\d+:\d+$/;

function summarizeResumeTitle(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > 32 ? `${normalized.slice(0, 32).trimEnd()}…` : normalized;
}

// Title for the session as shown in Claude's native resume list. Prefer the
// user's own words; for attachment-only messages fall back to a clean type
// label (e.g. 微信会话 · 图片) instead of leaking the raw `@/path` placeholder
// that composeInboundText would otherwise produce.
export function resumeTitleFromContent(content: ChannelIncomingMessage['content']): string {
  const fromText = summarizeResumeTitle(content.text ?? '');
  if (fromText) return fromText;
  const kinds = new Set((content.attachments ?? []).map((att) => att.kind));
  const labels: string[] = [];
  if (kinds.has('image')) labels.push('图片');
  if (kinds.has('video')) labels.push('视频');
  if (kinds.has('file')) labels.push('文件');
  if (labels.length) return `微信会话 · ${labels.join('、')}`;
  if (content.quoted) return '微信会话 · 引用';
  return '微信会话';
}

// Commands that may run while a generation is in flight: /stop must (to
// interrupt it), and read-only commands are safe. Everything else mutates the
// single current conversation and is serialized behind the active generation.
function isImmediateCommand(kind: BridgeCommand['kind']): boolean {
  return kind === 'cancel_generation'
    || kind === 'help'
    || kind === 'status'
    || kind === 'list_sessions';
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}个月前`;
}

/** Format one attachment for the prompt: `[图片] name @/abs/path` or a failure note. */
function formatAttachment(att: ChannelAttachment): string {
  const label = att.kind === 'image' ? '图片' : att.kind === 'video' ? '视频' : '文件';
  const name = att.fileName ? `${att.fileName} ` : '';
  if (att.failed) return `[${label}] ${name}[下载失败${att.failReason ? `:${att.failReason}` : ''}]`;
  if (att.localPath) return `[${label}] ${name}@${att.localPath}`;
  return `[${label}] ${name}[无法获取]`;
}

/**
 * Compose the prompt text sent to the provider from an inbound message:
 * original text + each media attachment as `@/abs/path` + a quoted block.
 * Returns '' when there is nothing actionable.
 */
export function composeInboundText(content: ChannelIncomingMessage['content']): string {
  const parts: string[] = [];
  if (content.text) parts.push(content.text);
  for (const att of content.attachments ?? []) parts.push(formatAttachment(att));
  if (content.quoted) {
    const quotedParts: string[] = [];
    if (content.quoted.text) quotedParts.push(content.quoted.text);
    for (const att of content.quoted.attachments ?? []) quotedParts.push(formatAttachment(att));
    if (quotedParts.length) parts.push(`[引用] ${quotedParts.join(' ')}`);
  }
  return parts.join('\n');
}
