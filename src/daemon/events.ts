import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';

export type BridgeEvent =
  | { type: 'status'; message: string }
  | {
      type: 'channel.user-authorized';
      user: {
        id: string;
        platformUserId: string;
        platformType: 'weixin';
        display_name?: string;
        authorizedAt: number;
        lastActive?: number;
        provider: 'claude-code' | 'codex';
        cwd: string;
      };
    }
  | {
      type: 'channel.plugin-status-changed';
      plugin_id: 'weixin';
      status: {
        id: typeof PRIMARY_WEIXIN_PLATFORM;
        type: 'weixin';
        name: 'WeChat channel';
        enabled: boolean;
        connected: boolean;
        status: string;
        activeUsers: number;
        hasToken: boolean;
        botUsername?: string;
      };
    }
  | { type: 'channel.current-session-changed' };

export class BridgeEventHub {
  private readonly listeners = new Set<(event: BridgeEvent) => void>();

  emit(event: BridgeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // a failing listener must not break others or crash the process
      }
    }
  }

  subscribe(listener: (event: BridgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
