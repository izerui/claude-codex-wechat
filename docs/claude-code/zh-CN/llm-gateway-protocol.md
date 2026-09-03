> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Gateway 协议参考

> Claude Code 与 LLM gateway 之间的 API 契约：端点、要转发的请求头和请求体字段、字段被删除时的功能降级、用于成本跟踪的归属请求头以及模型发现。

本页面记录了 Claude Code 发送到 gateway 的请求，包括它调用的端点、gateway 必须转发的请求头和请求体字段，以及当 gateway 不转发这些内容时哪些功能会停止工作。本页面是为配置 gateway 产品以与 Claude Code 配合工作的运营人员编写的。

一个运行中的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 在 `GET /protocol` 处提供此契约的机器可读版本，涵盖相同的转发要求以及 Claude apps gateway 特定的 SSO 登录、托管设置交付和遥测端点。Claude apps gateway 从与 CLI 相同的 `claude` 二进制文件运行，因此 [Claude apps gateway 快速入门](/docs/zh-CN/claude-apps-gateway#quickstart) 是获取可以从中获取规范的运行实例的最短路径。

<Note>
  * 要为您的组织推出现有或第三方 gateway，请参阅[推出 LLM gateway](/docs/zh-CN/llm-gateway-rollout)
  * 如果您是使用给定凭证向 gateway 验证 Claude Code 的个人开发者，请参阅[将 Claude Code 连接到 LLM gateway](/docs/zh-CN/llm-gateway-connect)
</Note>

本页面涵盖：

* [API 格式](#api-formats)和每种格式要提供的端点
* [请求头](#request-headers)：哪些必须到达上游，哪些您的 gateway 可以使用
* [系统提示归属块](#system-prompt-attribution-block)及其与提示缓存的交互方式
* [功能传递](#feature-pass-through)：当请求头或请求体字段被删除时会破坏什么
* [模型发现](#model-discovery)

本页面对您的 gateway 处理每个请求头和请求体字段的方式使用两个术语：

* **转发不变**：将其逐字节传递到上游
* **使用**：gateway 可能会读取它用于路由、归属或跟踪，不需要转发它

任何未标记为转发不变的内容都可以由您使用或忽略。

<h2 id="api-formats">
  API 格式
</h2>

gateway 必须向 Claude Code 客户端公开以下至少一种 API 格式。Claude Code 使用哪种格式由客户端的配置决定：下表"选择者"列中的变量指向您的 gateway 使用该格式。Google Cloud 的 Agent Platform 是 Google Cloud 的 Claude 端点，原名 Vertex AI；其变量名保留 `VERTEX` 拼写。

| 格式                                       | 选择者                                                         | 端点                                                                   | 转发不变                                                                    |
| :--------------------------------------- | :---------------------------------------------------------- | :------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| Anthropic Messages                       | `ANTHROPIC_BASE_URL`                                        | `/v1/messages`、`/v1/messages/count_tokens`（可选）                       | `anthropic-beta` 和 `anthropic-version` 请求头                              |
| Amazon Bedrock InvokeModel               | `ANTHROPIC_BEDROCK_BASE_URL` 配合 `CLAUDE_CODE_USE_BEDROCK=1` | `/model/{model}/invoke`、`/model/{model}/invoke-with-response-stream` | `anthropic_beta` 和 `anthropic_version` 请求体字段                            |
| Google Cloud 的 Agent Platform rawPredict | `ANTHROPIC_VERTEX_BASE_URL` 配合 `CLAUDE_CODE_USE_VERTEX=1`   | `:rawPredict`、`:streamRawPredict`、`count-tokens:rawPredict`（可选）      | `anthropic-beta` 和 `anthropic-version` 请求头，以及 `anthropic_version` 请求体字段 |

<h3 id="foundry-and-claude-platform-on-aws">
  Foundry 和 AWS 上的 Claude Platform
</h3>

Microsoft Foundry 和 [AWS 上的 Claude Platform](/docs/zh-CN/claude-platform-on-aws) 实现了 Anthropic Messages 格式。Claude Code 通过它们自己的变量 `ANTHROPIC_FOUNDRY_BASE_URL` 和 `ANTHROPIC_AWS_BASE_URL` 路由到它们，但 fronting 任一方的 gateway 实现上面的 Anthropic Messages 行。fronting AWS 上的 Claude Platform 的 gateway 还必须转发 `anthropic-workspace-id` 请求头，[该平台在每个请求上都需要](/docs/zh-CN/claude-platform-on-aws)。

<h3 id="optional-endpoints-and-startup-traffic">
  可选端点和启动流量
</h3>

令牌计数端点是唯一可选的：当它们不存在时，Claude Code 在本地估计上下文使用情况。推理请求发送到 `/v1/messages?beta=true`，因此请匹配路径，而不是完整 URL。Google Cloud 的 Agent Platform 方法后缀附加到发布者模型路径，如 `/projects/{project}/locations/{location}/publishers/anthropic/models/{model}:streamRawPredict`。

gateway 还会看到尽力而为的启动流量，它可以拒绝而不会破坏任何东西：一个 `HEAD /` 连接探针，以及在 Amazon Bedrock 格式 gateway 上的 `GET /inference-profiles?type=SYSTEM_DEFINED` 请求。

<h3 id="streaming">
  流式传输
</h3>

推理响应必须流式传输。Claude Code 在服务器发送事件到达时使用它们，因此缓冲完整响应然后中继它们的 gateway 会使客户端停滞。

<h3 id="format-mismatch-with-the-upstream">
  与上游的格式不匹配
</h3>

客户端使用的格式决定了您的 gateway 接收的内容。常见的失败模式是客户端发送到您的 gateway 的格式与上游提供商接受的格式之间的不匹配。

* 当客户端使用 Amazon Bedrock 或 Google Cloud 的 Agent Platform 格式时，Claude Code 仅发送这些提供商接受的完整功能集的子集
* 当客户端使用 Anthropic Messages 格式时，Claude Code 发送完整集合，即使您的 gateway 转发到 Amazon Bedrock 或 Google Cloud 的 Agent Platform 上游

弥合这种差异是您的 gateway 的工作。[功能传递](#feature-pass-through)描述了当它不这样做时会破坏什么。

<h2 id="request-headers">
  请求头
</h2>

Claude Code 在 API 请求上包含这些请求头。请求头名称在网络上不区分大小写。转发 `anthropic-version` 和 `anthropic-beta` 不变，加上当上游是 [AWS 上的 Claude Platform](/docs/zh-CN/claude-platform-on-aws) 时的 `anthropic-workspace-id`；其余的 gateway 可能会使用它们进行路由、归属和跟踪，不需要转发。

| 请求头                             | 描述                                                                                                                                                                            |
| :------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorization`、`x-api-key`     | 开发者的 gateway 凭证，根据他们设置的[凭证变量](/docs/zh-CN/llm-gateway-connect#set-the-credential-variable)在一个或两个请求头中                                                                               |
| `anthropic-version`             | API 版本，目前为 `2023-06-01`。Amazon Bedrock 和 Google Cloud 的 Agent Platform 格式请求也携带 `anthropic_version` 请求体字段，其值是提供商方言字符串，而不是此请求头的值                                                |
| `anthropic-beta`                | 请求的逗号分隔功能值。逐字转发请求头；不要将单个值列入白名单，因为该集合随 Claude Code 版本而变化。当开发者使用 claude.ai 登录进行身份验证时（当设置 `ANTHROPIC_BASE_URL` 而不设置 gateway 凭证变量时可能），此请求头还携带上游需要的 OAuth 功能，删除它会导致这些请求失败，返回 `401` |
| `x-claude-code-session-id`      | 当前 Claude Code 会话的唯一标识符。使用它来聚合来自一个会话的所有请求，而无需解析请求体                                                                                                                            |
| `x-claude-code-agent-id`        | 发出请求的[子代理](/docs/zh-CN/sub-agents)的标识符，仅在来自 Claude Code 在会话内生成的代理的请求上存在。将其与会话 ID 一起使用以将成本归属于并行代理                                                                                   |
| `x-claude-code-parent-agent-id` | 生成请求代理的代理的标识符，仅对嵌套代理存在                                                                                                                                                        |

子代理 ID 在每次生成时都会生成新的。队友代理，[代理团队](/docs/zh-CN/agent-teams)的命名成员，在重新连接时重用基于名称的稳定 ID。在两种情况下，ID 都标识一个代理，而不是一个人或设备，因此不要将代理 ID 请求头视为用户标识符。

如果您的开发者设置了 `ANTHROPIC_CUSTOM_HEADERS`，这些请求头也会出现在请求上。

<h3 id="forward-as-open-lists">
  作为开放列表转发
</h3>

将请求头和请求体字段视为开放列表，而不是封闭列表。Claude Code 在版本中获得功能，它们作为新的 `anthropic-beta` 值、新的请求体字段以及偶尔新的 `anthropic-*` 或 `x-claude-code-*` 请求头到达。

转发到 Anthropic 格式上游时，将 `anthropic-*` 请求头和请求体字段原封不动地传递，而不是将您今天看到的列入白名单。固定到观察列表的 gateway 会删除下一个功能的请求头或字段，并在引入它的版本上破坏它。

例外是非 Anthropic 上游，如 Amazon Bedrock 或 Google Cloud 的 Agent Platform，其中弥合架构差异是 gateway 的工作；请参阅[功能传递](#feature-pass-through)。

<h2 id="system-prompt-attribution-block">
  系统提示归属块
</h2>

Claude Code 在系统提示前面加上一个短的归属块，其中包含客户端版本和从对话派生的指纹。`api.anthropic.com` 端点在处理前删除该块，因此它不会影响第一方提示缓存。任何其他上游都会将其作为提示的一部分接收。

该删除是位置相关的，因此只有在网关原样转发 `system` 数组时才有效。要在不丢失其他系统内容的情况下将该块排除在提示之外：

* 完全按照接收的方式转发 `system` 数组，保持该块在最前面：在前面加上另一个系统块、重新排序数组或将其转换为单个字符串会破坏删除，该块随后会到达模型和提示缓存键。
* 将该块保留在其自己的数组条目中：端点将以归属标头开头的合并块视为完整的归属，并删除合并到其中的所有内容，包括系统提示的其余部分。
* 如果您的网关必须重新整形系统内容，请设置 [`CLAUDE_CODE_ATTRIBUTION_HEADER=0`](/docs/zh-CN/env-vars) 以便 Claude Code 省略该块。Anthropic 和云提供商的 Claude 端点读取该块以进行归属，因此要在客户端省略它，而不是在网关中删除或移动它。

未修改到达端点的请求不受影响。

从 Claude Code v2.1.181 开始，当请求通过自定义基础 URL 路由时，该块在对话的生命周期内是稳定的，因此以完整请求体为键的 gateway 端提示缓存可以在不禁用它的情况下工作。在 v2.1.181 之前，该块包含每个请求的令牌；在这些版本上，如果您的 gateway 实现了这样的缓存，请设置 `CLAUDE_CODE_ATTRIBUTION_HEADER=0`。

<h2 id="feature-pass-through">
  功能传递
</h2>

Claude Code 将 `ANTHROPIC_BASE_URL` gateway 视为 Anthropic 格式端点，并向其发送它发送到 `api.anthropic.com` 的 beta 请求头和请求体字段，除了为直接连接保留的一小组诊断和默认值，例如下面涵盖的细粒度工具流式传输默认值。该集合因版本而异，因此不要依赖其内容。

添加请求体字段的功能将它们与 beta 请求头配对，该对一起传递。删除请求头同时传递请求体的 gateway，或将 Anthropic 格式请求体转发到具有不同架构的上游，会产生硬 `400` 错误；只有当两个部分一起缺失时，功能才会安静地关闭。重写或编辑请求体以进行内容检查的 gateway 会以与删除相同的方式破坏配对，因此在不修改的情况下检查。该表注明了功能偏离配对的位置。

细粒度工具流式传输是直接连接默认值之一：每当请求通过自定义基础 URL 路由时，它默认关闭，当开发者设置 [`CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING=1`](/docs/zh-CN/env-vars) 时，gateway 会接收它。

| 功能                                                                                                                                                                                                                | 请求头和请求体对                                                                                                           | 破坏时的症状                                                                                                              | 补救                                                                                 |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------- |
| [自适应推理](/docs/zh-CN/model-config#adjust-effort-level)                                                                                                                                                                  | 无 beta 请求头。Claude Code 为 Claude 4.6 及更高版本发送 `thinking: {"type": "adaptive"}`，并将它不识别的模型名称（如 gateway 别名）视为接收该字段的当前模型 | 当上游模型构建不接受它时，命名 `thinking` 字段或 `adaptive` 标签的 `400`                                                                 | 升级上游。在 Opus 4.6 和 Sonnet 4.6 上，开发者可以改为设置 `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` |
| [上下文管理](https://platform.claude.com/docs/en/build-with-claude/context-management)                                                                                                                                 | 上下文管理 beta 请求头与 `context_management` 请求体字段配对                                                                       | `400` 带有 `Extra inputs are not permitted`。常见于 gateway 接受 Anthropic 格式请求但将其转发到 Amazon Bedrock 时                      | 转发两者，或 [`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`](/docs/zh-CN/env-vars)               |
| [扩展上下文](https://platform.claude.com/docs/en/build-with-claude/context-windows#context-window-sizes-by-model)和[交错思考](https://platform.claude.com/docs/en/build-with-claude/extended-thinking#interleaved-thinking) | 仅 Beta 请求头，无请求体字段                                                                                                  | 当请求头被删除时无声地不可用；上游永远不会看到功能请求                                                                                         | 逐字转发 `anthropic-beta`                                                              |
| Beta [工具字段](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)                                                                                                                               | 工具相关的 beta 请求头与工具架构字段（如 `strict` 和 `defer_loading`）配对                                                              | 当请求体通过而没有其请求头时，命名无法识别的工具架构字段的 `400`                                                                                 | 转发两者，或 `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`                                  |
| [努力](https://platform.claude.com/docs/en/build-with-claude/effort)和[结构化输出](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)                                                              | `output_config` 请求体字段携带努力、结构化输出格式和任务预算设置；每个都与自己的 beta 请求头配对                                                        | 在 Amazon Bedrock 和 Google Cloud 的 Agent Platform 上游上命名 `output_config` 的 `400`，通常是 `Extra inputs are not permitted` | 一起转发字段及其请求头                                                                        |
| [令牌计数](https://platform.claude.com/docs/en/build-with-claude/token-counting)                                                                                                                                      | 无 beta 配对；使用 `count_tokens` 端点                                                                                     | Claude Code 回退到在本地估计上下文使用情况                                                                                         | 如果您想要精确计数，请公开该端点                                                                   |

`ANTHROPIC_DEFAULT_*_MODEL_SUPPORTED_CAPABILITIES` [变量](/docs/zh-CN/model-config)仅在提供商配置中声明模型功能：`CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_VERTEX`、`CLAUDE_CODE_USE_FOUNDRY` 和 [`CLAUDE_CODE_USE_MANTLE`](/docs/zh-CN/amazon-bedrock#use-the-mantle-endpoint)。它们在 `ANTHROPIC_BASE_URL` gateway 后面没有效果。

<h3 id="automatic-retry-and-error-forwarding">
  自动重试和错误转发
</h3>

Claude Code 在某些上游拒绝后自动重试，并为对话的其余部分禁用被拒绝的功能。`thinking` 字段的拒绝、[思考签名](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)的拒绝和中途对话系统消息的拒绝都以这种方式恢复。上下文管理和工具架构字段拒绝不重试；这些 `400` 错误到达开发者。

重试逻辑与上游的错误措辞匹配，因此原封不动地转发错误响应体。将上游错误包装在自己的信封中的 gateway 会破坏恢复路径，即使它保留了状态代码。

<h3 id="disable-pre-release-capabilities">
  禁用预发布功能
</h3>

`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` 阻止 Claude Code 在每个提供商上发送预发布功能及其请求体字段，包括上下文管理和 beta 工具字段。它不影响自适应推理，后者由模型而不是 beta 选择，它永远不会抑制订阅身份验证所需的 OAuth 功能。

Claude Code 发送的功能集随版本增长。有关当前 beta 请求头字符串，请参阅 [beta 请求头参考](https://platform.claude.com/docs/en/api/beta-headers)；针对新的 Claude Code 版本测试您的 gateway，而不是固定到观察列表。

<h2 id="model-discovery">
  模型发现
</h2>

当 `ANTHROPIC_BASE_URL` 指向公开 Anthropic Messages 格式的 gateway 时，Claude Code 可以在启动时查询 gateway 的 `/v1/models` 端点，并将返回的模型添加到 `/model` 选择器。

开发者通过在自己的环境中或通过托管设置设置 [`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`](/docs/zh-CN/env-vars) 来启用它。发现默认关闭，以便由共享 API 密钥支持的 gateway 不会向每个用户公开密钥可以访问的每个模型。这需要 Claude Code v2.1.129 或更高版本。

<h3 id="when-discovery-runs">
  发现何时运行
</h3>

发现仅适用于 Anthropic Messages 格式。在以下情况下不运行：

* 设置了任何 `CLAUDE_CODE_USE_*` 提供商变量，即使也设置了 `ANTHROPIC_BASE_URL`
* `ANTHROPIC_BASE_URL` 未设置或指向 `api.anthropic.com`
* 非必要流量被禁用，通过 [`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`](/docs/zh-CN/env-vars) 或组织策略

<h3 id="request-and-response">
  请求和响应
</h3>

请求是 `GET /v1/models?limit=1000`，超时为 3 秒，任何重定向都被视为失败，因此凭证不会泄露到重定向目标。响应缓慢或重定向 `/v1/models` 的 gateway，即使是 `http` 到 `https`，也会无声地失败发现；在配置的基础 URL 处直接提供端点。

发现请求恰好发送一个凭证请求头：

* 设置时 `ANTHROPIC_AUTH_TOKEN` 作为承载令牌
* 否则解析的 API 密钥，包括 [`apiKeyHelper`](/docs/zh-CN/llm-gateway-connect#rotate-credentials-with-apikeyhelper) 值，在 `x-api-key` 请求头中

这与推理请求不同，后者在两个请求头中发送帮助程序值。验证 `/v1/models` 的 gateway 必须为帮助程序部署接受 `x-api-key`。来自 `ANTHROPIC_CUSTOM_HEADERS` 的任何请求头也包括在内。

Claude Code 从响应的 `data` 数组中的每个条目读取 `id` 和可选的 `display_name`，并忽略其 `id` 不以 `claude` 或 `anthropic` 开头的条目：

```json theme={null}
{
  "data": [
    { "id": "claude-sonnet-4-6", "display_name": "Claude Sonnet 4.6" },
    { "id": "claude-opus-4-8" }
  ]
}
```

<h3 id="picker-entries-and-caching">
  选择器条目和缓存
</h3>

选择器是当开发者在 Claude Code 中运行 `/model` 时打开的交互式模型列表。每个发现的条目都标记为"来自 gateway"，并在提供时使用 `display_name`。[`availableModels` 托管设置](/docs/zh-CN/settings#available-settings)限制了发现可以添加的内容。

仅当发现的 ID 与选择器中已有的行完全匹配时，或当发现的和现有的 ID 都解析为 [Fable](/docs/zh-CN/model-config#work-with-fable-5) 时，才会跳过发现的 ID。从 Claude Code v2.1.197 开始，当发现的显式 ID 和内置条目都解析为同一模型时，发现的显式 ID 也会折叠到内置条目中。内置行按别名（如 `sonnet`）键入，因此发现的显式 ID（如别名当前解析到的模型 `claude-sonnet-5`）会折叠到 `sonnet` 行中，而别名不解析到的 ID（如 `claude-sonnet-4-6`）仍会在内置条目旁边添加自己的"来自 gateway"行。

结果被缓存到 `~/.claude/cache/gateway-models.json`，或在 Windows 上 `%USERPROFILE%\.claude\cache\gateway-models.json`，并在每次启动时刷新。如果请求失败或 gateway 未实现 `/v1/models`，选择器会回退到上次启动的缓存列表或内置模型列表。如果您的 gateway 在不匹配发现过滤器的别名下提供 Claude 模型，开发者可以使用[模型配置](/docs/zh-CN/model-config)变量手动添加这些别名。

<h2 id="related-resources">
  相关资源
</h2>

有关 gateway 文档集的其余部分和基础 API 参考：

* [Gateway 概述](/docs/zh-CN/gateways)：什么是 gateway 以及如何在 Claude 应用 gateway 和其他产品之间进行选择
* [其他 LLM gateway](/docs/zh-CN/llm-gateway)：如何推出您的组织运行的 gateway 以及它如何与 claude.ai 订阅交互
* [为您的组织推出 LLM gateway](/docs/zh-CN/llm-gateway-rollout)：使用此契约的管理员检查清单
* [将 Claude Code 连接到 LLM gateway](/docs/zh-CN/llm-gateway-connect)：每个开发者的配置和故障排除表
* [Beta 请求头参考](https://platform.claude.com/docs/en/api/beta-headers)：当前的 `anthropic-beta` 值集
* [Messages API](https://platform.claude.com/docs/en/api/messages)：Anthropic 格式 gateway 实现的 API 格式
