import type { PermissionChoice, ProviderId } from '../providers/types';

export type BridgeCommand =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'new_session'; providerId: ProviderId }
  | { kind: 'use_provider'; providerId: ProviderId }
  | { kind: 'set_cwd'; cwd: string }
  | { kind: 'stop' }
  | { kind: 'permission_decision'; requestId: string; decision: Exclude<PermissionChoice, 'approve_for_session'> }
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

  if (command === '/new') {
    const providerId = parseProvider(first);
    return providerId ? { kind: 'new_session', providerId } : { kind: 'chat', text };
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

  return { kind: 'chat', text };
}
