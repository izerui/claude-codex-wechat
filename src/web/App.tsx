import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  decidePermission,
  fetchProviderStatus,
  fetchSessions,
  fetchSettings,
  fetchStatus,
  stopSession,
  updateSettings,
  type BridgeSessionView,
  type BridgeSettingsView,
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
  const activeSessions = useMemo(() => sessions.filter((session) => session.status !== 'closed'), [sessions]);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>本地微信代理桥接</h1>
          <p style={styles.subtitle}>通过微信控制本地 Claude Code / Codex 会话。</p>
        </div>
        <button type="button" style={styles.button} onClick={() => void refresh()}>刷新</button>
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
  const claudeCheckedAt = readProviderCheckedAt(input.providerStatus?.claude);
  const codexCheckedAt = readProviderCheckedAt(input.providerStatus?.codex);

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>总览</h2>
      <div style={styles.metricGrid}>
        <Metric label="服务" value={input.status?.ok ? '在线' : '未知'} />
        <Metric label="活跃会话" value={String(input.activeSessionCount)} />
        <Metric label="待处理权限" value={String(input.status?.permissions.length ?? 0)} />
        <Metric label="Claude" value={claudeStatus} detail={joinProviderDetail(claudeCommand, claudeCheckedAt)} />
        <Metric label="Codex" value={codexStatus} detail={joinProviderDetail(codexCommand, codexCheckedAt)} />
      </div>
    </section>
  );
}

function readProviderCommand(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.command === 'string' && record.command ? record.command : null;
}

function readProviderCheckedAt(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.checkedAt === 'number' ? record.checkedAt : null;
}

function joinProviderDetail(command: string | null, checkedAt: number | null): string | undefined {
  const parts = [command, checkedAt !== null ? `检查于 ${checkedAt}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function formatProviderStatus(value: unknown): string {
  if (!value || typeof value !== 'object') return '未知';
  const record = value as Record<string, unknown>;
  if (record.detected === true) {
    return typeof record.version === 'string' && record.version ? `已检测 · ${record.version}` : '已检测';
  }
  if (record.reason === 'missing_binary') return '未找到可执行文件';
  if (record.reason === 'command_failed') return '命令执行失败';
  if (typeof record.reason === 'string' && record.reason) return String(record.reason);
  return '未知';
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
  const runAction = async (sessionId: string) => {
    await stopSession(sessionId);
    await input.onRefresh();
  };

  return (
    <section style={styles.section}>
      <div style={styles.panelHeader}>
        <h2 style={styles.sectionTitle}>桥接会话</h2>
      </div>
      {input.sessions.length === 0 ? <p style={styles.empty}>暂无桥接会话。</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>微信用户</th>
                <th style={styles.th}>提供方</th>
                <th style={styles.th}>原生标题</th>
                <th style={styles.th}>工作目录</th>
                <th style={styles.th}>状态</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {input.sessions.map((session) => (
                <tr key={session.id}>
                  <td style={styles.td}>{session.chatId}</td>
                  <td style={styles.td}>{session.providerId}</td>
                  <td style={styles.td}>{session.resumeTitle ?? '-'}</td>
                  <td style={styles.td}>{session.cwd}</td>
                  <td style={styles.td}>{session.status}</td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      {session.status !== 'closed' && (
                        <button type="button" style={styles.button} onClick={() => void runAction(session.id)}>停止</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      <h2 style={styles.sectionTitle}>权限</h2>
      {input.permissions.length === 0 ? <p style={styles.empty}>暂无待处理权限请求。</p> : (
        <ul style={styles.list}>
          {input.permissions.map((request) => (
            <li key={request.id} style={styles.listItem}>
              <div>
                <strong>{request.toolName}</strong> · {request.providerId}
                <div style={styles.muted}>{request.summary}</div>
                <div style={styles.muted}>会话：{request.bridgeSessionId}</div>
              </div>
              <div style={styles.actions}>
                <button type="button" style={styles.button} onClick={() => void decide(request.id, 'approve')}>允许</button>
                <button type="button" style={styles.button} onClick={() => void decide(request.id, 'deny')}>拒绝</button>
                <button type="button" style={styles.dangerButton} onClick={() => void decide(request.id, 'abort')}>中止</button>
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
      <h2 style={styles.sectionTitle}>设置</h2>
      <div style={styles.formGrid}>
        <label style={styles.field}>
          <span>默认提供方</span>
          <select
            value={draft.defaultProvider}
            onChange={(event) => setDraft({ ...draft, defaultProvider: event.target.value === 'codex' ? 'codex' : 'claude-code' })}
          >
            <option value="claude-code">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <label style={styles.field}>
          <span>默认工作目录</span>
          <input value={draft.defaultWorkspace} onChange={(event) => setDraft({ ...draft, defaultWorkspace: event.target.value })} />
        </label>
      </div>
      <button type="button" style={styles.button} disabled={saving} onClick={() => void save()}>
        {saving ? '保存中...' : '保存设置'}
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
  checkboxField: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  empty: { color: '#5d6d7e' },
  error: { color: '#922b21', background: '#fdecea', padding: 12, borderRadius: 6 },
};
