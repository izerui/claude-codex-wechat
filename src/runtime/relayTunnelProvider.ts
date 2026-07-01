import type { TunnelProvider, TunnelStatusView } from './tunnelProvider';

type RelaySocket = {
  readyState?: number;
  send(payload: string): void;
  close(): void;
  on(event: 'open' | 'close' | 'error' | 'message', listener: (...args: any[]) => void): void;
};

export class RelayTunnelProvider implements TunnelProvider {
  private socket: RelaySocket | null = null;
  private status: TunnelStatusView = {
    installed: true,
    running: false,
    status: 'stopped',
  };
  private stopped = true;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // 能力协商结果:仅当服务器在 registered 回包里声明 streaming:true 时才走流式,
  // 否则退回缓冲(兼容老服务器)。
  private serverSupportsStreaming = false;

  constructor(private readonly options: {
    serverUrl: string;
    authToken: string;
    targetBaseUrl: string;
    createSocket: (url: string) => RelaySocket;
    fetchImpl?: typeof fetch;
    /** 重连退避上限（毫秒），默认 30s。 */
    maxReconnectDelayMs?: number;
  }) {}

  static defaultCreateSocket(url: string): RelaySocket {
    const socket = new WebSocket(url);
    return {
      get readyState() {
        return socket.readyState;
      },
      send(payload: string) {
        socket.send(payload);
      },
      close() {
        socket.close();
      },
      on(event, listener) {
        socket.addEventListener(event, listener as EventListener);
      },
    };
  }

  async getStatus(): Promise<TunnelStatusView> {
    return { ...this.status };
  }

  async start(): Promise<TunnelStatusView> {
    this.stopped = false;
    return await this.connect();
  }

  async stop(): Promise<TunnelStatusView> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.status = {
      installed: true,
      running: false,
      status: 'stopped',
    };
    return { ...this.status };
  }

  // 单次连接尝试：成功注册即 resolve。底层连接断开（close/error）时，
  // 只要未被 stop()，就按指数退避自动重连，直到恢复。
  private connect(): Promise<TunnelStatusView> {
    this.status = {
      ...this.status,
      status: 'starting',
    };
    const socket = this.options.createSocket(this.options.serverUrl);
    this.socket = socket;
    return new Promise<TunnelStatusView>((resolve, reject) => {
      let settled = false;
      const finishResolve = (value: TunnelStatusView) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const finishReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      socket.on('open', () => {
        socket.send(JSON.stringify({
          type: 'register',
          clientVersion: '0.1.0',
          targetBaseUrl: this.options.targetBaseUrl,
          authToken: this.options.authToken,
          // 声明支持流式转发。新服务器会在 registered 回包里回 streaming:true;
          // 老服务器忽略此字段,客户端据此自动退回缓冲。
          supportsStreaming: true,
        }));
      });
      socket.on('message', (raw) => {
        const payload = typeof raw === 'string' ? JSON.parse(raw) : typeof raw?.data === 'string' ? JSON.parse(raw.data) : raw;
        if (payload?.type === 'error') {
          const message = typeof payload?.error === 'string' && payload.error ? payload.error : 'relay_error';
          this.status = {
            ...this.status,
            running: false,
            status: 'error',
            error: message,
          };
          finishReject(new Error(message));
          // 注册被服务端拒绝（如旧实现的 auth_token_in_use，或瞬时冲突）后，
          // 服务端通常会随即关闭连接；但不依赖 close 事件，这里主动排程一次退避
          // 重连，确保任何错误都能自愈，不会停在 error 状态等人工重启。
          this.scheduleReconnect();
          return;
        }
        if (payload?.type === 'registered') {
          // 注册成功，重置退避计数，下次断开从最短间隔重连。
          this.reconnectAttempts = 0;
          // 记录服务器是否支持流式转发;只有支持时 handleRequest 才走流式协议。
          this.serverSupportsStreaming = payload?.streaming === true;
          const publicUrl = typeof payload?.publicUrl === 'string' && payload.publicUrl
            ? payload.publicUrl
            : typeof payload?.token === 'string'
              ? `${derivePublicBaseUrl(this.options.serverUrl)}/${payload.token}`
            : undefined;
          this.status = {
            installed: true,
            running: true,
            status: 'running',
            ...(publicUrl ? { publicUrl } : {}),
          };
          finishResolve({ ...this.status });
          return;
        }
        if (payload?.type === 'request') {
          void this.handleRequest(payload);
        }
      });
      socket.on('close', () => {
        // stop() 主动关闭后到达的迟到事件不应改写状态或触发重连。
        if (this.stopped) {
          finishReject(new Error('relay_stopped'));
          return;
        }
        this.status = {
          ...this.status,
          running: false,
          status: 'error',
          error: 'relay_disconnected',
        };
        finishReject(new Error('relay_disconnected'));
        this.scheduleReconnect();
      });
      socket.on('error', (error) => {
        if (this.stopped) {
          finishReject(new Error('relay_stopped'));
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.status = {
          ...this.status,
          running: false,
          status: 'error',
          error: message,
        };
        finishReject(error);
        this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    // 已有待触发的重连则不重复排程（close 与 error 可能先后到达）。
    if (this.reconnectTimer) return;
    const maxDelay = this.options.maxReconnectDelayMs ?? 30_000;
    const delay = Math.min(maxDelay, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      // 后台重连：失败会再次触发 close/error，进而重新排程。
      void this.connect().catch(() => undefined);
    }, delay);
    // 不阻止进程退出。
    (this.reconnectTimer as { unref?: () => void }).unref?.();
  }

  private async handleRequest(payload: {
    requestId: string;
    method: string;
    path: string;
    headers?: Record<string, string>;
    bodyBase64?: string;
  }): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.options.targetBaseUrl}${payload.path}`, {
      method: payload.method,
      headers: payload.headers,
      body: payload.bodyBase64 ? Buffer.from(payload.bodyBase64, 'base64') : undefined,
    });
    if (this.serverSupportsStreaming) {
      await this.streamResponse(payload.requestId, response);
      return;
    }
    // 老服务器不支持流式:退回缓冲——读完整个响应体再一次性回传(原行为)。
    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    this.socket?.send(JSON.stringify({
      type: 'response',
      requestId: payload.requestId,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      bodyBase64: bodyBuffer.toString('base64'),
    }));
  }

  // 流式回传:把响应拆成 response-start → response-chunk* → response-end 三段边收边发。
  // 不区分 content-type——服务器按 content-type 决定透传还是收齐重写(html/js/css)。
  // 对无限流(SSE)这是关键:响应体永不结束,绝不能 await 读完再发。
  private async streamResponse(requestId: string, response: Response): Promise<void> {
    const status = response.status;
    const headers = Object.fromEntries(response.headers.entries());
    this.socket?.send(JSON.stringify({ type: 'response-start', requestId, status, headers }));
    try {
      const body = response.body;
      if (body) {
        // Node 18+ 的 fetch 响应体是可异步迭代的 Web ReadableStream。
        for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
          this.socket?.send(JSON.stringify({
            type: 'response-chunk',
            requestId,
            chunkBase64: Buffer.from(chunk).toString('base64'),
          }));
        }
      }
    } finally {
      // 无论正常结束还是读流中途出错,都要发 response-end 让服务器干净收尾。
      this.socket?.send(JSON.stringify({ type: 'response-end', requestId }));
    }
  }
}

function derivePublicBaseUrl(serverUrl: string): string {
  return serverUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/agent\/?$/, '')
    .replace(/\/+$/, '');
}
