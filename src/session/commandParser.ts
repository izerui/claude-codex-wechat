import type { ProviderId } from '../providers/types';

export type BridgeCommand =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'new_session'; providerId: ProviderId | null; cwd: string | null }
  | { kind: 'list_sessions'; scope: 'all'; keyword: string | null; page: number }
  | { kind: 'resume_session'; ref: string }
  | { kind: 'reload_session' }
  | { kind: 'cancel_generation' }
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
    let page = 1;
    let parts = rest;
    const last = rest.at(-1);
    if (last && /^p[1-9]\d*$/i.test(last)) {
      page = Number.parseInt(last.slice(1), 10);
      parts = rest.slice(0, -1);
    }
    const keyword = parts.join(' ').trim();
    return { kind: 'list_sessions', scope: 'all', keyword: keyword || null, page };
  }

  if (command === '/resume') {
    return { kind: 'resume_session', ref: first ?? '' };
  }

  if (command === '/reload') {
    return { kind: 'reload_session' };
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

  return { kind: 'chat', text };
}
