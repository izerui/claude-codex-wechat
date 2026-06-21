import type { FastifyInstance } from 'fastify';
import type { ChannelAdapter } from '../channels/types';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import { WeixinDirectLoginClient } from '../channels/weixin-direct/loginClient';
import type { WeixinConfig } from '../daemon/config';
import { defaultConfigPath } from '../daemon/config';
import { deleteConfigFile, persistWechatCredentialsToConfigFile } from '../daemon/configPersistence';
import type { BridgeEventHub } from '../daemon/events';
import type { LastProviderSessionStore } from '../storage/lastProviderSessionStore';
import type { ActiveWeChatUserStore } from '../storage/userStore';
import { PUSH_QUOTA_LIMIT, PUSH_WINDOW_MS, type WeixinStateStore } from '../channels/weixin-direct/weixinStateStore';
import type { CurrentConversationStore } from '../session/currentConversationStore';
import type { NativeProviderAdapter } from '../providers/types';
import { ensureClaudeSessionBridgeMetadata, findRecoverableClaudeSessionPath, getClaudeRecoverableSessionById, hasClaudeHistoryDisplay, hasClaudeSessionBridgeMetadata, listRecoverableClaudeSessions } from '../providers/claude-code/nativeSessions';
import { findRecoverableCodexSessionPath } from '../providers/codex/nativeSessions';
import { attachProviderSessionToBridge, listUnattachedRecoverableSessions, selectBestRecoverableSession } from '../session/providerAutoAttach';

