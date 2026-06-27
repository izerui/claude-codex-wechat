import type { FastifyInstance } from 'fastify';
import { persistBridgeDefaultsToConfigFile } from '../daemon/configPersistence';
import type { TunnelProvider, TunnelStatusView } from '../runtime/tunnelProvider';

export type NgrokStatusView = TunnelStatusView;
export type NgrokManager = TunnelProvider;

export function registerNgrokRoutes(input: {
  app: FastifyInstance;
  configPath: string;
  defaults: {
    ngrok: { enabled: boolean };
    tunnel?: { provider: 'ngrok' | 'relay'; enabled: boolean; relay?: { serverUrl?: string; authToken?: string } };
  };
  ngrokManager: NgrokManager;
}): void {
  const getStatus = async () => await input.ngrokManager.getStatus();
  input.app.get('/api/ngrok/status', getStatus);
  input.app.get('/api/tunnel/status', getStatus);

  const start = async () => {
    input.defaults.ngrok.enabled = true;
    if (input.defaults.tunnel) input.defaults.tunnel.enabled = true;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      ngrokEnabled: true,
      ...(input.defaults.tunnel ? { tunnel: input.defaults.tunnel } : {}),
    });
    return await input.ngrokManager.start();
  };
  input.app.post('/api/ngrok/start', start);
  input.app.post('/api/tunnel/start', start);

  const stop = async () => {
    input.defaults.ngrok.enabled = false;
    if (input.defaults.tunnel) input.defaults.tunnel.enabled = false;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      ngrokEnabled: false,
      ...(input.defaults.tunnel ? { tunnel: input.defaults.tunnel } : {}),
    });
    return await input.ngrokManager.stop();
  };
  input.app.post('/api/ngrok/stop', stop);
  input.app.post('/api/tunnel/stop', stop);

  const setEnabled = async (request: { body?: { enabled?: boolean } }) => {
    const enabled = request.body?.enabled === true;
    input.defaults.ngrok.enabled = enabled;
    if (input.defaults.tunnel) input.defaults.tunnel.enabled = enabled;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      ngrokEnabled: enabled,
      ...(input.defaults.tunnel ? { tunnel: input.defaults.tunnel } : {}),
    });
    return await input.ngrokManager.setEnabled(enabled);
  };
  input.app.post<{ Body: { enabled?: boolean } }>('/api/ngrok/settings', setEnabled);
  input.app.post<{ Body: { enabled?: boolean } }>('/api/tunnel/settings', setEnabled);
}
