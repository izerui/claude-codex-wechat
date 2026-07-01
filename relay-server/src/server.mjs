import http from 'node:http';
import { WebSocketServer } from 'ws';
import { renderAdminPage } from './adminPage.mjs';
import { createDomainRegistry } from './domainRegistry.mjs';
import { renderLandingPage } from './landingPage.mjs';
import { parseRelayMessage } from './protocol.mjs';
import { appendTokenToFile, createClientToken } from './tokenManager.mjs';
import { createWsRegistry } from './wsRegistry.mjs';

export async function startRelayServer(input) {
  const { host = '0.0.0.0', port, authTokens, authTokensFile, adminToken } = input;
  const requestTimeoutMs = Number.isFinite(input.requestTimeoutMs) && input.requestTimeoutMs > 0
    ? input.requestTimeoutMs
    : 30_000;
  const heartbeatIntervalMs = Number.isFinite(input.heartbeatIntervalMs) && input.heartbeatIntervalMs > 0
    ? input.heartbeatIntervalMs
    : 30_000;
  const domainRegistry = createDomainRegistry({});
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
    if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderLandingPage());
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
    if (req.url === '/connections') {
      const publicBaseUrl = derivePublicBaseUrlFromRequest(req);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        connections: Array.from(wsRegistry.entries()).map(([connectionId, record]) => ({
          authToken: record.authToken,
          ...(publicBaseUrl ? { publicUrl: `${publicBaseUrl}/${domainRegistry.lookupAllocation(connectionId)?.token}` } : {}),
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
      const timeout = setTimeout(() => {
        const pending = pendingResponses.get(requestId);
        if (!pending) return;
        pendingResponses.delete(requestId);
        if (!pending.res.headersSent) pending.res.writeHead(504);
        pending.res.end('agent_timeout');
      }, requestTimeoutMs);
      pendingResponses.set(requestId, { res, connectionId, timeout });
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
  // 周期性 ping 所有 agent 连接：既给空闲隧道注入流量、避免被 NAT / 云网关静默回收，
  // 又能探测“半开”死连接——未在一个周期内回 pong 的连接会被 terminate，从而触发其
  // close 处理、及时释放 authToken 与域名分配，避免残留注册项卡死后续重连。
  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        // 发送失败说明连接已坏，下一轮会被 terminate。
      }
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();
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
    // 心跳存活标记：每收到一个 pong 就续命；心跳定时器会把它复位为 false 再 ping。
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => {
      let message;
      try {
        message = parseRelayMessage(String(raw));
      } catch {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'invalid_message',
        }));
        ws.close();
        return;
      }
      if (message.type === 'register') {
        const existingConnectionId = wsRegistry.lookupConnectionIdByAuthToken(message.authToken);
        if (existingConnectionId) {
          // 同一 authToken 重连：旧连接往往是网络静默中断后残留的“半开”注册项，
          // 服务端还没收到它的 close。直接顶替——先同步释放旧的域名分配与注册项，
          // 再关闭旧 socket，让最新的客户端接管。否则重连会被 auth_token_in_use
          // 拒死，必须重启进程才能恢复。先 release 旧分配再分配新连接，能让确定性
          // 派生的公网 token 原样保留、地址保持稳定。
          const stale = wsRegistry.get(existingConnectionId);
          domainRegistry.release(existingConnectionId);
          wsRegistry.delete(existingConnectionId);
          try {
            stale?.socket.close();
          } catch {
            // 旧 socket 可能已断开，忽略。
          }
        }
        connectionId = `conn_${Math.random().toString(36).slice(2, 10)}`;
        const allocation = domainRegistry.allocate(connectionId, {
          authToken: message.authToken,
        });
        wsRegistry.set(connectionId, {
          socket: ws,
          authToken: message.authToken,
          ...(allocation.publicUrl ? { publicUrl: allocation.publicUrl } : {}),
          targetBaseUrl: message.targetBaseUrl,
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
        });
        ws.send(JSON.stringify({
          type: 'registered',
          connectionId,
          token: allocation.token,
          // 能力协商:向客户端宣告本服务器支持流式转发。老客户端会忽略该字段;
          // 新客户端据此决定走流式(response-start/chunk/end)还是退回缓冲(response)。
          streaming: true,
          ...(allocation.publicUrl ? { publicUrl: allocation.publicUrl } : {}),
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
        clearTimeout(pending.timeout);
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
      // 流式转发:客户端把每个响应拆成 response-start → response-chunk* → response-end 三段。
      // 服务器按 content-type 分流:
      //   - 需要重写的 html/js/css：攒齐 body，收到 response-end 后复用整体重写函数（与缓冲路径
      //     完全一致，重写正则物理上必须看到完整 body），零回归。
      //   - 其余（SSE / JSON / 图片 / 下载）：真流式透传，收到 chunk 立即 res.write，SSE 长连接
      //     不受请求超时约束。
      if (message.type === 'response-start') {
        if (connectionId) {
          const connection = wsRegistry.get(connectionId);
          if (connection) connection.lastSeenAt = Date.now();
        }
        const pending = pendingResponses.get(message.requestId);
        if (!pending) return;
        const headers = message.headers ?? {};
        const contentType = String(headers['content-type'] ?? headers['Content-Type'] ?? '');
        if (shouldRewriteTextResponse(contentType)) {
          // 需重写：暂存头与状态，攒 body 到 response-end。沿用现有“等完整响应”的超时语义
          // （有限响应会及时 end），不在此清 timeout。
          pending.rewriteBuffer = [];
          pending.startStatus = message.status ?? 200;
          pending.startHeaders = headers;
        } else {
          // 真流式透传：首字节已到，取消缓冲超时；后续 chunk 直接下发。
          clearTimeout(pending.timeout);
          pending.streaming = true;
          pending.res.writeHead(message.status ?? 200, headers);
        }
        return;
      }
      if (message.type === 'response-chunk') {
        if (connectionId) {
          const connection = wsRegistry.get(connectionId);
          if (connection) connection.lastSeenAt = Date.now();
        }
        const pending = pendingResponses.get(message.requestId);
        if (!pending) return;
        const chunk = Buffer.from(String(message.chunkBase64 ?? ''), 'base64');
        if (pending.streaming) {
          pending.res.write(chunk);
        } else if (pending.rewriteBuffer) {
          pending.rewriteBuffer.push(chunk);
        }
        return;
      }
      if (message.type === 'response-end') {
        if (connectionId) {
          const connection = wsRegistry.get(connectionId);
          if (connection) connection.lastSeenAt = Date.now();
        }
        const pending = pendingResponses.get(message.requestId);
        if (!pending) return;
        pendingResponses.delete(message.requestId);
        clearTimeout(pending.timeout);
        if (pending.streaming) {
          pending.res.end();
          return;
        }
        // 重写模式：拿到完整 body，走与缓冲路径完全相同的整体重写。
        const responseBuffer = Buffer.concat(pending.rewriteBuffer ?? []);
        const relayToken = connectionId ? domainRegistry.lookupAllocation(connectionId)?.token : null;
        const rewritten = rewriteTextResponseForRelayPrefix({
          headers: pending.startHeaders ?? {},
          body: responseBuffer,
          relayToken,
        });
        pending.res.writeHead(pending.startStatus ?? 200, rewritten.headers);
        pending.res.end(rewritten.body);
      }
    });
    ws.on('close', () => {
      if (connectionId) {
        for (const [requestId, pending] of pendingResponses.entries()) {
          if (pending.connectionId !== connectionId) continue;
          pendingResponses.delete(requestId);
          clearTimeout(pending.timeout);
          // 流式透传已发过头,不能再改状态码,也不该把错误文本追加进流末尾——直接干净收尾。
          // 缓冲/重写模式尚未发头,回 502 告知上游 agent 断线。
          if (!pending.res.headersSent) {
            pending.res.writeHead(502);
            pending.res.end('agent_disconnected');
          } else {
            pending.res.end();
          }
        }
      }
      if (!connectionId) return;
      domainRegistry.release(connectionId);
      wsRegistry.delete(connectionId);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    port: actualPort,
    close: async () => {
      clearInterval(heartbeatTimer);
      for (const [requestId, pending] of pendingResponses.entries()) {
        pendingResponses.delete(requestId);
        clearTimeout(pending.timeout);
        if (!pending.res.headersSent) {
          pending.res.writeHead(503);
          pending.res.end('relay_shutdown');
        } else {
          pending.res.end();
        }
      }
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

function derivePublicBaseUrlFromRequest(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] ?? '').split(',')[0]?.trim();
  const host = forwardedHost || String(req.headers.host ?? '').trim();
  if (!host) return '';
  const proto = forwardedProto || 'http';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

export function rewriteTextResponseForRelayPrefix(input) {
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
        /((?:import\s+(?:[^'"]+?\s+from\s+)?|import\s*\(|export\s+[^'"]+?\s+from\s+|from\s+))(["'])\/(?!\/|#)/g,
        `$1$2${prefix}/`,
      ).replace(
        // CSS 的 url() 引号可选：Vite 打包产物里字体/图片是无引号的 url(/assets/...)，
        // 强制引号的旧正则会漏掉它们，导致子路径代理下字体图标 404、图标不显示。
        /(url\(\s*["']?)\/(?!\/|#)/g,
        `$1${prefix}/`,
      ).replace(
        /((?:new\s+URL\s*\(\s*|createHotContext\(\s*))(["'])\/(?!\/|#)/g,
        `$1$2${prefix}/`,
      ).replace(
        /(const\s+__vite__css\s*=\s*")((?:[^"\\]|\\.)*)(")/g,
        (_match, start, cssPayload, end) => {
          const rewrittenPayload = cssPayload.replace(
            /(url\(\s*\\?["']?)\/(?!\/|#)/g,
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
