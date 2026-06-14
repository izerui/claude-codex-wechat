import type { FastifyInstance } from 'fastify';
import type { ChannelAdapter } from '../channels/types';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import { WeixinDirectLoginClient } from '../channels/weixin-direct/loginClient';
import type { WeixinConfig } from '../daemon/config';
import type { BridgeEventHub } from '../daemon/events';
import type { MessageLogRepository } from '../storage/messageLogRepository';
import type { PairingRepository } from '../storage/pairingRepository';
import type { ProviderBindingRepository } from '../storage/providerBindingRepository';
import type { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import type { SettingsRepository } from '../storage/settingsRepository';
import type { UserRepository } from '../storage/userRepository';
import type { SessionManager } from '../session/sessionManager';
import type { NativeProviderAdapter } from '../providers/types';
import { ensureClaudeSessionBridgeMetadata, findRecoverableClaudeSessionPath, getClaudeRecoverableSessionById, hasClaudeHistoryDisplay, hasClaudeSessionBridgeMetadata, listRecoverableClaudeSessions } from '../providers/claude-code/nativeSessions';
import { findRecoverableCodexSessionPath } from '../providers/codex/nativeSessions';
import { attachProviderSessionToBridge, listUnattachedRecoverableSessions, selectBestRecoverableSession } from '../session/providerAutoAttach';

export function registerChannelAdminRoutes(input: {
  app: FastifyInstance;
  pairings: PairingRepository;
  providerBindings?: ProviderBindingRepository;
  sessions?: RuntimeSessionRepository;
  sessionManager?: SessionManager;
  providers?: NativeProviderAdapter[];
  getSessionBindingMatch?: (sessionId: string) => boolean;
  settings?: SettingsRepository;
  messageLog?: MessageLogRepository;
  users: UserRepository;
  wechat?: WeixinConfig;
  channel?: ChannelAdapter;
  events?: BridgeEventHub;
  onWechatConfigChanged?: (next: WeixinConfig) => Promise<void>;
}): void {
  let wechat = input.wechat ?? readWechatSettings(input.settings);

  input.app.get('/api/channel/plugins', async () => [toWechatPluginStatus(wechat, input.users, input.channel)]);
  input.app.get('/api/channel/wechat/runtime-config', async () => wechat ?? { enabled: false });

  input.app.post<{ Body: { plugin_id: string; config?: Record<string, unknown> } }>('/api/channel/plugins/enable', async (request, reply) => {
    if (request.body.plugin_id !== 'weixin') {
      return reply.code(400).send({ ok: false, error: 'unknown_channel_plugin' });
    }
    const config = request.body.config ?? {};
    const credentials = typeof config.credentials === 'object' && config.credentials ? config.credentials as Record<string, unknown> : {};
    const previousWechat = wechat ?? readWechatSettings(input.settings);
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
    wechat = nextWechat;
    writeWechatSettings(input.settings, wechat);
    input.events?.emit({
      type: 'channel.plugin-status-changed',
      plugin_id: 'weixin',
      status: toWechatPluginStatus(wechat, input.users, input.channel),
    });
    return { ok: true };
  });

  input.app.get('/api/channel/weixin/login', async (_request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    try {
      const client = new WeixinDirectLoginClient();
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
    const nextWechat = { enabled: false };
    await input.onWechatConfigChanged?.(nextWechat);
    wechat = nextWechat;
    writeWechatSettings(input.settings, wechat);
    input.events?.emit({
      type: 'channel.plugin-status-changed',
      plugin_id: 'weixin',
      status: toWechatPluginStatus(wechat, input.users, input.channel),
    });
    return { ok: true };
  });

  input.app.get('/api/channel/pairings', async () => input.pairings.listPending());

  input.app.post<{ Params: { code: string } }>('/api/channel/pairings/:code/approve', async (request, reply) => {
    const pairing = input.pairings.findByCode(request.params.code);
    if (!pairing || pairing.status !== 'pending') return reply.code(400).send({ ok: false, error: 'pairing_not_pending' });
    const result = input.pairings.approve(request.params.code);
    if (!result.ok) return reply.code(400).send(result);
    const defaults = readBridgeDefaults(input.settings);
    if (!input.users.findByPlatformUser(PRIMARY_WEIXIN_PLATFORM, pairing.platformUserId)) {
      const created = input.users.createUser({
        platform: PRIMARY_WEIXIN_PLATFORM,
        platformUserId: pairing.platformUserId,
        displayName: pairing.displayName,
        role: 'user',
        defaultProvider: defaults.defaultProvider,
        defaultCwd: defaults.defaultWorkspace,
      });
      input.events?.emit({
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
    }
    return result;
  });

  input.app.post<{ Params: { code: string } }>('/api/channel/pairings/:code/reject', async (request, reply) => {
    const result = input.pairings.reject(request.params.code);
    if (!result.ok) return reply.code(400).send(result);
    return result;
  });

  input.app.get('/api/channel/users', async () => input.users.listUsers());

  input.app.get<{ Params: { providerId: string } }>('/api/channel/providers/:providerId/recoverable-sessions', async (request, reply) => {
    const provider = input.providers?.find((candidate) => candidate.id === request.params.providerId);
    if (!provider?.listRecoverableSessions) {
      return reply.code(404).send({ ok: false, error: 'provider_session_listing_not_supported' });
    }
    return await Promise.all((await listUnattachedRecoverableSessions({
      provider,
      providerId: request.params.providerId === 'codex' ? 'codex' : 'claude-code',
      sessionRepository: input.sessions,
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

  input.app.post<{ Params: { providerId: string; providerSessionId: string } }>('/api/channel/providers/:providerId/recoverable-sessions/:providerSessionId/repair-native-resume', async (request, reply) => {
    if (request.params.providerId !== 'claude-code') {
      return reply.code(400).send({ ok: false, error: 'native_resume_repair_not_supported' });
    }
    const recoverable = await getClaudeRecoverableSessionById(request.params.providerSessionId);
    if (!recoverable) {
      return reply.code(404).send({ ok: false, error: 'recoverable_provider_session_not_found' });
    }
    if (!recoverable.resumeTitle) {
      return reply.code(400).send({ ok: false, error: 'native_resume_repair_missing_metadata' });
    }
    const repaired = await ensureClaudeSessionBridgeMetadata({
      sessionId: recoverable.id,
      resumeTitle: recoverable.resumeTitle,
    });
    return { ok: true, repaired };
  });

  input.app.post<{ Params: { providerId: string } }>('/api/channel/providers/:providerId/recoverable-sessions/repair-native-resume', async (request, reply) => {
    if (request.params.providerId !== 'claude-code') {
      return reply.code(400).send({ ok: false, error: 'native_resume_repair_not_supported' });
    }
    const recoverable = await listRecoverableClaudeSessions();
    const candidates = recoverable.filter((session) => Boolean(session.resumeTitle));
    let repairedCount = 0;
    for (const session of candidates) {
      const repaired = await ensureClaudeSessionBridgeMetadata({
        sessionId: session.id,
        resumeTitle: session.resumeTitle!,
      });
      if (repaired) repairedCount += 1;
    }
    return {
      ok: true,
      repairedCount,
      checkedCount: candidates.length,
    };
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
    const user = input.users.findByPlatformUser(PRIMARY_WEIXIN_PLATFORM, request.body.platformUserId);
    if (!user) {
      return reply.code(404).send({ ok: false, error: 'authorized_user_not_found' });
    }
    if (!input.sessionManager) {
      return reply.code(500).send({ ok: false, error: 'bridge_session_manager_unavailable' });
    }
    const recoverableCandidate = provider.listRecoverableSessions
      ? (await provider.listRecoverableSessions()).find((candidate) => candidate.id === request.body.providerSessionId)
      : undefined;
    const attached = await attachProviderSessionToBridge({
      sessionManager: input.sessionManager,
      bindingRepository: input.providerBindings,
      sessionRepository: input.sessions,
      provider,
      user,
      providerId: request.body.providerId === 'codex' ? 'codex' : 'claude-code',
      providerSessionId: request.body.providerSessionId,
      chatId: request.body.chatId ?? user.platformUserId,
      cwd: request.body.cwd ?? recoverableCandidate?.cwd ?? user.defaultCwd,
      recoverySource: 'manual_attach',
    });
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
    chatId?: string;
    cwd?: string;
  } }>('/api/channel/sessions/auto-attach', async (request, reply) => {
    const provider = input.providers?.find((candidate) => candidate.id === request.body.providerId);
    if (!provider?.attachSession || !provider.listRecoverableSessions) {
      return reply.code(404).send({ ok: false, error: 'provider_session_attach_not_supported' });
    }
    const user = input.users.findByPlatformUser(PRIMARY_WEIXIN_PLATFORM, request.body.platformUserId);
    if (!user) {
      return reply.code(404).send({ ok: false, error: 'authorized_user_not_found' });
    }
    if (!input.sessionManager) {
      return reply.code(500).send({ ok: false, error: 'bridge_session_manager_unavailable' });
    }
    const targetCwd = request.body.cwd ?? user.defaultCwd;
    const selection = await selectBestRecoverableSession({
      provider,
      providerId: request.body.providerId === 'codex' ? 'codex' : 'claude-code',
      targetCwd,
      targetPlatformUserId: user.platformUserId,
      targetChatId: request.body.chatId ?? user.platformUserId,
      bindingRepository: input.providerBindings,
      sessionRepository: input.sessions,
    });
    if (!selection) {
      return reply.code(404).send({ ok: false, error: 'recoverable_provider_session_not_found' });
    }
    const attached = await attachProviderSessionToBridge({
      sessionManager: input.sessionManager,
      bindingRepository: input.providerBindings,
      sessionRepository: input.sessions,
      provider,
      user,
      providerId: request.body.providerId === 'codex' ? 'codex' : 'claude-code',
      providerSessionId: selection.candidate.id,
      chatId: request.body.chatId ?? user.platformUserId,
      cwd: request.body.cwd ?? selection.candidate.cwd ?? user.defaultCwd,
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

  input.app.post<{ Params: { id: string } }>('/api/channel/users/:id/revoke', async (request, reply) => {
    const result = input.users.revokeUser(request.params.id);
    if (!result.ok) return reply.code(404).send(result);
    return result;
  });

  input.app.get('/api/channel/sessions', async () => await Promise.all((input.sessions?.list() ?? []).map(async (session) => {
    const providerNativePath = await resolveProviderNativePath(session.providerId, session.providerSessionId);
    const providerResumeTitleSynced = await resolveProviderResumeTitleSynced(session);
    const providerResumeHistorySynced = await resolveProviderResumeHistorySynced(session);
    const binding = input.providerBindings?.findByChat('weixin', session.chatId, session.providerId);
    return {
      ...session,
      preferredResumeMode: buildPreferredResumeMode(session.providerId, session.resumeTitle),
      preferredResumeCommand: buildPreferredResumeCommand(session.providerId, session.providerSessionId, session.resumeTitle),
      providerResumeCommand: buildProviderResumeCommand(session.providerId, session.providerSessionId),
      providerResumeByTitleCommand: buildProviderResumeByTitleCommand(session.providerId, session.resumeTitle),
      bindingMatched: input.getSessionBindingMatch?.(session.id) === true,
      bindingSource: session.recoverySource,
      ...(binding ? {
        bindingPlatformUserId: binding.platformUserId,
        bindingProviderSessionId: binding.providerSessionId,
        bindingUpdatedAt: binding.updatedAt,
      } : {}),
      providerNativeReachable: Boolean(providerNativePath),
      providerResumeTitleSynced,
      providerResumeHistorySynced,
      providerResumeRepairable: session.providerId === 'claude-code' && Boolean(session.providerSessionId && session.resumeTitle && providerNativePath),
      ...(providerNativePath ? { providerNativePath } : {}),
    };
  })));

  input.app.post<{ Body: { platform: string } }>('/api/channel/settings/sync', async (_request) => {
    const archivedAt = Date.now();
    for (const session of input.sessions?.list() ?? []) {
      if (!session.archivedAt) input.sessionManager?.archiveSession(session.id, archivedAt);
    }
    input.sessions?.archiveAllActive(archivedAt);
    return { ok: true };
  });

  input.app.get<{ Params: { id: string } }>('/api/channel/sessions/:id/messages', async (request, reply) => {
    const runtimeSession = input.sessions?.findById(request.params.id);
    if (!runtimeSession) return reply.code(404).send({ ok: false, error: 'session_not_found' });
    const logs = input.messageLog?.listForSession(request.params.id) ?? [];
    return logs;
  });

  input.app.post<{ Params: { id: string } }>('/api/channel/sessions/:id/stop', async (request, reply) => {
    const runtimeSession = input.sessions?.findById(request.params.id);
    if (!runtimeSession) return reply.code(404).send({ ok: false, error: 'session_not_found' });
    const provider = input.providers?.find((candidate) => candidate.id === runtimeSession.providerId);
    await provider?.stopSession(runtimeSession.id);
    input.sessionManager?.archiveSession(runtimeSession.id);
    input.sessions?.archive(runtimeSession.id);
    return { ok: true };
  });

  input.app.post<{ Params: { id: string } }>('/api/channel/sessions/:id/archive', async (request, reply) => {
    const runtimeSession = input.sessions?.findById(request.params.id);
    if (!runtimeSession) return reply.code(404).send({ ok: false, error: 'session_not_found' });
    input.sessionManager?.archiveSession(runtimeSession.id);
    input.sessions?.archive(runtimeSession.id);
    return { ok: true };
  });

  input.app.post<{ Params: { id: string } }>('/api/channel/sessions/:id/repair-native-resume', async (request, reply) => {
    const runtimeSession = input.sessions?.findById(request.params.id);
    if (!runtimeSession) return reply.code(404).send({ ok: false, error: 'session_not_found' });
    if (runtimeSession.providerId !== 'claude-code') {
      return reply.code(400).send({ ok: false, error: 'native_resume_repair_not_supported' });
    }
    if (!runtimeSession.providerSessionId || !runtimeSession.resumeTitle) {
      return reply.code(400).send({ ok: false, error: 'native_resume_repair_missing_metadata' });
    }
    const repaired = await ensureClaudeSessionBridgeMetadata({
      sessionId: runtimeSession.providerSessionId,
      resumeTitle: runtimeSession.resumeTitle,
    });
    return { ok: true, repaired };
  });

  input.app.post('/api/channel/sessions/repair-native-resume', async () => {
    const sessions = (input.sessions?.list() ?? []).filter((session) => (
      session.providerId === 'claude-code' &&
      Boolean(session.providerSessionId && session.resumeTitle)
    ));
    let repairedCount = 0;
    for (const session of sessions) {
      const repaired = await ensureClaudeSessionBridgeMetadata({
        sessionId: session.providerSessionId!,
        resumeTitle: session.resumeTitle!,
      });
      if (repaired) repairedCount += 1;
    }
    return {
      ok: true,
      repairedCount,
      checkedCount: sessions.length,
    };
  });
}

function toWechatPluginStatus(wechat: WeixinConfig | undefined, users: UserRepository, channel?: ChannelAdapter) {
  const health = channel?.getHealth?.();
  return {
    id: PRIMARY_WEIXIN_PLATFORM,
    type: 'weixin' as const,
    name: 'WeChat channel' as const,
    enabled: wechat?.enabled === true,
    connected: health ? health.connected : wechat?.enabled === true && Boolean(wechat.baseUrl),
    status: health ? health.status : wechat?.enabled === true ? 'configured' : 'disabled',
    ...(health?.lastError ? { lastError: health.lastError } : {}),
    activeUsers: users.listUsers().filter((user) => user.platform === PRIMARY_WEIXIN_PLATFORM).length,
    hasToken: Boolean(wechat?.token),
    botUsername: wechat?.accountId,
  };
}

function readWechatSettings(settings: SettingsRepository | undefined): WeixinConfig | undefined {
  const raw = settings?.get('channel.wechat');
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : undefined,
    token: typeof record.token === 'string' ? record.token : undefined,
    accountId: typeof record.accountId === 'string' ? record.accountId : undefined,
  };
}

function writeWechatSettings(settings: SettingsRepository | undefined, wechat: WeixinConfig): void {
  settings?.set('channel.wechat', wechat);
}

function readBridgeDefaults(settings: SettingsRepository | undefined): { defaultProvider: 'claude-code' | 'codex'; defaultWorkspace: string } {
  const defaultProvider = settings?.get('settings.defaultProvider') === 'codex' ? 'codex' : 'claude-code';
  const defaultWorkspace = typeof settings?.get('settings.defaultWorkspace') === 'string'
    ? String(settings?.get('settings.defaultWorkspace'))
    : process.cwd();
  return { defaultProvider, defaultWorkspace };
}

function buildProviderResumeCommand(providerId: string, providerSessionId: string | undefined): string | undefined {
  if (!providerSessionId) return undefined;
  if (providerId === 'claude-code') return `claude --resume ${providerSessionId}`;
  if (providerId === 'codex') return `codex exec resume --json --last ${providerSessionId}`;
  return undefined;
}

function buildProviderResumeByTitleCommand(providerId: string, title: string | undefined): string | undefined {
  if (!title) return undefined;
  if (providerId === 'claude-code' && title.includes('[local-agent-wechat-bridge:')) return `claude -r ${title}`;
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
