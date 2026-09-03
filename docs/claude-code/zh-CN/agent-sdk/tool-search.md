> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用工具搜索扩展到多个工具

> 通过动态发现和按需加载，将您的代理扩展到数千个工具。

工具搜索使您的代理能够通过动态发现和按需加载来处理数百或数千个工具。代理不是将所有工具定义预先加载到上下文窗口中，而是搜索您的工具目录并仅加载它需要的工具。

当工具库扩展时，这种方法解决了两个挑战：

* **上下文效率：** 工具定义可能会消耗上下文窗口的大部分（50个工具可能使用10-20K个令牌），留下较少的空间用于实际工作。
* **工具选择准确性：** 一次加载超过30-50个工具时，工具选择准确性会下降。

工具搜索默认启用。

<h2 id="how-tool-search-works">
  工具搜索的工作原理
</h2>

当工具搜索处于活动状态时，工具定义会从上下文窗口中隐藏。代理会收到可用工具的摘要，并在任务需要尚未加载的功能时搜索相关工具。最多五个最相关的工具被默认加载到上下文中，在后续轮次中保持可用。如果对话足够长，SDK会压缩早期消息以释放空间，之前发现的工具可能会被移除，代理会根据需要再次搜索。

工具搜索在Claude首次发现工具时增加一个额外的往返（搜索步骤），但对于大型工具集，这被每个轮次中较小的上下文所抵消。对于少于约10个工具的情况，预先加载所有工具通常更快。

