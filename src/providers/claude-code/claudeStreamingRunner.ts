import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expandTilde } from '../../shared/expandTilde';
import { terminateChild, useShellForCli } from '../../shared/platform';
import { extractAssistantBlocks } from './assistantContent';
import type { ClaudeRunner, ClaudeRunnerEvent, ClaudeRunnerSession } from './claudeRunner';

// A persistent claude session driven over stream-json stdio. Unlike the
// one-shot headless runner, the child process stays alive across turns: each
// user message is an NDJSON envelope written to stdin, output is an NDJSON event
// stream on stdout, and the turn boundary is the `result` event. This unlocks
// native session warmth, native interrupt (a control_request), and native
// queueing of follow-up messages (processed as the next turn).

export type ClaudeStreamChunk =
  | { type: 'line'; line: string }
  | { type: 'exit'; code: number | string; stderr: string };

export type ClaudeStreamHandle = {
  write(line: string): void;
  read(): Promise<ClaudeStreamChunk>;
  close(): void;
};

export type ClaudeStreamSpawner = (call: { command: string; args: string[]; cwd: string }) => ClaudeStreamHandle;

type StreamingSession = ClaudeRunnerSession & {
  claudeSessionId?: string;
  sessionName?: string;
  handle?: ClaudeStreamHandle;
  resumeId?: string;
  pendingFollowUps: number;
};

export class ClaudeStreamingRunner implements ClaudeRunner {
  private readonly sessions = new Map<string, StreamingSession>();
  private readonly command: string;
  private readonly spawner: ClaudeStreamSpawner;

  constructor(input: { command?: string; spawner?: ClaudeStreamSpawner } = {}) {
    this.command = input.command ?? 'claude';
    this.spawner = input.spawner ?? defaultClaudeStreamSpawner;
  }

  async startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: { providerSessionId?: string; sessionName?: string };
  }): Promise<ClaudeRunnerSession> {
    const resumeId = input.options?.providerSessionId;
    const session: StreamingSession = {
      bridgeSessionId: input.bridgeSessionId,
      providerId: 'claude-code',
      providerSessionId: resumeId,
      claudeSessionId: resumeId,
      sessionName: input.options?.sessionName,
      cwd: input.cwd,
      status: 'idle',
      resumeId,
      pendingFollowUps: 0,
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ClaudeRunnerEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`claude_session_not_found:${input.bridgeSessionId}`);
    const handle = this.ensureHandle(session);
    session.pendingFollowUps = 0;
    handle.write(userEnvelope(input.text));

    while (true) {
      const chunk = await handle.read();
      if (chunk.type === 'exit') {
        session.handle = undefined;
        yield { type: 'error', error: chunk.stderr || `claude stream exited with ${chunk.code}` };
        return;
      }
      const value = parseJsonLine(chunk.line);
      if (!value) continue;
      const record = value as Record<string, unknown>;
      const type = record.type;

      if (type === 'user' && record.isReplay === true) continue; // delivery ack only

      if (type === 'system' && record.subtype === 'init') {
        const sessionId = typeof record.session_id === 'string' ? record.session_id : undefined;
        if (sessionId) {
          session.providerSessionId = sessionId;
          session.claudeSessionId = sessionId;
          session.resumeId = sessionId;
          yield {
            type: 'session_state',
            state: {
              bridgeSessionId: input.bridgeSessionId,
              providerId: 'claude-code',
              providerSessionId: sessionId,
              cwd: session.cwd,
              status: 'running',
            },
          };
        }
        continue;
      }

      if (type === 'assistant') {
        let emitted = false;
        for (const block of extractAssistantBlocks(record.message)) {
          yield { type: 'text_delta', text: block.text };
          if (block.type === 'choice' && block.labels.length > 0) {
            yield { type: 'choice_prompt', labels: block.labels, multiSelect: block.multiSelect };
          }
          emitted = true;
        }
        if (emitted) yield { type: 'message_done' };
        continue;
      }

      if (type === 'result') {
        const sessionId = typeof record.session_id === 'string' ? record.session_id : undefined;
        if (sessionId) {
          session.providerSessionId = sessionId;
          session.claudeSessionId = sessionId;
          session.resumeId = sessionId;
        }
        yield { type: 'message_done' };
        // Each `result` ends one turn. If follow-ups were queued mid-turn, keep
        // consuming so the same generation streams those queued turns too.
        if (session.pendingFollowUps > 0) {
          session.pendingFollowUps -= 1;
          continue;
        }
        return;
      }

      if (type === 'error') {
        yield { type: 'error', error: extractError(record) };
      }
    }
  }

  // Native steer for Claude = write a follow-up user envelope into the live
  // process. Claude queues it and processes it as the next turn; the active
  // sendMessage keeps consuming so its output reaches the channel.
  async steerSession(bridgeSessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(bridgeSessionId);
    if (!session?.handle) return;
    session.handle.write(userEnvelope(text));
    session.pendingFollowUps += 1;
  }

  async interruptSession(bridgeSessionId: string): Promise<void> {
    const session = this.sessions.get(bridgeSessionId);
    session?.handle?.write(`${JSON.stringify({ type: 'control_request', request_id: `int_${randomUUID()}`, request: { subtype: 'interrupt' } })}\n`);
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    const session = this.sessions.get(bridgeSessionId);
    session?.handle?.close();
    this.sessions.delete(bridgeSessionId);
  }

  private ensureHandle(session: StreamingSession): ClaudeStreamHandle {
    if (session.handle) return session.handle;
    const args = buildStreamingArgs(session);
    session.handle = this.spawner({ command: this.command, args, cwd: session.cwd });
    return session.handle;
  }
}

