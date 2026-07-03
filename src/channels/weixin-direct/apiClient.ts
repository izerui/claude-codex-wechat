import { randomUUID } from 'node:crypto';
import type { CDNMedia } from './mediaDownloader';

export type InboundAttachmentMeta = {
  kind: 'image' | 'file' | 'video';
  media?: CDNMedia;
  aeskey?: string;
  fileName?: string;
};

export type InboundWeixinMessage = {
  id: string;
  chatId: string;
  userId: string;
  text: string;
  contextToken?: string;
  attachments?: InboundAttachmentMeta[];
  quoted?: { text?: string; attachments?: InboundAttachmentMeta[] };
};

type WireItem = {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string };
  image_item?: { media?: CDNMedia; aeskey?: string };
  file_item?: { media?: CDNMedia; file_name?: string };
  video_item?: { media?: CDNMedia };
  ref_msg?: { title?: string; message_item?: WireItem };
};

/** Walk a message's item_list, splitting it into texts, media attachments, and a quoted ref. */
function collectInboundItems(itemList: WireItem[] | undefined): {
  texts: string[];
  attachments: InboundAttachmentMeta[];
  quoted?: { text?: string; attachments?: InboundAttachmentMeta[] };
} {
  const texts: string[] = [];
  const attachments: InboundAttachmentMeta[] = [];
  let quoted: { text?: string; attachments?: InboundAttachmentMeta[] } | undefined;
  for (const item of itemList ?? []) {
    if (item.type === 1 && item.text_item?.text?.trim()) texts.push(item.text_item.text.trim());
    else if (item.type === 3 && item.voice_item?.text?.trim()) texts.push(item.voice_item.text.trim());
    else if (item.type === 2 && item.image_item) attachments.push({ kind: 'image', media: item.image_item.media, aeskey: item.image_item.aeskey });
    else if (item.type === 4 && item.file_item) attachments.push({ kind: 'file', media: item.file_item.media, fileName: item.file_item.file_name });
    else if (item.type === 5 && item.video_item) attachments.push({ kind: 'video', media: item.video_item.media });
    if (item.ref_msg?.message_item) {
      const inner = collectInboundItems([item.ref_msg.message_item]);
      const text = [item.ref_msg.title, ...inner.texts].filter(Boolean).join(' ') || undefined;
      quoted = {
        ...(text ? { text } : {}),
        ...(inner.attachments.length ? { attachments: inner.attachments } : {}),
      };
    }
  }
  return { texts, attachments, quoted };
}

