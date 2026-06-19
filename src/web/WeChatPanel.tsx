import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { subscribeBridgeEvents } from './bridgeEventsSocket';
import {
  type ActiveWeChatUserEventView,
  type ActiveWeChatUserView,
  attachProviderSession,
  createNewSession,
  disableWeixinPlugin,
  enableWeixinPlugin,
  type BridgeSettingsView,
  type ChannelPluginView,
  type ChannelStateView,
  type CurrentSessionView,
  fetchChannelState,
  fetchCurrentSession,
  fetchRecoverableProviderSessions,
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

function formatPluginBadgeClass(plugin: ChannelPluginView | null): string {
  if (isPluginConnected(plugin)) return 'badge-solid-success';
  if (plugin?.status === 'session_timeout' || plugin?.status === 'poll_error') return 'badge-solid-error';
  if (plugin?.status === 'connecting') return 'badge-soft-accent';
  return 'badge-soft-neutral';
}

function formatSessionStatusBadgeClass(status: string): string {
  if (status === 'running' || status === 'active') return 'badge-solid-success';
  if (status === 'error' || status === 'failed') return 'badge-solid-error';
  return 'badge-soft-neutral';
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
  onRefreshCurrentSession?(session: CurrentSessionView | null): void;
  onNotice?(message: string): void;
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
  const [busy, setBusy] = useState(false);
  const [attachingSessionId, setAttachingSessionId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newSessionProvider, setNewSessionProvider] = useState<'claude-code' | 'codex'>('claude-code');
  const [newSessionCwd, setNewSessionCwd] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionConfigTab, setSessionConfigTab] = useState<'new' | 'defaults'>('new');
  const newSessionCwdTouched = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const state = await fetchChannelState();
      setActiveUser(state.activeUser);
      setSettings(state.settings);
      setRuntimeConfig(state.runtimeConfig);
      setPlugin(state.plugin);
      if (isPluginConnected(state.plugin)) {
        setLoginState('connected');
        setQrcodeData(null);
      } else {
        setLoginState((current) => (current === 'connected' ? 'idle' : current));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

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
    if (settings?.defaultWorkspace && !newSessionCwdTouched.current) {
      setNewSessionCwd(settings.defaultWorkspace);
    }
  }, [settings]);

  useEffect(() => {
    if (!activeUser) return;
    void scanRecoverableSessions(activeSessionTab === 'codex-native' ? 'codex' : 'claude-code');
  }, [activeSessionTab, activeUser, scanRecoverableSessions]);

  useEffect(() => {
    return subscribeBridgeEvents((payload) => {
      if (payload.type === 'channel.user-authorized') {
        setActiveUser(toActiveWeChatUserView(payload.user));
        return;
      }
      if (payload.type === 'channel.current-session-changed') {
        void fetchCurrentSession()
          .then((session) => input.onRefreshCurrentSession?.(session))
          .catch(() => undefined);
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
        }
        if (!payload.status.connected) {
          input.onRefreshCurrentSession?.(null);
        }
      }
    });
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
      input.onNotice?.('已接入会话');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttachingSessionId(null);
    }
  };

  const saveDefaultSettings = async () => {
    if (!settings || savingSettings) return;
    setError(null);
    setSavingSettings(true);
    try {
      await updateSettings(settings);
      await syncWeixinChannelSettings();
      await refresh();
      input.onNotice?.('配置已同步');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSettings(false);
    }
  };

  const submitNewSession = async () => {
    if (!activeUser?.platformUserId) {
      setError('no_active_wechat_user');
      return;
    }
    if (creatingSession) return;
    setError(null);
    setCreatingSession(true);
    try {
      await createNewSession({
        providerId: newSessionProvider,
        cwd: newSessionCwd.trim(),
        platformUserId: activeUser.platformUserId,
        chatId: activeUser.platformUserId,
      });
      const nextCurrentSession = await fetchCurrentSession();
      input.onRefreshCurrentSession?.(nextCurrentSession);
      await refresh();
      input.onNotice?.('已新建会话');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSession(false);
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

      <div className="soft-card mb-2">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span className="d-flex align-items-center gap-2">
            微信通道
          </span>
          <div className="d-flex align-items-center gap-2">
            {plugin?.enabled ? (
              <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => void disconnect()} type="button">
                {busy ? '断开中...' : '断开连接'}
              </button>
            ) : null}
          </div>
        </div>
        <div className="card-body">
          <div className="row g-2">
            {showWeixinIdentity ? (
              <div className="col-md-6">
                <div className="weixin-info-item d-flex justify-content-between align-items-center gap-3">
                  <span className="text-muted-soft small">微信 Bot 账号</span>
                  <span className="d-flex align-items-center gap-2">
                    <span>{plugin?.botUsername ?? currentUserLabel ?? '-'}</span>
                    <span className={`badge ${formatPluginBadgeClass(plugin)}`}>{formatPluginBadge(plugin)}</span>
                  </span>
                </div>
              </div>
            ) : null}
            {runtimeConfig?.token ? (
              <div className="col-md-6">
                <div className="weixin-info-item d-flex justify-content-between align-items-center gap-3">
                  <span className="text-muted-soft small">Token</span>
                  <span className="badge badge-solid-success">已配置</span>
                </div>
              </div>
            ) : null}
            {runtimeConfig?.baseUrl ? (
              <div className="col-md-6">
                <div className="weixin-info-item d-flex justify-content-between align-items-center gap-3">
                  <span className="text-muted-soft small">网关</span>
                  <span>{runtimeConfig.baseUrl}</span>
                </div>
              </div>
            ) : null}
            {activeUser ? (
              <div className="col-md-6">
                <div className="weixin-info-item d-flex justify-content-between align-items-center gap-3">
                  <span className="text-muted-soft small">当前活跃用户</span>
                  <span>{activeUser.displayName ?? activeUser.platformUserId}</span>
                </div>
              </div>
            ) : null}
            {input.currentSession && isPluginConnected(plugin) ? (
              <>
                <div className="col-md-6">
                  <div className="weixin-info-item d-flex justify-content-between align-items-center gap-3">
                    <span className="text-muted-soft small">工作目录</span>
                    <span>{input.currentSession.cwd}</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="weixin-info-item d-flex justify-content-between align-items-center gap-3">
                    <span className="text-muted-soft small">会话状态</span>
                    <span className={`badge ${formatSessionStatusBadgeClass(input.currentSession.status)}`}>{input.currentSession.status}</span>
                  </div>
                </div>
                {(input.currentSession.nativeTitle ?? input.currentSession.resumeTitle) ? (
                  <div className="col-md-6">
                    <div className="weixin-info-item d-flex justify-content-between align-items-center gap-3">
                      <span className="text-muted-soft small">会话标题</span>
                      <span>{input.currentSession.nativeTitle ?? input.currentSession.resumeTitle}</span>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            {formatPluginHint(plugin) ? (
              <div className="col-12">
                <div className="weixin-info-item text-muted-soft small">{formatPluginHint(plugin)}</div>
              </div>
            ) : null}
            {plugin?.lastError ? (
              <div className="col-12">
                <div className="weixin-info-item text-muted-soft small">错误：{plugin.lastError}</div>
              </div>
            ) : null}
          </div>

          {loginState === 'showing_qr' || loginState === 'scanned' ? (
            <div className="p-3 text-center">
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
              <p className="text-muted-soft small mt-3 mb-0">{loginState === 'scanned' ? '已扫码，等待确认...' : '请使用微信扫描二维码'}</p>
            </div>
          ) : null}

          {!isPluginConnected(plugin) && loginState !== 'showing_qr' && loginState !== 'scanned' ? (
            <div className="p-3 text-center">
              <button className="btn btn-accent" disabled={loginState === 'loading_qr'} onClick={startQrLogin} type="button">
                {loginState === 'loading_qr' ? '正在加载二维码...' : plugin?.status === 'session_timeout' ? '重新扫码登录' : '扫码登录'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <ul className="nav nav-accent mb-2">
        {activeUser && isPluginConnected(plugin) ? (
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${sessionConfigTab === 'new' ? 'active' : ''}`}
              onClick={() => setSessionConfigTab('new')}
            >
              新建会话
            </button>
          </li>
        ) : null}
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${sessionConfigTab === 'defaults' || !(activeUser && isPluginConnected(plugin)) ? 'active' : ''}`}
            onClick={() => setSessionConfigTab('defaults')}
          >
            会话默认值
          </button>
        </li>
      </ul>

      <div className="soft-card mb-2">
        <div className="card-header">{sessionConfigTab === 'new' && activeUser && isPluginConnected(plugin) ? '新建会话' : '会话默认值'}</div>
        <div className="card-body">
          {sessionConfigTab === 'new' && activeUser && isPluginConnected(plugin) ? (
            <>
              <p className="text-muted-soft small mb-3">用指定的提供方与目录开启一个新对话，立即成为当前会话，并通知微信。</p>
              <div className="row g-3 align-items-end">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="new-session-provider">提供方</label>
                  <select
                    id="new-session-provider"
                    className="form-select"
                    value={newSessionProvider}
                    onChange={(event) => setNewSessionProvider(event.target.value === 'codex' ? 'codex' : 'claude-code')}
                  >
                    <option value="claude-code">Claude Code</option>
                    <option value="codex">Codex CLI</option>
                  </select>
                </div>
                <div className="col-md-5">
                  <label className="form-label" htmlFor="new-session-cwd">工作目录</label>
                  <input
                    id="new-session-cwd"
                    className="form-control"
                    value={newSessionCwd}
                    onChange={(event) => {
                      newSessionCwdTouched.current = true;
                      setNewSessionCwd(event.target.value);
                    }}
                    type="text"
                  />
                </div>
                <div className="col-md-3">
                  <button
                    className="btn btn-accent w-100"
                    disabled={creatingSession || !newSessionCwd.trim()}
                    onClick={() => void submitNewSession()}
                    type="button"
                  >
                    {creatingSession ? '新建中...' : '新建会话'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-soft small mb-3">仅在未指定时生效：新用户首次对话、或无当前会话自动接入时按此默认值新建。</p>
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
                  <button className="btn btn-accent w-100" disabled={!settings || savingSettings} onClick={() => void saveDefaultSettings()} type="button">
                    {savingSettings ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ul className="nav nav-accent mb-2">
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

      <div className="soft-card">
        <div className="card-header">可恢复原生会话</div>
        <div className="card-body">
          {filteredRecoverableSessions.length === 0 ? <p className="mb-0">暂无可恢复原生会话。</p> : (
            <ul className="list-unstyled mb-0">
              {filteredRecoverableSessions.map((session) => (
                <li key={`${session.providerId}:${session.id}`} className="border rounded p-3 mb-2">
                  <div className="fw-semibold">{session.title ?? session.id}</div>
                  <div className="small text-muted-soft">{session.id}</div>
                  <div>原生恢复状态：{session.providerResumeTitleSynced === true ? '已同步' : session.providerResumeRepairable === true ? '待修复' : '-'}</div>
                  {session.preferredResumeCommand ? <div>推荐恢复：{session.preferredResumeCommand}</div> : null}
                  {session.providerResumeCommand ? <div>按 ID 恢复：{session.providerResumeCommand}</div> : null}
                  {session.providerResumeByTitleCommand ? <div>按标题恢复：{session.providerResumeByTitleCommand}</div> : null}
                  {session.cwd ? <div className="small text-muted-soft">{session.cwd}</div> : null}
                  <button
                    className="btn btn-accent btn-sm mt-2"
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
