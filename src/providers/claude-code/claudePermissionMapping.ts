import type { PermissionRequest } from '../types';
import type { ClaudeRawPermissionPayload } from './claudeRunner';

export function mapClaudePermissionRequest(input: {
  bridgeSessionId: string;
  payload: ClaudeRawPermissionPayload;
}): PermissionRequest {
  const details: Record<string, unknown> = {};
  if (input.payload.command) details.command = input.payload.command;
  if (input.payload.cwd) details.cwd = input.payload.cwd;
  if (input.payload.file) details.file = input.payload.file;
  if (input.payload.details !== undefined) details.raw = input.payload.details;

  return {
    id: input.payload.id,
    bridgeSessionId: input.bridgeSessionId,
    providerId: 'claude-code',
    toolName: input.payload.toolName,
    summary: input.payload.summary ?? buildDefaultSummary(input.payload),
    details,
    choices: input.payload.choices ?? ['approve', 'deny', 'abort'],
  };
}

function buildDefaultSummary(payload: ClaudeRawPermissionPayload): string {
  if (payload.command) return `${payload.toolName}: ${payload.command}`;
  if (payload.file) return `${payload.toolName}: ${payload.file}`;
  return payload.toolName;
}
