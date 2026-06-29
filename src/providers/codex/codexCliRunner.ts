import { spawn } from 'node:child_process';
import { expandTilde } from '../../shared/expandTilde';
import { useShellForCli } from '../../shared/platform';
import type { ProviderEvent, ProviderSession } from '../types';

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

export type CodexStreamChunk =
  | { type: 'line'; line: string }
  | { type: 'exit'; code: number | string; stderr: string };

export type CodexLineStreamer = (call: CodexProcessCall) => AsyncIterable<CodexStreamChunk>;

type StoredCodexSession = ProviderSession & {
  codexSessionId?: string;
  hasRun: boolean;
};

export class CodexCliRunner {
  private readonly sessions = new Map<string, StoredCodexSession>();
  private readonly command: string;
  private readonly lineStreamer: CodexLineStreamer;

  constructor(input: { command?: string; processRunner?: CodexProcessRunner; lineStreamer?: CodexLineStreamer } = {}) {
    this.command = input.command ?? 'codex';
    if (input.lineStreamer) this.lineStreamer = input.lineStreamer;
    else if (input.processRunner) this.lineStreamer = wrapProcessRunner(input.processRunner);
    else this.lineStreamer = defaultCodexLineStreamer;
  }

  async startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: { providerSessionId?: string };
  }): Promise<ProviderSession> {
    const session: StoredCodexSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: 'codex',
      providerSessionId: input.options?.providerSessionId,
      codexSessionId: input.options?.providerSessionId,
      cwd: input.cwd,
      status: 'idle',
      hasRun: Boolean(input.options?.providerSessionId),
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`codex_session_not_found:${input.bridgeSessionId}`);

    const args = buildCodexArgs(session, input.text);
    const call: CodexProcessCall = { command: this.command, args, cwd: session.cwd, input: '' };

    let emittedDone = false;
    let threadId = session.codexSessionId;
    for await (const chunk of this.lineStreamer(call)) {
      if (chunk.type === 'exit') {
        if (chunk.code !== 0) {
          yield { type: 'error', error: chunk.stderr || `codex exited with ${chunk.code}` };
          return;
        }
        break;
      }
      const parsed = parseCodexLine({ bridgeSessionId: input.bridgeSessionId, cwd: session.cwd, line: chunk.line, threadId });
      threadId = parsed.threadId ?? threadId;
      for (const event of parsed.events) {
        if (event.type === 'session_state') {
          session.providerSessionId = event.state.providerSessionId;
          session.codexSessionId = event.state.providerSessionId;
          session.status = event.state.status;
          session.hasRun = true;
        }
        if (event.type === 'message_done') emittedDone = true;
        yield event;
      }
    }
    if (!emittedDone) yield { type: 'message_done' };
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.delete(bridgeSessionId);
  }
}

function buildCodexArgs(session: StoredCodexSession, prompt: string): string[] {
  if (session.hasRun && session.codexSessionId) {
    return ['exec', 'resume', '--json', session.codexSessionId, prompt];
  }
  return ['exec', '--json', '-C', session.cwd, prompt];
}

function parseCodexLine(input: { bridgeSessionId: string; cwd: string; line: string; threadId?: string }): {
  events: ProviderEvent[];
  threadId?: string;
} {
  const events: ProviderEvent[] = [];
  let threadId = input.threadId;
  const value = parseJsonLine(input.line);
  if (!value) return { events, threadId };
  const record = value as Record<string, unknown>;

  if (record.type === 'thread.started' && typeof record.thread_id === 'string') {
    threadId = record.thread_id;
  }

  if (record.type === 'agent_message') {
    let emittedText = false;
    for (const text of extractCodexText(record.message)) {
      events.push({ type: 'text_delta', text });
      emittedText = true;
    }
    if (emittedText) events.push({ type: 'message_done' });
  }

  if (record.type === 'item.completed' && record.item && typeof record.item === 'object') {
    const item = record.item as Record<string, unknown>;
    if (item.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
      events.push({ type: 'text_delta', text: item.text.trim() });
      events.push({ type: 'message_done' });
    }
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

  if (record.type === 'turn.completed') {
    if (threadId) {
      events.push({
        type: 'session_state',
        state: {
          bridgeSessionId: input.bridgeSessionId,
          providerId: 'codex',
          providerSessionId: threadId,
          cwd: input.cwd,
          status: 'idle',
        },
      });
    }
    events.push({ type: 'message_done' });
  }

  return { events, threadId };
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

function parseJsonLine(line: string): unknown | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function wrapProcessRunner(processRunner: CodexProcessRunner): CodexLineStreamer {
  return async function* wrapped(call: CodexProcessCall): AsyncIterable<CodexStreamChunk> {
    const result = await processRunner(call);
    for (const line of result.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      yield { type: 'line', line };
    }
    yield { type: 'exit', code: result.code, stderr: result.stderr || result.stdout };
  };
}

async function* defaultCodexLineStreamer(call: CodexProcessCall): AsyncIterable<CodexStreamChunk> {
  const child = spawn(call.command, call.args, { cwd: expandTilde(call.cwd) ?? call.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: useShellForCli() });
  child.stdin.end(call.input);

  let stderr = '';
  let buffer = '';
  const lines: string[] = [];
  let done = false;
  let exitCode: number | string = 'SIGNAL';
  let streamError: string | undefined;
  let notify: (() => void) | null = null;
  const wake = () => {
    const current = notify;
    notify = null;
    current?.();
  };

  child.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      if (line.trim()) lines.push(line);
    }
    wake();
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  child.on('error', (error: NodeJS.ErrnoException) => {
    streamError = stderr || error.message;
    exitCode = error.code ?? 'ERROR';
    done = true;
    wake();
  });
  child.on('close', (code) => {
    if (buffer.trim()) lines.push(buffer);
    exitCode = code ?? 'SIGNAL';
    done = true;
    wake();
  });

  while (!done || lines.length > 0) {
    if (lines.length === 0) {
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
      continue;
    }
    yield { type: 'line', line: lines.shift()! };
  }

  yield { type: 'exit', code: exitCode, stderr: streamError ?? stderr };
}
