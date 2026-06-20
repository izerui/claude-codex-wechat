import type { WeixinConfig } from '../../daemon/config';
import type { ChannelAdapter, ChannelMessageHandler, ChannelOutgoingMessage, ChannelStartOptions } from '../types';
import { WeixinDirectApiClient } from './apiClient';
import { WeixinDirectAdapter } from './adapter';
import type { WeixinStateStore } from './weixinStateStore';

export class ManagedWeixinDirectAdapter implements ChannelAdapter {
  readonly id = 'weixin-managed';

  private handler: ChannelMessageHandler | null = null;
  private adapter: ChannelAdapter | null = null;
  private running = false;
  private operation = Promise.resolve();
  private healthListeners = new Set<() => void>();
  private readonly stateStore?: WeixinStateStore;

  constructor(initialConfig?: WeixinConfig, stateStore?: WeixinStateStore) {
    this.stateStore = stateStore;
    this.adapter = createWeixinAdapter(initialConfig, stateStore);
  }

  onMessage(handler: ChannelMessageHandler): void {
    this.handler = handler;
    this.adapter?.onMessage(handler);
  }

  onHealthChange(listener: () => void): void {
    this.healthListeners.add(listener);
    this.adapter?.onHealthChange?.(listener);
  }

  private attachHealthListeners(): void {
    if (!this.adapter?.onHealthChange) return;
    for (const listener of this.healthListeners) this.adapter.onHealthChange(listener);
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
      this.adapter = createWeixinAdapter(config, this.stateStore);
      if (this.adapter && this.handler) {
        this.adapter.onMessage(this.handler);
      }
      this.attachHealthListeners();
      if (this.running && this.adapter) {
        await this.adapter.start({ background: true });
      }
    });
  }

  async sendMessage(message: ChannelOutgoingMessage): Promise<void> {
    if (!this.adapter) throw new Error('weixin_channel_not_configured');
    await this.adapter.sendMessage(message);
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    await this.adapter?.setTyping?.(chatId, active);
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

function createWeixinAdapter(config: WeixinConfig | undefined, stateStore?: WeixinStateStore): ChannelAdapter | null {
  if (config?.enabled !== true) return null;
  if (!config.baseUrl || !config.token) return null;
  const wechatUin = buildTransientWeixinUin();
  return new WeixinDirectAdapter({
    api: new WeixinDirectApiClient({
      baseUrl: config.baseUrl,
      botToken: config.token,
      wechatUin,
    }),
    stateStore,
  });
}

export function buildTransientWeixinUin(): string {
  // Official iLink contract: X-WECHAT-UIN = base64(String(randomUint32)).
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return Buffer.from(String(value[0])).toString('base64');
}
