> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# SDK 中的子代理

> 定义和调用子代理以隔离上下文、并行运行任务，以及在 Claude Agent SDK 应用程序中应用专门的指令。

子代理是您的主代理可以生成的独立代理实例，用于处理专注的子任务。
使用子代理来隔离上下文、并行运行多个分析，以及应用专门的指令，而不会增加主代理的提示词。

本指南说明如何使用 `agents` 参数在 SDK 中定义和使用子代理。

<h2 id="overview">
  概述
</h2>

您可以通过三种方式创建子代理：

* **以编程方式**：在您的 `query()` 选项中使用 `agents` 参数。请参阅 [TypeScript](/docs/zh-CN/agent-sdk/typescript#agentdefinition) 和 [Python](/docs/zh-CN/agent-sdk/python#agentdefinition) 参考文档
* **基于文件系统**：在 `.claude/agents/` 目录中将代理定义为 markdown 文件。请参阅[将子代理定义为文件](/docs/zh-CN/sub-agents)
* **内置通用代理**：Claude 可以随时通过 Agent 工具调用内置的 `general-purpose` 子代理，无需您定义任何内容

本指南重点介绍编程方法，这是 SDK 应用程序的推荐方法。

定义子代理时，Claude 根据每个子代理的 `description` 字段确定是否调用它。编写清晰的描述，说明何时应使用子代理，Claude 将自动委派适当的任务。您也可以在提示词中按名称显式请求子代理，例如"使用代码审查员代理来..."。

<h2 id="benefits-of-using-subagents">
  使用子代理的好处
</h2>

<h3 id="context-isolation">
  上下文隔离
</h3>

每个子代理在其自己的新对话中运行。中间工具调用和结果保留在子代理内部；只有其最终消息返回到父代理。请参阅[子代理继承的内容](#what-subagents-inherit)以了解子代理上下文中的确切内容。

**示例：** `research-assistant` 子代理可以探索数十个文件，而这些内容都不会在主对话中累积。父代理收到的是简洁的摘要，而不是子代理读取的每个文件。

<h3 id="parallelization">
  并行化
</h3>

多个子代理可以并发运行，因此独立的子任务完成时间为最慢的一个，而不是所有任务的总和。

**示例：** 在代码审查期间，您可以同时运行 `style-checker`、`security-scanner` 和 `test-coverage` 子代理，而不是按顺序运行。

<h3 id="specialized-instructions-and-knowledge">
  专门的指令和知识
</h3>

每个子代理都可以有定制的系统提示词，具有特定的专业知识、最佳实践和约束。

**示例：** `database-migration` 子代理可以具有关于 SQL 最佳实践、回滚策略和数据完整性检查的详细知识，这些在主代理的指令中将是不必要的噪音。

<h3 id="tool-restrictions">
  工具限制
</h3>

子代理可以限制为特定工具，降低意外操作的风险。

**示例：** `doc-reviewer` 子代理可能只能访问 Read 和 Grep 工具，确保它可以分析但永远不会意外修改您的文档文件。

<h2 id="create-subagents">
  创建子代理
</h2>

<h3 id="programmatic-definition-recommended">
  以编程方式定义（推荐）
</h3>

使用 `agents` 参数直接在代码中定义子代理。Claude 通过 `Agent` 工具调用子代理，因此在 `allowedTools` 中包含 `Agent` 以自动批准子代理调用，无需权限提示。

本页面上的大多数示例仅打印最终结果。要确认 Claude 委派给了子代理而不是直接回答，请参阅[检测子代理调用](#detect-subagent-invocation)。

此示例创建两个子代理：一个具有只读访问权限的代码审查员和一个可以执行命令的测试运行器。

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition


  async def main():
      async for message in query(
          prompt="Review the authentication module for security issues",
          options=ClaudeAgentOptions(
              # Auto-approve these tools, including Agent for subagent invocation
              allowed_tools=["Read", "Grep", "Glob", "Agent"],
              agents={
                  "code-reviewer": AgentDefinition(
                      # description tells Claude when to use this subagent
                      description="Expert code review specialist. Use for quality, security, and maintainability reviews.",
                      # prompt defines the subagent's behavior and expertise
                      prompt="""You are a code review specialist with expertise in security, performance, and best practices.

  When reviewing code:
  - Identify security vulnerabilities
  - Check for performance issues
  - Verify adherence to coding standards
  - Suggest specific improvements

  Be thorough but concise in your feedback.""",
                      # tools restricts what the subagent can do (read-only here)
                      tools=["Read", "Grep", "Glob"],
                      # model overrides the default model for this subagent
                      model="sonnet",
                  ),
                  "test-runner": AgentDefinition(
                      description="Runs and analyzes test suites. Use for test execution and coverage analysis.",
                      prompt="""You are a test execution specialist. Run tests and provide clear analysis of results.

  Focus on:
  - Running test commands
  - Analyzing test output
  - Identifying failing tests
  - Suggesting fixes for failures""",
                      # Bash access lets this subagent run test commands
                      tools=["Bash", "Read", "Grep"],
                  ),
              },
          ),
      ):
          if hasattr(message, "result"):
              print(message.result)


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Review the authentication module for security issues",
    options: {
      // Auto-approve these tools, including Agent for subagent invocation
      allowedTools: ["Read", "Grep", "Glob", "Agent"],
      agents: {
        "code-reviewer": {
          // description tells Claude when to use this subagent
          description:
            "Expert code review specialist. Use for quality, security, and maintainability reviews.",
          // prompt defines the subagent's behavior and expertise
          prompt: `You are a code review specialist with expertise in security, performance, and best practices.

  When reviewing code:
  - Identify security vulnerabilities
  - Check for performance issues
  - Verify adherence to coding standards
  - Suggest specific improvements

  Be thorough but concise in your feedback.`,
          // tools restricts what the subagent can do (read-only here)
          tools: ["Read", "Grep", "Glob"],
          // model overrides the default model for this subagent
          model: "sonnet"
        },
        "test-runner": {
          description:
            "Runs and analyzes test suites. Use for test execution and coverage analysis.",
          prompt: `You are a test execution specialist. Run tests and provide clear analysis of results.

  Focus on:
  - Running test commands
  - Analyzing test output
  - Identifying failing tests
  - Suggesting fixes for failures`,
          // Bash access lets this subagent run test commands
          tools: ["Bash", "Read", "Grep"]
        }
      }
    }
  })) {
    if ("result" in message) console.log(message.result);
  }
  ```
</CodeGroup>

<h3 id="agentdefinition-configuration">
  AgentDefinition 配置
</h3>

| 字段                | 类型                                                          | 必需 | 描述                                                                                                              |
| :---------------- | :---------------------------------------------------------- | :- | :-------------------------------------------------------------------------------------------------------------- |
| `description`     | `string`                                                    | 是  | 何时使用此代理的自然语言描述                                                                                                  |
| `prompt`          | `string`                                                    | 是  | 代理的系统提示词，定义其角色和行为                                                                                               |
| `tools`           | `string[]`                                                  | 否  | 允许的工具名称数组。如果省略，继承所有工具                                                                                           |
| `disallowedTools` | `string[]`                                                  | 否  | 要从代理的工具集中移除的工具名称数组。MCP 服务器级别的模式也被接受：`mcp__server` 或 `mcp__server__*` 移除来自该服务器的每个工具，`mcp__*` 移除来自任何服务器的每个 MCP 工具 |
| `model`           | `string`                                                    | 否  | 此代理的模型覆盖。接受别名，如 `'fable'`、`'opus'`、`'sonnet'`、`'haiku'`、`'inherit'`，或完整的模型 ID。如果省略，默认为主模型                       |
| `skills`          | `string[]`                                                  | 否  | 在启动时预加载到代理上下文中的 skills 名称列表。未列出的 skills 仍可通过 Skill 工具调用                                                         |
| `memory`          | `'user' \| 'project' \| 'local'`                            | 否  | 此代理的内存源                                                                                                         |
| `mcpServers`      | `(string \| object)[]`                                      | 否  | 此代理可用的 MCP 服务器，按名称或内联配置                                                                                         |
| `initialPrompt`   | `string`                                                    | 否  | 当此代理作为主线程代理运行时自动提交为第一个用户轮次。当代理作为子代理调用时忽略                                                                        |
| `maxTurns`        | `number`                                                    | 否  | 代理停止前的最大代理轮数                                                                                                    |
| `background`      | `boolean`                                                   | 否  | 调用时将此代理作为非阻塞后台任务运行                                                                                              |
| `effort`          | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max' \| number` | 否  | 此代理的推理工作量级别                                                                                                     |
| `permissionMode`  | `PermissionMode`                                            | 否  | 此代理内工具执行的权限模式                                                                                                   |

