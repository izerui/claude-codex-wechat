import type { ProviderEvent, ProviderSession } from '../types';
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
  /** 本轮是否已经吐出过助手文本。用于判断 turn/completed 是否需要兜底补发。 */
  emittedTextThisTurn?: boolean;
  eventResolver?: () => void;
  turnCompletedResolver?: () => void;
  turnCompletedPromise?: Promise<void>;
};

const IDLE_SENTINEL = Symbol('idle_timeout');

function withIdleTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof IDLE_SENTINEL> {
  if (!ms || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(IDLE_SENTINEL);
      }
    }, ms);
    (timer as { unref?: () => void }).unref?.();
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

// 从 turn/completed 的 turn.items 里取出助手消息全文（非流式回合的唯一来源）。
function readTurnAgentMessages(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const turn = (value as Record<string, unknown>).turn;
  if (!turn || typeof turn !== 'object') return [];
  const items = (turn as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  const texts: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.type !== 'agentMessage') continue;
    if (typeof record.text === 'string' && record.text.trim()) texts.push(record.text);
  }
  return texts;
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


  constructor(input: {
    command?: string;
    syncThreadForResume?: typeof syncCodexThreadForResume;
    idleTimeoutMs?: number;
    bridgeInstructions?: string;
  } = {}) {
    this.command = input.command;
    this.syncThreadForResume = input.syncThreadForResume ?? syncCodexThreadForResume;
    this.idleTimeoutMs = input.idleTimeoutMs ?? 180_000;
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
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`codex_session_not_found:${input.bridgeSessionId}`);
    const client = await this.requireLiveClient(session);
    if (!client) {
      yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
      return;
    }

    session.pendingEvents = [];
    session.activeMessage = undefined;
    session.activeTurnId = undefined;
    session.turnClosed = false;
    session.emittedTextThisTurn = false;
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
    for (;;) {
      const event = await withIdleTimeout(this.takeNextEvent(session), this.idleTimeoutMs);
      if (event === IDLE_SENTINEL) {
        await this.handleIdleTimeout(session);
        while (session.pendingEvents.length > 0) yield session.pendingEvents.shift()!;
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
        return;
      }
      if (!event) break;
      yield event;
    }
    await session.turnCompletedPromise;
    if (session.threadId) {
      await this.syncThreadForResume({
        sessionId: session.threadId,
        resumeTitle: session.sessionName ?? input.text,
        cwd: session.cwd,
      });
    }
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
    const session = this.sessions.get(bridgeSessionId);
    this.sessions.delete(bridgeSessionId);
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
    session.turnClosed = true;
    session.eventResolver?.();
    session.eventResolver = undefined;
    // Unblock the in-flight sendMessage await so the turn ends cleanly even if
    // the app-server does not emit a turn/completed for the interrupted turn.
    session.turnCompletedResolver?.();
    session.turnCompletedResolver = undefined;
  }

  async steerTurn(bridgeSessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(bridgeSessionId);
    if (!session?.client || !session.threadId || !session.activeTurnId) return;
    await session.client.request('turn/steer', {
      threadId: session.threadId,
      expectedTurnId: session.activeTurnId,
      input: [{ type: 'text', text }],
    }).catch(() => undefined);
  }

  private async ensureClient(session: StoredSession): Promise<CodexAppServerClient> {
    if (session.client) return session.client;
    const client = new CodexAppServerClient({
      command: this.command,
      cwd: session.cwd,

    });
    session.client = client;
    try {
      await client.initialize();
    } catch (error) {
      session.client = undefined;
      await client.dispose().catch(() => undefined);
      throw error;
    }
    client.onNotification('item/agentMessage/delta', (params) => {
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
    client.onNotification('turn/started', (params) => {
      const turnId = readTurnId(params);
      if (turnId) session.activeTurnId = turnId;
    });
    client.onNotification('turn/completed', (params) => {
      this.flushActiveMessage(session);
      this.recoverTurnMessages(session, params);
      const turnError = readTurnError(params);
      if (turnError) this.enqueueEvent(session, { type: 'error', error: turnError });
      session.turnClosed = true;
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
    await client?.dispose().catch(() => undefined);
  }

  private flushActiveMessage(session: StoredSession): void {
    if (!session.activeMessage?.text) return;
    this.enqueueEvent(session, { type: 'text_delta', text: session.activeMessage.text });
    this.enqueueEvent(session, { type: 'message_done' });
    session.activeMessage = undefined;
    session.emittedTextThisTurn = true;
  }

  // 瞬时（非流式）回合里 app-server 可能完全不发 item/agentMessage/delta，
  // 助手文本只出现在 turn/completed 的 items 中。此时若不兜底，回复会静默丢失。
  // 只在本轮一条文本都没发出时才补发——宁可少发，也不要重复刷屏、白耗微信配额。
  private recoverTurnMessages(session: StoredSession, params: unknown): void {
    if (session.emittedTextThisTurn) return;
    for (const text of readTurnAgentMessages(params)) {
      this.enqueueEvent(session, { type: 'text_delta', text });
      this.enqueueEvent(session, { type: 'message_done' });
      session.emittedTextThisTurn = true;
    }
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
      if (session.turnClosed) return null;
      await new Promise<void>((resolve) => {
        session.eventResolver = resolve;
      });
    }
  }
}
