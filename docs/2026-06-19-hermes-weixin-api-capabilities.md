# Hermes Weixin API 参考整理

## 1. 文档目的

这份文档整理自 Hermes Agent 的 Weixin（微信）适配器用户文档，用来为 `claude-codex-wechat` 提供一份可直接参考的微信 API 能力说明。

目标不是逐字搬运 Hermes 文档，而是提炼出对本仓库最重要的实现事实、平台限制和设计约束。

源文档：

- [Hermes Agent: Weixin (WeChat)](https://hermes-agent.nousresearch.com/docs/zh-Hans/user-guide/messaging/weixin)

---

## 2. 一句话结论

Hermes 的微信适配器是一个基于 **腾讯 iLink Bot API** 的 **扫码登录 + 长轮询 + direct sendmessage** 方案。

对本仓库最关键的事实是：

- 不需要 webhook 或公网回调
- 主要能力面是 DM，不应默认假设普通微信群可用
- `context_token` 是回复连续性的硬约束
- 文本消息存在 **4000 字符** 平台上限，超长时需要智能分块

---

## 3. 适配器定位

Hermes 文档明确区分了：

- **Weixin / WeChat**：个人微信
- **WeCom / Enterprise WeChat**：企业微信

本适配器讨论的是 **个人微信**，而且底层用的是 **iLink Bot API**，不是企业微信接口，也不是一个自定义的本地 webhook wrapper。

这和本仓库当前的 `weixin-direct` 路线是一致的：桥接层应当直接兼容原生 iLink 行为，而不是抽象成另一套私有协议。

---

## 4. 登录与凭据

### 4.1 登录方式

Hermes 使用二维码登录，流程是：

1. 请求二维码
2. 终端展示二维码或登录 URL
3. 用户用手机微信扫码
4. 手机端确认登录
5. 本地保存凭据

这说明 bridge 的微信接入首选也应是 **扫码登录驱动的本地凭据获取**，而不是要求用户手工拼接 token。

### 4.2 登录产物

Hermes 文档明确指出登录后会保存以下关键字段：

- `account_id`
- `token`
- `base_url`

这三个字段可以视为微信 direct 路径的最小凭据集合。

### 4.3 凭据恢复

Hermes 会把这些凭据持久化到本地目录，并在启动时自动恢复。这一点对本仓库有直接参考价值：

- bridge 应允许一次扫码、多次重启复用
- 重新登录不应是每次启动的前提
- 会话过期时才需要重新扫码

---

## 5. 连接模型

### 5.1 长轮询，不是 webhook

Hermes 文档明确写明微信消息通过 **long-polling** 投递，不需要：

- 公网 HTTP endpoint
- webhook
- WebSocket

消息收取路径应是：

1. 启动时验证凭据
2. 调 `getupdates`
3. 服务端 hold 请求直到有消息或超时
4. 收到消息后处理并带上新的同步游标
5. 继续下一轮轮询

这和本仓库当前 direct adapter 的总体模型吻合。

### 5.2 同步游标

Hermes 会把 `get_updates_buf` 持久化到磁盘，确保重启后继续从正确位置恢复。

对本仓库的含义：

- 轮询状态不是纯内存临时量
- 如果要做到稳定恢复，应把 buffer 视为可持久化状态

### 5.3 并发分发

Hermes 文档提到入站消息在轮询返回后会被并发 dispatch。这与我们当前“收消息不要阻塞轮询”的并发不变量方向一致。

---

## 6. iLink bot 身份限制

Hermes 文档最重要的告警之一是：二维码登录连接到的是 **iLink bot identity**，例如 `xxxx@im.bot`，而不是一个“完全可脚本控制的普通个人微信账号”。

直接后果：

- iLink bot 一般**不能像普通联系人一样被邀请进普通微信群**
- iLink 往往**不会把普通微信群事件**投递给该 bot
- 用来扫码的个人微信账号，和 iLink bot 不是同一个会话身份
- `@` 扫码账号，不等于 `@` iLink bot

Hermes 的经验结论是：

- 大多数部署里，**私聊 DM 是可靠路径**
- 群消息如果始终收不到，通常是 **iLink 平台限制**，不是 gateway bug

这对本仓库很重要，因为它决定了产品预期：

- 不应把普通微信群支持当成默认承诺
- 群聊策略存在，但很多账号类型上实际上不会生效

---

## 7. 核心能力面

### 7.1 DM 消息

Hermes 支持直接消息（DM），并且可配置访问策略。

DM 是应当默认优先支持的微信路径。

### 7.2 Group Policy

Hermes 仍提供 group policy：

- `open`
- `allowlist`
- `disabled`

但文档明确强调：这些配置**只有在 iLink 实际投递群事件时才有意义**。如果 iLink 不投递，策略配得再对也不会生效。

对本仓库来说，这意味着：

- 群策略是“可选增强”
- 不是核心成功路径

### 7.3 媒体能力

Hermes 支持：

- 图片
- 视频
- 文件
- 语音

媒体能力不是纯 HTTP URL passthrough，而是走 iLink 的 **加密 CDN** 流程。

### 7.4 Typing 指示

Hermes 支持微信客户端中的“正在输入”状态，说明 iLink 平台本身有这套原生能力，不是 UI 假实现。

### 7.5 Markdown

Hermes 明确指出 iLink 对接的微信客户端可以渲染 Markdown，因此：

- 标题可以保留
- 表格可以保留
- 代码块可以保留

也就是说，不应默认把所有 AI 输出都降级成纯文本。

---

## 8. 出站文本消息

Hermes 的出站文本消息最终对应 `sendmessage` 能力。

最重要的行为约束有三个：

1. 需要把文本以 `item_list[].text_item.text` 的形式发给目标用户
2. 需要持续带回最近的 `context_token`
3. 当文本超过平台限制时，需要分块

这三点合起来，基本就是本仓库微信 direct 发送链路的正确性要求。

---

## 9. context_token 持久化

Hermes 文档把 `context_token` 描述为必须在出站时回显给同一 peer 的字段，并且会做磁盘持久化。

Hermes 的行为模型是：

- 每个 account + peer 保存一个最新 token
- 启动时恢复这些 token
- 每次入站消息更新 token
- 出站时自动填充最新 token

这对本仓库的直接含义是：

- token 不能只做临时内存缓存
- bridge 重启后如果 token 丢了，回复连续性可能会断
- `context_token` 应被视为会话路由状态的一部分

---

## 10. Markdown 行为

Hermes 对 Markdown 的处理原则不是“全部去格式”，而是“保留可原生渲染的 Markdown，做少量清理”。

具体包括：

- 标题保留为 Markdown 标题
- 表格保留
- fenced code block 保留
- 代码块外的过量空行会被压缩成双换行

这给本仓库的一个重要提示是：

- 发送前的文本处理主要应关注**长度与边界**
- 不应为了兼容微信而过度改写回答内容

---

## 11. 长消息分块

这是与本仓库当前问题最相关的部分。

Hermes 文档明确给出消息分块规则：

- **最大消息长度：4000 字符**
- 未超限时，整条消息保持为单个气泡
- 超长时才拆分
- 优先按逻辑边界拆：段落、空行、代码块
- 尽量不在代码块中间拆开
- 如果某个单独块自身就超限，再回退到底层截断逻辑
- 多个块之间加入 **0.3 秒** 延迟，避免微信限频丢消息

这基本可以直接转化为本仓库的实现基线：

1. 出站文本默认单条发送
2. 以 `4000` 作为首个可靠字符阈值
3. 仅在超长时启用分块
4. 分块器要保留段落与代码块边界
5. 分块发送之间考虑短延迟

这也进一步支持了我们此前对“最后一条长摘要静默丢失”的判断。

---

## 12. Typing 指示

Hermes 文档描述的 typing 流程是：

1. 入站消息到达时，通过 `getconfig` 获取 `typing_ticket`
2. ticket 按 user 缓存 10 分钟
3. `send_typing` 发开始输入
4. `stop_typing` 发结束输入
5. agent 处理期间自动维持 typing 状态

这和本仓库当前：

- `getConfig`
- `sendTyping`
- typing keepalive

的结构是对齐的。

---

## 13. 媒体与加密 CDN

Hermes 文档说明微信媒体传输走的是 **AES-128-ECB encrypted CDN**。

### 13.1 入站媒体

入站时：

- 下载 CDN 上的密文
- 使用消息 payload 提供的 per-file key 做 AES-128-ECB 解密
- 缓存为本地文件供 agent 使用

支持的入站类型：

- 图片
- 视频
- 文件
- 语音

对于语音，如果微信已提供转写文本，Hermes 优先直接使用文本。

### 13.2 引用消息中的媒体

Hermes 还会从被引用消息中提取媒体内容，作为上下文的一部分。这说明“reply-to message” 在微信里不只是文本上下文，还可能携带媒体语义。

### 13.3 出站媒体

Hermes 的出站媒体流程是：

1. 生成随机 AES-128 key
2. 本地用 AES-128-ECB + PKCS#7 padding 加密文件
3. 通过 `getuploadurl` 申请上传地址
4. 把密文上传到 CDN
5. 在消息里引用该加密媒体

这说明如果本仓库后续补媒体能力，正确方向应是继续对齐 `getuploadurl` / CDN 流程，而不是另起一套 bridge 专用上传协议。

---

## 14. 重试、去重与运行时恢复

Hermes 的运行时韧性模型也值得参考。

### 14.1 Retry/backoff

文档给出的行为是：

- 第 1-2 次瞬时错误：2 秒后重试
- 连续 3 次以上错误：退避 30 秒
- `errcode=-14` 会话过期：暂停 10 分钟，通常需要重新登录
- 正常长轮询 timeout：立即重新 poll

### 14.2 Deduplication

Hermes 会基于 message ID 做 5 分钟窗口去重，用来避免网络抖动或重复 poll 响应带来的重复处理。

### 14.3 单 token 锁

Hermes 还显式限制：

- 同一个 token 同时只能被一个本地 gateway 使用

如果另一个进程已经持有同 token 的轮询，会直接启动失败。

这对本仓库是有价值的运行时约束：如果未来出现“多个 runtime 抢同一个 token”的问题，解决方式不是允许并行 poll，而是明确做实例互斥。

---

## 15. 关键配置项

Hermes 文档里，微信平台的重要配置项包括：

- `account_id`
- `token`
- `base_url`
- `cdn_base_url`
- `dm_policy`
- `group_policy`
- `allow_from`
- `group_allow_from`
- `split_multiline_messages`
- `text_batch_delay_seconds`
- `text_batch_split_delay_seconds`

其中对本仓库尤其重要的是：

- `account_id` / `token` / `base_url`
- DM allowlist 逻辑
- 群策略默认 `disabled`
- 分块相关行为是“超长才拆”，不是“多行就拆”

---

## 16. 对本仓库的直接启示

### 16.1 已经对齐的方向

本仓库当前 direct 路径已经与 Hermes 的总方向一致：

- 扫码登录
- direct 凭据
- `getupdates` 长轮询
- `sendmessage`
- `getconfig` / `sendtyping`

### 16.2 需要补强的实现点

结合 Hermes 文档，最值得优先补的点是：

#### A. 发送成功判定

如果只检查 HTTP 状态码，不检查 body 的 `ret` / `errcode` / `errmsg`，那么桥接层会把 iLink 业务失败静默吞掉。

#### B. 4000 字符分块

Hermes 已经给出平台上限和分块原则。本仓库应补：

- 4000 字符阈值
- 段落/空行/代码块优先分块
- 块间短延迟

#### C. token 持久化

`context_token` 应提升为可靠状态，而不是仅靠进程内 map。

#### D. 产品预期

要明确把“私聊可用、群聊不保证”作为微信 direct 的现实约束。

---

## 17. 与当前问题的关系

Hermes 文档已经把最关键的事实写得很清楚：

- 微信文本消息最大长度是 **4000 字符**
- 超长时必须分块
- 块间最好做节流

因此，对本仓库里“长摘要最后一条没到、前面短消息都到了”的问题，可以更有把握地判断：

- 这类故障形态与平台长度限制完全一致
- 如果发送代码又没有检查 body 返回值，那么就会出现“消息被拒但 bridge 误判为成功”的静默失败

---

## 18. 建议作为微信 direct 的实现基线

后续若继续完善 `claude-codex-wechat` 的微信接入，建议把以下内容作为基线：

- 扫码登录并持久化 `account_id` / `token` / `base_url`
- 基于 `getupdates` 的长轮询消息接收
- `context_token` 的捕获、持久化、恢复、自动回填
- `sendmessage` 的 body 级成功判定
- 基于 4000 字符阈值的智能文本分块
- `getconfig` + `sendtyping` 的输入态支持
- 群聊支持保持保守预期
- 媒体能力沿 `getuploadurl` + 加密 CDN 路线扩展

---

## 19. 参考

- Hermes Agent 文档：[Weixin (WeChat)](https://hermes-agent.nousresearch.com/docs/zh-Hans/user-guide/messaging/weixin)
