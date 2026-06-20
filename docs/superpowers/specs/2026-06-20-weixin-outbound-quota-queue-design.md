# 设计:配额感知出站队列 + 引导刷新

日期:2026-06-20 · 状态:已确认,待实现

## 目标

bot 给微信发回复受平台配额(最新 token 的 24h 窗口内最多 10 条)。一次任务的回复可能超过配额。本机制让超出的消息**排队暂存**,在第 10 条消息末尾**追加提示**引导用户回复,用户回复刷新 token 后**续发**队列,循环直到发完——用户始终能看到完整消息。

## 核心规则(已确认)

1. 配额单位 = **逻辑消息**(一次 `sendToChat` = 1 条;长文本 4000 分块算传输细节,仍计 1 条)。万一分块导致平台真实 `-3`,该条兜底入队。
2. 第 10 条(配额最后一个名额)**照常发实际内容**,只在**末尾追加**提示;之后的消息入队。
3. 用户回复**任意消息** → adapter 刷新 token + 配额 → **续发**队列(可能再到第 10 条又追加提示,循环)。
4. 续发用的这条消息**不进 AI**(纯刷新 + drain)。
5. AI 任务**不中断**,发不出的消息实时入队。
6. 队列清空后,消息恢复正常进入 AI。

## 架构

核心放 **messageRouter**(它既发消息又决定消息进不进 AI),配额状态复用 **weixinStateStore**,队列持久化到 config.json `bridge.weixinChannel.outbox[chatId]`。

为保持 messageRouter 的 channel 无关性,引入一个**可选接口** `OutboundDeliveryGate`,weixin 提供实现 `WeixinOutboundGate`;mock channel 不提供 gate → 直接发(测试与其它通道不受影响)。

```ts
interface OutboundDeliveryGate {
  hasPending(chatId: string): boolean;
  /** 投递一条逻辑消息:按配额决定直接发(可能追加提示)或入队。 */
  deliver(chatId: string, message: { kind: ChannelOutgoingMessage['kind']; text: string }): Promise<void>;
  /** 用户刷新后续发队列(发到再次撞第 10 条或发空)。 */
  drain(chatId: string): Promise<void>;
}
```

### 出站(messageRouter 统一出口 `sendToChat`)
messageRouter 现有 ~5 处直接 `channel.sendMessage`,改为统一经过 `sendToChat(chatId, kind, text)`:
- 有 gate → `gate.deliver(...)`;
- 无 gate → `channel.sendMessage(...)`(原行为)。

`WeixinOutboundGate.deliver` 逻辑:
1. 若该 chat 已有 pending 队列 → 入队,返回。
2. 取 `store.getQuota(chatId)`:
   - `remaining >= 2` → 发,`recordSent`。
   - `remaining === 1` → 发**内容 + 末尾提示**,`recordSent`(第 10 条)。
   - `remaining <= 0`(已满/过期) → 入队。

### 入站 drain(messageRouter.handleMessage 开头,在 AI 之前)
- 若 `gate?.hasPending(chatId)`:
  - 这条消息**不进 AI**;
  - 用户这条消息已让 adapter 刷新 token + 配额;
  - `await gate.drain(chatId)`(逐条续发,直到再次 `remaining===1` 追加提示 / 队列空);
  - 返回 `{ status: 'accepted' }`。

## 持久化

`bridge.weixinChannel.outbox: { [chatId]: Array<{ kind; text }> }`。weixinStateStore 增加:
- `enqueueOutbound(chatId, msg)`、`peekOutbound(chatId): msg[]`、`shiftOutbound(chatId): msg | undefined`、`hasPendingOutbound(chatId)`、`clearOutbound(chatId)`。

## 提示文案

第 10 条末尾追加:`\n\n（消息较多未发完，请回复任意消息继续接收）`。
(不写具体条数:发第 10 条时不一定能预知后续是否还有;用通用措辞,即便偶尔无剩余也不突兀。)

## 已知边界

- **开局即 `remaining<=0`**(配额被其它消息耗尽且用户未收到过提示):只能静默入队,无法引导(平台无名额发提示)。罕见;正常递减场景能在 `remaining===1` 发出提示。
- 提示搭在第 10 条上,不额外占名额。
- pending 期间用户**任何**消息都用于续发、不进 AI,直到队列清空。

## 测试

- weixinStateStore outbox:enqueue/peek/shift/hasPending/clear + 持久化 + 保留其它字段。
- WeixinOutboundGate:remaining>=2 直发;==1 发+追加提示;<=0 入队;已有 pending 时入队;drain 续发到再次第 10 条/发空。
- messageRouter:无 gate 时直发(回归);有 gate 时出站走 deliver;pending 时入站 drain 且不进 AI;队列空时正常进 AI。

## 不改

provider/runner、登录、轮询、媒体下载、配额计数底层(getQuota/recordSent)。
