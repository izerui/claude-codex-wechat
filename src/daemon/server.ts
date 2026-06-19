import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
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
import { CurrentConversationStore } from '../session/currentConversationStore';
import { LastProviderSessionStore } from '../storage/lastProviderSessionStore';
import { RuntimeUserStore } from '../storage/runtimeUserStore';
import type { ActiveWeChatUserStore } from '../storage/userStore';
import { defaultConfigPath, type WeixinConfig, type BridgeConfig } from './config';
import { BridgeEventHub } from './events';

export function createDaemonServer(options: {
  db?: unknown;
  channel?: ChannelAdapter;
  providers?: NativeProviderAdapter[];
  activeUserStore?: ActiveWeChatUserStore;
  permissionsRouter?: PermissionRouter;
  wechat?: WeixinConfig;
  bridgeDefaults?: { defaultProvider: 'claude-code' | 'codex'; defaultWorkspace: string };
  providerCommands?: BridgeConfig['providers'];
  configPath?: string;
} = {}) {
  const app = Fastify({ logger: true });
  const events = new BridgeEventHub();
  const bridgeDefaults = {
    defaultProvider: options.bridgeDefaults?.defaultProvider ?? 'claude-code',
    defaultWorkspace: options.bridgeDefaults?.defaultWorkspace ?? process.cwd(),
  };
  const configPath = options.configPath
    ?? (options.activeUserStore ? join(mkdtempSync(join(tmpdir(), 'claude-codex-wechat-')), 'config.json') : undefined)
    ?? process.env.BRIDGE_CONFIG
    ?? defaultConfigPath();
  const conversation = new CurrentConversationStore(configPath, {
    defaultCwd: bridgeDefaults.defaultWorkspace,
    defaultProviderId: bridgeDefaults.defaultProvider,
  });
  const permissions = options.permissionsRouter ?? new PermissionRouter();
  const providers = new ProviderRegistry({
    claudeCommand: options.providerCommands?.claude?.command,
    codexCommand: options.providerCommands?.codex?.command,
  });
  const activeUserStore = options.activeUserStore
    ?? new RuntimeUserStore(configPath);
  const lastProviderSessions = new LastProviderSessionStore(configPath);
  const sessionBindingMatch = new Map<string, boolean>();
  const providerAdapters = options.providers ?? createDefaultProviders({
    claudeCommand: options.providerCommands?.claude?.command,
    codexCommand: options.providerCommands?.codex?.command,
  });
  let currentConversation = conversation.getCurrent();
  if (currentConversation) {
    if (
      currentConversation.providerId === 'claude-code' &&
      currentConversation.providerSessionId &&
      currentConversation.resumeTitle
    ) {
      void ensureClaudeSessionBridgeMetadata({
        sessionId: currentConversation.providerSessionId,
        resumeTitle: currentConversation.resumeTitle,
        cwd: currentConversation.cwd,
      });
    }
    const provider = providerAdapters.find((candidate) => candidate.id === currentConversation.providerId);
    void provider?.startSession({
      bridgeSessionId: currentConversation.id,
      cwd: currentConversation.cwd,
      options: currentConversation.providerSessionId ? { providerSessionId: currentConversation.providerSessionId } : undefined,
    });
  }
  const managedWechatChannel = options.channel ? null : new ManagedWeixinDirectAdapter(options.wechat);
  const channel = options.channel ?? managedWechatChannel;
  const messageRouter = channel
    ? new MessageRouter({
        channel,
        permissions,
        providers: providerAdapters,
        conversation,
        resolveUser: (message) => activeUserStore.isActiveUser(PRIMARY_WEIXIN_PLATFORM, message.user.id),
        autoAuthorizeUser: (message) => {
          const existing = activeUserStore.isActiveUser(PRIMARY_WEIXIN_PLATFORM, message.user.id);
          if (existing) return existing;
          const created = activeUserStore.setActiveUser({
            platform: PRIMARY_WEIXIN_PLATFORM,
            platformUserId: message.user.id,
            displayName: message.user.displayName,
            role: 'user',
          });
          events.emit({
            type: 'channel.user-authorized',
            user: {
              id: created.id,
              platformUserId: created.platformUserId,
              platformType: 'weixin',
              display_name: created.displayName,
              authorizedAt: created.createdAt,
              lastActive: created.updatedAt,
              provider: bridgeDefaults.defaultProvider,
              cwd: bridgeDefaults.defaultWorkspace,
            },
          });
          return created;
        },
        autoAttachSession: async (message, user) => {
          if (conversation.getCurrent()) return null;
          const provider = providerAdapters.find((candidate) => candidate.id === bridgeDefaults.defaultProvider);
          if (!provider?.attachSession || !provider.listRecoverableSessions) return null;
          const attached = await autoAttachProviderSessionForMessage({
            message,
            user,
            provider,
            conversationStore: conversation,
            lastProviderSessions,
            defaultProviderId: bridgeDefaults.defaultProvider,
            defaultCwd: bridgeDefaults.defaultWorkspace,
          });
          if (attached) {
            sessionBindingMatch.set(attached.session.id, attached.matchedBinding);
            return attached.session;
          }
          return null;
        },
        lastProviderSessions,
        events,
        defaults: bridgeDefaults,
      })
    : undefined;
  if (channel && messageRouter) {
    channel.onMessage(async (message) => {
      await messageRouter.handleMessage(message);
    });
  }

  registerChannelAdminRoutes({
    app,
    users: activeUserStore,
    ...(channel ? { channel } : {}),
    lastProviderSessions,
    conversation,
    defaults: bridgeDefaults,
    providers: providerAdapters,
    getSessionBindingMatch: (sessionId) => sessionBindingMatch.get(sessionId) === true,
    wechat: options.wechat,
    events,
    configPath,
    onWechatConfigChanged: managedWechatChannel
    ? async (next) => {
          await managedWechatChannel.configure(next);
        }
      : undefined,
  });
  registerSettingsRoutes({
    app,
    defaults: bridgeDefaults,
    configPath,
  });

  app.get('/api/status', async () => ({
    ok: true,
    sessions: conversation.getCurrent() ? [conversation.getCurrent()!] : [],
    permissions: permissions.getPendingRequests(),
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

  app.post('/api/bridge-events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const write = (event: unknown) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // client gone; cleanup runs on close
      }
    };

    write({ type: 'connected' });
    const unsubscribe = events.subscribe(write);
    const heartbeat = setInterval(() => write({ type: 'ping' }), 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    return reply.hijack();
  });

  app.addHook('onReady', async () => {
    await channel?.start({ background: true } as { background?: boolean });
  });

  app.addHook('onClose', async () => {
    await channel?.stop();
  });

  return { app, conversation, sessions: conversation, permissions, events, activeUserStore };
}
