import type { FastifyInstance } from 'fastify';
import { persistBridgeDefaultsToConfigFile } from '../daemon/configPersistence';
import type { TunnelProvider, TunnelStatusView } from '../runtime/tunnelProvider';

export type TunnelManager = TunnelProvider;
export type TunnelStatusRouteView = TunnelStatusView;

export function registerTunnelRoutes(input: {
  app: FastifyInstance;
  configPath: string;
  defaults: {
    tunnel: {
      enabled: boolean;
      relay?: { serverUrl?: string; authToken?: string };
    };
  };
  tunnelManager: TunnelManager;
}): void {
  const getStatus = async () => await input.tunnelManager.getStatus();
  input.app.get('/api/tunnel/status', getStatus);

  const start = async () => {
    input.defaults.tunnel.enabled = true;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      tunnel: input.defaults.tunnel,
    });
    return await input.tunnelManager.start();
  };
  input.app.post('/api/tunnel/start', start);

  const stop = async () => {
    input.defaults.tunnel.enabled = false;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      tunnel: input.defaults.tunnel,
    });
    return await input.tunnelManager.stop();
  };
  input.app.post('/api/tunnel/stop', stop);

  const setEnabled = async (request: { body?: { enabled?: boolean } }) => {
    const enabled = request.body?.enabled === true;
    input.defaults.tunnel.enabled = enabled;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      tunnel: input.defaults.tunnel,
    });
    return await input.tunnelManager.setEnabled(enabled);
  };
  input.app.post<{ Body: { enabled?: boolean } }>('/api/tunnel/settings', setEnabled);
}
