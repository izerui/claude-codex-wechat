# OpenClaw Weixin 官方参考说明

## 1. 这份文档的目的

这份文档用于固定当前工程后续要参考的**官方微信接入路线**，避免继续把实现方向混到“外部 clawbot HTTP wrapper”上。

当前确认的官方参考源包括：

- 微信开发者文档：`Clawbot related` / OpenClaw 相关开放接口
- 官方 TypeScript 插件：`Tencent/openclaw-weixin`

本项目后续如果要与 `AionUi` 的微信 channel 完全对齐，**底层协议与网络调用细节优先参考这条官方路线**。

---

## 2. 核心结论

`AionUi` / `AionCore` 的 `weixin` channel，不是基于一个本地自定义的微信 clawbot HTTP wrapper 实现的。

它实际走的是：

1. 微信官方 / OpenClaw 体系的扫码登录
2. 登录成功后获得 `account_id` 和 `bot_token`
3. 通过官方接口长轮询拉取消息
4. 通过官方接口发送消息

也就是说，微信接入层本质是：

```text
WeChat iLink / OpenClaw API
  -> QR login
  -> getupdates
  -> sendmessage
```

而不是：

```text
custom local clawbot wrapper
  -> /login
  -> /send
  -> /webhook
```

---

## 3. 官方能力面

根据官方插件与当前已确认实现，最重要的能力面有：

### 3.1 扫码登录

用于让用户扫码绑定微信机器人。

关键接口：

- `get_bot_qrcode`
- `get_qrcode_status`

关键行为：

- 获取二维码内容
- 轮询二维码状态
- 状态流通常对应：
  - 等待扫码
  - 已扫码
  - 已确认
  - 已过期

登录确认后返回关键凭据：

- `account_id` 或 `ilink_bot_id`
- `bot_token`
- `baseurl`

这些正是后续启用 `weixin` channel 所需的凭据。

### 3.2 拉取消息

不是 webhook 入站，而是**长轮询**。

关键接口：

- `getupdates`

关键特征：

- 采用 buffer-based 协议
- 服务端持续轮询
- 会拿到消息列表与新的 buffer

### 3.3 发送消息

关键接口：

- `sendmessage`

关键特征：

- 文本消息通过 item list 发送
- 需要带 `to_user_id`
- 需要正确带回 `context_token`，否则回复可能不会挂到正确上下文

### 3.4 其它能力

官方插件与文档还体现了这些扩展能力：

- `getUploadUrl`
- `sendTyping`
- 文件/媒体相关能力

这些能力不是当前 bridge 第一优先级，但文档上要记住：官方路线本身不仅仅支持纯文本。

---

## 4. 关键字段

后续 TS 实现不能改乱这些字段含义。

### 4.1 登录结果字段

- `account_id`
- `bot_token`
- `baseurl`

### 4.2 消息收发字段

- `from_user_id`
- `context_token`
- `msg_id`
- `item_list`

### 4.3 发送消息字段

- `to_user_id`
- `client_id`
- `message_type`
- `message_state`
- `item_list`
- `context_token`

---

## 5. 关键请求头

官方接口不是简单匿名 HTTP。

后续实现时必须注意这些请求头：

- `AuthorizationType`
- `Authorization`
- `X-WECHAT-UIN`

其中：

- `Authorization` 通常基于 `bot_token`
- `X-WECHAT-UIN` 需要按官方实现生成

这部分如果忽略，哪怕接口路径写对了，也很可能无法真正跑通。

---

## 6. 对当前工程的直接影响

对 `claude-codex-wechat` 来说，后续应当调整为：

### 6.1 登录侧

`GET /api/channel/weixin/login`

应该由 bridge 自己直接驱动官方扫码登录流程，而不是依赖一个外部本地 `/login` 服务。

### 6.2 接收侧

不应再把“微信消息入站”默认建模成：

- `POST /api/channel/wechat/inbound`

的唯一来源。

如果要完全对齐官方 / `AionCore` 方式，应增加：

- bridge 内部长轮询 `getupdates`
- 从轮询结果映射成统一的 bridge message

### 6.3 发送侧

不应只保留：

- 外部 `/send` HTTP 代理客户端

而应具备直接走官方 `sendmessage` 的能力。

---

## 7. 推荐参考优先级

如果后续继续实现，参考优先级建议如下：

1. 微信官方文档
2. `Tencent/openclaw-weixin`
3. `AionCore` Rust 实现

原因：

- 官方文档定义协议
- 官方 TS 插件定义 TS 侧真实调用方式
- Rust 实现定义 `AionUi` 实际集成行为

---

## 8. 当前工程后续应做什么

后续如果继续对齐官方路线，建议按这个顺序推进：

1. 保留当前已经完成的 provider bridge、pairing、session、permission、admin UI
2. 将微信登录改成 bridge 内置 `weixin-direct` 实现
3. 将消息接收改成 `getupdates` 长轮询模型
4. 将消息发送改成 `sendmessage`
5. 保留 `AionUi` 风格的 UI 契约：
   - `qr / scanned / done / error`
   - `channel.pairing-requested`
   - `channel.user-authorized`
   - `channel.plugin-status-changed`

---

## 9. 一句话结论

后续不要再把微信接入理解成“找一个现成 clawbot HTTP 服务接上”。

**正确方向是：参考官方 OpenClaw Weixin 协议与 TS 插件，在当前工程里实现 `AionUi` 风格的微信 channel。**
