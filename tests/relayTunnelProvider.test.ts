import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { RelayTunnelProvider } from '../src/runtime/relayTunnelProvider';

class FakeSocket extends EventEmitter {
  sent: string[] = [];
  readyState = 1;
  throwOnSend = false;

  send(payload: string) {
    if (this.throwOnSend) throw new Error('Sent before connected.');
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

  it('does not crash when the relay socket is not open while replying (guards send)', async () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket as never);
    const fetchLocal = vi.fn(async () => new Response('body', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const provider = new RelayTunnelProvider({
      serverUrl: 'wss://relay.style520.com/agent',
      authToken: 'clrt_1234567890abcdef12345678',
      targetBaseUrl: 'http://127.0.0.1:8787',
      createSocket,
      fetchImpl: fetchLocal as typeof fetch,
    });

    const startPromise = provider.start();
    socket.emit('open');
    socket.emit('message', JSON.stringify({ type: 'registered', token: 'tok', streaming: true }));
    await startPromise;

    // 模拟中转掉线 / 重连中:socket 未就绪。回传不能崩，也不该发出任何帧。
    socket.readyState = 0;
    socket.sent.length = 0;
    socket.emit('message', JSON.stringify({ type: 'request', requestId: 'req-x', method: 'GET', path: '/x' }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(socket.sent).toEqual([]);

    // 恢复 OPEN 后仍能正常回传，证明连接可继续工作。
    socket.readyState = 1;
    socket.emit('message', JSON.stringify({ type: 'request', requestId: 'req-y', method: 'GET', path: '/y' }));
    await vi.waitFor(() => {
      expect(socket.sent.some((f) => f.includes('"requestId":"req-y"'))).toBe(true);
    });
  });

  it('swallows a synchronous send failure during reply without crashing', async () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket as never);
    const fetchLocal = vi.fn(async () => new Response('body', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const provider = new RelayTunnelProvider({
      serverUrl: 'wss://relay.style520.com/agent',
      authToken: 'clrt_1234567890abcdef12345678',
      targetBaseUrl: 'http://127.0.0.1:8787',
      createSocket,
      fetchImpl: fetchLocal as typeof fetch,
    });

    const startPromise = provider.start();
    socket.emit('open');
    socket.emit('message', JSON.stringify({ type: 'registered', token: 'tok', streaming: true }));
    await startPromise;

    // readyState 仍是 OPEN，但底层 send 抛错(模拟 undici 的 InvalidStateError)。
    socket.throwOnSend = true;
    socket.sent.length = 0;
    socket.emit('message', JSON.stringify({ type: 'request', requestId: 'req-z', method: 'GET', path: '/z' }));
    // 若异常未被吞掉，未捕获 rejection 会让测试进程报错;这里只需正常走完。
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(socket.sent).toEqual([]);
    // send 真抛错说明 socket 已坏:主动回收连接(close),由 close 事件驱动重连。
    expect(socket.readyState).toBe(3);
  });

  it('replies 502 to the relay when the local fetch fails, instead of hanging', async () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket as never);
    const fetchLocal = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const provider = new RelayTunnelProvider({
      serverUrl: 'wss://relay.style520.com/agent',
      authToken: 'clrt_1234567890abcdef12345678',
      targetBaseUrl: 'http://127.0.0.1:8787',
      createSocket,
      fetchImpl: fetchLocal as typeof fetch,
    });

    const startPromise = provider.start();
    socket.emit('open');
    socket.emit('message', JSON.stringify({ type: 'registered', token: 'tok', streaming: true }));
    await startPromise;

    socket.sent.length = 0;
    socket.emit('message', JSON.stringify({ type: 'request', requestId: 'req-e', method: 'GET', path: '/x' }));
    // 本地 fetch 失败 → 立即回一个 502 response 结束这单，而不是让服务端干等超时。
    await vi.waitFor(() => {
      const frame = socket.sent.find((f) => f.includes('"requestId":"req-e"'));
      expect(frame).toBeDefined();
      expect(frame).toContain('"type":"response"');
      expect(frame).toContain('"status":502');
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
