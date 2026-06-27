import { RelayTunnelProvider } from './relayTunnelProvider';
import type { TunnelProvider, TunnelStatusView } from './tunnelProvider';

export class TunnelRouter implements TunnelProvider {
  private relayProvider: TunnelProvider | null = null;
  private relayKey = '';

  constructor(private readonly options: {
    bridgePort: number;
    defaults: {
      ngrok: { enabled: boolean };
      tunnel?: {
        provider: 'ngrok' | 'relay';
        enabled: boolean;
        relay?: { serverUrl?: string; authToken?: string };
      };
    };
    ngrokProvider: TunnelProvider;
  }) {}

  async getStatus(): Promise<TunnelStatusView> {
    const provider = this.resolveProvider();
    if (!provider) return this.notConfiguredStatus();
    return await provider.getStatus();
  }

  async start(): Promise<TunnelStatusView> {
    const provider = this.resolveProvider();
    if (!provider) return this.notConfiguredStatus();
    return await provider.start();
  }

  async stop(): Promise<TunnelStatusView> {
    const provider = this.resolveProvider();
    if (!provider) return this.notConfiguredStatus();
    return await provider.stop();
  }

  async setEnabled(enabled: boolean): Promise<TunnelStatusView> {
    const provider = this.resolveProvider();
    if (!provider) return this.notConfiguredStatus();
    return await provider.setEnabled(enabled);
  }

  private resolveProvider(): TunnelProvider | null {
    if (this.options.defaults.tunnel?.provider === 'relay') {
      return this.getOrCreateRelayProvider();
    }
    return this.options.ngrokProvider;
  }

  private getOrCreateRelayProvider(): TunnelProvider | null {
    const relay = this.options.defaults.tunnel?.relay;
    if (!relay?.serverUrl || !relay.authToken) return null;
    const key = `${relay.serverUrl}|${relay.authToken}|${this.options.bridgePort}`;
    if (this.relayProvider && this.relayKey === key) return this.relayProvider;
    this.relayKey = key;
    this.relayProvider = new RelayTunnelProvider({
      serverUrl: relay.serverUrl,
      authToken: relay.authToken,
      targetBaseUrl: `http://127.0.0.1:${this.options.bridgePort}`,
      createSocket: RelayTunnelProvider.defaultCreateSocket,
    });
    return this.relayProvider;
  }

  private notConfiguredStatus(): TunnelStatusView {
    return {
      installed: false,
      enabled: false,
      running: false,
      status: 'error',
      error: 'relay_not_configured',
    };
  }
}
