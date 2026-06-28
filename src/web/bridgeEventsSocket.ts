import { fetchEventSource } from '@microsoft/fetch-event-source';
import { resolveApiUrl } from './apiClient';
import type { BridgeWsEvent } from './apiClient';

type Listener = (event: BridgeWsEvent) => void;

const listeners = new Set<Listener>();
let controller: AbortController | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const CLOSE_DEBOUNCE_MS = 500;

function dispatch(event: BridgeWsEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // a failing listener must not break others
    }
  }
}

function connect(): void {
  if (controller) return;
  const next = new AbortController();
  controller = next;
  void fetchEventSource(resolveApiUrl('/api/bridge-events'), {
    method: 'POST',
    signal: next.signal,
    openWhenHidden: true,
    onmessage(message) {
      if (!message.data) return;
      let payload: BridgeWsEvent;
      try {
        payload = JSON.parse(message.data) as BridgeWsEvent;
      } catch {
        return;
      }
      if (payload.type === 'connected' || payload.type === 'ping') return;
      dispatch(payload);
    },
    onerror(err) {
      throw err;
    },
  }).catch(() => {
    if (controller === next) controller = null;
    if (listeners.size > 0) setTimeout(connect, 2000);
  });
}

export function subscribeBridgeEvents(listener: Listener): () => void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      // debounce close so StrictMode's mount/unmount/mount cycle reuses the stream
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (listeners.size > 0) return;
        controller?.abort();
        controller = null;
      }, CLOSE_DEBOUNCE_MS);
    }
  };
}

// Test-only escape hatch for resetting this module-level singleton between cases.
export function resetBridgeEventsForTests(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  listeners.clear();
  controller?.abort();
  controller = null;
}
