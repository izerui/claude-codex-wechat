---
marp: true
theme: default
paginate: true
size: 16:9
header: 'claude-codex-wechat · 架构分享'
footer: 'v0.1.40 · 面向同行开发者'
style: |
  section { font-size: 26px; line-height: 1.5; }
  h1 { color: #1f6feb; }
  h2 { color: #24292f; border-bottom: 2px solid #d0d7de; padding-bottom: 6px; }
  code { background: #f6f8fa; padding: 1px 5px; border-radius: 4px; }
  table { font-size: 22px; }
  blockquote { border-left: 4px solid #1f6feb; background: #f6f8fa; padding: 8px 16px; }
  .small { font-size: 20px; color: #57606a; }
---

<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# 把 Claude Code 装进微信

## 一个「用微信遥控本地 AI CLI」的自托管桥接系统

<br>

**claude-codex-wechat** · v0.1.40

<span class="small">一台家用电脑 · 一个微信机器人 · 零公网依赖</span>

<!--
Speaker notes:
开场别念标题。先抛钩子(下一页)。
自我介绍 30 秒:我是作者,这是我的开源项目,今天讲它的架构设计、踩过的坑、以及一些我认为值得分享的取舍。
全程约 45-60 分钟,最后留 Q&A。
-->

---

## 先问一个问题

<br>

> ### 能不能躺在床上,用微信发一句话,
> ### 就让家里电脑上的 Claude Code 开始写代码,
> ### 写完把结果推回给你?

<br>

这个项目,就是干这个的。

<!--
Speaker notes:
这是全场的钩子。停顿两秒,让听众想象这个画面。
强调三个关键词:微信(随时随地的入口)、家里电脑(真正的算力和权限在本地)、推回给你(闭环)。
如果现场能 demo,这里直接切到手机演示 → 效果最好。
-->

---

## 今天讲什么

1. **它是什么** —— 定位与一个核心心智模型
2. **一条消息的一生** —— 完整数据流闭环
3. **整体架构** —— 三层 + 端口适配器
4. **四个核心设计** —— 会话续接 / 异构抽象 / 并发 / 抗卡死
5. **踩过的坑** —— 最真诚的部分
6. **架构反思** —— 做对的、风险、以及安全的辩证
7. **现状 · Roadmap · 一起玩**

<!--
Speaker notes:
快速过一遍议程,让听众有地图。
说明:前半是"怎么设计的",后半是"哪里不完美"。技术分享最有价值的是后半。
-->

---

## 它是什么:定位

<br>

微信官方有个「**智能机器人**」——一个现成的对话窗口,用户体验就像和 AI 聊天。

但它只是一根**管子**:不懂 AI、不存会话、不做计算。

<br>

> **真正干活的,是你本地电脑上的 claude / codex。**
> 微信官方只负责「把话递进来、把结果贴出去」。

<br>

本质:**借微信的对话框当前端,把本地 CLI 的能力投影到微信里。**

<!--
Speaker notes:
这一页要让听众建立正确的心智模型:大脑在本地,微信只是 I/O。
和网页版 ChatGPT 的区别:那个大脑在云端别人家;这个大脑在你自己电脑上,有你电脑的完整权限和文件。
这个区别是后面"安全"话题的伏笔。
-->

---

## 它是什么:为什么做

- CLI 很强,但**被锁在终端** —— 人不在电脑前就用不了
- 想要**随时随地**触发:通勤、床上、会议间隙,发条微信就行
- 想要**人机接力**:终端和微信换着来,续在同一个会话上

<br>

一句话痛点:

> Claude Code / Codex 是好东西,可惜它只活在我打开的那个终端窗口里。

<!--
Speaker notes:
讲真实动机,建立共鸣。多数开发者都有"人离开电脑就断线"的体验。
"人机接力"是个高级需求,先埋个伏笔,后面"原生会话续接"会回收它。
-->

---

## Demo(建议现场演示)

<br>

1. 手机微信 → 给机器人发:"看下当前目录有哪些文件,挑个 bug 修了"
2. 电脑上 daemon 收到 → spawn claude → 流式干活
3. 手机上逐段收到回复 + "正在输入…"
4. **接力**:电脑终端 `claude --resume`,接着刚才的会话继续

<br>

<span class="small">没有 demo 条件时:用录屏 / GIF 占位。</span>

<!--
Speaker notes:
Demo 是全场性价比最高的部分。哪怕 30 秒也要演。
演的时候刻意展示"流式"和"正在输入",这些细节后面会讲实现。
接力那步是杀手锏:证明微信和终端是同一条会话,不是两套。
-->

---

## 核心心智模型:一个「消息闭环」

```
 ①用户在微信机器人对话框输入
         │
 ②微信官方服务器收到
         │   ← 两种"进本地"方式(后面讲)
         ▼
 ③本地 daemon 收到(decode + 去重)
         │
 ④桥接层路由(鉴权 → 命令/聊天 → 找会话)
         │
 ⑤provider 执行(claude/codex 常驻子进程,流式产出)
         │
 ⑥桥接层收流、缓冲、分段 flush
         │
 ⑦调微信 API 发回 → 官方呈现到对话框
```

> 微信官方只出现在 ①⑦,中间 ②~⑥ 全是我们自己的地盘。

<!--
Speaker notes:
这张图是全场的骨架。后面每个技术点都会指回这张图的某一环。
强调:闭环。用户感知是"和 AI 聊天",实际是一条消息绕了你家电脑一圈。
-->

---

## 一条消息的一生(1/2):进来

**③ 收消息** —— `channels/weixin-direct/adapter.ts`

- `pollLoop` 每 ~900ms 调 `getUpdates`(游标轮询)
- 按 `msgId` 去重 → decode 成统一的 `ChannelIncomingMessage`
- `dispatch` → 交给桥接层 `MessageRouter.handleMessage`

**④ 路由** —— `session/messageRouter.ts`

- `resolveUser` 鉴权/配对(白名单)
- `parseBridgeCommand`:是 `/命令` 还是聊天?
- 找到当前会话(或恢复/新建)

<!--
Speaker notes:
注意:是本地"主动拉",不是微信"推"。这点下一页展开。
去重很重要:轮询 + 网络重试容易重复投递。
鉴权只有一道 resolveUser,记住这点,安全环节会回收。
-->

---

## 一条消息的一生(2/2):出去

**⑤ 执行** —— `providers/claude-code|codex`

- provider 的 `sendMessage` 返回 `AsyncIterable<ProviderEvent>`
- 事件流:`text_delta` / `message_done` / `choice_prompt` / `session_state` / `error`

**⑥⑦ 回送** —— 缓冲 → `outboundGate` → `channel.sendMessage`

- 文本缓冲,一段说完(`message_done`)才发一条,不逐字轰炸
- `outboundGate`:微信对机器人主动发消息**有配额**,超了排队,等用户下条消息刷新再续发

<!--
Speaker notes:
异步生成器是关键抽象:上层不管 claude 还是 codex,都是"await 下一个事件"。
配额闸是被官方接口逼出来的设计——不能想发就发,这是"受限画布"的体现。
-->

---

## 两种「进本地」的方式

| | **拉取模式(默认)** | **webhook + relay(可选)** |
|---|---|---|
| 机制 | 本地每 900ms 主动 `getUpdates` | 微信 webhook 打到公网 relay,relay 走 WebSocket 反向隧道推给内网 |
| 公网 IP | **不需要** | 需要(relay 那台) |
| 延迟 | ~900ms,聊天无感 | 更实时 |
| 部署 | 一台本地机 | 多一台公网 VPS |

> 反直觉点:大多数人本地没有公网 IP,所以默认不是"微信推给你",
> 而是**你的电脑每秒去问微信:有新消息吗?**

<!--
Speaker notes:
这里回收 ②→③ 那一环的"两种方式"。
"游标轮询"而非"长连接":每次带一个 get_updates_buf 游标 POST,官方连消息带下个游标一起返回。
强调"零公网依赖"是卖点:很多人以为微信机器人必须公网回调+备案,其实一个拉取接口就够了。
-->

---

## 部署形态:两个包,各就各位

| | **本地主包** `claude-codex-wechat` | **relay-server**(可选) |
|---|---|---|
| 跑在 | 你本地机器(有 claude/codex) | 公网 VPS |
| 角色 | 桥接 daemon 本体 | 反向隧道中转 |
| 启动 | `ccw service install`(launchd/systemd/win 服务,自愈) | `node bin/relay-server.mjs` |
| 必需 | ✅ 必需 | ⭕ 可选,拉取模式用不到 |

<span class="small">状态目录 `~/.claude-codex-wechat/` · Web 管理页默认 `127.0.0.1:8787`</span>

<!--
Speaker notes:
本地主包是本体,relay 是可选的公网件。
服务化是亮点:三平台各写一套(launchd 重写 plist、systemd user unit、Windows pid+detached),开机自启、崩溃自愈。
拉取模式下 relay 闲置,别让听众以为必须架公网服务器。
-->

---

## 整体架构:三层 + 端口适配器

```
   微信官方 ──getUpdates轮询──▶  ┌─────────────────────────┐
                                │  channels/  (通道层)      │  ChannelAdapter
                                ├─────────────────────────┤
                                │  session/   (编排层)      │  MessageRouter
                                │             会话/路由/并发 │  CurrentConversationStore
                                ├─────────────────────────┤
                                │  providers/ (适配层)      │  NativeProviderAdapter
                                └─────────────────────────┘
                                   claude 子进程 / codex app-server
```

- 单进程 Fastify daemon,`daemon/server.ts` 做**组合根**
- 两个接口 = 两个可插拔的插件点(已有 mock/fake 实现 → 可测试)

<!--
Speaker notes:
这是标准的端口-适配器(六边形)架构雏形。
ChannelAdapter 让"微信"可替换(理论上能换飞书/TG);NativeProviderAdapter 让"CLI"可替换(claude/codex/未来 Gemini)。
有 mock/fake 说明可测试性被认真对待——成熟度信号。
-->

---

## 两个核心接口

**ChannelAdapter**(通道端口)
```ts
start() / stop() / onMessage(handler) / sendMessage(msg)
setTyping?() / updateMessage?() / getHealth?()
```

**NativeProviderAdapter**(CLI 端口)
```ts
startSession() 
sendMessage(): AsyncIterable<ProviderEvent>
stopSession() / interruptSession?() / steerSession?()
listRecoverableSessions?() / attachSession?()
```

> 所有复杂度,都被收敛到这两个接口的实现里。

<!--
Speaker notes:
上层 MessageRouter 只依赖这两个接口,不认识"微信"或"claude"具体是谁。
steerSession / attachSession 带 ? 是可选能力——不同 provider 能力不同,后面会讲这个"漏抽象"。
-->

---

# 四个核心设计

<span class="small">每个都用「问题 → 朴素方案 → 为什么不行 → 最终方案」来讲</span>

<!--
Speaker notes:
过渡页。告诉听众:接下来是干货,四个我认为最有价值的设计决策。
-->

---

## 设计 ① 原生会话续接(灵魂)

**问题**:微信聊的、终端聊的,怎么算「同一个会话」?

**朴素方案**:桥接自己存一份对话历史
→ ❌ 两边会分叉;还丢掉了 CLI 的原生能力(resume/工具/权限)

**最终方案**:**不另存**,复用 CLI 原生 transcript
- 把桥接身份编码进**原生会话名**:`ccw::weixin::<用户>::<chatId>`
- 微信回合直接落在 claude 的原生 `.jsonl` 上
- 于是终端 `claude --resume` **天然接得上**

<!--
Speaker notes:
这是全项目最漂亮的架构杠杆:少写一个状态机,还白得"终端接力"能力。
sessionBridgeTag.ts 负责编码/解码这个 tag。
回收前面 demo 的"接力"和痛点的"人机协作"。
金句:最好的状态管理,是不自己管状态。
-->

---

## 设计 ① 续:代价与真相

- claude/codex 的 `--resume` / `thread/resume` 是**原地续写**,session id 稳定 → **不 fork**
- 多个进程 resume 同一会话?jsonl 是 **append-only 的树**,天然容忍多写入者
- 但会**隐式分叉**:各进程内存独立,不自动合并

> 反直觉点:多终端 resume 同一会话**不会崩、不会坏文件**,
> 但两条线各写各的分支,谁也看不见谁。

<span class="small">→ 想「无缝双向接管」,缺的是一个"让位"开关,不是文件锁。</span>

<!--
Speaker notes:
这个点很有意思,能制造记忆点。
很多人以为并发写会崩,其实 append-only 树容忍多写,只是语义上 fork。
这也解释了为什么"无缝双向"还没做:需要交接协议让常驻进程让位,而不是加锁。
-->

---

## 设计 ② 异构双 CLI 的统一抽象

两个 CLI,几乎处处不同:

| | **Claude Code** | **Codex** |
|---|---|---|
| 通信 | stream-json stdio | app-server JSON-RPC |
| 会话 id | `session_id` | `threadId` |
| 续接 | `--resume` | `thread/resume` |
| 插话 | 写 stdin envelope | `turn/steer` |
| 进程 | 常驻 stream-json | 常驻 app-server |

> 统一成一个 `NativeProviderAdapter`,上层完全无感。

<!--
Speaker notes:
这是最大的抽象工作量。两端的进程模型、事件流、resume 语义都不一样。
难点:把两套完全不同的"和 CLI 对话"的方式,抹平成同一个异步生成器接口。
诚实说:抽象没完全封住(后面架构反思会讲"漏抽象")。
-->

---

## 设计 ③ 全异步下的并发正确性

**问题**:消息乱序到达、命令与聊天交织、生成可能卡死、会话可能被中途切换。

**关键设计**(`messageRouter.ts`):

- **双链分离**:`commandChain` 与 `sessionOpChain` 相互独立
  → 一个**卡死的生成,永远堵不住 `/new`、`/stop`**
- **序号防串话**:`opSeq` / `latestMutatingSeq`
  → 被更晚命令取代的旧聊天,自动作废
- **native steer**:生成中来新消息 → 注入当前 turn,不排队

<!--
Speaker notes:
这是全系统最烧脑的部分,也是最能体现工程功力的地方。
双链:命令和生成分属两条 Promise 链,卡死的 CLI 不会拖死命令通道。
序号:解决"命令从命令链插队到排队聊天前面"导致的串话——很细的竞态。
这块代码注释密度极高,坦白说:聪明但脆,每次改动都要小心竞态。
-->

---

## 设计 ④ 抗卡死的防御式设计

前提假设:**CLI 随时可能挂起,连"中断"本身都可能挂起。**

- `abort` 与 `iterator.next()` **竞速** → 被抢占时立刻跳出,不等卡死的 CLI
- `interruptSession` **fire-and-forget** → 不等待,best-effort 清理
- **idle timeout(180s)** → 回收进程,但**保留会话记录**,重发即续
- **事件驱动 typing** → 靠事件刷新+节流,**零定时器**;provider 静默就靠微信 60s TTL 自己熄灭

<!--
Speaker notes:
设计哲学:假设下游一切都会卡死,把韧性做进架构。
typing 那个很优雅:没有 setInterval、没有 watchdog,provider 卡住就自然停刷新,微信自己熄灭指示。
idle timeout 保留会话是好体验:卡死不丢上下文,用户重发就接上。
-->

---

# 踩过的坑

<span class="small">最真诚,也最有共鸣的部分</span>

<!--
Speaker notes:
过渡。技术分享里,坦诚讲坑比秀成功更打动人,也更容易赢得同行尊重。
-->

---

## 坑 ① 依赖 CLI 的私有格式(最脆的承重墙)

为了"认出哪条原生会话属于哪个微信用户",要直接操作 CLI 未公开的内部文件:

- 扫 `~/.claude/projects/*.jsonl`,解析 metadata
- 往 `history.jsonl` 写 display、注入 `custom-title`/`agent-name`
- 改 `entrypoint: sdk-cli → cli`、补 `permission-mode`

> 依赖了两个**我无法控制、且高频迭代**的上游产品的私有结构。
> 上游一次版本更新,就可能让会话识别静默失效。

<!--
Speaker notes:
这是我最大的技术债,也是最诚实要讲的点。
nativeSessions.ts 里全是对 Claude 内部存储格式的逆向。
风险定级:高。缓解方向(后面讲):收拢成抗腐层 + 版本探测 + 优雅降级。
-->

---

## 坑 ②③④ 其它硬骨头

**② 跨平台进程树**
Windows 无进程组信号,而 claude 会拉起孙子进程 → 只能 `taskkill /T` 杀整棵树;`.cmd/.ps1` 还要经 shell 解析。

**③ 微信官方接口不友好**
长轮询(非 webhook)、发送配额、消息去重、typing 60s TTL、媒体加解密。

**④ 内网穿透**
微信 webhook 要公网、daemon 在内网 → 自研 relay-server WebSocket 反向隧道 + token 鉴权。

<!--
Speaker notes:
这几个是"工程量大但不玄"的坑,快速过。
进程树那个:POSIX 一个 SIGTERM 搞定,Windows 要 taskkill /T /F 杀树,还得处理包装器。
微信接口:适配一个约束很多的官方 API,细节多。
-->

---

# 架构反思

<span class="small">戴上架构师的帽子,辩证地看</span>

<!--
Speaker notes:
过渡。前面讲了"做对的",这里讲"哪里有取舍、哪里有风险"。
-->

---

## 架构评分卡

| 维度 | 评价 |
|---|---|
| 分层与解耦 | ⭐⭐⭐⭐ 端口-适配器清晰,可插拔 |
| 并发正确性 | ⭐⭐⭐⭐ 认真精巧,但靠手写编排、脆 |
| 容错韧性 | ⭐⭐⭐⭐ 防御式,假设一切会卡死 |
| 可测试性 | ⭐⭐⭐⭐ 有 mock/fake |
| **安全** | ⭐⭐ 全权限执行 + 管理面易裸奔 |
| **上游稳定性** | ⭐⭐ 深度耦合 CLI 私有格式 |
| 可伸缩性 | ⭐⭐ 全局单会话,天花板低 |

<!--
Speaker notes:
诚实打分。四星的是设计品味和工程韧性,两星的是三个真实风险。
不回避低分项——这才是有价值的分享。
-->

---

## 本质:一次「阻抗匹配」

> 核心工作 = 把一个「单机、有状态、交互式、随时会卡死」的 CLI,
> 阻抗匹配到一个「无状态、异步、受限、配额化」的 IM 通道上。

两端的**会话模型、并发模型、生命周期**完全不同,
daemon 夹在中间做转换。

<span class="small">想清楚这一点,所有优点和风险都能归位——难点全在"两端不匹配"的缝里。</span>

<!--
Speaker notes:
这是我对整个项目最凝练的一句定性。
所有的核心设计(会话续接、并发、抗卡死)本质都是在填这两端不匹配的缝。
-->

---

## 三个真实风险

- 🔴 **依赖上游私有格式** —— 建在流沙上,上游改版即碎
- 🟡 **全局单会话** —— 架构上是"单会话遥控器",多用户会互相顶替
- 🟡 **抽象有泄漏** —— Claude/Codex 差异仍从缝里漏(steer/resume/id 各异),上层散落 `if provider==='codex'`

<br>

<span class="small">这些不是"没写完",是**架构层面的取舍**——个人自用完全 OK,要长成多租户服务则需重构。</span>

<!--
Speaker notes:
单会话是硬约束:CurrentConversationStore 只有一个 current。
这决定了产品天花板:现在是个人单会话工具,不是多租户服务。设计稿有,但没啃——诚实说明。
-->

---

## 安全:一个值得辩证的取舍

**现状**:claude `--dangerously-skip-permissions` + codex `approvalMode:never`
→ 微信来的消息,在本地有**完整文件/命令执行权限**。

**辩证**:这是**个人自用**场景 —— 全权限正是它有用的原因,沙箱化等于自废武功。

> 所以别去动执行层。**正因为执行层全权限,入口鉴权就成了唯一且必须坚固的防线。**

<!--
Speaker notes:
这是我最想和同行讨论的取舍。
不要教条地喊"要沙箱"——个人工具全权限是 feature。
但一旦把管理面穿透到公网,入口就是唯一防线。单点防御 = 这个点不能有洞。
-->

---

## 安全:防线该焊在哪

两个入口,风险不对称:

| 入口 | 现状 | 风险 |
|---|---|---|
| 微信消息 | 微信官方身份 + 配对白名单 | 🟢 较安全 |
| HTTP `/api` + Web 管理页 | **无请求鉴权** | 🔴 穿透到公网即裸奔 |
| relay 隧道 | 有 `clrt_` token | 🟡 覆盖需确认 |

**建议**:① 管理面加简单 token 鉴权(覆盖所有 HTTP 入口 + 常量时间比较 + HTTPS);② 或更彻底 —— **管理面根本别暴露公网**,只穿微信需要的那条。

<!--
Speaker notes:
洞不在微信那条路(有官方身份挡着),在 HTTP 管理面。
"加个 401"方向对,但要焊在管理面、且不能漏入口。
最小暴露面原则:能不暴露就不暴露,比加鉴权更彻底。
-->

---

## 现状 · 能用与不能用

| 用法 | 状态 |
|---|---|
| 微信当唯一入口聊一个会话 | ✅ 可用 |
| 跨平台(mac/linux/win) | ✅ 三平台显式适配 |
| CLI 开的会话 → 微信空闲时恢复 | ⚠️ 半自动(精确重连) |
| 微信 ↔ CLI **无缝双向接管** | ❌ 未做(需"让位"开关) |

<span class="small">auto-attach 很保守:仅"无 current + sidecar 有旧会话"时精确重连,不猜不抢。</span>

<!--
Speaker notes:
诚实交代边界。核心能用,双向接管是明确的未来功能。
auto-attach 保守是好事:allowHeuristicMatch:false,只认自己上次那条,不会误抓你手动开的会话。
-->

---

## Roadmap

- 🔐 **P0 安全**:管理面鉴权 / 最小暴露面 / 审计日志
- 🛡️ **P1 抗腐层**:收拢 CLI 私有格式依赖 + 版本探测 + 优雅降级
- 🔀 **P2 双向接管**:`/handoff` 让位开关(id 稳定 → 收回天然无缝)
- 🧩 **P3 多会话**:若要走向多租户,隔离是绕不过的坎
- 📈 **P4 可观测性** + 锁依赖版本

<!--
Speaker notes:
按优先级排。P0/P1 是"承重墙",P2/P3 是产品演进。
双向接管的关键洞察:因为 resume 原地续写、id 稳定,只要让常驻进程"让位",收回时直接 resume 同 id 就无缝——不需要复杂的历史合并。
-->

---

## 几点可复用的经验

1. **别重新发明状态** —— 能复用上游的,就复用(会话续接)
2. **把外部世界变成插件** —— 端口-适配器,换 IM/换 CLI 只改一个实现
3. **假设下游会卡死** —— 把韧性做进架构,而非事后打补丁
4. **并发要么形式化,要么极度小心** —— 手写编排很强,但脆
5. **安全要看场景** —— 全权限不一定是错,但要配一道坚固的入口

<!--
Speaker notes:
这几条是抽离出项目、可以带走的通用经验。
面向同行,这页最有"可迁移价值",讲慢一点。
-->

---

## 一起玩

<br>

- **仓库**:github.com/izerui/claude-codex-wechat
- **技术栈**:TypeScript · Fastify · stream-json · JSON-RPC · React 管理页
- **上手**:`npm i -g` → `ccw service install` → 配微信机器人 token
- **欢迎**:Issue / PR / 一起把双向接管做出来

<br>

### Q & A

<!--
Speaker notes:
号召贡献,最好提前准备 2-3 个 good-first-issue。
预判问题:
- 微信机器人 token 怎么来?
- 会不会被封?
- 和 MCP/Agent SDK 的关系?
- 多用户支持?(诚实答:架构上单会话,是已知约束)
- 安全?(回收前面的辩证)
留联系方式。
-->

---

<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# 谢谢

## 大脑在你自己的电脑上,
## 微信只是它的一张嘴。

<span class="small">claude-codex-wechat · 欢迎 Star / PR</span>

<!--
Speaker notes:
用一句能记住的话收尾,呼应开场的心智模型。
谢谢,进入 Q&A。
-->
