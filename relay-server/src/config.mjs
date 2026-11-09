import { readFileSync } from 'node:fs';

export function loadRelayConfig(env = process.env) {
  const host = String(env.RELAY_HOST ?? '').trim() || '0.0.0.0';
  const port = Number(env.RELAY_PORT ?? 8788);
  const baseDomain = String(env.RELAY_BASE_DOMAIN ?? '').trim();
  const relayServerUrl = String(env.RELAY_SERVER_URL ?? '').trim() || undefined;
  const authTokens = parseAuthTokens(env);
  const authTokensFile = String(env.RELAY_AUTH_TOKENS_FILE ?? '').trim() || undefined;
  // 默认只允许微信内置浏览器打开公网隧道地址；显式设为 0/false/off 才放开给任意浏览器。
  const wechatOnly = !isDisabled(env.RELAY_WECHAT_ONLY);
  // 公网链接默认必须凭 relay 签发的一次性票据进入；设为 0/false/off/no 退回仅微信 UA 检查（应急回退）。
  const ticketAuth = !isDisabled(env.RELAY_TICKET_AUTH);
  // 拼接带票据的公网地址用；未配置时从 /agent 的 upgrade 请求头推导。
  const publicBaseUrl = String(env.RELAY_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '') || undefined;
  return {
    host,
    port,
    baseDomain,
    relayServerUrl,
    authTokens,
    authTokensFile,
    wechatOnly,
    ticketAuth,
    publicBaseUrl,
  };
}

function isDisabled(value) {
  return /^(0|false|off|no)$/i.test(String(value ?? '').trim());
}

function parseAuthTokens(env) {
  const filePath = String(env.RELAY_AUTH_TOKENS_FILE ?? '').trim();
  if (filePath) {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((token) => token.trim())
      .filter(Boolean);
  }
  const multiValue = String(env.RELAY_AUTH_TOKENS ?? '').trim();
  if (multiValue) {
    return multiValue
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
  }
  const singleValue = String(env.RELAY_AUTH_TOKEN ?? '').trim();
  return singleValue ? [singleValue] : [];
}
