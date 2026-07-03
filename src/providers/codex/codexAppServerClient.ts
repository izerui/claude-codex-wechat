import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { terminateChild, useShellForCli } from '../../shared/platform';

type JsonRpcMessage = {
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

type NotificationHandler = (params: unknown) => void;
type RequestHandler = (id: string | number, params: unknown) => Promise<unknown> | unknown;

export class CodexAppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private readonly notificationHandlers = new Map<string, Set<NotificationHandler>>();
  private readonly requestHandlers = new Map<string, RequestHandler>();
  private nextId = 1;
  private disposed = false;
  private buffer = '';

  constructor(input: { command?: string; cwd: string; profile?: string }) {
    const command = input.command ?? 'codex';
    this.child = spawn(command, ['app-server', '--listen', 'stdio://', ...(input.profile ? ['--profile', input.profile] : [])], {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: useShellForCli(),
    });
    this.child.stdout.on('data', (chunk) => this.onStdout(String(chunk)));
    this.child.stderr.on('data', () => {
      // Ignore stderr noise from Codex app-server unless the process dies.
    });
    this.child.on('error', (error) => this.failAll(error instanceof Error ? error : new Error(String(error))));
    this.child.on('close', (code) => {
      this.failAll(new Error(`codex_app_server_closed:${code ?? 'signal'}`));
    });
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      clientInfo: {
        name: 'claude-codex-wechat',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    await this.notify('initialized');
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (this.disposed) throw new Error('codex_app_server_disposed');
    const id = this.nextId++;
    const key = String(id);
    const payload = { id, method, ...(params !== undefined ? { params } : {}) };
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(key, { resolve, reject });
    });
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return await response;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (this.disposed) throw new Error('codex_app_server_disposed');
    const payload = { method, ...(params !== undefined ? { params } : {}) };
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  onNotification(method: string, handler: NotificationHandler): () => void {
    const handlers = this.notificationHandlers.get(method) ?? new Set<NotificationHandler>();
    handlers.add(handler);
    this.notificationHandlers.set(method, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.notificationHandlers.delete(method);
    };
  }

  onRequest(method: string, handler: RequestHandler): () => void {
    this.requestHandlers.set(method, handler);
    return () => {
      if (this.requestHandlers.get(method) === handler) {
        this.requestHandlers.delete(method);
      }
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    terminateChild(this.child);
    this.failAll(new Error('codex_app_server_disposed'));
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline === -1) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch {
        continue;
      }
      void this.handleMessage(message);
    }
  }

  private async handleMessage(message: JsonRpcMessage): Promise<void> {
    if (message.method && message.id !== undefined && message.id !== null) {
      const handler = this.requestHandlers.get(message.method);
      if (!handler) {
        this.child.stdin.write(`${JSON.stringify({
          id: message.id,
          error: { code: -32601, message: `unhandled_method:${message.method}` },
        })}\n`);
        return;
      }
      try {
        const result = await handler(message.id, message.params);
        this.child.stdin.write(`${JSON.stringify({ id: message.id, result })}\n`);
      } catch (error) {
        this.child.stdin.write(`${JSON.stringify({
          id: message.id,
          error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
        })}\n`);
      }
      return;
    }

    if (message.method) {
      const handlers = this.notificationHandlers.get(message.method);
      if (!handlers) return;
      for (const handler of handlers) handler(message.params);
      return;
    }

    if (message.id === undefined || message.id === null) return;
    const key = String(message.id);
    const pending = this.pending.get(key);
    if (!pending) return;
    this.pending.delete(key);
    if (message.error) {
      pending.reject(new Error(message.error.message || `codex_app_server_error:${message.error.code ?? 'unknown'}`));
      return;
    }
    pending.resolve(message.result);
  }

  private failAll(error: Error): void {
    if (this.pending.size === 0) return;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }
}
