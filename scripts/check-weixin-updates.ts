// Diagnostic script:
// Calls the official WeChat getupdates endpoint directly so we can distinguish
// bridge-side issues from upstream token/session problems.
import { randomBytes } from 'node:crypto';

const baseUrl = (process.env.BRIDGE_WECHAT_BASE_URL || 'https://ilinkai.weixin.qq.com').replace(/\/+$/, '');
const token = process.env.BRIDGE_WECHAT_TOKEN;
const buffer = process.env.BRIDGE_WECHAT_BUFFER || '';
const wechatUin = process.env.BRIDGE_WECHAT_UIN || randomBytes(4).toString('base64');

if (!token) {
  console.error('BRIDGE_WECHAT_TOKEN is required');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/ilink/bot/getupdates`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    Authorization: `Bearer ${token}`,
    'X-WECHAT-UIN': wechatUin,
  },
  body: JSON.stringify({
    get_updates_buf: buffer,
    base_info: {},
  }),
});

const text = await response.text();
let payload: unknown = null;
try {
  payload = text ? JSON.parse(text) : null;
} catch {
  payload = text;
}

console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  wechatUin,
  nextBuffer: typeof payload === 'object' && payload && 'get_updates_buf' in payload
    ? (payload as { get_updates_buf?: unknown }).get_updates_buf ?? ''
    : '',
  messageCount: Array.isArray((payload as { msgs?: unknown[] } | null)?.msgs)
    ? ((payload as { msgs: unknown[] }).msgs.length)
    : 0,
  firstMessage: Array.isArray((payload as { msgs?: unknown[] } | null)?.msgs) && (payload as { msgs: unknown[] }).msgs.length > 0
    ? (payload as { msgs: unknown[] }).msgs[0]
    : null,
  payload,
}, null, 2));
