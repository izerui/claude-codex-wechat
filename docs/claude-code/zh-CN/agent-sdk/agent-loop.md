> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 代理循环如何工作

> 了解消息生命周期、工具执行、上下文窗口和支持 SDK 代理的架构。

Agent SDK 让你能够在自己的应用程序中嵌入 Claude Code 的自主代理循环。SDK 是一个独立的包，让你能够以编程方式控制工具、权限、成本限制和输出。你不需要安装 Claude Code CLI 就能使用它。

启动代理时，SDK 运行与 [Claude Code 相同的执行循环](/docs/zh-CN/how-claude-code-works#the-agentic-loop)：Claude 评估你的提示，调用工具采取行动，接收结果，然后重复直到任务完成。本页解释循环内部发生的情况，以便你能够有效地构建、调试和优化代理。

<h2 id="the-loop-at-a-glance">
  循环概览
</h2>

每个代理会话都遵循相同的周期：

<img src="https://mintcdn.com/claude-code/ikqp3_70mqIahteV/images/agent-loop-diagram.svg?fit=max&auto=format&n=ikqp3_70mqIahteV&q=85&s=1c6e8f28d80dba14a7287419656f1237" alt="代理循环的图表：你的提示进入代理循环，Claude 评估并要么请求工具调用（其结果反馈到另一个评估中），要么返回最终答案" width="720" height="212" data-path="images/agent-loop-diagram.svg" />

1. **接收提示。** Claude 接收你的提示，以及系统提示、工具定义和对话历史。SDK 产生一个 [`SystemMessage`](#message-types)，子类型为 `"init"`，包含会话元数据。
2. **评估并响应。** Claude 评估当前状态并确定如何继续。它可能用文本响应、请求一个或多个工具调用，或两者都有。SDK 产生一个 [`AssistantMessage`](#message-types)，包含文本和任何工具调用请求。
3. **执行工具。** SDK 运行每个请求的工具并收集结果。每组工具结果反馈给 Claude 以做出下一个决定。你可以使用 [hooks](/docs/zh-CN/agent-sdk/hooks) 在工具运行前拦截、修改或阻止工具调用。
4. **重复。** 步骤 2 和 3 作为一个循环重复。每个完整循环是一个轮次。Claude 继续调用工具并处理结果，直到产生没有工具调用的响应。
5. **返回结果。** SDK 产生最终的 [`AssistantMessage`](#message-types)，包含文本响应（无工具调用），然后是 [`ResultMessage`](#message-types)，包含最终文本、令牌使用、成本和会话 ID。

一个快速问题（"这里有什么文件？"）可能需要一两个轮次调用 `Glob` 并响应结果。一个复杂任务（"重构认证模块并更新测试"）可以跨多个轮次链接数十个工具调用，读取文件、编辑代码和运行测试，Claude 根据每个结果调整其方法。

<h2 id="turns-and-messages">
  轮次和消息
</h2>

轮次是循环内的一个往返：Claude 产生包含工具调用的输出，SDK 执行这些工具，结果自动反馈给 Claude。这发生在不将控制权交回给你的代码的情况下。轮次继续进行，直到 Claude 产生没有工具调用的输出，此时循环结束并交付最终结果。

考虑对于提示"修复 auth.ts 中的失败测试"的完整会话可能是什么样子。

首先，SDK 将你的提示发送给 Claude 并产生一个 [`SystemMessage`](#message-types)，包含会话元数据。然后循环开始：

1. **轮次 1：** Claude 调用 `Bash` 运行 `npm test`。SDK 产生一个 [`AssistantMessage`](#message-types)，包含工具调用，执行命令，然后产生一个 [`UserMessage`](#message-types)，包含输出（三个失败）。
2. **轮次 2：** Claude 在 `auth.ts` 和 `auth.test.ts` 上调用 `Read`。SDK 返回文件内容并产生一个 `AssistantMessage`。
3. **轮次 3：** Claude 调用 `Edit` 修复 `auth.ts`，然后调用 `Bash` 重新运行 `npm test`。所有三个测试都通过。SDK 产生一个 `AssistantMessage`。
4. **最后轮次：** Claude 产生仅包含文本的响应，没有工具调用："修复了认证错误，所有三个测试现在都通过了。" SDK 产生最终的 `AssistantMessage`，包含此文本，然后是 [`ResultMessage`](#message-types)，包含相同的文本加上成本和使用情况。

那是四个轮次：三个有工具调用，一个最终仅包含文本的响应。

你可以使用 `max_turns` / `maxTurns` 限制循环，它仅计算工具使用轮次。例如，上面循环中的 `max_turns=2` 会在编辑步骤之前停止。你也可以使用 `max_budget_usd` / `maxBudgetUsd` 根据支出阈值限制轮次。

没有限制的情况下，循环运行直到 Claude 自己完成，这对于范围明确的任务很好，但对于开放式提示（"改进这个代码库"）可能运行很长时间。为生产代理设置预算是一个很好的默认值。有关选项参考，请参阅下面的 [轮次和预算](#turns-and-budget)。

<h2 id="message-types">
  消息类型
</h2>

当循环运行时，SDK 产生一个消息流。每条消息都有一个类型，告诉你它来自循环的哪个阶段。五个核心类型是：

* **`SystemMessage`：** 会话生命周期事件。`subtype` 字段区分它们：

  * `"init"`：运行的会话元数据。当 `SessionStart` 或 `Setup` hook 在会话启动期间运行时，其 [hook 生命周期消息](/docs/zh-CN/agent-sdk/typescript#sdkhookstartedmessage) 在 `init` 消息之前到达
  * `"compact_boundary"`：在 [compaction](#automatic-compaction) 后触发
  * `"informational"`：来自循环的纯文本状态横幅
  * `"worker_shutting_down"`：循环将在当前轮次后结束，因为主机正在退出或 Remote Control 已断开连接

  在 TypeScript 中，除了 `"init"` 之外的每个 subtype 在 [`SDKMessage` union](/docs/zh-CN/agent-sdk/typescript#sdkmessage) 中都是其自己的类型，而不是 `SDKSystemMessage` 的子类型。
* **`AssistantMessage`：** 在每个 Claude 响应后发出，包括最终仅包含文本的响应。包含该轮次的文本内容块和工具调用块。
* **`UserMessage`：** 在每个工具执行后发出，包含发送回 Claude 的工具结果内容。也为你在循环中间流式传输的任何用户输入发出。
* **`StreamEvent`：** 仅在启用部分消息时发出。包含原始 API 流事件（文本增量、工具输入块）。请参阅 [Stream responses](/docs/zh-CN/agent-sdk/streaming-output)。
* **`ResultMessage`：** 标记代理循环的结束。包含最终文本结果、令牌使用、成本和会话 ID。检查 `subtype` 字段以确定任务是否成功或达到限制。少数尾随系统事件（如 `prompt_suggestion`）可能在其后到达，因此迭代流直到完成，而不是在结果处中断。请参阅 [Handle the result](#handle-the-result)。

这五种类型涵盖了两个 SDK 中完整的代理循环生命周期。TypeScript SDK 还产生额外的可观测性事件（hook 事件、工具进度、速率限制、任务通知），提供额外的细节，但不是驱动循环所必需的。有关完整列表，请参阅 [Python message types reference](/docs/zh-CN/agent-sdk/python#message-types) 和 [TypeScript message types reference](/docs/zh-CN/agent-sdk/typescript#message-types)。

<h3 id="handle-messages">
  处理消息
</h3>

你处理哪些消息取决于你正在构建什么：

* **仅最终结果：** 处理 `ResultMessage` 以获取输出、成本以及任务是否成功或达到限制。
* **进度更新：** 处理 `AssistantMessage` 以查看 Claude 每个轮次在做什么，包括它调用了哪些工具。
* **实时流式传输：** 启用部分消息（Python 中的 `include_partial_messages`，TypeScript 中的 `includePartialMessages`）以实时获取 `StreamEvent` 消息。请参阅 [Stream responses in real-time](/docs/zh-CN/agent-sdk/streaming-output)。

检查消息类型的方式取决于 SDK：

* **Python：** 使用从 `claude_agent_sdk` 导入的类的 `isinstance()` 检查消息类型（例如，`isinstance(message, ResultMessage)`）。
* **TypeScript：** 检查 `type` 字符串字段（例如，`message.type === "result"`）。`AssistantMessage` 和 `UserMessage` 在 `.message` 字段中包装原始 API 消息，因此内容块位于 `message.message.content`，而不是 `message.content`。

<Accordion title="示例：检查消息类型并处理结果">
  <CodeGroup>
    ```python Python theme={null}
    import asyncio
    from claude_agent_sdk import query, AssistantMessage, ResultMessage


    async def main():
        try:
            async for message in query(prompt="Summarize this project"):
                if isinstance(message, AssistantMessage):
                    print(f"Turn completed: {len(message.content)} content blocks")
                if isinstance(message, ResultMessage):
                    if message.subtype == "success":
                        print(message.result)
                    else:
                        print(f"Stopped: {message.subtype}")
        except Exception as error:
            # A single-shot query() raises after yielding an error result. If the
            # failure was an error result, the error subtype branches above have
            # already run; connection or process failures yield no result message.
            print(f"Session ended with an error: {error}")


    asyncio.run(main())
    ```

    ```typescript TypeScript theme={null}
    import { query } from "@anthropic-ai/claude-agent-sdk";

    try {
      for await (const message of query({ prompt: "Summarize this project" })) {
        if (message.type === "assistant") {
          console.log(`Turn completed: ${message.message.content.length} content blocks`);
        }
        if (message.type === "result") {
          if (message.subtype === "success") {
            console.log(message.result);
          } else {
            console.log(`Stopped: ${message.subtype}`);
          }
        }
      }
    } catch (error) {
      // A single-shot query() throws after yielding an error result. If the
      // failure was an error result, the error subtype branches above have
      // already run; connection or process failures yield no result message.
      console.log(`Session ended with an error: ${error}`);
    }
    ```
  </CodeGroup>
</Accordion>

<h2 id="tool-execution">
  工具执行
</h2>

工具赋予你的代理采取行动的能力。没有工具，Claude 只能用文本响应。有了工具，Claude 可以读取文件、运行命令、搜索代码并与外部服务交互。

<h3 id="built-in-tools">
  内置工具
</h3>

SDK 包含与 Claude Code 相同的工具：

| 类别       | 工具                                                          | 它们做什么                  |
| :------- | :---------------------------------------------------------- | :--------------------- |
| **文件操作** | `Read`、`Edit`、`Write`                                       | 读取、修改和创建文件             |
| **搜索**   | `Glob`、`Grep`                                               | 按模式查找文件，使用正则表达式搜索内容    |
| **执行**   | `Bash`                                                      | 运行 shell 命令、脚本、git 操作  |
| **Web**  | `WebSearch`、`WebFetch`                                      | 搜索网络、获取和解析页面           |
| **发现**   | `ToolSearch`                                                | 动态查找和按需加载工具，而不是预加载所有工具 |
| **编排**   | `Agent`、`Skill`、`AskUserQuestion`、`TaskCreate`、`TaskUpdate` | 生成子代理、调用技能、询问用户、跟踪任务   |

除了内置工具，你还可以：

* **使用 [MCP 服务器](/docs/zh-CN/agent-sdk/mcp) 连接外部服务**（数据库、浏览器、API）
* **使用 [自定义工具处理程序](/docs/zh-CN/agent-sdk/custom-tools) 定义自定义工具**
* **通过 [设置源](/docs/zh-CN/agent-sdk/claude-code-features) 加载项目技能**以实现可重用工作流

<h3 id="tool-permissions">
  工具权限
</h3>

Claude 根据任务确定调用哪些工具，但你控制这些调用是否被允许执行。你可以自动批准特定工具、完全阻止其他工具，或要求对所有工具进行批准。三个选项一起工作以确定什么运行：

* **`allowed_tools` / `allowedTools`** 自动批准列出的工具。具有 `["Read", "Glob", "Grep"]` 在其允许工具列表中的只读代理运行这些工具而不提示。未列出的工具仍然可用但需要权限。
* **`disallowed_tools` / `disallowedTools`** 阻止列出的工具，无论其他设置如何。有关在工具运行前检查规则的顺序，请参阅 [权限](/docs/zh-CN/agent-sdk/permissions)。
* **`permission_mode` / `permissionMode`** 控制对不被允许或拒绝规则覆盖的工具发生什么。有关可用模式，请参阅 [权限模式](#permission-mode)。

你也可以使用 `"Bash(npm *)"` 之类的规则来限制单个工具，以仅允许特定命令。有关完整规则语法，请参阅 [权限](/docs/zh-CN/agent-sdk/permissions)。

当工具被拒绝时，Claude 接收拒绝消息作为工具结果，通常尝试不同的方法或报告它无法继续。

<h3 id="parallel-tool-execution">
  并行工具执行
</h3>

当 Claude 在单个轮次中请求多个工具调用时，两个 SDK 都可以根据工具并发或顺序运行它们。只读工具（如 `Read`、`Glob`、`Grep` 和标记为只读的 MCP 工具）可以并发运行。修改状态的工具（如 `Edit`、`Write` 和 `Bash`）顺序运行以避免冲突。

自定义工具默认为顺序执行。要为自定义工具启用并行执行，请在其注释中设置 `readOnlyHint`。[TypeScript](/docs/zh-CN/agent-sdk/typescript#tool) 和 [Python](/docs/zh-CN/agent-sdk/python#tool) SDK 都使用来自 MCP SDK 的此字段名。

<h2 id="control-how-the-loop-runs">
  控制循环如何运行
</h2>

你可以限制循环进行多少轮次、成本多少、Claude 推理的深度，以及工具是否需要在运行前获得批准。所有这些都是 [`ClaudeAgentOptions`](/docs/zh-CN/agent-sdk/python#claudeagentoptions)（Python）/ [`Options`](/docs/zh-CN/agent-sdk/typescript#options)（TypeScript）上的字段。

<h3 id="turns-and-budget">
  轮次和预算
</h3>

| 选项                                      | 它控制什么      | 默认值 |
| :-------------------------------------- | :--------- | :-- |
| 最大轮次（`max_turns` / `maxTurns`）          | 最大工具使用往返次数 | 无限制 |
| 最大预算（`max_budget_usd` / `maxBudgetUsd`） | 停止前的最大成本   | 无限制 |

当达到任一限制时，SDK 返回一个 `ResultMessage`，包含相应的错误子类型（`error_max_turns` 或 `error_max_budget_usd`）。有关如何检查这些子类型，请参阅 [处理结果](#handle-the-result)，有关语法，请参阅 [`ClaudeAgentOptions`](/docs/zh-CN/agent-sdk/python#claudeagentoptions) / [`Options`](/docs/zh-CN/agent-sdk/typescript#options)。

使用 [流式输入](/docs/zh-CN/agent-sdk/streaming-vs-single-mode)，当轮次在最大轮次限制处结束时，你在轮次仍在运行时发送的消息会保持排队状态，并在其自己的轮次中开始，具有自己的最大轮次限制。在 v2.1.205 之前，到达轮次最后迭代的消息可能会被消耗到结束轮次中并丢失，而不会到达模型。

<h3 id="effort-level">
  努力级别
</h3>

`effort` 选项控制 Claude 应用多少推理。较低的努力级别每个轮次使用更少的令牌并降低成本。并非所有模型都支持努力参数。有关哪些模型支持它，请参阅 [Effort](https://platform.claude.com/docs/en/build-with-claude/effort)。

| 级别         | 行为        | 适合                                         |
| :--------- | :-------- | :----------------------------------------- |
| `"low"`    | 最小推理，快速响应 | 文件查找、列出目录                                  |
| `"medium"` | 平衡推理      | 常规编辑、标准任务                                  |
| `"high"`   | 彻底分析      | 重构、调试                                      |
| `"xhigh"`  | 扩展推理深度    | 编码和代理任务；在 Fable 5、Opus 4.7+ 和 Sonnet 5 上推荐 |
| `"max"`    | 最大推理深度    | 需要深度分析的多步骤问题                               |

如果你不设置 `effort`，两个 SDK 都会将参数保留未设置，并遵从模型的默认行为。

<Note>
  `effort` 在每个响应内交换延迟和令牌成本以获得推理深度。[扩展思考](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) 是一个单独的功能，在输出中产生可见的思维链块。它们是独立的：你可以设置 `effort: "low"` 并启用扩展思考，或 `effort: "max"` 而不启用它。
</Note>

对于执行简单、范围明确的任务（如列出文件或运行单个 grep）的代理，使用较低的努力来降低成本和延迟。在顶级 `query()` 选项中为整个会话设置 `effort`，或在 [`AgentDefinition`](/docs/zh-CN/agent-sdk/subagents#agentdefinition-configuration) 上使用 `effort` 字段为每个子代理设置以覆盖会话级别。

<h3 id="permission-mode">
  权限模式
</h3>

权限模式选项（Python 中的 `permission_mode`，TypeScript 中的 `permissionMode`）控制代理是否在使用工具前请求批准：

| 模式                    | 行为                                                                                                                                                                                                                                                                                                     |
| :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"default"`           | 不被允许规则覆盖的工具触发你的批准回调；没有回调意味着拒绝                                                                                                                                                                                                                                                                          |
| `"acceptEdits"`       | 自动批准文件编辑和常见文件系统命令（`mkdir`、`touch`、`mv`、`cp` 等）；其他 Bash 命令遵循默认规则                                                                                                                                                                                                                                        |
| `"plan"`              | Claude 探索并规划而不编辑你的源文件；文件编辑永远不会自动批准，并通过你的 `canUseTool` 回调提示                                                                                                                                                                                                                                             |
| `"dontAsk"`           | 从不提示。由 [权限规则](/docs/zh-CN/settings#permission-settings) 预批准的工具运行；其他一切被拒绝。`AskUserQuestion`、连接器工具 [你的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools) 和标记为 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具即使你已允许它们也会被拒绝                               |
| `"auto"`              | 使用模型分类器批准或拒绝每个工具调用。有关可用性和行为，请参阅 [自动模式](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode)                                                                                                                                                                                                       |
| `"bypassPermissions"` | 运行所有允许的工具而不询问，除了由显式 [`ask` 规则](/docs/zh-CN/settings#permission-settings) 匹配的工具、连接器工具 [你的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools) 和需要用户交互的工具；有关优先级顺序，请参阅 [权限如何被评估](/docs/zh-CN/agent-sdk/permissions#how-permissions-are-evaluated)。在 Unix 上以 root 身份运行时无法使用。仅在隔离环境中使用，其中代理的操作无法影响你关心的系统 |

对于交互式应用程序，使用 `"default"` 和工具批准回调来显示批准提示。对于开发机器上的自主代理，`"acceptEdits"` 自动批准文件编辑和常见文件系统命令（`mkdir`、`touch`、`mv`、`cp` 等），同时仍然在允许规则后面限制其他 `Bash` 命令。为 CI、容器或其他隔离环境保留 `"bypassPermissions"`。有关完整详情，请参阅 [权限](/docs/zh-CN/agent-sdk/permissions)。

<h3 id="model">
  模型
</h3>

如果你不设置 `model`，SDK 使用 Claude Code 的默认值，这取决于你的身份验证方法和订阅。显式设置它（例如，`model="claude-sonnet-5"`）以固定特定模型或使用较小的模型以获得更快、更便宜的代理。有关可用 ID，请参阅 [models](https://platform.claude.com/docs/en/about-claude/models)。

<h2 id="the-context-window">
  上下文窗口
</h2>

上下文窗口是会话期间可用于 Claude 的信息总量。它在会话内的轮次之间不重置。一切都累积：系统提示、工具定义、对话历史、工具输入和工具输出。在轮次之间保持相同的内容（系统提示、工具定义、CLAUDE.md）自动进行[提示缓存](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-caching)，这减少了重复前缀的成本和延迟。

<h3 id="what-consumes-context">
  什么消耗上下文
</h3>

以下是每个组件如何影响 SDK 中上下文的方式：

| 源                | 何时加载                                                              | 影响                                                                                                                                                                                                                  |
| :--------------- | :---------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **系统提示**         | 每个请求                                                              | 小的固定成本，始终存在                                                                                                                                                                                                         |
| **CLAUDE.md 文件** | 会话开始，通过 [`settingSources`](/docs/zh-CN/agent-sdk/claude-code-features) | 每个请求中的完整内容（但提示缓存，所以仅第一个请求支付全部成本）                                                                                                                                                                                    |
| **工具定义**         | 每个请求；MCP 架构默认延迟                                                   | 内置工具架构在每个请求中加载。[工具搜索](/docs/zh-CN/agent-sdk/mcp#mcp-tool-search)默认延迟 MCP 工具架构，在 Google Cloud 的 Agent Platform 或非第一方 `ANTHROPIC_BASE_URL` 上回退到预先加载。有关完整矩阵，请参阅[配置工具搜索](/docs/zh-CN/agent-sdk/tool-search#configure-tool-search) |
| **对话历史**         | 在轮次中累积                                                            | 随着每个轮次增长：提示、响应、工具输入、工具输出                                                                                                                                                                                            |
| **技能描述**         | 会话开始，通过设置源                                                        | 简短摘要；完整内容仅在调用时加载                                                                                                                                                                                                    |

大型工具输出消耗大量上下文。读取大文件或运行具有详细输出的命令可以在单个轮次中使用数千个令牌。上下文在轮次中累积，因此具有许多工具调用的较长会话比短会话构建更多上下文。

<h3 id="automatic-compaction">
  自动压缩
</h3>

当上下文窗口接近其限制时，SDK 自动压缩对话：它总结较旧的历史以释放空间，保持你最近的交换和关键决定完整。当这发生时，SDK 在流中发出一条消息，其 `type: "system"` 和 `subtype: "compact_boundary"`（在 Python 中这是一个 `SystemMessage`；在 TypeScript 中它是一个单独的 `SDKCompactBoundaryMessage` 类型）。

压缩用摘要替换较旧的消息，因此对话早期的特定指令可能不会被保留。持久规则属于 CLAUDE.md（通过 [`settingSources`](/docs/zh-CN/agent-sdk/claude-code-features) 加载），而不是初始提示，因为 CLAUDE.md 内容在每个请求上重新注入。

你可以通过多种方式自定义压缩行为：

* **CLAUDE.md 中的总结指令：** 压缩器像任何其他上下文一样读取你的 CLAUDE.md，所以你可以包含一个部分告诉它在总结时保留什么。部分标题是自由形式的（不是魔法字符串）；压缩器根据意图匹配。
* **`PreCompact` hook：** 在压缩发生前运行自定义逻辑，例如存档完整成绩单。hook 接收一个 `trigger` 字段（`manual` 或 `auto`）。请参阅 [hooks](/docs/zh-CN/agent-sdk/hooks)。
* **手动压缩：** 发送 `/compact` 作为提示字符串以按需触发压缩。以这种方式发送的命令是 SDK 输入，而不是仅限 CLI 的快捷方式。请参阅 [SDK 中的命令](/docs/zh-CN/agent-sdk/slash-commands)。

<Accordion title="示例：CLAUDE.md 中的总结指令">
  向你的项目的 CLAUDE.md 添加一个部分，告诉压缩器保留什么。标题名称不特殊；使用任何清晰的标签。

  ```markdown CLAUDE.md theme={null}
  # Summary instructions

  When summarizing this conversation, always preserve:
  - The current task objective and acceptance criteria
  - File paths that have been read or modified
  - Test results and error messages
  - Decisions made and the reasoning behind them
  ```
</Accordion>

<h3 id="keep-context-efficient">
  保持上下文高效
</h3>

对于长时间运行的代理的几个策略：

* **为子任务使用子代理。** 每个子代理以新鲜对话开始（没有先前的消息历史，尽管它确实加载自己的系统提示和项目级上下文，如 CLAUDE.md）。它看不到父级的轮次，只有其最终响应作为工具结果返回给父级。主代理的上下文增长该摘要，而不是完整的子任务成绩单。有关详情，请参阅[子代理继承什么](/docs/zh-CN/agent-sdk/subagents#what-subagents-inherit)。
* **对工具有选择性。** 每个工具定义占用上下文空间。在 [`AgentDefinition`](/docs/zh-CN/agent-sdk/subagents#agentdefinition-configuration) 上使用 `tools` 字段将子代理限制在它们需要的最小集合。
* **监视 MCP 服务器成本。** [MCP 工具搜索](/docs/zh-CN/agent-sdk/mcp#mcp-tool-search)默认延迟 MCP 工具架构，并按需加载它们。当工具搜索关闭、在 Google Cloud 的 Agent Platform 上或在非第一方 `ANTHROPIC_BASE_URL` 后面时，每个 MCP 服务器将其所有工具架构添加到每个请求，因此具有许多工具的几个服务器可以在代理执行任何工作之前消耗大量上下文。
* **对常规任务使用较低的努力。** 为仅需要读取文件或列出目录的代理设置[努力](#effort-level)为 `"low"`。这减少了令牌使用和成本。

有关每个功能上下文成本的详细分解，请参阅[理解上下文成本](/docs/zh-CN/features-overview#understand-context-costs)。

<h2 id="sessions-and-continuity">
  会话和连续性
</h2>

与 SDK 的每次交互都创建或继续一个会话。从 `ResultMessage.session_id`（在两个 SDK 中都可用）捕获会话 ID 以稍后恢复。TypeScript SDK 也将其作为初始化 `SystemMessage` 上的直接字段公开；在 Python 中它嵌套在 `SystemMessage.data` 中。

当你恢复时，来自先前轮次的完整上下文被恢复：读取的文件、执行的分析和采取的操作。你也可以分叉一个会话以分支到不同的方法而不修改原始方法。

有关恢复、继续和分叉模式的完整指南，请参阅 [会话管理](/docs/zh-CN/agent-sdk/sessions)。

<Note>
  在 Python 中，`ClaudeSDKClient` 跨多个调用自动处理会话 ID。有关详情，请参阅 [Python SDK 参考](/docs/zh-CN/agent-sdk/python#choosing-between-query-and-claudesdkclient)。
</Note>

<h2 id="handle-the-result">
  处理结果
</h2>

当循环结束时，`ResultMessage` 告诉你发生了什么并给你输出。`subtype` 字段（在两个 SDK 中都可用）是检查终止状态的主要方式。

| 结果子类型                                 | 发生了什么                                                  | `result` 字段可用？ |
| :------------------------------------ | :----------------------------------------------------- | :------------: |
| `success`                             | Claude 正常完成了任务                                         |        是       |
| `error_max_turns`                     | 在完成前达到 `maxTurns` 限制                                   |        否       |
| `error_max_budget_usd`                | 在完成前达到 `maxBudgetUsd` 限制                               |        否       |
| `error_during_execution`              | 错误中断了循环（例如，API 失败或取消的请求）                               |        否       |
| `error_max_structured_output_retries` | 在配置的重试限制内没有生成有效的结构化输出：每次尝试都未通过验证，或者模型回退撤销了完成的输出且没有成功重试 |        否       |

`result` 字段（最终文本输出）仅在 `success` 变体上存在，因此在读取它之前始终检查子类型。所有结果子类型都包含 `total_cost_usd`、`usage`、`num_turns` 和 `session_id`，因此你可以跟踪成本并在错误后恢复。在 Python 中，`total_cost_usd` 和 `usage` 被类型化为可选的，在某些错误路径上可能是 `None`，因此在格式化它们之前进行保护。有关解释 `usage` 字段的详情，请参阅 [跟踪成本和使用](/docs/zh-CN/agent-sdk/cost-tracking)。

<Note>
  当查询以错误结果结束时：

  * 单次 `query()` 调用会产生最终结果消息，然后抛出一个包含失败文本的错误，例如 `Reached maximum number of turns`。抛出是有意的——如果你的代码需要在其后继续，请将循环包装在 try 块中。底层 Claude Code 进程也会以非零代码退出。
  * 流式输入会话保持活跃，你可以继续发送消息。
</Note>

结果还包括一个 `stop_reason` 字段（TypeScript 中的 `string | null`，Python 中的 `str | None`），指示模型为什么在其最后轮次停止生成。常见值是 `end_turn`（模型正常完成）、`max_tokens`（达到输出令牌限制）和 `refusal`（模型拒绝了请求）。在错误结果子类型上，`stop_reason` 携带循环结束前最后一个助手响应的值。要检测拒绝，检查 `stop_reason === "refusal"`（TypeScript）或 `stop_reason == "refusal"`（Python）。有关完整类型，请参阅 [`SDKResultMessage`](/docs/zh-CN/agent-sdk/typescript#sdkresultmessage)（TypeScript）或 [`ResultMessage`](/docs/zh-CN/agent-sdk/python#resultmessage)（Python）。

<h2 id="hooks">
  Hooks
</h2>

[Hooks](/docs/zh-CN/agent-sdk/hooks) 是在循环中特定点触发的回调：在工具运行前、返回后、代理完成时等。一些常用的 hooks 是：

| Hook                             | 何时触发       | 常见用途        |
| :------------------------------- | :--------- | :---------- |
| `PreToolUse`                     | 在工具执行前     | 验证输入、阻止危险命令 |
| `PostToolUse`                    | 在工具返回后     | 审计输出、触发副作用  |
| `UserPromptSubmit`               | 当发送提示时     | 将额外上下文注入提示  |
| `Stop`                           | 当代理完成时     | 验证结果、保存会话状态 |
| `SubagentStart` / `SubagentStop` | 当子代理生成或完成时 | 跟踪和聚合并行任务结果 |
| `PreCompact`                     | 在上下文压缩前    | 在总结前存档完整成绩单 |

Hooks 在你的应用程序进程中运行，而不是在代理的上下文窗口内，因此它们不消耗上下文。Hooks 也可以短路循环：拒绝工具调用的 `PreToolUse` hook 防止它执行，Claude 接收拒绝消息。

两个 SDK 都支持上述所有事件。TypeScript SDK 包括 Python 尚不支持的额外事件。有关完整事件列表、每个 SDK 的可用性和完整回调 API，请参阅 [使用 hooks 控制执行](/docs/zh-CN/agent-sdk/hooks)。

<h2 id="put-it-all-together">
  将其全部放在一起
</h2>

此示例将本页的关键概念组合到修复失败测试的单个代理中。它使用允许的工具（自动批准，以便代理自主运行）、项目设置和轮次和推理努力的安全限制来配置代理。当循环运行时，它捕获会话 ID 以进行潜在恢复、处理最终结果并打印总成本。

由于单个 `query()` 调用在产生错误结果后会引发异常，循环被包装在 try 块中，以便在达到限制时脚本能够干净地退出。

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage


  async def run_agent():
      session_id = None

      try:
          async for message in query(
              prompt="Find and fix the bug causing test failures in the auth module",
              options=ClaudeAgentOptions(
                  allowed_tools=[
                      "Read",
                      "Edit",
                      "Bash",
                      "Glob",
                      "Grep",
                  ],  # Listing tools here auto-approves them (no prompting)
                  setting_sources=[
                      "project"
                  ],  # Load CLAUDE.md, skills, hooks from current directory
                  max_turns=30,  # Prevent runaway sessions
                  effort="high",  # Thorough reasoning for complex debugging
              ),
          ):
              # Handle the final result
              if isinstance(message, ResultMessage):
                  session_id = message.session_id  # Save for potential resumption

                  if message.subtype == "success":
                      print(f"Done: {message.result}")
                  elif message.subtype == "error_max_turns":
                      # Agent ran out of turns. Resume with a higher limit.
                      print(f"Hit turn limit. Resume session {session_id} to continue.")
                  elif message.subtype == "error_max_budget_usd":
                      print("Hit budget limit.")
                  else:
                      print(f"Stopped: {message.subtype}")
                  if message.total_cost_usd is not None:
                      print(f"Cost: ${message.total_cost_usd:.4f}")
      except Exception as error:
          # A single-shot query() raises after yielding an error result. If the
          # failure was an error result, the error subtype branches above have
          # already run; connection or process failures yield no result message.
          print(f"Session ended with an error: {error}")


  asyncio.run(run_agent())
  ```

  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  let sessionId: string | undefined;

  try {
    for await (const message of query({
      prompt: "Find and fix the bug causing test failures in the auth module",
      options: {
        allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"], // Listing tools here auto-approves them (no prompting)
        settingSources: ["project"], // Load CLAUDE.md, skills, hooks from current directory
        maxTurns: 30, // Prevent runaway sessions
        effort: "high" // Thorough reasoning for complex debugging
      }
    })) {
      // Save the session ID to resume later if needed
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
      }

      // Handle the final result
      if (message.type === "result") {
        if (message.subtype === "success") {
          console.log(`Done: ${message.result}`);
        } else if (message.subtype === "error_max_turns") {
          // Agent ran out of turns. Resume with a higher limit.
          console.log(`Hit turn limit. Resume session ${sessionId} to continue.`);
        } else if (message.subtype === "error_max_budget_usd") {
          console.log("Hit budget limit.");
        } else {
          console.log(`Stopped: ${message.subtype}`);
        }
        console.log(`Cost: $${message.total_cost_usd.toFixed(4)}`);
      }
    }
  } catch (error) {
    // A single-shot query() throws after yielding an error result. If the
    // failure was an error result, the error subtype branches above have
    // already run; connection or process failures yield no result message.
    console.log(`Session ended with an error: ${error}`);
  }
  ```
</CodeGroup>

<h2 id="next-steps">
  后续步骤
</h2>

现在你理解了循环，以下是根据你正在构建的内容去往的地方：

* **还没有运行代理？** 从 [快速入门](/docs/zh-CN/agent-sdk/quickstart) 开始，获取 SDK 安装并查看完整示例端到端运行。
* **准备好连接到你的项目？** [加载 CLAUDE.md、技能和文件系统 hooks](/docs/zh-CN/agent-sdk/claude-code-features)，以便代理自动遵循你的项目约定。
* **构建交互式 UI？** 启用 [流式传输](/docs/zh-CN/agent-sdk/streaming-output) 以在循环运行时显示实时文本和工具调用。
* **需要对代理能做什么进行更严格的控制？** 使用 [权限](/docs/zh-CN/agent-sdk/permissions) 锁定工具访问，并使用 [hooks](/docs/zh-CN/agent-sdk/hooks) 在工具执行前审计、阻止或转换工具调用。
* **运行长期或昂贵的任务？** 将隔离的工作卸载到 [子代理](/docs/zh-CN/agent-sdk/subagents) 以保持你的主上下文精简。

有关代理循环的更广泛概念图（不是 SDK 特定的），请参阅 [Claude Code 如何工作](/docs/zh-CN/how-claude-code-works)。有关在 Claude Code 中设计循环的实用指南，从轮次制到目标制和主动循环，请参阅博客上的 [Loop engineering: getting started with loops](https://claude.com/blog/getting-started-with-loops)。
