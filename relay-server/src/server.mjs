import http from 'node:http';
import { WebSocketServer } from 'ws';
import { signAccessCodePayload } from './activationSigning.mjs';
import { renderAdminPage } from './adminPage.mjs';
import { createDomainRegistry } from './domainRegistry.mjs';
import { parseRelayMessage } from './protocol.mjs';
import { appendTokenToFile, createClientToken, isValidClientToken } from './tokenManager.mjs';
import { createWsRegistry } from './wsRegistry.mjs';

export async function startRelayServer(input) {
  const { port, baseDomain, authTokens, authTokensFile, adminToken } = input;
  // Prefer the new internal name, but keep reading the historical input key for compatibility.
  const accessCodeSecret = input.accessCodeSecret ?? input.activationSecret;
  const relayServerUrl = input.relayServerUrl ?? (baseDomain ? `wss://${baseDomain}/agent` : undefined);
  const domainRegistry = createDomainRegistry({
    resolvePublicBaseUrl(metadata = {}) {
      if (baseDomain) return `https://${baseDomain}`;
      if (typeof metadata.relayServerUrl === 'string' && metadata.relayServerUrl) {
        return metadata.relayServerUrl
          .replace(/^ws:\/\//, 'http://')
          .replace(/^wss:\/\//, 'https://')
          .replace(/\/agent\/?$/, '');
      }
      throw new Error('public_base_url_unavailable');
    },
  });
  const wsRegistry = createWsRegistry();
  const pendingResponses = new Map();
  let nextRequestId = 1;

  const server = http.createServer((req, res) => {
    if (isProtectedAdminApiRequest(req.url) && !isAuthorizedAdminRequest(req.headers.authorization, adminToken)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'admin_unauthorized' }));
      return;
    }
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/admin') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderAdminPage({ adminToken }));
      return;
    }
    if (req.method === 'POST' && req.url === '/admin/tokens') {
      const token = createClientToken();
      const result = authTokensFile
        ? appendTokenToFile({ filePath: authTokensFile, token })
        : { created: false, added: false, tokens: [token] };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        token,
        totalTokens: result.tokens.length,
      }));
      return;
    }
    // Keep the historical route for compatibility; the UI presents this as an access code action.
    if (req.method === 'POST' && req.url === '/admin/activation-code') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const authToken = String(payload.authToken ?? '').trim();
        if (!authToken || !isValidClientToken(authToken) || !accessCodeSecret) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'auth_token_not_found' }));
          return;
        }
        const accessCode = signAccessCodePayload({
          version: 1,
          serverUrl: relayServerUrl,
          authToken,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        }, accessCodeSecret);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          accessCode,
          // Keep the legacy field for older clients.
          activationCode: accessCode,
        }));
      });
      return;
    }
    if (req.url === '/connections') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        connections: Array.from(wsRegistry.entries()).map(([connectionId, record]) => ({
          authToken: record.authToken,
          publicUrl: record.publicUrl,
        })),
      }));
      return;
    }
    const disconnectByAuthTokenMatch = String(req.url ?? '').match(/^\/connections\/auth-token\/([^/]+)\/disconnect$/);
    if (req.method === 'POST' && disconnectByAuthTokenMatch?.[1]) {
      const authToken = decodeURIComponent(disconnectByAuthTokenMatch[1]);
      const connection = wsRegistry.getByAuthToken(authToken);
      if (!connection) {
        res.writeHead(404);
        res.end('not_found');
        return;
      }
      connection.socket.close();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const disconnectMatch = String(req.url ?? '').match(/^\/connections\/([^/]+)\/disconnect$/);
    if (req.method === 'POST' && disconnectMatch?.[1]) {
      const connection = wsRegistry.get(disconnectMatch[1]);
      if (!connection) {
        res.writeHead(404);
        res.end('not_found');
        return;
      }
      connection.socket.close();
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
    const connection = wsRegistry.get(connectionId);
    const socket = connection?.socket ?? null;
    if (!socket || socket.readyState !== 1) {
      res.writeHead(502);
      res.end('agent_unavailable');
      return;
    }
    const requestId = `req_${nextRequestId++}`;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      connection.lastSeenAt = Date.now();
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
        const existingConnectionId = wsRegistry.lookupConnectionIdByAuthToken(message.authToken);
        if (existingConnectionId) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'auth_token_in_use',
          }));
          ws.close();
          return;
        }
        connectionId = `conn_${Math.random().toString(36).slice(2, 10)}`;
        const allocation = domainRegistry.allocate(connectionId, {
          relayServerUrl,
        });
        wsRegistry.set(connectionId, {
          socket: ws,
          authToken: message.authToken,
          publicUrl: allocation.publicUrl,
          targetBaseUrl: message.targetBaseUrl,
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
        });
        ws.send(JSON.stringify({
          type: 'registered',
          connectionId,
          token: allocation.token,
        }));
        return;
      }
      if (message.type === 'response') {
        if (connectionId) {
          const connection = wsRegistry.get(connectionId);
          if (connection) connection.lastSeenAt = Date.now();
        }
        const pending = pendingResponses.get(message.requestId);
        if (!pending) return;
        pendingResponses.delete(message.requestId);
        const responseBuffer = Buffer.from(String(message.bodyBase64 ?? ''), 'base64');
        const relayToken = connectionId ? domainRegistry.lookupAllocation(connectionId)?.token : null;
        const rewritten = rewriteTextResponseForRelayPrefix({
          headers: message.headers ?? {},
          body: responseBuffer,
          relayToken,
        });
        pending.res.writeHead(message.status ?? 200, rewritten.headers);
        pending.res.end(rewritten.body);
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
      for (const [, record] of wsRegistry.entries()) {
        record.socket.close();
      }
      await new Promise((resolve) => wss.close(() => resolve(undefined)));
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
    },
  };
}

