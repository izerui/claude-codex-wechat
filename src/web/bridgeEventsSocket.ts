import { resolveApiUrl } from './apiClient';
import type { BridgeWsEvent } from './apiClient';

type Listener = (event: BridgeWsEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;

const CLOSE_DEBOUNCE_MS = 500;
const MAX_RECONNECT_DELAY_MS = 15000;

function wsUrl(): string {
  return resolveApiUrl('/api/bridge-ws').replace(/^http/, 'ws');
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const next = new WebSocket(wsUrl());
  socket = next;
  next.addEventListener('open', () => {
    reconnectDelay = 1000;
  });
  next.addEventListener('message', (event) => {
    let payload: BridgeWsEvent;
    try {
      payload = JSON.parse(event.data) as BridgeWsEvent;
    } catch {
      return;
    }
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // a failing listener must not break others
      }
    }
  });
  const onGone = () => {
    if (socket === next) socket = null;
    if (listeners.size > 0) scheduleReconnect();
  };
  next.addEventListener('close', onGone);
  next.addEventListener('error', onGone);
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (listeners.size > 0) connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
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
      // debounce close so StrictMode's mount/unmount/mount cycle reuses the socket
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (listeners.size > 0) return;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        socket?.close();
        socket = null;
      }, CLOSE_DEBOUNCE_MS);
    }
  };
}
