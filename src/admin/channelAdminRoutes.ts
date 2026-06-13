import type { FastifyInstance } from 'fastify';
import { PRIMARY_WEIXIN_PLATFORM } from '../channels/platforms';
import { WeixinDirectLoginClient } from '../channels/weixin-direct/loginClient';
import type { WeixinConfig } from '../daemon/config';
import type { BridgeEventHub } from '../daemon/events';
import type { MessageLogRepository } from '../storage/messageLogRepository';
import type { PairingRepository } from '../storage/pairingRepository';
import type { RuntimeSessionRepository } from '../storage/runtimeSessionRepository';
import type { SettingsRepository } from '../storage/settingsRepository';
import type { UserRepository } from '../storage/userRepository';
import type { SessionManager } from '../session/sessionManager';
import type { NativeProviderAdapter } from '../providers/types';

export function registerChannelAdminRoutes(input: {
  app: FastifyInstance;
  pairings: PairingRepository;
  sessions?: RuntimeSessionRepository;
  sessionManager?: SessionManager;
  providers?: NativeProviderAdapter[];
  settings?: SettingsRepository;
  messageLog?: MessageLogRepository;
  users: UserRepository;
  wechat?: WeixinConfig;
  events?: BridgeEventHub;
}): void {
  let wechat = input.wechat ?? readWechatSettings(input.settings);

  input.app.get('/api/channel/plugins', async () => [toWechatPluginStatus(wechat, input.users)]);

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
    wechat = { enabled: true, baseUrl, token, accountId };
    writeWechatSettings(input.settings, wechat);
    input.events?.emit({
      type: 'channel.plugin-status-changed',
      plugin_id: 'weixin',
      status: toWechatPluginStatus(wechat, input.users),
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
    wechat = { enabled: false };
    writeWechatSettings(input.settings, wechat);
    input.events?.emit({
      type: 'channel.plugin-status-changed',
      plugin_id: 'weixin',
      status: toWechatPluginStatus(wechat, input.users),
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

  input.app.post<{ Params: { id: string } }>('/api/channel/users/:id/revoke', async (request, reply) => {
    const result = input.users.revokeUser(request.params.id);
    if (!result.ok) return reply.code(404).send(result);
    return result;
  });

  input.app.get('/api/channel/sessions', async () => input.sessions?.list() ?? []);

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
}

function toWechatPluginStatus(wechat: WeixinConfig | undefined, users: UserRepository) {
  return {
    id: PRIMARY_WEIXIN_PLATFORM,
    type: 'weixin' as const,
    name: 'WeChat channel' as const,
    enabled: wechat?.enabled === true,
    connected: wechat?.enabled === true && Boolean(wechat.baseUrl),
    status: wechat?.enabled === true ? 'configured' : 'disabled',
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
