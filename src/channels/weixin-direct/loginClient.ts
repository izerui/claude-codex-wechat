const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';

type QrCodeData = {
  qrcode?: string;
  qrcode_img_content?: string;
};

type QrCodeStatusData = {
  status?: string;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
};

type WrappedResponse<T> = {
  data?: T;
} & T;

export class WeixinDirectLoginClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  readonly pollIntervalMs: number;

  constructor(input: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    pollIntervalMs?: number;
  } = {}) {
    this.baseUrl = (input.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.pollIntervalMs = input.pollIntervalMs ?? 2_000;
  }

  async fetchQrCode(): Promise<{ ticket: string; qrcodeData: string }> {
    const data = await this.getJson<QrCodeData>('ilink/bot/get_bot_qrcode?bot_type=3');
    const ticket = data.qrcode?.trim();
    const qrcodeData = data.qrcode_img_content?.trim();
    if (!ticket || !qrcodeData) throw new Error('weixin_qrcode_missing_fields');
    return { ticket, qrcodeData };
  }

  async pollQrCodeStatus(ticket: string): Promise<
    | { status: 'waiting' }
    | { status: 'scanned' }
    | { status: 'confirmed'; accountId: string; botToken: string; baseUrl: string }
    | { status: 'expired' }
  > {
    const data = await this.getJson<QrCodeStatusData>(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(ticket)}`);
    const status = data.status?.trim().toLowerCase() ?? 'wait';
    if (status === 'scaned') return { status: 'scanned' };
    if (status === 'confirmed') {
      return {
        status: 'confirmed',
        accountId: data.ilink_bot_id?.trim() ?? '',
        botToken: data.bot_token?.trim() ?? '',
        baseUrl: data.baseurl?.trim() || this.baseUrl,
      };
    }
    if (status === 'expired') return { status: 'expired' };
    return { status: 'waiting' };
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
      headers: {
        'iLink-App-ClientVersion': '1',
      },
    });
    if (!response.ok) throw new Error(`weixin_login_request_failed:${response.status}`);
    const payload = await response.json() as WrappedResponse<T>;
    return (payload.data ?? payload) as T;
  }
}
