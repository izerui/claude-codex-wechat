import type { PermissionRequest, ProviderEvent, ProviderSession } from '../types';
import { CodexAppServerClient } from './codexAppServerClient';
import { syncCodexThreadForResume } from './nativeThreads';

type StoredSession = ProviderSession & {
  threadId?: string;
  client?: CodexAppServerClient;
  pendingText: string[];
  pendingApprovals: ProviderEvent[];
  activeTurnId?: string;
  sessionName?: string;
  turnCompletedResolver?: () => void;
  turnCompletedPromise?: Promise<void>;
};

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
      pendingText: [],
      pendingApprovals: [],
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`codex_session_not_found:${input.bridgeSessionId}`);
    const client = await this.ensureClient(session);

    session.pendingText = [];
    session.pendingApprovals = [];
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

    for (const text of session.pendingText) {
      yield { type: 'text_delta', text };
    }
    for (const approval of session.pendingApprovals) {
      yield approval;
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
    yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    const session = this.sessions.get(bridgeSessionId);
    this.sessions.delete(bridgeSessionId);
    await session?.client?.dispose();
  }

  async decidePermission(_input: { requestId: string; decision: 'approve' | 'deny' | 'abort' }): Promise<void> {
    // Interactive Codex permissions are not bridged yet in this minimal runner.
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
      if (typeof record.delta === 'string' && record.delta) session.pendingText.push(record.delta);
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
      const request = buildApprovalRequest(session, params as Record<string, unknown>);
      session.pendingApprovals.push({ type: 'permission_request', request });
      return { decision: 'decline' };
    });
    client.onRequest('item/fileChange/requestApproval', async (_id, params) => {
      const request = buildApprovalRequest(session, params as Record<string, unknown>, 'CodexPatch');
      session.pendingApprovals.push({ type: 'permission_request', request });
      return { decision: 'decline' };
    });
    session.client = client;
    return client;
  }
}

function buildApprovalRequest(
  session: StoredSession,
  params: Record<string, unknown>,
  toolName = 'CodexBash',
): PermissionRequest {
  return {
    id: typeof params.itemId === 'string' ? params.itemId : 'codex_approval',
    bridgeSessionId: session.bridgeSessionId,
    providerId: 'codex',
    toolName,
    summary: typeof params.reason === 'string' && params.reason ? params.reason : `Codex requests approval for ${toolName}`,
    details: {
      ...(typeof params.command === 'string' ? { command: params.command } : {}),
      ...(typeof params.cwd === 'string' ? { cwd: params.cwd } : {}),
    },
    choices: ['approve', 'deny', 'abort'],
  };
}
