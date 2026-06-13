import { spawn } from 'node:child_process';
import type { NativeProviderAdapter, PermissionRequest, ProviderEvent, ProviderSession } from '../types';

export type CodexProcessCall = {
  command: string;
  args: string[];
  cwd: string;
  input: string;
};

export type CodexProcessResult = {
  code: number | string;
  stdout: string;
  stderr: string;
};

export type CodexProcessRunner = (call: CodexProcessCall) => Promise<CodexProcessResult>;

type StoredCodexSession = ProviderSession & {
  codexSessionId?: string;
  hasRun: boolean;
};

export class CodexCliRunner {
  private readonly sessions = new Map<string, StoredCodexSession>();
  private readonly command: string;
  private readonly processRunner: CodexProcessRunner;

  constructor(input: { command?: string; processRunner?: CodexProcessRunner } = {}) {
    this.command = input.command ?? 'codex';
    this.processRunner = input.processRunner ?? defaultCodexProcessRunner;
  }

  async startSession(input: { bridgeSessionId: string; cwd: string; initialPrompt?: string }): Promise<ProviderSession> {
    const session: StoredCodexSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: 'codex',
      cwd: input.cwd,
      status: 'idle',
      hasRun: false,
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`codex_session_not_found:${input.bridgeSessionId}`);

    const args = buildCodexArgs(session, input.text);
    const result = await this.processRunner({ command: this.command, args, cwd: session.cwd, input: '' });
    if (result.code !== 0) {
      yield { type: 'error', error: result.stderr || result.stdout || `codex exited with ${result.code}` };
      return;
    }

    let emittedDone = false;
    for (const event of parseCodexJsonLines({ bridgeSessionId: input.bridgeSessionId, cwd: session.cwd, stdout: result.stdout })) {
      if (event.type === 'session_state') {
        session.providerSessionId = event.state.providerSessionId;
        session.codexSessionId = event.state.providerSessionId;
        session.status = event.state.status;
        session.hasRun = true;
      }
      if (event.type === 'message_done') emittedDone = true;
      yield event;
    }
    if (!emittedDone) yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
  }

  async decidePermission(_input: { requestId: string; decision: 'approve' | 'deny' | 'abort' }): Promise<void> {
    // The CLI exec path cannot continue an in-flight approval request yet.
    // Keep the method so the router can call it uniformly.
  }
}

function buildCodexArgs(session: StoredCodexSession, prompt: string): string[] {
  if (session.hasRun && session.codexSessionId) {
    return ['exec', 'resume', '--json', '--last', '-C', session.cwd, prompt];
  }
  return ['exec', '--json', '-C', session.cwd, prompt];
}

function parseCodexJsonLines(input: { bridgeSessionId: string; cwd: string; stdout: string }): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  for (const line of input.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const value = parseJsonLine(line);
    if (!value) continue;
    const record = value as Record<string, unknown>;

    if (record.type === 'agent_message') {
      for (const text of extractCodexText(record.message)) {
        events.push({ type: 'text_delta', text });
      }
    }

    if (record.type === 'approval_request') {
      events.push({
        type: 'permission_request',
        request: buildPermissionRequest(input.bridgeSessionId, record),
      });
    }

    if (record.type === 'exec_complete') {
      const sessionId = typeof record.session_id === 'string' ? record.session_id : undefined;
      if (sessionId) {
        events.push({
          type: 'session_state',
          state: {
            bridgeSessionId: input.bridgeSessionId,
            providerId: 'codex',
            providerSessionId: sessionId,
            cwd: input.cwd,
            status: 'idle',
          },
        });
      }
      events.push({ type: 'message_done' });
    }
  }
  return events;
}

function extractCodexText(message: unknown): string[] {
  if (!message || typeof message !== 'object') return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return record.type === 'output_text' && typeof record.text === 'string' ? [record.text] : [];
  });
}

function buildPermissionRequest(bridgeSessionId: string, record: Record<string, unknown>): PermissionRequest {
  const details: Record<string, unknown> = {};
  if (typeof record.command === 'string') details.command = record.command;
  if (typeof record.cwd === 'string') details.cwd = record.cwd;
  return {
    id: typeof record.id === 'string' ? record.id : 'codex_approval',
    bridgeSessionId,
    providerId: 'codex',
    toolName: typeof record.tool_name === 'string' ? record.tool_name : 'CodexApproval',
    summary: typeof record.message === 'string' ? record.message : 'Codex approval request',
    details,
    choices: ['approve', 'deny', 'abort'],
  };
}

function parseJsonLine(line: string): unknown | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function defaultCodexProcessRunner(call: CodexProcessCall): Promise<CodexProcessResult> {
  return await new Promise((resolve) => {
    const child = spawn(call.command, call.args, { cwd: call.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error: NodeJS.ErrnoException) => {
      resolve({ code: error.code ?? 'ERROR', stdout, stderr: stderr || error.message });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 'SIGNAL', stdout, stderr });
    });
    child.stdin.end(call.input);
  });
}
