import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  type AuthorizedUserEventView,
  disableWeixinPlugin,
  enableWeixinPlugin,
  type BridgeWsEvent,
  fetchChannelPlugins,
  fetchWeixinRuntimeConfig,
  fetchAuthorizedUsers,
  fetchRecoverableProviderSessions,
  fetchSettings,
  attachProviderSession,
  resolveApiUrl,
  type RecoverableProviderSessionView,
  syncWeixinChannelSettings,
  updateSettings,
  type AuthorizedUserView,
  type BridgeSettingsView,
  type ChannelPluginView,
  type WeixinRuntimeConfigView,
} from './apiClient';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';
type SessionTab = 'bridge' | 'claude-native' | 'codex-native';

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

export function WeChatPanel() {
  const [users, setUsers] = useState<AuthorizedUserView[]>([]);
  const [plugin, setPlugin] = useState<ChannelPluginView | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<WeixinRuntimeConfigView | null>(null);
  const [settings, setSettings] = useState<BridgeSettingsView | null>(null);
  const [recoverableSessions, setRecoverableSessions] = useState<RecoverableProviderSessionView[]>([]);
  const [activeSessionTab, setActiveSessionTab] = useState<SessionTab>('bridge');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [qrcodeData, setQrcodeData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextUsers, nextPlugins, nextSettings] = await Promise.all([
        fetchAuthorizedUsers(),
        fetchChannelPlugins(),
        fetchSettings(),
      ]);
      const nextRuntimeConfig = await fetchWeixinRuntimeConfig().catch(() => null);
      setUsers(nextUsers);
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
    if (users.length === 0) {
      setSelectedUserId('');
      return;
    }
    if (!users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0]!.id);
    }
  }, [selectedUserId, users]);

  useEffect(() => () => {
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
        setUsers((current) => prependAuthorizedUser(current, payload.user));
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

  const changeDefaultProvider = async (provider: 'claude-code' | 'codex') => {
    if (!settings) return;
    const next = { ...settings, defaultProvider: provider };
    setSettings(next);
    try {
      await updateSettings(next);
      await syncWeixinChannelSettings();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
    const user = users.find((candidate) => candidate.id === selectedUserId);
    if (!user) {
      setError('no_authorized_user_selected');
      return;
    }
    try {
      await attachProviderSession({
        providerId: session.providerId,
        providerSessionId: session.id,
        platformUserId: user.platformUserId,
        chatId: user.platformUserId,
        cwd: session.cwd ?? user.defaultCwd,
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

      <div style={styles.sectionRow}>
        <div>
          <h3 style={styles.inlineTitle}>对话模型</h3>
          <div style={styles.panelSubtle}>选择微信新会话默认使用的本地提供方。</div>
        </div>
        <select
          value={settings?.defaultProvider ?? 'claude-code'}
          onChange={(event) => void changeDefaultProvider(event.target.value === 'codex' ? 'codex' : 'claude-code')}
          style={styles.select}
        >
          <option value="claude-code">Claude Code</option>
          <option value="codex">Codex CLI</option>
        </select>
      </div>

      <h3 style={styles.inlineTitle}>通过这个 Bot 对话的微信用户</h3>
      <div style={styles.panelSubtle}>这些用户会通过上面的 Bot 账号和桥交互。</div>
      {users.length === 0 ? <p>暂时还没有用户通过这个 Bot 发来消息。</p> : (
        <ul>
          {users.map((user) => (
            <li key={user.id} style={{ marginBottom: 12 }}>
              <strong>{user.displayName ?? user.platformUserId}</strong> · {user.defaultProvider} · {user.defaultCwd}
            </li>
          ))}
        </ul>
      )}

      <h3 style={styles.inlineTitle}>会话</h3>
      {users.length === 0 ? <p>请先让用户给上面的 Bot 发一条消息。</p> : (
        <div>
          <div style={styles.tabRow}>
            <button
              type="button"
              style={activeSessionTab === 'bridge' ? styles.activeTabButton : styles.tabButton}
              aria-pressed={activeSessionTab === 'bridge'}
              onClick={() => setActiveSessionTab('bridge')}
            >
              桥接会话
            </button>
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

          {activeSessionTab === 'bridge' ? (
            <>
              <div style={styles.panelSubtle}>桥当前正在管理的会话记录。</div>
              <p style={styles.panelSubtle}>桥接会话列表见下方“桥接会话”表。</p>
            </>
          ) : (
            <>
              <div style={styles.sectionRow}>
                <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} style={styles.select}>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName ?? user.platformUserId}
                    </option>
                  ))}
                </select>
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
            </>
          )}
        </div>
      )}
    </section>
  );
}

function prependAuthorizedUser(current: AuthorizedUserView[], user: AuthorizedUserEventView): AuthorizedUserView[] {
  if (current.some((item) => item.id === user.id)) return current;
  return [{
    id: user.id,
    platform: 'weixin',
    platformUserId: user.platformUserId,
    displayName: user.display_name,
    role: 'user',
    defaultProvider: user.defaultProvider,
    defaultCwd: user.defaultCwd,
    createdAt: user.authorizedAt,
    lastActiveAt: user.lastActive,
  }, ...current];
}

const styles: Record<string, React.CSSProperties> = {
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  panelTitle: { margin: 0, fontSize: 22 },
  panelSubtle: { color: '#6b7280', fontSize: 13, marginTop: 4 },
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
  sectionRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 20, marginBottom: 16 },
  tabRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 20, marginBottom: 16 },
  inlineTitle: { margin: '0 0 8px', fontSize: 18 },
  select: { minWidth: 180, border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', background: '#fff' },
  tabButton: { border: '1px solid #d1d5db', background: '#fff', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' },
  activeTabButton: { border: '1px solid #111827', background: '#111827', color: '#fff', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' },
};