有关底层API机制的详细信息，请参阅[API中的工具搜索](https://platform.claude.com/docs/zh-CN/agents-and-tools/tool-use/tool-search-tool)。

<Note>
  工具搜索在Claude Sonnet 4.5、Claude Haiku 4.5、Claude Opus 4.5及更新的模型上受支持；有关当前列表，请参阅[API文档中的模型兼容性](https://platform.claude.com/docs/zh-CN/agents-and-tools/tool-use/tool-search-tool#model-compatibility)。在Google Cloud的Agent Platform上，最低支持的模型是Claude Sonnet 4.5和Claude Opus 4.5。
</Note>

<h2 id="configure-tool-search">
  配置工具搜索
</h2>

工具搜索默认启用。在Google Cloud的Agent Platform上默认禁用，其中支持Claude Sonnet 4.5及更高版本以及Claude Opus 4.5及更高版本。当`ANTHROPIC_BASE_URL`指向非第一方主机时也会禁用，因为大多数代理不转发`tool_reference`块。您可以使用`ENABLE_TOOL_SEARCH`环境变量覆盖任一默认值：

| 值        | 行为                                                                                                                                                 |
| :------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| （未设置）    | 工具搜索处于启用状态。工具定义被延迟并按需发现。在Google Cloud的Agent Platform或非第一方`ANTHROPIC_BASE_URL`上回退到预先加载。                                                             |
| `true`   | 工具搜索始终启用。SDK即使在Google Cloud的Agent Platform和通过代理上也会发送beta标头。在Sonnet 4.5或Opus 4.5之前的Google Cloud的Agent Platform模型上，或在不支持`tool_reference`块的代理上，请求会失败。 |
| `auto`   | 检查所有工具定义的组合令牌计数与模型的上下文窗口。如果超过10%，工具搜索激活。如果低于10%，所有工具正常加载到上下文中。                                                                                     |
| `auto:N` | 与`auto`相同，但具有自定义百分比。`auto:5`在工具定义超过上下文窗口的5%时激活。较低的值更早激活。                                                                                           |
| `false`  | 工具搜索关闭。所有工具定义在每个轮次上都加载到上下文中。                                                                                                                       |

设置[`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`](/docs/zh-CN/env-vars)会保持工具搜索关闭，`ENABLE_TOOL_SEARCH`无法覆盖它。该变量会删除`defer_loading`工具定义和`tool_reference`内容块所需的beta标头。

工具搜索适用于所有已注册的工具，无论它们来自远程MCP服务器还是[自定义SDK MCP服务器](/docs/zh-CN/agent-sdk/custom-tools)。使用`auto`时，阈值基于所有服务器上所有工具定义的组合大小。

在`query()`上的`env`选项中设置值。在TypeScript中，`env`替换子进程环境，因此展开`...process.env`以保持继承的变量。在Python中，`env`合并到继承的环境之上。此示例连接到公开许多工具的远程MCP服务器，使用通配符预先批准所有工具，并使用`auto:5`，以便当工具定义超过上下文窗口的5%时激活工具搜索：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  try {
    for await (const message of query({
      prompt: "Find and run the appropriate database query",
      options: {
        mcpServers: {
          "enterprise-tools": {
            // Connect to a remote MCP server
            type: "http",
            url: "https://tools.example.com/mcp"
          }
        },
        allowedTools: ["mcp__enterprise-tools__*"], // Wildcard pre-approves all tools from this server
        env: {
          ...process.env, // env replaces the subprocess environment, so keep inherited variables
          ENABLE_TOOL_SEARCH: "auto:5" // Activate tool search when tools exceed 5% of context
        }
      }
    })) {
      if (message.type === "result" && message.subtype === "success") {
        console.log(message.result);
      }
    }
  } catch (error) {
    // A single-shot query() throws after yielding an error result
    console.log(`Session ended with an error: ${error}`);
  }
  ```

  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage


  async def main():
      options = ClaudeAgentOptions(
          mcp_servers={
              "enterprise-tools": {
                  "type": "http",
                  "url": "https://tools.example.com/mcp",
              }
          },
          allowed_tools=[
              "mcp__enterprise-tools__*"
          ],  # Wildcard pre-approves all tools from this server
          env={
              "ENABLE_TOOL_SEARCH": "auto:5"  # Activate tool search when tools exceed 5% of context
          },
      )

      try:
          async for message in query(
              prompt="Find and run the appropriate database query",
              options=options,
          ):
              if isinstance(message, ResultMessage) and message.subtype == "success":
                  print(message.result)
      except Exception as error:
          # A single-shot query() raises after yielding an error result
          print(f"Session ended with an error: {error}")


  asyncio.run(main())
  ```
</CodeGroup>

要运行此示例，请将`https://tools.example.com/mcp`替换为您自己的MCP服务器的URL。成功时，结果文本会打印到控制台。

因为这是一个单次`query()`调用，SDK在产生错误结果后会抛出异常，所以该示例将循环包装在try块中。要查看运行失败的原因，请检查循环内结果消息的`subtype`，例如`error_during_execution`。有关结果消息的更多信息，请参阅[处理结果](/docs/zh-CN/agent-sdk/agent-loop#handle-the-result)。

将`ENABLE_TOOL_SEARCH`设置为`"false"`会禁用工具搜索，并在每个轮次上将所有工具定义加载到上下文中。这消除了搜索往返，当工具集很小（少于约10个工具）且定义在上下文窗口中舒适地适配时，这可能会更快。

<h2 id="optimize-tool-discovery">
  优化工具发现
</h2>

搜索机制将查询与工具名称和描述进行匹配。像`search_slack_messages`这样的名称比`query_slack`更广泛地出现在各种请求中。具有特定关键字的描述（"按关键字、频道或日期范围搜索Slack消息"）比通用描述（"查询Slack"）匹配更多查询。

您还可以添加一个系统提示部分，列出可用的工具类别。这为代理提供了关于可以搜索什么类型工具的上下文。通过 TypeScript 中的 `systemPrompt` 选项或 Python 中的 `system_prompt` 传递文本，使用带有 `append` 的 `claude_code` 预设，这会将您的文本添加到预设的提示中，而不是替换它：

<CodeGroup>
  ```typescript TypeScript theme={null}
  options: {
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: "You can search for tools to interact with Slack, GitHub, and Jira."
    }
  }
  ```

  ```python Python theme={null}
  options = ClaudeAgentOptions(
      system_prompt={
          "type": "preset",
          "preset": "claude_code",
          "append": "You can search for tools to interact with Slack, GitHub, and Jira.",
      }
  )
  ```
</CodeGroup>

有关完整的系统提示选项集，请参阅[修改系统提示](/docs/zh-CN/agent-sdk/modifying-system-prompts)。

<h2 id="limits">
  限制
</h2>

* **最大工具数：** 您的目录中最多10,000个工具
* **搜索结果：** 默认每次搜索返回最多五个最相关的工具
* **模型支持：** Claude Sonnet 4.5、Claude Haiku 4.5、Claude Opus 4.5及更新版本；请参阅[API文档中的模型兼容性](https://platform.claude.com/docs/zh-CN/agents-and-tools/tool-use/tool-search-tool#model-compatibility)了解当前列表。在Google Cloud的Agent Platform上，支持Claude Sonnet 4.5及更新版本以及Claude Opus 4.5及更新版本。

<h2 id="related-documentation">
  相关文档
</h2>

* [API中的工具搜索](https://platform.claude.com/docs/zh-CN/agents-and-tools/tool-use/tool-search-tool)：工具搜索的完整API文档，包括自定义实现
* [连接MCP服务器](/docs/zh-CN/agent-sdk/mcp)：通过MCP服务器连接到外部工具
* [自定义工具](/docs/zh-CN/agent-sdk/custom-tools)：使用SDK MCP服务器构建您自己的工具
* [TypeScript SDK参考](/docs/zh-CN/agent-sdk/typescript)：完整API参考
* [Python SDK参考](/docs/zh-CN/agent-sdk/python)：完整API参考
