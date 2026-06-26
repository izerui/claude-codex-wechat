import type { CSSProperties } from 'react';
import type { ChannelPluginView, CurrentSessionView } from './apiClient';

export type StatusTone = 'success' | 'warning' | 'neutral';

export const ELLIPSIS: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export function isPluginConnected(plugin: ChannelPluginView | null): boolean {
  return plugin?.enabled === true && plugin.connected === true;
}

export function formatPluginBadge(plugin: ChannelPluginView | null): string {
  if (!plugin?.enabled) return '未连接';
  if (plugin.connected) return '已连接';
  if (plugin.status === 'session_timeout') return '会话超时';
  if (plugin.status === 'connecting') return '连接中';
  if (plugin.status === 'poll_error') return '轮询异常';
  return '未连接';
}

export function formatPluginBadgeClass(plugin: ChannelPluginView | null): string {
  if (isPluginConnected(plugin)) return 'badge-solid-success';
  if (plugin?.status === 'session_timeout' || plugin?.status === 'poll_error') return 'badge-solid-error';
  if (plugin?.status === 'connecting') return 'badge-soft-accent';
  return 'badge-soft-neutral';
}

export function formatPluginHint(plugin: ChannelPluginView | null): string | null {
  if (!plugin?.enabled) return null;
  if (plugin.status === 'session_timeout') return '微信 bot 会话已失效，请重新扫码登录以刷新 token。';
  if (plugin.status === 'poll_error') return '微信消息轮询异常，请检查网络或重新扫码登录。';
  if (plugin.status === 'connecting') return '微信通道正在建立轮询连接。';
  return null;
}

export function formatProviderLabel(providerId: string): string {
  return providerId === 'codex' ? 'Codex CLI' : 'Claude Code';
}

export function formatProviderBadgeClass(providerId: string): string {
  return providerId === 'codex' ? 'badge-soft-success' : 'badge-soft-accent';
}

export function formatSessionStatusBadgeClass(status: string): string {
  if (status === 'running' || status === 'active') return 'badge-solid-success';
  if (status === 'error' || status === 'failed') return 'badge-solid-error';
  return 'badge-soft-neutral';
}

export type SessionStatusDisplay = { icon: string; label: string; badgeClass: string };

/** 把会话状态映射成「图标 + 中文标签 + 徽章样式」，让运行状态一眼可辨。 */
export function formatSessionStatusDisplay(status: string): SessionStatusDisplay {
  switch (status) {
    case 'running':
    case 'active':
      return { icon: '🟢', label: '运行中', badgeClass: 'badge-solid-success' };
    case 'starting':
      return { icon: '⏳', label: '启动中', badgeClass: 'badge-soft-accent' };
    case 'idle':
      return { icon: '✅', label: '就绪', badgeClass: 'badge-soft-success' };
    case 'accepted':
      return { icon: '✅', label: '已就绪', badgeClass: 'badge-soft-success' };
    case 'error':
    case 'failed':
      return { icon: '❌', label: '异常', badgeClass: 'badge-solid-error' };
    default:
      return { icon: '🟡', label: status, badgeClass: 'badge-soft-neutral' };
  }
}

export function formatTimestamp(value?: number, now: number = Date.now()): string {
  if (!value) return '-';
  const diff = now - value;
  if (!Number.isFinite(diff)) return '-';
  if (diff < 0) return '刚刚';

  const sec = Math.floor(diff / 1000);
  if (sec < 10) return '刚刚';
  if (sec < 60) return `${sec}秒前`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}小时前`;

  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}天前`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month}个月前`;

  const year = Math.floor(day / 365);
  return `${year}年前`;
}

export function readProviderCommand(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.command === 'string' && record.command ? record.command : null;
}

export function formatProviderStatus(value: unknown): string {
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

export function providerTone(value: unknown): StatusTone {
  if (!value || typeof value !== 'object') return 'neutral';
  const record = value as Record<string, unknown>;
  if (record.detected === true) return 'success';
  return typeof record.reason === 'string' && record.reason ? 'warning' : 'neutral';
}

export function statusDotClassName(tone: StatusTone): string {
  if (tone === 'success') return 'status-dot-success';
  if (tone === 'warning') return 'status-dot-warning';
  return 'status-dot-neutral';
}

export function sessionDotTone(session: CurrentSessionView | null): StatusTone {
  if (!session) return 'neutral';
  if (session.status === 'running' || session.status === 'active') return 'success';
  if (session.status === 'error' || session.status === 'failed') return 'warning';
  return 'neutral';
}
