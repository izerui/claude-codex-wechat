import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  archiveSession,
  decidePermission,
  fetchProviderStatus,
  fetchSessionMessages,
  fetchSessions,
  fetchSettings,
  fetchStatus,
  repairAllSessionNativeResume,
  repairSessionNativeResume,
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

function formatBindingSource(
  value: BridgeSessionView['bindingSource'],
  bindingMatched: boolean | undefined,
): string {
  if (value === 'sidecar') return 'Sidecar 命中';
  if (value === 'binding_table' || bindingMatched) return '历史绑定命中';
  if (value === 'manual_attach') return '手动接入';
  if (value === 'heuristic') return '普通恢复';
  return '运行时新建';
}

function formatProviderResumeState(session: BridgeSessionView): string {
  if (session.providerId !== 'claude-code') return '-';
  if (session.providerResumeTitleSynced === true) return '已同步';
  if (session.providerResumeRepairable === true) return '待修复';
  if (session.providerSessionId && session.resumeTitle) return '不可修复';
  return '-';
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
  const hasRepairableClaudeBridgeSessions = input.sessions.some((session) => (
    session.providerId === 'claude-code' && session.providerResumeRepairable === true
  ));

  const runAction = async (action: 'stop' | 'archive', sessionId: string) => {
    if (action === 'stop') await stopSession(sessionId);
    else await archiveSession(sessionId);
    await input.onRefresh();
  };

  const showLogs = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setLogs(deduplicateDisplayedLogs(await fetchSessionMessages(sessionId)));
  };

  const repairNativeResume = async (session: BridgeSessionView) => {
    await repairSessionNativeResume(session.id);
    await input.onRefresh();
  };

  const repairAllNativeResume = async () => {
    await repairAllSessionNativeResume();
    await input.onRefresh();
  };

  return (
    <section style={styles.section}>
      <div style={styles.panelHeader}>
        <h2 style={styles.sectionTitle}>会话</h2>
        {hasRepairableClaudeBridgeSessions ? (
          <button type="button" style={styles.button} onClick={() => void repairAllNativeResume()}>批量修复 Claude 恢复</button>
        ) : null}
      </div>
      {input.sessions.length === 0 ? <p style={styles.empty}>暂无桥接会话。</p> : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>对话</th>
                <th style={styles.th}>桥接会话</th>
                <th style={styles.th}>提供方</th>
                <th style={styles.th}>提供方会话</th>
                <th style={styles.th}>原生标题</th>
                <th style={styles.th}>恢复模式</th>
                <th style={styles.th}>推荐恢复</th>
                <th style={styles.th}>按 ID 恢复</th>
                <th style={styles.th}>按标题恢复</th>
                <th style={styles.th}>原生恢复状态</th>
                <th style={styles.th}>绑定状态</th>
                <th style={styles.th}>绑定详情</th>
                <th style={styles.th}>原生状态</th>
                <th style={styles.th}>工作目录</th>
                <th style={styles.th}>状态</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {input.sessions.map((session) => (
                <tr key={session.id}>
                  <td style={styles.td}>{session.chatId}</td>
                  <td style={styles.td}>{session.id}</td>
                  <td style={styles.td}>{session.providerId}</td>
                  <td style={styles.td}>{session.providerSessionId ?? '-'}</td>
                  <td style={styles.td}>{session.resumeTitle ?? '-'}</td>
                  <td style={styles.td}>{session.preferredResumeMode === 'title' ? '标题恢复' : 'ID恢复'}</td>
                  <td style={styles.td}>{session.preferredResumeCommand ?? '-'}</td>
                  <td style={styles.td}>{session.providerResumeCommand ?? '-'}</td>
                  <td style={styles.td}>{session.providerResumeByTitleCommand ?? '-'}</td>
                  <td style={styles.td}>{formatProviderResumeState(session)}</td>
                  <td style={styles.td}>{formatBindingSource(session.bindingSource, session.bindingMatched)}</td>
                  <td style={styles.td}>
                    {session.bindingPlatformUserId
                      ? `${session.bindingPlatformUserId} · ${session.bindingProviderSessionId ?? '-'}`
                      : '-'}
                  </td>
                  <td style={styles.td}>
                    {session.providerNativeReachable ? `可达${session.providerNativePath ? ` · ${session.providerNativePath}` : ''}` : '不可达'}
                  </td>
                  <td style={styles.td}>{session.cwd}</td>
                  <td style={styles.td}>{session.status}</td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button type="button" style={styles.button} onClick={() => void showLogs(session.id)}>日志</button>
                      {!session.archivedAt && session.status !== 'closed' && (
                        <button type="button" style={styles.button} onClick={() => void runAction('stop', session.id)}>停止</button>
                      )}
                      {!session.archivedAt && (
                        <button type="button" style={styles.dangerButton} onClick={() => void runAction('archive', session.id)}>归档</button>
                      )}
                      {session.providerId === 'claude-code' && session.providerResumeRepairable === true ? (
                        <button type="button" style={styles.button} onClick={() => void repairNativeResume(session)}>修复原生恢复</button>
                      ) : null}
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
          <h3 style={styles.sectionTitle}>消息日志 · {selectedSessionId}</h3>
          {logs.length === 0 ? <p style={styles.empty}>暂无消息记录。</p> : (
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

function deduplicateDisplayedLogs(logs: MessageLogView[]): MessageLogView[] {
  const deduplicated: MessageLogView[] = [];
  for (const log of logs) {
    const previous = deduplicated.at(-1);
    const canMergeTextDelta = previous?.direction === 'provider_event'
      && previous.providerEventType === 'text_delta'
      && log.direction === 'provider_event'
      && log.providerEventType === 'text_delta';
    if (canMergeTextDelta) {
      previous.text = `${previous.text ?? ''}${log.text ?? ''}`;
      continue;
    }
    const isDuplicateOutboundText = previous?.direction === 'provider_event'
      && (previous.providerEventType === 'text_delta' || previous.providerEventType === 'message_done')
      && log.direction === 'outbound'
      && previous.text === log.text;
    if (isDuplicateOutboundText) continue;
    deduplicated.push(log);
  }
  return deduplicated;
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
        <label style={styles.field}>
          <span>权限超时</span>
          <select
            value={String(draft.permissionTimeoutMs)}
            onChange={(event) => setDraft({
              ...draft,
              permissionTimeoutMs: event.target.value === 'never' ? 'never' : Number(event.target.value),
            })}
          >
            <option value="30000">30秒</option>
            <option value="60000">60秒</option>
            <option value="300000">5分钟</option>
            <option value="never">不超时</option>
          </select>
        </label>
        <label style={styles.checkboxField}>
          <input
            type="checkbox"
            checked={draft.wechatAutoAuthorize}
            onChange={(event) => setDraft({ ...draft, wechatAutoAuthorize: event.target.checked })}
          />
          <span>微信首条消息自动授权</span>
        </label>
        <label style={styles.field}>
          <span>微信发送节流毫秒</span>
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
          <span>分片大小</span>
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
          <span>高风险命令策略</span>
          <select
            value={draft.highRiskCommandPolicy}
            onChange={(event) => setDraft({
              ...draft,
              highRiskCommandPolicy: event.target.value === 'deny' || event.target.value === 'allow' ? event.target.value : 'per_request',
            })}
          >
            <option value="per_request">逐次确认</option>
            <option value="deny">拒绝</option>
            <option value="allow">允许</option>
          </select>
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