function isProtectedAdminApiRequest(url) {
  return String(url ?? '').startsWith('/admin/')
    || url === '/connections'
    || String(url ?? '').startsWith('/connections/');
}

function isAuthorizedAdminRequest(header, adminToken) {
  if (!adminToken) return true;
  if (typeof header !== 'string') return false;
  return header === `Bearer ${adminToken}`;
}

function rewriteTextResponseForRelayPrefix(input) {
  const headers = { ...input.headers };
  const contentType = String(headers['content-type'] ?? headers['Content-Type'] ?? '');
  if (!input.relayToken || !shouldRewriteTextResponse(contentType)) {
    return { headers, body: input.body };
  }

  const prefix = `/${input.relayToken}`;
  const originalText = input.body.toString('utf8');
  const htmlRewritten = /text\/html/i.test(contentType)
    ? originalText
        .replace(
          /((?:src|href|action)=["'])\/(?!\/|#)/g,
          `$1${prefix}/`,
        )
        .replace(
          /((?:import\s+(?:[^'"]+?\s+from\s+)?|import\s*\(|export\s+[^'"]+?\s+from\s+|from\s+))(["'])\/(?!\/|#)/g,
          `$1$2${prefix}/`,
        )
    : originalText;
  const rewrittenText = /javascript|ecmascript|text\/css/i.test(contentType)
    ? htmlRewritten.replace(
        /((?:import\s+(?:[^'"]+?\s+from\s+)?|import\s*\(|export\s+[^'"]+?\s+from\s+|from\s+|url\(\s*))(["'])\/(?!\/|#)/g,
        `$1$2${prefix}/`,
      ).replace(
        /((?:new\s+URL\s*\(\s*|createHotContext\(\s*))(["'])\/(?!\/|#)/g,
        `$1$2${prefix}/`,
      ).replace(
        /(const\s+__vite__css\s*=\s*")((?:[^"\\]|\\.)*)(")/g,
        (_match, start, cssPayload, end) => {
          const rewrittenPayload = cssPayload.replace(
            /(url\(\s*\\?["'])\/(?!\/|#)/g,
            `$1${prefix}/`,
          );
          return `${start}${rewrittenPayload}${end}`;
        },
      )
    : htmlRewritten;

  if (rewrittenText === originalText) {
    return { headers, body: input.body };
  }

  const body = Buffer.from(rewrittenText, 'utf8');
  delete headers['content-length'];
  delete headers['Content-Length'];
  headers['content-length'] = String(body.byteLength);
  return { headers, body };
}

function shouldRewriteTextResponse(contentType) {
  return /text\/html/i.test(contentType)
    || /javascript/i.test(contentType)
    || /ecmascript/i.test(contentType)
    || /text\/css/i.test(contentType);
}
