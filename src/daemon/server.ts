import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { registerChannelAdminRoutes } from '../admin/channelAdminRoutes';
import { registerTunnelRoutes } from '../admin/tunnelRoutes';
import { registerSettingsRoutes } from '../admin/settingsRoutes';
import { registerFsBrowseRoutes } from '../admin/fsBrowseRoutes';
import type { ChannelAdapter, ChannelOutgoingMessage } from '../channels/types';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import { ManagedWeixinDirectAdapter } from '../channels/weixin-direct/managedAdapter';
import { FileWeixinStateStore } from '../channels/weixin-direct/weixinStateStore';
import { WeixinOutboundGate } from '../channels/weixin-direct/outboundGate';
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
import { defaultConfigPath, loadBridgeConfig, type WeixinConfig, type BridgeConfig } from './config';
import { BridgeEventHub } from './events';
import { listLanIpv4Addresses } from './bootstrap';
import type { TunnelProvider, TunnelStatusView } from '../runtime/tunnelProvider';
import { RelayTunnelRouter } from '../runtime/relayTunnelRouter';
import { ensureRelayAuthTokenSync } from './configPersistence';
import { readClientVersion } from '../shared/version';

// 读取 config 里的更新检测块。区分“读成功”(ok:true,update 可能为 undefined 表示无更新块)
// 与“读失败”(ok:false,config 缺失/损坏)——调用方只在读失败时才回退到启动快照,
// 避免把“配置已重置、无更新块”误当成失败而显示过期数据。
function readUpdateStatusBestEffort(configPath: string | undefined): { ok: boolean; update?: BridgeConfig['update'] } {
  if (!configPath) return { ok: false };
  try {
    return { ok: true, update: loadBridgeConfig(configPath).update };
  } catch {
    return { ok: false };
  }
}

