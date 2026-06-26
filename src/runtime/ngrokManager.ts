import { spawn, type ChildProcess } from 'node:child_process';
import { terminateChild, findExecutable } from '../shared/platform';
import type { NgrokManager as NgrokManagerContract, NgrokStatusView } from '../admin/ngrokRoutes';

type TunnelPayload = {
  tunnels?: Array<{ public_url?: string }>;
};

export class NgrokManager implements NgrokManagerContract {
  private status: NgrokStatusView;
  private child: ChildProcess | null = null;
  private lastStderr = '';
  private readonly findExecutableFn: (command: string) => Promise<string | undefined>;
  private readonly spawnNgrokFn: (command: string, args: string[]) => ChildProcess;
  private readonly fetchTunnelsFn: () => Promise<TunnelPayload>;
  private readonly terminateChildFn: (child: ChildProcess, signal?: NodeJS.Signals) => void;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(private readonly options: {
    port: number;
    enabled: boolean;
    findExecutable?: (command: string) => Promise<string | undefined>;
    spawnNgrok?: (command: string, args: string[]) => ChildProcess;
    fetchTunnels?: () => Promise<TunnelPayload>;
    terminateChild?: (child: ChildProcess, signal?: NodeJS.Signals) => void;
    sleep?: (ms: number) => Promise<void>;
  }) {
    this.status = {
      installed: false,
      enabled: options.enabled,
      running: false,
      status: 'stopped',
    };
    this.findExecutableFn = options.findExecutable ?? findExecutable;
    this.spawnNgrokFn = options.spawnNgrok ?? ((command, args) => spawn(command, args, { stdio: 'ignore' }));
    this.fetchTunnelsFn = options.fetchTunnels ?? defaultFetchTunnels;
    this.terminateChildFn = options.terminateChild ?? terminateChild;
    this.sleepFn = options.sleep ?? defaultSleep;
  }

  async getStatus(): Promise<NgrokStatusView> {
    if (!this.child && this.status.status === 'stopped') {
      const executable = await this.findExecutableFn('ngrok');
      this.status.installed = Boolean(executable);
      if (!executable) {
        this.status.status = 'not_installed';
        this.status.error = 'ngrok_not_installed';
      } else if (this.status.error === 'ngrok_not_installed') {
        this.status.error = undefined;
      }
    }
    if (this.child && this.status.running && !this.status.publicUrl) {
      try {
        const tunnels = await this.fetchTunnelsFn();
        const publicUrl = tunnels.tunnels?.map((tunnel) => tunnel.public_url).find((url) => typeof url === 'string' && url.startsWith('https://'));
        if (publicUrl) this.status.publicUrl = publicUrl;
      } catch {
        // Keep the current running state; this is only a best-effort refresh.
      }
    }
    return { ...this.status };
  }

  async start(): Promise<NgrokStatusView> {
    if (this.child && this.status.running) {
      this.status.enabled = true;
      if (!this.status.publicUrl) {
        try {
          const tunnels = await this.fetchTunnelsFn();
          const publicUrl = tunnels.tunnels?.map((tunnel) => tunnel.public_url).find((url) => typeof url === 'string' && url.startsWith('https://'));
          if (publicUrl) this.status.publicUrl = publicUrl;
        } catch {
          // Keep the running state; this is only a best-effort refresh.
        }
      }
      return { ...this.status };
    }
    this.status.enabled = true;
    const executable = await this.findExecutableFn('ngrok');
    if (!executable) {
      this.child = null;
      this.status = {
        installed: false,
        enabled: true,
        running: false,
        status: 'not_installed',
        error: 'ngrok_not_installed',
      };
      return { ...this.status };
    }

    this.status = {
      installed: true,
      enabled: true,
      running: false,
      status: 'starting',
    };
    const child = this.spawnNgrokFn(executable, ['http', String(this.options.port)]);
    this.lastStderr = '';
    this.child = child;
    child.stderr?.on?.('data', (chunk: Buffer | string) => {
      const text = String(chunk).trim();
      if (!text) return;
      this.lastStderr = this.lastStderr ? `${this.lastStderr}\n${text}` : text;
      if (this.lastStderr.length > 1000) {
        this.lastStderr = this.lastStderr.slice(-1000);
      }
    });
    child.once('exit', (code) => {
      this.child = null;
      this.status = {
        ...this.status,
        running: false,
        publicUrl: undefined,
        status: 'error',
        error: this.decorateError(`ngrok_exited:${code ?? 'unknown'}`),
      };
    });
    try {
      const tunnels = await this.waitForTunnels();
      const publicUrl = tunnels.tunnels?.map((tunnel) => tunnel.public_url).find((url) => typeof url === 'string' && url.startsWith('https://'));
      this.status = {
        installed: true,
        enabled: true,
        running: true,
        status: 'running',
        ...(publicUrl ? { publicUrl } : {}),
      };
      return { ...this.status };
    } catch (error) {
      this.child = null;
      this.status = {
        installed: true,
        enabled: true,
        running: false,
        status: 'error',
        error: this.decorateError(error instanceof Error ? error.message : String(error)),
      };
      return { ...this.status };
    }
  }

  async stop(): Promise<NgrokStatusView> {
    this.status.enabled = false;
    if (this.child) {
      this.terminateChildFn(this.child);
      this.child = null;
    }
    this.status = {
      installed: this.status.installed,
      enabled: false,
      running: false,
      status: this.status.installed ? 'stopped' : 'not_installed',
    };
    return { ...this.status };
  }

  async setEnabled(enabled: boolean): Promise<NgrokStatusView> {
    if (enabled) return await this.start();
    return await this.stop();
  }

  private async waitForTunnels(): Promise<TunnelPayload> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.fetchTunnelsFn();
      } catch (error) {
        lastError = error;
        if (attempt < 4) await this.sleepFn(250);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private decorateError(base: string): string {
    return this.lastStderr ? `${base}\n${this.lastStderr}` : base;
  }
}

async function defaultFetchTunnels(): Promise<TunnelPayload> {
  const response = await fetch('http://127.0.0.1:4040/api/tunnels');
  if (!response.ok) throw new Error(`ngrok_tunnels_failed:${response.status}`);
  return await response.json() as TunnelPayload;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
