import type { PromptQuestion, ProviderEvent, ProviderSession } from '../types';
import { CodexAppServerClient } from './codexAppServerClient';
import { syncCodexThreadForResume } from './nativeThreads';
import { buildCodexBridgeInstructions } from './bridgeDeveloperInstructions';

type StoredSession = ProviderSession & {
  threadId?: string;
  client?: CodexAppServerClient;
  pendingEvents: ProviderEvent[];
  activeMessage?: { itemId: string; text: string };
  activeTurnId?: string;
  sessionName?: string;
  turnClosed: boolean;
  /** 还没作答的 requestUserInput 数。等人期间 app-server 本来就没有输出，不算卡死。 */
  awaitingUser: number;
  /** 最近一次作答的时刻：卡死判定从这一刻重新起算。 */
  answeredAt: number;
  backgroundTasks: Map<string, { id: string; description?: string }>;
  observingBackground: boolean;
  /** 主会话停着时有后台子任务结束：Codex 会为它再开一轮，要等那一轮的结论。 */
  completionPending: boolean;
  closed: boolean;
  emittedItemIds: Set<string>;
  acceptingInput: boolean;
  eventResolver?: () => void;
  turnCompletedResolver?: () => void;
  turnCompletedPromise?: Promise<void>;
};

const IDLE_SENTINEL = Symbol('idle_timeout');

// 到点时问 extraWait() 还要再等多久（毫秒，0 即判卡死）：正停着等人作答时整段重计，
// 刚作答过则从作答那一刻起算。
function withIdleTimeout<T>(promise: Promise<T>, ms: number, extraWait: () => number = () => 0): Promise<T | typeof IDLE_SENTINEL> {
  if (!ms || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const arm = (wait: number) => {
      timer = setTimeout(() => {
        if (settled) return;
        const more = extraWait();
        if (more > 0) {
          arm(more);
          return;
        }
        settled = true;
        resolve(IDLE_SENTINEL);
      }, wait);
      (timer as { unref?: () => void }).unref?.();
    };
    arm(ms);
    void promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function readAgentMessageItemId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.itemId === 'string' && record.itemId) return record.itemId;
  if (typeof record.id === 'string' && record.id) return record.id;
  if (record.item && typeof record.item === 'object') {
    const item = record.item as Record<string, unknown>;
    if (typeof item.id === 'string' && item.id) return item.id;
    if (typeof item.itemId === 'string' && item.itemId) return item.itemId;
  }
  return undefined;
}

function readThreadId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.threadId === 'string' && record.threadId) return record.threadId;
  if (typeof record.id === 'string' && record.id) return record.id;
  if (record.thread && typeof record.thread === 'object') {
    const thread = record.thread as Record<string, unknown>;
    if (typeof thread.threadId === 'string' && thread.threadId) return thread.threadId;
    if (typeof thread.id === 'string' && thread.id) return thread.id;
  }
  return undefined;
}

function readTurnId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.turn && typeof record.turn === 'object') {
    const turn = record.turn as Record<string, unknown>;
    if (typeof turn.id === 'string' && turn.id) return turn.id;
    if (typeof turn.turnId === 'string' && turn.turnId) return turn.turnId;
  }
  if (typeof record.turnId === 'string' && record.turnId) return record.turnId;
  return undefined;
}

// 从 turn/completed 的 turn.items 里取出这一轮的结论（非流式回合的唯一来源）。
// 与流式路径同一条规则：工具调用之前的文字与 commentary 都是过程说明，只留最后一次工具调用之后的。
function readTurnConclusion(value: unknown, emittedIds: Set<string> = new Set()): string[] {
  if (!value || typeof value !== 'object') return [];
  const turn = (value as Record<string, unknown>).turn;
  if (!turn || typeof turn !== 'object') return [];
  const items = (turn as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  let texts: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.type !== 'string') continue;
    if (record.type !== 'agentMessage') {
      if (!NON_TOOL_ITEMS.has(record.type)) texts = [];
      continue;
    }
    if (record.phase === 'commentary') continue;
    if (typeof record.id === 'string' && emittedIds.has(record.id)) continue;
    if (typeof record.text === 'string' && record.text.trim()) texts.push(record.text);
  }
  return texts;
}

