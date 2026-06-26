import type { FastifyInstance } from 'fastify';
import { persistBridgeDefaultsToConfigFile } from '../daemon/configPersistence';

export type NgrokStatusView = {
  installed: boolean;
  enabled: boolean;
  running: boolean;
  status: 'not_installed' | 'stopped' | 'starting' | 'running' | 'error';
  publicUrl?: string;
  error?: string;
};

export type NgrokManager = {
  getStatus(): Promise<NgrokStatusView>;
  start(): Promise<NgrokStatusView>;
  stop(): Promise<NgrokStatusView>;
  setEnabled(enabled: boolean): Promise<NgrokStatusView>;
};

export function registerNgrokRoutes(input: {
  app: FastifyInstance;
  configPath: string;
  defaults: { ngrok: { enabled: boolean } };
  ngrokManager: NgrokManager;
}): void {
  input.app.get('/api/ngrok/status', async () => await input.ngrokManager.getStatus());

  input.app.post('/api/ngrok/start', async () => {
    input.defaults.ngrok.enabled = true;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      ngrokEnabled: true,
    });
    return await input.ngrokManager.start();
  });

  input.app.post('/api/ngrok/stop', async () => {
    input.defaults.ngrok.enabled = false;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      ngrokEnabled: false,
    });
    return await input.ngrokManager.stop();
  });

  input.app.post<{ Body: { enabled?: boolean } }>('/api/ngrok/settings', async (request) => {
    const enabled = request.body?.enabled === true;
    input.defaults.ngrok.enabled = enabled;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      ngrokEnabled: enabled,
    });
    return await input.ngrokManager.setEnabled(enabled);
  });
}
