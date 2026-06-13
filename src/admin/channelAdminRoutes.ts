import type { FastifyInstance } from 'fastify';
import type { WechatClawbotConfig } from '../daemon/config';
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
  wechat?: WechatClawbotConfig;
}): void {
  let wechat = input.wechat ?? readWechatSettings(input.settings);

  input.app.get('/api/channel/plugins', async () => [toWechatPluginStatus(wechat, input.users)]);

  input.app.post<{ Body: { plugin_id: string; config?: Record<string, unknown> } }>('/api/channel/plugins/enable', async (request, reply) => {
    if (request.body.plugin_id !== 'wechat-clawbot' && request.body.plugin_id !== 'weixin') {
      return reply.code(400).send({ ok: false, error: 'unknown_channel_plugin' });
    }
    const config = request.body.config ?? {};
    const credentials = typeof config.credentials === 'object' && config.credentials ? config.credentials as Record<string, unknown> : {};
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : typeof credentials.baseUrl === 'string' ? credentials.baseUrl : undefined;
    const token = typeof config.token === 'string' ? config.token : typeof credentials.bot_token === 'string' ? credentials.bot_token : undefined;
    if (!baseUrl) return reply.code(400).send({ ok: false, error: 'wechat_base_url_required' });
    wechat = { enabled: true, baseUrl, token };
    writeWechatSettings(input.settings, wechat);
    return { ok: true };
  });

  input.app.post<{ Body: { plugin_id: string } }>('/api/channel/plugins/disable', async (request, reply) => {
    if (request.body.plugin_id !== 'wechat-clawbot' && request.body.plugin_id !== 'weixin') {
      return reply.code(400).send({ ok: false, error: 'unknown_channel_plugin' });
    }
    wechat = { enabled: false };
    writeWechatSettings(input.settings, wechat);
    return { ok: true };
  });

  input.app.get('/api/channel/pairings', async () => input.pairings.listPending());

  input.app.post<{ Params: { code: string } }>('/api/channel/pairings/:code/approve', async (request, reply) => {
    const pairing = input.pairings.findByCode(request.params.code);
    if (!pairing || pairing.status !== 'pending') return reply.code(400).send({ ok: false, error: 'pairing_not_pending' });
    const result = input.pairings.approve(request.params.code);
    if (!result.ok) return reply.code(400).send(result);
    if (!input.users.findByPlatformUser('wechat-clawbot', pairing.platformUserId)) {
      input.users.createUser({
        platform: 'wechat-clawbot',
        platformUserId: pairing.platformUserId,
        displayName: pairing.displayName,
        role: 'user',
        defaultProvider: 'claude-code',
        defaultCwd: process.cwd(),
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

function toWechatPluginStatus(wechat: WechatClawbotConfig | undefined, users: UserRepository) {
  return {
    id: 'wechat-clawbot',
    type: 'weixin',
    name: 'WeChat clawbot',
    enabled: wechat?.enabled === true,
    connected: wechat?.enabled === true && Boolean(wechat.baseUrl),
    status: wechat?.enabled === true ? 'configured' : 'disabled',
    activeUsers: users.listUsers().filter((user) => user.platform === 'wechat-clawbot').length,
    hasToken: Boolean(wechat?.token),
    botUsername: undefined,
  };
}

function readWechatSettings(settings: SettingsRepository | undefined): WechatClawbotConfig | undefined {
  const raw = settings?.get('channel.wechat');
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : undefined,
    token: typeof record.token === 'string' ? record.token : undefined,
  };
}

function writeWechatSettings(settings: SettingsRepository | undefined, wechat: WechatClawbotConfig): void {
  settings?.set('channel.wechat', wechat);
}
