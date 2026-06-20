import { useState } from 'react';
import type { ChannelPluginView, CurrentSessionView, ActiveWeChatUserView, ProviderStatusView, LastProviderSessionView } from './apiClient';
import {
  ELLIPSIS,
  formatPluginBadge,
  formatPluginBadgeClass,
  formatProviderStatus,
  formatSessionStatusBadgeClass,
  formatTimestamp,
  isPluginConnected,
  providerTone,
  readProviderCommand,
  sessionDotTone,
  statusDotClassName,
} from './statusFormat';
import type { StatusTone } from './statusFormat';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';

export function ChannelStrip(input: {
  plugin: ChannelPluginView | null;
  activeUser: ActiveWeChatUserView | null;
  gateway?: string;
  busy: boolean;
  loginState: LoginState;
  onLogin(): void;
  onDisconnect(): void;
}) {
  const connected = isPluginConnected(input.plugin);
  const dotTone: StatusTone = connected ? 'success' : 'neutral';
  const loginLabel = input.loginState === 'loading_qr'
    ? '正在加载二维码...'
    : input.plugin?.status === 'session_timeout' ? '重新扫码登录' : '扫码登录';

  return (
    <div className="soft-card channel-strip mb-2">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className={`status-dot ${statusDotClassName(dotTone)}`} />
        <span className="fw-semibold">微信通道</span>
        <span className={`badge ${formatPluginBadgeClass(input.plugin)}`}>{formatPluginBadge(input.plugin)}</span>
        {input.activeUser ? (
          <span className="channel-meta d-flex align-items-center gap-1">
            <span className="text-muted-soft small">当前活跃用户</span>
            <span className="small" style={ELLIPSIS} title={input.activeUser.displayName ?? input.activeUser.platformUserId}>
              {input.activeUser.displayName ?? input.activeUser.platformUserId}
            </span>
          </span>
        ) : null}
        {input.gateway ? (
          <span className="channel-meta d-flex align-items-center gap-1" style={{ minWidth: 0 }}>
            <span className="text-muted-soft small">网关</span>
            <span className="font-monospace text-muted-soft small" style={{ ...ELLIPSIS, maxWidth: 220 }} title={input.gateway}>
              {input.gateway}
            </span>
          </span>
        ) : null}
        <span className="ms-auto">
          {connected ? (
            <button className="btn btn-sm btn-outline-danger" disabled={input.busy} onClick={input.onDisconnect} type="button">
              {input.busy ? '断开中...' : '断开连接'}
            </button>
          ) : (
            <button className="btn btn-sm btn-accent" disabled={input.loginState === 'loading_qr'} onClick={input.onLogin} type="button">
              {loginLabel}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function EngineBay(input: {
  name: string;
  providerId: 'claude-code' | 'codex';
  providerInfo: unknown;
  active: boolean;
  session: CurrentSessionView | null;
  lastSession: LastProviderSessionView | null;
  canCreate: boolean;
  defaultCwd: string;
  creating: boolean;
  onCreate?(cwd: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cwdInput, setCwdInput] = useState('');
  const cwdId = `engine-create-cwd-${input.providerId}`;
  const openCreate = () => {
    setCwdInput(input.defaultCwd);
    setExpanded(true);
  };
  const submitCreate = () => {
    const cwd = cwdInput.trim();
    if (!cwd) return;
    input.onCreate?.(cwd);
  };
  const tone = input.active && input.session ? sessionDotTone(input.session) : providerTone(input.providerInfo);
  const command = readProviderCommand(input.providerInfo);
  return (
    <div className={`soft-card engine-bay ${input.active ? 'engine-bay-active' : ''}`} style={{ padding: 14 }}>
      <div className="d-flex align-items-center gap-2">
        <span className={`status-dot ${statusDotClassName(tone)}`} />
        <span className="fw-semibold" style={{ fontSize: 15 }}>{input.name}</span>
        <span className="badge badge-soft-accent">{formatProviderStatus(input.providerInfo)}</span>
        {input.active && input.session ? (
          <span className={`badge ${formatSessionStatusBadgeClass(input.session.status)} ms-auto`}>
            运行中 · {input.session.status}
          </span>
        ) : (
          <span className="badge badge-soft-neutral ms-auto">待命</span>
        )}
      </div>
      {command ? (
        <div className="font-monospace text-muted-soft small mt-2" style={ELLIPSIS} title={command}>{command}</div>
      ) : null}
      {input.active && input.session ? (
        <div className="engine-session-detail mt-2 pt-2 d-flex flex-column gap-1">
          <div className="text-muted-soft small">当前会话</div>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span className="text-muted-soft small flex-shrink-0">会话 ID</span>
            <span className="font-monospace small" style={ELLIPSIS} title={input.session.providerSessionId ?? '-'}>
              {input.session.providerSessionId ?? '-'}
            </span>
          </div>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span className="text-muted-soft small flex-shrink-0">工作目录</span>
            <span className="font-monospace small" style={ELLIPSIS} title={input.session.cwd}>{input.session.cwd}</span>
          </div>
          {(input.session.nativeTitle ?? input.session.resumeTitle) ? (
            <div className="d-flex justify-content-between align-items-center gap-3">
              <span className="text-muted-soft small flex-shrink-0">标题</span>
              <span className="small" style={ELLIPSIS} title={input.session.nativeTitle ?? input.session.resumeTitle}>
                {input.session.nativeTitle ?? input.session.resumeTitle}
              </span>
            </div>
          ) : null}
          <div className="text-muted-soft small">
            创建 {formatTimestamp(input.session.createdAt)} · 最后活跃 {formatTimestamp(input.session.lastActivityAt)}
          </div>
        </div>
      ) : input.lastSession ? (
        <div className="engine-session-detail mt-2 pt-2 d-flex flex-column gap-1">
          <div className="text-muted-soft small">最近会话</div>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span className="text-muted-soft small flex-shrink-0">会话 ID</span>
            <span className="font-monospace small" style={ELLIPSIS} title={input.lastSession.providerSessionId}>
              {input.lastSession.providerSessionId}
            </span>
          </div>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span className="text-muted-soft small flex-shrink-0">工作目录</span>
            <span className="font-monospace small" style={ELLIPSIS} title={input.lastSession.cwd}>{input.lastSession.cwd}</span>
          </div>
          <div className="text-muted-soft small">最后活跃 {formatTimestamp(input.lastSession.updatedAt)}</div>
        </div>
      ) : null}
      {input.canCreate ? (
        expanded ? (
          <div className="engine-create mt-2 pt-2 d-flex flex-column gap-2">
            <label className="form-label small mb-0" htmlFor={cwdId}>工作目录</label>
            <input
              id={cwdId}
              className="form-control form-control-sm"
              value={cwdInput}
              onChange={(event) => setCwdInput(event.target.value)}
              type="text"
            />
            <div className="d-flex gap-2">
              <button
                className="btn btn-accent btn-sm"
                disabled={input.creating || !cwdInput.trim()}
                onClick={submitCreate}
                type="button"
              >
                {input.creating ? '新建中...' : '确认'}
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={input.creating}
                onClick={() => setExpanded(false)}
                type="button"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 pt-2">
            <button className="btn btn-accent btn-sm" onClick={openCreate} type="button">
              {input.active ? '新开会话' : '新建会话'}
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

export function EngineBays(input: {
  providerStatus: ProviderStatusView | null;
  plugin: ChannelPluginView | null;
  currentSession: CurrentSessionView | null;
  lastProviderSessions?: Partial<Record<'claude-code' | 'codex', LastProviderSessionView>>;
  canCreateSession?: boolean;
  defaultWorkspace?: string;
  creatingProvider?: 'claude-code' | 'codex' | null;
  onCreateSession?(providerId: 'claude-code' | 'codex', cwd: string): void;
}) {
  const connected = isPluginConnected(input.plugin);
  const activeProvider = connected && input.currentSession
    ? (input.currentSession.providerId === 'codex' ? 'codex' : 'claude')
    : null;
  const lastSessions = input.lastProviderSessions ?? {};
  const canCreate = input.canCreateSession ?? false;
  const wsFallback = input.defaultWorkspace ?? '';

  const claude = (
    <EngineBay
      key="claude"
      name="Claude"
      providerId="claude-code"
      providerInfo={input.providerStatus?.claude}
      active={activeProvider === 'claude'}
      session={activeProvider === 'claude' ? input.currentSession : null}
      lastSession={activeProvider === 'claude' ? null : lastSessions['claude-code'] ?? null}
      canCreate={canCreate}
      defaultCwd={activeProvider === 'claude'
        ? (input.currentSession?.cwd ?? wsFallback)
        : (lastSessions['claude-code']?.cwd ?? wsFallback)}
      creating={input.creatingProvider === 'claude-code'}
      onCreate={(cwd) => input.onCreateSession?.('claude-code', cwd)}
    />
  );
  const codex = (
    <EngineBay
      key="codex"
      name="Codex"
      providerId="codex"
      providerInfo={input.providerStatus?.codex}
      active={activeProvider === 'codex'}
      session={activeProvider === 'codex' ? input.currentSession : null}
      lastSession={activeProvider === 'codex' ? null : lastSessions['codex'] ?? null}
      canCreate={canCreate}
      defaultCwd={activeProvider === 'codex'
        ? (input.currentSession?.cwd ?? wsFallback)
        : (lastSessions['codex']?.cwd ?? wsFallback)}
      creating={input.creatingProvider === 'codex'}
      onCreate={(cwd) => input.onCreateSession?.('codex', cwd)}
    />
  );

  const ordered = activeProvider === 'codex' ? [codex, claude] : [claude, codex];

  return <div className="engine-bays mb-2">{ordered}</div>;
}
