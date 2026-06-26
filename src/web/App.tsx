import { useCallback, useEffect, useState } from 'react';
import {
  fetchNgrokStatus,
  fetchProviderStatus,
  fetchSettings,
  fetchStatus,
  startNgrok,
  stopNgrok,
  type CurrentSessionView,
  type NgrokStatusView,
  type ProviderStatusView,
  type BridgeSettingsView,
  type StatusView,
} from './apiClient';
import { WeChatPanel } from './WeChatPanel';

export function App() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusView | null>(null);
  const [ngrokStatus, setNgrokStatus] = useState<NgrokStatusView | null>(null);
  const [settings, setSettings] = useState<BridgeSettingsView | null>(null);
  const [currentSession, setCurrentSession] = useState<CurrentSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ngrokBusy, setNgrokBusy] = useState(false);
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

  useEffect(() => {
    const id = setInterval(() => {
      void fetchNgrokStatus()
        .then((next) => setNgrokStatus(next))
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextProviderStatus, nextNgrokStatus, nextSettings] = await Promise.all([
        fetchStatus(),
        fetchProviderStatus(),
        fetchNgrokStatus(),
        fetchSettings(),
      ]);
      setStatus(nextStatus);
      setProviderStatus(nextProviderStatus);
      setNgrokStatus(nextNgrokStatus);
      setSettings(nextSettings);
      setCurrentSession(nextStatus.sessions[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleNgrokStart = useCallback(async () => {
    setNgrokBusy(true);
    try {
      const next = await startNgrok();
      setNgrokStatus(next);
      setSettings((current) => current ? { ...current, ngrok: { enabled: true } } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNgrokBusy(false);
    }
  }, []);

  const handleNgrokStop = useCallback(async () => {
    setNgrokBusy(true);
    try {
      const next = await stopNgrok();
      setNgrokStatus(next);
      setSettings((current) => current ? { ...current, ngrok: { enabled: false } } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNgrokBusy(false);
    }
  }, []);

  const localUrl = status?.preferredLocalUrl
    ?? (typeof window !== 'undefined' && window.location?.host
      ? `http://${window.location.host}`
      : 'http://127.0.0.1');
  const displayAddress = ngrokStatus?.running && ngrokStatus.publicUrl
    ? ngrokStatus.publicUrl
    : localUrl;
  const isPublicAddress = Boolean(ngrokStatus?.running && ngrokStatus.publicUrl);
  const displayHref = displayAddress;

  return (
    <div className="app-bg">
      <main className="container-fluid py-4" style={{ maxWidth: 1200 }}>
        <header className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>微信远程控制台</h1>
            <p className="text-muted-soft" style={{ margin: '4px 0 0', fontSize: 13 }}>通过微信控制本地 Claude Code / Codex 会话。</p>
          </div>
          <div className="d-flex flex-column align-items-end gap-1" style={{ minWidth: 260 }}>
            <div className="d-flex align-items-center justify-content-end gap-2">
              <span className={`badge ${status?.ok === true ? 'badge-solid-success' : 'badge-soft-accent'}`}>
                {status?.ok === true ? '在线' : '待确认'}
              </span>
              {ngrokStatus?.installed ? (
                ngrokStatus.running ? (
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void handleNgrokStop()} disabled={ngrokBusy}>
                    关闭公网
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void handleNgrokStart()} disabled={ngrokBusy}>
                    开启公网
                  </button>
                )
              ) : null}
            </div>
            <a
              className="font-monospace text-muted-soft"
              style={{ fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              href={displayHref}
              target="_blank"
              rel="noreferrer"
              title={displayAddress}
            >
              {displayAddress}
            </a>
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

        {!ngrokStatus?.installed ? (
          <div className="alert alert-warning py-2 px-3 mb-3" role="status">
            未安装 ngrok
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
