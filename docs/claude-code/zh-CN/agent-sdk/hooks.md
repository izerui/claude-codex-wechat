> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用 hooks 拦截和控制代理行为

> 在代理执行的关键点使用 hooks 拦截和自定义代理行为

Hooks 是回调函数，用于响应代理事件（如工具被调用、会话启动或执行停止）运行您的代码。使用 hooks，您可以：

* **阻止危险操作**在执行前进行，如破坏性 shell 命令或未授权的文件访问
* **记录和审计**每个工具调用，用于合规性、调试或分析
* **转换输入和输出**以清理数据、注入凭证或重定向文件路径
* **要求人工批准**敏感操作，如数据库写入或 API 调用
* **跟踪会话生命周期**以管理状态、清理资源或发送通知

本指南涵盖 hooks 的工作原理、如何配置它们，并提供常见模式的示例，如阻止工具、修改输入和转发通知。

<h2 id="how-hooks-work">
  Hooks 如何工作
</h2>

<Steps>
  <Step title="事件触发">
    代理执行期间发生某事，SDK 触发事件：工具即将被调用（`PreToolUse`）、工具返回结果（`PostToolUse`）、子代理启动或停止、代理空闲或执行完成。请参阅[完整事件列表](#available-hooks)。
  </Step>

  <Step title="SDK 收集已注册的 hooks">
    SDK 检查为该事件类型注册的 hooks。这包括您在 `options.hooks` 中传递的回调 hooks 和来自设置文件的 shell 命令 hooks，当相应的 [`settingSources`](/docs/zh-CN/agent-sdk/typescript#settingsource) 或 [`setting_sources`](/docs/zh-CN/agent-sdk/python#settingsource) 条目启用时（默认 `query()` 选项就是这样）。
  </Step>

  <Step title="匹配器过滤哪些 hooks 运行">
    如果 hook 有 [`matcher`](#matchers) 模式（如 `"Write|Edit"`），SDK 会针对事件的目标（例如工具名称）测试它。没有匹配器的 hooks 对该类型的每个事件都运行。
  </Step>

  <Step title="回调函数执行">
    每个匹配的 hook 的[回调函数](#callback-functions)接收有关正在发生的事情的输入：工具名称、其参数、会话 ID 和其他事件特定的详细信息。
  </Step>

  <Step title="您的回调返回决定">
    执行任何操作（日志记录、API 调用、验证）后，您的回调返回一个[输出对象](#outputs)，告诉代理该做什么：允许操作、阻止它、修改输入或将上下文注入到对话中。
  </Step>
</Steps>

以下示例将这些步骤组合在一起。它注册一个 `PreToolUse` hook（步骤 1），带有 `"Write|Edit"` 匹配器（步骤 3），因此回调仅对文件写入工具触发。触发时，回调接收工具的输入（步骤 4），检查文件路径是否针对 `.env` 文件，并返回 `permissionDecision: "deny"` 以阻止操作（步骤 5）：

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import (
      AssistantMessage,
      ClaudeSDKClient,
      ClaudeAgentOptions,
      HookMatcher,
      ResultMessage,
  )


  # 定义一个接收工具调用详细信息的 hook 回调
  async def protect_env_files(input_data, tool_use_id, context):
      # 从工具的输入参数中提取文件路径
      file_path = input_data["tool_input"].get("file_path", "")
      file_name = file_path.split("/")[-1]

      # 如果针对 .env 文件，阻止操作
      if file_name == ".env":
          return {
              "hookSpecificOutput": {
                  "hookEventName": input_data["hook_event_name"],
                  "permissionDecision": "deny",
                  "permissionDecisionReason": "Cannot modify .env files",
              }
          }

      # 返回空对象以允许操作
      return {}


  async def main():
      options = ClaudeAgentOptions(
          hooks={
              # 为 PreToolUse 事件注册 hook
              # 匹配器仅过滤 Write 和 Edit 工具调用
              "PreToolUse": [HookMatcher(matcher="Write|Edit", hooks=[protect_env_files])]
          }
      )

      async with ClaudeSDKClient(options=options) as client:
          await client.query("Update the database configuration")
          async for message in client.receive_response():
              # 过滤助手和结果消息
              if isinstance(message, (AssistantMessage, ResultMessage)):
                  print(message)


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query, HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

  // 使用 HookCallback 类型定义 hook 回调
  const protectEnvFiles: HookCallback = async (input, toolUseID, { signal }) => {
    // 将输入转换为特定 hook 类型以获得类型安全
    const preInput = input as PreToolUseHookInput;

    // 转换 tool_input 以访问其属性（在 SDK 中类型为 unknown）
    const toolInput = preInput.tool_input as Record<string, unknown>;
    const filePath = toolInput?.file_path as string;
    const fileName = filePath?.split("/").pop();

    // 如果针对 .env 文件，阻止操作
    if (fileName === ".env") {
      return {
        hookSpecificOutput: {
          hookEventName: preInput.hook_event_name,
          permissionDecision: "deny",
          permissionDecisionReason: "Cannot modify .env files"
        }
      };
    }

    // 返回空对象以允许操作
    return {};
  };

  for await (const message of query({
    prompt: "Update the database configuration",
    options: {
      hooks: {
        // 为 PreToolUse 事件注册 hook
        // 匹配器仅过滤 Write 和 Edit 工具调用
        PreToolUse: [{ matcher: "Write|Edit", hooks: [protectEnvFiles] }]
      }
    }
  })) {
    // 过滤助手和结果消息
    if (message.type === "assistant" || message.type === "result") {
      console.log(message);
    }
  }
  ```
</CodeGroup>

<h2 id="available-hooks">
  可用的 hooks
</h2>

SDK 为代理执行的不同阶段提供 hooks。某些 hooks 在两个 SDK 中都可用，而其他 hooks 仅在 TypeScript 中可用。

| Hook 事件                                                   | Python SDK | TypeScript SDK | 触发条件                       | 示例用例                         |
| --------------------------------------------------------- | ---------- | -------------- | -------------------------- | ---------------------------- |
| `PreToolUse`                                              | 是          | 是              | 工具调用请求（可以阻止或修改）            | 阻止危险的 shell 命令               |
| `PostToolUse`                                             | 是          | 是              | 工具执行结果                     | 将所有文件更改记录到审计跟踪               |
| `PostToolUseFailure`                                      | 是          | 是              | 工具执行失败                     | 处理或记录工具错误                    |
| `PostToolBatch`                                           | 否          | 是              | 一整批工具调用解决，每批一次，在下一个模型调用之前  | 为整个批次注入约定                    |
| `UserPromptSubmit`                                        | 是          | 是              | 用户提示提交                     | 将额外上下文注入到提示中                 |
| [`UserPromptExpansion`](/docs/zh-CN/hooks#userpromptexpansion) | 否          | 是              | 用户输入的命令在到达 Claude 之前扩展为提示  | 阻止命令直接调用或在输入 skill 时添加上下文    |
| `MessageDisplay`                                          | 否          | 是              | 助手消息包含文本完成，每条消息一次，包含完整消息文本 | 编辑或重新格式化显示的文本而不改变记录          |
| `Stop`                                                    | 是          | 是              | 代理执行停止                     | 在退出前保存会话状态                   |
| `SubagentStart`                                           | 是          | 是              | 子代理初始化                     | 跟踪并行任务生成                     |
| `SubagentStop`                                            | 是          | 是              | 子代理完成                      | 聚合来自并行任务的结果                  |
| `PreCompact`                                              | 是          | 是              | 对话压缩请求                     | 在总结前存档完整记录                   |
| `PermissionRequest`                                       | 是          | 是              | 权限对话将显示                    | 自定义权限处理                      |
| `SessionStart`                                            | 否          | 是              | 会话初始化                      | 初始化日志记录和遥测                   |
| `SessionEnd`                                              | 否          | 是              | 会话终止                       | 清理临时资源                       |
| `Notification`                                            | 是          | 是              | 代理状态消息                     | 将代理状态更新发送到 Slack 或 PagerDuty |
| `Setup`                                                   | 否          | 是              | 会话设置/维护                    | 运行初始化任务                      |
| `TeammateIdle`                                            | 否          | 是              | 队友变为空闲                     | 重新分配工作或通知                    |
| `TaskCompleted`                                           | 否          | 是              | 后台任务完成                     | 聚合来自并行任务的结果                  |
| `ConfigChange`                                            | 否          | 是              | 配置文件更改                     | 动态重新加载设置                     |
| `WorktreeCreate`                                          | 否          | 是              | Git worktree 创建            | 跟踪隔离的工作区                     |
| `WorktreeRemove`                                          | 否          | 是              | Git worktree 移除            | 清理工作区资源                      |

<h2 id="configure-hooks">
  配置 hooks
</h2>

要配置 hook，请在您的代理选项的 `hooks` 字段中传递它（Python 中的 `ClaudeAgentOptions`，TypeScript 中的 `options` 对象）：

<CodeGroup>
  ```python Python theme={null}
  options = ClaudeAgentOptions(
      hooks={"PreToolUse": [HookMatcher(matcher="Bash", hooks=[my_callback])]}
  )

  async with ClaudeSDKClient(options=options) as client:
      await client.query("Your prompt")
      async for message in client.receive_response():
          print(message)
  ```

  ```typescript TypeScript theme={null}
  for await (const message of query({
    prompt: "Your prompt",
    options: {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [myCallback] }]
      }
    }
  })) {
    console.log(message);
  }
  ```
</CodeGroup>

`hooks` 选项是一个字典（Python）或对象（TypeScript），其中：

* **键**是 [hook 事件名称](#available-hooks)（例如 `'PreToolUse'`、`'PostToolUse'`、`'Stop'`）
* **值**是[匹配器](#matchers)数组，每个包含可选的过滤模式和您的[回调函数](#callback-functions)

<h3 id="matchers">
  匹配器
</h3>

使用匹配器来过滤您的回调何时触发。`matcher` 字段根据 hook 事件类型匹配不同的值。例如，基于工具的 hooks 匹配工具名称，而 `Notification` hooks 匹配通知类型。请参阅 [Claude Code hooks 参考](/docs/zh-CN/hooks#matcher-patterns)以获取每个事件类型的匹配器值的完整列表。

SDK 匹配器遵循与[设置文件中的匹配器](/docs/zh-CN/hooks#matcher-patterns)相同的规则。仅包含字母、数字、`_`、`-`、空格、`,` 和 `|` 的匹配器作为精确字符串进行比较，替代项由 `|` 或 `,` 分隔，可选的周围空格，因此 `Write|Edit` 和 `Write, Edit` 各自精确匹配这两个工具，`code-reviewer` 仅匹配该代理类型。`*` 的匹配器、空字符串或完全省略匹配器会匹配事件的每次出现。

包含任何其他字符的匹配器被评估为非锚定正则表达式，因此 `^mcp__` 匹配每个 MCP 工具，`Edit.*` 匹配 `Edit` 和 `NotebookEdit`。当您需要全字符串匹配时，用 `^` 和 `$` 包装正则表达式。

像 `mcp__memory` 或 `mcp__brave-search` 这样的匹配器仅包含精确匹配字符，因此它作为精确字符串进行比较，不匹配任何工具；使用 `mcp__memory__.*` 来匹配来自该服务器的每个工具。

精确匹配集中的连字符需要 Claude Code 运行时 v2.1.195 或更高版本。在较早的版本中，像 `code-reviewer` 这样的带连字符的名称被评估为非锚定正则表达式，必须锚定为 `^code-reviewer$` 才能精确匹配。

| 选项        | 类型               | 默认值         | 描述                                                                                                                                                                                                                       |
| --------- | ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `matcher` | `string`         | `undefined` | 针对事件的过滤字段匹配的模式，遵循上述比较规则。对于工具 hooks，这是工具名称。内置工具包括 `Bash`、`Read`、`Write`、`Edit`、`Glob`、`Grep`、`WebFetch`、`Agent` 等（请参阅[工具输入类型](/docs/zh-CN/agent-sdk/typescript#tool-input-types)以获取完整列表）。MCP 工具使用模式 `mcp__<server>__<action>`。 |
| `hooks`   | `HookCallback[]` | -           | 必需。当模式匹配时执行的回调函数数组                                                                                                                                                                                                       |
| `timeout` | `number`         | `60`        | 超时时间（秒）                                                                                                                                                                                                                  |

尽可能使用 `matcher` 模式来针对特定工具。带有 `'Bash'` 的匹配器仅对 Bash 命令运行，而省略模式会为事件的每次出现运行您的回调。

对于基于工具的 hooks，匹配器仅按工具名称过滤，而不是按文件路径或其他参数。要按文件路径过滤，请在回调内检查 `tool_input.file_path`。

<Tip>
  **发现工具名称：** 请参阅[工具输入类型](/docs/zh-CN/agent-sdk/typescript#tool-input-types)以获取内置工具名称的完整列表，或添加没有匹配器的 hook 来记录您的会话进行的所有工具调用。

  **MCP 工具命名：** MCP 工具始终以 `mcp__` 开头，后跟服务器名称和操作：`mcp__<server>__<action>`。例如，如果您配置一个名为 `playwright` 的服务器，其工具将被命名为 `mcp__playwright__browser_screenshot`、`mcp__playwright__browser_click` 等。服务器名称来自您在 `mcpServers` 配置中使用的键。
</Tip>

<h3 id="callback-functions">
  回调函数
</h3>

<h4 id="inputs">
  输入
</h4>

每个 hook 回调接收三个参数：

* **输入数据：** 一个包含事件详细信息的类型化对象。每个 hook 类型都有自己的输入形状。例如，`PreToolUseHookInput` 包括 `tool_name` 和 `tool_input`，而 `NotificationHookInput` 包括 `message`。请参阅 [TypeScript](/docs/zh-CN/agent-sdk/typescript#hookinput) 和 [Python](/docs/zh-CN/agent-sdk/python#hookinput) SDK 参考中的完整类型定义。
  * 所有 hook 输入共享 `session_id`、`cwd` 和 `hook_event_name`。
  * 当 hook 在子代理内触发时，`agent_id` 和 `agent_type` 被填充。在 TypeScript 中，这些在基础 hook 输入上，对所有 hook 类型都可用。在 Python 中，它们是 `PreToolUse`、`PostToolUse`、`PostToolUseFailure` 和 `PermissionRequest` 上的可选字段，以及 `SubagentStart` 和 `SubagentStop` 上的必需字段。
* **工具使用 ID**（`str | None` / `string | undefined`）：关联同一工具调用的 `PreToolUse` 和 `PostToolUse` 事件。
* **上下文：** 在 TypeScript 中，包含用于取消的 `signal` 属性（`AbortSignal`）。在 Python 中，此参数保留供将来使用。

<h4 id="outputs">
  输出
</h4>

您的回调返回一个具有两类字段的对象：

* **顶级字段**在每个事件上的工作方式相同：`systemMessage` 向用户显示消息，`continue`（Python 中的 `continue_`）确定代理在此 hook 后是否继续运行。
* **`hookSpecificOutput`** 控制当前操作。内部的字段取决于 hook 事件类型。对于 `PreToolUse` hooks，这是您设置 `permissionDecision`（`"allow"`、`"deny"`、`"ask"` 或 `"defer"`）、`permissionDecisionReason` 和 `updatedInput` 的地方。返回 `"defer"` 结束查询，以便您可以[稍后恢复它](/docs/zh-CN/hooks#defer-a-tool-call-for-later)。对于 `PostToolUse` hooks，您可以设置 `additionalContext` 以将信息附加到工具结果。要在 Claude 看到之前替换工具的输出，请设置 `updatedToolOutput`，这适用于两个 SDK 中的任何工具。较旧的 `updatedMCPToolOutput` 字段仅替换 MCP 工具输出，已弃用。

返回 `{}` 以允许操作而不进行更改。SDK 回调 hooks 使用与 [Claude Code shell 命令 hooks](/docs/zh-CN/hooks#json-output) 相同的 JSON 输出格式，其中记录了每个字段和事件特定的选项。对于 SDK 类型定义，请参阅 [TypeScript](/docs/zh-CN/agent-sdk/typescript#synchookjsonoutput) 和 [Python](/docs/zh-CN/agent-sdk/python#synchookjsonoutput) SDK 参考。

<Note>
  当多个 hooks 或权限规则适用时，`deny` 优先于 `defer`，`defer` 优先于 `ask`，`ask` 优先于 `allow`。如果任何 hook 返回 `deny`，操作将被阻止，无论其他 hooks 如何。
</Note>

<h4 id="asynchronous-output">
  异步输出
</h4>

默认情况下，代理在您的 hook 返回前等待。如果您的 hook 执行副作用，例如日志记录或发送 webhook，并且不需要影响代理的行为，您可以改为返回异步输出。这告诉代理立即继续，而不等待 hook 完成：

<CodeGroup>
  ```python Python theme={null}
  async def async_hook(input_data, tool_use_id, context):
      # 启动后台任务，然后立即返回
      asyncio.create_task(send_to_logging_service(input_data))
      return {"async_": True, "asyncTimeout": 30000}
  ```

  ```typescript TypeScript theme={null}
  const asyncHook: HookCallback = async (input, toolUseID, { signal }) => {
    // 启动后台任务，然后立即返回
    sendToLoggingService(input).catch(console.error);
    return { async: true, asyncTimeout: 30000 };
  };
  ```
</CodeGroup>

| 字段             | 类型       | 描述                                               |
| -------------- | -------- | ------------------------------------------------ |
| `async`        | `true`   | 表示异步模式。代理继续而不等待。在 Python 中，使用 `async_` 以避免保留关键字。 |
| `asyncTimeout` | `number` | 后台操作的可选超时时间（毫秒）                                  |

<Note>
  异步输出无法阻止、修改或将上下文注入到操作中，因为代理已经继续。仅将它们用于日志记录、指标或通知等副作用。
</Note>

<h2 id="examples">
  示例
</h2>

<h3 id="modify-tool-input">
  修改工具输入
</h3>

此示例拦截 Write 工具调用并重写 `file_path` 参数以添加 `/sandbox` 前缀，将所有文件写入重定向到沙箱目录。回调返回带有修改路径的 `updatedInput` 和 `permissionDecision: 'allow'` 以自动批准重写的操作：

<CodeGroup>
  ```python Python theme={null}
  async def redirect_to_sandbox(input_data, tool_use_id, context):
      if input_data["hook_event_name"] != "PreToolUse":
          return {}

      if input_data["tool_name"] == "Write":
          original_path = input_data["tool_input"].get("file_path", "")
          return {
              "hookSpecificOutput": {
                  "hookEventName": input_data["hook_event_name"],
                  "permissionDecision": "allow",
                  "updatedInput": {
                      **input_data["tool_input"],
                      "file_path": f"/sandbox{original_path}",
                  },
              }
          }
      return {}
  ```

  ```typescript TypeScript theme={null}
  const redirectToSandbox: HookCallback = async (input, toolUseID, { signal }) => {
    if (input.hook_event_name !== "PreToolUse") return {};

    const preInput = input as PreToolUseHookInput;
    const toolInput = preInput.tool_input as Record<string, unknown>;
    if (preInput.tool_name === "Write") {
      const originalPath = toolInput.file_path as string;
      return {
        hookSpecificOutput: {
          hookEventName: preInput.hook_event_name,
          permissionDecision: "allow",
          updatedInput: {
            ...toolInput,
            file_path: `/sandbox${originalPath}`
          }
        }
      };
    }
    return {};
  };
  ```
</CodeGroup>

<Note>
  使用 `updatedInput` 时，您还必须包括 `permissionDecision: 'allow'` 以自动批准修改的输入，或 `permissionDecision: 'ask'` 以将其显示给用户。使用 `'defer'` 时，`updatedInput` 会被忽略。始终返回新对象而不是改变原始 `tool_input`。
</Note>

<h3 id="add-context-and-block-a-tool">
  添加上下文并阻止工具
</h3>

此示例阻止写入 `/etc` 目录的操作，并向模型和用户解释原因：

* `permissionDecision: 'deny'` 停止工具调用。
* `permissionDecisionReason` 告诉模型原因，以便它避免重试。
* `systemMessage` 向用户显示发生了什么。

<CodeGroup>
  ```python Python theme={null}
  async def block_etc_writes(input_data, tool_use_id, context):
      file_path = input_data["tool_input"].get("file_path", "")

      if file_path.startswith("/etc"):
          return {
              # 顶级字段：显示给用户的消息
              "systemMessage": "Remember: system directories like /etc are protected.",
              # hookSpecificOutput：阻止操作
              "hookSpecificOutput": {
                  "hookEventName": input_data["hook_event_name"],
                  "permissionDecision": "deny",
                  "permissionDecisionReason": "Writing to /etc is not allowed",
              },
          }
      return {}
  ```

  ```typescript TypeScript theme={null}
  const blockEtcWrites: HookCallback = async (input, toolUseID, { signal }) => {
    const preInput = input as PreToolUseHookInput;
    const toolInput = preInput.tool_input as Record<string, unknown>;
    const filePath = toolInput?.file_path as string;

    if (filePath?.startsWith("/etc")) {
      return {
        // 顶级字段：显示给用户的消息
        systemMessage: "Remember: system directories like /etc are protected.",
        // hookSpecificOutput：阻止操作
        hookSpecificOutput: {
          hookEventName: preInput.hook_event_name,
          permissionDecision: "deny",
          permissionDecisionReason: "Writing to /etc is not allowed"
        }
      };
    }
    return {};
  };
  ```
</CodeGroup>

<h3 id="auto-approve-specific-tools">
  自动批准特定工具
</h3>

默认情况下，代理可能在使用某些工具前提示权限。此示例通过返回 `permissionDecision: 'allow'` 自动批准只读文件系统工具（Read、Glob、Grep），让它们无需用户确认即可运行，同时让所有其他工具受到正常权限检查：

<CodeGroup>
  ```python Python theme={null}
  async def auto_approve_read_only(input_data, tool_use_id, context):
      if input_data["hook_event_name"] != "PreToolUse":
          return {}

      read_only_tools = ["Read", "Glob", "Grep"]
      if input_data["tool_name"] in read_only_tools:
          return {
              "hookSpecificOutput": {
                  "hookEventName": input_data["hook_event_name"],
                  "permissionDecision": "allow",
                  "permissionDecisionReason": "Read-only tool auto-approved",
              }
          }
      return {}
  ```

  ```typescript TypeScript theme={null}
  const autoApproveReadOnly: HookCallback = async (input, toolUseID, { signal }) => {
    if (input.hook_event_name !== "PreToolUse") return {};

    const preInput = input as PreToolUseHookInput;
    const readOnlyTools = ["Read", "Glob", "Grep"];
    if (readOnlyTools.includes(preInput.tool_name)) {
      return {
        hookSpecificOutput: {
          hookEventName: preInput.hook_event_name,
          permissionDecision: "allow",
          permissionDecisionReason: "Read-only tool auto-approved"
        }
      };
    }
    return {};
  };
  ```
</CodeGroup>

<h3 id="register-multiple-hooks">
  注册多个 hooks
</h3>

当事件触发时，所有匹配的 hooks 并行运行。对于权限决策，最严格的结果获胜：单个 `deny` 会阻止工具调用，无论其他 hooks 返回什么。由于完成顺序是不确定的，请编写每个 hook 以独立行动，而不是依赖另一个 hook 已运行。

下面的示例为每个工具调用注册三个独立检查：

<CodeGroup>
  ```python Python theme={null}
  options = ClaudeAgentOptions(
      hooks={
          "PreToolUse": [
              HookMatcher(hooks=[authorization_check]),
              HookMatcher(hooks=[input_validator]),
              HookMatcher(hooks=[audit_logger]),
          ]
      }
  )
  ```

  ```typescript TypeScript theme={null}
  const options = {
    hooks: {
      PreToolUse: [
        { hooks: [authorizationCheck] },
        { hooks: [inputValidator] },
        { hooks: [auditLogger] }
      ]
    }
  };
  ```
</CodeGroup>

<h3 id="filter-with-multi-tool-matchers">
  使用多工具匹配器过滤
</h3>

使用多工具匹配器在相关工具间共享一个回调。此示例注册三个具有不同范围的匹配器：

* 管道分隔的精确列表（`Write|Edit|Delete`）仅对文件修改工具触发 `file_security_hook`。
* 正则表达式（`^mcp__`）对任何名称以 `mcp__` 开头的 MCP 工具触发 `mcp_audit_hook`。
* 省略的匹配器对每个工具调用（无论名称如何）触发 `global_logger`。

<CodeGroup>
  ```python Python theme={null}
  options = ClaudeAgentOptions(
      hooks={
          "PreToolUse": [
              # 匹配文件修改工具
              HookMatcher(matcher="Write|Edit|Delete", hooks=[file_security_hook]),
              # 匹配所有 MCP 工具
              HookMatcher(matcher="^mcp__", hooks=[mcp_audit_hook]),
              # 匹配所有内容（无匹配器）
              HookMatcher(hooks=[global_logger]),
          ]
      }
  )
  ```

  ```typescript TypeScript theme={null}
  const options = {
    hooks: {
      PreToolUse: [
        // 匹配文件修改工具
        { matcher: "Write|Edit|Delete", hooks: [fileSecurityHook] },

        // 匹配所有 MCP 工具
        { matcher: "^mcp__", hooks: [mcpAuditHook] },

        // 匹配所有内容（无匹配器）
        { hooks: [globalLogger] }
      ]
    }
  };
  ```
</CodeGroup>

<h3 id="track-subagent-activity">
  跟踪子代理活动
</h3>

使用 `SubagentStop` hooks 监控子代理何时完成其工作。请参阅 [TypeScript](/docs/zh-CN/agent-sdk/typescript#hookinput) 和 [Python](/docs/zh-CN/agent-sdk/python#hookinput) SDK 参考中的完整输入类型。此示例在每次子代理完成时记录摘要：

<CodeGroup>
  ```python Python theme={null}
  async def subagent_tracker(input_data, tool_use_id, context):
      # 子代理完成时记录子代理详细信息
      print(f"[SUBAGENT] Completed: {input_data['agent_id']}")
      print(f"  Transcript: {input_data['agent_transcript_path']}")
      print(f"  Tool use ID: {tool_use_id}")
      print(f"  Stop hook active: {input_data.get('stop_hook_active')}")
      return {}


  options = ClaudeAgentOptions(
      hooks={"SubagentStop": [HookMatcher(hooks=[subagent_tracker])]}
  )
  ```

  ```typescript TypeScript theme={null}
  import { HookCallback, SubagentStopHookInput } from "@anthropic-ai/claude-agent-sdk";

  const subagentTracker: HookCallback = async (input, toolUseID, { signal }) => {
    // 转换为 SubagentStopHookInput 以访问子代理特定字段
    const subInput = input as SubagentStopHookInput;

    // 子代理完成时记录子代理详细信息
    console.log(`[SUBAGENT] Completed: ${subInput.agent_id}`);
    console.log(`  Transcript: ${subInput.agent_transcript_path}`);
    console.log(`  Tool use ID: ${toolUseID}`);
    console.log(`  Stop hook active: ${subInput.stop_hook_active}`);
    return {};
  };

  const options = {
    hooks: {
      SubagentStop: [{ hooks: [subagentTracker] }]
    }
  };
  ```
</CodeGroup>

<h3 id="make-http-requests-from-hooks">
  从 hooks 发出 HTTP 请求
</h3>

Hooks 可以执行异步操作，如 HTTP 请求。在您的 hook 内捕获错误，而不是让它们传播，因为未处理的异常可能会中断代理。

此示例在每个工具完成后发送 webhook，记录哪个工具运行以及何时运行。hook 捕获错误，以便失败的 webhook 不会中断代理：

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  import json
  import urllib.request
  from datetime import datetime


  def _send_webhook(tool_name):
      """同步辅助函数，将工具使用数据 POST 到外部 webhook。"""
      data = json.dumps(
          {
              "tool": tool_name,
              "timestamp": datetime.now().isoformat(),
          }
      ).encode()
      req = urllib.request.Request(
          "https://api.example.com/webhook",
          data=data,
          headers={"Content-Type": "application/json"},
          method="POST",
      )
      urllib.request.urlopen(req)


  async def webhook_notifier(input_data, tool_use_id, context):
      # 仅在工具完成后触发（PostToolUse），而不是之前
      if input_data["hook_event_name"] != "PostToolUse":
          return {}

      try:
          # 在线程中运行阻塞 HTTP 调用以避免阻塞事件循环
          await asyncio.to_thread(_send_webhook, input_data["tool_name"])
      except Exception as e:
          # 记录错误但不抛出。失败的 webhook 不应停止代理
          print(f"Webhook request failed: {e}")

      return {}
  ```

  ```typescript TypeScript theme={null}
  import { query, HookCallback, PostToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

  const webhookNotifier: HookCallback = async (input, toolUseID, { signal }) => {
    // 仅在工具完成后触发（PostToolUse），而不是之前
    if (input.hook_event_name !== "PostToolUse") return {};

    try {
      await fetch("https://api.example.com/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: (input as PostToolUseHookInput).tool_name,
          timestamp: new Date().toISOString()
        }),
        // 传递 signal 以便在 hook 超时时请求取消
        signal
      });
    } catch (error) {
      // 分别处理取消和其他错误
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Webhook request cancelled");
      }
      // 不重新抛出。失败的 webhook 不应停止代理
    }

    return {};
  };

  // 注册为 PostToolUse hook
  for await (const message of query({
    prompt: "Refactor the auth module",
    options: {
      hooks: {
        PostToolUse: [{ hooks: [webhookNotifier] }]
      }
    }
  })) {
    console.log(message);
  }
  ```
</CodeGroup>

<h3 id="forward-notifications-to-slack">
  将通知转发到 Slack
</h3>

使用 `Notification` hooks 从代理接收系统通知并将其转发到外部服务。通知针对事件类型触发，例如：

* `permission_prompt` 当 Claude 需要权限时
* `idle_prompt` 当 Claude 等待输入时
* `auth_success` 当身份验证完成时
* `elicitation_dialog`、`elicitation_complete` 和 `elicitation_response` 用于用户提示引导流程

每个通知包括一个带有人类可读描述的 `message` 字段，以及可选的 `title`。

此示例将每个通知转发到 Slack 频道。它需要一个 [Slack 传入 webhook URL](https://api.slack.com/messaging/webhooks)，您可以通过将应用添加到您的 Slack 工作区并启用传入 webhooks 来创建：

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  import json
  import urllib.request

  from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, HookMatcher


  def _send_slack_notification(message):
      """同步辅助函数，通过传入 webhook 向 Slack 发送消息。"""
      data = json.dumps({"text": f"Agent status: {message}"}).encode()
      req = urllib.request.Request(
          "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
          data=data,
          headers={"Content-Type": "application/json"},
          method="POST",
      )
      urllib.request.urlopen(req)


  async def notification_handler(input_data, tool_use_id, context):
      try:
          # 在线程中运行阻塞 HTTP 调用以避免阻塞事件循环
          await asyncio.to_thread(_send_slack_notification, input_data.get("message", ""))
      except Exception as e:
          print(f"Failed to send notification: {e}")

      # 返回空对象。通知 hooks 不修改代理行为
      return {}


  async def main():
      options = ClaudeAgentOptions(
          hooks={
              # 为通知事件注册 hook（不需要匹配器）
              "Notification": [HookMatcher(hooks=[notification_handler])],
          },
      )

      async with ClaudeSDKClient(options=options) as client:
          await client.query("Analyze this codebase")
          async for message in client.receive_response():
              print(message)


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query, HookCallback, NotificationHookInput } from "@anthropic-ai/claude-agent-sdk";

  // 定义一个将通知发送到 Slack 的 hook 回调
  const notificationHandler: HookCallback = async (input, toolUseID, { signal }) => {
    // 转换为 NotificationHookInput 以访问消息字段
    const notification = input as NotificationHookInput;

    try {
      // 将通知消息 POST 到 Slack 传入 webhook
      await fetch("https://hooks.slack.com/services/YOUR/WEBHOOK/URL", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Agent status: ${notification.message}`
        }),
        // 传递 signal 以便在 hook 超时时请求取消
        signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Notification cancelled");
      } else {
        console.error("Failed to send notification:", error);
      }
    }

    // 返回空对象。通知 hooks 不修改代理行为
    return {};
  };

  // 为通知事件注册 hook（不需要匹配器）
  for await (const message of query({
    prompt: "Analyze this codebase",
    options: {
      hooks: {
        Notification: [{ hooks: [notificationHandler] }]
      }
    }
  })) {
    console.log(message);
  }
  ```
</CodeGroup>

<h2 id="fix-common-issues">
  修复常见问题
</h2>

<h3 id="hook-not-firing">
  Hook 未触发
</h3>

* 验证 hook 事件名称正确且区分大小写（`PreToolUse`，而不是 `preToolUse`）
* 检查您的匹配器模式是否与工具名称完全匹配
* 确保 hook 在 `options.hooks` 中的正确事件类型下
* 对于支持匹配器的非工具 hooks，如 `Notification` 和 `SubagentStop`，匹配器匹配不同的字段，而 `Stop` 完全忽略匹配器（请参阅[匹配器模式](/docs/zh-CN/hooks#matcher-patterns)）
* 当代理达到 [`max_turns`](/docs/zh-CN/agent-sdk/python#claudeagentoptions) 限制时，hooks 可能不会触发，因为会话在 hooks 可以执行前结束

<h3 id="matcher-not-filtering-as-expected">
  匹配器未按预期过滤
</h3>

匹配器仅匹配工具名称，而不是文件路径或其他参数。要按文件路径过滤，请在您的 hook 内检查 `tool_input.file_path`：

```typescript theme={null}
const myHook: HookCallback = async (input, toolUseID, { signal }) => {
  const preInput = input as PreToolUseHookInput;
  const toolInput = preInput.tool_input as Record<string, unknown>;
  const filePath = toolInput?.file_path as string;
  if (!filePath?.endsWith(".md")) return {}; // 跳过非 markdown 文件
  // 处理 markdown 文件...
  return {};
};
```

<h3 id="hook-timeout">
  Hook 超时
</h3>

* 增加 `HookMatcher` 配置中的 `timeout` 值
* 在 TypeScript 中使用第三个回调参数中的 `AbortSignal` 来优雅地处理取消

超过超时时间的 `UserPromptSubmit` 或 [`UserPromptExpansion`](/docs/zh-CN/hooks#userpromptexpansion) 回调会用超时消息阻止该提示，会话继续进行。在回调待处理时中断查询会取消待处理的工具调用。在 v2.1.208 之前，这些事件上的回调超时会以 `error_during_execution` 结束查询，在待处理的 `PreToolUse` 回调期间中断可能会让工具调用继续进行。

<h3 id="tool-blocked-unexpectedly">
  工具意外被阻止
</h3>

* 检查所有 `PreToolUse` hooks 是否返回 `permissionDecision: 'deny'`
* 向您的 hooks 添加日志记录以查看它们返回的 `permissionDecisionReason`
* 验证匹配器模式不会太宽泛：空匹配器匹配所有工具

<h3 id="modified-input-not-applied">
  修改的输入未应用
</h3>

* 确保 `updatedInput` 在 `hookSpecificOutput` 内，而不是在顶级：

  ```typescript theme={null}
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: { command: "new command" }
    }
  };
  ```

* 返回 `permissionDecision: 'allow'` 以自动批准修改的输入，或返回 `'ask'` 以向用户显示以供批准

* 在 `hookSpecificOutput` 中包括 `hookEventName` 以识别输出针对的 hook 类型

<h3 id="session-hooks-not-available-in-python">
  Python 中不可用会话 hooks
</h3>

`SessionStart` 和 `SessionEnd` 可以在 TypeScript 中注册为 SDK 回调 hooks，但在 Python SDK 中不可用，因为其 `HookEvent` 类型省略了它们。在 Python 中，它们仅作为[shell 命令 hooks](/docs/zh-CN/hooks#hook-events)在设置文件中定义，例如 `.claude/settings.json`。要从您的 SDK 应用程序加载 shell 命令 hooks，请使用 [`setting_sources`](/docs/zh-CN/agent-sdk/python#settingsource) 或 [`settingSources`](/docs/zh-CN/agent-sdk/typescript#settingsource) 包括适当的设置源：

<CodeGroup>
  ```python Python theme={null}
  options = ClaudeAgentOptions(
      setting_sources=["project"],  # 加载 .claude/settings.json 包括 hooks
  )
  ```

  ```typescript TypeScript theme={null}
  const options = {
    settingSources: ["project"] // 加载 .claude/settings.json 包括 hooks
  };
  ```
</CodeGroup>

要改为运行初始化逻辑作为 Python SDK 回调，请使用 `client.receive_response()` 的第一条消息作为您的触发器。

<h3 id="subagent-permission-prompts-multiplying">
  子代理权限提示倍增
</h3>

生成多个子代理时，每个子代理可能会单独请求权限。子代理不会自动继承父代理权限。要避免重复提示，请使用 `PreToolUse` hooks 自动批准特定工具，或配置适用于子代理会话的权限规则。

<h3 id="recursive-hook-loops-with-subagents">
  子代理的递归 hook 循环
</h3>

生成子代理的 `UserPromptSubmit` hook 如果这些子代理触发相同的 hook，可能会创建无限循环。要防止这种情况：

* 在生成子代理前检查 hook 输入中的子代理指示符
* 使用共享变量或会话状态来跟踪您是否已在子代理内
* 将 hooks 范围限制为仅对顶级代理会话运行

<h3 id="systemmessage-not-appearing-in-output">
  systemMessage 未出现在输出中
</h3>

`systemMessage` 字段向用户显示消息，而不是模型。默认情况下，SDK 仅在消息流中为 `SessionStart` 和 `Setup` hooks 显示 hook 输出，因此除非您设置 `includeHookEvents`（Python 中为 `include_hook_events`），否则来自任何其他 hook 事件的消息不会出现。要改为将上下文传递给模型，请返回 [`additionalContext`](/docs/zh-CN/hooks#add-context-for-claude)。

如果您需要可靠地将 hook 决定呈现给您的应用程序，请单独记录它们或使用专用输出通道。

<h2 id="related-resources">
  相关资源
</h2>

* [Claude Code hooks 参考](/docs/zh-CN/hooks)：完整的 JSON 输入/输出架构、事件文档和匹配器模式
* [Claude Code hooks 指南](/docs/zh-CN/hooks-guide)：shell 命令 hook 示例和演练
* [TypeScript SDK 参考](/docs/zh-CN/agent-sdk/typescript)：hook 类型、输入/输出定义和配置选项
* [Python SDK 参考](/docs/zh-CN/agent-sdk/python)：hook 类型、输入/输出定义和配置选项
* [权限](/docs/zh-CN/agent-sdk/permissions)：控制您的代理可以做什么
* [自定义工具](/docs/zh-CN/agent-sdk/custom-tools)：构建工具以扩展代理功能
