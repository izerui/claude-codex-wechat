import { spawn } from 'node:child_process';
import type { ClaudeRunner, ClaudeRunnerEvent, ClaudeRunnerSession } from './claudeRunner';
import { mapClaudePermissionRequest } from './claudePermissionMapping';

export type ClaudeProcessCall = {
  command: string;
  args: string[];
  cwd: string;
  input: string;
};

export type ClaudeProcessResult = {
  code: number | string;
  stdout: string;
  stderr: string;
};

export type ClaudeProcessRunner = (call: ClaudeProcessCall) => Promise<ClaudeProcessResult>;

type StoredClaudeSession = ClaudeRunnerSession & {
  claudeSessionId?: string;
  sessionName?: string;
};

export class ClaudeHeadlessRunner implements ClaudeRunner {
  private readonly sessions = new Map<string, StoredClaudeSession>();
  private readonly command: string;
  private readonly processRunner: ClaudeProcessRunner;

  constructor(input: { command?: string; processRunner?: ClaudeProcessRunner } = {}) {
    this.command = input.command ?? 'claude';
    this.processRunner = input.processRunner ?? defaultClaudeProcessRunner;
  }

  async startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: { providerSessionId?: string; sessionName?: string };
  }): Promise<ClaudeRunnerSession> {
    const session: StoredClaudeSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: 'claude-code',
      providerSessionId: input.options?.providerSessionId,
      claudeSessionId: input.options?.providerSessionId,
      sessionName: input.options?.sessionName,
      cwd: input.cwd,
      status: 'idle',
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ClaudeRunnerEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`claude_session_not_found:${input.bridgeSessionId}`);

    const args = buildClaudeArgs(input.text, session.claudeSessionId, session.sessionName);
    const result = await this.processRunner({ command: this.command, args, cwd: session.cwd, input: '' });
    if (result.code !== 0) {
      yield { type: 'error', error: result.stderr || result.stdout || `claude exited with ${result.code}` };
      return;
    }

    let emittedDone = false;
    for (const event of parseClaudeStream({ bridgeSessionId: input.bridgeSessionId, cwd: session.cwd, stdout: result.stdout })) {
      if (event.type === 'session_state') {
        session.providerSessionId = event.state.providerSessionId;
        session.claudeSessionId = event.state.providerSessionId;
        session.status = event.state.status;
      }
      if (event.type === 'message_done') emittedDone = true;
      yield event;
    }
    if (!emittedDone) yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
  }
}

function buildClaudeArgs(prompt: string, claudeSessionId: string | undefined, sessionName: string | undefined): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  if (claudeSessionId) args.push('--resume', claudeSessionId);
  else if (sessionName) args.push('-n', sessionName);
  args.push(prompt);
  return args;
}

function parseClaudeStream(input: { bridgeSessionId: string; cwd: string; stdout: string }): ClaudeRunnerEvent[] {
  const events: ClaudeRunnerEvent[] = [];
  for (const line of input.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const value = parseJsonLine(line);
    if (!value) continue;
    const record = value as Record<string, unknown>;

    if (record.type === 'assistant') {
      for (const text of extractAssistantText(record.message)) {
        events.push({ type: 'text_delta', text });
      }
    }

    if (record.type === 'permission_request') {
      events.push({
        type: 'permission_request',
        request: mapClaudePermissionRequest({
          bridgeSessionId: input.bridgeSessionId,
          payload: {
            id: typeof record.id === 'string' ? record.id : 'claude_permission',
            toolName: typeof record.tool_name === 'string' ? record.tool_name : 'ClaudePermission',
            summary: typeof record.summary === 'string' ? record.summary : undefined,
            command: typeof record.command === 'string' ? record.command : undefined,
            cwd: typeof record.cwd === 'string' ? record.cwd : undefined,
            file: typeof record.file === 'string' ? record.file : undefined,
            details: record,
          },
        }),
      });
    }

    if (record.type === 'result') {
      const sessionId = typeof record.session_id === 'string' ? record.session_id : undefined;
      if (sessionId) {
        events.push({
          type: 'session_state',
          state: {
            bridgeSessionId: input.bridgeSessionId,
            providerId: 'claude-code',
            providerSessionId: sessionId,
            cwd: input.cwd,
            status: 'idle',
          },
        });
      }
      events.push({ type: 'message_done' });
    }

    if (record.type === 'error') {
      events.push({ type: 'error', error: extractError(record) });
    }
  }
  return events;
}

function extractAssistantText(message: unknown): string[] {
  if (!message || typeof message !== 'object') return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return record.type === 'text' && typeof record.text === 'string' ? [record.text] : [];
  });
}

function extractError(record: Record<string, unknown>): string {
  if (typeof record.message === 'string') return record.message;
  if (record.error && typeof record.error === 'object') {
    const error = record.error as Record<string, unknown>;
    if (typeof error.message === 'string') return error.message;
  }
  return JSON.stringify(record);
}

function parseJsonLine(line: string): unknown | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function defaultClaudeProcessRunner(call: ClaudeProcessCall): Promise<ClaudeProcessResult> {
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