export function registerChannelAdminRoutes(input: {
  app: FastifyInstance;
  lastProviderSessions?: LastProviderSessionStore;
  conversation?: CurrentConversationStore;
  defaults?: { defaultProvider: 'claude-code' | 'codex'; defaultWorkspace: string };
  providers?: NativeProviderAdapter[];
  getSessionBindingMatch?: (sessionId: string) => boolean;
  users: ActiveWeChatUserStore;
  weixinStateStore?: WeixinStateStore;
  wechat?: WeixinConfig;
  channel?: ChannelAdapter;
  events?: BridgeEventHub;
  onWechatConfigChanged?: (next: WeixinConfig) => Promise<void>;
  configPath?: string;
}): void {
  let wechat = input.wechat;
  const configPath = input.configPath ?? process.env.BRIDGE_CONFIG ?? defaultConfigPath();

  input.channel?.onHealthChange?.(() => {
    input.events?.emit({
      type: 'channel.plugin-status-changed',
      plugin_id: 'weixin',
      status: toWechatPluginStatus(wechat, input.users, input.channel),
    });
  });

  input.app.get('/api/channel/plugins', async () => [toWechatPluginStatus(wechat, input.users, input.channel)]);
  input.app.get('/api/channel/wechat/runtime-config', async () => wechat ?? { enabled: false });
  input.app.get('/api/channel/state', async () => ({
    activeUser: input.users.getActiveUser(),
    plugin: toWechatPluginStatus(wechat, input.users, input.channel),
    settings: input.defaults ?? { defaultProvider: 'claude-code', defaultWorkspace: process.cwd() },
    runtimeConfig: wechat ?? null,
    lastProviderSessions: input.lastProviderSessions?.list() ?? {},
    quota: toQuotaView(input.users, input.weixinStateStore),
  }));

  input.app.post<{ Body: { plugin_id: string; config?: Record<string, unknown> } }>('/api/channel/plugins/enable', async (request, reply) => {
    if (request.body.plugin_id !== 'weixin') {
      return reply.code(400).send({ ok: false, error: 'unknown_channel_plugin' });
    }
    const config = request.body.config ?? {};
    const credentials = typeof config.credentials === 'object' && config.credentials ? config.credentials as Record<string, unknown> : {};
    const previousWechat = wechat;
    const baseUrl = typeof config.baseUrl === 'string'
      ? config.baseUrl
      : typeof credentials.baseUrl === 'string'
        ? credentials.baseUrl
        : previousWechat?.baseUrl;
    const token = typeof config.token === 'string' ? config.token : typeof credentials.bot_token === 'string' ? credentials.bot_token : undefined;
    const accountId = typeof credentials.account_id === 'string'
      ? credentials.account_id
      : previousWechat?.accountId;
    if (!baseUrl) return reply.code(400).send({ ok: false, error: 'wechat_base_url_required' });
    const nextWechat = { enabled: true, baseUrl, token, accountId };
    await input.onWechatConfigChanged?.(nextWechat);
    if (token && accountId) {
      await persistWechatCredentialsToConfigFile({
        configPath,
        accountId,
        token,
        baseUrl,
      });
    }
    wechat = nextWechat;
    input.events?.emit({
      type: 'channel.plugin-status-changed',
      plugin_id: 'weixin',
      status: toWechatPluginStatus(wechat, input.users, input.channel),
    });
    return { ok: true };
  });

  input.app.get('/api/channel/weixin/login', async (_request, reply) => {
    const client = new WeixinDirectLoginClient();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    try {
      const qr = await client.fetchQrCode();
      reply.raw.write(`event: qr\n`);
      reply.raw.write(`data: ${JSON.stringify({ qrcodeData: qr.qrcodeData })}\n\n`);

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, client.pollIntervalMs));
        const status = await client.pollQrCodeStatus(qr.ticket);
        if (status.status === 'waiting') continue;
        if (status.status === 'scanned') {
          reply.raw.write(`event: scanned\n`);
          reply.raw.write('data: {}\n\n');
          continue;
        }
        if (status.status === 'confirmed') {
          reply.raw.write(`event: done\n`);
          reply.raw.write(`data: ${JSON.stringify({
            accountId: status.accountId,
            botToken: status.botToken,
            baseUrl: status.baseUrl,
          })}\n\n`);
          break;
        }
        reply.raw.write(`event: error\n`);
        reply.raw.write(`data: ${JSON.stringify({ message: 'QR code expired' })}\n\n`);
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply.raw.write(`event: error\n`);
      reply.raw.write(`data: ${JSON.stringify({ message })}\n\n`);
    }
    reply.raw.end();
    return reply.hijack();
  });

  input.app.post<{ Body: { plugin_id: string } }>('/api/channel/plugins/disable', async (request, reply) => {
    if (request.body.plugin_id !== 'weixin') {
      return reply.code(400).send({ ok: false, error: 'unknown_channel_plugin' });
    }
    try {
      const runtimeSession = input.conversation?.getCurrent();
      if (runtimeSession) {
        const provider = input.providers?.find((candidate) => candidate.id === runtimeSession.providerId);
        await provider?.stopSession(runtimeSession.id);
      }
      input.conversation?.clear();
      input.events?.emit({ type: 'channel.current-session-changed' });
      const activeUser = input.users.getActiveUser();
      if (activeUser) {
        input.users.clearActiveUser(activeUser.id);
      }
      const nextWechat = { enabled: false };
      await input.onWechatConfigChanged?.(nextWechat);
      wechat = nextWechat;
      input.events?.emit({
        type: 'channel.plugin-status-changed',
        plugin_id: 'weixin',
        status: toWechatPluginStatus(wechat, input.users, input.channel),
      });
      await deleteConfigFile(configPath);
      return { ok: true };
    } catch (err) {
      input.app.log.error({ err }, '[disable] failed');
      return reply.code(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  input.app.get('/api/channel/active-user', async () => input.users.getActiveUser());

  input.app.get<{ Params: { providerId: string } }>('/api/channel/providers/:providerId/recoverable-sessions', async (request, reply) => {
    const provider = input.providers?.find((candidate) => candidate.id === request.params.providerId);
    if (!provider?.listRecoverableSessions) {
      return reply.code(404).send({ ok: false, error: 'provider_session_listing_not_supported' });
    }
    return await Promise.all((await listUnattachedRecoverableSessions({
      provider,
      providerId: request.params.providerId === 'codex' ? 'codex' : 'claude-code',
      currentSession: input.conversation?.getCurrent(),
    })).map(async (session) => ({
      ...session,
      preferredResumeMode: buildPreferredResumeMode(session.providerId, session.resumeTitle),
      preferredResumeCommand: buildPreferredResumeCommand(session.providerId, session.id, session.resumeTitle),
      providerResumeCommand: buildProviderResumeCommand(session.providerId, session.id),
      providerResumeByTitleCommand: buildProviderResumeByTitleCommand(session.providerId, session.resumeTitle),
      providerResumeTitleSynced: await resolveRecoverableProviderResumeTitleSynced(session),
      providerResumeHistorySynced: await resolveRecoverableProviderResumeHistorySynced(session),
      providerResumeRepairable: session.providerId === 'claude-code' && Boolean(session.id && session.resumeTitle && await findRecoverableClaudeSessionPath(session.id)),
    })));
  });

  input.app.post<{ Body: {
    providerId: string;
    providerSessionId: string;
    platformUserId: string;
    chatId?: string;
    cwd?: string;
  } }>('/api/channel/sessions/attach', async (request, reply) => {
    const provider = input.providers?.find((candidate) => candidate.id === request.body.providerId);
    if (!provider?.attachSession) {
      return reply.code(404).send({ ok: false, error: 'provider_session_attach_not_supported' });
    }
    const user = input.users.isActiveUser(PRIMARY_WEIXIN_PLATFORM, request.body.platformUserId);
    if (!user) {
      return reply.code(404).send({ ok: false, error: 'active_wechat_user_not_found' });
    }
    if (!input.conversation) {
      return reply.code(500).send({ ok: false, error: 'current_conversation_store_unavailable' });
    }
    const recoverableCandidate = provider.listRecoverableSessions
      ? (await provider.listRecoverableSessions()).find((candidate) => candidate.id === request.body.providerSessionId)
      : undefined;
    const attached = await attachProviderSessionToBridge({
      conversationStore: input.conversation,
      lastProviderSessions: input.lastProviderSessions,
      provider,
      user,
      providerId: request.body.providerId === 'codex' ? 'codex' : 'claude-code',
      providerSessionId: request.body.providerSessionId,
      chatId: request.body.chatId ?? user.platformUserId,
      cwd: request.body.cwd ?? recoverableCandidate?.cwd ?? input.defaults?.defaultWorkspace ?? process.cwd(),
      recoverySource: 'manual_attach',
      resumeTitle: recoverableCandidate?.resumeTitle,
    });
    input.events?.emit({ type: 'channel.current-session-changed' });
    return {
      ok: true,
      session: {
        ...attached,
        preferredResumeMode: buildPreferredResumeMode(attached.providerId, attached.resumeTitle),
        preferredResumeCommand: buildPreferredResumeCommand(attached.providerId, attached.providerSessionId, attached.resumeTitle),
        providerResumeCommand: buildProviderResumeCommand(attached.providerId, attached.providerSessionId),
        providerResumeByTitleCommand: buildProviderResumeByTitleCommand(attached.providerId, attached.resumeTitle),
      },
    };
  });

  input.app.post<{ Body: {
    providerId: string;
    platformUserId: string;
    cwd?: string;
    chatId?: string;
  } }>('/api/channel/sessions/new', async (request, reply) => {
    const user = input.users.isActiveUser(PRIMARY_WEIXIN_PLATFORM, request.body.platformUserId);
    if (!user) {
      return reply.code(404).send({ ok: false, error: 'active_wechat_user_not_found' });
    }
    if (!input.conversation) {
      return reply.code(500).send({ ok: false, error: 'current_conversation_store_unavailable' });
    }
    const providerId = request.body.providerId === 'codex' ? 'codex' : 'claude-code';
    const cwd = typeof request.body.cwd === 'string' && request.body.cwd.trim()
      ? request.body.cwd
      : input.defaults?.defaultWorkspace ?? process.cwd();
    const chatId = request.body.chatId ?? user.platformUserId;
    const session = input.conversation.create({
      chatId,
      ownerUserId: user.id,
      providerId,
      cwd,
    });
    input.events?.emit({ type: 'channel.current-session-changed' });
    const providerLabel = providerId === 'codex' ? 'Codex' : 'Claude Code';
    try {
      await input.channel?.sendMessage({
        chatId,
        kind: 'status',
        text: `已新建 ${providerLabel} 会话，项目目录：${cwd}。`,
      });
    } catch (error) {
      // 通知是 best-effort：会话已创建成功，微信推送失败（如网关临时错误）不应让整个请求失败。
      request.log.warn({ err: error }, 'sessions_new_notify_failed');
    }
    return {
      ok: true,
      session: {
        id: session.id,
        providerId: session.providerId,
        cwd: session.cwd,
        status: session.status,
      },
    };
  });

  input.app.post<{ Body: {
    providerId: string;
    platformUserId: string;
    chatId?: string;
    cwd?: string;
  } }>('/api/channel/sessions/auto-attach', async (request, reply) => {
    const provider = input.providers?.find((candidate) => candidate.id === request.body.providerId);
    if (!provider?.attachSession || !provider.listRecoverableSessions) {
      return reply.code(404).send({ ok: false, error: 'provider_session_attach_not_supported' });
    }
    const user = input.users.isActiveUser(PRIMARY_WEIXIN_PLATFORM, request.body.platformUserId);
    if (!user) {
      return reply.code(404).send({ ok: false, error: 'active_wechat_user_not_found' });
    }
    if (!input.conversation) {
      return reply.code(500).send({ ok: false, error: 'current_conversation_store_unavailable' });
    }
    const targetCwd = request.body.cwd ?? input.defaults?.defaultWorkspace ?? process.cwd();
    const selection = await selectBestRecoverableSession({
      provider,
      providerId: request.body.providerId === 'codex' ? 'codex' : 'claude-code',
      targetCwd,
      lastProviderSessions: input.lastProviderSessions,
      currentSession: input.conversation.getCurrent(),
    });
    if (!selection) {
      return reply.code(404).send({ ok: false, error: 'recoverable_provider_session_not_found' });
    }
    const attached = await attachProviderSessionToBridge({
      conversationStore: input.conversation,
      lastProviderSessions: input.lastProviderSessions,
      provider,
      user,
      providerId: request.body.providerId === 'codex' ? 'codex' : 'claude-code',
      providerSessionId: selection.candidate.id,
      chatId: request.body.chatId ?? user.platformUserId,
      cwd: request.body.cwd ?? selection.candidate.cwd ?? input.defaults?.defaultWorkspace ?? process.cwd(),
      recoverySource: selection.bindingSource,
      resumeTitle: selection.candidate.resumeTitle,
    });
    return {
      ok: true,
      session: {
        ...attached,
        bindingMatched: selection.matchedBinding,
        bindingSource: selection.bindingSource,
        preferredResumeMode: buildPreferredResumeMode(attached.providerId, attached.resumeTitle),
        preferredResumeCommand: buildPreferredResumeCommand(attached.providerId, attached.providerSessionId, attached.resumeTitle),
        providerResumeCommand: buildProviderResumeCommand(attached.providerId, attached.providerSessionId),
        providerResumeByTitleCommand: buildProviderResumeByTitleCommand(attached.providerId, attached.resumeTitle),
      },
    };
  });

  input.app.get('/api/channel/current-session', async () => {
    const session = input.conversation?.getCurrent();
    if (!session) return null;
    const provider = input.providers?.find((candidate) => candidate.id === session.providerId);
    const nativeTitle = session.providerSessionId && provider?.listRecoverableSessions
      ? (await provider.listRecoverableSessions().catch(() => []))
          .find((candidate) => candidate.id === session.providerSessionId)?.title
      : undefined;
    const providerNativePath = await resolveProviderNativePath(session.providerId, session.providerSessionId);
    const providerResumeTitleSynced = await resolveProviderResumeTitleSynced(session);
    const providerResumeHistorySynced = await resolveProviderResumeHistorySynced(session);
    const binding = input.lastProviderSessions?.get(session.providerId);
    return {
      ...session,
      ...(nativeTitle ? { nativeTitle } : {}),
      preferredResumeMode: buildPreferredResumeMode(session.providerId, session.resumeTitle),
      preferredResumeCommand: buildPreferredResumeCommand(session.providerId, session.providerSessionId, session.resumeTitle),
      providerResumeCommand: buildProviderResumeCommand(session.providerId, session.providerSessionId),
      providerResumeByTitleCommand: buildProviderResumeByTitleCommand(session.providerId, session.resumeTitle),
      bindingMatched: input.getSessionBindingMatch?.(session.id) === true,
      bindingSource: session.recoverySource,
      ...(binding ? {
        bindingProviderSessionId: binding.providerSessionId,
        bindingUpdatedAt: binding.updatedAt,
      } : {}),
      providerNativeReachable: Boolean(providerNativePath),
      providerResumeTitleSynced,
      providerResumeHistorySynced,
      providerResumeRepairable: session.providerId === 'claude-code' && Boolean(session.providerSessionId && session.resumeTitle && providerNativePath),
      ...(providerNativePath ? { providerNativePath } : {}),
    };
  });

  input.app.get('/api/channel/sessions', async () => {
    const session = await input.app.inject({ method: 'GET', url: '/api/channel/current-session' });
    if (session.statusCode === 404) return [];
    const payload = session.json();
    return payload ? [payload] : [];
  });

  input.app.post<{ Body: { platform: string } }>('/api/channel/settings/sync', async (_request) => {
    input.conversation?.clear();
    input.events?.emit({ type: 'channel.current-session-changed' });
    return { ok: true };
  });
}

/**
 * Builds the WeChat proactive-push quota view for the current active user, or null
 * when there's no weixin user / no quota store. `windowEndsAt` is the absolute time
 * the token's 24h window closes (0 when no token), so the UI can render a countdown.
 */
function toQuotaView(activeUserStore: ActiveWeChatUserStore, store?: WeixinStateStore) {
  if (!store) return null;
  const activeUser = activeUserStore.getActiveUser();
  if (activeUser?.platform !== PRIMARY_WEIXIN_PLATFORM) return null;
  const quota = store.getQuota(activeUser.platformUserId);
  return {
    remaining: quota.remaining,
    sentCount: quota.sentCount,
    limit: PUSH_QUOTA_LIMIT,
    expired: quota.expired,
    windowEndsAt: quota.windowStartAt ? quota.windowStartAt + PUSH_WINDOW_MS : 0,
  };
}

function toWechatPluginStatus(wechat: WeixinConfig | undefined, activeUserStore: ActiveWeChatUserStore, channel?: ChannelAdapter) {  const health = channel?.getHealth?.();
  return {
    id: PRIMARY_WEIXIN_PLATFORM,
    type: 'weixin' as const,
    name: 'WeChat channel' as const,
    enabled: wechat?.enabled === true,
    connected: health ? health.connected : wechat?.enabled === true && Boolean(wechat.baseUrl),
    status: health ? health.status : wechat?.enabled === true ? 'configured' : 'disabled',
    ...(health?.lastError ? { lastError: health.lastError } : {}),
    activeUsers: activeUserStore.getActiveUser()?.platform === PRIMARY_WEIXIN_PLATFORM ? 1 : 0,
    hasToken: Boolean(wechat?.token),
    botUsername: wechat?.accountId,
  };
}

function buildProviderResumeCommand(providerId: string, providerSessionId: string | undefined): string | undefined {
  if (!providerSessionId) return undefined;
  if (providerId === 'claude-code') return `claude --resume ${providerSessionId}`;
  if (providerId === 'codex') return `codex exec resume --json --last ${providerSessionId}`;
  return undefined;
}

function buildProviderResumeByTitleCommand(providerId: string, title: string | undefined): string | undefined {
  if (!title) return undefined;
  if (providerId === 'claude-code') return `claude -r ${title}`;
  if (providerId === 'codex') return `codex exec resume --json --last ${title}`;
  return undefined;
}

function buildPreferredResumeCommand(
  providerId: string,
  providerSessionId: string | undefined,
  title: string | undefined,
): string | undefined {
  return buildProviderResumeByTitleCommand(providerId, title) ?? buildProviderResumeCommand(providerId, providerSessionId);
}

function buildPreferredResumeMode(providerId: string, title: string | undefined): 'title' | 'id' {
  return buildProviderResumeByTitleCommand(providerId, title) ? 'title' : 'id';
}


async function resolveProviderNativePath(providerId: string, providerSessionId: string | undefined): Promise<string | null> {
  if (!providerSessionId) return null;
  if (providerId === 'claude-code') return await findRecoverableClaudeSessionPath(providerSessionId);
  if (providerId === 'codex') return await findRecoverableCodexSessionPath(providerSessionId);
  return null;
}

async function resolveProviderResumeTitleSynced(session: {
  providerId: string;
  providerSessionId?: string;
  resumeTitle?: string;
}): Promise<boolean | undefined> {
  if (session.providerId !== 'claude-code' || !session.providerSessionId || !session.resumeTitle) return undefined;
  return await hasClaudeSessionBridgeMetadata({
    sessionId: session.providerSessionId,
    resumeTitle: session.resumeTitle,
  });
}

async function resolveRecoverableProviderResumeTitleSynced(session: {
  providerId: string;
  id: string;
  resumeTitle?: string;
}): Promise<boolean | undefined> {
  if (session.providerId !== 'claude-code' || !session.resumeTitle) return undefined;
  return await hasClaudeSessionBridgeMetadata({
    sessionId: session.id,
    resumeTitle: session.resumeTitle,
  });
}

async function resolveProviderResumeHistorySynced(session: {
  providerId: string;
  providerSessionId?: string;
  resumeTitle?: string;
}): Promise<boolean | undefined> {
  if (session.providerId !== 'claude-code' || !session.providerSessionId || !session.resumeTitle) return undefined;
  return await hasClaudeHistoryDisplay({
    sessionId: session.providerSessionId,
    resumeTitle: session.resumeTitle,
  });
}

async function resolveRecoverableProviderResumeHistorySynced(session: {
  providerId: string;
  id: string;
  resumeTitle?: string;
}): Promise<boolean | undefined> {
  if (session.providerId !== 'claude-code' || !session.resumeTitle) return undefined;
  return await hasClaudeHistoryDisplay({
    sessionId: session.id,
    resumeTitle: session.resumeTitle,
  });
}
