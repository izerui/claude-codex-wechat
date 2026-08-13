/**
 * 与 daemon 的 /api/channel/send-media 端点通信的唯一客户端。
 *
 * MCP server 是 Claude 拉起的独立子进程，拿不到 daemon 内存里的微信 channel 和
 * activeUser，只能通过 HTTP 回调过去——这一跳是进程边界决定的，不是多余的转发。
 *
 * 此前 sendMedia.ts 与 douyinDownload.ts 各复制了一份实现，参数顺序还写反了
 * （sendMedia(kind, filePath) vs sendToWechat(filePath, kind)），统一到这里。
 */
export type SendMediaKind = 'image' | 'video' | 'audio' | 'file';

export type SendMediaInput = {
  kind: SendMediaKind;
  filePath: string;
  /** 省略时不下发该字段：send_image/send_video 历来不传，补上会改变微信端展示的文件名。 */
  fileName?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

export function defaultBridgeApiUrl(): string {
  return process.env.BRIDGE_API_URL || 'http://localhost:8787';
}

export async function sendMediaToWeChat(input: SendMediaInput): Promise<string> {
  const baseUrl = input.apiBaseUrl ?? defaultBridgeApiUrl();
  const doFetch = input.fetchImpl ?? fetch;
  const response = await doFetch(`${baseUrl}/api/channel/send-media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: input.kind,
      filePath: input.filePath,
      ...(input.fileName ? { fileName: input.fileName } : {}),
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`发送失败 (HTTP ${response.status}): ${text}`);
  }
  const result = await response.json() as { ok: boolean; error?: string };
  if (!result.ok) {
    throw new Error(`发送失败: ${result.error ?? '未知错误'}`);
  }
  return '发送成功';
}
