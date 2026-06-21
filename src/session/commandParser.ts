import type { PermissionChoice, ProviderId } from '../providers/types';

export type BridgeCommand =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'new_session'; providerId: ProviderId | null; cwd: string | null }
  | { kind: 'use_provider'; providerId: ProviderId }
  | { kind: 'list_sessions'; scope: 'all'; keyword: string | null }
  | { kind: 'resume_session'; ref: string }
  | { kind: 'archive_session'; ref: string }
  | { kind: 'cancel_generation' }
  | { kind: 'permission_decision'; requestId: string; decision: PermissionChoice }
  | { kind: 'chat'; text: string };

function parseProvider(value: string | undefined): ProviderId | null {
  if (value === 'claude' || value === 'claude-code') return 'claude-code';
  if (value === 'codex') return 'codex';
  return null;
}

function looksLikePath(value: string): boolean {
  return value.startsWith('/') || value.startsWith('~');
}

export function parseBridgeCommand(input: string): BridgeCommand {
  const text = input.trim();
  if (!text.startsWith('/')) return { kind: 'chat', text };

  const [command, ...rest] = text.split(/\s+/);
  const first = rest[0];

  if (command === '/help') return { kind: 'help' };
  if (command === '/status') return { kind: 'status' };
  if (command === '/stop') return { kind: 'cancel_generation' };

  if (command === '/sessions') {
    if (first === 'mine') return { kind: 'chat', text };
    const keyword = rest.join(' ').trim();
    return { kind: 'list_sessions', scope: 'all', keyword: keyword || null };
  }

  if (command === '/resume') {
    return { kind: 'resume_session', ref: first ?? '' };
  }

  if (command === '/archive') {
    return { kind: 'archive_session', ref: first ?? '' };
  }

  if (command === '/new') {
    if (!first) return { kind: 'new_session', providerId: null, cwd: null };
    const colonIndex = first.indexOf(':');
    if (colonIndex !== -1) {
      const providerId = parseProvider(first.slice(0, colonIndex));
      const cwd = first.slice(colonIndex + 1);
      if (providerId && looksLikePath(cwd)) return { kind: 'new_session', providerId, cwd };
      return { kind: 'chat', text };
    }
    const providerId = parseProvider(first);
    if (providerId) return { kind: 'new_session', providerId, cwd: null };
    if (looksLikePath(first)) return { kind: 'new_session', providerId: null, cwd: first };
    return { kind: 'chat', text };
  }

  if (command === '/use') {
    const providerId = parseProvider(first);
    return providerId ? { kind: 'use_provider', providerId } : { kind: 'chat', text };
  }

  if ((command === '/approve' || command === '/deny' || command === '/abort') && first) {
    const decision = command.slice(1) as 'approve' | 'deny' | 'abort';
    return { kind: 'permission_decision', requestId: first, decision };
  }

  if (command === '/always' && first) {
    return { kind: 'permission_decision', requestId: first, decision: 'approve_for_session' };
  }

  return { kind: 'chat', text };
}
