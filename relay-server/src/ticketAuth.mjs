import { randomBytes, randomInt } from 'node:crypto';

// 页面令牌由 relay 注入页面脚本的闭包里，随请求显式携带（不用 cookie：同域各后缀共享 cookie 空间，
// 浏览器会把 cookie 自动附带到同源脚本发起的请求上，别人的隧道页面就能借用）。
export const PAGE_TOKEN_HEADER = 'x-relay-page-token';
export const PAGE_TOKEN_PARAM = '__rpt';

const TICKET_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TICKET_LENGTH = 8;

// 票据要手机上点、肉眼可读，所以只用 8 位小写字母数字；一次性 + 1 天有效 + 绑定后缀，足够防猜。
export function generateTicket() {
  let ticket = '';
  for (let i = 0; i < TICKET_LENGTH; i++) {
    ticket += TICKET_ALPHABET[randomInt(TICKET_ALPHABET.length)];
  }
  return ticket;
}

// 公网链接的一次性票据与兑换后的页面令牌（下称会话），全部存在 relay 进程内存：重启即全部失效，用户重新 /help 即可。
// 每个 authToken 同一时刻只有一张有效票据；会话按 authToken 绑定，断线重连后依然有效，最长 7 天。
export function createTicketAuth({ ticketTtlMs = 86_400_000, sessionTtlMs = 604_800_000, now = Date.now } = {}) {
  const tickets = new Map();
  const sessions = new Map();

  return {
    issueTicket(authToken) {
      const value = generateTicket();
      tickets.set(authToken, { value, expiresAt: now() + ticketTtlMs });
      return value;
    },
    currentTicket(authToken) {
      const ticket = tickets.get(authToken);
      if (!ticket || ticket.expiresAt <= now()) return null;
      return ticket.value;
    },
    redeemTicket(authToken, value) {
      const ticket = tickets.get(authToken);
      if (!ticket || ticket.value !== value || ticket.expiresAt <= now()) return null;
      tickets.delete(authToken);
      const sessionId = randomBytes(32).toString('base64url');
      sessions.set(sessionId, { authToken, expiresAt: now() + sessionTtlMs });
      return sessionId;
    },
    isValidSession(authToken, sessionId) {
      const session = sessions.get(sessionId);
      return Boolean(session && session.authToken === authToken && session.expiresAt > now());
    },
    revokeTicket(authToken) {
      tickets.delete(authToken);
    },
    takeExpiredTicketOwners() {
      const owners = [];
      for (const [authToken, ticket] of tickets) {
        if (ticket.expiresAt > now()) continue;
        tickets.delete(authToken);
        owners.push(authToken);
      }
      return owners;
    },
    sweep() {
      for (const [sessionId, session] of sessions) {
        if (session.expiresAt <= now()) sessions.delete(sessionId);
      }
    },
  };
}
