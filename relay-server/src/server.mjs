import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createDomainRegistry } from './domainRegistry.mjs';
import { renderLandingPage } from './landingPage.mjs';
import { parseRelayMessage } from './protocol.mjs';
import { createTicketAuth, SESSION_COOKIE_NAME } from './ticketAuth.mjs';
import { createWsRegistry } from './wsRegistry.mjs';

export async function startRelayServer(input) {
  const { host = '0.0.0.0', port, wechatOnly = false, ticketAuth: ticketAuthEnabled = false, publicBaseUrl, ticketAuthOptions } = input;
  const requestTimeoutMs = Number.isFinite(input.requestTimeoutMs) && input.requestTimeoutMs > 0
    ? input.requestTimeoutMs
    : 30_000;
  const heartbeatIntervalMs = Number.isFinite(input.heartbeatIntervalMs) && input.heartbeatIntervalMs > 0
    ? input.heartbeatIntervalMs
    : 30_000;
  const domainRegistry = createDomainRegistry({});
  const wsRegistry = createWsRegistry();
  const pendingResponses = new Map();
  const ticketAuth = createTicketAuth(ticketAuthOptions);
  let nextRequestId = 1;

  // 向客户端下发（或重新推送）registered。所有版本的客户端都会用其中的 publicUrl 覆盖本地公网地址，
  // /help 回复的就是它——票据因此能在不改客户端的前提下送到绑定的微信里。
  function sendRegistered(connectionId) {
    const record = wsRegistry.get(connectionId);
    const allocation = domainRegistry.lookupAllocation(connectionId);
    if (!record || !allocation) return;
    let publicUrl = allocation.publicUrl;
    if (ticketAuthEnabled && record.publicBase) {
      const ticket = ticketAuth.currentTicket(record.authToken) ?? ticketAuth.issueTicket(record.authToken);
      publicUrl = `${record.publicBase}/${allocation.token}/?ticket=${ticket}`;
    }
    try {
      record.socket.send(JSON.stringify({
        type: 'registered',
        connectionId,
        token: allocation.token,
        // 能力协商:向客户端宣告本服务器支持流式转发。老客户端会忽略该字段;
        // 新客户端据此决定走流式(response-start/chunk/end)还是退回缓冲(response)。
        streaming: true,
        ...(publicUrl ? { publicUrl } : {}),
      }));
    } catch {
      // 连接已坏，close 处理会负责清理。
    }
  }

  // 过期票据换新并推送，保证用户任何时候发 /help 拿到的都是可用链接；顺带清理过期会话。
  function refreshExpiredTickets() {
    for (const authToken of ticketAuth.takeExpiredTicketOwners()) {
      const connectionId = wsRegistry.lookupConnectionIdByAuthToken(authToken);
      if (!connectionId) continue;
      ticketAuth.issueTicket(authToken);
      sendRegistered(connectionId);
    }
    ticketAuth.sweep();
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/' || req.url === '') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderLandingPage({ onlineCount: Array.from(wsRegistry.entries()).length }));
      return;
    }
    const rawUrl = String(req.url ?? '/');
    const queryIndex = rawUrl.indexOf('?');
    const rawPath = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
    const rawQuery = queryIndex === -1 ? '' : rawUrl.slice(queryIndex + 1);
    const segments = rawPath.split('/').filter(Boolean);
    const token = segments[0] ?? '';
    const connectionId = domainRegistry.lookupByToken(token);
    if (!connectionId) {
      res.writeHead(404);
      res.end('not_found');
      return;
    }
    const directLoopback = isDirectLoopbackRequest(req);
    // 先过微信检查再看票据：预览抓取 / 普通浏览器在这里就被拒，不会把用户的一次性票据用掉。
    if (wechatOnly && !isWeChatUserAgent(req.headers['user-agent']) && !directLoopback) {
      rejectUnauthorized(res);
      return;
    }
    const connection = wsRegistry.get(connectionId);
    // 兑换成功时 relay 要追加的响应头；在写回 agent 响应时合并，不能用 setHeader（会被 agent 同名头覆盖）。
    let relayHeaders = null;
    if (ticketAuthEnabled && !directLoopback && connection) {
      const authToken = connection.authToken;
      const hasSession = readSessionIds(req.headers.cookie).some((id) => ticketAuth.isValidSession(authToken, id));
      if (!hasSession) {
        const ticket = readQueryParam(rawQuery, 'ticket');
        const sessionId = req.method === 'GET' && ticket ? ticketAuth.redeemTicket(authToken, ticket) : null;
        if (!sessionId) {
          rejectUnauthorized(res);
          return;
        }
        const secure = String(connection.publicBase ?? '').startsWith('https://') ? '; Secure' : '';
        relayHeaders = {
          setCookie: `${SESSION_COOKIE_NAME}=${sessionId}; Path=/${token}/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`,
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
        };
        ticketAuth.issueTicket(authToken);
        sendRegistered(connectionId);
      }
    }
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
      pendingResponses.set(requestId, { res, connectionId, timeout, relayHeaders });
      const forwardQuery = removeQueryParam(rawQuery, 'ticket');
      socket.send(JSON.stringify({
        type: 'request',
        requestId,
        method: req.method ?? 'GET',
        path: `/${segments.slice(1).join('/')}${forwardQuery ? `?${forwardQuery}` : ''}`,
        // relay 的会话凭据只在 relay 用，不带进用户本机。
        headers: withoutSessionCookie(req.headers),
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
  const ticketTimer = ticketAuthEnabled ? setInterval(refreshExpiredTickets, 60_000) : null;
  ticketTimer?.unref?.();
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/agent') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
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
          publicBase: publicBaseUrl ?? derivePublicBase(request?.headers ?? {}),
          targetBaseUrl: message.targetBaseUrl,
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
        });
        // 每次（重新）注册都换一张新票，旧链接随之作废；已兑换的会话按 authToken 保留。
        ticketAuth.revokeTicket(message.authToken);
        sendRegistered(connectionId);
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
        pending.res.writeHead(message.status ?? 200, finalizeResponseHeaders(rewritten.headers, pending.relayHeaders));
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
          pending.res.writeHead(message.status ?? 200, finalizeResponseHeaders(headers, pending.relayHeaders));
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
        pending.res.writeHead(pending.startStatus ?? 200, finalizeResponseHeaders(rewritten.headers, pending.relayHeaders));
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
      // 被同 authToken 新连接顶替时，旧记录已在注册处删除，这里不会误删新连接的票据。
      const record = wsRegistry.get(connectionId);
      if (record && wsRegistry.lookupConnectionIdByAuthToken(record.authToken) === connectionId) {
        ticketAuth.revokeTicket(record.authToken);
      }
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
    // 仅供进程内观测（测试断言在线连接）。relay 不提供任何 HTTP 管理接口，
    // 尤其不能列出连接 / 公网地址，否则会暴露各用户无鉴权控制台的入口。
    listConnections: () => Array.from(wsRegistry.entries()).map(([, record]) => ({ authToken: record.authToken })),
    refreshExpiredTickets,
    close: async () => {
      clearInterval(heartbeatTimer);
      if (ticketTimer) clearInterval(ticketTimer);
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

// 微信内置浏览器（手机端与桌面端）的 UA 都带 MicroMessenger。
// UA 可被伪造，这里只挡住扫描器和随手转发后在普通浏览器打开的场景，不是强鉴权。
export function isWeChatUserAgent(userAgent) {
  return /MicroMessenger/i.test(String(userAgent ?? ''));
}

// 写回 agent 响应前的最后一道处理：agent 不能种 / 覆盖 relay_session（同域下各后缀共享 cookie 空间），
// 兑换票据时 relay 自己的 Set-Cookie 追加在后，Cache-Control / Referrer-Policy 以 relay 为准。
function finalizeResponseHeaders(agentHeaders, relayHeaders) {
  const headers = {};
  const cookies = [];
  for (const [name, value] of Object.entries(agentHeaders ?? {})) {
    const lower = name.toLowerCase();
    if (lower === 'set-cookie') {
      for (const cookie of [].concat(value)) {
        if (!String(cookie).trim().startsWith(`${SESSION_COOKIE_NAME}=`)) cookies.push(cookie);
      }
      continue;
    }
    if (relayHeaders && Object.hasOwn(relayHeaders, lower)) continue;
    headers[name] = value;
  }
  if (relayHeaders) {
    cookies.push(relayHeaders.setCookie);
    headers['cache-control'] = relayHeaders['cache-control'];
    headers['referrer-policy'] = relayHeaders['referrer-policy'];
  }
  if (cookies.length) headers['set-cookie'] = cookies;
  return headers;
}

function rejectUnauthorized(res) {
  res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
  res.end(renderWeChatOnlyPage());
}

// 拼接公网地址用：优先反代透传的 x-forwarded-*，回退 host；都没有时返回 undefined（隧道将无法兑换票据）。
export function derivePublicBase(headers) {
  const firstValue = (value) => String(value ?? '').split(',')[0].trim();
  const host = firstValue(headers['x-forwarded-host']) || firstValue(headers.host);
  if (!host) return undefined;
  const proto = firstValue(headers['x-forwarded-proto']) || 'http';
  return `${proto}://${host}`;
}

function readSessionIds(cookieHeader) {
  return String(cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    .map((part) => part.slice(SESSION_COOKIE_NAME.length + 1));
}

function withoutSessionCookie(headers) {
  if (headers.cookie === undefined) return headers;
  const rest = String(headers.cookie)
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${SESSION_COOKIE_NAME}=`));
  const next = { ...headers };
  if (rest.length) next.cookie = rest.join('; ');
  else delete next.cookie;
  return next;
}

// 只按参数名处理、其余片段原样保留，避免重新编码改变转发给本机的查询串。
function queryParamName(part) {
  const name = part.split('=')[0];
  try {
    return decodeURIComponent(name.replace(/\+/g, ' '));
  } catch {
    return name;
  }
}

function readQueryParam(rawQuery, name) {
  const part = rawQuery.split('&').find((item) => queryParamName(item) === name);
  if (part === undefined) return null;
  const value = part.slice(part.indexOf('=') + 1);
  return part.includes('=') ? value : '';
}

function removeQueryParam(rawQuery, name) {
  return rawQuery.split('&').filter((item) => item && queryParamName(item) !== name).join('&');
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded'];

// 本机直连（如本地开发、在 relay 所在机器上自测）不受微信限制。
// 同机反向代理转发的公网流量也是从回环地址进来的，所以只要带了任一代理头就按公网请求处理；
// 部署时反代必须透传 x-forwarded-* 头（README 已要求），否则公网请求会被当成本机直连放行。
export function isDirectLoopbackRequest(req) {
  if (!LOOPBACK_ADDRESSES.has(String(req.socket?.remoteAddress ?? ''))) return false;
  return PROXY_HEADERS.every((name) => req.headers[name] === undefined);
}

function renderWeChatOnlyPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>无权限访问</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f2efe9;color:#333">
<div style="text-align:center;padding:24px"><h2 style="margin:0">无权限访问</h2></div>
</body>
</html>`;
}
