> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 配置权限

> 使用权限模式、hooks 和声明式允许/拒绝规则来控制您的代理如何使用工具。

Claude Agent SDK 提供权限控制来管理 Claude 如何使用工具。使用权限模式和规则来定义自动允许的内容，以及使用 [`canUseTool` 回调](/docs/zh-CN/agent-sdk/user-input) 在运行时处理其他所有情况。

<Note>
  本页面涵盖权限模式和规则。要构建交互式批准流程，其中用户在运行时批准或拒绝工具请求，请参阅 [处理批准和用户输入](/docs/zh-CN/agent-sdk/user-input)。
</Note>

<h2 id="how-permissions-are-evaluated">
  权限如何被评估
</h2>

当 Claude 请求一个工具时，SDK 按以下顺序检查权限：

<Steps>
  <Step title="Hooks">
    首先运行 [hooks](/docs/zh-CN/agent-sdk/hooks)。一个 hook 可以直接拒绝调用或将其传递下去。返回 `allow` 的 hook 不会跳过下面的拒绝和询问规则；无论 hook 结果如何，这些规则都会被评估。
  </Step>

  <Step title="拒绝规则">
    检查 `deny` 规则（来自 `disallowed_tools` 和 [settings.json](/docs/zh-CN/settings#permission-settings)）。如果拒绝规则匹配，工具被阻止，即使在 `bypassPermissions` 模式下也是如此。裸名称拒绝规则（如 `Bash`）在此评估开始之前将工具从 Claude 的上下文中移除，因此只有作用域规则（如 `Bash(rm *)`）在此步骤中被检查。
  </Step>

  <Step title="询问规则">
    检查来自 [settings.json](/docs/zh-CN/settings#permission-settings) 的 `ask` 规则。如果询问规则匹配，调用会传递到您的 [`canUseTool` 回调](/docs/zh-CN/agent-sdk/user-input) 以获得确认，即使在 `bypassPermissions` 模式下也是如此。

    需要用户交互的工具行为相同：`AskUserQuestion` 和 MCP 工具，其服务器设置 [`_meta["anthropic/requiresUserInteraction"]`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 总是传递到回调，即使当允许规则匹配时。在 `dontAsk` 模式下，两种情况都被拒绝，因为该模式从不提示。MCP 注解需要 Claude Code v2.1.199 或更高版本。

    [claude.ai connector](/docs/zh-CN/mcp#organization-controls-on-connector-tools) 工具，您的组织已设置为 `ask` 也会在此步骤离开流程。每个调用都会传递到回调，即使在 `bypassPermissions` 模式下，即使当允许规则匹配时。回调接收原因 `Your organization requires approval for this tool`。在 `dontAsk` 模式下，调用被拒绝，因为该模式从不提示。
  </Step>

  <Step title="权限模式">
    应用活跃的 [权限模式](#permission-modes)。`bypassPermissions` 批准到达此步骤的所有内容。`acceptEdits` 批准文件操作。`plan` 将文件编辑和 shell 写入工具路由到您的 `canUseTool` 回调，无论允许规则如何，因此在规划时写入操作无法自动批准。其他模式会继续进行。
  </Step>

  <Step title="允许规则">
    检查 `allow` 规则（来自 `allowed_tools` 和 settings.json）。如果规则匹配，工具被批准。
  </Step>

  <Step title="canUseTool 回调">
    如果上述任何步骤都未解决，调用您的 [`canUseTool` 回调](/docs/zh-CN/agent-sdk/user-input) 以获得决定。在 `dontAsk` 模式下，此步骤被跳过，工具被拒绝。
  </Step>
</Steps>

<img src="https://mintcdn.com/claude-code/jYgs7qigNjO1Badj/images/agent-sdk/permissions-flow.svg?fit=max&auto=format&n=jYgs7qigNjO1Badj&q=85&s=c771ad9085b1277d3708027a49c744bc" alt="六步权限评估流程图，与上述步骤相匹配：工具请求通过 hooks、拒绝规则、询问规则、权限模式、允许规则和 canUseTool。Hooks、拒绝规则和 canUseTool 可以路由到阻止；权限模式绕过、允许规则和 canUseTool 可以路由到执行；询问规则路由到 canUseTool。" width="1180" height="260" data-path="images/agent-sdk/permissions-flow.svg" />

从 v2.1.198 开始，如果您传递一个 `canUseTool` 回调，该评估顺序永远无法到达，TypeScript SDK 在构造查询时会发出一次 Node.js 进程警告。警告的代码是 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`。两种配置会触发它：

* `permissionMode: 'bypassPermissions'`，它自动批准到达权限模式步骤的每个调用
* 每个裸 `allowedTools` 条目，如 `"Read"`，它在咨询回调之前自动批准整个工具

带有说明符的条目（如 `Bash(ls *)`）和 `acceptEdits` 模式不会触发它，来自设置文件的允许规则对检查不可见。

使用 `process.on('warning', ...)` 监听并匹配代码以记录或抑制它。要无论模式和规则如何都控制每个工具调用，请改用 [`PreToolUse` hook](/docs/zh-CN/agent-sdk/hooks)。

本页面重点关注 **允许和拒绝规则** 以及 **权限模式**。对于其他步骤：

* **Hooks：** 运行自定义代码以允许、拒绝或修改工具请求。请参阅 [使用 hooks 控制执行](/docs/zh-CN/agent-sdk/hooks)。
* **canUseTool 回调：** 在运行时提示用户批准，当没有更早的步骤解决调用时。请参阅 [处理批准和用户输入](/docs/zh-CN/agent-sdk/user-input)。

<h2 id="allow-and-deny-rules">
  允许和拒绝规则
</h2>

`allowed_tools` 和 `disallowed_tools`（TypeScript：`allowedTools` / `disallowedTools`）向上面评估流程中的允许和拒绝规则列表添加条目。允许规则仅影响批准：未在 `allowed_tools` 中列出的工具仍然可供 Claude 使用，并继续进行权限模式。拒绝规则的行为取决于它们是命名工具还是在工具内范围化模式。

| 选项                                | 效果                                                                                  |
| :-------------------------------- | :---------------------------------------------------------------------------------- |
| `allowed_tools=["Read", "Grep"]`  | `Read` 和 `Grep` 被自动批准。此处未列出的工具仍然存在并继续进行权限模式和 `canUseTool`。                          |
| `disallowed_tools=["Bash"]`       | `Bash` 工具定义从请求中移除。Claude 看不到该工具，无法尝试它。                                              |
| `disallowed_tools=["Bash(rm *)"]` | `Bash` 保持可用。与 `rm *` 匹配的调用在每个权限模式中都被拒绝，包括 `bypassPermissions`。其他 `Bash` 调用继续进行权限模式。 |
| `disallowed_tools=["*"]`          | 每个工具定义都从请求中移除。工具名称通配符在拒绝规则中受支持：`"*"` 匹配每个工具，`"mcp__*"` 匹配所有服务器中的每个 MCP 工具。          |

允许规则仅在字面 `mcp__<server>__` 前缀之后接受工具名称通配符。服务器段必须无通配符，以便规则命名您配置的特定服务器：`mcp__puppeteer__*` 匹配来自 `puppeteer` 服务器的每个工具，`mcp__github__get_*` 匹配其 `get_` 工具。未锚定的条目如 `allowed_tools=["*"]` 或 `allowed_tools=["mcp__*"]` 被忽略并显示启动警告，不会自动批准任何内容。

范围化规则用于 `Read` 和 `Edit` 采用路径模式。`Edit(path)` 规则管理所有写入文件的内置工具，包括 `Write` 和 `NotebookEdit`；`Write(path)` 规则永远不会被文件权限检查匹配。

使用 `//path` 表示绝对文件系统路径：`Edit(//secrets/**)` 的拒绝规则阻止在磁盘上 `/secrets` 下任何位置的写入。使用单个前导斜杠，`Edit(/secrets/**)` 在规则的源处锚定。对于通过 `allowed_tools` 或 `disallowed_tools` 传递的规则，这意味着会话的工作目录，因此规则不会阻止磁盘上的 `/secrets`。请参阅 [Read 和 Edit 规则](/docs/zh-CN/permissions#read-and-edit) 了解四种锚定形式以及来自设置文件的规则如何解析。

<Warning>
  **自动批准的工具永远不会到达 `canUseTool`。** 在任何早期步骤中批准的工具调用，通过 `acceptEdits` 或 `bypassPermissions`，或通过允许规则，会跳过您的 `canUseTool` 回调，因此您在那里放置的权限检查对该工具被静默绕过。`AskUserQuestion`、标记有 [`_meta["anthropic/requiresUserInteraction"]`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具，以及连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools) 仍然到达回调，即使允许规则匹配。

  覆盖范围取决于条目的形式：像 `Read` 或 `mcp__github__get_issue` 这样的裸名称自动批准对该工具的每个调用，而像 `Bash(ls *)` 这样的范围化规则仅自动批准匹配的调用，其他 `Bash` 调用仍然继续进行回调。对于必须在每个工具调用上运行的检查，请使用 [`PreToolUse` hook](/docs/zh-CN/agent-sdk/hooks)：hooks 在每个其他步骤之前运行，hook 拒绝甚至在 `bypassPermissions` 模式中也适用。
</Warning>

对于锁定的代理，将 `allowedTools` 与 `permissionMode: "dontAsk"` 配对。列出的工具被批准，除了上面警告中的始终提示工具；其他任何内容都被直接拒绝，而不是提示：

```typescript theme={null}
const options = {
  allowedTools: ["Read", "Glob", "Grep"],
  permissionMode: "dontAsk"
};
```

<Warning>
  **`allowed_tools` 不约束 `bypassPermissions`。** `allowed_tools` 仅预批准您列出的工具。未列出的工具不与任何允许规则匹配，并继续进行权限模式，其中 `bypassPermissions` 批准它们。设置 `allowed_tools=["Read"]` 与 `permission_mode="bypassPermissions"` 一起仍然批准每个工具，包括 `Bash`、`Write` 和 `Edit`。如果您需要 `bypassPermissions` 但想要阻止特定工具，请使用 `disallowed_tools`。
</Warning>

您也可以在 `.claude/settings.json` 中声明式地配置允许、拒绝和询问规则。当启用 `project` 设置源时，这些规则被读取，默认 `query()` 选项就是这样。如果您显式设置 `setting_sources`（TypeScript：`settingSources`），请包含 `"project"` 以使其应用。请参阅 [权限设置](/docs/zh-CN/settings#permission-settings) 了解规则语法。

<h2 id="permission-modes">
  权限模式
</h2>

权限模式提供对 Claude 如何使用工具的全局控制。您可以在调用 `query()` 时设置权限模式，或在流式会话期间动态更改它。

<h3 id="available-modes">
  可用模式
</h3>

SDK 支持这些权限模式：

| 模式                  | 描述       | 工具行为                                                                                                                                                       |
| :------------------ | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`           | 标准权限行为   | 无自动批准；不匹配的工具触发您的 `canUseTool` 回调                                                                                                                           |
| `dontAsk`           | 拒绝而不是提示  | 任何未被 `allowed_tools` 或规则预批准的内容都被拒绝；连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和需要用户交互的工具即使您已预批准它们也被拒绝。`canUseTool` 永远不会被调用   |
| `acceptEdits`       | 自动接受文件编辑 | 文件编辑和 [文件系统操作](#accept-edits-mode-acceptedits)（`mkdir`、`rm`、`mv` 等）被自动批准                                                                                   |
| `bypassPermissions` | 绕过权限检查   | 工具运行而无需权限提示，除了显式 [`ask` 规则](#how-permissions-are-evaluated)匹配的工具、连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和需要用户交互的工具（谨慎使用） |
| `plan`              | 规划模式     | Claude 在不编辑源文件的情况下探索和规划；文件编辑永远不会自动批准，并通过您的 `canUseTool` 回调提示                                                                                               |
| `auto`              | 模型分类批准   | 模型分类器批准或拒绝每个工具调用。请参阅 [Auto 模式](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode) 了解可用性                                                             |

<Warning>
  **子代理继承：** 当父代理使用 `bypassPermissions`、`acceptEdits` 或 `auto` 时，所有子代理继承该模式，并且不能按子代理覆盖。子代理可能有不同的系统提示和行为约束较少，比您的主代理，所以继承 `bypassPermissions` 授予它们完整的、自主的系统访问权限。显式 [`ask` 规则](#how-permissions-are-evaluated)、连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和需要用户交互的工具仍然会强制提示。
</Warning>

<h3 id="set-permission-mode">
  设置权限模式
</h3>

您可以在启动查询时设置权限模式一次，或在会话活跃时动态更改它。

<Tabs>
  <Tab title="在查询时">
    在创建查询时传递 `permission_mode`（Python）或 `permissionMode`（TypeScript）。此模式应用于整个会话，除非动态更改。

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from claude_agent_sdk import query, ClaudeAgentOptions


      async def main():
          async for message in query(
              prompt="Help me refactor this code",
              options=ClaudeAgentOptions(
                  permission_mode="default",  # 在此处设置模式
              ),
          ):
              if hasattr(message, "result"):
                  print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query } from "@anthropic-ai/claude-agent-sdk";

      async function main() {
        for await (const message of query({
          prompt: "Help me refactor this code",
          options: {
            permissionMode: "default" // 在此处设置模式
          }
        })) {
          if ("result" in message) {
            console.log(message.result);
          }
        }
      }

      main();
      ```
    </CodeGroup>
  </Tab>

  <Tab title="在流式传输期间">
    调用 `set_permission_mode()`（Python）或 `setPermissionMode()`（TypeScript）以在会话中期更改模式。新模式立即对所有后续工具请求生效。这让您可以从限制性开始，随着信任建立而放松权限，例如在审查 Claude 的初始方法后切换到 `acceptEdits`。

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions


      async def main():
          async with ClaudeSDKClient(
              options=ClaudeAgentOptions(
                  permission_mode="default",  # 以默认模式开始
              )
          ) as client:
              await client.query("Help me refactor this code")

              # 在会话中期动态更改模式
              await client.set_permission_mode("acceptEdits")

              # 使用新权限模式处理消息
              async for message in client.receive_response():
                  if hasattr(message, "result"):
                      print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query } from "@anthropic-ai/claude-agent-sdk";

      async function main() {
        const q = query({
          prompt: "Help me refactor this code",
          options: {
            permissionMode: "default" // 以默认模式开始
          }
        });

        // 在会话中期动态更改模式
        await q.setPermissionMode("acceptEdits");

        // 使用新权限模式处理消息
        for await (const message of q) {
          if ("result" in message) {
            console.log(message.result);
          }
        }
      }

      main();
      ```
    </CodeGroup>
  </Tab>
</Tabs>

<h3 id="mode-details">
  模式详情
</h3>

<h4 id="accept-edits-mode-acceptedits">
  接受编辑模式（`acceptEdits`）
</h4>

自动批准文件操作，以便 Claude 可以编辑代码而无需提示。其他工具（如不是文件系统操作的 Bash 命令）仍然需要正常权限。

**自动批准的操作：**

* 文件编辑（Edit、Write 工具）
* 文件系统命令：`mkdir`、`touch`、`rm`、`rmdir`、`mv`、`cp`、`sed`

两者都仅适用于工作目录或 `additionalDirectories` 内的路径。该范围外的路径和对受保护路径的写入仍然会提示。

**使用时机：** 您信任 Claude 的编辑并希望更快的迭代，例如在原型设计期间或在隔离目录中工作时。

<h4 id="don’t-ask-mode-dontask">
  不询问模式（`dontAsk`）
</h4>

将任何权限提示转换为拒绝。由 `allowed_tools`、`settings.json` 允许规则或作为 hook 运行的工具正常运行。连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和需要用户交互的工具即使允许规则匹配也被拒绝。其他所有内容都被拒绝，无需调用 `canUseTool`。

**使用时机：** 您想要为无头代理提供固定的、明确的工具表面，并且更喜欢硬拒绝而不是默默依赖 `canUseTool` 不存在。

<h4 id="bypass-permissions-mode-bypasspermissions">
  绕过权限模式（`bypassPermissions`）
</h4>

自动批准所有工具使用而无需提示。Hooks 仍然执行，如果需要可以阻止操作。

<Warning>
  谨慎使用。Claude 在此模式下具有完整的系统访问权限。仅在您信任所有可能操作的受控环境中使用。

  `allowed_tools` 不约束此模式。每个工具都被批准，而不仅仅是您列出的工具。拒绝规则（`disallowed_tools`）、显式 `ask` 规则和 hooks 在模式检查之前被评估，仍然可以阻止工具。连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和需要用户交互的工具仍然会通过您的 `canUseTool` 回调。
</Warning>

<h4 id="plan-mode-plan">
  规划模式（`plan`）
</h4>

Claude 探索代码库并生成计划而不编辑您的源文件。只读工具在默认模式下运行。文件编辑在规划模式下永远不会自动批准，即使允许规则匹配。它们通过您的 `canUseTool` 回调提示。Claude 可能使用 `AskUserQuestion` 在最终确定计划之前澄清需求。请参阅 [处理批准和用户输入](/docs/zh-CN/agent-sdk/user-input#handle-clarifying-questions) 以处理这些提示。

**使用时机：** 您想要 Claude 提议更改而不执行它们，例如在代码审查期间或当您需要在进行更改之前批准更改时。

<h2 id="related-resources">
  相关资源
</h2>

对于权限评估流程中的其他步骤：

* [处理批准和用户输入](/docs/zh-CN/agent-sdk/user-input)：交互式批准提示和澄清问题
* [Hooks 指南](/docs/zh-CN/agent-sdk/hooks)：在代理生命周期中的关键点运行自定义代码
* [权限规则](/docs/zh-CN/settings#permission-settings)：`settings.json` 中的声明式允许/拒绝规则
