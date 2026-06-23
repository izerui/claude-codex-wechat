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
  type CurrentSessionView,
  fetchChannelState,
  fetchCurrentSession,
  fetchRecoverableProviderSessions,
  type LastProviderSessionView,
  resolveApiUrl,
  type RecoverableProviderSessionView,
  type ProviderStatusView,
  type WeixinQuotaView,
  type WeixinRuntimeConfigView,
} from './apiClient';
import { ChannelStrip, EngineBays } from './Cockpit';
import {
  formatPluginHint,
  formatTimestamp,
  isPluginConnected,
} from './statusFormat';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';
type SessionTab = 'claude-native' | 'codex-native' | 'help';

export function WeChatPanel(input: {
  providerStatus: ProviderStatusView | null;
  currentSession: CurrentSessionView | null;
  onRefreshCurrentSession?(session: CurrentSessionView | null): void;
  onNotice?(message: string): void;
}) {
  const [activeUser, setActiveUser] = useState<ActiveWeChatUserView | null>(null);
  const [quota, setQuota] = useState<WeixinQuotaView | null>(null);
  const [plugin, setPlugin] = useState<ChannelPluginView | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<WeixinRuntimeConfigView | null>(null);
  const [settings, setSettings] = useState<BridgeSettingsView | null>(null);
  const [lastProviderSessions, setLastProviderSessions] = useState<Partial<Record<'claude-code' | 'codex', LastProviderSessionView>>>({});
  const [recoverableSessions, setRecoverableSessions] = useState<RecoverableProviderSessionView[]>([]);
  const [activeTab, setActiveTab] = useState<SessionTab>('help');
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [qrcodeData, setQrcodeData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachingSessionId, setAttachingSessionId] = useState<string | null>(null);
  const [creatingProvider, setCreatingProvider] = useState<'claude-code' | 'codex' | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const state = await fetchChannelState();
      setActiveUser(state.activeUser);
      setQuota(state.quota ?? null);
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

  const copyResumeCommand = useCallback(async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      input.onNotice?.('已复制恢复命令');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [input]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeUser) return;
    if (activeTab === 'claude-native') void scanRecoverableSessions('claude-code');
    else if (activeTab === 'codex-native') void scanRecoverableSessions('codex');
  }, [activeTab, activeUser, scanRecoverableSessions]);

  useEffect(() => {
    return subscribeBridgeEvents((payload) => {
      if (payload.type === 'channel.user-authorized') {
        setActiveUser(toActiveWeChatUserView(payload.user));
        // A fresh inbound message refreshed the iLink token → its 24h window and
        // proactive-push quota reset. Re-pull state so the strip reflects it.
        void refresh();
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

  const submitNewSession = async (providerId: 'claude-code' | 'codex', cwd: string) => {
    if (!activeUser?.platformUserId) {
      setError('no_active_wechat_user');
      return;
    }
    if (creatingProvider) return;
    setError(null);
    setCreatingProvider(providerId);
    try {
      await createNewSession({
        providerId,
        cwd: cwd.trim(),
        platformUserId: activeUser.platformUserId,
        chatId: activeUser.platformUserId,
      });
      const nextCurrentSession = await fetchCurrentSession();
      input.onRefreshCurrentSession?.(nextCurrentSession);
      await refresh();
      const providerLabel = providerId === 'codex' ? 'Codex CLI' : 'Claude Code';
      input.onNotice?.(`已新建 ${providerLabel} 会话 · ${cwd.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingProvider(null);
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

  return (
    <section>
      {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}

      <ChannelStrip
        plugin={plugin}
        activeUser={activeUser}
        quota={quota}
        gateway={runtimeConfig?.baseUrl}
        busy={busy}
        loginState={loginState}
        onLogin={startQrLogin}
        onDisconnect={() => void disconnect()}
      />

      <EngineBays
        providerStatus={input.providerStatus}
        plugin={plugin}
        currentSession={input.currentSession}
        lastProviderSessions={lastProviderSessions}
        canCreateSession={canCreateSession}
        defaultWorkspace={settings?.defaultWorkspace}
        creatingProvider={creatingProvider}
        onCreateSession={(providerId, cwd) => void submitNewSession(providerId, cwd)}
      />

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
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === 'help' ? 'active' : ''}`}
            onClick={() => setActiveTab('help')}
          >
            帮助说明
          </button>
        </li>
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
      </ul>

      <div className="soft-card mb-2">
        <div className="card-body">
          {activeTab === 'help' ? (
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
          ) : (
            <>
              {filteredRecoverableSessions.length === 0 ? <p className="mb-0">暂无可恢复会话。</p> : (
                <ul className="list-unstyled mb-0">
                  {filteredRecoverableSessions.map((session) => (
                    <li key={`${session.providerId}:${session.id}`} className="border rounded p-3 mb-2">
                      <div className="fw-semibold">{session.title ?? session.id}</div>
                      <div className="small text-muted-soft">{session.id}</div>
                      {session.providerResumeCommand ? (
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span>按 ID 恢复：{session.providerResumeCommand}</span>
                          <button
                            className="resume-copy-btn"
                            aria-label="复制恢复命令"
                            onClick={() => void copyResumeCommand(session.providerResumeCommand!)}
                            title="复制恢复命令"
                            type="button"
                          >
                            <i className="bi bi-copy" aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                      {session.cwd ? <div className="small text-muted-soft">{session.cwd}</div> : null}
                      {session.lastActivityAt ? <div className="small text-muted-soft">最后活跃 {formatTimestamp(session.lastActivityAt)}</div> : null}
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