/** 不是工具调用的条目；其余一律当工具调用。 */
const NON_TOOL_ITEMS = new Set(['agentMessage', 'userMessage', 'reasoning', 'plan', 'hookPrompt', 'contextCompaction']);

// requestUserInput 的题目：没有选项（options 为 null）的题直接作答。
function readUserInputQuestions(value: unknown): PromptQuestion[] {
  if (!value || typeof value !== 'object') return [];
  const questions = (value as Record<string, unknown>).questions;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((raw): PromptQuestion[] => {
    if (!raw || typeof raw !== 'object') return [];
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.question !== 'string') return [];
    const options = Array.isArray(record.options) ? record.options : [];
    return [{
      id: record.id,
      question: record.question,
      multiSelect: false,
      options: options.flatMap((option) => {
        if (!option || typeof option !== 'object') return [];
        const { label, description } = option as Record<string, unknown>;
        if (typeof label !== 'string' || !label.trim()) return [];
        return [{ label, ...(typeof description === 'string' && description.trim() ? { description } : {}) }];
      }),
    }];
  });
}

// turn/completed 正常时携带 error: null，失败时携带 app-server 的错误对象。
// 形状不稳定（字符串 / { message } / 其它），一律原样保留，避免丢失排查信息。
function readTurnError(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const turn = record.turn && typeof record.turn === 'object'
    ? (record.turn as Record<string, unknown>)
    : undefined;
  const raw = turn?.error ?? record.error;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') return raw || undefined;
  if (typeof raw === 'object') {
    const message = (raw as Record<string, unknown>).message;
    if (typeof message === 'string' && message) return message;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

export class CodexInteractiveRunner {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly command?: string;
  private readonly syncThreadForResume: typeof syncCodexThreadForResume;
  private readonly idleTimeoutMs: number;
  private readonly bridgeInstructions: string;
  private readonly idleCloseMs: number;
  private readonly idleCloseTimers = new Map<string, ReturnType<typeof setTimeout>>();


  constructor(input: {
    command?: string;
    syncThreadForResume?: typeof syncCodexThreadForResume;
    idleTimeoutMs?: number;
    bridgeInstructions?: string;
    /** 空闲（一次生成彻底结束、后台也没有任务）多久后关掉 app-server；下一条消息再 thread/resume。0 为不关。 */
    idleCloseMs?: number;
  } = {}) {
    this.command = input.command;
    this.idleCloseMs = input.idleCloseMs ?? 30 * 60 * 1000;
    this.syncThreadForResume = input.syncThreadForResume ?? syncCodexThreadForResume;
    this.idleTimeoutMs = input.idleTimeoutMs ?? 0;
    // 每轮 thread/start、thread/resume 都要复用同一份常量，避免因内容抖动
    // 让 codex 侧的 prompt 缓存每轮失效。
    this.bridgeInstructions = input.bridgeInstructions ?? buildCodexBridgeInstructions();
  }

  async startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: { providerSessionId?: string; sessionName?: string };
  }): Promise<ProviderSession> {
    const session: StoredSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: 'codex',
      providerSessionId: input.options?.providerSessionId,
      threadId: input.options?.providerSessionId,
      sessionName: input.options?.sessionName,
      cwd: input.cwd,
      status: 'idle',
      pendingEvents: [],
      turnClosed: false,
      awaitingUser: 0,
      answeredAt: 0,
      backgroundTasks: new Map(),
      observingBackground: false,
      completionPending: false,
      closed: false,
      emittedItemIds: new Set(),
      acceptingInput: false,
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  // 空闲回收：生成期间（前台在跑、等人作答、后台任务未完）不计时，生成结束才开始计时
  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    this.cancelIdleClose(input.bridgeSessionId);
    try {
      yield* this.streamTurn(input);
    } finally {
      this.scheduleIdleClose(input.bridgeSessionId);
    }
  }

  private cancelIdleClose(bridgeSessionId: string): void {
    const timer = this.idleCloseTimers.get(bridgeSessionId);
    if (timer) clearTimeout(timer);
    this.idleCloseTimers.delete(bridgeSessionId);
  }

  private scheduleIdleClose(bridgeSessionId: string): void {
    this.cancelIdleClose(bridgeSessionId);
    if (this.idleCloseMs <= 0) return;
    const timer = setTimeout(() => {
      this.idleCloseTimers.delete(bridgeSessionId);
      const session = this.sessions.get(bridgeSessionId);
      const client = session?.client;
      if (!session || !client) return;
      // 只关进程、保留会话与线程：下一条消息经 ensureClient 重建并 thread/resume
      session.client = undefined;
      void client.dispose().catch(() => undefined);
    }, this.idleCloseMs);
    (timer as { unref?: () => void }).unref?.();
    this.idleCloseTimers.set(bridgeSessionId, timer);
  }

  private async *streamTurn(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`codex_session_not_found:${input.bridgeSessionId}`);
    session.acceptingInput = false;
    const client = await this.requireLiveClient(session);
    if (!client) {
      yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
      return;
    }

    // 上一轮没被消费的提问（上一轮被放弃时可能残留）：先拒掉，app-server 那边的请求才不会一直挂着
    for (const event of session.pendingEvents) {
      if (event.type === 'user_prompt') event.respond({ kind: 'deny', message: '这一轮已结束。' });
    }
    session.pendingEvents = [];
    session.awaitingUser = 0;
    session.activeMessage = undefined;
    session.activeTurnId = undefined;
    session.turnClosed = false;
    session.emittedItemIds.clear();
    session.turnCompletedPromise = new Promise<void>((resolve) => {
      session.turnCompletedResolver = resolve;
    });

    if (session.threadId) {
      const resumed = await withIdleTimeout(client.request('thread/resume', {
        threadId: session.threadId,
        cwd: session.cwd,
        persistExtendedHistory: true,
        // resume 也要带：恢复出来的会话同样跑在微信桥接环境里。
        developerInstructions: this.bridgeInstructions,
      }).catch(() => undefined), this.idleTimeoutMs);
      if (resumed === IDLE_SENTINEL) {
        await this.handleIdleTimeout(session);
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
        return;
      }
    } else {
      const started = await withIdleTimeout(client.request('thread/start', {
        cwd: session.cwd,
        threadSource: 'user',
        persistExtendedHistory: true,
        experimentalRawEvents: true,
        sandboxPolicy: { type: 'disabled' },
        approvalMode: 'never',
        developerInstructions: this.bridgeInstructions,
      }), this.idleTimeoutMs);
      if (started === IDLE_SENTINEL) {
        await this.handleIdleTimeout(session);
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
        return;
      }
      session.threadId = readThreadId(started);
      session.providerSessionId = session.threadId;
      if (!session.threadId) throw new Error('codex_app_server_missing_thread_id');
      yield {
        type: 'session_state',
        state: {
          bridgeSessionId: session.bridgeSessionId,
          providerId: 'codex',
          providerSessionId: session.threadId,
          cwd: session.cwd,
          status: 'idle',
        },
      };
    }

    const response = await withIdleTimeout(client.request('turn/start', {
      threadId: session.threadId,
      cwd: session.cwd,
      input: [{ type: 'text', text: input.text }],
    }), this.idleTimeoutMs);
    if (response === IDLE_SENTINEL) {
      await this.handleIdleTimeout(session);
      while (session.pendingEvents.length > 0) yield session.pendingEvents.shift()!;
      yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
      return;
    }
    const maybeTurnId = readTurnId(response);
    if (maybeTurnId) session.activeTurnId = maybeTurnId;
    session.acceptingInput = true;
    for (;;) {
      const event = await withIdleTimeout(this.takeNextEvent(session), this.idleTimeoutMs, () => session.awaitingUser > 0 || (session.observingBackground && session.turnClosed)
        ? this.idleTimeoutMs
        : Math.max(0, session.answeredAt + this.idleTimeoutMs - Date.now()));
      if (event === IDLE_SENTINEL) {
        await this.handleIdleTimeout(session);
        while (session.pendingEvents.length > 0) yield session.pendingEvents.shift()!;
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
        return;
      }
      if (!event) break;
      yield event;
      if (event.type === 'turn_end' && session.threadId) {
        await this.syncThreadForResume({
          sessionId: session.threadId,
          resumeTitle: session.sessionName ?? input.text,
          cwd: session.cwd,
        });
      }
    }
    await session.turnCompletedPromise;
    yield {
      type: 'session_state',
      state: {
        bridgeSessionId: session.bridgeSessionId,
        providerId: 'codex',
        providerSessionId: session.threadId,
        cwd: session.cwd,
        status: 'idle',
      },
    };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.cancelIdleClose(bridgeSessionId);
    const session = this.sessions.get(bridgeSessionId);
    this.sessions.delete(bridgeSessionId);
    if (session) {
      session.closed = true;
      session.turnClosed = true;
      session.eventResolver?.();
      session.turnCompletedResolver?.();
    }
    await session?.client?.dispose();
  }

  async interruptTurn(bridgeSessionId: string): Promise<void> {
    const session = this.sessions.get(bridgeSessionId);
    if (!session?.client) return;
    if (session.threadId && session.activeTurnId) {
      await session.client.request('turn/interrupt', {
        threadId: session.threadId,
        turnId: session.activeTurnId,
      }).catch(() => undefined);
    }
    this.flushActiveMessage(session);
    session.awaitingUser = 0;
    session.turnClosed = true;
    session.eventResolver?.();
    session.eventResolver = undefined;
    // Unblock the in-flight sendMessage await so the turn ends cleanly even if
    // the app-server does not emit a turn/completed for the interrupted turn.
    session.turnCompletedResolver?.();
    session.turnCompletedResolver = undefined;
  }

  async steerTurn(bridgeSessionId: string, text: string): Promise<boolean> {
    const session = this.sessions.get(bridgeSessionId);
    if (!session || session.closed || !session.acceptingInput || !session.client || !session.threadId) return false;
    const startsTurn = session.turnClosed;
    if (startsTurn ? !session.observingBackground : !session.activeTurnId) return false;
    // Only submit to a ready native session. Unsubmitted input belongs to the router's queue.
    try {
      if (startsTurn) {
        session.acceptingInput = false;
        session.turnClosed = false;
        session.activeTurnId = undefined;
        session.emittedItemIds.clear();
        const response = await session.client.request('turn/start', {
          threadId: session.threadId, cwd: session.cwd, input: [{ type: 'text', text }],
        });
        session.activeTurnId = readTurnId(response);
        session.acceptingInput = true;
      } else {
        await session.client.request('turn/steer', {
          threadId: session.threadId, expectedTurnId: session.activeTurnId,
          input: [{ type: 'text', text }],
        });
      }
      return true;
    } catch (error) {
      if (startsTurn) {
        session.turnClosed = true;
        session.acceptingInput = true;
      }
      console.error('[codex] follow-up input not accepted:', error);
      return false;
    }
  }

  private async ensureClient(session: StoredSession): Promise<CodexAppServerClient> {
    if (session.client && !session.closed) return session.client;
    // app-server 在两条消息之间自己退出了：丢掉旧 client 重建，随后 thread/resume 原线程，
    // 这条消息不能发给已经退出的进程（否则请求永远等不到回应）
    if (session.client) {
      const dead = session.client;
      session.client = undefined;
      await dead.dispose().catch(() => undefined);
    }
    const client = new CodexAppServerClient({
      command: this.command,
      cwd: session.cwd,

    });
    session.client = client;
    session.closed = false;
    // 新进程里没有旧进程的后台子任务：旧状态留着，这一轮会以为还有后台在跑而一直等下去
    session.backgroundTasks.clear();
    session.observingBackground = false;
    session.completionPending = false;
    try {
      await client.initialize();
    } catch (error) {
      session.client = undefined;
      await client.dispose().catch(() => undefined);
      throw error;
    }
    const isParent = (params: unknown) => {
      const threadId = (params as { threadId?: string } | undefined)?.threadId;
      return !threadId || !session.threadId || threadId === session.threadId;
    };
    client.onClose((error) => {
      // 已被换掉的旧进程（空闲回收、重建）关闭：与当前进程无关，不能把新进程标成已关闭
      if (session.client !== client) return;
      if (session.closed) return;
      session.closed = true;
      if (session.client === client) session.client = undefined;
      session.turnClosed = true;
      this.enqueueEvent(session, { type: 'error', error: error.message });
      session.turnCompletedResolver?.();
    });
    client.onNotification('item/agentMessage/delta', (params) => {
      if (!isParent(params)) return;
      const record = params as Record<string, unknown>;
      if (typeof record.delta !== 'string' || !record.delta) return;
      const itemId = readAgentMessageItemId(record) ?? `fallback-${session.pendingEvents.length}`;
      if (session.activeMessage?.itemId === itemId) {
        session.activeMessage.text += record.delta;
        return;
      }
      this.flushActiveMessage(session);
      session.activeMessage = { itemId, text: record.delta };
    });
    client.onNotification('item/started', (params) => {
      if (!isParent(params)) return;
      const item = (params as Record<string, unknown> | undefined)?.item;
      const itemType = item && typeof item === 'object' ? (item as Record<string, unknown>).type : undefined;
      // 工具种类会增加（commandExecution、fileChange、mcpToolCall、webSearch…），按排除法认：
      // 漏认一种，它前面的过程说明就会混进最终回复
      if (typeof itemType !== 'string' || NON_TOOL_ITEMS.has(itemType)) return;
      this.flushActiveMessage(session);
      this.enqueueEvent(session, { type: 'tool_event', title: itemType });
    });
    // 标明是过程说明（commentary）的助手消息：和工具调用之前的文字一样，不是这一轮的结论。
    // phase 并非每个模型都给，没有标注的照常当结论候选
    client.onNotification('item/completed', (params) => {
      if (!isParent(params)) return;
      const item = (params as Record<string, unknown> | undefined)?.item;
      if (!item || typeof item !== 'object') return;
      const record = item as Record<string, unknown>;
      if (record.type === 'collabAgentToolCall') {
        this.updateBackgroundAgents(session, record);
        return;
      }
      if (record.type !== 'agentMessage' || record.phase !== 'commentary') return;
      // 正在攒的已是别的消息：对不上这条，不动它
      if (session.activeMessage && session.activeMessage.itemId !== record.id) return;
      this.flushActiveMessage(session);
      this.enqueueEvent(session, { type: 'tool_event', title: 'commentary' });
    });
    client.onNotification('turn/started', (params) => {
      if (!isParent(params)) return;
      session.turnClosed = false;
      session.completionPending = false;
      session.emittedItemIds.clear();
      const turnId = readTurnId(params);
      if (turnId) session.activeTurnId = turnId;
    });
    client.onNotification('turn/completed', (params) => {
      if (!isParent(params)) {
        const id = (params as { threadId?: string }).threadId;
        if (id && session.backgroundTasks.delete(id)) {
          if (session.turnClosed) session.completionPending = true;
          this.enqueueEvent(session, { type: 'background_tasks', tasks: [...session.backgroundTasks.values()] });
        }
        return;
      }
      const items = (params as { turn?: { items?: unknown[] } }).turn?.items;
      for (const item of items ?? []) {
        if (item && typeof item === 'object' && (item as { type?: string }).type === 'collabAgentToolCall') {
          this.updateBackgroundAgents(session, item as Record<string, unknown>);
        }
      }
      this.flushActiveMessage(session);
      this.recoverTurnMessages(session, params);
      const turnError = readTurnError(params);
      if (turnError) this.enqueueEvent(session, { type: 'error', error: turnError });
      this.enqueueEvent(session, { type: 'turn_end' });
      session.turnClosed = true;
      // 后台子任务还在跑，或已结束、Codex 还要为它再开一轮：接着读，那一轮的结论照常发出。
      // 两者都没有了就结束这次生成，不能一直挂着（否则会话一直停在「回复中」，空闲回收也不会开始）。
      session.observingBackground = session.backgroundTasks.size > 0 || session.completionPending;
      session.eventResolver?.();
      session.eventResolver = undefined;
      session.turnCompletedResolver?.();
      session.turnCompletedResolver = undefined;
    });
    client.onRequest('item/commandExecution/requestApproval', async (_id, params) => {
      return { decision: 'approve' };
    });
    client.onRequest('item/fileChange/requestApproval', async (_id, params) => {
      return { decision: 'approve' };
    });
    // 模型向人提问（计划模式等）：交给微信作答，答完 app-server 接着这一轮
    client.onRequest('item/tool/requestUserInput', (_id, params) => this.askUser(session, params));
    return client;
  }

  private async requireLiveClient(session: StoredSession): Promise<CodexAppServerClient | null> {
    const client = await withIdleTimeout(this.ensureClient(session), this.idleTimeoutMs);
    if (client === IDLE_SENTINEL) {
      await this.handleIdleTimeout(session);
      return null;
    }
    return client;
  }

  private async handleIdleTimeout(session: StoredSession): Promise<void> {
    this.flushActiveMessage(session);
    session.turnClosed = true;
    session.eventResolver?.();
    session.eventResolver = undefined;
    session.turnCompletedResolver?.();
    session.turnCompletedResolver = undefined;
    const client = session.client;
    session.client = undefined;
    session.closed = true;
    await client?.dispose().catch(() => undefined);
  }

  private flushActiveMessage(session: StoredSession): void {
    if (!session.activeMessage?.text) return;
    this.enqueueEvent(session, { type: 'text_delta', text: session.activeMessage.text });
    this.enqueueEvent(session, { type: 'message_done' });
    session.emittedItemIds.add(session.activeMessage.itemId);
    session.activeMessage = undefined;
  }

  // 瞬时（非流式）回合里 app-server 可能完全不发 item/agentMessage/delta，
  // 助手文本只出现在 turn/completed 的 items 中。此时若不兜底，回复会静默丢失。
  // 按消息 id 去重，只补尚未流式发出的结论；过程说明不影响结论的补发。
  private recoverTurnMessages(session: StoredSession, params: unknown): void {
    for (const text of readTurnConclusion(params, session.emittedItemIds)) {
      this.enqueueEvent(session, { type: 'text_delta', text });
      this.enqueueEvent(session, { type: 'message_done' });
    }
  }

  private updateBackgroundAgents(session: StoredSession, item: Record<string, unknown>): void {
    const states = item.agentsStates;
    if (!states || typeof states !== 'object') return;
    for (const [id, state] of Object.entries(states)) {
      const status = state && typeof state === 'object' ? (state as { status?: string }).status : undefined;
      if (status === 'running' || status === 'pendingInit') {
        const previous = session.backgroundTasks.get(id);
        session.backgroundTasks.set(id, previous ?? {
          id, description: typeof item.prompt === 'string' ? item.prompt : '后台子代理',
        });
      } else if (status && ['completed', 'errored', 'shutdown', 'notFound', 'interrupted'].includes(status)) {
        if (session.backgroundTasks.delete(id) && session.turnClosed) session.completionPending = true;
      }
    }
    this.enqueueEvent(session, { type: 'background_tasks', tasks: [...session.backgroundTasks.values()] });
  }

  private askUser(session: StoredSession, params: unknown): Promise<unknown> {
    const questions = readUserInputQuestions(params);
    // 没有能列出来的题：空答案放行，不能让这一轮卡着等一个无从回答的请求
    if (questions.length === 0) return Promise.resolve({ answers: {} });
    this.flushActiveMessage(session);
    session.awaitingUser += 1;
    return new Promise((resolve) => {
      let answered = false;
      this.enqueueEvent(session, {
        type: 'user_prompt',
        prompt: { kind: 'question', questions },
        respond: (reply) => {
          if (answered) return;
          answered = true;
          session.awaitingUser = Math.max(0, session.awaitingUser - 1);
          session.answeredAt = Date.now();
          // 协议只能交回答案：被拒（中止、换会话等）时把原因作为每道题的回答，
          // 交空答案的话 Codex 看不出是被拒，可能按默认选项接着做
          const answers: Record<string, { answers: string[] }> = {};
          for (const question of questions) {
            const answer = reply.kind === 'answers' ? reply.answers[question.id] : reply.kind === 'deny' ? reply.message : undefined;
            if (answer !== undefined) answers[question.id] = { answers: [answer] };
          }
          resolve({ answers });
        },
      });
    });
  }

  private enqueueEvent(session: StoredSession, event: ProviderEvent): void {
    session.pendingEvents.push(event);
    session.eventResolver?.();
    session.eventResolver = undefined;
  }

  private async takeNextEvent(session: StoredSession): Promise<ProviderEvent | null> {
    for (;;) {
      const next = session.pendingEvents.shift();
      if (next) return next;
      if (session.closed || (session.turnClosed && !session.observingBackground)) return null;
      await new Promise<void>((resolve) => {
        session.eventResolver = resolve;
      });
    }
  }
}
