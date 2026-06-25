import type { ProviderEvent, ProviderSession } from '../types';
import { CodexAppServerClient } from './codexAppServerClient';
import { syncCodexThreadForResume } from './nativeThreads';

type StoredSession = ProviderSession & {
  threadId?: string;
  client?: CodexAppServerClient;
  pendingMessages: Array<{ itemId: string; text: string }>;
  activeTurnId?: string;
  sessionName?: string;
  turnCompletedResolver?: () => void;
  turnCompletedPromise?: Promise<void>;
};

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

export class CodexInteractiveRunner {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly command?: string;
  private readonly syncThreadForResume: typeof syncCodexThreadForResume;

  constructor(input: {
    command?: string;
    syncThreadForResume?: typeof syncCodexThreadForResume;
  } = {}) {
    this.command = input.command;
    this.syncThreadForResume = input.syncThreadForResume ?? syncCodexThreadForResume;
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
      pendingMessages: [],
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`codex_session_not_found:${input.bridgeSessionId}`);
    const client = await this.ensureClient(session);

    session.pendingMessages = [];
    session.activeTurnId = undefined;
    session.turnCompletedPromise = new Promise<void>((resolve) => {
      session.turnCompletedResolver = resolve;
    });

    if (session.threadId) {
      await client.request('thread/resume', {
        threadId: session.threadId,
        cwd: session.cwd,
        persistExtendedHistory: true,
      }).catch(() => undefined);
    } else {
      const started = await client.request('thread/start', {
        cwd: session.cwd,
        threadSource: 'user',
        persistExtendedHistory: true,
        experimentalRawEvents: true,
        sandboxPolicy: { type: 'disabled' },
        approvalMode: 'never',
      });
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

    const response = await client.request('turn/start', {
      threadId: session.threadId,
      cwd: session.cwd,
      input: [{ type: 'text', text: input.text }],
    });
    const maybeTurnId = readTurnId(response);
    if (maybeTurnId) session.activeTurnId = maybeTurnId;
    await session.turnCompletedPromise;
    if (session.threadId) {
      await this.syncThreadForResume({
        sessionId: session.threadId,
        resumeTitle: session.sessionName ?? input.text,
        cwd: session.cwd,
      });
    }

    for (const message of session.pendingMessages) {
      if (!message.text) continue;
      yield { type: 'text_delta', text: message.text };
      yield { type: 'message_done' };
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
    await client.initialize();
    client.onNotification('item/agentMessage/delta', (params) => {
      const record = params as Record<string, unknown>;
      if (typeof record.delta !== 'string' || !record.delta) return;
      const itemId = readAgentMessageItemId(record) ?? `fallback-${session.pendingMessages.length}`;
      const last = session.pendingMessages.at(-1);
      if (last?.itemId === itemId) {
        last.text += record.delta;
        return;
      }
      session.pendingMessages.push({ itemId, text: record.delta });
    });
    client.onNotification('turn/started', (params) => {
      const turnId = readTurnId(params);
      if (turnId) session.activeTurnId = turnId;
    });
    client.onNotification('turn/completed', () => {
      session.turnCompletedResolver?.();
      session.turnCompletedResolver = undefined;
    });
    client.onRequest('item/commandExecution/requestApproval', async (_id, params) => {
      return { decision: 'approve' };
    });
    client.onRequest('item/fileChange/requestApproval', async (_id, params) => {
      return { decision: 'approve' };
    });
    session.client = client;
    return client;
  }
}
