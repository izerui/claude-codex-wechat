# 设计:微信入站媒体(图片/文件/视频)+ 引用消息

日期:2026-06-20 · 状态:已确认,待实现

## 目标

让微信用户发给 bot 的**图片/文件/视频**和**引用消息**能进入 Claude/Codex CLI。
当前 `weixin-direct` 只收文本(+语音转写文本),其余 item 在 `apiClient.getUpdates` 被直接丢弃。

## 终点(已定)

媒体下载到本地后,以 **`@/abs/path`** 形式拼进发给 provider 的 prompt 文本(`@` 是 Claude Code/Codex 的文件引用语法,CLI 会主动读取)。**不改 provider 接口/runner**,仍传 `text`。

## 架构(A:分层)

```
微信媒体消息
  → apiClient.getUpdates  解析元数据(CDNMedia + 文件名 + ref_msg),不再丢弃
  → adapter               逐个下载+解密到本地,产出结构化 ChannelIncomingMessage
  → messageRouter         把 @localPath 拼进 prompt
  → provider.sendMessage({ text })   (runner 不改)
```

- channel 层:微信媒体 → 本地文件 + 结构化消息(不懂 AI prompt)。
- session 层(messageRouter):组装 prompt(拼 @path)。

## 新增模块(参考第三方 SDK corespeed-io/wechatbot 的 media/crypto + downloader)

1. **`src/channels/weixin-direct/mediaCrypto.ts`** — AES-128-ECB 解密 + 三种 `aes_key` 格式:
   - base64(原始 16 字节)、base64(hex 字符串)、直接 hex(32 字符)。
2. **`src/channels/weixin-direct/mediaDownloader.ts`** — 从加密 CDN 下载密文 → 解密 → 落本地文件 → 返回 `localPath`。
   - `download(media: CDNMedia, opts): Promise<{ localPath } | { failed: true; reason }>`。
   - 视频:`> 25MB` 跳过下载,返回 `failed: 'too_large'`(仅告知)。

## 改动

3. **`apiClient.getUpdates`** — 保留 `image(2)/file(4)/video(5)` 的 `CDNMedia`+`fileName`+尺寸,以及 `ref_msg`(引用)。文本/语音转写照旧。返回的 message 增加 `attachments` 元数据 + `quoted`。
4. **`ChannelIncomingMessage.content`**(`src/channels/types.ts`)扩展:
   ```ts
   content: {
     type: 'text' | 'image' | 'file' | 'video' | 'mixed';
     text?: string;
     attachments?: Array<{ kind:'image'|'file'|'video'; localPath?:string; fileName?:string; mimeType?:string; failed?:boolean; failReason?:string }>;
     quoted?: { text?: string; attachments?: Attachment[] };
   }
   ```
   保留 `localPath?` 字段以兼容现有调用(逐步迁移)。
5. **`adapter`** — 入站时调 `mediaDownloader` 下载每个媒体填 `localPath`;失败标 `failed:true`+原因,不阻断。引用消息的媒体同样下载。
6. **`messageRouter`**(约 line 101) — 放行"有 `text` **或** 有 `attachments`"的消息;拼 prompt(见下)。
7. **存储** — 下载到 `<configDir>/media/<msgId>_<idx>.<ext>`;**MVP 不做自动清理**。

## prompt 拼装格式(messageRouter)

```
<用户原文>

[图片] @/abs/media/m1_0.png
[文件] report.pdf @/abs/media/m1_1.pdf
[视频] clip.mp4 [视频过大未下载]
[引用] <被引用的文本> @/abs/media/m1_q0.png
```

- 下载失败 → `[图片下载失败]`,不阻断。
- 纯文本消息行为不变。

## 不改

provider 接口/runner、登录、轮询、配额/时效逻辑。

## 测试

- `mediaCrypto`:三种 key 格式解密(已知明文/密文对)。
- `mediaDownloader`:mock fetch CDN → 解密 → 落盘;视频超限跳过。
- `apiClient.getUpdates`:解析 image/file/video 元数据 + ref_msg。
- `adapter`:收到媒体消息 → 下载 → ChannelIncomingMessage 带 attachments;下载失败降级。
- `messageRouter`:带媒体消息 → prompt 含 @path;引用呈现;失败降级;纯文本不回归。

## 默认决定(可后续调整)

- 视频大小上限:25MB(超过仅告知)。
- 媒体清理:暂不自动清理。
