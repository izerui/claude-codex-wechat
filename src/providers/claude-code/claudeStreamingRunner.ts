import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expandTilde } from '../../shared/expandTilde';
import { terminateChild, useShellForCli } from '../../shared/platform';
import { resolveLoginShellEnv } from '../../shared/loginShellEnv';
import { extractAssistantBlocks } from './assistantContent';
import { BRIDGE_APPEND_SYSTEM_PROMPT } from './bridgeSystemPrompt';
import { probeAppendSystemPromptSupport, type ClaudeCapabilityProbe } from './claudeCapabilities';
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

const IDLE_SENTINEL = Symbol('idle_timeout');

export function capTail(text: string, capBytes: number): string {
  if (capBytes <= 0 || text.length <= capBytes) return text;
  return text.slice(text.length - capBytes);
}

function readWithIdleTimeout(
  handle: ClaudeStreamHandle,
  ms: number,
): Promise<ClaudeStreamChunk | typeof IDLE_SENTINEL> {
  if (!ms || ms <= 0) return handle.read();
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(IDLE_SENTINEL); } }, ms);
    (timer as { unref?: () => void }).unref?.();
    void handle.read().then((chunk) => { if (!settled) { settled = true; clearTimeout(timer); resolve(chunk); } });
  });
}

type StreamingSession = ClaudeRunnerSession & {
  claudeSessionId?: string;
  sessionName?: string;
  handle?: ClaudeStreamHandle;
  resumeId?: string;
  pendingFollowUps: number;
  supportsAppendSystemPrompt?: boolean;
  spawnedAt?: number;
  turnCount: number;
};

export class ClaudeStreamingRunner implements ClaudeRunner {
  private readonly sessions = new Map<string, StreamingSession>();
  private readonly command: string;
  private readonly spawner: ClaudeStreamSpawner;
  private readonly capabilityProbe: ClaudeCapabilityProbe;
  private readonly mcpConfigPath?: string;
  private readonly idleTimeoutMs: number;
  private readonly maxProcessAgeMs: number;
  private readonly maxTurns: number;
  private readonly stderrCapBytes: number;
  private readonly maxLineBytes: number;

  constructor(input: {
    command?: string;
    spawner?: ClaudeStreamSpawner;
    capabilityProbe?: ClaudeCapabilityProbe;
    mcpConfigPath?: string;
    idleTimeoutMs?: number;
    maxProcessAgeMs?: number;
    maxTurns?: number;
    stderrCapBytes?: number;
    maxLineBytes?: number;
  } = {}) {
    this.command = input.command ?? 'claude';
    this.capabilityProbe = input.capabilityProbe ?? probeAppendSystemPromptSupport;
    this.mcpConfigPath = input.mcpConfigPath;
    this.idleTimeoutMs = input.idleTimeoutMs ?? 180_000;
    this.maxProcessAgeMs = input.maxProcessAgeMs ?? 2 * 60 * 60 * 1000;
    this.maxTurns = input.maxTurns ?? 50;
    this.stderrCapBytes = input.stderrCapBytes ?? 64 * 1024;
    this.maxLineBytes = input.maxLineBytes ?? 10 * 1024 * 1024;
    this.spawner = input.spawner
      ?? ((call) => defaultClaudeStreamSpawner(call, { stderrCapBytes: this.stderrCapBytes, maxLineBytes: this.maxLineBytes }));
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
      turnCount: 0,
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ClaudeRunnerEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`claude_session_not_found:${input.bridgeSessionId}`);
    if (session.supportsAppendSystemPrompt === undefined) {
      session.supportsAppendSystemPrompt = await this.capabilityProbe(this.command);
    }
    const handle = this.ensureHandle(session);
    session.pendingFollowUps = 0;
    handle.write(userEnvelope(input.text));

    while (true) {
      const chunk = await readWithIdleTimeout(handle, this.idleTimeoutMs);
      if (chunk === IDLE_SENTINEL) {
        handle.close();
        session.handle = undefined;
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
        return;
      }
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
        session.turnCount += 1;
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
    if (session.handle && !this.shouldRetire(session)) return session.handle;
    if (session.handle) {
      session.handle.close();
      session.handle = undefined;
    }
    const args = buildStreamingArgs(session, this.mcpConfigPath);
    session.handle = this.spawner({ command: this.command, args, cwd: session.cwd });
    session.spawnedAt = Date.now();
    session.turnCount = 0;
    return session.handle;
  }

  private shouldRetire(session: StreamingSession): boolean {
    if (this.maxTurns > 0 && session.turnCount >= this.maxTurns) return true;
    if (this.maxProcessAgeMs > 0 && session.spawnedAt && Date.now() - session.spawnedAt >= this.maxProcessAgeMs) return true;
    return false;
  }
}

function buildStreamingArgs(session: StreamingSession, mcpConfigPath?: string): string[] {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--dangerously-skip-permissions',
    ...(session.supportsAppendSystemPrompt ? ['--append-system-prompt', BRIDGE_APPEND_SYSTEM_PROMPT] : []),
    '--replay-user-messages',
    ...(mcpConfigPath ? ['--mcp-config', mcpConfigPath] : []),
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

function defaultClaudeStreamSpawner(call: { command: string; args: string[]; cwd: string }, opts: { stderrCapBytes?: number; maxLineBytes?: number } = {}): ClaudeStreamHandle {
  const stderrCapBytes = opts.stderrCapBytes ?? 64 * 1024;
  const maxLineBytes = opts.maxLineBytes ?? 10 * 1024 * 1024;
  const child = spawn(call.command, call.args, { cwd: expandTilde(call.cwd) ?? call.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: useShellForCli(), env: resolveLoginShellEnv() ?? process.env });
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
    // 单行未闭合且已超上限:丢弃防爆内存(正常 NDJSON 行不会这么大)。
    if (buffer.length > maxLineBytes) {
      stderr = capTail(stderr + `\n[bridge] dropped oversized line buffer (${buffer.length} bytes)\n`, stderrCapBytes);
      buffer = '';
    }
  });
  child.stderr.on('data', (data) => { stderr = capTail(stderr + String(data), stderrCapBytes); });
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
