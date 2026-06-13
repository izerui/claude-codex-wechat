# AionCore Weixin 实现参考说明

## 1. 这份文档的目的

这份文档用于固定 `AionCore` 里 `weixin` channel 的真实实现结构，作为当前工程后续“产品行为对齐”的基准。

目标不是逐行照抄 Rust，而是明确：

- `AionUi` 微信组件依赖的后端行为是什么
- 哪些事件与接口合同必须保持一致
- 哪些是实现细节，哪些是产品语义

核心目录：

```text
/Users/liuyuhua/github/AionCore/crates/aionui-channel/src/plugins/weixin
```

---

## 2. 关键文件分工

### 2.1 `login.rs`

职责：

- 扫码登录流程
- 生成给前端消费的登录事件流

关键点：

- 默认登录基础地址：`https://ilinkai.weixin.qq.com`
- 扫码状态轮询间隔
- 登录超时控制
- 事件类型：
  - `Qr`
  - `Scanned`
  - `Done`
  - `Error`

它定义的行为直接映射到 `AionUi` 前端组件里的：

- `qr`
- `scanned`
- `done`
- `error`

### 2.2 `api.rs`

职责：

- 封装微信 iLink/OpenClaw HTTP 调用

关键点：

- `get_bot_qrcode`
- `get_qrcode_status`
- `get_updates`
- `send_message`

这层是协议细节层，不是 UI 层。

### 2.3 `plugin.rs`

职责：

- `weixin` channel 插件主体
- 生命周期管理
- 长轮询拉消息
- 消息发送

关键点：

- 插件初始化要求：
  - `bot_token`
  - `account_id`
- 启动后进入轮询
- 停止时关闭轮询
- 发送消息用 `send_message`

### 2.4 `types.rs`

职责：

- 登录与消息协议相关类型
- SSE 事件 payload 类型

关键点：

- `qrcodeData`
- `accountId`
- `botToken`
- `baseUrl`

这些字段名是前端协议的一部分，不能随意换。

### 2.5 `routes.rs`

职责：

- 把 `weixin` 能力暴露成 API 路由

关键点：

- `GET /api/channel/weixin/login`
- 插件 enable / disable / status 等配套 routes

---

## 3. AionCore 的核心设计选择

### 3.1 登录流是后端主动驱动的

不是前端自己轮询第三方。

模式是：

```text
frontend EventSource
  -> backend /api/channel/weixin/login
  -> backend 内部执行二维码登录流程
  -> backend SSE 推送 qr/scanned/done/error
```

这意味着前端只消费统一事件，不知道底层微信 API 细节。

### 3.2 消息接收是长轮询，不是 webhook

`plugin.rs` 中的 `poll_loop` 说明：

- 微信消息来源是 `getupdates`
- 插件自己维护 buffer
- 持续轮询获取新消息

这和“桥接一个已有 HTTP webhook clawbot”是本质不同的架构。

### 3.3 发送消息依赖 `context_token`

`send_message` 不是只传文本。

它还会尝试把会话里的 `context_token` 带回去。

这意味着在当前工程里，如果后续完全对齐这套方式，微信 session 层必须考虑：

- 收消息时保存 `context_token`
- 回复时带回 `context_token`

否则对话线程可能错乱。

### 3.4 `weixin` 插件是完整 channel，而不是 UI 按钮

从 `plugin.rs` 来看，微信接入不是一个单独登录动作，而是完整的 plugin 生命周期：

```text
initialize -> ready -> start -> running -> stop
```

所以当前工程后续如果完全对齐，不能只补一个扫码页面，还要有：

- 初始化凭据
- 启动微信拉消息 runtime
- 停止微信 runtime
- 状态变更可观测

---

## 4. AionUi 前端依赖 AionCore 的哪些合同

前端组件：

`WeixinConfigForm.tsx`

依赖的后端合同主要有这几类。

### 4.1 登录 SSE 合同

- `GET /api/channel/weixin/login`
- 事件名：
  - `qr`
  - `scanned`
  - `done`
  - `error`

### 4.2 插件启用合同

前端扫码成功后，会调用：

```text
enablePlugin({
  plugin_id: 'weixin',
  config: {
    credentials: {
      account_id,
      bot_token
    }
  }
})
```

也就是说，扫码成功本身不等于开始聊天，扫码只是拿到启用插件所需凭据。

### 4.3 实时事件合同

前端订阅：

- `channel.pairing-requested`
- `channel.user-authorized`
- `channel.plugin-status-changed`

这些事件驱动：

- 待审批配对请求
- 已授权用户列表
- 插件连接状态

### 4.4 设置同步合同

前端还会写入：

- `assistant.weixin.agent`
- `assistant.weixin.defaultModel`

这说明微信 channel 在 `AionUi` 里并不只是“连上就完了”，还包含对话 agent / model 配置。

---

## 5. 对当前 TS 工程的直接指导

如果当前 `local-agent-wechat-bridge` 要完全对齐 `AionCore` 风格，意味着：

### 5.1 可以保留的部分

- 本地 provider bridge
- `Claude Code / Codex` session 管理
- pairing / authorized users / permissions / logs / settings 管理页

### 5.2 需要替换的微信接入假设

当前工程最早是：

```text
external clawbot inbound webhook
external clawbot outbound /send
```

而对齐 `AionCore` 后应变成：

```text
bridge 内置 weixin 登录
bridge 内置 weixin getupdates 轮询
bridge 内置 weixin sendmessage
```

### 5.3 最重要的对齐点

1. `/api/channel/weixin/login` 的事件语义
2. 扫码成功后启用插件所需凭据结构
3. `channel.*` websocket 事件
4. 微信首聊后进入 pairing
5. pairing approve 后才真正路由到 Claude/Codex

---

## 6. 当前工程不该误对齐的地方

不要误把下面这些当成“必须完全照搬”：

- Rust trait 结构
- Rust crate 组织方式
- `ChannelPlugin` 生命周期接口细节
- `AionCore` 的内部 event bus 具体实现

这些属于实现细节，不是当前 TS 工程必须复制的部分。

应该对齐的是：

- 外部 API 行为
- UI 可见状态
- 登录/配对/授权/聊天的整体流程

---

## 7. 建议的实现优先级

对当前工程后续改造，建议顺序如下：

1. 先把扫码登录改成 `AionCore` 风格
2. 再把发送消息改成官方 `sendmessage`
3. 再补 `getupdates` 长轮询
4. 最后把旧 `clawbot inbound webhook` 从主路径降级为兼容路径或删除

---

## 8. 一句话结论

`AionCore` 的 `weixin` 实现不是“一个微信按钮”，而是**一整套内置微信 channel runtime**。

当前工程如果要完全对齐，就必须逐步把微信层从“桥接外部 clawbot”改成“bridge 内置 weixin channel”。 
