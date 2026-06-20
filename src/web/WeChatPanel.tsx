import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { subscribeBridgeEvents } from './bridgeEventsSocket';
import { BRIDGE_COMMAND_HELP_GROUPS, BRIDGE_COMMAND_HELP_INTRO } from '../shared/bridgeCommandHelp';
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
  type LastProviderSessionView,
  resolveApiUrl,
  type RecoverableProviderSessionView,
  syncWeixinChannelSettings,
  updateSettings,
  type ProviderStatusView,
  type WeixinRuntimeConfigView,
} from './apiClient';
import { ChannelStrip, EngineBays } from './Cockpit';
import {
  ELLIPSIS,
  formatPluginHint,
  formatProviderBadgeClass,
  formatProviderLabel,
  formatSessionStatusBadgeClass,
  formatTimestamp,
  isPluginConnected,
} from './statusFormat';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';
type SessionTab = 'new' | 'defaults' | 'claude-native' | 'codex-native' | 'help';

export function WeChatPanel(input: {
  providerStatus: ProviderStatusView | null;
  currentSession: CurrentSessionView | null;
  onRefreshCurrentSession?(session: CurrentSessionView | null): void;
  onNotice?(message: string): void;
}) {
  const [activeUser, setActiveUser] = useState<ActiveWeChatUserView | null>(null);
  const [plugin, setPlugin] = useState<ChannelPluginView | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<WeixinRuntimeConfigView | null>(null);
  const [settings, setSettings] = useState<BridgeSettingsView | null>(null);
  const [lastProviderSessions, setLastProviderSessions] = useState<Partial<Record<'claude-code' | 'codex', LastProviderSessionView>>>({});
  const [recoverableSessions, setRecoverableSessions] = useState<RecoverableProviderSessionView[]>([]);
  const [activeTab, setActiveTab] = useState<SessionTab>('new');
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [qrcodeData, setQrcodeData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachingSessionId, setAttachingSessionId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newSessionProvider, setNewSessionProvider] = useState<'claude-code' | 'codex'>('claude-code');
  const [newSessionCwd, setNewSessionCwd] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const newSessionProviderTouched = useRef(false);
  const newSessionCwdTouched = useRef(false);
  const lastSessionIdRef = useRef<string | null | undefined>(undefined);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const state = await fetchChannelState();
      setActiveUser(state.activeUser);
      setSettings(state.settings);
      setRuntimeConfig(state.runtimeConfig);
      setLastProviderSessions(state.lastProviderSessions ?? {});
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
      setRecoverableSessions(await fetchRecoverableProviderSessions(providerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sessionId = input.currentSession?.id ?? null;
    // Re-sync the form to the current session only when it genuinely changes,
    // so a background refresh of the same session won't clobber the user's edits.
    if (sessionId !== lastSessionIdRef.current) {
      lastSessionIdRef.current = sessionId;
      newSessionProviderTouched.current = false;
      newSessionCwdTouched.current = false;
    }
    if (!newSessionProviderTouched.current) {
      const provider = input.currentSession?.providerId ?? settings?.defaultProvider;
      if (provider) setNewSessionProvider(provider === 'codex' ? 'codex' : 'claude-code');
    }
    if (!newSessionCwdTouched.current) {
      const cwd = input.currentSession?.cwd ?? settings?.defaultWorkspace;
      if (cwd) setNewSessionCwd(cwd);
    }
  }, [input.currentSession, settings]);

  useEffect(() => {
    if (!activeUser) return;
    if (activeTab === 'claude-native') void scanRecoverableSessions('claude-code');
    else if (activeTab === 'codex-native') void scanRecoverableSessions('codex');
  }, [activeTab, activeUser, scanRecoverableSessions]);

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
          setLastProviderSessions({});
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
      setLastProviderSessions({});
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

  const filteredRecoverableSessions = recoverableSessions.filter((session) => (
    activeTab === 'claude-native' ? session.providerId === 'claude-code' : session.providerId === 'codex'
  ));

  const canCreateSession = Boolean(activeUser && isPluginConnected(plugin));
  const effectiveTab = activeTab === 'new' && !canCreateSession ? 'defaults' : activeTab;

  return (
    <section>
      {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}

      <ChannelStrip
        plugin={plugin}
        activeUser={activeUser}
        gateway={runtimeConfig?.baseUrl}
        busy={busy}
        loginState={loginState}
        onLogin={startQrLogin}
        onDisconnect={() => void disconnect()}
      />

      <EngineBays providerStatus={input.providerStatus} plugin={plugin} currentSession={input.currentSession} />

      {formatPluginHint(plugin) ? (
        <div className="soft-card mb-2"><div className="card-body text-muted-soft small">{formatPluginHint(plugin)}</div></div>
      ) : null}
      {plugin?.lastError ? (
        <div className="soft-card mb-2"><div className="card-body text-muted-soft small">错误：{plugin.lastError}</div></div>
      ) : null}

      {loginState === 'showing_qr' || loginState === 'scanned' ? (
        <div className="soft-card mb-2"><div className="card-body p-3 text-center">
          {qrcodeData ? (
            <div className="border rounded p-3 bg-white d-inline-flex justify-content-center" data-testid="weixin-login-qr">
              <QRCodeSVG value={qrcodeData} size={220} marginSize={2} bgColor="#ffffff" fgColor="#111827" title="微信登录二维码" />
            </div>
          ) : null}
          <p className="text-muted-soft small mt-3 mb-0">{loginState === 'scanned' ? '已扫码，等待确认...' : '请使用微信扫描二维码'}</p>
        </div></div>
      ) : null}

      <ul className="nav nav-accent mb-2">
        {canCreateSession ? (
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${effectiveTab === 'new' ? 'active' : ''}`}
              onClick={() => setActiveTab('new')}
            >
              新建会话
            </button>
          </li>
        ) : null}
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'claude-native' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('claude-native');
              void scanRecoverableSessions('claude-code');
            }}
          >
            Claude 会话
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'codex-native' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('codex-native');
              void scanRecoverableSessions('codex');
            }}
          >
            Codex 会话
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${effectiveTab === 'defaults' ? 'active' : ''}`}
            onClick={() => setActiveTab('defaults')}
          >
            会话默认值
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'help' ? 'active' : ''}`}
            onClick={() => setActiveTab('help')}
          >
            帮助说明
          </button>
        </li>
      </ul>

      <div className="soft-card mb-2">
        <div className="card-body">
          {effectiveTab === 'help' ? (
            <>
              <p className="text-muted-soft small mb-3">微信端可发送以下命令；{BRIDGE_COMMAND_HELP_INTRO}</p>
              {BRIDGE_COMMAND_HELP_GROUPS.map((group) => (
                <div key={group.title} className="mb-3">
                  <div className="fw-semibold mb-1">
                    {group.title}
                    {group.note ? <span className="text-muted-soft small fw-normal">（{group.note}）</span> : null}
                  </div>
                  <ul className="list-unstyled mb-0">
                    {group.entries.map((entry) => (
                      <li key={entry.command} className="d-flex flex-column flex-md-row gap-md-2 mb-1">
                        <code className="flex-shrink-0">{entry.command}</code>
                        <span className="text-muted-soft small">{entry.desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          ) : effectiveTab === 'new' ? (
            <>
              <p className="text-muted-soft small mb-3">用指定的提供方与目录开启一个新对话，立即成为当前会话，并通知微信。</p>
              <div className="mb-3">
                <label className="form-label" htmlFor="new-session-provider">提供方</label>
                <select
                  id="new-session-provider"
                  className="form-select"
                  value={newSessionProvider}
                  onChange={(event) => {
                    newSessionProviderTouched.current = true;
                    setNewSessionProvider(event.target.value === 'codex' ? 'codex' : 'claude-code');
                  }}
                >
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">Codex CLI</option>
                </select>
              </div>
              <div className="mb-3">
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
              <button
                className="btn btn-accent"
                disabled={creatingSession || !newSessionCwd.trim()}
                onClick={() => void submitNewSession()}
                type="button"
              >
                {creatingSession ? '新建中...' : '新建会话'}
              </button>
            </>
          ) : effectiveTab === 'defaults' ? (
            <>
              <p className="text-muted-soft small mb-3">仅在未指定时生效：新用户首次对话、或无当前会话自动接入时按此默认值新建。</p>
              <div className="mb-3">
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
              <div className="mb-3">
                <label className="form-label" htmlFor="default-workspace">工作目录</label>
                <input
                  id="default-workspace"
                  className="form-control"
                  value={settings?.defaultWorkspace ?? ''}
                  onChange={(event) => setSettings((current) => current ? { ...current, defaultWorkspace: event.target.value } : current)}
                  type="text"
                />
              </div>
              <button className="btn btn-accent" disabled={!settings || savingSettings} onClick={() => void saveDefaultSettings()} type="button">
                {savingSettings ? '保存中...' : '保存'}
              </button>
            </>
          ) : (
            <>
              {(() => {
                const recent = lastProviderSessions[effectiveTab === 'codex-native' ? 'codex' : 'claude-code'];
                return recent ? (
                  <div className="weixin-info-item d-flex flex-column gap-1 mb-2">
                    <div className="text-muted-soft small">最近会话</div>
                    <div className="d-flex justify-content-between align-items-center gap-3">
                      <span style={ELLIPSIS} title={recent.providerSessionId}>{recent.providerSessionId}</span>
                      <span className="text-muted-soft small flex-shrink-0">{formatTimestamp(recent.updatedAt)}</span>
                    </div>
                    {recent.cwd ? <div className="text-muted-soft small" style={ELLIPSIS} title={recent.cwd}>{recent.cwd}</div> : null}
                  </div>
                ) : null;
              })()}
              {filteredRecoverableSessions.length === 0 ? <p className="mb-0">暂无可恢复会话。</p> : (
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
            </>
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