export class WeixinDirectApiClient {
  private readonly baseUrl: string;
  private readonly botToken: string;
  private readonly wechatUin: string;
  private readonly channelVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(input: {
    baseUrl: string;
    botToken: string;
    wechatUin: string;
    channelVersion?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, '');
    this.botToken = input.botToken;
    this.wechatUin = input.wechatUin;
    this.channelVersion = input.channelVersion ?? '0.1.0';
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
        base_info: { channel_version: this.channelVersion },
      }),
    });

    if (!response.ok) {
      throw new Error(`weixin_send_message_failed:${response.status}`);
    }
    const payload = await response.json() as { ret?: number; errcode?: number; errmsg?: string };
    if ((payload.errcode ?? 0) !== 0 || (payload.ret ?? 0) !== 0) {
      throw new Error(`weixin_send_message_failed:${payload.errcode ?? payload.ret ?? -1}:${payload.errmsg ?? 'unknown_error'}`);
    }
  }

  async getUpdates(buffer: string, signal?: AbortSignal): Promise<{
    nextBuffer: string;
    messages: InboundWeixinMessage[];
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
        base_info: { channel_version: this.channelVersion },
      }),
      ...(signal ? { signal } : {}),
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
        item_list?: WireItem[];
      }>;
      get_updates_buf?: string;
    };

    if ((payload.errcode ?? 0) !== 0 || (payload.ret ?? 0) !== 0) {
      throw new Error(`weixin_get_updates_failed:${payload.errcode ?? payload.ret ?? -1}:${payload.errmsg ?? 'unknown_error'}`);
    }

    const messages = (payload.msgs ?? [])
      .map((message): InboundWeixinMessage | null => {
        if (!message.from_user_id) return null;
        const { texts, attachments, quoted } = collectInboundItems(message.item_list);
        const text = texts.join('\n\n');
        if (!text && attachments.length === 0 && !quoted) return null;
        return {
          id: message.msg_id ?? '',
          chatId: message.from_user_id,
          userId: message.from_user_id,
          text,
          ...(message.context_token ? { contextToken: message.context_token } : {}),
          ...(attachments.length ? { attachments } : {}),
          ...(quoted ? { quoted } : {}),
        };
      })
      .filter((value): value is InboundWeixinMessage => value !== null);

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
        base_info: { channel_version: this.channelVersion },
      }),
    });
    if (!response.ok) {
      throw new Error(`weixin_get_config_failed:${response.status}`);
    }
    const raw = await response.text();
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
        base_info: { channel_version: this.channelVersion },
      }),
    });
    if (!response.ok) {
      throw new Error(`weixin_send_typing_failed:${response.status}`);
    }
    const payload = await response.json() as { ret?: number; errmsg?: string };
    if ((payload.ret ?? 0) !== 0) {
      throw new Error(`weixin_send_typing_failed:${payload.ret ?? -1}:${payload.errmsg ?? 'unknown_error'}`);
    }
  }

  /** Request a CDN upload URL from the iLink platform. */
  async getUploadUrl(input?: { contextToken?: string }): Promise<{ uploadParam: string }> {
    const response = await this.fetchImpl(`${this.baseUrl}/ilink/bot/getuploadurl`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        Authorization: `Bearer ${this.botToken}`,
        'X-WECHAT-UIN': this.wechatUin,
      },
      body: JSON.stringify({
        ...(input?.contextToken ? { context_token: input.contextToken } : {}),
        base_info: { channel_version: this.channelVersion },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`weixin_get_upload_url_failed:http_${response.status}:${text.slice(0, 200)}`);
    }
    const payload = await response.json() as {
      ret?: number;
      errcode?: number;
      errmsg?: string;
      upload_param?: string;
    };
    if ((payload.errcode ?? 0) !== 0 || (payload.ret ?? 0) !== 0) {
      throw new Error(`weixin_get_upload_url_failed:${payload.errcode ?? payload.ret ?? -1}:${payload.errmsg ?? 'unknown_error'}`);
    }
    if (!payload.upload_param) {
      throw new Error('weixin_get_upload_url_failed:no_upload_param');
    }
    return { uploadParam: payload.upload_param };
  }

  /**
   * Send a media message (image/voice/file/video) to a user.
   * The media must already be uploaded to CDN; pass the resulting CDNMedia reference.
   */
  async sendMediaMessage(input: {
    toUserId: string;
    contextToken: string;
    /** MessageItemType: IMAGE=2, VOICE=3, FILE=4, VIDEO=5 */
    itemType: 2 | 3 | 4 | 5;
    media: CDNMedia;
    aesKey?: string;
    fileName?: string;
  }): Promise<void> {
    const item = this.buildMediaItem(input.itemType, input.media, input.aesKey, input.fileName);
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
          item_list: [item],
          context_token: input.contextToken,
        },
        base_info: { channel_version: this.channelVersion },
      }),
    });
    if (!response.ok) {
      throw new Error(`weixin_send_media_failed:${response.status}`);
    }
    const payload = await response.json() as { ret?: number; errcode?: number; errmsg?: string };
    if ((payload.errcode ?? 0) !== 0 || (payload.ret ?? 0) !== 0) {
      throw new Error(`weixin_send_media_failed:${payload.errcode ?? payload.ret ?? -1}:${payload.errmsg ?? 'unknown_error'}`);
    }
  }

  private buildMediaItem(
    itemType: 2 | 3 | 4 | 5,
    media: CDNMedia,
    aesKey?: string,
    fileName?: string,
  ): Record<string, unknown> {
    const cdnMedia = {
      encrypt_query_param: media.encrypt_query_param,
      aes_key: media.aes_key,
      ...(media.full_url ? { full_url: media.full_url } : {}),
    };
    switch (itemType) {
      case 2: // IMAGE
        return { type: 2, image_item: { media: cdnMedia, ...(aesKey ? { aeskey: aesKey } : {}) } };
      case 3: // VOICE
        return { type: 3, voice_item: { media: cdnMedia } };
      case 4: // FILE
        return { type: 4, file_item: { media: cdnMedia, ...(fileName ? { file_name: fileName } : {}) } };
      case 5: // VIDEO
        return { type: 5, video_item: { media: cdnMedia } };
    }
  }
}
