import { spawn } from 'node:child_process';
import { expandTilde } from '../../shared/expandTilde';
import { terminateChild, useShellForCli } from '../../shared/platform';
import { extractAssistantBlocks } from './assistantContent';
import type { ClaudeRunner, ClaudeRunnerEvent, ClaudeRunnerSession } from './claudeRunner';

export type ClaudeProcessCall = {
  command: string;
  args: string[];
  cwd: string;
  input: string;
  signal?: AbortSignal;
};

export type ClaudeProcessResult = {
  code: number | string;
  stdout: string;
  stderr: string;
};

export type ClaudeProcessRunner = (call: ClaudeProcessCall) => Promise<ClaudeProcessResult>;

export type ClaudeStreamChunk =
  | { type: 'line'; line: string }
  | { type: 'exit'; code: number | string; stderr: string };

export type ClaudeLineStreamer = (call: ClaudeProcessCall) => AsyncIterable<ClaudeStreamChunk>;

type StoredClaudeSession = ClaudeRunnerSession & {
  claudeSessionId?: string;
  sessionName?: string;
  abortController?: AbortController;
};

export class ClaudeHeadlessRunner implements ClaudeRunner {
  private readonly sessions = new Map<string, StoredClaudeSession>();
  private readonly command: string;
  private readonly lineStreamer: ClaudeLineStreamer;

  constructor(input: { command?: string; processRunner?: ClaudeProcessRunner; lineStreamer?: ClaudeLineStreamer } = {}) {
    this.command = input.command ?? 'claude';
    if (input.lineStreamer) this.lineStreamer = input.lineStreamer;
    else if (input.processRunner) this.lineStreamer = wrapProcessRunner(input.processRunner);
    else this.lineStreamer = defaultClaudeLineStreamer;
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

    const controller = new AbortController();
    session.abortController = controller;
    const args = buildClaudeArgs(input.text, session.claudeSessionId, session.sessionName);
    const call: ClaudeProcessCall = { command: this.command, args, cwd: session.cwd, input: '', signal: controller.signal };

    let emittedDone = false;
    try {
      for await (const chunk of this.lineStreamer(call)) {
        if (chunk.type === 'exit') {
          if (controller.signal.aborted) break;
          if (chunk.code !== 0) {
            yield { type: 'error', error: chunk.stderr || `claude exited with ${chunk.code}` };
            return;
          }
          break;
        }
        for (const event of parseClaudeLine({ bridgeSessionId: input.bridgeSessionId, cwd: session.cwd, line: chunk.line })) {
          if (event.type === 'session_state') {
            session.providerSessionId = event.state.providerSessionId;
            session.claudeSessionId = event.state.providerSessionId;
            session.status = event.state.status;
          }
          if (event.type === 'message_done') emittedDone = true;
          yield event;
        }
      }
    } finally {
      session.abortController = undefined;
    }
    if (!emittedDone) yield { type: 'message_done' };
  }

  async interruptSession(bridgeSessionId: string): Promise<void> {
    this.sessions.get(bridgeSessionId)?.abortController?.abort();
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.sessions.get(bridgeSessionId)?.abortController?.abort();
    this.sessions.delete(bridgeSessionId);
  }
}

function buildClaudeArgs(prompt: string, claudeSessionId: string | undefined, sessionName: string | undefined): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--dangerously-skip-permissions'];
  if (claudeSessionId) args.push('--resume', claudeSessionId);
  else if (sessionName) args.push('-n', sessionName);
  args.push(prompt);
  return args;
}

function parseClaudeLine(input: { bridgeSessionId: string; cwd: string; line: string }): ClaudeRunnerEvent[] {
  const events: ClaudeRunnerEvent[] = [];
  const value = parseJsonLine(input.line);
  if (!value) return events;
  const record = value as Record<string, unknown>;

  if (record.type === 'assistant') {
    let emittedText = false;
    for (const block of extractAssistantBlocks(record.message)) {
      events.push({ type: 'text_delta', text: block.text });
      if (block.type === 'choice' && block.labels.length > 0) {
        events.push({ type: 'choice_prompt', labels: block.labels, multiSelect: block.multiSelect });
      }
      emittedText = true;
    }
    // Flush each completed LLM round as its own message so multi-round
    // agent turns stream out incrementally instead of merging into one.
    if (emittedText) events.push({ type: 'message_done' });
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

  return events;
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

function wrapProcessRunner(processRunner: ClaudeProcessRunner): ClaudeLineStreamer {
  return async function* wrapped(call: ClaudeProcessCall): AsyncIterable<ClaudeStreamChunk> {
    const result = await processRunner(call);
    for (const line of result.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      yield { type: 'line', line };
    }
    yield { type: 'exit', code: result.code, stderr: result.stderr || result.stdout };
  };
}

async function* defaultClaudeLineStreamer(call: ClaudeProcessCall): AsyncIterable<ClaudeStreamChunk> {
  const child = spawn(call.command, call.args, { cwd: expandTilde(call.cwd) ?? call.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: useShellForCli() });
  child.stdin.end(call.input);

  const onAbort = () => {
    terminateChild(child);
  };
  if (call.signal) {
    if (call.signal.aborted) onAbort();
    else call.signal.addEventListener('abort', onAbort, { once: true });
  }

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
