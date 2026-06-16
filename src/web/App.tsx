import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCurrentSession,
  fetchProviderStatus,
  fetchStatus,
  stopCurrentSession,
  type CurrentSessionView,
  type ProviderStatusView,
  type StatusView,
} from './apiClient';
import { WeChatPanel } from './WeChatPanel';

export function App() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusView | null>(null);
  const [currentSession, setCurrentSession] = useState<CurrentSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextProviderStatus, nextCurrentSession] = await Promise.all([
        fetchStatus(),
        fetchProviderStatus(),
        fetchCurrentSession(),
      ]);
      setStatus(nextStatus);
      setProviderStatus(nextProviderStatus);
      setCurrentSession(nextCurrentSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeSessionCount = useMemo(() => (currentSession && currentSession.status !== 'closed' ? 1 : 0), [currentSession]);

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

      <Dashboard status={status} providerStatus={providerStatus} activeSessionCount={activeSessionCount} />
      <WeChatPanel currentSession={currentSession} onStopCurrentSession={async () => {
        await stopCurrentSession();
        await refresh();
      }} />
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

function formatCheckedAt(value: number): string {
  const timestampMs = value >= 1e12 ? value : value * 1000;
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return String(value);
  const yyyy = date.getFullYear();
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

function joinProviderDetail(command: string | null, checkedAt: number | null): string | undefined {
  const parts = [command, checkedAt !== null ? `检查于 ${formatCheckedAt(checkedAt)}` : null].filter(Boolean);
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
  muted: { color: '#5d6d7e', fontSize: 13, marginTop: 4 },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: { border: '1px solid #aeb6bf', background: '#fff', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  dangerButton: { border: '1px solid #c0392b', color: '#922b21', background: '#fff', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  empty: { color: '#5d6d7e' },
  error: { color: '#922b21', background: '#fdecea', padding: 12, borderRadius: 6 },
};
