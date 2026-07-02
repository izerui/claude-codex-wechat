import { networkInterfaces } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { createDaemonServer } from './server';
import { defaultConfigPath, loadBridgeConfig } from './config';
import { persistProviderCommandsToConfigFile } from './configPersistence';
import { createUpdateChecker } from './updateChecker';
import { findExecutable } from '../shared/platform';
import { readClientVersion } from '../shared/version';
import { cleanupStaleTempFiles } from '../shared/atomicFile';
import type { TunnelProvider } from '../runtime/tunnelProvider';

export type AttachFrontend = (app: FastifyInstance) => Promise<void> | void;

export type StartDaemonOptions = {
  // 前端挂载方式由调用方注入：开发态用 Vite middleware，生产态用 @fastify/static。
  // 这样 bootstrap 本身不依赖 vite，生产打包不会把 vite 拉进产物。
  attachFrontend: AttachFrontend;
  port?: number;
  host?: string;
  configPath?: string;
  tunnelProvider?: TunnelProvider;
  // 是否启动版本更新检测（每小时查一次、结果写 config）。默认关闭，
  // 仅真实长驻入口（CLI __daemon、pnpm dev main.ts）显式开启；单测默认不联网。
  enableUpdateCheck?: boolean;
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
  // 回收上次运行崩溃在 write→rename 窗口残留的原子写临时文件。
  await cleanupStaleTempFiles(configPath).catch(() => undefined);
  const config = loadBridgeConfig(configPath);
  const providerCommands = await resolveProviderCommands(config.providers);
  await persistProviderCommandsToConfigFile({
    configPath,
    providers: providerCommands,
  });
  const bridgeDefaults = {
    defaultProvider: config.bridge?.defaultProvider ?? 'claude-code',
    defaultWorkspace: config.bridge?.defaultWorkspace ?? process.cwd(),
    tunnel: {
      enabled: true,
      ...(config.tunnel?.relay ? { relay: config.tunnel.relay } : {}),
    },
  };
  const { app, tunnelProvider: resolvedTunnelProvider } = createDaemonServer({
    wechat: config.wechat,
    providerCommands,
    bridgeDefaults,
    configPath,
    ...(options.tunnelProvider ? { tunnelProvider: options.tunnelProvider } : {}),
  });

  await options.attachFrontend(app);

  await app.listen({ host, port });
  const address = app.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  if (config.tunnel?.relay?.serverUrl && config.tunnel?.relay?.authToken) {
    await resolvedTunnelProvider?.start().catch(() => undefined);
  }
  if (options.enableUpdateCheck) {
    // best-effort：查一次 + 每小时一次，结果持久化写入 config，供管理页/CLI 读取。
    createUpdateChecker({ currentVersion: readClientVersion(), configPath })
      .start()
      .catch(() => undefined);
  }
  console.log('claude-codex-wechat listening:');
  console.log(`  Local:   http://127.0.0.1:${actualPort}`);
  for (const ip of listLanIpv4Addresses()) {
    console.log(`  Network: http://${ip}:${actualPort}`);
  }
  console.log(`config path: ${configPath}`);

  return { app, port: actualPort, host, configPath };
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
