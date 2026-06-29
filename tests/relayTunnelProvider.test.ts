import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { RelayTunnelProvider } from '../src/runtime/relayTunnelProvider';

class FakeSocket extends EventEmitter {
  sent: string[] = [];
  readyState = 1;

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

describe('RelayTunnelProvider', () => {
  it('connects, registers, and stores the registered public URL', async () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket as never);
    const provider = new RelayTunnelProvider({
      serverUrl: 'wss://relay.style520.com/agent',
      authToken: 'clrt_1234567890abcdef12345678',
      targetBaseUrl: 'http://127.0.0.1:8787',
      createSocket,
    });

    const startPromise = provider.start();
    socket.emit('open');
    socket.emit('message', JSON.stringify({
      type: 'registered',
      connectionId: 'conn-1',
      token: 'sjdfh2xxx',
    }));
    const status = await startPromise;

    expect(createSocket).toHaveBeenCalledWith('wss://relay.style520.com/agent');
    expect(socket.sent[0]).toContain('"type":"register"');
    expect(socket.sent[0]).not.toContain('"clientInstanceId"');
    expect(socket.sent[0]).toContain('"authToken":"clrt_1234567890abcdef12345678"');
    expect(status).toMatchObject({
      installed: true,
      running: true,
      status: 'running',
      publicUrl: 'https://relay.style520.com/sjdfh2xxx',
    });
  });

  it('proxies request messages to the local target and sends a response envelope back', async () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket as never);
    const fetchLocal = vi.fn(async () => new Response('ok', {
      status: 201,
      headers: {
        'content-type': 'text/plain',
      },
    }));
    const provider = new RelayTunnelProvider({
      serverUrl: 'wss://relay.style520.com/agent',
      authToken: 'clrt_1234567890abcdef12345678',
      targetBaseUrl: 'http://127.0.0.1:8787',
      createSocket,
      fetchImpl: fetchLocal as typeof fetch,
    });

    const startPromise = provider.start();
    socket.emit('open');
    socket.emit('message', JSON.stringify({
      type: 'registered',
      connectionId: 'conn-1',
      token: 'sjdfh2xxx',
    }));
    await startPromise;

    socket.emit('message', JSON.stringify({
      type: 'request',
      requestId: 'req-1',
      method: 'GET',
      path: '/api/status',
      headers: {
        accept: 'application/json',
      },
      bodyBase64: '',
    }));

    expect(fetchLocal).toHaveBeenCalledWith('http://127.0.0.1:8787/api/status', expect.objectContaining({
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    }));
    await vi.waitFor(() => {
      expect(socket.sent.at(-1)).toContain('"type":"response"');
      expect(socket.sent.at(-1)).toContain('"requestId":"req-1"');
      expect(socket.sent.at(-1)).toContain('"status":201');
    });
  });

  it('fails startup when the relay socket closes before registration completes', async () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket as never);
    const provider = new RelayTunnelProvider({
      serverUrl: 'wss://relay.style520.com/agent',
      authToken: 'clrt_1234567890abcdef12345678',
      targetBaseUrl: 'http://127.0.0.1:8787',
      createSocket,
    });

    const startPromise = provider.start();
    socket.emit('open');
    socket.emit('close');

    await expect(startPromise).rejects.toThrow(/relay_disconnected/);
    await expect(provider.getStatus()).resolves.toMatchObject({
      running: false,
      status: 'error',
      error: 'relay_disconnected',
    });
  });

  it('auto-reconnects after the relay drops and re-registers (stable URL preserved)', async () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const createSocket = vi.fn(() => {
        const s = new FakeSocket();
        sockets.push(s);
        return s as never;
      });
      const provider = new RelayTunnelProvider({
        serverUrl: 'wss://relay.style520.com/agent',
        authToken: 'clrt_1234567890abcdef12345678',
        targetBaseUrl: 'http://127.0.0.1:8787',
        createSocket,
        maxReconnectDelayMs: 5000,
      });

      const startPromise = provider.start();
      sockets[0].emit('open');
      sockets[0].emit('message', JSON.stringify({ type: 'registered', token: 'fixed-suffix' }));
      await startPromise;
      expect(createSocket).toHaveBeenCalledTimes(1);

      // relay-server 重启 → 连接断开
      sockets[0].emit('close');
      await expect(provider.getStatus()).resolves.toMatchObject({ status: 'error', error: 'relay_disconnected' });

      // 退避计时器触发，自动发起新连接
      await vi.advanceTimersByTimeAsync(1000);
      expect(createSocket).toHaveBeenCalledTimes(2);
      sockets[1].emit('open');
      sockets[1].emit('message', JSON.stringify({ type: 'registered', token: 'fixed-suffix' }));

      await expect(provider.getStatus()).resolves.toMatchObject({
        running: true,
        status: 'running',
        publicUrl: 'https://relay.style520.com/fixed-suffix',
      });

      await provider.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconnect after stop()', async () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const createSocket = vi.fn(() => {
        const s = new FakeSocket();
        sockets.push(s);
        return s as never;
      });
      const provider = new RelayTunnelProvider({
        serverUrl: 'wss://relay.style520.com/agent',
        authToken: 'clrt_1234567890abcdef12345678',
        targetBaseUrl: 'http://127.0.0.1:8787',
        createSocket,
      });

      const startPromise = provider.start();
      sockets[0].emit('open');
      sockets[0].emit('message', JSON.stringify({ type: 'registered', token: 'tok' }));
      await startPromise;

      await provider.stop();
      sockets[0].emit('close');
      await vi.advanceTimersByTimeAsync(60_000);

      expect(createSocket).toHaveBeenCalledTimes(1);
      await expect(provider.getStatus()).resolves.toMatchObject({ status: 'stopped', running: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
