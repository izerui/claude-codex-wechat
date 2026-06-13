import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  archiveSession,
  decidePermission,
  fetchProviderStatus,
  fetchSessionMessages,
  fetchSessions,
  fetchSettings,
  fetchStatus,
  stopSession,
  updateSettings,
  type BridgeSessionView,
  type BridgeSettingsView,
  type MessageLogView,
  type PermissionRequestView,
  type ProviderStatusView,
  type StatusView,
} from './apiClient';
import { WeChatPanel } from './WeChatPanel';

const adminUserId = 'admin-ui';

export function App() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusView | null>(null);
  const [sessions, setSessions] = useState<BridgeSessionView[]>([]);
  const [settings, setSettings] = useState<BridgeSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextProviderStatus, nextSessions, nextSettings] = await Promise.all([
        fetchStatus(),
        fetchProviderStatus(),
        fetchSessions(),
        fetchSettings(),
      ]);
      setStatus(nextStatus);
      setProviderStatus(nextProviderStatus);
      setSessions(nextSessions);
      setSettings(nextSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const permissions = status?.permissions ?? [];
  const activeSessions = useMemo(() => sessions.filter((session) => !session.archivedAt), [sessions]);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Local Agent WeChat Bridge</h1>
          <p style={styles.subtitle}>Native Claude Code / Codex sessions controlled from WeChat.</p>
        </div>
        <button type="button" style={styles.button} onClick={() => void refresh()}>Refresh</button>
      </header>

      {error && <pre style={styles.error}>{error}</pre>}

      <Dashboard status={status} providerStatus={providerStatus} activeSessionCount={activeSessions.length} />
      <WeChatPanel />
      <SessionsPanel sessions={sessions} onRefresh={refresh} />
      <PermissionsPanel permissions={permissions} onDecision={refresh} />
      {settings && <SettingsPanel settings={settings} onSave={async (next) => {
        await updateSettings(next);
        await refresh();
      }} />}
    </main>
  );
}

function Dashboard(input: {
  status: StatusView | null;
  providerStatus: ProviderStatusView | null;
  activeSessionCount: number;
}) {
  const claudeStatus = formatProviderStatus(input.providerStatus?.claude);
  const codexStatus = formatProviderStatus(input.providerStatus?.codex);
  const claudeCommand = readProviderCommand(input.providerStatus?.claude);
  const codexCommand = readProviderCommand(input.providerStatus?.codex);

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Dashboard</h2>
      <div style={styles.metricGrid}>
        <Metric label="Daemon" value={input.status?.ok ? 'online' : 'unknown'} />
        <Metric label="Active sessions" value={String(input.activeSessionCount)} />
        <Metric label="Pending permissions" value={String(input.status?.permissions.length ?? 0)} />
        <Metric label="Claude" value={claudeStatus} detail={claudeCommand ?? undefined} />
        <Metric label="Codex" value={codexStatus} detail={codexCommand ?? undefined} />
      </div>
    </section>
  );
}

function readProviderCommand(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.command === 'string' && record.command ? record.command : null;
}

function formatProviderStatus(value: unknown): string {
  if (!value || typeof value !== 'object') return 'unknown';
  const record = value as Record<string, unknown>;
  if (record.detected === true) {
    return typeof record.version === 'string' && record.version ? `detected · ${record.version}` : 'detected';
  }
  if (typeof record.reason === 'string' && record.reason) return record.reason;
  return 'unknown';
}

function Metric(input: { label: string; value: string; detail?: string }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricLabel}>{input.label}</div>
      <div style={styles.metricValue}>{input.value}</div>
      {input.detail ? <div style={styles.muted}>{input.detail}</div> : null}
    </div>
  );
}