在 Python SDK 中，多字词字段名称（如 `disallowedTools` 和 `mcpServers`）保持其 camelCase 拼写以匹配线路格式，而不是遵循 Python 的 snake\_case 约定。有关详细信息，请参阅 [`AgentDefinition` 参考](/docs/zh-CN/agent-sdk/python#agentdefinition)。

Claude Code v2.1.198 中的两个子代理行为发生了变化：

* 子代理默认在后台运行。省略 [`run_in_background`](/docs/zh-CN/agent-sdk/typescript) 输入的 Agent 工具调用会启动后台子代理，当 Claude 需要结果后才继续时，它会设置 `run_in_background: false`。在 v2.1.198 之前，省略 `run_in_background` 会同步运行子代理。设置 `background` 字段为 `true` 以强制特定代理进行后台执行，无论 Claude 请求什么。
* 子代理继承主会话的扩展思考配置。在早期版本中，无论主会话的设置如何，扩展思考在子代理内被禁用。

<Note>
  自 Claude Code v2.1.172 起，子代理可以生成自己的子代理。位于主代理下方五个级别的子代理无法生成进一步的子代理，无论其是在前台还是后台运行。要防止子代理生成其他子代理，请从其 `tools` 数组中省略 `Agent` 或将其添加到 `disallowedTools`。有关完整的深度规则，请参阅[嵌套子代理](/docs/zh-CN/sub-agents#spawn-nested-subagents)。
</Note>

<h3 id="filesystem-based-definition-alternative">
  基于文件系统的定义（替代方案）
</h3>

您也可以在 `.claude/agents/` 目录中将子代理定义为 markdown 文件。有关此方法的详细信息，请参阅 [Claude Code 子代理文档](/docs/zh-CN/sub-agents)。以编程方式定义的代理优先于具有相同名称的基于文件系统的代理。

<Note>
  即使不定义自定义子代理，Claude 也可以生成内置的 `general-purpose` 子代理。这对于委派研究或探索任务而无需创建专门的代理很有用。在 `allowedTools` 中包含 `Agent` 以便这些调用自动批准，无需权限提示。
</Note>

<h2 id="what-subagents-inherit">
  子代理继承的内容
</h2>

子代理的上下文窗口从新开始，没有父对话，但不是空的。从父代理到子代理的唯一内容是 Agent 工具的提示词字符串，因此请直接在该提示词中包含子代理需要的任何文件路径、错误消息或决策。

具有 [`SendMessage`](/docs/zh-CN/tools-reference) 工具的子代理会从会话中运行的其他命名代理列表开始，因此它知道可以向哪些名称发送消息。Claude Code 会自动在子代理的第一轮中添加该列表。[fork](/docs/zh-CN/sub-agents#fork-the-current-conversation) 不会获得该列表，因为它继承了父对话。该列表需要 Claude Code v2.1.206 或更高版本。

| 子代理接收                                                                                                                         | 子代理不接收                                         |
| :---------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------- |
| 其自己的系统提示词（`AgentDefinition.prompt`）和 Agent 工具的提示词                                                                             | 父代理的对话历史或工具结果                                  |
| 项目 CLAUDE.md（通过 [`settingSources`](/docs/zh-CN/agent-sdk/claude-code-features#control-filesystem-settings-with-settingsources) 加载） | 预加载的 skill 内容，除非在 `AgentDefinition.skills` 中列出 |
| 工具定义（从父代理继承，或 `tools` 中的子集）                                                                                                   | 父代理的系统提示词                                      |

<Note>
  父代理逐字接收子代理的最终消息作为 Agent 工具结果，但可能在其自己的响应中总结它。要在面向用户的响应中逐字保留子代理输出，请在您传递给主 `query()` 调用的提示词或 `systemPrompt` 选项中包含一条指令。
</Note>

结束子代理早期的 API 错误（例如速率限制）永远不会作为其结果传递。如果速率限制、过载或服务器错误中断了已经产生文本输出的前台子代理，Agent 工具会返回该部分输出并注明子代理未完成。未产生任何内容的子代理，或其唯一输出仅为工具调用且没有文本的子代理，会失败并显示错误消息 `Agent terminated early due to an API error`，后跟错误详情。有关前台和后台行为，请参阅 [API errors in subagents](/docs/zh-CN/sub-agents#api-errors-in-subagents)。

这种部分输出处理需要 Claude Code v2.1.199 或更高版本。在 v2.1.199 中，速率限制、过载或服务器错误会导致仅工具调用的形状出现空的部分结果，仅包含中断注记。

<h2 id="invoke-subagents">
  调用子代理
</h2>

<h3 id="automatic-invocation">
  自动调用
</h3>

Claude 根据任务和每个子代理的 `description` 自动决定何时调用子代理。例如，如果您定义了一个 `performance-optimizer` 子代理，其描述为"用于查询调优的性能优化专家"，当您的提示词提到优化查询时，Claude 将调用它。

编写清晰、具体的描述，以便 Claude 可以将任务匹配到正确的子代理。

<h3 id="explicit-invocation">
  显式调用
</h3>

要保证 Claude 使用特定的子代理，请在您的提示词中按名称提及它：

```text theme={null}
"Use the code-reviewer agent to check the authentication module"
```

这绕过自动匹配并直接调用命名的子代理。

<h3 id="dynamic-agent-configuration">
  动态代理配置
</h3>

您可以根据运行时条件动态创建代理定义。此示例创建一个安全审查员，具有不同的严格级别，对严格审查使用更强大的模型。

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition


  # Factory function that returns an AgentDefinition
  # This pattern lets you customize agents based on runtime conditions
  def create_security_agent(security_level: str) -> AgentDefinition:
      is_strict = security_level == "strict"
      return AgentDefinition(
          description="Security code reviewer",
          # Customize the prompt based on strictness level
          prompt=f"You are a {'strict' if is_strict else 'balanced'} security reviewer...",
          tools=["Read", "Grep", "Glob"],
          # Key insight: use a more capable model for high-stakes reviews
          model="opus" if is_strict else "sonnet",
      )


  async def main():
      # The agent is created at query time, so each request can use different settings
      async for message in query(
          prompt="Review this PR for security issues",
          options=ClaudeAgentOptions(
              allowed_tools=["Read", "Grep", "Glob", "Agent"],
              agents={
                  # Call the factory with your desired configuration
                  "security-reviewer": create_security_agent("strict")
              },
          ),
      ):
          if hasattr(message, "result"):
              print(message.result)


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

  // Factory function that returns an AgentDefinition
  // This pattern lets you customize agents based on runtime conditions
  function createSecurityAgent(securityLevel: "basic" | "strict"): AgentDefinition {
    const isStrict = securityLevel === "strict";
    return {
      description: "Security code reviewer",
      // Customize the prompt based on strictness level
      prompt: `You are a ${isStrict ? "strict" : "balanced"} security reviewer...`,
      tools: ["Read", "Grep", "Glob"],
      // Key insight: use a more capable model for high-stakes reviews
      model: isStrict ? "opus" : "sonnet"
    };
  }

  // The agent is created at query time, so each request can use different settings
  for await (const message of query({
    prompt: "Review this PR for security issues",
    options: {
      allowedTools: ["Read", "Grep", "Glob", "Agent"],
      agents: {
        // Call the factory with your desired configuration
        "security-reviewer": createSecurityAgent("strict")
      }
    }
  })) {
    if ("result" in message) console.log(message.result);
  }
  ```
</CodeGroup>

<h2 id="detect-subagent-invocation">
  检测子代理调用
</h2>

Claude 通过 Agent 工具调用子代理。要检测何时调用子代理，请检查 `tool_use` 块，其中 `name` 是 `"Agent"`。来自子代理上下文内的消息包含 `parent_tool_use_id` 字段。

<Note>
  工具名称在 Claude Code v2.1.63 中从 `"Task"` 重命名为 `"Agent"`。当前 SDK 版本在 `tool_use` 块中发出 `"Agent"`，但在 `system:init` 工具列表和 `result.permission_denials[].tool_name` 中仍使用 `"Task"`。检查 `block.name` 中的两个值可确保跨 SDK 版本的兼容性。
</Note>

消息结构在 SDK 之间有所不同。在 Python 中，内容块直接通过 `message.content` 访问。在 TypeScript 中，`SDKAssistantMessage` 包装 Claude API 消息，因此内容通过 `message.message.content` 访问。

此示例遍历流式消息，记录何时调用子代理以及后续消息何时源自该子代理的执行上下文。

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition, ToolUseBlock


  async def main():
      async for message in query(
          prompt="Use the code-reviewer agent to review this codebase",
          options=ClaudeAgentOptions(
              allowed_tools=["Read", "Glob", "Grep", "Agent"],
              agents={
                  "code-reviewer": AgentDefinition(
                      description="Expert code reviewer.",
                      prompt="Analyze code quality and suggest improvements.",
                      tools=["Read", "Glob", "Grep"],
                  )
              },
          ),
      ):
          # Check for subagent invocation. Match both names: older SDK
          # versions emitted "Task", current versions emit "Agent".
          if hasattr(message, "content") and message.content:
              for block in message.content:
                  if isinstance(block, ToolUseBlock) and block.name in (
                      "Task",
                      "Agent",
                  ):
                      print(f"Subagent invoked: {block.input.get('subagent_type')}")

          # Check if this message is from within a subagent's context
          if hasattr(message, "parent_tool_use_id") and message.parent_tool_use_id:
              print("  (running inside subagent)")

          if hasattr(message, "result"):
              print(message.result)


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Use the code-reviewer agent to review this codebase",
    options: {
      allowedTools: ["Read", "Glob", "Grep", "Agent"],
      agents: {
        "code-reviewer": {
          description: "Expert code reviewer.",
          prompt: "Analyze code quality and suggest improvements.",
          tools: ["Read", "Glob", "Grep"]
        }
      }
    }
  })) {
    const msg = message as any;

    // Check for subagent invocation. Match both names: older SDK versions
    // emitted "Task", current versions emit "Agent".
    for (const block of msg.message?.content ?? []) {
      if (block.type === "tool_use" && (block.name === "Task" || block.name === "Agent")) {
        console.log(`Subagent invoked: ${block.input.subagent_type}`);
      }
    }

    // Check if this message is from within a subagent's context
    if (msg.parent_tool_use_id) {
      console.log("  (running inside subagent)");
    }

    if ("result" in message) {
      console.log(message.result);
    }
  }
  ```
</CodeGroup>

<h2 id="resume-subagents">
  恢复子代理
</h2>

您可以恢复子代理以继续中断的地方，而不是重新开始。恢复的子代理保留其完整的对话历史，包括所有先前的工具调用、结果和推理。

当子代理完成时，Agent 工具结果包含一个包含 `agentId: <id>` 的文本块。内置的 [`Explore` 和 `Plan` 代理](/docs/zh-CN/sub-agents#built-in-subagents) 是一次性的，不返回 `agentId`，因此当您需要恢复时，请使用自定义代理或 `general-purpose`。要以编程方式恢复子代理：

1. **捕获会话 ID**：在第一个查询期间从消息中提取 `session_id`
2. **提取代理 ID**：从 Agent 工具结果文本中解析 `agentId`
3. **恢复会话**：在第二个查询的选项中传递 `resume: sessionId`，并在您的提示词中包含代理 ID

<Note>
  您必须恢复同一会话以访问子代理的记录。默认情况下，每个 `query()` 调用都会启动一个新会话，因此请传递 `resume: sessionId` 以在同一会话中继续。

  使用自定义代理时，在两个查询的 `agents` 参数中传递相同的代理定义。
</Note>

下面的示例定义了一个自定义 `endpoint-finder` 代理。第一个查询运行它并从 Agent 工具结果中捕获会话 ID 和代理 ID，然后第二个查询恢复会话以提出需要来自第一个分析的上下文的后续问题。

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  import re
  from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition, ToolResultBlock

  AGENTS = {
      "endpoint-finder": AgentDefinition(
          description="Locates and catalogs API endpoints in a codebase.",
          prompt="You find and document API endpoints. Report each endpoint's path, method, and handler.",
          tools=["Read", "Grep", "Glob"],
      )
  }


  def extract_agent_id(block: ToolResultBlock) -> str | None:
      """Extract agentId from an Agent tool result's text content."""
      parts = block.content if isinstance(block.content, list) else [{"text": block.content}]
      for part in parts:
          if match := re.search(r"agentId:\s*([\w-]+)", part.get("text") or ""):
              return match.group(1)
      return None


  async def main():
      agent_id = None
      session_id = None

      # First invocation - run the endpoint-finder subagent
      try:
          async for message in query(
              prompt="Use the endpoint-finder agent to find all API endpoints in this codebase",
              options=ClaudeAgentOptions(allowed_tools=["Read", "Grep", "Glob", "Agent"], agents=AGENTS),
          ):
              # Capture session_id from ResultMessage (needed to resume this session)
              if hasattr(message, "session_id"):
                  session_id = message.session_id
              # Search tool results for the agentId trailer
              for block in getattr(message, "content", None) or []:
                  if isinstance(block, ToolResultBlock):
                      agent_id = extract_agent_id(block) or agent_id
              # Print the final result
              if hasattr(message, "result"):
                  print(message.result)
      except Exception as error:
          # A single-shot query() raises after yielding an error result,
          # so session_id and agent_id have already been captured by the loop above.
          print(f"Session ended with an error: {error}")

      # Second invocation - resume and ask follow-up
      if agent_id and session_id:
          async for message in query(
              prompt=f"Resume agent {agent_id} and list the top 3 most complex endpoints",
              options=ClaudeAgentOptions(
                  allowed_tools=["Read", "Grep", "Glob", "Agent"], agents=AGENTS, resume=session_id
              ),
          ):
              if hasattr(message, "result"):
                  print(message.result)
      else:
          print("No agentId found in the first query, so there is no subagent to resume.")


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

  const agents = {
    "endpoint-finder": {
      description: "Locates and catalogs API endpoints in a codebase.",
      prompt: "You find and document API endpoints. Report each endpoint's path, method, and handler.",
      tools: ["Read", "Grep", "Glob"]
    }
  };

  // Stringify content to search for agentId without traversing nested block types
  function extractAgentId(message: SDKMessage): string | undefined {
    if (message.type !== "assistant" && message.type !== "user") return undefined;
    const content = JSON.stringify(message.message.content);
    const match = content.match(/agentId:\s*([\w-]+)/);
    return match?.[1];
  }

  let agentId: string | undefined;
  let sessionId: string | undefined;

  // First invocation - run the endpoint-finder subagent
  try {
    for await (const message of query({
      prompt: "Use the endpoint-finder agent to find all API endpoints in this codebase",
      options: { allowedTools: ["Read", "Grep", "Glob", "Agent"], agents }
    })) {
      // Capture session_id from ResultMessage (needed to resume this session)
      if ("session_id" in message) sessionId = message.session_id;
      // Search message content for the agentId (appears in Agent tool results)
      const extractedId = extractAgentId(message);
      if (extractedId) agentId = extractedId;
      // Print the final result
      if ("result" in message) console.log(message.result);
    }
  } catch (error) {
    // A single-shot query() throws after yielding an error result,
    // so sessionId and agentId have already been captured by the loop above.
    console.error(`Session ended with an error: ${error}`);
  }

  // Second invocation - resume and ask follow-up
  if (agentId && sessionId) {
    for await (const message of query({
      prompt: `Resume agent ${agentId} and list the top 3 most complex endpoints`,
      options: { allowedTools: ["Read", "Grep", "Glob", "Agent"], agents, resume: sessionId }
    })) {
      if ("result" in message) console.log(message.result);
    }
  } else {
    console.log("No agentId found in the first query, so there is no subagent to resume.");
  }
  ```
</CodeGroup>

子代理记录独立于主对话而持久存在：

* **主对话压缩**：当主对话压缩时，子代理记录不受影响。它们存储在单独的文件中。
* **会话持久性**：子代理记录在其会话内持久存在。您可以通过恢复同一会话在重启 Claude Code 后恢复子代理。
* **自动清理**：记录根据 `cleanupPeriodDays` 设置进行清理，默认为 30 天。

<h2 id="tool-restrictions-2">
  工具限制
</h2>

子代理可以通过 `tools` 字段具有受限的工具访问：

* **省略该字段**：代理继承所有可用工具（默认）
* **指定工具**：代理只能使用列出的工具

此示例创建一个只读分析代理，可以检查代码但无法修改文件或运行命令。

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition


  async def main():
      async for message in query(
          prompt="Analyze the architecture of this codebase",
          options=ClaudeAgentOptions(
              allowed_tools=["Read", "Grep", "Glob", "Agent"],
              agents={
                  "code-analyzer": AgentDefinition(
                      description="Static code analysis and architecture review",
                      prompt="""You are a code architecture analyst. Analyze code structure,
  identify patterns, and suggest improvements without making changes.""",
                      # Read-only tools: no Edit, Write, or Bash access
                      tools=["Read", "Grep", "Glob"],
                  )
              },
          ),
      ):
          if hasattr(message, "result"):
              print(message.result)


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Analyze the architecture of this codebase",
    options: {
      allowedTools: ["Read", "Grep", "Glob", "Agent"],
      agents: {
        "code-analyzer": {
          description: "Static code analysis and architecture review",
          prompt: `You are a code architecture analyst. Analyze code structure,
  identify patterns, and suggest improvements without making changes.`,
          // Read-only tools: no Edit, Write, or Bash access
          tools: ["Read", "Grep", "Glob"]
        }
      }
    }
  })) {
    if ("result" in message) console.log(message.result);
  }
  ```
</CodeGroup>

<h3 id="common-tool-combinations">
  常见工具组合
</h3>

| 用例   | 工具                                  | 描述                        |
| :--- | :---------------------------------- | :------------------------ |
| 只读分析 | `Read`、`Grep`、`Glob`                | 可以检查代码但不能修改或执行            |
| 测试执行 | `Bash`、`Read`、`Grep`                | 可以运行命令并分析输出               |
| 代码修改 | `Read`、`Edit`、`Write`、`Grep`、`Glob` | 完整的读/写访问，无命令执行            |
| 完全访问 | 所有工具                                | 从父代理继承所有工具（省略 `tools` 字段） |

<h2 id="scale-up-with-dynamic-workflows">
  使用动态工作流进行扩展
</h2>

子代理适用于每轮委派的几个任务。对于协调数十到数百个代理的运行，请使用 `Workflow` 工具，它将编排移到运行时在对话上下文外执行的脚本中。请参阅[动态工作流](/docs/zh-CN/workflows)以了解工作流与逐轮子代理委派的区别。

`Workflow` 工具在 TypeScript Agent SDK v0.3.149 及更高版本中可用。在 `allowedTools` 中包含 `Workflow` 以自动批准工作流运行。工具输入和输出架构列在 [TypeScript 参考](/docs/zh-CN/agent-sdk/typescript#workflow)中。

<h2 id="troubleshooting">
  故障排除
</h2>

<h3 id="claude-not-delegating-to-subagents">
  Claude 不委派给子代理
</h3>

如果 Claude 直接完成任务而不是委派给您的子代理：

* **检查 Agent 调用是否被批准**：在 `allowedTools` 中包含 `Agent` 以自动批准子代理调用。如果没有它，Agent 调用将转到您的 `canUseTool` 回调，或在 `dontAsk` 模式下被拒绝
* **使用显式提示**：在您的提示词中按名称提及子代理，例如"使用代码审查员代理来..."
* **编写清晰的描述**：准确解释何时应使用子代理，以便 Claude 可以适当地匹配任务

<h3 id="filesystem-based-agents-not-loading">
  基于文件系统的代理未加载
</h3>

Claude Code 监视 `~/.claude/agents/` 和 `.claude/agents/`，并在几秒内拾取新的或编辑的代理文件，无需重启。如果定义从未出现，请排查这些原因：

* **新的 `agents` 目录**：监视程序仅覆盖会话启动时存在的目录，因此新目录中的第一个文件需要会话重启。这是最常见的原因。
* **无效的 frontmatter 或重复的 `name`**：检查文件的 YAML，以及现有代理是否已使用该 `name`。
* **`--disable-slash-commands`**：使用此标志启动的会话不监视这些目录，始终需要重启以加载新文件。
* **具有相同名称的程序化代理**：传递给 `query()` 的 `agents` 会覆盖具有相同名称的文件系统代理。

有关文件格式，请参阅[如何编写子代理文件](/docs/zh-CN/sub-agents#write-subagent-files)。

<h3 id="long-prompt-failures-on-windows">
  Windows 上的长提示词失败
</h3>

在 Windows 上，具有非常长提示词的子代理可能因命令行长度限制（8191 个字符）而失败。保持提示词简洁或使用基于文件系统的代理来处理复杂指令。

<h2 id="related-documentation">
  相关文档
</h2>

* [Claude Code 子代理](/docs/zh-CN/sub-agents)：包括基于文件系统的定义的全面子代理文档
* [动态工作流](/docs/zh-CN/workflows)：从脚本编排许多子代理，用于对话过大的工作
* [SDK 概述](/docs/zh-CN/agent-sdk/overview)：Claude Agent SDK 入门
