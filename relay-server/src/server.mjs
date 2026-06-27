import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createDomainRegistry } from './domainRegistry.mjs';
import { parseRelayMessage } from './protocol.mjs';
import { createWsRegistry } from './wsRegistry.mjs';

export async function startRelayServer(input) {
  const { port, baseDomain, authToken } = input;
  const domainRegistry = createDomainRegistry({ baseDomain });
  const wsRegistry = createWsRegistry();
  const pendingResponses = new Map();
  let nextRequestId = 1;

  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const path = String(req.url ?? '/');
    const token = path.split('/').filter(Boolean)[0] ?? '';
    const connectionId = domainRegistry.lookupByToken(token);
    if (!connectionId) {
      res.writeHead(404);
      res.end('not_found');
      return;
    }
    const socket = wsRegistry.get(connectionId);
    if (!socket || socket.readyState !== 1) {
      res.writeHead(502);
      res.end('agent_unavailable');
      return;
    }
    const requestId = `req_${nextRequestId++}`;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      pendingResponses.set(requestId, { res });
      socket.send(JSON.stringify({
        type: 'request',
        requestId,
        method: req.method ?? 'GET',
        path: `/${path.split('/').filter(Boolean).slice(1).join('/')}` || '/',
        headers: req.headers,
        bodyBase64: Buffer.concat(chunks).toString('base64'),
      }));
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/agent') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    let connectionId = null;
    ws.on('message', (raw) => {
      const message = parseRelayMessage(String(raw));
      if (message.type === 'register') {
        if (message.authToken !== authToken) {
          ws.close();
          return;
        }
        connectionId = `conn_${Math.random().toString(36).slice(2, 10)}`;
        const allocation = domainRegistry.allocate(connectionId);
        wsRegistry.set(connectionId, ws);
        ws.send(JSON.stringify({
          type: 'registered',
          connectionId,
          token: allocation.token,
          publicUrl: allocation.publicUrl,
        }));
        return;
      }
      if (message.type === 'response') {
        const pending = pendingResponses.get(message.requestId);
        if (!pending) return;
        pendingResponses.delete(message.requestId);
        pending.res.writeHead(message.status ?? 200, message.headers ?? {});
        pending.res.end(Buffer.from(String(message.bodyBase64 ?? ''), 'base64'));
      }
    });
    ws.on('close', () => {
      if (!connectionId) return;
      domainRegistry.release(connectionId);
      wsRegistry.delete(connectionId);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    port: actualPort,
    close: async () => {
      for (const [, socket] of wsRegistry.entries()) {
        socket.close();
      }
      await new Promise((resolve) => wss.close(() => resolve(undefined)));
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
    },
  };
}
