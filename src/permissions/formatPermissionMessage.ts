import type { PermissionRequest } from '../providers/types';

function readDetailString(details: unknown, key: string): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function formatPermissionMessage(request: PermissionRequest): string {
  const command = readDetailString(request.details, 'command');
  const cwd = readDetailString(request.details, 'cwd');
  const file = readDetailString(request.details, 'file');
  const lines = [
    `[权限请求] ${request.providerId} 想执行 ${request.toolName}`,
    '',
    `会话: ${request.bridgeSessionId}`,
    `工具: ${request.toolName}`,
    `摘要: ${request.summary}`,
  ];
  if (cwd) lines.push(`目录: ${cwd}`);
  if (file) lines.push(`文件: ${file}`);
  if (command) lines.push('', '命令:', command);
  lines.push('', '请直接在微信里回复以下任一命令完成选择:');
  if (request.choices.includes('approve')) lines.push(`/approve ${request.id}`);
  if (request.choices.includes('approve_for_session')) lines.push(`/always ${request.id}（本会话内永久批准）`);
  if (request.choices.includes('deny')) lines.push(`/deny ${request.id}`);
  if (request.choices.includes('abort')) lines.push(`/abort ${request.id}`);
  return lines.join('\n');
}
