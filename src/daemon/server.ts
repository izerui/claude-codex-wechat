import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { registerChannelAdminRoutes } from '../admin/channelAdminRoutes';
import { registerSettingsRoutes } from '../admin/settingsRoutes';
import type { ChannelAdapter } from '../channels/types';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import { ManagedWeixinDirectAdapter } from '../channels/weixin-direct/managedAdapter';
import { PermissionRouter } from '../permissions/permissionRouter';
import { createDefaultProviders } from '../providers/defaultProviders';
import type { NativeProviderAdapter } from '../providers/types';
import { ProviderRegistry } from '../providers/providerRegistry';
import { ensureClaudeSessionBridgeMetadata } from '../providers/claude-code/nativeSessions';
import { MessageRouter } from '../session/messageRouter';
import { autoAttachProviderSessionForMessage } from '../session/providerAutoAttach';
import { SessionManager } from '../session/sessionManager';
import type { BridgeDatabase } from '../storage/db';
import { BridgeEventRepository, ensureBridgeEventStorage } from '../storage/bridgeEventRepository';
import { PermissionRequestRepository } from '../storage/permissionRequestRepository';
import { ProviderBindingRepository } from '../storage/providerBindingRepository';
import { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import { schemaSql } from '../storage/schema';
import { SettingsRepository } from '../storage/settingsRepository';
import { UserRepository } from '../storage/userRepository';
import { defaultConfigPath, type WeixinConfig, type BridgeConfig } from './config';
import { BridgeEventHub } from './events';

export function createDaemonServer(options: {
  db?: BridgeDatabase;
  channel?: ChannelAdapter;
  providers?: NativeProviderAdapter[];
  wechat?: WeixinConfig;
  providerCommands?: BridgeConfig['providers'];
  configPath?: string;
} = {}) {
  const app = Fastify({ logger: true });
  const events = new BridgeEventHub();
  const db = options.db ?? new Database(':memory:');
  db.exec(schemaSql);
  ensureBridgeEventStorage(db);
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
  const providerBindings = new ProviderBindingRepository(db);
  const runtimeSessions = new RuntimeSessionRepository(db);
  const permissionRequests = new PermissionRequestRepository(db);
  const eventLog = new BridgeEventRepository(db);
  const sessionBindingMatch = new Map<string, boolean>();
  const providerAdapters = options.providers ?? createDefaultProviders({
    claudeCommand: options.providerCommands?.claude?.command,
    codexCommand: options.providerCommands?.codex?.command,
  });
  const persistedSessions = runtimeSessions.list();
  for (const persistedSession of persistedSessions) {
    sessions.hydrateSession({
      id: persistedSession.id,
      chatId: persistedSession.chatId,
      ownerUserId: persistedSession.ownerUserId,
      providerId: persistedSession.providerId,
      providerSessionId: persistedSession.providerSessionId,
      recoverySource: persistedSession.recoverySource,
      resumeTitle: persistedSession.resumeTitle,
      cwd: persistedSession.cwd,
      status: persistedSession.status,
      createdAt: persistedSession.createdAt,
      lastActivityAt: persistedSession.lastActivityAt,
      archivedAt: persistedSession.archivedAt,
    });
  }
  for (const persistedSession of persistedSessions) {
    if (persistedSession.archivedAt) continue;
    if (
      persistedSession.providerId === 'claude-code' &&
      persistedSession.providerSessionId &&
      persistedSession.resumeTitle
    ) {
      void ensureClaudeSessionBridgeMetadata({
        sessionId: persistedSession.providerSessionId,
        resumeTitle: persistedSession.resumeTitle,
      });
    }
    const provider = providerAdapters.find((candidate) => candidate.id === persistedSession.providerId);
    void provider?.startSession({
      bridgeSessionId: persistedSession.id,
      cwd: persistedSession.cwd,
      options: persistedSession.providerSessionId ? { providerSessionId: persistedSession.providerSessionId } : undefined,
    });
  }
  const managedWechatChannel = options.channel ? null : new ManagedWeixinDirectAdapter(options.wechat);
  const channel = options.channel ?? managedWechatChannel;
  const messageRouter = channel
    ? new MessageRouter({
        channel,
        permissions,
        providers: providerAdapters,
        sessions,
        resolveUser: (message) => users.findByPlatformUser(PRIMARY_WEIXIN_PLATFORM, message.user.id),
        autoAuthorizeUser: (message) => {
          const existing = users.findByPlatformUser(PRIMARY_WEIXIN_PLATFORM, message.user.id);
          if (existing) return existing;
          const defaults = readBridgeDefaults(settings);
          const created = users.createUser({
            platform: PRIMARY_WEIXIN_PLATFORM,
            platformUserId: message.user.id,
            displayName: message.user.displayName,
            role: 'user',
            defaultProvider: defaults.defaultProvider,
            defaultCwd: defaults.defaultWorkspace,
          });
          events.emit({
            type: 'channel.user-authorized',
            user: {
              id: created.id,
              platformUserId: created.platformUserId,
              platformType: 'weixin',
              display_name: created.displayName,
              authorizedAt: created.createdAt,
              lastActive: created.lastActiveAt,
              defaultProvider: created.defaultProvider,
              defaultCwd: created.defaultCwd,
            },
          });
          return created;
        },
        autoAttachSession: async (message, user) => {
          if (sessions.getActiveSession(message.chatId)) return null;
          const provider = providerAdapters.find((candidate) => candidate.id === user.defaultProvider);
          if (!provider?.attachSession || !provider.listRecoverableSessions) return null;
          const attached = await autoAttachProviderSessionForMessage({
            message,
            user,
            provider,
            sessionManager: sessions,
            bindingRepository: providerBindings,
            sessionRepository: runtimeSessions,
          });
          if (attached) {
            sessionBindingMatch.set(attached.session.id, attached.matchedBinding);
            return attached.session;
          }
          return null;
        },
        sessionRepository: runtimeSessions,
        permissionRepository: permissionRequests,
        eventLogRepository: eventLog,
        bindingRepository: providerBindings,
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
    ...(channel ? { channel } : {}),
    providerBindings,
    sessions: runtimeSessions,
    sessionManager: sessions,
    providers: providerAdapters,
    getSessionBindingMatch: (sessionId) => sessionBindingMatch.get(sessionId) === true,
    settings,
    eventLog,
    wechat: options.wechat,
    events,
    configPath: options.configPath ?? process.env.BRIDGE_CONFIG ?? defaultConfigPath(),
    onWechatConfigChanged: managedWechatChannel
      ? async (next) => {
          await managedWechatChannel.configure(next);
        }
      : undefined,
  });
  registerSettingsRoutes({
    app,
    settings,
    defaultWorkspace: process.cwd(),
    users,
    sessions: runtimeSessions,
    ...(channel ? { channel } : {}),
  });

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

  return { app, sessions, permissions, events, users };
}

function readBridgeDefaults(settings: SettingsRepository): { defaultProvider: 'claude-code' | 'codex'; defaultWorkspace: string } {
  const defaultProvider = settings.get('settings.defaultProvider') === 'codex' ? 'codex' : 'claude-code';
  const defaultWorkspace = typeof settings.get('settings.defaultWorkspace') === 'string'
    ? String(settings.get('settings.defaultWorkspace'))
    : process.cwd();
  return { defaultProvider, defaultWorkspace };
}
