> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 跟踪成本和使用情况

> 了解如何跟踪令牌使用情况、估计成本，以及使用 Claude Agent SDK 配置提示缓存。

Claude Agent SDK 为与 Claude 的每次交互提供详细的令牌使用信息。本指南说明如何正确跟踪使用情况和理解成本报告，特别是在处理并行工具使用和多步骤对话时。

有关完整的 API 文档，请参阅 [TypeScript SDK 参考](/docs/zh-CN/agent-sdk/typescript) 和 [Python SDK 参考](/docs/zh-CN/agent-sdk/python)。

<Warning>
  `total_cost_usd` 和 `costUSD` 字段是客户端估计值，不是权威的计费数据。SDK 从构建时捆绑的价格表在本地计算它们，因此当以下情况发生时，它们可能与您实际被计费的金额不同：

  * 定价发生变化
  * 已安装的 SDK 版本无法识别某个模型
  * 应用了客户端无法建模的计费规则

  使用这些字段进行开发洞察和大致预算编制。对于权威计费，请使用 [使用情况和成本 API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api) 或 [Claude 控制台](https://platform.claude.com/usage) 中的使用情况页面。不要从这些字段向最终用户计费或触发财务决策。
</Warning>

<h2 id="understand-token-usage">
  理解令牌使用情况
</h2>

TypeScript 和 Python SDK 使用不同的字段名称公开相同的使用数据：

* **TypeScript** 在每个助手消息上提供每步令牌细分（`message.message.id`、`message.message.usage`），通过结果消息上的 `modelUsage` 提供每个模型的成本，以及结果消息上的累积总计。
* **Python** 在每个助手消息上提供每步令牌细分（`message.usage`、`message.message_id`），通过结果消息上的 `model_usage` 提供每个模型的成本，以及结果消息上的累积总计（`total_cost_usd` 和 `usage` 字典）。

两个 SDK 使用相同的底层成本模型并公开相同的粒度。区别在于字段命名和每步使用情况的嵌套位置。

成本跟踪取决于理解 SDK 如何确定使用数据的范围：

* **`query()` 调用：** SDK 的 `query()` 函数的一次调用。单个调用可能涉及多个步骤（Claude 响应、使用工具、获取结果、再次响应）。每个调用在末尾产生一条 [`result`](/docs/zh-CN/agent-sdk/typescript#sdkresultmessage) 消息。
* **步骤：** `query()` 调用中的单个请求/响应周期。每个步骤产生带有令牌使用情况的助手消息。
* **会话：** 由会话 ID 链接的一系列 `query()` 调用（使用 `resume` 选项）。会话中的每个 `query()` 调用独立报告其自己的成本。

下图显示了单个 `query()` 调用的消息流，在每个步骤报告令牌使用情况，末尾显示累积估计：

<img src="https://mintcdn.com/claude-code/ikqp3_70mqIahteV/images/agent-sdk/message-usage-flow.svg?fit=max&auto=format&n=ikqp3_70mqIahteV&q=85&s=68497aee338e01cc745323af7aea378e" alt="显示查询产生两个步骤消息的图表。步骤 1 有四个共享相同 ID 和使用情况的助手消息（计数一次），步骤 2 有一个具有新 ID 的助手消息，最终结果消息显示估计的 total_cost_usd。" width="760" height="520" data-path="images/agent-sdk/message-usage-flow.svg" />

<Steps>
  <Step title="每个步骤产生助手消息">
    当 Claude 响应时，它发送一条或多条助手消息。在 TypeScript 中，每条助手消息包含一个嵌套的 `BetaMessage`（通过 `message.message` 访问），具有 `id` 和一个 [`usage`](https://platform.claude.com/docs/en/api/messages) 对象，其中包含令牌计数（`input_tokens`、`output_tokens`）。在 Python 中，`AssistantMessage` 数据类通过 `message.usage` 和 `message.message_id` 直接公开相同的数据。当 Claude 在一个回合中使用多个工具时，该回合中的所有消息共享相同的 ID，因此按 ID 去重以避免重复计数。
  </Step>

  <Step title="结果消息提供累积估计">
    当 `query()` 调用完成时，SDK 发出一条结果消息，其中包含 `total_cost_usd` 和累积 `usage`。这在 TypeScript（[`SDKResultMessage`](/docs/zh-CN/agent-sdk/typescript#sdkresultmessage)）和 Python（[`ResultMessage`](/docs/zh-CN/agent-sdk/python#resultmessage)）中都可用。如果您进行多个 `query()` 调用（例如，在多轮会话中），每个结果仅反映该单个调用的成本。如果您只需要估计的总计，可以忽略每步使用情况并读取此单个值。
  </Step>
</Steps>

<h2 id="get-the-total-cost-of-a-query">
  获取查询的总成本
</h2>

结果消息（[TypeScript](/docs/zh-CN/agent-sdk/typescript#sdkresultmessage)、[Python](/docs/zh-CN/agent-sdk/python#resultmessage)）标记 `query()` 调用的代理循环的结束。它包括 `total_cost_usd`，即该调用中所有步骤的累积估计成本。这适用于成功和错误结果。如果您使用会话进行多个 `query()` 调用，每个结果仅反映该单个调用的成本。

当代理生成[子代理](/docs/zh-CN/agent-sdk/subagents)时，三个结果级字段在计数内容上有所不同。使用 `modelUsage` 或 Python 中的 `model_usage` 进行整树令牌计数；`usage` 字段一旦发生嵌套就会低估。

| 字段                           | 子代理活动                          |
| ---------------------------- | ------------------------------ |
| `usage`                      | 已排除。仅计算顶级代理循环，因此子代理内消耗的令牌不会被添加 |
| `total_cost_usd`             | 已包含。计算子代理请求以及顶级循环              |
| `modelUsage` / `model_usage` | 已包含。计算子代理请求以及顶级循环，按模型分解        |

以下示例遍历 `query()` 调用的消息流，并在 `result` 消息到达时打印总成本：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  try {
    for await (const message of query({ prompt: "Summarize this project" })) {
      if (message.type === "result") {
        console.log(`Total cost: $${message.total_cost_usd}`);
      }
    }
  } catch (error) {
    // A single-shot query() throws after yielding an error result. If the
    // failure was an error result, it still carried total_cost_usd and the
    // branch above has already run; connection or process failures yield
    // no result message.
    console.error(`Session ended with an error: ${error}`);
  }
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ResultMessage
  import asyncio


  async def main():
      try:
          async for message in query(prompt="Summarize this project"):
              if isinstance(message, ResultMessage):
                  print(f"Total cost: ${message.total_cost_usd or 0}")
      except Exception as error:
          # A single-shot query() raises after yielding an error result. If the
          # failure was an error result, it still carried total_cost_usd and the
          # branch above has already run; connection or process failures yield
          # no result message.
          print(f"Session ended with an error: {error}")


  asyncio.run(main())
  ```
</CodeGroup>

<h2 id="track-per-step-and-per-model-usage">
  跟踪每步和每个模型的使用情况
</h2>

本部分中的示例使用 TypeScript 字段名称。在 Python 中，等效字段是 [`AssistantMessage.usage`](/docs/zh-CN/agent-sdk/python#assistantmessage) 和 `AssistantMessage.message_id` 用于每步使用情况，以及 [`ResultMessage.model_usage`](/docs/zh-CN/agent-sdk/python#resultmessage) 用于每个模型的细分。

<h3 id="track-per-step-usage">
  跟踪每步使用情况
</h3>

每条助手消息包含一个嵌套的 `BetaMessage`（通过 `message.message` 访问），具有 `id` 和 `usage` 对象，其中包含令牌计数。当 Claude 并行使用工具时，多条消息共享相同的 `id` 和相同的使用数据。跟踪您已经计数的 ID，并跳过重复项以避免膨胀的总计。

<Warning>
  并行工具调用产生多条助手消息，其嵌套的 `BetaMessage` 共享相同的 `id` 和相同的使用情况。始终按 ID 去重以获得准确的每步令牌计数。
</Warning>

以下示例累积所有步骤中的输入和输出令牌，仅计数每个唯一消息 ID 一次：

```typescript theme={null}
import { query } from "@anthropic-ai/claude-agent-sdk";

const seenIds = new Set<string>();
let totalInputTokens = 0;
let totalOutputTokens = 0;

try {
  for await (const message of query({ prompt: "Summarize this project" })) {
    if (message.type === "assistant") {
      const msgId = message.message.id;

      // Parallel tool calls share the same ID, only count once
      if (!seenIds.has(msgId)) {
        seenIds.add(msgId);
        totalInputTokens += message.message.usage.input_tokens;
        totalOutputTokens += message.message.usage.output_tokens;
      }
    }
  }
} catch (error) {
  // A single-shot query() throws after yielding an error result, so the
  // totals below still reflect the steps that ran before the failure.
  console.error(`Session ended with an error: ${error}`);
}

console.log(`Steps: ${seenIds.size}`);
console.log(`Input tokens: ${totalInputTokens}`);
console.log(`Output tokens: ${totalOutputTokens}`);
```

<h3 id="break-down-usage-per-model">
  按模型细分使用情况
</h3>

结果消息包括 [`modelUsage`](/docs/zh-CN/agent-sdk/typescript#modelusage)，这是一个模型名称到每个模型令牌计数和成本的映射。当您运行多个模型（例如，为子代理使用 Haiku，为主代理使用 Opus）并想查看令牌的去向时，这很有用。

以下示例运行查询并打印所使用的每个模型的成本和令牌细分：

```typescript theme={null}
import { query } from "@anthropic-ai/claude-agent-sdk";

try {
  for await (const message of query({ prompt: "Summarize this project" })) {
    if (message.type !== "result") continue;

    for (const [modelName, usage] of Object.entries(message.modelUsage)) {
      console.log(`${modelName}: $${usage.costUSD.toFixed(4)}`);
      console.log(`  Input tokens: ${usage.inputTokens}`);
      console.log(`  Output tokens: ${usage.outputTokens}`);
      console.log(`  Cache read: ${usage.cacheReadInputTokens}`);
      console.log(`  Cache creation: ${usage.cacheCreationInputTokens}`);
    }
  }
} catch (error) {
  // A single-shot query() throws after yielding an error result. If the
  // failure was an error result, the per-model breakdown above has already
  // printed; connection or process failures yield no result message.
  console.error(`Session ended with an error: ${error}`);
}
```

<h2 id="accumulate-costs-across-multiple-calls">
  累积多个调用的成本
</h2>

每个 `query()` 调用返回其自己的 `total_cost_usd`。SDK 不提供会话级别的总计，因此如果您的应用程序进行多个 `query()` 调用（例如，在多轮会话中或跨不同用户），请自己累积总计。

以下示例按顺序运行两个 `query()` 调用，将每个调用的 `total_cost_usd` 添加到运行总计，并打印每个调用和合并的成本：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  // Track cumulative cost across multiple query() calls
  let totalSpend = 0;

  const prompts = [
    "Read the files in src/ and summarize the architecture",
    "List all exported functions in src/auth.ts"
  ];

  for (const prompt of prompts) {
    try {
      for await (const message of query({ prompt })) {
        if (message.type === "result") {
          totalSpend += message.total_cost_usd;
          console.log(`This call: $${message.total_cost_usd}`);
        }
      }
    } catch (error) {
      // A single-shot query() throws after yielding an error result. If the
      // failure was an error result, this call's cost was already counted;
      // connection or process failures yield no result message. Continue
      // with the next prompt.
      console.error(`Call failed: ${error}`);
    }
  }

  console.log(`Total spend: $${totalSpend.toFixed(4)}`);
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ResultMessage
  import asyncio


  async def main():
      # Track cumulative cost across multiple query() calls
      total_spend = 0.0

      prompts = [
          "Read the files in src/ and summarize the architecture",
          "List all exported functions in src/auth.ts",
      ]

      for prompt in prompts:
          try:
              async for message in query(prompt=prompt):
                  if isinstance(message, ResultMessage):
                      cost = message.total_cost_usd or 0
                      total_spend += cost
                      print(f"This call: ${cost}")
          except Exception as error:
              # A single-shot query() raises after yielding an error result. If
              # the failure was an error result, this call's cost was already
              # counted; connection or process failures yield no result message.
              # Continue with the next prompt.
              print(f"Call failed: {error}")

      print(f"Total spend: ${total_spend:.4f}")


  asyncio.run(main())
  ```
</CodeGroup>

<h2 id="handle-errors-caching-and-token-discrepancies">
  处理错误、缓存和令牌差异
</h2>

为了准确的成本跟踪，需要考虑失败的对话、缓存令牌定价和偶发的报告不一致。

<h3 id="resolve-output-token-discrepancies">
  解决输出令牌差异
</h3>

在极少数情况下，您可能会观察到具有相同 ID 的消息的 `output_tokens` 值不同。当这种情况发生时：

1. **使用最高值：** 一组中的最终消息通常包含准确的总计。
2. **优先使用结果消息：** 结果消息中的 `total_cost_usd` 反映 SDK 在所有步骤中的累积估计，因此比自己求和每步值更可靠。它仍然是一个估计值，可能与您的实际账单不同。
3. **报告不一致：** 在 [Claude Code GitHub 存储库](https://github.com/anthropics/claude-code/issues) 提交问题。

<h3 id="track-costs-on-failed-conversations">
  跟踪失败对话的成本
</h3>

成功和错误结果消息都包括 `usage` 和 `total_cost_usd`。如果对话在中途失败，您仍然消耗了到失败点为止的令牌。无论其 `subtype` 如何，始终从结果消息读取成本数据。

<h3 id="track-cache-tokens">
  跟踪缓存令牌
</h3>

Agent SDK 自动使用 [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) 来减少重复内容的成本。您不需要自己配置缓存。使用对象包括两个额外的字段用于缓存跟踪：

* `cache_creation_input_tokens`：用于创建新缓存条目的令牌（按比标准输入令牌更高的速率计费）。
* `cache_read_input_tokens`：从现有缓存条目读取的令牌（按降低的速率计费）。

将这些与 `input_tokens` 分开跟踪以了解缓存节省。在 TypeScript 中，这些字段在 [`Usage`](/docs/zh-CN/agent-sdk/typescript#usage) 对象上进行类型化。在 Python 中，它们作为 [`ResultMessage.usage`](/docs/zh-CN/agent-sdk/python#resultmessage) 字典中的键出现（例如，`message.usage.get("cache_read_input_tokens", 0)`）。

<h3 id="extend-the-prompt-cache-ttl-to-one-hour">
  将 prompt cache TTL 扩展到一小时
</h3>

当您使用 API 密钥进行身份验证或在 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上运行时，SDK 写入的缓存条目默认使用 5 分钟 TTL。如果您的工作负载针对相同的系统提示和上下文运行许多短会话，且会话之间的间隔超过 5 分钟，缓存会在会话之间过期，每个新会话都会支付完整的输入价格。

要请求缓存写入的 1 小时 TTL，请设置 [`ENABLE_PROMPT_CACHING_1H`](/docs/zh-CN/env-vars) 环境变量。您可以在 shell 或容器环境中导出它，或通过 `options.env` 传递它。

以下示例为在 Amazon Bedrock 上运行的代理启用 1 小时 TTL：

<CodeGroup>
  ```python Python theme={null}
  from claude_agent_sdk import ClaudeAgentOptions, query
  import asyncio


  async def main():
      options = ClaudeAgentOptions(
          env={
              "CLAUDE_CODE_USE_BEDROCK": "1",
              "ENABLE_PROMPT_CACHING_1H": "1",
          },
      )

      async for message in query(prompt="Summarize this project", options=options):
          print(message)


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  const options = {
    env: {
      ...process.env,
      CLAUDE_CODE_USE_BEDROCK: "1",
      ENABLE_PROMPT_CACHING_1H: "1",
    },
  };

  for await (const message of query({ prompt: "Summarize this project", options })) {
    console.log(message);
  }
  ```
</CodeGroup>

具有 1 小时 TTL 的缓存写入按比 5 分钟写入更高的速率计费，因此启用此功能会用更高的写入成本换取更多的缓存读取。有关详细信息，请参阅 [prompt caching 定价](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)。Claude 订阅用户已自动获得 1 小时 TTL，不需要设置此变量。

<h2 id="related-documentation">
  相关文档
</h2>

* [TypeScript SDK 参考](/docs/zh-CN/agent-sdk/typescript) - 完整的 API 文档
* [SDK 概述](/docs/zh-CN/agent-sdk/overview) - SDK 入门
* [SDK 权限](/docs/zh-CN/agent-sdk/permissions) - 管理工具权限
