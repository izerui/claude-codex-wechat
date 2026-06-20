import type { ChannelPluginView, CurrentSessionView, ActiveWeChatUserView, ProviderStatusView } from './apiClient';
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
          {input.plugin?.enabled ? (
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
  providerInfo: unknown;
  active: boolean;
  session: CurrentSessionView | null;
}) {
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
      ) : null}
    </div>
  );
}

export function EngineBays(input: {
  providerStatus: ProviderStatusView | null;
  plugin: ChannelPluginView | null;
  currentSession: CurrentSessionView | null;
}) {
  const connected = isPluginConnected(input.plugin);
  const activeProvider = connected && input.currentSession
    ? (input.currentSession.providerId === 'codex' ? 'codex' : 'claude')
    : null;

  const claude = (
    <EngineBay
      key="claude"
      name="Claude"
      providerInfo={input.providerStatus?.claude}
      active={activeProvider === 'claude'}
      session={activeProvider === 'claude' ? input.currentSession : null}
    />
  );
  const codex = (
    <EngineBay
      key="codex"
      name="Codex"
      providerInfo={input.providerStatus?.codex}
      active={activeProvider === 'codex'}
      session={activeProvider === 'codex' ? input.currentSession : null}
    />
  );

  const ordered = activeProvider === 'codex' ? [codex, claude] : [claude, codex];

  return <div className="engine-bays mb-2">{ordered}</div>;
}
