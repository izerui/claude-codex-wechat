import { networkInterfaces } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { createDaemonServer } from './server';
import { defaultConfigPath, loadBridgeConfig } from './config';
import { persistProviderCommandsToConfigFile, persistBridgeDefaultsToConfigFile, ensureRelayAuthTokenSync } from './configPersistence';
import { createUpdateChecker } from './updateChecker';
import { findExecutable } from '../shared/platform';
import { resolveTerminalSearchPath } from '../shared/loginShellEnv';
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

  // 把 bridge 默认值与完整 relay 配置（serverUrl + 确保存在的 authToken）写全到 config.json，
  // 使其自解释、可复现。在 app.listen() 之前写：此时服务尚未接请求，不会与 /api/settings 的
  // 并发写竞态。defaultWorkspace 写入的是有效值（用户未配时即启动时的 process.cwd()）——这会把
  // 默认工作目录在首启时固定下来、之后保持稳定；如需变更走 /api/settings。ensureRelayAuthTokenSync 幂等。
  const relayAuthToken = ensureRelayAuthTokenSync({ configPath });
  const relayServerUrl = bridgeDefaults.tunnel.relay?.serverUrl ?? 'wss://wechat.style520.com/agent';
  await persistBridgeDefaultsToConfigFile({
    configPath,
    defaultProvider: bridgeDefaults.defaultProvider,
    defaultWorkspace: bridgeDefaults.defaultWorkspace,
    tunnel: {
      relay: {
        serverUrl: relayServerUrl,
        authToken: relayAuthToken,
      },
    },
  }).catch((error) => {
    console.warn('[config] 写入 bridge/relay 默认值失败：', error instanceof Error ? error.message : String(error));
  });

  await options.attachFrontend(app);

  await app.listen({ host, port });
  const address = app.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  // relay 每次启动都后台连接：判断用【本次已确保生成的】relayAuthToken + 有效 serverUrl，
  // 而不是启动顶部加载的原始 config——否则首启（token 本次才生成）会因原始 config 无 token 而跳过，
  // 导致 config 写全了却没连上、要等下次重启才连。用确保后的值 → 新旧 token 首启都连。
  //  - 非阻塞：不 await，启动立即继续；离线 / DNS 异常 / 门户页拦截时也不会卡住 startDaemon()，
  //    连接与重试交给 provider 内部的 scheduleReconnect 在后台完成。
  if (relayServerUrl && relayAuthToken) {
    void resolvedTunnelProvider?.start().catch((error) => {
      console.warn('[relay] 隧道后台启动失败，将自动重连：', error instanceof Error ? error.message : String(error));
    });
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
  // 检测 claude/codex 时用「终端 PATH」——保证和用户在终端里查找一致。
  const searchPath = resolveTerminalSearchPath();
  const claudeCommand = providers?.claude?.command ?? await findExecutable('claude', searchPath);
  const codexCommand = providers?.codex?.command ?? await findExecutable('codex', searchPath);
  if (!claudeCommand && !codexCommand) return undefined;
  return {
    ...(claudeCommand ? { claude: { command: claudeCommand } } : {}),
    ...(codexCommand ? { codex: { command: codexCommand } } : {}),
  };
}
