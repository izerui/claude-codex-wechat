import type { PermissionChoice, ProviderId } from '../providers/types';

export type BridgeCommand =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'new_session'; providerId: ProviderId | null }
  | { kind: 'use_provider'; providerId: ProviderId }
  | { kind: 'set_cwd'; cwd: string }
  | { kind: 'stop' }
  | { kind: 'reload' }
  | { kind: 'list_sessions'; scope: 'all' | 'mine'; keyword: string | null }
  | { kind: 'resume_session'; ref: string }
  | { kind: 'archive_session'; ref: string }
  | { kind: 'permission_decision'; requestId: string; decision: PermissionChoice }
  | { kind: 'chat'; text: string };

function parseProvider(value: string | undefined): ProviderId | null {
  if (value === 'claude' || value === 'claude-code') return 'claude-code';
  if (value === 'codex') return 'codex';
  return null;
}

export function parseBridgeCommand(input: string): BridgeCommand {
  const text = input.trim();
  if (!text.startsWith('/')) return { kind: 'chat', text };

  const [command, ...rest] = text.split(/\s+/);
  const first = rest[0];

  if (command === '/help') return { kind: 'help' };
  if (command === '/status') return { kind: 'status' };
  if (command === '/stop') return { kind: 'stop' };
  if (command === '/reload') return { kind: 'reload' };

  if (command === '/sessions') {
    if (first === 'mine') return { kind: 'list_sessions', scope: 'mine', keyword: null };
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
    const providerId = parseProvider(first);
    return first ? (providerId ? { kind: 'new_session', providerId } : { kind: 'chat', text }) : { kind: 'new_session', providerId: null };
  }

  if (command === '/use') {
    const providerId = parseProvider(first);
    return providerId ? { kind: 'use_provider', providerId } : { kind: 'chat', text };
  }

  if (command === '/cwd') {
    const cwd = text.slice('/cwd'.length).trim();
    return cwd ? { kind: 'set_cwd', cwd } : { kind: 'chat', text };
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