export function createDaemonServer(options: {
  db?: unknown;
  channel?: ChannelAdapter;
  providers?: NativeProviderAdapter[];
  activeUserStore?: ActiveWeChatUserStore;
  wechat?: WeixinConfig;
  bridgeDefaults?: {
    defaultProvider: 'claude-code' | 'codex';
    defaultWorkspace: string;
    tunnel?: { enabled: boolean; relay?: { serverUrl?: string; authToken?: string } };
  };
  providerCommands?: BridgeConfig['providers'];
  configPath?: string;
  tunnelProvider?: TunnelProvider;
} = {}) {
  const app = Fastify({ logger: true });
  const events = new BridgeEventHub();
  const configPath = options.configPath
    ?? process.env.BRIDGE_CONFIG
    ?? join(mkdtempSync(join(tmpdir(), 'claude-codex-wechat-')), 'config.json');
  const persistedConfig = loadBridgeConfig(configPath);
  const bridgeDefaults = {
    defaultProvider: options.bridgeDefaults?.defaultProvider ?? persistedConfig.bridge?.defaultProvider ?? 'claude-code',
    defaultWorkspace: options.bridgeDefaults?.defaultWorkspace ?? persistedConfig.bridge?.defaultWorkspace ?? process.cwd(),
    tunnel: options.bridgeDefaults?.tunnel ?? {
      relay: {
        serverUrl: persistedConfig.tunnel?.relay?.serverUrl ?? 'wss://wechat.style520.com/agent',
        ...(persistedConfig.tunnel?.relay?.authToken ? { authToken: persistedConfig.tunnel.relay.authToken } : {}),
      },
    },
  };
  const existingRelayAuthToken = bridgeDefaults.tunnel.relay?.authToken?.trim();
  if (existingRelayAuthToken) {
    bridgeDefaults.tunnel.relay = {
      ...(bridgeDefaults.tunnel.relay ?? {}),
      authToken: existingRelayAuthToken,
    };
  } else {
    const authToken = ensureRelayAuthTokenSync({ configPath });
    bridgeDefaults.tunnel.relay = {
      ...(bridgeDefaults.tunnel.relay ?? {}),
      authToken,
    };
  }
  const conversation = new CurrentConversationStore(configPath, {
    defaultCwd: bridgeDefaults.defaultWorkspace,
    defaultProviderId: bridgeDefaults.defaultProvider,
  });
  const providers = new ProviderRegistry({
    claudeCommand: options.providerCommands?.claude?.command,
    codexCommand: options.providerCommands?.codex?.command,
  });
  const activeUserStore = options.activeUserStore
    ?? new RuntimeUserStore(configPath);
  const lastProviderSessions = new LastProviderSessionStore(configPath);
  const sessionBindingMatch = new Map<string, boolean>();
  // Generate MCP config for Claude Code to access media-sending tools.
  const bridgePort = process.env.BRIDGE_PORT ?? '8787';
  const mcpConfigPath = join(dirname(configPath), 'mcp-media.json');
  const serverDir = dirname(fileURLToPath(import.meta.url));
  // In dev (tsx): serverDir is src/daemon, mediaServer is src/mcp/mediaServer.ts
  // In prod (built): serverDir is dist/server, mediaServer is dist/mcp/mediaServer.js
  const mcpMediaServerTs = join(serverDir, '..', 'mcp', 'mediaServer.ts');
  const mcpMediaServerJs = join(serverDir, '..', 'mcp', 'mediaServer.js');
  const useTs = existsSync(mcpMediaServerTs) && !existsSync(mcpMediaServerJs);
  const mcpCommand = useTs ? 'tsx' : 'node';
  const mcpArgs = [useTs ? mcpMediaServerTs : mcpMediaServerJs];
  writeFileSync(mcpConfigPath, JSON.stringify({
    mcpServers: {
      'wechat-media': {
        command: mcpCommand,
        args: mcpArgs,
        env: { BRIDGE_API_URL: `http://localhost:${bridgePort}` },
      },
    },
  }, null, 2) + '\n');
  const providerAdapters = options.providers ?? createDefaultProviders({
    claudeCommand: options.providerCommands?.claude?.command,
    codexCommand: options.providerCommands?.codex?.command,
    mcpConfigPath,
    codexProfile: 'wechat-bridge',
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
  const weixinStateStore = configPath ? new FileWeixinStateStore(configPath) : undefined;
  const weixinMediaDir = configPath ? join(dirname(configPath), 'media') : undefined;
  const managedWechatChannel = options.channel ? null : new ManagedWeixinDirectAdapter(options.wechat, weixinStateStore, weixinMediaDir);
  const channel = options.channel ?? managedWechatChannel;
  // Quota-aware outbound gate only for the real WeChat channel (it has the 10/24h limit).
  const weixinOutboundGate = managedWechatChannel && weixinStateStore
    ? new WeixinOutboundGate({
        store: weixinStateStore,
        send: async (chatId, msg) => {
          await managedWechatChannel.sendMessage({
            chatId,
            kind: msg.kind as ChannelOutgoingMessage['kind'],
            text: msg.text,
            ...(msg.filePath ? { filePath: msg.filePath } : {}),
            ...(msg.fileName ? { fileName: msg.fileName } : {}),
          });
        },
      })
    : undefined;
  const tunnelProvider = options.tunnelProvider
    ?? new RelayTunnelRouter({
      bridgePort: Number(process.env.BRIDGE_PORT ?? 8787),
      defaults: bridgeDefaults,
    });

  const messageRouter = channel
    ? new MessageRouter({
        channel,
        providers: providerAdapters,
        conversation,
        outboundGate: weixinOutboundGate,
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
        autoAttachSession: async (message, user, opts) => {
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
            ...(opts?.shouldCommit ? { shouldCommit: opts.shouldCommit } : {}),
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
        getHelpAddress: async () => {
          const tunnel = await tunnelProvider?.getStatus().catch(() => null);
          if (tunnel?.running && tunnel.publicUrl) return tunnel.publicUrl;
          const lan = listLanIpv4Addresses()[0];
          if (lan) return `http://${lan}:${process.env.BRIDGE_PORT ?? 8787}`;
          return `http://127.0.0.1:${process.env.BRIDGE_PORT ?? 8787}`;
        },
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
    ...(weixinStateStore ? { weixinStateStore } : {}),
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
  if (tunnelProvider) {
    registerTunnelRoutes({
      app,
      configPath,
      defaults: { tunnel: bridgeDefaults.tunnel },
      tunnelManager: tunnelProvider,
    });
  }

  registerFsBrowseRoutes({ app });

  app.get('/api/status', async () => {
    // 每次请求重新读 config,反映 daemon 每小时刷新的更新检测结果(持久化在 config)。
    // 仅当读失败(config 缺失/损坏)时才回退到启动快照;读成功但无 update 块 → 显示无更新。
    const read = readUpdateStatusBestEffort(configPath);
    const update = read.ok ? (read.update ?? null) : (persistedConfig.update ?? null);
    return {
      ok: true,
      version: readClientVersion(),
      sessions: conversation.getCurrent() ? [conversation.getCurrent()!] : [],
      update,
      preferredLocalUrl: (() => {
        const lan = listLanIpv4Addresses()[0];
        const port = process.env.BRIDGE_PORT ?? 8787;
        if (lan) return `http://${lan}:${port}`;
        return `http://127.0.0.1:${port}`;
      })(),
    };
  });

  app.get('/api/providers/status', async () => providers.getStatus());

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

  app.post<{ Body: { kind: string; filePath: string; fileName?: string; chatId?: string } }>('/api/channel/send-media', async (request, reply) => {
    const { kind, filePath, fileName, chatId } = request.body ?? {};
    if (!filePath || typeof filePath !== 'string') {
      return reply.code(400).send({ ok: false, error: 'filePath is required' });
    }
    const validKinds = ['image', 'video', 'audio', 'file'];
    if (!kind || !validKinds.includes(kind)) {
      return reply.code(400).send({ ok: false, error: `kind must be one of: ${validKinds.join(', ')}` });
    }
    if (!channel) {
      return reply.code(503).send({ ok: false, error: 'channel not available' });
    }
    // Resolve target chatId: explicit param > active user from store
    const targetChatId = chatId || activeUserStore.getActiveUser()?.platformUserId;
    if (!targetChatId) {
      return reply.code(400).send({ ok: false, error: 'no active chat target; provide chatId or ensure an active user exists' });
    }
    try {
      await channel.sendMessage({
        chatId: targetChatId,
        kind: kind as ChannelOutgoingMessage['kind'],
        text: '',
        filePath,
        ...(fileName ? { fileName } : {}),
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(500).send({ ok: false, error: msg });
    }
  });

  app.addHook('onReady', async () => {
    await channel?.start({ background: true } as { background?: boolean });
  });

  app.addHook('onClose', async () => {
    await channel?.stop();
  });

  return { app, conversation, sessions: conversation, events, activeUserStore, tunnelProvider };
}
