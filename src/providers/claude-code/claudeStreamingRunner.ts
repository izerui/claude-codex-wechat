import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expandTilde } from '../../shared/expandTilde';
import { terminateChild, useShellForCli } from '../../shared/platform';
import { resolveLoginShellEnv } from '../../shared/loginShellEnv';
import { controlResponse, promptFor, readCanUseTool } from './canUseTool';
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
  /** 进程已经退出（崩溃、被关掉）：不能再往里写，下一条消息要重新拉起。 */
  readonly exited?: boolean;
};

export type ClaudeStreamSpawner = (call: { command: string; args: string[]; cwd: string }) => ClaudeStreamHandle;

const IDLE_SENTINEL = Symbol('idle_timeout');

export function capTail(text: string, capBytes: number): string {
  if (capBytes <= 0 || text.length <= capBytes) return text;
  return text.slice(text.length - capBytes);
}

// 到点时问 extraWait() 还要再等多久（毫秒，0 即判卡死）：CLI 正停着等人作答时整段重计，
// 刚作答过则从作答那一刻起算。继续等的是同一次读取——不能另起一次 read，那会顶掉还挂着的那次。
function readWithIdleTimeout(
  handle: ClaudeStreamHandle,
  ms: number,
  extraWait: () => number = () => 0,
): Promise<ClaudeStreamChunk | typeof IDLE_SENTINEL> {
  if (!ms || ms <= 0) return handle.read();
  return new Promise((resolve) => {
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
  /** 还没作答的 can_use_tool 请求数。等人期间 CLI 本来就没有输出，不算卡死。 */
  awaitingUser: number;
  /** 最近一次作答的时刻：卡死判定从这一刻重新起算。 */
  answeredAt: number;
  backgroundTasks: Map<string, { id: string; description?: string }>;
  observingBackground: boolean;
  turnOpen: boolean;
  hasBackgroundSnapshot: boolean;
  /** 收到后台任务的完成通知、CLI 还没为它开新一轮：要等那一轮的结论。 */
  notificationPending: boolean;
  /** 有一次生成正在读这个进程的输出。没人读时插话写进去，它的回复就没人转发，之后每条都错开一条。 */
  reading: boolean;
  /** 用户批准计划时选了「执行但逐个确认」：这一轮结束时切回跳过权限，逐个确认只限这个计划的执行期间。 */
  restoreBypassAfterTurn: boolean;
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
  private readonly idleCloseMs: number;
  private readonly idleCloseTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    /** 空闲（一次生成彻底结束、后台也没有任务）多久后关掉进程；下一条消息再 --resume 拉起。0 为不关。 */
    idleCloseMs?: number;
  } = {}) {
    this.command = input.command ?? 'claude';
    this.idleCloseMs = input.idleCloseMs ?? 30 * 60 * 1000;
    this.capabilityProbe = input.capabilityProbe ?? probeAppendSystemPromptSupport;
    this.mcpConfigPath = input.mcpConfigPath;
    this.idleTimeoutMs = input.idleTimeoutMs ?? 0;
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
      awaitingUser: 0,
      answeredAt: 0,
      backgroundTasks: new Map(),
      observingBackground: false,
      turnOpen: false,
      hasBackgroundSnapshot: false,
      notificationPending: false,
      reading: false,
      restoreBypassAfterTurn: false,
    };
    this.sessions.set(input.bridgeSessionId, session);
    return session;
  }

  // 空闲回收：生成期间（前台在跑、等人作答、后台任务未完）不计时，生成结束才开始计时
  async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ClaudeRunnerEvent> {
    this.cancelIdleClose(input.bridgeSessionId);
    const session = this.sessions.get(input.bridgeSessionId);
    if (session) session.reading = true;
    try {
      yield* this.streamTurn(input);
    } finally {
      if (session) session.reading = false;
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
      if (!session?.handle) return;
      // 只关进程、保留会话：下一条消息经 ensureHandle 以 --resume 重新拉起
      session.handle.close();
      session.handle = undefined;
    }, this.idleCloseMs);
    (timer as { unref?: () => void }).unref?.();
    this.idleCloseTimers.set(bridgeSessionId, timer);
  }

  private async *streamTurn(input: { bridgeSessionId: string; text: string }): AsyncIterable<ClaudeRunnerEvent> {
    const session = this.sessions.get(input.bridgeSessionId);
    if (!session) throw new Error(`claude_session_not_found:${input.bridgeSessionId}`);
    if (session.supportsAppendSystemPrompt === undefined) {
      session.supportsAppendSystemPrompt = await this.capabilityProbe(this.command);
    }
    const handle = this.ensureHandle(session);
    // 本次生成里还没作答的请求，按 request_id；CLI 撤回时据此作废
    const openPrompts = new Map<string, () => boolean>();
    session.pendingFollowUps = 0;
    session.awaitingUser = 0;
    session.turnOpen = true;
    handle.write(userEnvelope(input.text));

    while (true) {
      const chunk = await readWithIdleTimeout(handle, this.idleTimeoutMs, () => session.awaitingUser > 0 || (session.observingBackground && !session.turnOpen)
        ? this.idleTimeoutMs
        : Math.max(0, session.answeredAt + this.idleTimeoutMs - Date.now()));
      if (chunk === IDLE_SENTINEL) {
        handle.close();
        session.handle = undefined;
        session.reading = false;
        yield { type: 'error', error: 'idle_timeout', code: 'idle_timeout' };
        return;
      }
      if (chunk.type === 'exit') {
        session.handle = undefined;
        session.reading = false;
        if (!this.sessions.has(input.bridgeSessionId) || (chunk.code === 0 && !session.turnOpen && session.backgroundTasks.size === 0)) return;
        yield { type: 'error', error: chunk.stderr || `claude stream exited with ${chunk.code}` };
        return;
      }
      const value = parseJsonLine(chunk.line);
      if (!value) continue;
      const record = value as Record<string, unknown>;
      const type = record.type;

      if (type === 'system') {
        // 后台任务完成通知之后，CLI 一定会为它再跑一轮（先发 init 再开始）
        if (record.subtype === 'task_notification') session.notificationPending = true;
        if (record.subtype === 'init') session.notificationPending = false;
        let changed = false;
        if (record.subtype === 'background_tasks_changed' && Array.isArray(record.tasks)) {
          session.hasBackgroundSnapshot = true;
          session.backgroundTasks.clear();
          for (const task of record.tasks) {
            if (task && typeof task.task_id === 'string' && task.ambient !== true) {
              session.backgroundTasks.set(task.task_id, { id: task.task_id, ...(typeof task.description === 'string' ? { description: task.description } : {}) });
            }
          }
          changed = true;
        } else if (!session.hasBackgroundSnapshot && record.subtype === 'task_started' && record.is_backgrounded === true && record.ambient !== true && typeof record.task_id === 'string') {
          session.backgroundTasks.set(record.task_id, { id: record.task_id, ...(typeof record.description === 'string' ? { description: record.description } : {}) });
          changed = true;
        } else if (!session.hasBackgroundSnapshot && record.subtype === 'task_notification' && typeof record.task_id === 'string') {
          changed = session.backgroundTasks.delete(record.task_id);
        } else if (!session.hasBackgroundSnapshot && record.subtype === 'task_updated' && typeof record.task_id === 'string' && record.patch && typeof record.patch === 'object') {
          const patch = record.patch as Record<string, unknown>;
          if (['completed', 'failed', 'killed'].includes(String(patch.status))) {
            changed = session.backgroundTasks.delete(record.task_id);
          } else if (patch.is_backgrounded === true || session.backgroundTasks.has(record.task_id)) {
            session.backgroundTasks.set(record.task_id, {
              id: record.task_id,
              description: typeof patch.description === 'string' ? patch.description : session.backgroundTasks.get(record.task_id)?.description,
            });
            changed = true;
          }
        }
        if (changed) yield { type: 'background_tasks', tasks: [...session.backgroundTasks.values()] };
      }

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
        // 子代理的输出（parent_tool_use_id 非空）不是这条会话里助手对人说的话
        if (typeof record.parent_tool_use_id === 'string') continue;
        session.turnOpen = true;
        let text = false;
        for (const block of assistantContent(record.message)) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text) {
            yield { type: 'text_delta', text: block.text };
            text = true;
          } else if (block.type === 'tool_use' && typeof block.name === 'string') {
            if (text) yield { type: 'message_done' };
            text = false;
            yield { type: 'tool_event', title: block.name };
          }
        }
        if (text) yield { type: 'message_done' };
        continue;
      }

      const canUseTool = readCanUseTool(record);
      if (canUseTool) {
        session.awaitingUser += 1;
        let answered = false;
        const settle = () => {
          if (answered) return false;
          answered = true;
          openPrompts.delete(canUseTool.requestId);
          session.awaitingUser = Math.max(0, session.awaitingUser - 1);
          session.answeredAt = Date.now();
          return true;
        };
        openPrompts.set(canUseTool.requestId, settle);
        yield {
          type: 'user_prompt',
          id: canUseTool.requestId,
          prompt: promptFor(canUseTool),
          respond: (reply) => {
            if (!settle()) return;
            if (reply.kind === 'approve' && reply.permissionMode) session.restoreBypassAfterTurn = reply.permissionMode === 'default';
            // 进程已被回收（超时、换会话）时没人在等这个回答
            if (session.handle === handle) handle.write(controlResponse(canUseTool, reply));
          },
        };
        continue;
      }

      // CLI 撤回了还没作答的请求：不再等它，也不再回写
      if (type === 'control_cancel_request' && typeof record.request_id === 'string') {
        const settle = openPrompts.get(record.request_id);
        if (settle?.()) yield { type: 'user_prompt_withdrawn', id: record.request_id };
        continue;
      }

      // 其余 CLI 发来的控制请求（MCP elicitation 等）桥接接不了：回错误，CLI 才不会一直等
      if (type === 'control_request' && typeof record.request_id === 'string') {
        handle.write(unsupportedControlResponse(record.request_id, record.request));
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
        session.awaitingUser = 0;
        if (session.restoreBypassAfterTurn) {
          session.restoreBypassAfterTurn = false;
          handle.write(setPermissionModeRequest('bypassPermissions'));
        }
        session.turnOpen = false;
        yield { type: 'message_done' };
        const resultError = extractResultError(record);
        if (resultError) yield { type: 'error', error: resultError };
        yield { type: 'turn_end' };
        // Each `result` ends one turn. If follow-ups were queued mid-turn, keep
        // consuming so the same generation streams those queued turns too.
        if (session.pendingFollowUps > 0) {
          session.pendingFollowUps -= 1;
          continue;
        }
        // 后台还有任务在跑，或者完成通知已到、CLI 还要为它再跑一轮：接着读，那一轮的结论照常发出。
        // 两者都没有了就结束这次生成，不能一直挂着（否则会话一直停在「回复中」）。
        if (session.backgroundTasks.size || session.notificationPending) {
          session.observingBackground = true;
          continue;
        }
        session.observingBackground = false;
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
  async steerSession(bridgeSessionId: string, text: string): Promise<boolean> {
    const session = this.sessions.get(bridgeSessionId);
    // 没有生成在读（这一次已收尾、或进程已退出）：交回路由正常排队开新一轮
    if (!session?.reading || !session.handle || session.handle.exited) return false;
    session.handle.write(userEnvelope(text));
    // 前台有一轮在跑：插话排在它后面，要多等一个 result。前台已停、只在等后台时，
    // 插话这一轮就是要等的那一轮——多记一个会把它的 result 当成「还有下一轮」吞掉，这次生成就永远结束不了
    if (session.turnOpen) session.pendingFollowUps += 1;
    session.turnOpen = true;
    return true;
  }

  async interruptSession(bridgeSessionId: string): Promise<void> {
    const session = this.sessions.get(bridgeSessionId);
    session?.handle?.write(`${JSON.stringify({ type: 'control_request', request_id: `int_${randomUUID()}`, request: { subtype: 'interrupt' } })}\n`);
  }

  async stopSession(bridgeSessionId: string): Promise<void> {
    this.cancelIdleClose(bridgeSessionId);
    const session = this.sessions.get(bridgeSessionId);
    session?.handle?.close();
    // 还挂着的作答回调据此认出进程已回收，不再往已关闭的 stdin 写
    if (session) session.handle = undefined;
    this.sessions.delete(bridgeSessionId);
  }

  private ensureHandle(session: StreamingSession): ClaudeStreamHandle {
    // 进程在两条消息之间自己退出了：重新拉起并 --resume 原会话，这条消息不能发给死进程
    if (session.handle && !session.handle.exited && !this.shouldRetire(session)) return session.handle;
    if (session.handle) {
      session.handle.close();
      session.handle = undefined;
    }
    const args = buildStreamingArgs(session, this.mcpConfigPath);
    session.handle = this.spawner({ command: this.command, args, cwd: session.cwd });
    session.spawnedAt = Date.now();
    session.turnCount = 0;
    session.backgroundTasks.clear();
    session.hasBackgroundSnapshot = false;
    session.observingBackground = false;
    session.notificationPending = false;
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
    // 仍要人决定的调用（提问、计划确认）经 stdio 控制协议交给桥接，由微信作答
    '--permission-prompt-tool', 'stdio',
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

function setPermissionModeRequest(mode: string): string {
  return `${JSON.stringify({ type: 'control_request', request_id: `mode_${randomUUID()}`, request: { subtype: 'set_permission_mode', mode } })}\n`;
}

function unsupportedControlResponse(requestId: string, request: unknown): string {
  const subtype = request && typeof request === 'object' ? (request as Record<string, unknown>).subtype : undefined;
  return `${JSON.stringify({
    type: 'control_response',
    response: { subtype: 'error', request_id: requestId, error: `微信桥接不支持此控制请求：${String(subtype)}` },
  })}\n`;
}

function assistantContent(message: unknown): Array<Record<string, unknown>> {
  if (!message || typeof message !== 'object') return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content.filter((block): block is Record<string, unknown> => !!block && typeof block === 'object');
}

function userEnvelope(text: string): string {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })}\n`;
}

// Claude CLI 不用 type:"error" 表达失败，而是 result + is_error:true
// （如 subtype:"error_max_turns"）。原样保留错误文本，避免丢失排查信息。
export function extractResultError(record: Record<string, unknown>): string | undefined {
  if (record.is_error !== true) return undefined;
  const errors = record.errors;
  if (Array.isArray(errors)) {
    const joined = errors.filter((item) => typeof item === 'string' && item).join('; ');
    if (joined) return joined;
  }
  if (typeof record.result === 'string' && record.result) return record.result;
  if (typeof record.subtype === 'string' && record.subtype) return record.subtype;
  return JSON.stringify(record);
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
  let exited = false;

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
  // 进程已退出时写 stdin 会报 EPIPE；不接住就是未捕获异常，整个 daemon 跟着崩。退出由 close 事件报告。
  child.stdin.on('error', () => undefined);
  child.on('error', (error: NodeJS.ErrnoException) => {
    exited = true;
    push({ type: 'exit', code: error.code ?? 'ERROR', stderr: stderr || error.message });
  });
  child.on('close', (code) => {
    exited = true;
    if (buffer.trim()) push({ type: 'line', line: buffer });
    push({ type: 'exit', code: code ?? 'SIGNAL', stderr });
  });

  return {
    get exited() {
      return exited;
    },
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