function SessionsPanel(input: {
  sessions: BridgeSessionView[];
  onRefresh: () => Promise<void>;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<MessageLogView[]>([]);

  const runAction = async (action: 'stop' | 'archive', sessionId: string) => {
    if (action === 'stop') await stopSession(sessionId);
    else await archiveSession(sessionId);
    await input.onRefresh();
  };

  const showLogs = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setLogs(await fetchSessionMessages(sessionId));
  };

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Sessions</h2>
      {input.sessions.length === 0 ? <p style={styles.empty}>No bridge sessions yet.</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Chat</th>
                <th style={styles.th}>Bridge session</th>
                <th style={styles.th}>Provider</th>
                <th style={styles.th}>Provider session</th>
                <th style={styles.th}>CWD</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {input.sessions.map((session) => (
                <tr key={session.id}>
                  <td style={styles.td}>{session.chatId}</td>
                  <td style={styles.td}>{session.id}</td>
                  <td style={styles.td}>{session.providerId}</td>
                  <td style={styles.td}>{session.providerSessionId ?? '-'}</td>
                  <td style={styles.td}>{session.cwd}</td>
                  <td style={styles.td}>{session.status}</td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button type="button" style={styles.button} onClick={() => void showLogs(session.id)}>Logs</button>
                      {!session.archivedAt && session.status !== 'closed' && (
                        <button type="button" style={styles.button} onClick={() => void runAction('stop', session.id)}>Stop</button>
                      )}
                      {!session.archivedAt && (
                        <button type="button" style={styles.dangerButton} onClick={() => void runAction('archive', session.id)}>Archive</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedSessionId ? (
        <div style={{ marginTop: 16 }}>
          <h3 style={styles.sectionTitle}>Message log · {selectedSessionId}</h3>
          {logs.length === 0 ? <p style={styles.empty}>No messages recorded.</p> : (
            <ul style={styles.list}>
              {logs.map((log) => (
                <li key={log.id} style={styles.listItem}>
                  <div>
                    <strong>{log.direction}</strong>
                    {log.providerEventType ? ` · ${log.providerEventType}` : ''}
                  </div>
                  <div style={styles.muted}>{log.text ?? ''}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PermissionsPanel(input: {
  permissions: PermissionRequestView[];
  onDecision: () => Promise<void>;
}) {
  const decide = async (requestId: string, decision: 'approve' | 'deny' | 'abort') => {
    await decidePermission({ requestId, userId: adminUserId, decision });
    await input.onDecision();
  };

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Permissions</h2>
      {input.permissions.length === 0 ? <p style={styles.empty}>No pending permission requests.</p> : (
        <ul style={styles.list}>
          {input.permissions.map((request) => (
            <li key={request.id} style={styles.listItem}>
              <div>
                <strong>{request.toolName}</strong> · {request.providerId}
                <div style={styles.muted}>{request.summary}</div>
                <div style={styles.muted}>Session: {request.bridgeSessionId}</div>
              </div>
              <div style={styles.actions}>
                <button type="button" style={styles.button} onClick={() => void decide(request.id, 'approve')}>Approve</button>
                <button type="button" style={styles.button} onClick={() => void decide(request.id, 'deny')}>Deny</button>
                <button type="button" style={styles.dangerButton} onClick={() => void decide(request.id, 'abort')}>Abort</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsPanel(input: {
  settings: BridgeSettingsView;
  onSave(settings: BridgeSettingsView): Promise<void>;
}) {
  const [draft, setDraft] = useState(input.settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(input.settings);
  }, [input.settings]);

  const save = async () => {
    setSaving(true);
    try {
      await input.onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Settings</h2>
      <div style={styles.formGrid}>
        <label style={styles.field}>
          <span>Default provider</span>
          <select
            value={draft.defaultProvider}
            onChange={(event) => setDraft({ ...draft, defaultProvider: event.target.value === 'codex' ? 'codex' : 'claude-code' })}
          >
            <option value="claude-code">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <label style={styles.field}>
          <span>Default workspace</span>
          <input value={draft.defaultWorkspace} onChange={(event) => setDraft({ ...draft, defaultWorkspace: event.target.value })} />
        </label>
        <label style={styles.field}>
          <span>Permission timeout</span>
          <select
            value={String(draft.permissionTimeoutMs)}
            onChange={(event) => setDraft({
              ...draft,
              permissionTimeoutMs: event.target.value === 'never' ? 'never' : Number(event.target.value),
            })}
          >
            <option value="30000">30s</option>
            <option value="60000">60s</option>
            <option value="300000">5min</option>
            <option value="never">Never</option>
          </select>
        </label>
        <label style={styles.field}>
          <span>WeChat throttle ms</span>
          <input
            type="number"
            value={draft.wechatThrottle.minIntervalMs}
            onChange={(event) => setDraft({
              ...draft,
              wechatThrottle: { ...draft.wechatThrottle, minIntervalMs: Number(event.target.value) },
            })}
          />
        </label>
        <label style={styles.field}>
          <span>Chunk size</span>
          <input
            type="number"
            value={draft.wechatThrottle.chunkSize}
            onChange={(event) => setDraft({
              ...draft,
              wechatThrottle: { ...draft.wechatThrottle, chunkSize: Number(event.target.value) },
            })}
          />
        </label>
        <label style={styles.field}>
          <span>High-risk command policy</span>
          <select
            value={draft.highRiskCommandPolicy}
            onChange={(event) => setDraft({
              ...draft,
              highRiskCommandPolicy: event.target.value === 'deny' || event.target.value === 'allow' ? event.target.value : 'per_request',
            })}
          >
            <option value="per_request">Per request</option>
            <option value="deny">Deny</option>
            <option value="allow">Allow</option>
          </select>
        </label>
      </div>
      <button type="button" style={styles.button} disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving...' : 'Save settings'}
      </button>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24, color: '#17202a' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 },
  title: { margin: 0, fontSize: 28 },
  subtitle: { margin: '6px 0 0', color: '#5d6d7e' },
  section: { borderTop: '1px solid #d5d8dc', paddingTop: 18, marginTop: 24 },
  sectionTitle: { margin: '0 0 12px', fontSize: 18 },
  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  metric: { border: '1px solid #d5d8dc', borderRadius: 6, padding: 12, background: '#fbfcfc' },
  metricLabel: { color: '#5d6d7e', fontSize: 12 },
  metricValue: { fontSize: 20, marginTop: 4 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', borderBottom: '1px solid #d5d8dc', padding: 8, whiteSpace: 'nowrap' },
  td: { borderBottom: '1px solid #eef2f3', padding: 8, verticalAlign: 'top' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 },
  listItem: { border: '1px solid #d5d8dc', borderRadius: 6, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12 },
  muted: { color: '#5d6d7e', fontSize: 13, marginTop: 4 },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: { border: '1px solid #aeb6bf', background: '#fff', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  dangerButton: { border: '1px solid #c0392b', color: '#922b21', background: '#fff', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 },
  field: { display: 'grid', gap: 6, fontSize: 13 },
  empty: { color: '#5d6d7e' },
  error: { color: '#922b21', background: '#fdecea', padding: 12, borderRadius: 6 },
};
