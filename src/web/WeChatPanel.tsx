import { useCallback, useEffect, useRef, useState } from 'react';
import {
  approvePairing,
  type AuthorizedUserEventView,
  disableWeixinPlugin,
  enableWeixinPlugin,
  type BridgeWsEvent,
  fetchChannelPlugins,
  fetchAuthorizedUsers,
  fetchPairings,
  fetchSettings,
  type PairingEventView,
  rejectPairing,
  resolveApiUrl,
  revokeAuthorizedUser,
  syncWeixinChannelSettings,
  updateSettings,
  type AuthorizedUserView,
  type BridgeSettingsView,
  type ChannelPluginView,
  type PairingView,
} from './apiClient';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';

export function WeChatPanel() {
  const [pairings, setPairings] = useState<PairingView[]>([]);
  const [users, setUsers] = useState<AuthorizedUserView[]>([]);
  const [plugin, setPlugin] = useState<ChannelPluginView | null>(null);
  const [settings, setSettings] = useState<BridgeSettingsView | null>(null);
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [qrcodeData, setQrcodeData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextPairings, nextUsers, nextPlugins, nextSettings] = await Promise.all([
        fetchPairings(),
        fetchAuthorizedUsers(),
        fetchChannelPlugins(),
        fetchSettings(),
      ]);
      setPairings(nextPairings);
      setUsers(nextUsers);
      setSettings(nextSettings);
      const weixin = nextPlugins.find((candidate) => candidate.type === 'weixin') ?? null;
      setPlugin(weixin);
      if (weixin?.enabled && weixin.hasToken) {
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
      if (payload.type === 'channel.pairing-requested') {
        setPairings((current) => prependPairing(current, payload.pairing));
        return;
      }
      if (payload.type === 'channel.user-authorized') {
        setUsers((current) => prependAuthorizedUser(current, payload.user));
        setPairings((current) => current.filter((pairing) => pairing.platformUserId !== payload.user.platformUserId));
        return;
      }
      if (payload.type === 'channel.plugin-status-changed') {
        setPlugin(payload.status);
        if (payload.status.enabled && payload.status.hasToken) setLoginState('connected');
      }
    });
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const decide = async (code: string, decision: 'approve' | 'reject') => {
    if (decision === 'approve') await approvePairing(code);
    else await rejectPairing(code);
    await refresh();
  };

  const revoke = async (userId: string) => {
    await revokeAuthorizedUser(userId);
    await refresh();
  };

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
          <h2 style={styles.panelTitle}>WeChat</h2>
          <div style={styles.panelSubtle}>Use the WeChat channel to talk to local Claude Code or Codex sessions.</div>
        </div>
        <div style={styles.headerActions}>
          <button type="button" style={styles.button} onClick={() => void refresh()}>Refresh</button>
          {plugin?.enabled && plugin.hasToken ? (
            <button type="button" style={styles.dangerButton} disabled={busy} onClick={() => void disconnect()}>
              {busy ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : null}
        </div>
      </div>
      {error && <pre style={{ color: 'crimson' }}>{error}</pre>}

      <div style={styles.statusCard}>
        <div>
          <div style={styles.statusLabel}>Account ID</div>
          <div style={styles.statusValue}>{plugin?.enabled && plugin.hasToken ? (plugin.botUsername ?? 'Connected') : 'Not connected'}</div>
        </div>
        <div style={styles.statusBadgeWrap}>
          <span style={plugin?.enabled && plugin.hasToken ? styles.connectedBadge : styles.disconnectedBadge}>
            {plugin?.enabled && plugin.hasToken ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {loginState === 'showing_qr' || loginState === 'scanned' ? (
        <div style={styles.qrCard}>
          {qrcodeData ? (
            <pre style={styles.qrValue}>
              {qrcodeData}
            </pre>
          ) : null}
          <p style={styles.panelSubtle}>{loginState === 'scanned' ? 'Scanned, waiting for confirmation...' : 'Please scan the QR code with WeChat'}</p>
        </div>
      ) : null}
      {!(plugin?.enabled && plugin.hasToken) && loginState !== 'showing_qr' && loginState !== 'scanned' ? (
        <button type="button" onClick={startQrLogin} disabled={loginState === 'loading_qr'}>
          {loginState === 'loading_qr' ? 'Loading QR...' : 'Scan to Login'}
        </button>
      ) : null}

      <div style={styles.sectionRow}>
        <div>
          <h3 style={styles.inlineTitle}>Conversation agent</h3>
          <div style={styles.panelSubtle}>Choose which local provider new WeChat conversations use by default.</div>
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

      <h3 style={styles.inlineTitle}>Pending pairings</h3>
      {pairings.length === 0 ? <p>No pending pairings.</p> : (
        <ul>
          {pairings.map((pairing) => (
            <li key={pairing.code} style={{ marginBottom: 12 }}>
              <strong>{pairing.displayName ?? pairing.platformUserId}</strong>
              <div>Chat: {pairing.chatId}</div>
              <div>Code: {pairing.code}</div>
              <button type="button" onClick={() => void decide(pairing.code, 'approve')}>Approve</button>{' '}
              <button type="button" onClick={() => void decide(pairing.code, 'reject')}>Reject</button>
            </li>
          ))}
        </ul>
      )}

      <h3 style={styles.inlineTitle}>Authorized users</h3>
      {users.length === 0 ? <p>No authorized users.</p> : (
        <ul>
          {users.map((user) => (
            <li key={user.id} style={{ marginBottom: 12 }}>
              <strong>{user.displayName ?? user.platformUserId}</strong> · {user.defaultProvider} · {user.defaultCwd}{' '}
              <button type="button" onClick={() => void revoke(user.id)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function prependPairing(current: PairingView[], pairing: PairingEventView): PairingView[] {
  if (current.some((item) => item.code === pairing.code)) return current;
  return [{
    code: pairing.code,
    platformUserId: pairing.platformUserId,
    chatId: pairing.platformUserId,
    displayName: pairing.display_name,
    requestedAt: pairing.requestedAt,
    expiresAt: pairing.expiresAt,
    status: 'pending',
  }, ...current];
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
  statusBadgeWrap: { display: 'flex', alignItems: 'center' },
  connectedBadge: { background: '#eefbf3', color: '#1f7a3d', borderRadius: 999, padding: '6px 12px', fontSize: 13 },
  disconnectedBadge: { background: '#f5f5f5', color: '#6b7280', borderRadius: 999, padding: '6px 12px', fontSize: 13 },
  qrCard: { marginBottom: 16, border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' },
  qrValue: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: 12, border: '1px solid #d5d8dc', borderRadius: 6, background: '#fbfcfc' },
  sectionRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 20, marginBottom: 16 },
  inlineTitle: { margin: '0 0 8px', fontSize: 18 },
  select: { minWidth: 180, border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', background: '#fff' },
};
