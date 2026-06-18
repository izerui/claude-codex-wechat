import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  type ActiveWeChatUserEventView,
  type ActiveWeChatUserView,
  attachProviderSession,
  disableWeixinPlugin,
  enableWeixinPlugin,
  type BridgeSettingsView,
  type BridgeWsEvent,
  type ChannelPluginView,
  type CurrentSessionView,
  fetchActiveUser,
  fetchChannelPlugins,
  fetchCurrentSession,
  fetchRecoverableProviderSessions,
  fetchSettings,
  fetchWeixinRuntimeConfig,
  resolveApiUrl,
  type RecoverableProviderSessionView,
  syncWeixinChannelSettings,
  updateSettings,
  type WeixinRuntimeConfigView,
} from './apiClient';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';
type SessionTab = 'claude-native' | 'codex-native';

function isPluginConnected(plugin: ChannelPluginView | null): boolean {
  return plugin?.enabled === true && plugin.connected === true;
}

function formatPluginBadge(plugin: ChannelPluginView | null): string {
  if (!plugin?.enabled) return '未连接';
  if (plugin.connected) return '已连接';
  if (plugin.status === 'session_timeout') return '会话超时';
  if (plugin.status === 'connecting') return '连接中';
  if (plugin.status === 'poll_error') return '轮询异常';
  return '未连接';
}

function formatPluginHint(plugin: ChannelPluginView | null): string | null {
  if (!plugin?.enabled) return null;
  if (plugin.status === 'session_timeout') return '微信 bot 会话已失效，请重新扫码登录以刷新 token。';
  if (plugin.status === 'poll_error') return '微信消息轮询异常，请检查网络或重新扫码登录。';
  if (plugin.status === 'connecting') return '微信通道正在建立轮询连接。';
  return null;
}

