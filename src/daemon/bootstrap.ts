import { networkInterfaces } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { createDaemonServer } from './server';
import { defaultConfigPath, loadBridgeConfig } from './config';
import { persistProviderCommandsToConfigFile } from './configPersistence';
import { findExecutable } from '../shared/platform';

export type AttachFrontend = (app: FastifyInstance) => Promise<void> | void;

export type StartDaemonOptions = {
  // 前端挂载方式由调用方注入：开发态用 Vite middleware，生产态用 @fastify/static。
  // 这样 bootstrap 本身不依赖 vite，生产打包不会把 vite 拉进产物。
  attachFrontend: AttachFrontend;
  port?: number;
  host?: string;
  configPath?: string;
};

export async function startDaemon(options: StartDaemonOptions): Promise<{
  app: FastifyInstance;
  port: number;
  host: string;
  configPath: string;
}> {
  const port = options.port ?? Number(process.env.BRIDGE_PORT ?? 8787);
  const host = options.host ?? '0.0.0.0';
  const configPath = options.configPath ?? process.env.BRIDGE_CONFIG ?? defaultConfigPath();
  const config = loadBridgeConfig(configPath);
  const providerCommands = await resolveProviderCommands(config.providers);
  await persistProviderCommandsToConfigFile({
    configPath,
    providers: providerCommands,
  });
  const { app } = createDaemonServer({
    wechat: config.wechat,
    providerCommands,
    bridgeDefaults: {
      defaultProvider: config.bridge?.defaultProvider ?? 'claude-code',
      defaultWorkspace: config.bridge?.defaultWorkspace ?? process.cwd(),
    },
    configPath,
  });

  await options.attachFrontend(app);

  await app.listen({ host, port });
  console.log('claude-codex-wechat listening:');
  console.log(`  Local:   http://127.0.0.1:${port}`);
  for (const ip of listLanIpv4Addresses()) {
    console.log(`  Network: http://${ip}:${port}`);
  }
  console.log(`config path: ${configPath}`);

  return { app, port, host, configPath };
}

export function listLanIpv4Addresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface): iface is NonNullable<typeof iface> => Boolean(iface))
    .filter((iface) => iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

export async function resolveProviderCommands(
  providers: ReturnType<typeof loadBridgeConfig>['providers'] | undefined,
): Promise<ReturnType<typeof loadBridgeConfig>['providers']> {
  const claudeCommand = providers?.claude?.command ?? await findExecutable('claude');
  const codexCommand = providers?.codex?.command ?? await findExecutable('codex');
  if (!claudeCommand && !codexCommand) return undefined;
  return {
    ...(claudeCommand ? { claude: { command: claudeCommand } } : {}),
    ...(codexCommand ? { codex: { command: codexCommand } } : {}),
  };
}
