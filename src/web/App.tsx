import { useCallback, useEffect, useState } from 'react';
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

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <main className="container-fluid py-3" style={{ maxWidth: 1200, fontFamily: 'system-ui, sans-serif', color: '#17202a' }}>
        <header className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>本地微信代理桥接</h1>
            <p style={{ margin: '6px 0 0', color: '#5d6d7e', fontSize: 14 }}>通过微信控制本地 Claude Code / Codex 会话。</p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className={`badge rounded-pill ${status?.ok === true ? 'text-bg-success' : 'text-bg-warning'}`}>
              {status?.ok === true ? '在线' : '待确认'}
            </span>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => void refresh()} type="button">
              刷新
            </button>
          </div>
        </header>

        <StatusCards providerStatus={providerStatus} status={status} />

        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}

        <WeChatPanel
          currentSession={currentSession}
          onRefreshCurrentSession={setCurrentSession}
          onStopCurrentSession={async () => {
            await stopCurrentSession();
            await refresh();
          }}
        />
      </main>
    </div>
  );
}

function StatusCards(input: {
  providerStatus: ProviderStatusView | null;
  status: StatusView | null;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
      <StatusCard
        detail="127.0.0.1:5177"
        title="桥接"
        tone={input.status?.ok ? 'success' : 'warning'}
        value={input.status?.ok ? '运行中' : '未知'}
      />
      <StatusCard
        detail={joinProviderDetail(readProviderCommand(input.providerStatus?.claude), readProviderCheckedAt(input.providerStatus?.claude)) ?? '-'}
        title="Claude"
        tone={providerTone(input.providerStatus?.claude)}
        value={formatProviderStatus(input.providerStatus?.claude)}
      />
      <StatusCard
        detail={joinProviderDetail(readProviderCommand(input.providerStatus?.codex), readProviderCheckedAt(input.providerStatus?.codex)) ?? '-'}
        title="Codex"
        tone={providerTone(input.providerStatus?.codex)}
        value={formatProviderStatus(input.providerStatus?.codex)}
      />
    </div>
  );
}

function StatusCard(input: {
  detail: string;
  title: string;
  tone: 'success' | 'warning' | 'neutral';
  value: string;
}) {
  return (
    <div style={{ border: '1px solid #d5d8dc', borderRadius: 6, padding: 12, background: '#fbfcfc' }}>
      <div style={{ color: '#5d6d7e', fontSize: 12 }}>{input.title}</div>
      <div style={{ fontSize: 20, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`badge rounded-circle p-1 ${toneClassName(input.tone)}`} />
        {input.value}
      </div>
      <div className="font-monospace" style={{ color: '#5d6d7e', fontSize: 12, marginTop: 4 }}>{input.detail}</div>
    </div>
  );
}

function toneClassName(tone: 'success' | 'warning' | 'neutral'): string {
  if (tone === 'success') return 'bg-success';
  if (tone === 'warning') return 'bg-warning';
  return 'bg-secondary';
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

function joinProviderDetail(command: string | null, checkedAt: number | null): string | null {
  const parts = [command, checkedAt !== null ? `检查于 ${formatCheckedAt(checkedAt)}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
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

function providerTone(value: unknown): 'success' | 'warning' | 'neutral' {
  if (!value || typeof value !== 'object') return 'neutral';
  const record = value as Record<string, unknown>;
  if (record.detected === true) return 'success';
  return typeof record.reason === 'string' && record.reason ? 'warning' : 'neutral';
}
