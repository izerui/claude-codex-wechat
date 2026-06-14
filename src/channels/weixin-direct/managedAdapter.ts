import type { WeixinConfig } from '../../daemon/config';
import type { ChannelAdapter, ChannelMessageHandler, ChannelOutgoingMessage, ChannelStartOptions } from '../types';
import { WeixinDirectApiClient } from './apiClient';
import { WeixinDirectAdapter } from './adapter';

export class ManagedWeixinDirectAdapter implements ChannelAdapter {
  readonly id = 'weixin-managed';

  private handler: ChannelMessageHandler | null = null;
  private adapter: ChannelAdapter | null = null;
  private running = false;
  private operation = Promise.resolve();

  constructor(initialConfig?: WeixinConfig) {
    this.adapter = createWeixinAdapter(initialConfig);
  }

  onMessage(handler: ChannelMessageHandler): void {
    this.handler = handler;
    this.adapter?.onMessage(handler);
  }

  async start(options?: ChannelStartOptions): Promise<void> {
    await this.enqueue(async () => {
      this.running = true;
      if (!this.adapter) return;
      await this.adapter.start(options ?? { background: true });
    });
  }

  async stop(): Promise<void> {
    await this.enqueue(async () => {
      this.running = false;
      if (!this.adapter) return;
      await this.adapter.stop();
    });
  }

  async configure(config: WeixinConfig): Promise<void> {
    await this.enqueue(async () => {
      if (this.adapter) {
        await this.adapter.stop();
      }
      this.adapter = createWeixinAdapter(config);
      if (this.adapter && this.handler) {
        this.adapter.onMessage(this.handler);
      }
      if (this.running && this.adapter) {
        await this.adapter.start({ background: true });
      }
    });
  }

  async sendMessage(message: ChannelOutgoingMessage): Promise<void> {
    if (!this.adapter) throw new Error('weixin_channel_not_configured');
    await this.adapter.sendMessage(message);
  }

  getHealth(): { connected: boolean; status: string; lastError?: string } {
    if (!this.adapter) return { connected: false, status: this.running ? 'not_configured' : 'disabled' };
    return this.adapter.getHealth?.() ?? { connected: this.running, status: this.running ? 'configured' : 'stopped' };
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.operation.then(task, task);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }
}

function createWeixinAdapter(config: WeixinConfig | undefined): ChannelAdapter | null {
  if (config?.enabled !== true) return null;
  if (!config.baseUrl || !config.token) return null;
  const wechatUin = buildTransientWeixinUin();
  return new WeixinDirectAdapter({
    api: new WeixinDirectApiClient({
      baseUrl: config.baseUrl,
      botToken: config.token,
      wechatUin,
    }),
  });
}

function buildTransientWeixinUin(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64');
}
