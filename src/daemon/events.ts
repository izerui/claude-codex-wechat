import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';

export type BridgeEvent =
  | { type: 'status'; message: string }
  | { type: 'permission_requested'; requestId: string }
  | { type: 'permission_decided'; requestId: string; decision: string }
  | {
      type: 'channel.pairing-requested';
      pairing: {
        code: string;
        platformUserId: string;
        platformType: 'weixin';
        display_name?: string;
        requestedAt: number;
        expiresAt: number;
      };
    }
  | {
      type: 'channel.user-authorized';
      user: {
        id: string;
        platformUserId: string;
        platformType: 'weixin';
        display_name?: string;
        authorizedAt: number;
        lastActive?: number;
        defaultProvider: 'claude-code' | 'codex';
        defaultCwd: string;
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
    };

export class BridgeEventHub {
  private readonly listeners = new Set<(event: BridgeEvent) => void>();

  emit(event: BridgeEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: (event: BridgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
