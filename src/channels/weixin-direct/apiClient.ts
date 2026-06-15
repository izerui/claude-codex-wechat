import { randomUUID } from 'node:crypto';

export class WeixinDirectApiClient {
  private readonly baseUrl: string;
  private readonly botToken: string;
  private readonly wechatUin: string;
  private readonly fetchImpl: typeof fetch;

  constructor(input: {
    baseUrl: string;
    botToken: string;
    wechatUin: string;
    fetchImpl?: typeof fetch;
  }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, '');
    this.botToken = input.botToken;
    this.wechatUin = input.wechatUin;
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async sendTextMessage(input: {
    toUserId: string;
    text: string;
    contextToken?: string;
  }): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/ilink/bot/sendmessage`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        Authorization: `Bearer ${this.botToken}`,
        'X-WECHAT-UIN': this.wechatUin,
      },
      body: JSON.stringify({
        msg: {
          to_user_id: input.toUserId,
          client_id: randomUUID(),
          message_type: 2,
          message_state: 2,
          item_list: [
            {
              type: 1,
              text_item: {
                text: input.text,
              },
            },
          ],
          ...(input.contextToken ? { context_token: input.contextToken } : {}),
        },
        base_info: {},
      }),
    });

    if (!response.ok) {
      throw new Error(`weixin_send_message_failed:${response.status}`);
    }
  }

  async getUpdates(buffer: string): Promise<{
    nextBuffer: string;
    messages: Array<{
      id: string;
      chatId: string;
      userId: string;
      text: string;
      contextToken?: string;
    }>;
  }> {
    const response = await this.fetchImpl(`${this.baseUrl}/ilink/bot/getupdates`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        Authorization: `Bearer ${this.botToken}`,
        'X-WECHAT-UIN': this.wechatUin,
      },
      body: JSON.stringify({
        get_updates_buf: buffer,
        base_info: {},
      }),
    });
    if (!response.ok) {
      throw new Error(`weixin_get_updates_failed:${response.status}`);
    }
    const payload = await response.json() as {
      ret?: number;
      errcode?: number;
      errmsg?: string;
      msgs?: Array<{
        from_user_id?: string;
        context_token?: string;
        msg_id?: string;
        item_list?: Array<{
          type?: number;
          text_item?: { text?: string };
          voice_item?: { text?: string };
        }>;
      }>;
      get_updates_buf?: string;
    };

    if ((payload.errcode ?? 0) !== 0 || (payload.ret ?? 0) !== 0) {
      throw new Error(`weixin_get_updates_failed:${payload.errcode ?? payload.ret ?? -1}:${payload.errmsg ?? 'unknown_error'}`);
    }

    const messages = (payload.msgs ?? [])
      .map((message) => {
        const text = (message.item_list ?? [])
          .flatMap((item) => {
            if (item.type === 1) return [item.text_item?.text?.trim() ?? ''];
            if (item.type === 3) return [item.voice_item?.text?.trim() ?? ''];
            return [];
          })
          .filter(Boolean)
          .join('\n\n');
        if (!message.from_user_id || !text) return null;
        return {
          id: message.msg_id ?? '',
          chatId: message.from_user_id,
          userId: message.from_user_id,
          text,
          ...(message.context_token ? { contextToken: message.context_token } : {}),
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    return {
      nextBuffer: payload.get_updates_buf ?? '',
      messages,
    };
  }

  async getConfig(input: {
    ilinkUserId: string;
    contextToken?: string;
  }): Promise<{ typingTicket: string }> {
    const response = await this.fetchImpl(`${this.baseUrl}/ilink/bot/getconfig`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        Authorization: `Bearer ${this.botToken}`,
        'X-WECHAT-UIN': this.wechatUin,
      },
      body: JSON.stringify({
        ilink_user_id: input.ilinkUserId,
        ...(input.contextToken ? { context_token: input.contextToken } : {}),
        base_info: {},
      }),
    });
    if (!response.ok) {
      throw new Error(`weixin_get_config_failed:${response.status}`);
    }
    const raw = await response.text();
    console.error('[weixin-typing] getConfig raw response:', raw);
    const payload = JSON.parse(raw) as {
      ret?: number;
      errmsg?: string;
      typing_ticket?: string;
    };
    if ((payload.ret ?? 0) !== 0) {
      throw new Error(`weixin_get_config_failed:${payload.ret ?? -1}:${payload.errmsg ?? 'unknown_error'}`);
    }
    return {
      typingTicket: payload.typing_ticket?.trim() ?? '',
    };
  }

  async sendTyping(input: {
    ilinkUserId: string;
    typingTicket: string;
    status: 1 | 2;
  }): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/ilink/bot/sendtyping`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        Authorization: `Bearer ${this.botToken}`,
        'X-WECHAT-UIN': this.wechatUin,
      },
      body: JSON.stringify({
        ilink_user_id: input.ilinkUserId,
        typing_ticket: input.typingTicket,
        status: input.status,
        base_info: {},
      }),
    });
    console.error('[weixin-typing] sendTyping status:', input.status, 'http:', response.status);
    if (!response.ok) {
      throw new Error(`weixin_send_typing_failed:${response.status}`);
    }
  }
}
