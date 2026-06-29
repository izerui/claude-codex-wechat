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
      authToken: 'relay-token',
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
    expect(socket.sent[0]).toContain('"authToken":"relay-token"');
    expect(status).toMatchObject({
      installed: true,
      enabled: true,
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
      authToken: 'relay-token',
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
      authToken: 'relay-token',
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
});
