import type { PermissionRequest } from '../providers/types';

// Compatibility-only formatter retained for lower-level tests. The bridge no
// longer emits these messages to WeChat.
export function formatPermissionMessage(request: PermissionRequest): string {
  return `[权限请求] ${request.providerId} 想执行 ${request.toolName}\n摘要: ${request.summary}`;
}
