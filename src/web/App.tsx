import { useCallback, useEffect, useState } from 'react';
import {
  fetchChannelState,
  fetchProviderStatus,
  fetchStatus,
  type ChannelPluginView,
  type CurrentSessionView,
  type ProviderStatusView,
  type StatusView,
} from './apiClient';
import { subscribeBridgeEvents } from './bridgeEventsSocket';
import { WeChatPanel } from './WeChatPanel';

export function App() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusView | null>(null);
  const [plugin, setPlugin] = useState<ChannelPluginView | null>(null);
  const [currentSession, setCurrentSession] = useState<CurrentSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextProviderStatus, nextChannelState] = await Promise.all([
        fetchStatus(),
        fetchProviderStatus(),
        fetchChannelState(),
      ]);
      setStatus(nextStatus);
      setProviderStatus(nextProviderStatus);
      setPlugin(nextChannelState.plugin);
      setCurrentSession(nextStatus.sessions[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeBridgeEvents((payload) => {
      if (payload.type === 'channel.plugin-status-changed') {
        setPlugin(payload.status);
      }
    });
  }, []);

  return (
    <div className="app-bg">
      <main className="container-fluid py-4" style={{ maxWidth: 1200 }}>
        <header className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>微信远程控制台</h1>
            <p className="text-muted-soft" style={{ margin: '4px 0 0', fontSize: 13 }}>通过微信控制本地 Claude Code / Codex 会话。</p>
          </div>
          <div className="d-flex flex-column align-items-end gap-1">
            <span className={`badge ${status?.ok === true ? 'badge-solid-success' : 'badge-soft-accent'}`}>
              {status?.ok === true ? '在线' : '待确认'}
            </span>
            <span className="font-monospace text-muted-soft" style={{ fontSize: 12 }}>127.0.0.1:5177</span>
          </div>
        </header>

        {toast ? (
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1050, whiteSpace: 'nowrap' }} className="alert alert-success py-2 px-3 shadow-sm" role="status">
            {toast}
          </div>
        ) : null}

        <StatusCards providerStatus={providerStatus} plugin={plugin} currentSession={currentSession} />

        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}

        <WeChatPanel
          currentSession={currentSession}
          onRefreshCurrentSession={setCurrentSession}
          onNotice={setToast}
        />
      </main>
    </div>
  );
}

function StatusCards(input: {
  providerStatus: ProviderStatusView | null;
  plugin: ChannelPluginView | null;
  currentSession: CurrentSessionView | null;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
      <StatusCard
        detail={readProviderCommand(input.providerStatus?.claude) ?? '-'}
        title="Claude"
        tone={providerTone(input.providerStatus?.claude)}
        value={formatProviderStatus(input.providerStatus?.claude)}
      />
      <StatusCard
        detail={readProviderCommand(input.providerStatus?.codex) ?? '-'}
        title="Codex"
        tone={providerTone(input.providerStatus?.codex)}
        value={formatProviderStatus(input.providerStatus?.codex)}
      />
      <StatusCard
        detail={input.plugin?.botUsername ?? '-'}
        title="微信通道"
        tone={pluginTone(input.plugin)}
        value={formatPluginStatus(input.plugin)}
      />
      <StatusCard
        detail={input.currentSession?.cwd ?? '-'}
        title="当前会话"
        tone={sessionTone(input.currentSession)}
        value={formatSessionStatus(input.currentSession)}
      />
    </div>
  );
}

function StatusCard(input: {
  badgeClassName?: string;
  badgeText?: string;
  detail: string | null;
  title: string;
  tone: 'success' | 'warning' | 'neutral';
  value: string;
}) {
  return (
    <div className="soft-card" style={{ padding: 16 }}>
      <div className="text-muted-soft" style={{ fontSize: 12 }}>{input.title}</div>
      <div style={{ fontSize: 20, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <span className={`status-dot ${statusDotClassName(input.tone)}`} />
        <span>{input.value}</span>
        {input.badgeText ? (
          <span className={`badge ${input.badgeClassName ?? 'badge-soft-neutral'}`}>{input.badgeText}</span>
        ) : null}
      </div>
      {input.detail ? (
        <div
          className="font-monospace text-muted-soft"
          style={{ fontSize: 12, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={input.detail}
        >
          {input.detail}
        </div>
      ) : null}
    </div>
  );
}

function statusDotClassName(tone: 'success' | 'warning' | 'neutral'): string {
  if (tone === 'success') return 'status-dot-success';
  if (tone === 'warning') return 'status-dot-warning';
  return 'status-dot-neutral';
}

function readProviderCommand(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.command === 'string' && record.command ? record.command : null;
}

function formatProviderStatus(value: unknown): string {
  if (!value || typeof value !== 'object') return '未知';
  const record = value as Record<string, unknown>;
  if (record.detected === true) {
    return typeof record.version === 'string' && record.version ? `v${record.version}` : '已检测';
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

function formatPluginStatus(plugin: ChannelPluginView | null): string {
  if (!plugin?.enabled) return '未连接';
  if (plugin.connected) return '已连接';
  if (plugin.status === 'session_timeout') return '会话超时';
  if (plugin.status === 'connecting') return '连接中';
  if (plugin.status === 'poll_error') return '轮询异常';
  return '未连接';
}

function formatPluginStatusBadgeClass(plugin: ChannelPluginView | null): string {
  if (plugin?.enabled === true && plugin.connected === true) return 'badge-solid-success';
  if (plugin?.status === 'session_timeout' || plugin?.status === 'poll_error') return 'badge-solid-error';
  if (plugin?.status === 'connecting') return 'badge-soft-accent';
  return 'badge-soft-neutral';
}

function pluginTone(plugin: ChannelPluginView | null): 'success' | 'warning' | 'neutral' {
  if (plugin?.enabled === true && plugin.connected === true) return 'success';
  if (plugin?.status === 'session_timeout' || plugin?.status === 'poll_error') return 'warning';
  return 'neutral';
}

function formatSessionStatus(session: CurrentSessionView | null): string {
  if (!session) return '无会话';
  return session.status || '未知';
}

function sessionTone(session: CurrentSessionView | null): 'success' | 'warning' | 'neutral' {
  if (!session) return 'neutral';
  if (session.status === 'running' || session.status === 'active') return 'success';
  if (session.status === 'error' || session.status === 'failed') return 'warning';
  return 'neutral';
}
