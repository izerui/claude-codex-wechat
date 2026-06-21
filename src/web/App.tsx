import { useCallback, useEffect, useState } from 'react';
import {
  fetchProviderStatus,
  fetchStatus,
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
  const [toast, setToast] = useState<string | null>(null);
  const [, setRelativeTick] = useState(0);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const id = setInterval(() => setRelativeTick((tick) => tick + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextProviderStatus] = await Promise.all([
        fetchStatus(),
        fetchProviderStatus(),
      ]);
      setStatus(nextStatus);
      setProviderStatus(nextProviderStatus);
      setCurrentSession(nextStatus.sessions[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}

        <WeChatPanel
          providerStatus={providerStatus}
          currentSession={currentSession}
          onRefreshCurrentSession={setCurrentSession}
          onNotice={setToast}
        />
      </main>
    </div>
  );
}
