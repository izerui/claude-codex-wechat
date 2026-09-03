> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 错误参考

> 查找 Claude Code 运行时错误消息，了解每个错误的含义以及如何修复。

本页列出了 Claude Code 显示的运行时错误以及如何从每个错误中恢复，以及当响应似乎有问题但没有错误时要检查的内容。对于安装错误（如 `command not found` 或设置期间的 TLS 故障），请参阅[故障排除安装和登录](/docs/zh-CN/troubleshoot-install)。

这些错误和恢复命令适用于 CLI、[桌面应用](/docs/zh-CN/desktop)和[网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)，因为这三个都包装了相同的 Claude Code CLI。对于特定于表面的问题，请参阅该表面页面上的故障排除部分。

<Note>
  Claude Code 调用 Claude API 获取模型响应，因此大多数运行时错误映射到底层 API 错误代码。本页介绍了每个错误在 Claude Code 中的含义以及如何恢复。有关原始 HTTP 状态代码定义，请参阅 [Claude Platform 错误参考](https://platform.claude.com/docs/en/api/errors)。
</Note>

<h2 id="find-your-error">
  查找您的错误
</h2>

将您在终端中看到的消息与下面的部分相匹配。

| 消息                                                                                                 | 部分                                                                          |
| :------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| `API Error: 500 Internal server error`                                                             | [服务器错误](#api-error-500-internal-server-error)                               |
| `API Error: Repeated 529 Overloaded errors`                                                        | [服务器错误](#api-error-repeated-529-overloaded-errors)                          |
| `Request timed out`                                                                                | [服务器错误](#request-timed-out)，或[网络](#unable-to-connect-to-api)（如果消息提到您的互联网连接） |
| `Server error mid-response. The response above may be incomplete.`                                 | [服务器错误](#the-response-above-may-be-incomplete)                              |
| `Connection closed mid-response` / `Response stalled mid-stream`                                   | [服务器错误](#the-response-above-may-be-incomplete)                              |
| `<model> is temporarily unavailable, so auto mode cannot determine the safety of...`               | [服务器错误](#auto-mode-cannot-determine-the-safety-of-an-action)                |
| `Auto mode could not evaluate this action and is blocking it for safety`                           | [服务器错误](#auto-mode-cannot-determine-the-safety-of-an-action)                |
| `Auto mode classifier transcript exceeded context window`                                          | [服务器错误](#auto-mode-cannot-determine-the-safety-of-an-action)                |
| `Agent terminated early due to an API error`                                                       | [服务器错误](#agent-terminated-early-due-to-an-api-error)                        |
| `You've hit your session limit` / `You've hit your weekly limit`                                   | [使用限制](#youve-hit-your-session-limit)                                       |
| `Usage credits required for 1M context`                                                            | [使用限制](#usage-credits-required-for-1m-context)                              |
| `Server is temporarily limiting requests`                                                          | [使用限制](#server-is-temporarily-limiting-requests)                            |
| `Request rejected (429)`                                                                           | [使用限制](#request-rejected-429)                                               |
| `Credit balance is too low`                                                                        | [使用限制](#credit-balance-is-too-low)                                          |
| `Not logged in · Please run /login`                                                                | [身份验证](#not-logged-in)                                                      |
| `Could not resolve authentication method`                                                          | [身份验证](#could-not-resolve-authentication-method)                            |
| `Invalid API key`                                                                                  | [身份验证](#invalid-api-key)                                                    |
| `Your apiKeyHelper script is failing`                                                              | [身份验证](#your-apikeyhelper-script-is-failing)                                |
| `This organization has been disabled`                                                              | [身份验证](#this-organization-has-been-disabled)                                |
| `Your organization has disabled API key authentication`                                            | [身份验证](#your-organization-has-disabled-api-key-authentication)              |
| `Your organization has disabled Claude subscription access`                                        | [身份验证](#your-organization-has-disabled-claude-subscription-access)          |
| `Routines are disabled by your organization's policy`                                              | [身份验证](#routines-are-disabled-by-your-organizations-policy)                 |
| `Remote Control is only available when using Claude via api.anthropic.com`                         | [身份验证](#remote-control-requires-the-anthropic-api)                          |
| `OAuth token revoked` / `OAuth token has expired`                                                  | [身份验证](#oauth-token-revoked-or-expired)                                     |
| `Login expired · Please run /login`                                                                | [身份验证](#login-expired)                                                      |
| `Failed to authenticate: OAuth session expired and could not be refreshed`                         | [身份验证](#login-expired)                                                      |
| `does not meet scope requirement user:profile`                                                     | [身份验证](#oauth-scope-requirement)                                            |
| `AWS credentials expired or invalid`                                                               | [身份验证](#aws-credentials-expired-or-invalid)                                 |
| `AWS authentication failed`                                                                        | [身份验证](#aws-authentication-failed)                                          |
| `AWS default-chain credential resolve timed out`                                                   | [身份验证](#aws-default-chain-credential-resolve-timed-out)                     |
| `Unable to connect to API`                                                                         | [网络](#unable-to-connect-to-api)                                             |
| `Waiting for API response · will retry in`                                                         | [自动重试](#automatic-retries)，或[网络](#unable-to-connect-to-api)（如果问题持续）         |
| `Bedrock streaming response has content-type "..."; expected "application/vnd.amazon.eventstream"` | [网络](#bedrock-streaming-response-has-an-unexpected-content-type)            |
| `SSL certificate verification failed`                                                              | [网络](#ssl-certificate-errors)                                               |
| `SSL certificate error (...)` during login or startup                                              | [网络](#ssl-certificate-errors)                                               |
| `403` with `x-deny-reason: host_not_allowed` in a cloud or routine session                         | [网络](#host-not-allowed-in-a-cloud-session)                                  |
| `Couldn't reconnect to your Remote Control session`                                                | [网络](#couldnt-reconnect-to-your-remote-control-session)                     |
| `Prompt is too long`                                                                               | [请求错误](#prompt-is-too-long)                                                 |
| `Error during compaction: Conversation too long`                                                   | [请求错误](#error-during-compaction-conversation-too-long)                      |
| `Request too large`                                                                                | [请求错误](#request-too-large)                                                  |
| `Image was too large`                                                                              | [请求错误](#image-was-too-large)                                                |
| `Unable to resize image`                                                                           | [请求错误](#unable-to-resize-image)                                             |
| `PDF too large` / `PDF is password protected`                                                      | [请求错误](#pdf-errors)                                                         |
| `Extra inputs are not permitted`                                                                   | [请求错误](#extra-inputs-are-not-permitted)                                     |
| `There's an issue with the selected model`                                                         | [请求错误](#theres-an-issue-with-the-selected-model)                            |
| `Model ... is not a recognized model id`                                                           | [请求错误](#model-is-not-a-recognized-model-id)                                 |
| `Claude Opus is not available with the Claude Pro plan`                                            | [请求错误](#claude-opus-is-not-available-with-the-claude-pro-plan)              |
| `Model ... is restricted by your organization's settings`                                          | [请求错误](#model-is-restricted-by-your-organizations-settings)                 |
| `thinking.type.enabled is not supported for this model`                                            | [请求错误](#thinking-type-enabled-is-not-supported-for-this-model)              |
| `max_tokens must be greater than thinking.budget_tokens`                                           | [请求错误](#thinking-budget-exceeds-output-limit)                               |
| `API Error: 400 due to tool use concurrency issues`                                                | [请求错误](#tool-use-or-thinking-block-mismatch)                                |
| `Claude Code is unable to respond to this request, which appears to violate our Usage Policy`      | [请求错误](#usage-policy-refusal)                                               |
| `<model> has safety measures that flagged this message for a cybersecurity topic`                  | [请求错误](#safety-measures-flagged-a-cybersecurity-topic)                      |
| `Installation was killed before it could finish (exit code 137)`                                   | [安装错误](#installation-was-killed-before-it-could-finish)                     |
| `The connection dropped while downloading the update`                                              | [安装错误](#the-connection-dropped-while-downloading-the-update)                |
| `Download timed out: exceeded the total deadline`                                                  | [安装错误](#the-connection-dropped-while-downloading-the-update)                |
| `--bg and --print conflict`                                                                        | [命令行错误](#command-line-errors)                                               |
| `Error: --json-schema is not a valid JSON Schema`                                                  | [命令行错误](#command-line-errors)                                               |
| `Could not import <server>: <reason>`                                                              | [命令行错误](#could-not-import-a-server-from-claude-desktop)                     |
| `Error: MCP tool <name> (passed via --permission-prompt-tool) not found`                           | [命令行错误](#mcp-permission-prompt-tool-not-found)                              |
| `Marketplace "<name>" is registered from an untrusted source`                                      | [插件错误](#marketplace-is-registered-from-an-untrusted-source)                 |
| `references ${user_config.*} in a shell-form command`                                              | [插件错误](#plugin-command-references-user-config)                              |
| `Monitor "<name>" from plugin <plugin> references ${user_config.*} in its command`                 | [插件错误](#plugin-command-references-user-config)                              |
| `headersHelper for MCP server '<name>' references ${user_config.*}`                                | [插件错误](#plugin-command-references-user-config)                              |
| `would be spawned with zero tools — refusing`                                                      | [工具错误](#agent-would-be-spawned-with-zero-tools)                             |
| `File is covered by a Read deny rule in your permission settings`                                  | [工具错误](#file-is-covered-by-a-read-deny-rule)                                |
| `Can't open MCP settings in a background session`                                                  | [后台会话错误](#commands-refused-in-a-background-session)                         |
| `CLAUDE_CODE_PROCESS_WRAPPER: launcher ...`                                                        | [后台会话错误](#claude_code_process_wrapper-launcher-errors)                      |
| `Ignoring N permissions.allow entries from ... this workspace has not been trusted`                | [配置警告](#workspace-has-not-been-trusted)                                     |
| 响应质量似乎低于平常                                                                                         | [响应质量](#responses-seem-lower-quality-than-usual)                            |

<h2 id="automatic-retries">
  自动重试
</h2>

Claude Code 在向您显示错误之前会重试瞬时故障。服务器错误、过载响应、请求超时、临时 429 限流和断开的连接都会以指数退避方式重试最多 10 次。从 v2.1.198 开始，这涵盖了在任何可见输出流出之前在响应中途断开的连接：Claude Code 使用相同的退避重新发出请求，轮次继续而不是停止并显示连接错误。从 v2.1.199 开始，不携带您计划配额标头的临时 429 限流在您使用 claude.ai 订阅登录时也会重试；早期版本仅对 API 密钥和企业登录重试它们。

某些故障类别不会重试，因为重试无法成功：

* 从 v2.1.199 开始，TLS 证书验证失败（例如 TLS 检查代理、缺少 `NODE_EXTRA_CA_CERTS` 包或过期证书）在第一次尝试时失败，因此修复立即出现，而不是在完整重试预算之后。请参阅 [SSL 证书错误](#ssl-certificate-errors)。瞬时 TLS 条件（例如握手超时）仍然会重试。
* 从 v2.1.199 开始，在 Claude 已经流出可见输出后到达的服务器错误会保留部分响应并附加[不完整响应通知](#the-response-above-may-be-incomplete)，而不是重试，因为重新运行请求可能会执行相同的工具两次。早期版本丢弃了部分输出并将轮次报告为错误。
* [Amazon Bedrock 流式响应具有意外的内容类型](#bedrock-streaming-response-has-an-unexpected-content-type)在第一次尝试时失败，因为网关或代理重写响应会以相同方式重写重试。需要 Claude Code v2.1.208 或更高版本。

重试时，微调器在错误标签后显示 `Retrying in Ns · attempt x/y` 倒计时。标签命名了第一次尝试中您可以立即采取行动的特定原因：网络已关闭、TLS 握手失败或您达到了速率限制。对于其他错误，它最初读作 `API error`。从 v2.1.198 开始，它切换到第三次尝试中的特定原因，或当 `CLAUDE_CODE_MAX_RETRIES` 允许少于三次时在最后一次尝试；早期版本仅在最后一次尝试时切换。

从 v2.1.198 开始，重试期间会抑制通常的微调器提示。一旦错误原因被揭示，如果故障是 529 过载，倒计时下方的行也会命名检查服务状态的位置：Anthropic API 上的 `status.claude.com`，或其他配置上的提供商或网关主机。

如果在请求仍然待处理时，响应流上 20 秒内没有数据到达，微调器会显示 `Waiting for API response · will retry in … · check your network`，然后再进行任何重试。请求尚未失败：倒计时运行到 Claude Code 中止停滞连接并重试的点，因此一旦数据恢复或重试成功，横幅就会自动清除。从 v2.1.185 开始，阈值为 20 秒；早期版本在 10 秒后显示横幅，措辞不同。如果它在每次尝试时都重新出现，请将其视为[网络问题](#unable-to-connect-to-api)。

当您看到本页上的错误之一时，这些重试已经用尽，除非它属于不会重试的类别，例如证书验证失败。您可以使用这些环境变量调整行为：

| 变量                                              | 默认值    | 效果                                                                                                                                                                                                        |
| :---------------------------------------------- | :----- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`CLAUDE_CODE_MAX_RETRIES`](/docs/zh-CN/env-vars)    | 10     | 重试次数。从 v2.1.186 开始上限为 15；从 v2.1.199 开始 `CLAUDE_CODE_RETRY_WATCHDOG` 提高默认值并移除上限。降低它以在脚本中更快地显示故障。                                                                                                           |
| [`CLAUDE_CODE_RETRY_WATCHDOG`](/docs/zh-CN/env-vars) | 未设置    | 在 CI 作业等无人值守会话中设置为 `1`，以无限期重试 `429` 和 `529` 容量错误，而不是在 `CLAUDE_CODE_MAX_RETRIES` 次尝试后失败。从 v2.1.199 开始，它也提高了其他瞬时错误（例如服务器错误、超时和断开的连接）的默认重试计数至 300，大约三小时的退避，如果您显式设置该变量，则移除 `CLAUDE_CODE_MAX_RETRIES` 的 15 上限。 |
| [`API_TIMEOUT_MS`](/docs/zh-CN/env-vars)             | 600000 | 每个请求的超时时间（毫秒）。为慢速网络或代理提高它。                                                                                                                                                                                |

<h2 id="server-errors">
  服务器错误
</h2>

这些错误来自推理提供商，而不是您的账户或请求。在 Anthropic API 上，这意味着 Anthropic 基础设施。在 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 或自定义网关上，这意味着该提供商的基础设施。

<h3 id="api-error-500-internal-server-error">
  API 错误：500 内部服务器错误
</h3>

Claude Code 显示任何 5xx 响应的状态代码和 API 的错误消息。下面的示例显示了 Anthropic API 上的 500 响应：

```text theme={null}
API Error: 500 Internal server error. This is a server-side issue, usually temporary — try again in a moment. If it persists, check https://status.claude.com.
```

末尾的句子指出了检查服务健康状态的位置，因提供商而异。Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 配置会指出该提供商的服务状态。自定义 `ANTHROPIC_BASE_URL` 会指出网关主机。

这表示 API 内部出现了意外故障。它不是由您的提示、设置或账户引起的。

**应该做什么：**

* 检查 [status.claude.com](https://status.claude.com) 或消息中指定的提供商状态页面，查看是否有活跃的事件
* 等待一分钟，然后重新发送您的消息。您的原始消息仍在对话中，所以对于较长的提示，您可以输入 `try again` 而不是粘贴整个内容。
* 如果错误持续存在且没有发布的事件，请运行 `/feedback`，以便 Anthropic 可以使用您的请求详情进行调查。如果 `/feedback` 在您的环境中不可用，请参阅[报告错误](#report-an-error)。

<h3 id="api-error-repeated-529-overloaded-errors">
  API 错误：重复的 529 过载错误
</h3>

API 在所有用户中暂时处于容量限制。Claude Code 在显示此消息之前已经重试了多次：

```text theme={null}
API Error: Repeated 529 Overloaded errors. The API is at capacity — this is usually temporary. Try again in a moment. If it persists, check https://status.claude.com.
```

末尾的句子因提供商而异，方式与上面的 500 错误相同。

529 不是您的使用限制，也不会计入您的配额。

**应该做什么：**

* 检查 [status.claude.com](https://status.claude.com) 或消息中指定的提供商状态页面，查看容量通知
* 几分钟后重试
* 运行 `/model` 并切换到不同的模型以继续工作，因为容量是按模型跟踪的。当某个模型处于特别高的负载下时，Claude Code 会提示您这样做，例如 `Opus is experiencing high load, please use /model to switch to Sonnet`。

<h3 id="request-timed-out">
  请求超时
</h3>

API 在连接截止时间之前没有响应。

```text theme={null}
Request timed out
```

这可能发生在高负载期间或模型生成非常大的响应时。默认请求超时为 10 分钟。

**应该做什么：**

* 重试请求
* 对于长时间运行的任务，将工作分解为较小的提示
* 如果是由于网络缓慢或代理引起的，请按照[自动重试](#automatic-retries)中的说明提高 `API_TIMEOUT_MS`
* 如果超时频繁且您的网络状况良好，请参阅下面的[网络和连接错误](#network-and-connection-errors)

<h3 id="the-response-above-may-be-incomplete">
  上面的响应可能不完整
</h3>

流式响应在 Claude 已经生成可见输出后失败。重新发送请求可能会运行相同的工具调用两次，因此 Claude Code 保留已经流式传输的内容，并附加此通知，而不是丢弃该轮次。您看到的变体指出了原因：

```text theme={null}
API Error: Server error mid-response. The response above may be incomplete.
API Error: Connection closed mid-response. The response above may be incomplete.
API Error: Response stalled mid-stream. The response above may be incomplete.
```

* }`Server error mid-response`：流中的过载或 5xx 服务器错误。此变体需要 Claude Code v2.1.199 或更高版本；在此之前，该情况会丢弃部分输出并将整个轮次报告为错误。
* `Connection closed mid-response`：连接断开。
* `Response stalled mid-stream`：流停止发送数据。

**应该做什么：**

* 阅读流式传输的响应。没有任何内容丢失，但最后的句子或工具调用可能缺失。
* 回复 `continue` 让 Claude 从停止的地方继续
* 如果在任何可见输出之前出现相同的错误，Claude Code 会重试请求而不是完成它。请参阅[自动重试](#automatic-retries)。

<h3 id="auto-mode-cannot-determine-the-safety-of-an-action">
  自动模式无法确定操作的安全性
</h3>

[自动模式](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode)用来分类操作的模型无法做出决定，因此自动模式没有自动批准该操作。您看到的消息取决于分类器失败的原因。

在您的工作目录内的读取、搜索和编辑会跳过分类器，因此在所有这些情况下都能继续工作。

当分类器模型过载时：

```text theme={null}
<model> is temporarily unavailable, so auto mode cannot determine the safety of <tool> right now. Wait briefly and then try this action again.
```

**应该做什么：**

* 几秒钟后重试；Claude 会看到相同的消息，通常会自动重试
* 如果重试继续失败，继续执行只读任务，稍后再回到被阻止的操作
* 这是暂时的，与[自动模式资格](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode)无关；您不需要更改设置

当分类器返回无法解析的响应时：

```text theme={null}
Auto mode could not evaluate this action and is blocking it for safety — run with --debug for details
```

**应该做什么：**

* 重试该操作；这通常在下一次尝试时成功
* 运行 `claude --debug` 并重复该操作以在调试日志中查看底层分类器响应

当单独的 API 安全检查因早期对话内容而阻止了分类器请求时：

```text theme={null}
Auto mode could not evaluate this action and is blocking it for safety — a safety check separate from auto mode blocked this request because of earlier conversation content — it isn't about the action itself — run with --debug for details
```

**应该做什么：**

* 这不是关于您的操作的决定。您对话中已有的内容在自动模式将对话发送给分类器时触发了 API 上的安全过滤器
* 重试无法帮助；相同的对话内容将再次触发过滤器
* 切换到不同的[权限模式](/docs/zh-CN/permission-modes)，以便在提示时可以批准该操作，或开始一个没有触发内容的新对话

当对话大小超过分类器的上下文窗口时：

```text theme={null}
Auto mode classifier transcript exceeded context window — falling back to manual approval (try /compact to reduce conversation size)
```

在交互式会话中，自动模式会为该操作回退到正常权限提示，以便您可以手动批准或拒绝它。在[非交互式模式](/docs/zh-CN/headless)中，运行会中止，因为记录只会增长，重试无法成功。

**应该做什么：**

* 在出现的提示中批准或拒绝该操作
* 运行 `/compact` 以减少对话大小，以便后续操作再次适应分类器窗口

<h3 id="agent-terminated-early-due-to-an-api-error">
  代理因 API 错误而提前终止
</h3>

[子代理](/docs/zh-CN/sub-agents)的 API 请求终止失败，例如因为达到了使用限制或服务器错误的重试用尽，所以子代理在完成其任务之前停止。此消息需要 Claude Code v2.1.199 或更高版本；在此之前，API 错误文本被返回给 Claude，就像它是子代理的结果一样。

```text theme={null}
Agent terminated early due to an API error: <error detail>
```

**应该做什么：**

* 将冒号后的错误详情与此页面上的其自己的部分相匹配，例如[使用限制](#usage-limits)或[服务器错误](#server-errors)，并按照该部分的步骤操作
* 一旦底层错误清除，请要求 Claude 重试任务或[恢复子代理](/docs/zh-CN/sub-agents#resume-subagents)

当速率限制、过载或服务器错误中断已经生成文本输出的前台子代理时，Claude 会收到该部分输出标记为不完整，而不是此错误。仅输出为工具调用的子代理也会收到此错误；在 v2.1.199 中，该形状返回了空的部分结果。请参阅[子代理中的 API 错误](/docs/zh-CN/sub-agents#api-errors-in-subagents)。

<h2 id="usage-limits">
  使用限制
</h2>

这些错误表示与您的账户或计划相关的配额已达到。它们不同于[服务器错误](#server-errors)，后者会影响所有人。

<h3 id="youve-hit-your-session-limit">
  您已达到会话限制
</h3>

订阅计划包括滚动使用额度。当额度用尽时，您会看到以下消息之一：

```text theme={null}
You've hit your session limit · resets 3:45pm
You've hit your weekly limit · resets Mon 12:00am
You've hit your Opus limit · resets 3:45pm
```

Claude Code 会阻止进一步的请求，直到消息中显示的重置时间。会话和每周限制在所有模型中共享，因此切换模型不会恢复访问权限。Opus 限制仅适用于 Opus 请求，因此使用 `/model` 切换到另一个模型可以继续工作。

使用量同时计入会话和每周额度。单次大量活动突发（例如大型工作流扇出）可能会在会话窗口重置之前耗尽每周额度。

**应该怎么做：**

* 等待错误消息中显示的重置时间
* 对于 Opus 限制，运行 `/model` 并切换到另一个模型以继续工作
* 运行 `/usage` 查看您的计划限制以及它们何时重置
* 运行 `/usage-credits` 在 Pro 和 Max 上购买额外使用量，或在 Team 和 Enterprise 上向您的管理员请求。有关如何计费，请参阅[付费计划的使用额度](https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans)。
* 要升级您的计划以获得更高的基础限制，请参阅 [claude.com/pricing](https://claude.com/pricing)

要在达到限制之前监控您的剩余额度，请将 `rate_limits` 字段添加到[自定义状态行](/docs/zh-CN/statusline#rate-limit-usage)，或在桌面应用中单击模型选择器旁边的[使用量环](/docs/zh-CN/desktop#check-usage)。

<h3 id="usage-credits-required-for-1m-context">
  1M 上下文需要使用额度
</h3>

所选模型使用 1M 令牌扩展上下文窗口，而您的计划仅通过使用额度包含它。

```text theme={null}
API Error: Usage credits required for 1M context · run /usage-credits to turn them on, or /model to switch to standard context
```

这是一项权利检查，而不是配额耗尽。即使您的会话和每周额度仍有容量，它也会触发。有关哪些计划直接包含 1M 上下文以及哪些需要使用额度，请参阅[扩展上下文](/docs/zh-CN/model-config#extended-context)。

当此错误在对话中期出现，因为上下文增长超过 200K 令牌时，Claude Code 会自动将对话压缩回标准上下文限制以下，并在之后将会话保持在该限制，因此无需采取任何操作。在 v2.1.172 之前的版本上，错误会在每个后续请求（包括 `/compact`）上重复出现；在这些版本上运行 `/clear` 以恢复。以下步骤适用于您明确选择 `[1m]` 模型的情况。

**应该怎么做：**

* 运行 `/model` 并选择不带 `[1m]` 后缀的变体以回退到标准上下文窗口
* 运行 `/usage-credits` 在 Pro 和 Max 上为 1M 变体启用按量计费，或在 Team 和 Enterprise 上向您的管理员请求
* 如果 `/model` 后错误仍然存在，1M 模型 ID 可能在其他地方设置。有关要按优先级顺序检查的配置位置，请参阅[所选模型存在问题](#theres-an-issue-with-the-selected-model)。
* 要从模型选择器中完全删除 1M 变体，请设置 [`CLAUDE_CODE_DISABLE_1M_CONTEXT=1`](/docs/zh-CN/env-vars)

<h3 id="server-is-temporarily-limiting-requests">
  服务器暂时限制请求
</h3>

API 应用了与您的计划配额无关的短期限流。

```text theme={null}
API Error: Server is temporarily limiting requests (not your usage limit)
```

Claude Code 通过真实限制响应所携带的统一配额标头的缺失来区分这些与您的计划限制。从 v2.1.199 开始，无论您如何进行身份验证，这都会[自动重试](#automatic-retries)并进行退避，然后才会显示。在早期版本上，使用 claude.ai 订阅登录的会话在第一次出现时失败；只有 API 密钥和 Enterprise 登录会重试。

**应该怎么做：**

* 稍等片刻后重试
* 如果问题仍然存在，请检查 [status.claude.com](https://status.claude.com)

<h3 id="request-rejected-429">
  请求被拒绝 (429)
</h3>

您已达到为 API 密钥、Amazon Bedrock 项目或 Google Cloud 项目配置的速率限制。

```text theme={null}
API Error: Request rejected (429) · this may be a temporary capacity issue. If it persists, check https://status.claude.com.
```

尾部句子指出检查服务健康状况的位置，因提供商而异。Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 配置会指出该提供商的服务状态，而不是 Anthropic 状态页面。自定义 `ANTHROPIC_BASE_URL` 会指出网关主机。

**应该怎么做：**

* 运行 `/status` 并确认活跃凭证是您期望的凭证。环境中的杂散 `ANTHROPIC_API_KEY` 可能会通过低级密钥而不是您的订阅来路由请求。
* 检查您的提供商控制台以了解活跃限制，如果需要，请请求更高的层级
* 对于 Anthropic API 密钥，请参阅[速率限制参考](https://platform.claude.com/docs/en/api/rate-limits)了解层级如何工作以及如何设置每个工作区的上限
* 降低并发：降低 [`CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`](/docs/zh-CN/env-vars)，避免运行许多并行子代理，或使用 `/model` 切换到较小的模型以进行大容量脚本运行

<h3 id="credit-balance-is-too-low">
  信用余额过低
</h3>

您的 Console 组织已用尽预付信用。

```text theme={null}
Credit balance is too low
```

**应该怎么做：**

* 在 [platform.claude.com/settings/billing](https://platform.claude.com/settings/billing) 添加信用，并考虑在那里启用自动重新加载，以便在余额达到零之前进行补充
* 如果您有 Pro、Max、Team 或 Enterprise 计划，请使用 `/login` 切换到订阅身份验证
* 在 Console 中设置每个工作区的支出上限，以防止单个项目耗尽组织余额。请参阅[有效管理成本](/docs/zh-CN/costs)。

<h2 id="authentication-errors">
  身份验证错误
</h2>

这些错误意味着 Claude Code 无法向 API 证明您的身份。随时运行 `/status` 查看当前活跃的凭证。

<h3 id="not-logged-in">
  未登录
</h3>

此会话没有可用的有效凭证。

```text theme={null}
Not logged in · Please run /login
```

**应该做什么：**

* 运行 `/login` 使用您的 Claude 订阅或 Console 账户进行身份验证
* 如果您期望使用环境变量进行身份验证，请确认 `ANTHROPIC_API_KEY` 已在启动 `claude` 的 shell 中设置并导出
* 对于无法进行交互式登录的 CI 或自动化环境，配置一个 [`apiKeyHelper`](/docs/zh-CN/settings#available-settings) 脚本，在启动时获取密钥
* 查看 [身份验证优先级](/docs/zh-CN/authentication#authentication-precedence) 了解当存在多个凭证时 Claude Code 使用哪个凭证

如果您被反复提示登录，请参阅 [未登录或令牌过期](/docs/zh-CN/troubleshoot-install#not-logged-in-or-token-expired) 了解系统时钟和 macOS Keychain 修复。

<h3 id="could-not-resolve-authentication-method">
  无法解析身份验证方法
</h3>

会话到达 API 客户端时没有任何凭证。这出现在 [后台会话](/docs/zh-CN/agent-view)、云会话和 Agent SDK 上下文中，其中交互式登录检查在第一个请求之前不会运行。

```text theme={null}
Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set. Or for one of the "X-Api-Key" or "Authorization" headers to be explicitly omitted
```

在 v2.1.174 之前，分配给空闲预初始化工作进程的后台或云会话即使配置了有效凭证也可能以这种方式失败。升级以恢复。在当前版本中，该错误意味着工作进程没有可用的凭证。

**应该做什么：**

* 如果这出现在后台或云会话中且您的凭证已配置，请升级到 v2.1.174 或更高版本
* 确认 `ANTHROPIC_API_KEY`、`CLAUDE_CODE_OAUTH_TOKEN` 或您的云提供商凭证已在启动工作进程的环境中设置，而不仅仅在您的交互式 shell 中
* 对于 Agent SDK，请参阅 [身份验证设置](/docs/zh-CN/agent-sdk/overview#get-started)
* 在同一环境中的交互式会话中运行 `/status` 以确认哪个凭证源可以解析

<h3 id="invalid-api-key">
  无效的 API 密钥
</h3>

`ANTHROPIC_API_KEY` 环境变量或 `apiKeyHelper` 脚本返回的密钥被 API 拒绝。

```text theme={null}
Invalid API key · Fix external API key
```

**应该做什么：**

* 检查拼写错误并确认密钥未在 [Console](https://platform.claude.com/settings/keys) 中被撤销
* 在同一 shell 中运行 `env | grep ANTHROPIC`。direnv、dotenv shell 插件和 IDE 终端等工具可以从项目中的 `.env` 文件加载过时的密钥，而无需您显式设置它
* 取消设置 `ANTHROPIC_API_KEY` 并运行 `/login` 改用订阅身份验证
* 如果密钥来自 [`apiKeyHelper`](/docs/zh-CN/settings#available-settings) 脚本，直接运行该脚本以确认它在 stdout 上打印有效密钥
* 运行 `/status` 确认 Claude Code 实际使用的凭证源

<h3 id="your-apikeyhelper-script-is-failing">
  您的 apiKeyHelper 脚本失败
</h3>

在 [`apiKeyHelper`](/docs/zh-CN/settings#available-settings) 设置中配置的命令以错误退出、超时或未向 stdout 打印任何内容。没有来自脚本的密钥，请求到达 API 时带有占位符凭证，API 以 `401` 拒绝它。

```text theme={null}
Your apiKeyHelper script is failing · This usually means you need to re-authenticate with your provider · Run /status to see the script's error output
```

Claude Code 重新运行脚本并在显示此消息之前最多重试请求两次，因此故障在三次尝试内浮出。在 v2.1.208 之前，Claude Code 花费完整的 [重试预算](#automatic-retries) 使用占位符凭证重新发送请求，然后报告通用的 `401` 身份验证错误而不是脚本故障。

运行 `/login` 在这里无法帮助：只要设置存在，helper 的输出 [优先于](/docs/zh-CN/authentication#authentication-precedence) 保存的登录。

**应该做什么：**

* 在您的 shell 中直接运行在 `apiKeyHelper` 中配置的命令以重现故障
* 如果命令报告会话已过期，请使用您的凭证提供商重新身份验证，例如再次登录您的 SSO 或密钥保管库
* 修复命令以便它将密钥打印到 stdout 并以代码 0 退出。有关工作设置，请参阅 [使用 apiKeyHelper 轮换凭证](/docs/zh-CN/llm-gateway-connect#rotate-credentials-with-apikeyhelper)。
* 运行 `/status` 确认 `apiKeyHelper` 是活跃凭证源。每次命令失败时，其退出代码和错误输出都会出现在终端中的 `Cloud authentication` 面板中。

<h3 id="this-organization-has-been-disabled">
  此组织已被禁用
</h3>

来自已禁用 Console 组织的过时 `ANTHROPIC_API_KEY` 正在覆盖您的订阅登录。

```text theme={null}
Your ANTHROPIC_API_KEY belongs to a disabled organization · Unset the environment variable to use your other credentials
API Error: 400 ... This organization has been disabled.
```

环境变量优先于 `/login`，因此即使您有有效的 Pro 或 Max 订阅，在 shell 配置文件中导出或从 `.env` 文件加载的密钥也会被使用。在非交互模式 (`-p`) 中，当密钥存在时始终使用该密钥。

**应该做什么：**

* 在当前 shell 中取消设置 `ANTHROPIC_API_KEY` 并从 shell 配置文件中删除它，然后重新启动 `claude`
* 之后运行 `/status` 确认活跃凭证是您的订阅
* 如果未设置环境变量且错误仍然存在，则禁用的组织是与您的 `/login` 关联的组织。联系支持或使用不同的账户登录。

<h3 id="your-organization-has-disabled-api-key-authentication">
  您的组织已禁用 API 密钥身份验证
</h3>

此消息需要 Claude Code v2.1.169 或更高版本。您的 Console 组织管理员已关闭 API 密钥身份验证，因此 API 拒绝 Claude Code 发送的密钥。`·` 之后的恢复提示因密钥来源而异：

```text theme={null}
Your organization has disabled API key authentication · Run /login to sign in with your claude.ai account
Your organization has disabled API key authentication · Unset ANTHROPIC_API_KEY to use your claude.ai account instead
Your organization has disabled API key authentication · Unset ANTHROPIC_API_KEY and run /login to sign in with your claude.ai account
Your organization has disabled API key authentication · Unset the apiKeyHelper setting and run /login to sign in with your claude.ai account
```

环境变量和 `apiKeyHelper` 优先于 `/login`，因此仅运行 `/login` 在任一仍在提供密钥时无法帮助。请参阅 [身份验证优先级](/docs/zh-CN/authentication#authentication-precedence)。

**应该做什么：**

* 如果消息提到 `ANTHROPIC_API_KEY`，在当前 shell 中取消设置它并从 shell 配置文件或 `.env` 文件中删除它，然后重新启动 `claude`
* 如果消息提到 `apiKeyHelper`，从您的 `settings.json` 中删除 [`apiKeyHelper`](/docs/zh-CN/settings#available-settings) 设置
* 运行 `/login` 使用您的 claude.ai 账户登录
* 之后运行 `/status` 确认活跃凭证是您的订阅而不是 API 密钥
* 如果您需要 API 密钥身份验证用于自动化，请要求您的组织管理员在 Console 中重新启用它

<h3 id="your-organization-has-disabled-claude-subscription-access">
  您的组织已禁用 Claude 订阅访问
</h3>

您的 Claude 组织不允许使用订阅登录登录到 Claude Code。使用同一账户再次运行 `/login` 会返回相同的错误。

```text theme={null}
Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access
```

这是服务器端组织设置，因此无法从本地设置、环境变量或 CLI 标志覆盖。

Agent SDK 和 `-p` 非交互模式将其显示为 `oauth_org_not_allowed` 错误代码。

**应该做什么：**

* 要求您的管理员为您的组织启用 Claude Code 访问
* 使用 Console API 密钥而不是您的订阅进行身份验证。有关设置，请参阅 [Claude Console 身份验证](/docs/zh-CN/authentication#claude-console-authentication)。
* 如果您是管理员且看不到启用访问的选项，请联系 [Anthropic 支持](https://support.claude.com)

<h3 id="routines-are-disabled-by-your-organizations-policy">
  例程被您的组织的策略禁用
</h3>

您的 Team 或 Enterprise 组织中的所有者已在组织级别关闭例程。当您尝试创建或运行例程时会出现该错误，包括从 `/schedule` 和 claude.ai/code 上的 [Routines](/docs/zh-CN/routines) UI。

```text theme={null}
Routines are disabled by your organization's policy.
```

这是服务器端设置，因此无法从本地设置、环境变量或 CLI 标志覆盖。

**应该做什么：**

* 要求您的组织中的所有者在 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code) 启用 **Routines** 切换
* 对于不需要组织级例程的一次性计划工作，请参阅 [计划任务](/docs/zh-CN/scheduled-tasks)

<h3 id="remote-control-requires-the-anthropic-api">
  Remote Control 需要 Anthropic API
</h3>

会话不是直接与 Anthropic API 通信，因此没有 claude.ai 后端供 [Remote Control](/docs/zh-CN/remote-control) 配对。

```text theme={null}
Remote Control is only available when using Claude via api.anthropic.com.
```

这出现在 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上。从 v2.1.196 开始，当 [`ANTHROPIC_BASE_URL`](/docs/zh-CN/env-vars) 指向 `api.anthropic.com` 以外的主机时，例如 [LLM 网关](/docs/zh-CN/llm-gateway) 或代理，即使您使用 claude.ai 登录，它也会出现。

**应该做什么：**

* 取消设置 `ANTHROPIC_BASE_URL` 并重启会话，或从直接与 Anthropic API 通信的会话启动 Remote Control
* 对于此错误和其他 Remote Control 启动消息，请参阅 [Remote Control 故障排除](/docs/zh-CN/remote-control#troubleshooting)

<h3 id="oauth-token-revoked-or-expired">
  OAuth 令牌被撤销或过期
</h3>

您保存的登录不再有效。撤销的令牌意味着您在任何地方都已登出或管理员删除了访问权限；过期的令牌意味着自动刷新在会话中途失败。

两条消息都报告 Claude Code 发送的请求 API 返回的拒绝。当保存的登录在失败的刷新后已被清除时，您会看到 [登录已过期](#login-expired) 代替。

```text theme={null}
OAuth token revoked · Please run /login
OAuth token has expired · Please run /login
API Error: 401 ... authentication_error
```

**应该做什么：**

* 运行 `/login` 重新登录
* 如果在同一会话中重新身份验证后错误返回，请先运行 `/logout` 完全清除存储的令牌，然后运行 `/login`
* 对于跨启动的重复登录提示，请参阅 [故障排除](/docs/zh-CN/troubleshoot-install#not-logged-in-or-token-expired) 中的系统时钟和 macOS Keychain 检查
* 对于其他故障，包括 `403 Forbidden` 和 OAuth 浏览器问题，请参阅 [登录和身份验证](/docs/zh-CN/troubleshoot-install#login-and-authentication)

<h3 id="login-expired">
  登录已过期
</h3>

Claude Code 尝试更新您保存的 claude.ai 或 Claude Console 登录，OAuth 服务拒绝了存储的刷新令牌，因此 Claude Code 清除了保存的凭证。之后，每个请求在到达 API 之前都会在本地停止，因为只有 `/login` 可以创建新凭证。在 v2.1.206 之前，Claude Code 无论如何都会发送请求，使用环境中剩余的任何凭证，然后每个模型都会失败，显示 [所选模型有问题](#theres-an-issue-with-the-selected-model) 或 401 而不是登录提示。

```text theme={null}
Login expired · Please run /login
```

在 [非交互模式](/docs/zh-CN/headless) (`-p`) 和 [Agent SDK](/docs/zh-CN/agent-sdk/overview) 中，消息如下所示，结构化错误代码为 `authentication_failed`：

```text theme={null}
Failed to authenticate: OAuth session expired and could not be refreshed
```

这与 [OAuth 令牌被撤销或过期](#oauth-token-revoked-or-expired) 的状态不同。这些消息报告 API 返回的 401。Claude Code 本身为已失败刷新的登录生成 `Login expired`，因此它不发送请求。

使用 API 密钥、[`CLAUDE_CODE_OAUTH_TOKEN`](/docs/zh-CN/env-vars) 或第三方提供商进行身份验证的会话不使用保存的登录，永远不会看到此消息。

**应该做什么：**

* 运行 `/login` 重新登录。不登录重试会在每个请求上显示相同的消息。
* 在非交互模式中，在同一环境中运行 `claude`，完成 `/login`，然后重新运行您的命令。对于无法交互式登录的自动化，使用 `ANTHROPIC_API_KEY` 进行身份验证或 [使用 `claude setup-token` 生成长期令牌](/docs/zh-CN/authentication#generate-a-long-lived-token)。
* 如果登录持续失败，请参阅 [登录和身份验证](/docs/zh-CN/troubleshoot-install#login-and-authentication)

<h3 id="oauth-scope-requirement">
  OAuth 范围要求
</h3>

存储的令牌早于较新功能需要的权限范围。您最常从 `/usage` 和状态行使用情况指示器看到这一点：

```text theme={null}
OAuth token does not meet scope requirement: user:profile
```

**应该做什么：**

* 运行 `/login` 获取具有当前范围的新令牌。您不需要先登出。

<h3 id="aws-credentials-expired-or-invalid">
  AWS 凭证已过期或无效
</h3>

此消息需要 Claude Code v2.1.198 或更高版本，仅当在您的设置文件中设置了 [`awsAuthRefresh`](/docs/zh-CN/amazon-bedrock#advanced-credential-configuration) 时才会出现。您的 AWS 会话令牌已过期或被拒绝，Claude Code 已运行的自动刷新未产生 API 接受的凭证。它出现在来自 [Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws) 或 [Mantle 端点](/docs/zh-CN/amazon-bedrock#use-the-mantle-endpoint) 的 401 上，这是这些提供商报告过期安全令牌的方式。

中间的操作提示命名了您的设置中的 `awsAuthRefresh` 命令，因此它会有所不同。稳定的部分是前导的 `AWS credentials expired or invalid`：

```text theme={null}
AWS credentials expired or invalid · run /login and select "Claude Platform on AWS · refresh credentials", or run `aws sso login --profile myprofile` in another terminal · API Error: 401 ...
```

如果未配置 `awsAuthRefresh`，相同的 401 会显示通用的 `Please run /login` 消息，该消息无法刷新 AWS 凭证。

**应该做什么：**

* 在另一个终端中运行消息中命名的 `awsAuthRefresh` 命令，例如 `aws sso login --profile myprofile`，完成浏览器登录，然后重试
* 在交互式会话中，运行 `/login`，选择 **3rd-party platform**，然后在 **Using 3rd-party platforms** 下选择 **Claude Platform on AWS · refresh credentials** 以运行相同的命令而无需重启 Claude Code。请参阅 [配置 AWS 凭证](/docs/zh-CN/claude-platform-on-aws#1-configure-aws-credentials)
* 如果刷新命令成功后错误重复出现，请在同一 shell 和配置文件中使用 `aws sts get-caller-identity` 确认身份在 Claude Code 外部有效

<h3 id="aws-authentication-failed">
  AWS 身份验证失败
</h3>

此消息需要 Claude Code v2.1.198 或更高版本，仅当在您的设置文件中设置了 [`awsAuthRefresh`](/docs/zh-CN/amazon-bedrock#advanced-credential-configuration) 时才会出现。您的 AWS 提供商返回了 403，或 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock) 返回了 401。

Claude Code 无法判断您遇到了哪个原因。Amazon Bedrock 将过期的安全令牌报告为 403，但 403 也是它报告授权拒绝的方式，例如来自缺失 IAM 权限或未为您的账户启用的模型的 `AccessDeniedException`。

来自 Amazon Bedrock 的 401 也会落在这里而不是在 [AWS 凭证已过期或无效](#aws-credentials-expired-or-invalid) 下，因为 Amazon Bedrock 不会将过期令牌报告为 401。来自该端点的 401 通常来自请求路径中的其他内容，例如公司代理。

凭证刷新可以修复过期的令牌，无法修复其他原因，因此消息提供两者：

```text theme={null}
AWS authentication failed · run /login and select "Claude Platform on AWS · refresh credentials", or run `aws sso login --profile myprofile` in another terminal · if credentials are current, check AWS permissions and model access · API Error: 403 ...
```

中间的操作提示命名了您的设置中的 `awsAuthRefresh` 命令，因此它会有所不同。稳定的部分是前导的 `AWS authentication failed`。

**应该做什么：**

* 运行消息中命名的 `awsAuthRefresh` 命令或 `aws sso login`，以防过期凭证是原因
* 如果您的凭证是最新的，请确认 [IAM 配置](/docs/zh-CN/amazon-bedrock#iam-configuration) 中的 IAM 权限已附加到您使用的身份，并且所选模型已为您的账户和区域启用
* 运行 `aws sts get-caller-identity` 确认您的请求使用哪个身份；过时的 `AWS_PROFILE` 或默认配置文件是权限不匹配的常见原因

<h3 id="aws-default-chain-credential-resolve-timed-out">
  AWS 默认链凭证解析超时
</h3>

AWS 默认凭证提供商链在 60 秒内未产生凭证，因此 Claude Code 停止了解析并使请求失败。故障是本地凭证解析：请求从未到达 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws) 或 [Mantle 端点](/docs/zh-CN/amazon-bedrock#use-the-mantle-endpoint)。Claude Code 在此错误浮出之前清除其 [凭证缓存](/docs/zh-CN/amazon-bedrock#credential-caching-and-resolution-timeout) 并重试，因此到您看到它时链已在重复尝试上停滞。

```text theme={null}
API Error: AWS default-chain credential resolve timed out
```

常见原因是 AWS 配置文件中的 `credential_process` 命令等待它无法接收的输入，以及容器或 VM 的实例元数据服务 (IMDS) 从不回答链的探测。在 v2.1.207 之前，停滞的链使请求无限期等待而不是以此消息失败。

**应该做什么：**

* 在同一 shell 中使用相同的 `AWS_PROFILE` 运行 `aws sts get-caller-identity`。如果它也挂起，请修复配置文件；提示交互式的 `credential_process` 命令是常见原因。
* 在启动 Claude Code 之前完成登录步骤，例如 `aws sso login --profile myprofile`，以便链从本地 SSO 缓存解析而不是等待浏览器流
* 如果您的链运行合法需要超过 60 秒的交互式登录，例如通过 `aws-vault` 等包装器的带 MFA 的 SSO，请使用 [`CLAUDE_CODE_AWS_CHAIN_RESOLVE_TIMEOUT_MS`](/docs/zh-CN/env-vars) 以毫秒为单位提高限制

<h2 id="network-and-connection-errors">
  网络和连接错误
</h2>

这些错误表示来自 Claude Code 的网络请求未能到达其目的地，或 Claude Code 和 API 之间的某些东西在返回途中改变了响应。它们通常源于您的本地网络、代理或防火墙，或云环境的网络策略。

<h3 id="unable-to-connect-to-api">
  无法连接到 API
</h3>

与 API 的 TCP 连接失败或从未完成。

```text theme={null}
Unable to connect to API. Check your internet connection
Unable to connect to API (ECONNREFUSED)
Unable to connect to API (ECONNRESET)
Unable to connect to API (ETIMEDOUT)
fetch failed
Request timed out. Check your internet connection and proxy settings
```

常见原因包括没有互联网访问、阻止 `api.anthropic.com` 的 VPN，或未配置的必需企业代理。

**应该做什么：**

* 通过在同一 shell 中运行 `curl -I https://api.anthropic.com` 来确认您可以到达 API 主机。在 Windows PowerShell 上使用 `curl.exe -I https://api.anthropic.com`，以便不使用内置的 `Invoke-WebRequest` 别名。
* 如果您在企业代理后面，请在启动 Claude Code 之前设置 `HTTPS_PROXY`，并参阅[网络配置](/docs/zh-CN/network-config)
* 如果您通过 LLM 网关或中继路由，请将 [`ANTHROPIC_BASE_URL`](/docs/zh-CN/env-vars) 设置为其地址。有关设置，请参阅[将 Claude Code 连接到 LLM 网关](/docs/zh-CN/llm-gateway-connect)。
* 确保您的防火墙允许[网络访问要求](/docs/zh-CN/network-config#network-access-requirements)中列出的主机
* 间歇性故障会[自动重试](#automatic-retries)；持续故障指向本地网络问题

如果 `curl` 成功但 Claude Code 仍然失败，原因通常是运行时和网络之间的某些东西，而不是网络本身：

* 在 Linux 和 WSL 上，检查 `/etc/resolv.conf` 是否有无法到达的名称服务器。特别是 WSL 可能会从主机继承损坏的解析器。
* 在 macOS 上，已断开连接或卸载的 VPN 客户端可能会留下隧道接口或路由规则。检查 `ifconfig` 是否有过时的 `utun` 接口，并在系统设置中删除 VPN 的网络扩展。
* Docker Desktop 和类似的容器运行时可能会拦截出站流量。退出它们并重试以排除这种可能性。

<h3 id="bedrock-streaming-response-has-an-unexpected-content-type">
  Bedrock 流式响应具有意外的内容类型
</h3>

Claude Code 和 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock) 之间的网关或代理正在转换流式响应体或其 `Content-Type` 标头。Amazon Bedrock 将响应流式传输为 `application/vnd.amazon.eventstream`，Claude Code 拒绝报告不同内容类型的成功流式响应，而不是解码它无法读取的响应体。请求不会重试。

```text theme={null}
Bedrock streaming response has content-type "text/event-stream"; expected "application/vnd.amazon.eventstream". A gateway or proxy between Claude Code and Bedrock is likely transforming the response body — Bedrock's binary event-stream format must be passed through unmodified. Set CLAUDE_CODE_DISABLE_BEDROCK_CONTENT_TYPE_GUARD=1 to suppress this check while the gateway is being fixed.
```

在 v2.1.208 之前，相同的配置错误表现为 `API Error: Truncated event message received`，在整个响应被缓冲后出现。

**应该做什么：**

* 配置网关以不修改地传递 `InvokeModelWithResponseStream` 响应体及其 `Content-Type` 标头。将流重新发出为服务器发送事件的中介是常见原因。
* 如果网关仅重写标头并完整传递二进制体，请设置 [`CLAUDE_CODE_DISABLE_BEDROCK_CONTENT_TYPE_GUARD=1`](/docs/zh-CN/env-vars) 以跳过检查，直到网关被修复。请参阅[网关或代理后的流式错误](/docs/zh-CN/amazon-bedrock#streaming-errors-behind-a-gateway-or-proxy)。

<h3 id="ssl-certificate-errors">
  SSL 证书错误
</h3>

您网络上的代理或安全设备正在用其自己的证书拦截 TLS 流量，而 Claude Code 不信任它。

```text theme={null}
Unable to connect to API: SSL certificate verification failed. Check your proxy or corporate SSL certificates
Unable to connect to API: Self-signed certificate detected
```

从 v2.1.199 开始，证书验证失败不会重试，因此此错误在第一次尝试时出现，而不是在完整[重试预算](#automatic-retries)之后。早期版本在显示它之前花费几分钟重试。瞬时 TLS 条件（例如握手超时）仍然会重试。

在 `/login` 和启动连接检查期间，使用 OpenSSL 代码和内联修复报告相同的失败：

```text theme={null}
SSL certificate error (UNABLE_TO_GET_ISSUER_CERT_LOCALLY). If you are behind a corporate proxy or TLS-intercepting firewall, set NODE_EXTRA_CA_CERTS to your CA bundle path, or ask IT to allowlist *.anthropic.com. Run `claude doctor` for details.
```

**应该做什么：**

* 导出您组织的 CA 包，并使用 `NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.pem` 将 Claude Code 指向它
* 有关完整设置说明，请参阅[网络配置](/docs/zh-CN/network-config#custom-ca-certificates)
* 不要设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`，这会完全禁用证书验证

<h3 id="host-not-allowed-in-a-cloud-session">
  云会话中不允许的主机
</h3>

来自云会话或例程的出站 HTTP 请求被环境的网络策略阻止。

```text theme={null}
HTTP 403
x-deny-reason: host_not_allowed
```

您也可能看到与目的地真实证书不匹配的 TLS 证书。云环境通过代理路由出站流量以强制执行网络策略，因此证书不匹配意味着代理终止了连接，而不是目的地。

这不是客户端网络问题。云会话和[例程](/docs/zh-CN/routines)在沙箱环境内运行，其出站流量被过滤到环境的允许列表。**默认**环境使用**受信任**访问，允许[默认允许列表](/docs/zh-CN/claude-code-on-the-web#default-allowed-domains)中的包注册表、云提供商 API、容器注册表和常见开发域，但阻止其他所有内容。

**应该做什么：**

* 打开例程进行编辑，或启动云会话。选择显示您的环境名称（例如**默认**）的云图标以打开选择器。将鼠标悬停在您的环境上，然后单击设置图标。
* 在**更新云环境**对话框中，将**网络访问**从**受信任**更改为**自定义**，然后将被阻止的域添加到**允许的域**。每行输入一个域。选中**也包括常见包管理器的默认列表**以在自定义域旁边保留[默认允许列表](/docs/zh-CN/claude-code-on-the-web#default-allowed-domains)。如果您想要不受限制的访问，请改为选择**完全**。
* 单击**保存更改**。下一次运行使用更新的允许列表。

有关访问级别和默认允许列表，请参阅[网络访问](/docs/zh-CN/claude-code-on-the-web#network-access)。本地 CLI 会话不受此策略影响。

<h3 id="couldnt-reconnect-to-your-remote-control-session">
  无法重新连接到您的 Remote Control 会话
</h3>

```text theme={null}
Couldn't reconnect to your Remote Control session. Retry, or start a fresh session without --resume.
```

使用 `claude --resume` 或 `claude --continue` 恢复会重新连接到该对话中记录的 [Remote Control](/docs/zh-CN/remote-control) 会话。此消息意味着重新连接因可能是临时的原因（例如网络中断或服务器错误）而失败，因此 Claude Code 无法确认远程会话是否仍然存在。您的本地会话继续运行而不使用 Remote Control。

**应该做什么：**

* 运行 `/remote-control` 以重试连接
* 启动 Claude Code 而不使用 `--resume` 以创建新的 Remote Control 会话
* 有关其他 Remote Control 启动消息，请参阅[排查 Remote Control 故障](/docs/zh-CN/remote-control#troubleshooting)

当服务器确认前一个会话不再存在时，您不会看到此消息；Claude Code 在这种情况下会创建一个新的会话。在 v2.1.200 之前，任何重新连接失败都会创建一个新的 Remote Control 会话，这在 claude.ai/code 的会话列表中留下了额外的会话。

<h2 id="request-errors">
  请求错误
</h2>

这些错误与您的请求内容有关。大多数来自 API 在拒绝请求后的返回；少数是由 Claude Code 在发送任何请求之前在本地生成的。

<h3 id="prompt-is-too-long">
  Prompt is too long
</h3>

对话加上附加文件超过了模型的上下文窗口。

```text theme={null}
Prompt is too long
```

**应该做什么：**

* 运行 `/compact` 来总结早期的回合并释放空间，或运行 `/clear` 来重新开始
* 运行 `/context` 来查看消耗窗口的内容分解：系统提示、工具、内存文件和消息
* 使用 `/mcp disable <name>` 禁用您未使用的 MCP 服务器，以从上下文中移除其工具定义
* 修剪大型 `CLAUDE.md` 内存文件，或将说明移到[路径范围规则](/docs/zh-CN/memory#path-specific-rules)中，这些规则仅在相关时加载
* 子代理从父会话继承每个 MCP 工具定义，这可能会在第一个回合之前填满它们的上下文窗口。在生成子代理之前禁用您未使用的 MCP 服务器。
* 自动压缩默认启用，通常可以防止此错误。如果您设置了 [`DISABLE_AUTO_COMPACT`](/docs/zh-CN/env-vars)，请重新启用它或在窗口填满之前手动运行 `/compact`。

请参阅[探索上下文窗口](/docs/zh-CN/context-window)以获得上下文如何填充的交互式视图。

<h3 id="error-during-compaction-conversation-too-long">
  Error during compaction: Conversation too long
</h3>

`/compact` 本身失败，因为没有足够的可用上下文来容纳它生成的摘要。

```text theme={null}
Error during compaction: Conversation too long. Press esc twice to go up a few messages and try again.
```

当窗口在自动压缩触发时已经满了，或者在看到 `Prompt is too long` 后运行 `/compact` 时，可能会发生这种情况。

**应该做什么：**

* 按 Esc 两次打开消息列表并回退几个回合。这会从上下文中删除最近的消息。然后再次运行 `/compact`。
* 如果回退没有释放足够的空间，运行 `/clear` 来启动新的会话。您之前的对话会被保留，可以使用 `/resume` 重新打开。

<h3 id="request-too-large">
  Request too large
</h3>

原始请求体在标记化之前超过了 API 的字节限制，通常是因为粘贴的大文件或附件。

```text theme={null}
Request too large (max 30 MB). Double press esc to go back and remove or shrink the attached content.
```

这是 HTTP 请求的大小限制，与[上下文窗口限制](#prompt-is-too-long)分开。

**应该做什么：**

* 按 Esc 两次并回退到添加超大内容的回合之前
* 通过路径引用大文件而不是粘贴其内容，以便 Claude 可以分块读取它们
* 对于图像，请参阅下面的[图像太大](#image-was-too-large)

<h3 id="image-was-too-large">
  Image was too large
</h3>

粘贴或附加的图像超过了 API 的大小或尺寸限制。

```text theme={null}
Image was too large. Double press esc to go back and try again with a smaller image.
API Error: 400 ... image dimensions exceed max allowed size
```

Claude Code 将无法处理的图像替换为文本占位符并重试，因此后续消息成功。在 2.1.142 之前的版本中，粘贴的图像可能会保留在对话中，并在后续的每条消息上重复相同的错误。要在这些版本上恢复，请按 Esc 两次并回退到添加图像的回合之前。

**应该做什么：**

* 在粘贴之前调整图像大小。API 接受单个图像最长边最多 8000 像素的图像，或当许多图像在上下文中时为 2000 像素。
* 拍摄相关区域的更紧密屏幕截图，而不是整个屏幕

<h3 id="unable-to-resize-image">
  Unable to resize image
</h3>

Claude Code 无法在将附加图像发送到 API 之前对其进行缩小。

```text theme={null}
Unable to resize image — image processing is unavailable and dimensions could not be read from the file header. Please convert the image to PNG, JPEG, GIF, or WebP.
Unable to resize image — dimensions exceed the 2000x2000px limit and image processing failed. Please resize the image to reduce its pixel dimensions.
Unable to resize image (… raw, … base64). The image exceeds the … API limit and compression failed. Please resize the image manually or use a smaller image.
Unable to resize image — could not verify image dimensions are within the 2000x2000px API limit.
```

Claude Code 通常会自动调整大型图像的大小。这些错误意味着本机图像处理器无法加载或返回错误，因此无法调整图像大小以适应 API 限制。

**应该做什么：**

* 如果消息要求您转换图像，请将其转换为 PNG、JPEG、GIF 或 WebP，然后再次附加。Claude Code 可以在不使用图像处理器的情况下验证这些格式的尺寸。
* 如果消息报告尺寸或大小限制，请在附加之前将图像调整大小或重新压缩到该限制以下。

<h3 id="pdf-errors">
  PDF errors
</h3>

您附加的 PDF 无法处理。

```text theme={null}
PDF too large (max 100 pages, 32 MB). Try splitting it or extracting text first.
PDF is password protected. Try removing protection or extracting text first.
The PDF file was not valid. Try converting to a different format first.
```

**应该做什么：**

* 对于超大 PDF，要求 Claude 使用 Read 工具读取页面范围而不是附加整个文件，或使用 `pdftotext` 之类的工具提取文本并通过路径引用输出文件
* 对于受保护或无效的 PDF，删除密码或从其源应用程序重新导出文件，然后重试

<h3 id="extra-inputs-are-not-permitted">
  Extra inputs are not permitted
</h3>

Claude Code 和 API 之间的代理或 LLM 网关删除了 `anthropic-beta` 请求头，因此 API 拒绝了依赖它的字段。

```text theme={null}
API Error: 400 ... Extra inputs are not permitted ... context_management
API Error: 400 ... Extra inputs are not permitted ... tools.0.custom.input_examples
API Error: 400 ... Unexpected value(s) for the `anthropic-beta` header
```

Claude Code 发送仅限测试版的字段，如 `context_management`、`effort` 和工具 `input_examples`，以及启用它们的 `anthropic-beta` 头。当网关转发正文但删除头时，API 会看到它不识别的字段。

**应该做什么：**

* 配置您的网关以转发 `anthropic-beta` 头。请参阅[功能传递](/docs/zh-CN/llm-gateway-protocol#feature-pass-through)了解网关必须转发的内容。
* 作为备选方案，在启动前设置 [`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`](/docs/zh-CN/env-vars)。这会禁用需要测试版头的功能，以便请求通过无法转发它的网关成功。

<h3 id="theres-an-issue-with-the-selected-model">
  There's an issue with the selected model
</h3>

配置的模型名称未被识别，或您的账户无权访问它。从 v2.1.160 开始，尾部提示（此处以其交互形式显示）因表面而异。

```text theme={null}
There's an issue with the selected model (claude-...). It may not exist or you may not have access to it. Run /model to pick a different model.
```

**应该做什么：**

* **交互式 CLI**：运行 `/model` 从您账户可用的模型中选择。
* **非交互模式 (`-p`)**：使用有效的别名或 ID 传递 `--model`，或设置 [`ANTHROPIC_MODEL`](/docs/zh-CN/env-vars)。错误文本在此表面上显示 `Run --model`。
* **Agent SDK**：错误文本省略提示，因为模型是以编程方式设置的。在 TypeScript 中设置 [`Options` 上的 `model`](/docs/zh-CN/agent-sdk/typescript#options) 或在 Python 中设置 [`ClaudeAgentOptions(model=...)`](/docs/zh-CN/agent-sdk/python#claudeagentoptions)，并处理结构化的 `model_not_found` 错误以显示您自己的重试或模型选择器。
* 使用别名（如 `sonnet` 或 `opus`）而不是完整的版本化 ID。别名解析为维护的默认值，因此不会过时。请参阅[模型配置](/docs/zh-CN/model-config)。
* 如果 CLI 中一直返回错误的模型，则某处设置了过时的 ID。按[优先级顺序](/docs/zh-CN/model-config#setting-your-model)检查：`--model` 标志、`ANTHROPIC_MODEL` 环境变量，然后是 `.claude/settings.local.json` 中的 `model` 字段、您项目的 `.claude/settings.json` 和 `~/.claude/settings.json`。删除过时的值，Claude Code 会回退到您的账户默认值。
* Claude Code 将过期的 claude.ai 登录报告为[登录已过期](#login-expired)，而不是此错误。在 v2.1.206 之前，无法再刷新的过期登录在每个模型上都失败，出现此错误；如果您在较旧版本上看到这个，请运行 `/login`。
* 对于 Google Cloud 的 Agent Platform 部署，请参阅 [Google Cloud 的 Agent Platform 故障排除](/docs/zh-CN/google-vertex-ai#troubleshooting)。

<h3 id="model-is-not-a-recognized-model-id">
  Model is not a recognized model id
</h3>

您传递给模型切换的模型字符串不是模型别名、此 Claude Code 版本知道的模型 ID，也不是以 `claude-` 开头的 ID。常见原因是 ID 中的拼写错误、显示名称（如 `Sonnet 5`，其中需要 ID `claude-sonnet-5`）或仅较新 Claude Code 版本识别的别名。Claude Code 立即拒绝切换。在 v2.1.200 之前，Claude Code 保存字符串并在下一个请求时失败，出现[所选模型有问题](#theres-an-issue-with-the-selected-model)。

```text theme={null}
Model "claud-sonnet-5" is not a recognized model id. Did you mean 'claude-sonnet-5'?
```

尾部提示命名最接近的匹配别名或模型 ID。当没有足够接近的内容时，它读作 `Run /model to see available models.`。

Claude Code 在请求切换时在本地生成此错误，在发出任何 API 请求之前。它适用于通过 [Agent SDK](/docs/zh-CN/agent-sdk/typescript) `setModel()` 方法或为您运行 Claude Code CLI 的应用程序（如 [Desktop app](/docs/zh-CN/desktop)）设置模型的情况。

**应该做什么：**

* 运行不带参数的 `/model` 来打开选择器并从您账户可用的模型中选择，然后传递那里显示的别名或 ID
* 如果您使用了较新 Claude Code 版本支持的别名，运行 `claude update`。以 `claude-` 开头的完整 ID 即使模型比您的 Claude Code 版本更新，也会通过此检查，因此不需要升级。
* v2.1.200 之前保存的模型不会被此检查修复。如果过时的值一直出现，请从[所选模型有问题](#theres-an-issue-with-the-selected-model)下列出的位置中删除它。
* 检查仅在 Anthropic API 上运行。在 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry、[Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws) 和 [LLM 网关](/docs/zh-CN/llm-gateway)后面或自定义 `ANTHROPIC_BASE_URL`，您的提供商或网关定义模型名称，因此 Claude Code 接受任何字符串并将其传递。

<h3 id="claude-opus-is-not-available-with-the-claude-pro-plan">
  Claude Opus is not available with the Claude Pro plan
</h3>

您的活跃订阅计划不包括您选择的模型。

```text theme={null}
Claude Opus is not available with the Claude Pro plan · Select a different model in /model
```

**应该做什么：**

* 运行 `/model` 并选择您的计划包含的模型
* 如果您最近升级了计划但仍然看到这个，运行 `/logout` 然后 `/login`。存储的令牌反映您登录时的计划，因此在现有会话中在网络上升级不会生效，直到您重新进行身份验证。
* 请参阅 [claude.com/pricing](https://claude.com/pricing) 了解每个计划包含哪些模型

<h3 id="model-is-restricted-by-your-organizations-settings">
  Model is restricted by your organization's settings
</h3>

您的组织管理员在 claude.ai 管理控制台中禁用了此模型，或者它被托管设置中的 [`availableModels`](/docs/zh-CN/model-config#restrict-model-selection) 允许列表排除。当受限模型使用 `--model`、`ANTHROPIC_MODEL` 或 `model` 设置设置时，Claude Code 替换允许的模型并继续。为受限模型键入 `/model <name>` 会被拒绝，显示 `Run /model to choose a different model.`，会话保持其当前模型。

```text theme={null}
Model "claude-opus-4-8" is restricted by your organization's settings. Using claude-sonnet-4-6 instead.
```

Claude Code 将模型族别名（`opus`、`sonnet`、`haiku` 或 `fable` 之一）视为对该族的请求，而不是对其最新版本的请求。在 Anthropic API 和 [Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws) 上，受限的族别名解析为您的组织和 `availableModels` 允许列表允许的族的最新版本，替换通知命名该版本。Claude Code 仅当族的每个版本都受限时才拒绝 `/model <alias>`。在 v2.1.205 之前，族别名基于其最新版本单独替换或拒绝，即使同一族的较旧版本被允许。

**应该做什么：**

* 运行 `/model` 从您的组织允许的模型中选择。受限模型从选择器中隐藏。
* 如果受限模型在 `--model`、`ANTHROPIC_MODEL` 或设置文件的 `model` 字段中设置，删除或更新该值，以便通知不会在每次启动时重复出现
* 如果您需要访问受限模型，请要求您的组织管理员启用它。请参阅[组织模型限制](/docs/zh-CN/model-config#organization-model-restrictions)。

<h3 id="thinking-type-enabled-is-not-supported-for-this-model">
  thinking.type.enabled is not supported for this model
</h3>

您的 Claude Code 版本比 Sonnet 5、Opus 4.8 或 Opus 4.7 的最低版本更旧。CLI 发送了模型不再接受的思考配置。

```text theme={null}
API Error: 400 ... "thinking.type.enabled" is not supported for this model. Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.
```

**应该做什么：**

* 运行 `claude update` 并重启 Claude Code。Opus 4.7 需要 v2.1.111 或更高版本。Opus 4.8 需要 v2.1.154 或更高版本。Sonnet 5 需要 v2.1.197 或更高版本
* 如果您无法升级，运行 `/model` 并改为选择 Opus 4.6 或 Sonnet 4.6
* 如果您在 [Agent SDK](/docs/zh-CN/agent-sdk/overview) 中遇到这个问题，请升级 SDK 包。Opus 4.8 需要 TypeScript SDK v0.3.154 或更高版本和 Python SDK v0.2.88 或更高版本。Sonnet 5 需要 TypeScript SDK v0.3.197 或更高版本

<h3 id="thinking-budget-exceeds-output-limit">
  Thinking budget exceeds output limit
</h3>

配置的扩展思考预算超过了最大响应长度，因此没有空间留给实际答案。

```text theme={null}
API Error: 400 ... max_tokens must be greater than thinking.budget_tokens
```

Claude Code 在 Anthropic API 上自动调整这些值。您通常在 Amazon Bedrock 或 Google Cloud 的 Agent Platform 上看到此错误，当 [`MAX_THINKING_TOKENS`](/docs/zh-CN/env-vars) 设置高于提供商的输出限制时，或当计划模式提高思考预算时。

**应该做什么：**

* 降低 `MAX_THINKING_TOKENS`，或将 [`CLAUDE_CODE_MAX_OUTPUT_TOKENS`](/docs/zh-CN/env-vars) 提高到思考预算之上
* 请参阅[扩展思考](/docs/zh-CN/model-config#extended-thinking)了解预算如何与输出长度相互作用

<h3 id="tool-use-or-thinking-block-mismatch">
  Tool use or thinking block mismatch
</h3>

对话历史以不一致的状态到达 API，通常是在工具调用被中断或回合在流中途被编辑后。

```text theme={null}
API Error: 400 due to tool use concurrency issues. Run /rewind to recover the conversation.
API Error: 400 ... unexpected `tool_use_id` found in `tool_result` blocks
API Error: 400 ... thinking blocks ... cannot be modified
```

所有三个变体都意味着同一件事：历史中 `tool_use`、`tool_result` 和 `thinking` 块的序列不再与 API 期望的相匹配。

**应该做什么：**

* 如果您使用的是 Opus 4.7 或 Opus 4.8，请先运行 `claude update`。v2.1.156 之前的版本可能在正常工具使用期间触发此错误，`/rewind` 不会清除它。
* 运行 `/rewind` 或按 Esc 两次，回退到损坏回合之前的检查点并从那里继续。请参阅[检查点](/docs/zh-CN/checkpointing)了解如何创建和恢复检查点。

<h3 id="usage-policy-refusal">
  Usage Policy refusal
</h3>

API 拒绝响应，因为对话中的内容触发了[使用政策](https://www.anthropic.com/legal/aup)检查。消息包含一个请求 ID，如果您认为拒绝不正确，可以向支持部门引用。

```text theme={null}
API Error: Claude Code is unable to respond to this request, which appears to violate our Usage Policy (https://www.anthropic.com/legal/aup). Please double press esc to edit your last message or start a new session for Claude Code to assist with a different task.
```

检查评估完整对话，而不仅仅是您的最新提示，因此在同一会话中发送新消息通常会重新触发相同的拒绝。在使用 `--continue` 或 `--resume` 退出并重新打开会话后也是如此，因为磁盘上的记录仍然包含触发内容。在 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud 的 Agent Platform](/docs/zh-CN/google-vertex-ai) 和 [Microsoft Foundry](/docs/zh-CN/microsoft-foundry) 上，此消息也涵盖模型的安全措施标记为网络安全主题的请求。请参阅[安全措施标记了网络安全主题](#safety-measures-flagged-a-cybersecurity-topic)。

**应该做什么：**

* 按 Esc 两次或运行 `/rewind` 回退到触发拒绝的回合之前的检查点，然后重新表述或采取不同的方法。请参阅[检查点](/docs/zh-CN/checkpointing)。
* 如果您无法识别哪个回合导致了它，运行 `/clear` 在同一项目中启动新对话。您之前的对话保留在磁盘上，在 `/resume` 中仍然可用。
* 在[非交互模式](/docs/zh-CN/headless)(`-p`) 中，其中 rewind 不可用，在没有 `--continue` 的新会话中使用重新表述的提示重试。政策检查因模型而异，因此使用 `--model` 切换到不同的模型也可能在某些情况下解决拒绝。

<h3 id="safety-measures-flagged-a-cybersecurity-topic">
  Safety measures flagged a cybersecurity topic
</h3>

模型的安全措施将对话中的内容标记为网络安全主题。消息命名标记请求的模型：

```text theme={null}
API Error: Opus 4.8 has safety measures that flagged this message for a cybersecurity topic. To learn about the Cyber Verification Program and apply for access, visit our help center: https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude.

If you were not engaging in a cybersecurity topic, please send feedback via /feedback.
```

消息链接到[网络验证计划](https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude)，该计划为合法网络安全工作授予访问权限。保护措施本身是服务器端的，早于 v2.1.203；此版本仅更改了消息的措辞和它链接到的页面。

您看到的内容取决于您的提供商和模式：

* 在 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud 的 Agent Platform](/docs/zh-CN/google-vertex-ai) 和 [Microsoft Foundry](/docs/zh-CN/microsoft-foundry) 上，网络安全标志会产生[使用政策拒绝](#usage-policy-refusal)消息。
* [非交互模式](/docs/zh-CN/headless)省略 `/feedback` 句子。

在 v2.1.203 之前，消息读作 `<model>'s safeguards flagged this message for a cybersecurity topic. If your work requires this access, you can apply for an exemption:` 后跟豁免表单链接。

**应该做什么：**

* 如果您的工作需要此内容，请通过[网络验证计划](https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude)申请访问权限
* 如果您的请求不是关于网络安全主题，运行 `/feedback` 来报告误报
* 要在同一会话中继续工作，按 Esc 两次或运行 `/rewind` 回退到触发标志的回合之前的检查点，然后采取不同的方法。请参阅[检查点](/docs/zh-CN/checkpointing)。

<h2 id="installation-errors">
  安装错误
</h2>

这些错误在安装或更新 Claude Code 时出现，来自[安装脚本](/docs/zh-CN/setup#install-claude-code)、`claude install` 或 `claude update`。对于设置期间的 `command not found`、PATH、权限和 TLS 问题，请参阅[排查安装和登录问题](/docs/zh-CN/troubleshoot-install)。

<h3 id="installation-was-killed-before-it-could-finish">
  安装在完成前被中止
</h3>

安装脚本会报告 `claude install` 步骤何时被信号终止。在 Linux 上，退出代码 137 表示进程收到了 SIGKILL，在低内存主机上通常是内核内存不足 (OOM) 杀手。脚本打印此说明并以代码 137 退出：

```text theme={null}
Installation was killed before it could finish (exit code 137). This usually means the system ran out of memory.
Claude Code needs roughly 512MB of free memory to install. Free up memory, then run this script again.
```

对于任何其他致命信号，以及 macOS 上的退出代码 137，脚本打印 `Installation was killed before it could finish (exit code <N>)`，其中包含实际退出代码，并省略内存不足的说明。该消息来自 macOS 和 Linux 使用的安装脚本，该脚本也涵盖 WSL 内的安装；本机 Windows 安装脚本永远不会打印它。在 v2.1.200 之前，脚本仅以 shell 的裸 `Killed` 行退出。

**应该做什么：**

* 停止其他进程以释放内存，然后重新运行安装程序
* 添加交换空间或移至更大的实例。有关交换文件命令，请参阅[在低内存 Linux 服务器上安装被中止](/docs/zh-CN/troubleshoot-install#install-killed-on-low-memory-linux-servers)。

<h3 id="the-connection-dropped-while-downloading-the-update">
  下载更新时连接断开
</h3>

在 `claude install`、`claude update` 或[自动更新程序](/docs/zh-CN/setup#auto-updates)获取 Claude Code 二进制文件时，与下载服务器的连接关闭，重试未能恢复。当连接断开、传输停滞或下载的文件未通过校验和时，Claude Code 会重试下载，总共最多尝试三次。已完成的 HTTP 错误（例如 404）不会重试，因为服务器已经响应。在 v2.1.202 之前，单个断开的连接会立即导致下载失败，显示裸错误 `aborted`，而不是重试。

```text theme={null}
The connection dropped while downloading the update (attempt 3/3: aborted). Check your network — proxies sometimes cut off large downloads.
```

括号中的文本命名失败的尝试和底层网络错误。`claude update` 在 stderr 上以 `Error: Failed to install native update` 开头的消息。

保持连接但在 10 分钟内未完成的下载失败，显示 `Download timed out: exceeded the total deadline`。Claude Code 不会重试超时的下载，因为连接速度太慢而无法在截止时间内完成，在立即重试时也不会完成。以下步骤适用于两条消息。在 v2.1.205 之前，相同的 10 分钟截止时间被报告为 HTTP 客户端的通用 `timeout of 600000ms exceeded`。

通常的原因是代理或网关在长传输完成前关闭它。Claude Code 二进制文件是一个大型下载，因此永远不会影响正常 API 流量的代理连接限制仍然可能中断它。

**应该做什么：**

* 再次运行 `claude update`。在网络状况良好的情况下，下载通常在下次运行时成功。对于超时消息，从更快或限制较少的网络再次运行它。
* 如果您的网络需要代理，请在运行安装程序或 `claude update` 之前设置 `HTTPS_PROXY`。请参阅[检查网络连接](/docs/zh-CN/troubleshoot-install#check-network-connectivity)。
* 如果公司代理持续关闭传输，请要求您的网络团队允许从 `downloads.claude.ai` 进行完整下载。请参阅[网络访问要求](/docs/zh-CN/network-config#network-access-requirements)。
* 从您的 shell 运行 `claude doctor` 以进行安装诊断

<h2 id="command-line-errors">
  命令行错误
</h2>

这些错误来自 `claude` 命令行及其子命令。Claude Code 在运行您的提示或发送任何 API 请求之前会打印这些错误。

<h3 id="conflict-between-bg-and-print">
  \--bg 和 --print 之间的冲突
</h3>

此消息需要 Claude Code v2.1.198 或更高版本。您在同一个 `claude` 调用中将 `--bg` 与 `-p` 或 `--print` 结合使用。`--bg` 启动一个[后台会话](/docs/zh-CN/agent-view#from-your-shell)，您稍后可以使用 `claude agents` 附加到该会话，而 `--print` 以[非交互方式](/docs/zh-CN/headless)运行，永远不会启动 `claude agents` 附加到的交互会话。在 v2.1.198 之前，此组合会静默创建一个永远无法附加的后台作业。

```text theme={null}
--bg and --print conflict: --print never starts the interactive session that `claude agents` attaches to, so the job would be unattachable. The prompt is the positional — drop --print: `claude --bg '<task>'`.
```

**应该怎么做：**

* 删除 `-p` 或 `--print`。`--bg` 将提示作为其位置参数，所以 `claude --bg "<task>"` 是完整的命令。请参阅[从您的 shell 分派新代理](/docs/zh-CN/agent-view#from-your-shell)。
* 要以非交互方式运行提示并打印结果而不是创建后台会话，请删除 `--bg` 并运行 `claude -p "<task>"`

<h3 id="the-json-schema-value-is-not-a-valid-json-schema">
  \--json-schema 值不是有效的 JSON Schema
</h3>

您在[非交互模式](/docs/zh-CN/headless#get-structured-output)中传递给 [`--json-schema`](/docs/zh-CN/cli-reference#cli-flags) 的架构未能通过 JSON Schema 编译，因此 `claude` 以代码 1 退出，而不是运行提示。在 v2.1.205 之前，无效的架构会产生无结构的输出且没有错误，任何使用 `format` 关键字的架构都被视为无效。

```text theme={null}
Error: --json-schema is not a valid JSON Schema: data/type must be equal to one of the allowed values
```

第二个冒号后面的文本是验证器的诊断，并命名了失败的关键字或位置。使用 `format` 关键字的架构（例如 `"format": "email"`）是有效的：Claude Code 接受 `format` 作为注释，不强制执行它。

Claude Code 在架构编译之前运行两项检查：它拒绝不可解析的 JSON 值，并显示 `Error: --json-schema is not valid JSON`，以及拒绝不是对象的有效 JSON，并显示 `Error: --json-schema must be a JSON object`。

**应该怎么做：**

* 修复诊断命名的架构部分，然后重新运行命令
* 如果诊断是 `schema too large`，请减少架构的嵌套和 `$ref` 重用
* 请参阅[获取结构化输出](/docs/zh-CN/headless#get-structured-output)以获取有效的架构和命令

<h3 id="could-not-import-a-server-from-claude-desktop">
  无法从 Claude Desktop 导入服务器
</h3>

Claude Code 无法添加您在 `claude mcp add-from-claude-desktop` 中选择的其中一个服务器。该命令仍然导入其他选定的服务器，并为每个无法添加的服务器打印一行。在 v2.1.205 之前，第一个失败的服务器会停止导入，并且不会添加任何选定的服务器。

```text theme={null}
Could not import my server: Invalid name my server. Names can only contain letters, numbers, hyphens, and underscores.
```

服务器名称后面的文本是原因。最常见的是名称检查：Claude Desktop 允许服务器名称中的字符（例如空格和句号），而 `claude mcp` 仅限于字母、数字、连字符和下划线。其他原因包括未通过验证的服务器配置和被您组织的 [MCP 策略](/docs/zh-CN/managed-mcp)阻止的服务器。

**应该怎么做：**

* 在 `claude_desktop_config.json` 中重命名服务器，仅使用字母、数字、连字符和下划线，然后再次运行 `claude mcp add-from-claude-desktop`
* 使用 `claude mcp add` 或 `claude mcp add-json` 在有效名称下直接添加该服务器。请参阅[从 Claude Desktop 导入 MCP 服务器](/docs/zh-CN/mcp#import-mcp-servers-from-claude-desktop)。

<h3 id="mcp-permission-prompt-tool-not-found">
  找不到 MCP 权限提示工具
</h3>

您传递给 [`--permission-prompt-tool`](/docs/zh-CN/cli-reference#cli-flags) 的工具在运行首次需要权限决定时不在连接的 MCP 工具中，原因可能是其服务器从未连接，或者没有连接的服务器公开该名称的工具。Claude Code 仍然发送您的提示：[非交互](/docs/zh-CN/headless)运行在第一个需要批准的工具调用时以此错误和退出代码 1 退出，因此即使请求已发出，它也不会产生答案。在第一个提示之前，Claude Code 会等待最多由 [`MCP_TIMEOUT`](/docs/zh-CN/env-vars) 设置的每个服务器连接超时 30 秒，以便该服务器连接。在 v2.1.206 之前，启动不会等待服务器完成连接，因此启动缓慢但健康的服务器也会产生此错误。

```text theme={null}
Error: MCP tool mcp__permissions__approve (passed via --permission-prompt-tool) not found. Available MCP tools: none
```

`Available MCP tools:` 后面的列表命名了在等待结束时连接的 MCP 工具。

**应该怎么做：**

* 检查服务器是否启动并保持连接：在同一目录中运行 `claude mcp list`，并确认服务器列为已连接
* 确认工具名称与服务器公开的 `mcp__<server>__<tool>` 名称匹配
* 如果服务器需要超过 30 秒才能启动，请提高 [`MCP_TIMEOUT`](/docs/zh-CN/env-vars)

<h2 id="plugin-errors">
  插件错误
</h2>

这些错误来自[插件](/docs/zh-CN/plugins)和[marketplace](/docs/zh-CN/plugin-marketplaces)配置。对于不会产生本页面上的消息之一的插件问题，例如无法加载的 marketplace URL 或已安装但不显示的插件，请参阅[插件故障排除](/docs/zh-CN/discover-plugins#troubleshooting)。

<h3 id="marketplace-is-registered-from-an-untrusted-source">
  Marketplace 从不受信任的源注册
</h3>

marketplace 以[为官方 Anthropic marketplace 保留的名称](/docs/zh-CN/plugin-marketplaces#marketplace-schema)注册，但其注册源不是 `anthropics` GitHub 存储库。Claude Code 每次加载或刷新 marketplace 时都会重新检查保留的名称，因此 marketplace 和从中安装的插件停止加载。在 v2.1.205 之前，仅在添加 marketplace 时检查名称，因此在其名称被保留之前注册的条目继续加载。

```text theme={null}
Marketplace "claude-community" is registered from an untrusted source: The name 'claude-community' is reserved for official Anthropic marketplaces. Only repositories from 'github.com/anthropics/' can use this name. To fix it, remove the marketplace and re-add it from the official source.
```

**应该怎么做：**

* 运行 `claude plugin marketplace remove <name>`，然后从官方 `github.com/anthropics` 存储库重新添加 marketplace
* 如果您发布了在名称被保留之前使用该名称的第三方 marketplace，请重命名它并要求用户从您的源重新添加它
* 请参阅[Marketplace schema](/docs/zh-CN/plugin-marketplaces#marketplace-schema)下的保留名称列表

<h3 id="plugin-command-references-user-config">
  插件命令在 shell 命令中引用 user\_config
</h3>

插件 hook、[monitor](/docs/zh-CN/plugins-reference#monitors)或 MCP [`headersHelper`](/docs/zh-CN/mcp#use-dynamic-headers-for-custom-authentication)命令引用 `${user_config.KEY}` [插件选项](/docs/zh-CN/plugins-reference#user-configuration)，替换后的字符串将被传递到 shell。配置的值包含 `$(...)` 、反引号或 `;` 会在那里作为代码运行，因此 Claude Code 拒绝启动该组件而不是替换该值。检查在命令模板上运行，因此即使尚未配置任何值，错误也会出现。在 v2.1.207 之前，该值被替换到 shell 命令中。

措辞取决于哪个表面引用了该选项。shell 形式的 hook 报告：

```text theme={null}
Hook from plugin formatter@acme-tools references ${user_config.*} in a shell-form command. The substituted value would be re-parsed by the shell. Use exec form instead — {"command": "<executable>", "args": ["${user_config.KEY}", ...]} — or read $CLAUDE_PLUGIN_OPTION_<KEY> from the hook's environment. Command: ./scripts/notify.sh ${user_config.webhook_url}
```

monitor 报告：

```text theme={null}
Monitor "deploy-status" from plugin deploy-tools references ${user_config.*} in its command. The substituted value would be passed to a shell. Monitor commands cannot safely reference ${user_config.*}; have the monitor script read the value from a config file or prompt instead.
```

MCP `headersHelper` 报告：

```text theme={null}
headersHelper for MCP server 'internal-api' references ${user_config.*}. The substituted value would be passed to a shell; read the value inside the helper script instead (e.g. from an env var set in the server's "env" block).
```

**应该怎么做：**

* 对于 hook，添加 `args` 数组以便它在[exec 形式](/docs/zh-CN/hooks#exec-form-and-shell-form)中运行，其中每个 `${user_config.KEY}` 成为一个参数，中间没有 shell。或删除引用并在脚本内读取 `$CLAUDE_PLUGIN_OPTION_<KEY>` 环境变量
* 对于 monitor，删除引用并让 monitor 脚本从配置文件读取该值
* 对于 `headersHelper`，将 `${user_config.KEY}` 移到服务器的 `headers` 字段中，该字段不会被 shell 解析，或在 helper 脚本内读取该值

<h2 id="tool-errors">
  工具错误
</h2>

这些错误来自 Claude 的内置工具拒绝输入。Claude 会自动纠正大多数工具错误；下面两个错误需要你进行更改，因为它们来自你控制的子代理定义或权限规则。

<h3 id="agent-would-be-spawned-with-zero-tools">
  Agent would be spawned with zero tools
</h3>

[子代理的 `tools` 列表](/docs/zh-CN/sub-agents#supported-frontmatter-fields)中没有任何内容解析为工具，因此 Claude Code 拒绝启动子代理，而不是启动一个无法执行操作的代理。该消息按它们未解析的原因对条目进行分组：不是公认的工具、子代理不可用的工具，或已识别但与当前会话中的任何工具都不匹配。省略 `tools` 字段永远不会触发此拒绝。MCP 服务器模式（如 `mcp__github__*`）不例外：当没有来自该服务器的连接工具时，启动会被拒绝，该模式在匹配失败组中。在 v2.1.208 之前，子代理启动时没有工具，并返回空结果或令人困惑的结果。

```text theme={null}
Agent 'code-reviewer' would be spawned with zero tools — refusing. Its tools list resolved to nothing: unrecognized [Grpe]. Fix the agent's tools frontmatter or pass a different subagent_type.
```

**应该做什么：**

* 针对[子代理可用的工具](/docs/zh-CN/sub-agents#available-tools)纠正错误命名的每个条目
* 删除会话没有的工具条目，例如来自未连接的服务器的 MCP 工具
* 要给子代理提供父代理拥有的每个工具，请删除 `tools` 字段而不是列出工具

<h3 id="file-is-covered-by-a-read-deny-rule">
  File is covered by a Read deny rule
</h3>

Edit 工具在与 [`Read` 拒绝规则](/docs/zh-CN/permissions#read-and-edit)匹配的路径上被调用，包括在该路径创建新文件。编辑会重写 Claude 必须能够读回的内容，因此在任何文件访问之前调用被拒绝。该规则仅阻止 Edit 工具：Write 和 NotebookEdit 不受 `Read` 拒绝规则的覆盖。在 v2.1.208 之前，只有 `Edit` 拒绝规则阻止编辑，而 `Read` 拒绝规则单独不会。

```text theme={null}
File is covered by a Read deny rule in your permission settings and cannot be edited.
```

**应该做什么：**

* 如果 Claude 应该能够编辑该文件，请在 `/permissions` 或[设置](/docs/zh-CN/settings#permission-settings)中删除或缩小 `Read` 拒绝规则
* 如果文件必须保持不变，请保留该规则并为相同路径添加 `Edit` 拒绝规则，以便 Write 和 NotebookEdit 工具也被阻止

<h2 id="background-session-errors">
  后台会话错误
</h2>

[后台会话](/docs/zh-CN/agent-view)在没有交互式终端的情况下运行，因此需要终端的命令在那里的行为会有所不同。这些消息出现在后台会话的记录中，在代理视图中或附加后。

<h3 id="commands-refused-in-a-background-session">
  后台会话中被拒绝的命令
</h3>

打开交互式对话框的命令在后台会话中被拒绝，并显示一条消息，该消息要么命名一个在那里有效的表单，要么告诉您从常规终端运行该命令。`/install-github-app`、`/mcp` 设置列表和 MCP 服务器菜单中的身份验证操作都以这种方式被拒绝。在 v2.1.208 之前，它们在后台会话内打开其对话框。
在 v2.1.208 中，`/model` 选择器也在后台会话中被拒绝，`/upgrade` 打印升级 URL 而不是打开浏览器。

措辞会命名被拒绝的命令。`/mcp` 设置列表报告：

```text theme={null}
Can't open MCP settings in a background session — use `/mcp enable|disable|reconnect <server>` to steer, or run /mcp from an interactive terminal to authenticate.
```

**应该怎么做：**

* 使用消息命名的表单，例如 `/mcp reconnect <server>`、`/mcp enable` 或 `/mcp disable`
* 对于登录和授权流程，从终端中的常规 `claude` 会话运行该命令

<h3 id="claude_code_process_wrapper-launcher-errors">
  CLAUDE\_CODE\_PROCESS\_WRAPPER 启动器错误
</h3>

[`CLAUDE_CODE_PROCESS_WRAPPER`](/docs/zh-CN/corporate-launcher) 已设置，其值无法使用，因此 Claude Code 拒绝启动受影响的进程，而不是在没有启动器的情况下运行它。配置问题会报告一条以变量名开头并说明原因的消息，例如：

```text theme={null}
CLAUDE_CODE_PROCESS_WRAPPER: launcher `/opt/corp/launcher` is not an executable regular file
```

启动但退出而不用 Claude Code 替换自身的启动器会导致它启动的会话失败，该会话在代理视图中的行报告启动器 `must exec, not daemonize`，后跟启动器打印的任何内容。由于启动器而无法启动或到达后台服务的会话会将启动器问题报告为 `Couldn't reach the background service (...)` 内的原因。

**应该怎么做：**

* 将变量设置为可执行文件的绝对路径，该文件以调用 `exec "$@"` 结尾。有关完整合同，请参阅[启动器合同](/docs/zh-CN/corporate-launcher#the-launcher-contract)
* 检查 `/status`，它在其 Self-exec 条目中显示已解析的启动命令，并在运行的后台服务与其不匹配时发出警告，或从 shell 运行 `claude daemon status`
* 在[设置](/docs/zh-CN/corporate-launcher#set-up-the-launcher)的 `env` 块中修复值后，使用 `claude daemon stop --any` 重启后台服务，以便下一次调度启动一个包装的服务

<h2 id="configuration-warnings">
  配置警告
</h2>

Claude Code 在启动时将这些消息写入 stderr，而不是在对话中显示错误。它们报告 Claude Code 读取但未应用的配置。

<h3 id="workspace-has-not-been-trusted">
  工作区尚未被信任
</h3>

Claude Code 在项目的 `.claude/settings.json` 或 `.claude/settings.local.json` 中找到了 `permissions.allow` 规则或 `permissions.additionalDirectories` 条目，但未应用它们，因为[项目设置中的允许规则需要工作区信任](/docs/zh-CN/permissions#project-allow-rules-and-workspace-trust)。消息中的计数、设置名称和文件名会根据您的配置而变化。`deny` 和 `ask` 规则不受影响。

```text theme={null}
Ignoring 2 permissions.allow entries from .claude/settings.local.json: this workspace has not been trusted. Run Claude Code interactively here once and accept the trust dialog, or set projects["/Users/you/project"].hasTrustDialogAccepted: true in /Users/you/.claude.json.
```

**应该做什么：**

* 在目录中运行 `claude` 并接受信任对话框。即使父目录已被信任，对话框也会出现，列出被保留的规则，并让您可以拒绝并继续工作而不应用这些规则。在 v2.1.200 之前，在这种情况下不会出现对话框，因此无法在那里完成此步骤。
* 在[非交互模式](/docs/zh-CN/headless)中使用 `-p` 不会显示对话框。使用消息打印的确切 `projects` 密钥在 `~/.claude.json` 中设置 `hasTrustDialogAccepted` 条目。
* 如果消息命名 `.claude/settings.local.json` 并且您在 git 存储库外部或在主目录中启动了 Claude Code，请更新到 v2.1.200 或更高版本。版本 2.1.196 至 2.1.199 在这些工作区中将您自己的 `.claude/settings.local.json` 视为存储库提供的。在 v2.1.207 及更高版本上，如果您尚未信任该文件夹，在 git 存储库外部更新是不够的：确定文件夹不在存储库内会运行 git，Claude Code 仅在您接受信任对话框后才运行该检查，因此请使用第一步。您的主目录和任何其他[配置主目录](/docs/zh-CN/permissions#project-allow-rules-and-workspace-trust)是豁免的，不需要等待对话框。请参阅[项目允许规则和工作区信任](/docs/zh-CN/permissions#project-allow-rules-and-workspace-trust)。

<h2 id="responses-seem-lower-quality-than-usual">
  回复质量似乎低于预期
</h2>

如果 Claude 的回答似乎不如你预期的那样有能力，但没有显示错误，原因通常是对话状态而不是模型本身。Claude Code 不会无声地更改模型版本。它只能在三种特定情况下切换到备用模型：

* 配置的 [`--fallback-model`](/docs/zh-CN/cli-reference#cli-flags) 在可用性错误后接管该轮，并在记录中显示通知
* Amazon Bedrock 或 Google Cloud 的 Agent Platform 启动检查发现你的默认模型不可用
* [自动模型备用](/docs/zh-CN/model-config#automatic-model-fallback)在 Fable 5 上将会话移至默认 Opus 模型，并在记录中显示通知

下面的模型选择检查捕获第二和第三种情况；第一种情况显示为记录通知而不是 `/model` 更改。[模型配置](/docs/zh-CN/model-config)解释了每个备用何时适用。

首先检查这些：

* **模型选择**：运行 `/model` 以确认你在预期的模型上。之前的 `/model` 选择或 `ANTHROPIC_MODEL` 环境变量可能使你在比预期更小的模型上。
* **努力级别**：运行 `/effort` 以检查当前推理级别，并为困难的调试或设计工作提高它。默认值因模型而异，所以在假设你低于最大值之前请检查。有关每个模型的默认值和 `ultrathink` 快捷方式，请参阅[调整努力级别](/docs/zh-CN/model-config#adjust-effort-level)。
* **上下文压力**：运行 `/context` 以查看窗口有多满。如果接近容量，在自然断点处运行 `/compact` 或运行 `/clear` 以重新开始。有关自动压缩如何影响早期轮次的信息，请参阅[探索上下文窗口](/docs/zh-CN/context-window)。
* **过时的指令**：大型或过时的 `CLAUDE.md` 文件和 MCP 工具定义会消耗上下文并可能引导回复。`/doctor` 检查会标记超大内存文件和未使用的扩展，`/context` 显示 MCP 工具令牌使用情况。在 v2.1.205 之前，`/doctor` 打开一个诊断屏幕，标记超大内存文件和子代理定义。

当回复出错时，回退通常比用更正回复效果更好。按 Esc 两次或运行 `/rewind` 以回到坏轮之前，然后用更具体的内容重新表述提示。在线程中更正会将错误的尝试保留在上下文中，这可能会将后来的答案锚定到它。请参阅[检查点](/docs/zh-CN/checkpointing)。

如果在检查上述内容后质量仍然似乎有问题，运行 `/feedback` 并描述你期望的内容与你得到的内容。以这种方式提交的反馈包括对话记录，这是 Anthropic 诊断真实回归的最快方式。如果 `/feedback` 在你的环境中不可用，请参阅[报告错误](#report-an-error)。

如果 Claude 警告可疑的提示注入，或因可疑注入而拒绝请求，并且警告命名的文本是 Claude Code 自动添加到对话中的上下文而不是文件或网络内容，运行 `claude update` 并重试。如果更新后警告重复出现，[报告它](#report-an-error)而不是将标记的内容粘贴回提示中。在 v2.1.201 之前，Sonnet 5 以相同的方式拒绝了一些请求。

<h2 id="report-an-error">
  报告错误
</h2>

对于此页面未涵盖的组件错误，请参阅相关指南：

* MCP 服务器连接或身份验证失败：[MCP](/docs/zh-CN/mcp)
* Hook 脚本失败或阻止了工具：[调试 hooks](/docs/zh-CN/hooks#debug-hooks)
* 安装期间权限被拒绝或文件系统错误：[排查安装和登录问题](/docs/zh-CN/troubleshoot-install)

如果此处未列出错误或建议的修复方法无法帮助：

* 在 Claude Code 中运行 `/feedback` 将记录和描述发送给 Anthropic。该命令还提供打开预填充的 GitHub issue 的选项。发送到 Anthropic 需要[身份验证](/docs/zh-CN/authentication)。在 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 和其他第三方提供商上，或者当未配置 Anthropic 凭证时，`/feedback` 会保存一个本地存档，您可以将其发送给您的 Anthropic 账户代表。
* 从您的 shell 中运行 `claude doctor` 以获取安装的只读诊断，或在 Claude Code 中运行 `/doctor` 检查以查找和修复设置问题
* 检查 [status.claude.com](https://status.claude.com) 以了解活跃的事件
* 在 GitHub 上搜索[现有问题](https://github.com/anthropics/claude-code/issues)
