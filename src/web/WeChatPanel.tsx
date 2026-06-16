import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  type ActiveWeChatUserEventView,
  disableWeixinPlugin,
  enableWeixinPlugin,
  type BridgeWsEvent,
  type CurrentSessionView,
  fetchChannelPlugins,
  fetchWeixinRuntimeConfig,
  fetchActiveUser,
  fetchRecoverableProviderSessions,
  fetchSettings,
  attachProviderSession,
  resolveApiUrl,
  type RecoverableProviderSessionView,
  syncWeixinChannelSettings,
  updateSettings,
  type ActiveWeChatUserView,
  type BridgeSettingsView,
  type ChannelPluginView,
  type WeixinRuntimeConfigView,
} from './apiClient';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';
type SessionTab = 'claude-native' | 'codex-native';

function formatRecoverableResumeState(session: RecoverableProviderSessionView): string {
  if (session.providerId !== 'claude-code') return '-';
  if (session.providerResumeTitleSynced === true) return '已同步';
  if (session.providerResumeRepairable === true) return '待修复';
  if (session.resumeTitle) return '不可修复';
  return '-';
}

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

export function WeChatPanel(input: { currentSession: CurrentSessionView | null; onStopCurrentSession(): Promise<void> }) {
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeUser) return;
    void scanRecoverableSessions(activeSessionTab === 'codex-native' ? 'codex' : 'claude-code');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUser, activeSessionTab]);

  useEffect(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

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
        if (payload.status.enabled && payload.status.connected) setLoginState('connected');
        else setLoginState('idle');
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

  const scanRecoverableSessions = async (providerId: 'claude-code' | 'codex') => {
    try {
      setActiveSessionTab(providerId === 'claude-code' ? 'claude-native' : 'codex-native');
      setRecoverableSessions(await fetchRecoverableProviderSessions(providerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const attachRecoverableSession = async (session: RecoverableProviderSessionView) => {
    if (!activeUser) {
      setError('no_active_wechat_user');
      return;
    }
    try {
      await attachProviderSession({
        providerId: session.providerId,
        providerSessionId: session.id,
        platformUserId: activeUser.platformUserId,
        chatId: activeUser.platformUserId,
        cwd: session.cwd,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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

  return (
    <section style={{ marginTop: 24 }}>
      <div style={styles.panelHeader}>
        <div>
          <h2 style={styles.panelTitle}>微信</h2>
          <div style={styles.panelSubtle}>使用微信通道与本地 Claude Code 或 Codex 会话对话。</div>
        </div>
        <div style={styles.headerActions}>
          <button type="button" style={styles.button} onClick={() => void refresh()}>刷新</button>
          {plugin?.enabled ? (
            <button type="button" style={styles.dangerButton} disabled={busy} onClick={() => void disconnect()}>
              {busy ? '断开中...' : '断开连接'}
            </button>
          ) : null}
        </div>
      </div>
      {error && <pre style={{ color: 'crimson' }}>{error}</pre>}

      <div style={styles.statusCard}>
        <div>
          <div style={styles.statusLabel}>微信 Bot 账号</div>
          <div style={styles.statusValue}>{plugin?.enabled ? (plugin.botUsername ?? formatPluginBadge(plugin)) : '未连接'}</div>
          {runtimeConfig?.baseUrl ? <div style={styles.statusMeta}>网关：{runtimeConfig.baseUrl}</div> : null}
          {runtimeConfig?.token ? <div style={styles.statusMeta}>Token：已配置</div> : null}
          {formatPluginHint(plugin) ? <div style={styles.statusMeta}>{formatPluginHint(plugin)}</div> : null}
          {plugin?.lastError ? <div style={styles.statusMeta}>错误：{plugin.lastError}</div> : null}
        </div>
        <div style={styles.statusBadgeWrap}>
          <span style={isPluginConnected(plugin) ? styles.connectedBadge : styles.disconnectedBadge}>
            {formatPluginBadge(plugin)}
          </span>
        </div>
      </div>

      {loginState === 'showing_qr' || loginState === 'scanned' ? (
        <div style={styles.qrCard}>
          {qrcodeData ? (
            <div data-testid="weixin-login-qr" style={styles.qrValue}>
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
          <p style={styles.panelSubtle}>{loginState === 'scanned' ? '已扫码，等待确认...' : '请使用微信扫描二维码'}</p>
        </div>
      ) : null}
      {!isPluginConnected(plugin) && loginState !== 'showing_qr' && loginState !== 'scanned' ? (
        <button type="button" onClick={startQrLogin} disabled={loginState === 'loading_qr'}>
          {loginState === 'loading_qr' ? '正在加载二维码...' : plugin?.status === 'session_timeout' ? '重新扫码登录' : '扫码登录'}
        </button>
      ) : null}

      {settings ? (
        <section style={styles.settingsSection}>
          <div style={styles.sectionRow}>
            <div>
              <h3 style={styles.inlineTitle}>会话配置</h3>
              <div style={styles.panelSubtle}>保存后，下一条微信消息将按这里的提供方和工作目录重新建立会话。</div>
            </div>
          </div>
          <div style={styles.formGrid}>
            <label style={styles.field}>
              <span>提供方</span>
              <select
                value={settings.defaultProvider}
                onChange={(event) => void changeDefaultProvider(event.target.value === 'codex' ? 'codex' : 'claude-code')}
                style={styles.select}
              >
                <option value="claude-code">Claude Code</option>
                <option value="codex">Codex CLI</option>
              </select>
            </label>
            <label style={styles.field}>
              <span>工作目录</span>
              <input
                value={settings.defaultWorkspace}
                onChange={(event) => setSettings((current) => current ? { ...current, defaultWorkspace: event.target.value } : current)}
                style={styles.input}
              />
            </label>
          </div>
          <button
            type="button"
            style={styles.button}
            onClick={() => void (settings ? updateSettings(settings).then(async () => {
              await syncWeixinChannelSettings();
              await refresh();
            }) : Promise.resolve())}
          >
            保存配置
          </button>
        </section>
      ) : null}

      <h3 style={styles.inlineTitle}>当前活跃用户信息</h3>
      <div style={styles.panelSubtle}>展示当前唯一活跃微信用户及其当前有效会话。</div>
      {!activeUser && !input.currentSession ? <p>当前还没有活跃微信用户。</p> : (
        <div style={styles.activeUserCard}>
          <strong>{activeUser?.displayName ?? activeUser?.platformUserId ?? input.currentSession?.chatId}</strong>
          <div style={styles.statusMeta}>平台 ID：{activeUser?.platformUserId ?? input.currentSession?.chatId}</div>
          <div style={styles.statusMeta}>角色：{activeUser?.role ?? 'user'}</div>
          {input.currentSession ? (
            <div style={styles.conversationBlock}>
              <div style={styles.conversationTitle}>当前会话</div>
              <div style={styles.statusMeta}>提供方：{input.currentSession.providerId}</div>
              <div style={styles.statusMeta}>工作目录：{input.currentSession.cwd}</div>
              <div style={styles.statusMeta}>状态：{input.currentSession.status}</div>
              {input.currentSession.resumeTitle ? <div style={styles.statusMeta}>原生标题：{input.currentSession.resumeTitle}</div> : null}
              {input.currentSession.status !== 'closed' ? (
                <div style={{ marginTop: 10 }}>
                  <button type="button" style={styles.button} onClick={() => void input.onStopCurrentSession()}>停止</button>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={styles.statusMeta}>当前没有有效会话。</div>
          )}
        </div>
      )}

      {!activeUser && !input.currentSession ? <p>请先让当前微信用户给上面的 Bot 发一条消息。</p> : (
        <div>
          <div style={styles.tabRow}>
            <button
              type="button"
              style={activeSessionTab === 'claude-native' ? styles.activeTabButton : styles.tabButton}
              aria-pressed={activeSessionTab === 'claude-native'}
              onClick={() => void scanRecoverableSessions('claude-code')}
            >
              Claude 原生会话
            </button>
            <button
              type="button"
              style={activeSessionTab === 'codex-native' ? styles.activeTabButton : styles.tabButton}
              aria-pressed={activeSessionTab === 'codex-native'}
              onClick={() => void scanRecoverableSessions('codex')}
            >
              Codex 原生会话
            </button>
          </div>

          <div style={styles.sectionRow}>
            <div style={styles.panelSubtle}>
              当前用户：{activeUser?.displayName ?? activeUser?.platformUserId ?? input.currentSession?.chatId}
            </div>
            <div style={styles.panelSubtle}>
              {activeSessionTab === 'claude-native' ? '本机可接入的 Claude 原生会话。' : '本机可接入的 Codex 原生会话。'}
            </div>
          </div>
          {recoverableSessions.filter((session) => (
            activeSessionTab === 'claude-native' ? session.providerId === 'claude-code' : session.providerId === 'codex'
          )).length === 0 ? <p>暂无可恢复原生会话。</p> : (
            <ul>
              {recoverableSessions.filter((session) => (
                activeSessionTab === 'claude-native' ? session.providerId === 'claude-code' : session.providerId === 'codex'
              )).map((session) => (
                <li key={`${session.providerId}:${session.id}`} style={{ marginBottom: 12 }}>
                  <strong>{session.providerId}</strong> · {session.title ?? session.id}
                  <div>原生会话 ID：{session.id}</div>
                  {session.resumeTitle ? <div>原生标题：{session.resumeTitle}</div> : null}
                  <div>原生恢复状态：{formatRecoverableResumeState(session)}</div>
                  {session.preferredResumeCommand ? <div>推荐恢复：{session.preferredResumeCommand}</div> : null}
                  {session.providerResumeCommand ? <div>按 ID 恢复：{session.providerResumeCommand}</div> : null}
                  {session.providerResumeByTitleCommand ? <div>按标题恢复：{session.providerResumeByTitleCommand}</div> : null}
                  {session.cwd ? <div>工作目录：{session.cwd}</div> : null}
                  <button type="button" onClick={() => void attachRecoverableSession(session)}>接入会话</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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

const styles: Record<string, React.CSSProperties> = {
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  panelTitle: { margin: 0, fontSize: 22 },
  panelSubtle: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  activeUserCard: { padding: 12, border: '1px solid #d1d5db', borderRadius: 8, marginBottom: 16 },
  conversationBlock: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' },
  conversationTitle: { fontSize: 15, fontWeight: 600, marginBottom: 6 },
  headerActions: { display: 'flex', gap: 8, alignItems: 'center' },
  button: { border: '1px solid #aeb6bf', background: '#fff', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  dangerButton: { border: '1px solid #f0b4ad', color: '#d94841', background: '#fff1f0', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  statusCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fafafa', marginBottom: 16 },
  statusLabel: { fontSize: 13, color: '#6b7280' },
  statusValue: { fontSize: 18, marginTop: 6 },
  statusMeta: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  statusBadgeWrap: { display: 'flex', alignItems: 'center' },
  connectedBadge: { background: '#eefbf3', color: '#1f7a3d', borderRadius: 999, padding: '6px 12px', fontSize: 13 },
  disconnectedBadge: { background: '#f5f5f5', color: '#6b7280', borderRadius: 999, padding: '6px 12px', fontSize: 13 },
  qrCard: { marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' },
  qrValue: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 12, border: '1px solid #d5d8dc', borderRadius: 6, background: '#fbfcfc' },
  settingsSection: { marginTop: 20, marginBottom: 16 },
  sectionRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 20, marginBottom: 16 },
  tabRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 20, marginBottom: 16 },
  inlineTitle: { margin: '0 0 8px', fontSize: 18 },
  select: { minWidth: 180, border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', background: '#fff' },
  input: { minWidth: 180, border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', background: '#fff' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 },
  field: { display: 'grid', gap: 6, fontSize: 13 },
  tabButton: { border: '1px solid #d1d5db', background: '#fff', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' },
  activeTabButton: { border: '1px solid #111827', background: '#111827', color: '#fff', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' },
};
