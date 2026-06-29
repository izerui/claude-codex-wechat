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
    enabled: false,
    running: false,
    status: 'stopped',
  };

  constructor(private readonly options: {
    serverUrl: string;
    authToken: string;
    targetBaseUrl: string;
    createSocket: (url: string) => RelaySocket;
    fetchImpl?: typeof fetch;
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
    this.status = {
      ...this.status,
      enabled: true,
      status: 'starting',
    };
    const socket = this.options.createSocket(this.options.serverUrl);
    this.socket = socket;
    return await new Promise<TunnelStatusView>((resolve, reject) => {
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
        }));
      });
      socket.on('message', (raw) => {
        const payload = typeof raw === 'string' ? JSON.parse(raw) : typeof raw?.data === 'string' ? JSON.parse(raw.data) : raw;
        if (payload?.type === 'registered') {
          const publicUrl = typeof payload?.token === 'string'
            ? `${derivePublicBaseUrl(this.options.serverUrl)}/${payload.token}`
            : undefined;
          this.status = {
            installed: true,
            enabled: true,
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
        this.status = {
          ...this.status,
          running: false,
          status: 'error',
          error: 'relay_disconnected',
        };
        finishReject(new Error('relay_disconnected'));
      });
      socket.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.status = {
          ...this.status,
          running: false,
          status: 'error',
          error: message,
        };
        finishReject(error);
      });
    });
  }

  async stop(): Promise<TunnelStatusView> {
    this.socket?.close();
    this.socket = null;
    this.status = {
      installed: true,
      enabled: false,
      running: false,
      status: 'stopped',
    };
    return { ...this.status };
  }

  async setEnabled(enabled: boolean): Promise<TunnelStatusView> {
    return enabled ? await this.start() : await this.stop();
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
    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    this.socket?.send(JSON.stringify({
      type: 'response',
      requestId: payload.requestId,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      bodyBase64: bodyBuffer.toString('base64'),
    }));
  }
}

function derivePublicBaseUrl(serverUrl: string): string {
  return serverUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/agent\/?$/, '')
    .replace(/\/+$/, '');
}