function buildStreamingArgs(session: StreamingSession): string[] {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--dangerously-skip-permissions',
    '--replay-user-messages',
  ];
  if (session.resumeId) {
    args.push('--resume', session.resumeId);
  } else {
    const minted = randomUUID();
    session.resumeId = minted;
    session.providerSessionId = minted;
    session.claudeSessionId = minted;
    args.push('--session-id', minted);
  }
  if (session.sessionName) args.push('-n', session.sessionName);
  return args;
}

function userEnvelope(text: string): string {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })}\n`;
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

function defaultClaudeStreamSpawner(call: { command: string; args: string[]; cwd: string }): ClaudeStreamHandle {
  const child = spawn(call.command, call.args, { cwd: expandTilde(call.cwd) ?? call.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: useShellForCli() });
  let stderr = '';
  let buffer = '';
  const queue: ClaudeStreamChunk[] = [];
  let resolveNext: ((chunk: ClaudeStreamChunk) => void) | null = null;

  const push = (chunk: ClaudeStreamChunk) => {
    const resolve = resolveNext;
    if (resolve) {
      resolveNext = null;
      resolve(chunk);
    } else {
      queue.push(chunk);
    }
  };

  child.stdout.on('data', (data) => {
    buffer += String(data);
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      if (line.trim()) push({ type: 'line', line });
    }
  });
  child.stderr.on('data', (data) => { stderr += String(data); });
  child.on('error', (error: NodeJS.ErrnoException) => {
    push({ type: 'exit', code: error.code ?? 'ERROR', stderr: stderr || error.message });
  });
  child.on('close', (code) => {
    if (buffer.trim()) push({ type: 'line', line: buffer });
    push({ type: 'exit', code: code ?? 'SIGNAL', stderr });
  });

  return {
    write(line: string) {
      child.stdin.write(line);
    },
    read() {
      const next = queue.shift();
      if (next) return Promise.resolve(next);
      return new Promise<ClaudeStreamChunk>((resolve) => { resolveNext = resolve; });
    },
    close() {
      try { child.stdin.end(); } catch { /* already closed */ }
      terminateChild(child);
    },
  };
}
