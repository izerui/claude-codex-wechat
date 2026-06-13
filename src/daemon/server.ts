import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { registerChannelAdminRoutes } from '../admin/channelAdminRoutes';
import { registerSettingsRoutes } from '../admin/settingsRoutes';
import type { ChannelAdapter } from '../channels/types';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import { WeixinDirectAdapter } from '../channels/weixin-direct/adapter';
import { WeixinDirectApiClient } from '../channels/weixin-direct/apiClient';
import { PermissionRouter } from '../permissions/permissionRouter';
import { createDefaultProviders } from '../providers/defaultProviders';
import type { NativeProviderAdapter } from '../providers/types';
import { ProviderRegistry } from '../providers/providerRegistry';
import { MessageRouter } from '../session/messageRouter';
import { SessionManager } from '../session/sessionManager';
import type { BridgeDatabase } from '../storage/db';
import { MessageLogRepository } from '../storage/messageLogRepository';
import { PairingRepository } from '../storage/pairingRepository';
import { PermissionRequestRepository } from '../storage/permissionRequestRepository';
import { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import { schemaSql } from '../storage/schema';
import { SettingsRepository } from '../storage/settingsRepository';
import { UserRepository } from '../storage/userRepository';
import type { WeixinConfig, BridgeConfig } from './config';
import { BridgeEventHub } from './events';

export function createDaemonServer(options: {
  db?: BridgeDatabase;
  channel?: ChannelAdapter;
  providers?: NativeProviderAdapter[];
  wechat?: WeixinConfig;
  providerCommands?: BridgeConfig['providers'];
} = {}) {
  const app = Fastify({ logger: true });
  const events = new BridgeEventHub();
  const db = options.db ?? new Database(':memory:');
  db.exec(schemaSql);
  const settings = new SettingsRepository(db);
  const bridgeDefaults = readBridgeDefaults(settings);
  const sessions = new SessionManager({
    defaultCwd: bridgeDefaults.defaultWorkspace,
    defaultProviderId: bridgeDefaults.defaultProvider,
  });
  const permissions = new PermissionRouter();
  const providers = new ProviderRegistry({
    claudeCommand: options.providerCommands?.claude?.command,
    codexCommand: options.providerCommands?.codex?.command,
  });
  const users = new UserRepository(db);
  const pairings = new PairingRepository(db);
  const runtimeSessions = new RuntimeSessionRepository(db);
  const permissionRequests = new PermissionRequestRepository(db);
  const messageLog = new MessageLogRepository(db);
  const providerAdapters = options.providers ?? createDefaultProviders({
    claudeCommand: options.providerCommands?.claude?.command,
    codexCommand: options.providerCommands?.codex?.command,
  });
  const channel = options.channel ?? createWechatChannel(options.wechat);
  const messageRouter = channel
    ? new MessageRouter({
        channel,
        permissions,
        providers: providerAdapters,
        sessions,
        resolveUser: (message) => users.findByPlatformUser(PRIMARY_WEIXIN_PLATFORM, message.user.id),
        sessionRepository: runtimeSessions,
        permissionRepository: permissionRequests,
        messageLogRepository: messageLog,
        pairingRepository: pairings,
        events,
      })
    : undefined;
  if (channel && messageRouter) {
    channel.onMessage(async (message) => {
      await messageRouter.handleMessage(message);
    });
  }

  void app.register(websocket);
  registerChannelAdminRoutes({
    app,
    users,
    pairings,
    sessions: runtimeSessions,
    sessionManager: sessions,
    providers: providerAdapters,
    settings,
    messageLog,
    wechat: options.wechat,
    events,
  });
  registerSettingsRoutes({ app, settings, defaultWorkspace: process.cwd(), users });

  app.get('/api/status', async () => ({
    ok: true,
    sessions: runtimeSessions.list(),
    permissions: permissionRequests.listPending(),
  }));

  app.get('/api/providers/status', async () => providers.getStatus());

  app.post<{ Body: { requestId: string; userId: string; decision: 'approve' | 'deny' | 'abort' } }>('/api/permissions/decide', async (request, reply) => {
    const result = messageRouter
      ? await messageRouter.decidePermission(request.body)
      : permissions.decide(request.body);
    if (!result.ok) return reply.code(400).send(result);
    events.emit({ type: 'permission_decided', requestId: request.body.requestId, decision: request.body.decision });
    return result;
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const unsubscribe = events.subscribe((event) => socket.send(JSON.stringify(event)));
    socket.on('close', unsubscribe);
  });

  app.addHook('onReady', async () => {
    await channel?.start({ background: true } as { background?: boolean });
  });

  app.addHook('onClose', async () => {
    await channel?.stop();
  });

  return { app, sessions, permissions, events, users, pairings };
}

function readBridgeDefaults(settings: SettingsRepository): { defaultProvider: 'claude-code' | 'codex'; defaultWorkspace: string } {
  const defaultProvider = settings.get('settings.defaultProvider') === 'codex' ? 'codex' : 'claude-code';
  const defaultWorkspace = typeof settings.get('settings.defaultWorkspace') === 'string'
    ? String(settings.get('settings.defaultWorkspace'))
    : process.cwd();
  return { defaultProvider, defaultWorkspace };
}

function createWechatChannel(config: WeixinConfig | undefined): ChannelAdapter | undefined {
  if (config?.enabled !== true) return undefined;
  if (!config.token || !config.baseUrl) return undefined;
  const wechatUin = Buffer.from(
    new Uint8Array(4).map(() => Math.floor(Math.random() * 256)),
  ).toString('base64');
  return new WeixinDirectAdapter({
    api: new WeixinDirectApiClient({
      baseUrl: config.baseUrl,
      botToken: config.token,
      wechatUin,
    }),
  });
}
