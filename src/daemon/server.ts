import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { registerChannelAdminRoutes } from '../admin/channelAdminRoutes';
import { registerSettingsRoutes } from '../admin/settingsRoutes';
import type { ChannelAdapter } from '../channels/types';
import { WechatClawbotAdapter } from '../channels/wechat-clawbot/adapter';
import { WechatClawbotHttpClient } from '../channels/wechat-clawbot/client';
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
import { registerChannelRoutes } from './channelRoutes';
import type { WechatClawbotConfig, BridgeConfig } from './config';
import { BridgeEventHub } from './events';

export function createDaemonServer(options: {
  db?: BridgeDatabase;
  channel?: ChannelAdapter;
  providers?: NativeProviderAdapter[];
  wechat?: WechatClawbotConfig;
  providerCommands?: BridgeConfig['providers'];
} = {}) {
  const app = Fastify({ logger: true });
  const events = new BridgeEventHub();
  const sessions = new SessionManager({ defaultCwd: process.cwd(), defaultProviderId: 'claude-code' });
  const permissions = new PermissionRouter();
  const providers = new ProviderRegistry({
    claudeCommand: options.providerCommands?.claude?.command,
    codexCommand: options.providerCommands?.codex?.command,
  });
  const db = options.db ?? new Database(':memory:');
  db.exec(schemaSql);
  const users = new UserRepository(db);
  const pairings = new PairingRepository(db);
  const runtimeSessions = new RuntimeSessionRepository(db);
  const permissionRequests = new PermissionRequestRepository(db);
  const messageLog = new MessageLogRepository(db);
  const settings = new SettingsRepository(db);
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
        resolveUser: (message) => users.findByPlatformUser('wechat-clawbot', message.user.id),
        sessionRepository: runtimeSessions,
        permissionRepository: permissionRequests,
        messageLogRepository: messageLog,
      })
    : undefined;

  void app.register(websocket);
  registerChannelRoutes({ app, users, pairings, events, messageRouter });
  registerChannelAdminRoutes({
    app,
    users,
    pairings,
    sessions: runtimeSessions,
    sessionManager: sessions,
    providers: providerAdapters,
    settings,
    wechat: options.wechat,
  });
  registerSettingsRoutes({ app, settings, defaultWorkspace: process.cwd() });

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

  return { app, sessions, permissions, events, users, pairings };
}

function createWechatChannel(config: WechatClawbotConfig | undefined): ChannelAdapter | undefined {
  if (config?.enabled !== true || !config.baseUrl) return undefined;
  return new WechatClawbotAdapter({
    client: new WechatClawbotHttpClient({ baseUrl: config.baseUrl, token: config.token }),
  });
}