export function WeChatPanel(input: {
  currentSession: CurrentSessionView | null;
  onStopCurrentSession(): Promise<void>;
  onRefreshCurrentSession?(session: CurrentSessionView | null): void;
}) {
  const [activeUser, setActiveUser] = useState<ActiveWeChatUserView | null>(null);
  const [plugin, setPlugin] = useState<ChannelPluginView | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<WeixinRuntimeConfigView | null>(null);
  const [settings, setSettings] = useState<BridgeSettingsView | null>(null);
  const [recoverableSessions, setRecoverableSessions] = useState<RecoverableProviderSessionView[]>([]);
  const [activeSessionTab, setActiveSessionTab] = useState<SessionTab>('claude-native');
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [qrcodeData, setQrcodeData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachingSessionId, setAttachingSessionId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextUser, nextPlugins, nextSettings] = await Promise.all([
        fetchActiveUser(),
        fetchChannelPlugins(),
        fetchSettings(),
      ]);
      const nextRuntimeConfig = await fetchWeixinRuntimeConfig().catch(() => null);
      setActiveUser(nextUser);
      setSettings(nextSettings);
      setRuntimeConfig(nextRuntimeConfig);
      const weixin = nextPlugins.find((candidate) => candidate.type === 'weixin') ?? null;
      setPlugin(weixin);
      if (isPluginConnected(weixin)) {
        setLoginState('connected');
        setQrcodeData(null);
      } else if (loginState === 'connected') {
        setLoginState('idle');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loginState]);

  const scanRecoverableSessions = useCallback(async (providerId: 'claude-code' | 'codex') => {
    try {
      setActiveSessionTab(providerId === 'claude-code' ? 'claude-native' : 'codex-native');
      setRecoverableSessions(await fetchRecoverableProviderSessions(providerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeUser) return;
    void scanRecoverableSessions(activeSessionTab === 'codex-native' ? 'codex' : 'claude-code');
  }, [activeSessionTab, activeUser, scanRecoverableSessions]);

  useEffect(() => {
    const wsUrl = resolveApiUrl('/ws').replace(/^http/, 'ws');
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data) as BridgeWsEvent;
      if (payload.type === 'channel.user-authorized') {
        setActiveUser(toActiveWeChatUserView(payload.user));
        return;
      }
      if (payload.type === 'channel.plugin-status-changed') {
        setPlugin(payload.status);
        if (payload.status.enabled && payload.status.connected) {
          setLoginState('connected');
          setQrcodeData(null);
        } else if (payload.status.status === 'session_timeout') {
          setLoginState('idle');
          setQrcodeData(null);
        } else {
          setLoginState('idle');
        }
        if (!payload.status.enabled) {
          setRuntimeConfig(null);
          setActiveUser(null);
          input.onRefreshCurrentSession?.(null);
        }
      }
    });
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const disconnect = async () => {
    setBusy(true);
    try {
      await disableWeixinPlugin();
      setPlugin((current) => current ? { ...current, enabled: false, connected: false, hasToken: false, status: 'disabled' } : current);
      setRuntimeConfig(null);
      setActiveUser(null);
      input.onRefreshCurrentSession?.(null);
      setLoginState('idle');
      setQrcodeData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const changeDefaultProvider = (provider: 'claude-code' | 'codex') => {
    setSettings((current) => current ? { ...current, defaultProvider: provider } : current);
  };

  const attachRecoverableSession = async (session: RecoverableProviderSessionView) => {
    if (!activeUser?.platformUserId) {
      setError('no_active_wechat_user');
      return;
    }
    setError(null);
    setNotice(null);
    setAttachingSessionId(session.id);
    try {
      await attachProviderSession({
        providerId: session.providerId,
        providerSessionId: session.id,
        platformUserId: activeUser.platformUserId,
        chatId: activeUser.platformUserId,
        cwd: session.cwd,
      });
      const nextCurrentSession = await fetchCurrentSession();
      input.onRefreshCurrentSession?.(nextCurrentSession);
      await refresh();
      setNotice('已接入会话');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachingSessionId(null);
    }
  };

  const saveDefaultSettings = async () => {
    if (!settings || savingSettings) return;
    setError(null);
    setNotice(null);
    setSavingSettings(true);
    try {
      await updateSettings(settings);
      await syncWeixinChannelSettings();
      await refresh();
      setNotice('配置已同步');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSettings(false);
    }
  };

  const startQrLogin = () => {
    eventSourceRef.current?.close();
    setError(null);
    setLoginState('loading_qr');
    setQrcodeData(null);

    const es = new EventSource(resolveApiUrl('/api/channel/weixin/login'));
    eventSourceRef.current = es;

    es.addEventListener('qr', (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as { qrcodeData?: string };
      setQrcodeData(payload.qrcodeData ?? null);
      setLoginState('showing_qr');
    });

    es.addEventListener('scanned', () => {
      setLoginState('scanned');
    });

    es.addEventListener('done', (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as { accountId?: string; botToken?: string; baseUrl?: string };
      es.close();
      eventSourceRef.current = null;
      if (!payload.accountId || !payload.botToken) {
        setError('wechat_login_missing_credentials');
        setLoginState('idle');
        return;
      }
      void enableWeixinPlugin({ accountId: payload.accountId, botToken: payload.botToken, baseUrl: payload.baseUrl })
        .then(async () => {
          setLoginState('connected');
          setQrcodeData(null);
          await refresh();
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
          setLoginState('idle');
        });
    });

    es.addEventListener('error', (event: MessageEvent) => {
      es.close();
      eventSourceRef.current = null;
      const payload = event.data ? JSON.parse(event.data) as { message?: string } : {};
      setError(payload.message ?? 'wechat_login_failed');
      setLoginState('idle');
      setQrcodeData(null);
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setError('wechat_login_failed');
      setLoginState('idle');
      setQrcodeData(null);
    };
  };

  const currentUserLabel = activeUser?.displayName ?? activeUser?.platformUserId;
  const showWeixinIdentity = isPluginConnected(plugin);
  const filteredRecoverableSessions = recoverableSessions.filter((session) => (
    activeSessionTab === 'claude-native' ? session.providerId === 'claude-code' : session.providerId === 'codex'
  ));

  return (
    <section>
      {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}
      {notice ? <div className="alert alert-success" role="alert">{notice}</div> : null}

      <div className="card mb-3" style={{ border: '1px solid #d5d8dc' }}>
        <h5 className="card-header d-flex justify-content-between align-items-center mb-0" style={{ background: '#fbfcfc', borderBottom: '1px solid #d5d8dc' }}>
          <span className="d-flex align-items-center gap-2">
            微信通道
            <span className={`badge ${isPluginConnected(plugin) ? 'text-bg-success' : 'text-bg-secondary'}`} style={{ fontWeight: 400 }}>
              {formatPluginBadge(plugin)}
            </span>
          </span>
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => void refresh()} type="button">刷新</button>
            {plugin?.enabled ? (
              <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => void disconnect()} type="button">
                {busy ? '断开中...' : '断开连接'}
              </button>
            ) : null}
          </div>
        </h5>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
            <div>
              <div className="text-muted small">微信 Bot 账号</div>
              <div style={{ fontSize: 18, marginTop: 6 }}>{showWeixinIdentity ? (plugin?.botUsername ?? currentUserLabel ?? '-') : '未连接'}</div>
              {runtimeConfig?.baseUrl ? <div className="text-muted small mt-2">网关：{runtimeConfig.baseUrl}</div> : null}
              {runtimeConfig?.token ? <div className="text-muted small mt-1">Token：已配置</div> : null}
              {formatPluginHint(plugin) ? <div className="text-muted small mt-1">{formatPluginHint(plugin)}</div> : null}
              {plugin?.lastError ? <div className="text-muted small mt-1">错误：{plugin.lastError}</div> : null}
            </div>
            <span className={`badge rounded-pill ${isPluginConnected(plugin) ? 'text-bg-success' : 'text-bg-secondary'}`}>{formatPluginBadge(plugin)}</span>
          </div>
        </div>
      </div>

      {loginState === 'showing_qr' || loginState === 'scanned' ? (
        <div className="card mb-3" style={{ border: '1px solid #d5d8dc' }}>
          <div className="card-body">
            {qrcodeData ? (
              <div className="border rounded p-3 bg-white d-inline-flex justify-content-center" data-testid="weixin-login-qr">
                <QRCodeSVG
                  value={qrcodeData}
                  size={220}
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#111827"
                  title="微信登录二维码"
                />
              </div>
            ) : null}
            <p className="text-muted small mt-3 mb-0">{loginState === 'scanned' ? '已扫码，等待确认...' : '请使用微信扫描二维码'}</p>
          </div>
        </div>
      ) : null}

      {!isPluginConnected(plugin) && loginState !== 'showing_qr' && loginState !== 'scanned' ? (
        <button className="btn btn-primary mb-3" disabled={loginState === 'loading_qr'} onClick={startQrLogin} type="button">
          {loginState === 'loading_qr' ? '正在加载二维码...' : plugin?.status === 'session_timeout' ? '重新扫码登录' : '扫码登录'}
        </button>
      ) : null}

      <div className="card mb-3" style={{ border: '1px solid #d5d8dc' }}>
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label" htmlFor="default-provider">提供方</label>
              <select
                id="default-provider"
                className="form-select"
                value={settings?.defaultProvider ?? 'claude-code'}
                onChange={(event) => changeDefaultProvider(event.target.value === 'codex' ? 'codex' : 'claude-code')}
              >
                <option value="claude-code">Claude Code</option>
                <option value="codex">Codex CLI</option>
              </select>
            </div>
            <div className="col-md-5">
              <label className="form-label" htmlFor="default-workspace">工作目录</label>
              <input
                id="default-workspace"
                className="form-control"
                value={settings?.defaultWorkspace ?? ''}
                onChange={(event) => setSettings((current) => current ? { ...current, defaultWorkspace: event.target.value } : current)}
                type="text"
              />
            </div>
            <div className="col-md-3">
              <button className="btn btn-primary w-100" disabled={!settings || savingSettings} onClick={() => void saveDefaultSettings()} type="button">
                {savingSettings ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-3" style={{ border: '1px solid #d5d8dc' }}>
        <div className="card-header">当前活跃用户信息</div>
        <div className="card-body">
          {activeUser ? (
            <>
              <div>{activeUser.displayName ?? activeUser.platformUserId}</div>
              <div>{activeUser.platformUserId}</div>
            </>
          ) : (
            <div>-</div>
          )}
          {input.currentSession ? (
            <div className="mt-3">
              <div>{input.currentSession.cwd}</div>
              <div>{input.currentSession.status}</div>
              {input.currentSession.resumeTitle ? <div>{input.currentSession.resumeTitle}</div> : null}
              <button className="btn btn-outline-danger btn-sm mt-2" onClick={() => void input.onStopCurrentSession()} type="button">
                停止会话
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeSessionTab === 'claude-native' ? 'active' : ''}`}
            onClick={() => void scanRecoverableSessions('claude-code')}
          >
            Claude 原生会话
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeSessionTab === 'codex-native' ? 'active' : ''}`}
            onClick={() => void scanRecoverableSessions('codex')}
          >
            Codex 原生会话
          </button>
        </li>
      </ul>

      <div className="card" style={{ border: '1px solid #d5d8dc' }}>
        <div className="card-body">
          {filteredRecoverableSessions.length === 0 ? <p className="mb-0">暂无可恢复原生会话。</p> : (
            <ul className="list-unstyled mb-0">
              {filteredRecoverableSessions.map((session) => (
                <li key={`${session.providerId}:${session.id}`} className="border rounded p-3 mb-3">
                  <div className="fw-semibold">{session.title ?? session.id}</div>
                  <div className="small text-muted">{session.id}</div>
                  <div>原生恢复状态：{session.providerResumeTitleSynced === true ? '已同步' : session.providerResumeRepairable === true ? '待修复' : '-'}</div>
                  {session.preferredResumeCommand ? <div>推荐恢复：{session.preferredResumeCommand}</div> : null}
                  {session.providerResumeCommand ? <div>按 ID 恢复：{session.providerResumeCommand}</div> : null}
                  {session.providerResumeByTitleCommand ? <div>按标题恢复：{session.providerResumeByTitleCommand}</div> : null}
                  {session.cwd ? <div className="small text-muted">{session.cwd}</div> : null}
                  <button
                    className="btn btn-outline-primary btn-sm mt-2"
                    disabled={attachingSessionId === session.id}
                    onClick={() => void attachRecoverableSession(session)}
                    type="button"
                  >
                    {attachingSessionId === session.id ? '接入中...' : '接入会话'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function toActiveWeChatUserView(user: ActiveWeChatUserEventView): ActiveWeChatUserView {
  return {
    id: user.id,
    platform: 'weixin',
    platformUserId: user.platformUserId,
    displayName: user.display_name,
    role: 'user',
    createdAt: user.authorizedAt,
    updatedAt: user.lastActive,
  };
}
