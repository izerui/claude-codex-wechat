import { isValidClientToken } from './tokenManager.mjs';

export function parseRelayMessage(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.type === 'register') {
    if (
      typeof parsed.clientVersion === 'string' &&
      typeof parsed.targetBaseUrl === 'string' &&
      typeof parsed.authToken === 'string' &&
      isValidClientToken(parsed.authToken) &&
      // 能力协商:新客户端声明支持流式转发;老客户端不带此字段,按缓冲处理。
      (parsed.supportsStreaming === undefined || typeof parsed.supportsStreaming === 'boolean')
    ) {
      return parsed;
    }
    throw new Error('invalid_register_message');
  }
  // 其余消息(response 缓冲,以及流式的 response-start / response-chunk / response-end)
  // 原样透传,由 server 按 type 分发处理。
  return parsed;
}
