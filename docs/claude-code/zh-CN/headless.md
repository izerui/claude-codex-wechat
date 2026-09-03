> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 以编程方式运行 Claude Code

> 使用 Agent SDK 从 CLI、Python 或 TypeScript 以编程方式运行 Claude Code。

[Agent SDK](/docs/zh-CN/agent-sdk/overview) 为您提供了与 Claude Code 相同的工具、agent 循环和上下文管理。它可作为 CLI 用于脚本和 CI/CD，或作为 [Python](/docs/zh-CN/agent-sdk/python) 和 [TypeScript](/docs/zh-CN/agent-sdk/typescript) 包供完整的编程控制。

要以非交互模式运行 Claude Code，请使用 `-p` 传递您的提示和任何 [CLI 选项](/docs/zh-CN/cli-reference)：

```bash theme={null}
claude -p "Find and fix the bug in auth.py" --allowedTools "Read,Edit,Bash"
```

本页面涵盖通过 CLI (`claude -p`) 使用 Agent SDK。对于具有结构化输出、工具批准回调和原生消息对象的 Python 和 TypeScript SDK 包，请参阅 [完整 Agent SDK 文档](/docs/zh-CN/agent-sdk/overview)。

<h2 id="basic-usage">
  基本用法
</h2>

将 `-p`（或 `--print`）标志添加到任何 `claude` 命令以非交互方式运行它。所有 [CLI 选项](/docs/zh-CN/cli-reference) 都适用于 `-p`，包括：

* `--continue` 用于 [继续对话](#continue-conversations)
* `--allowedTools` 用于 [自动批准工具](#auto-approve-tools)
* `--output-format` 用于 [获取结构化输出](#get-structured-output)

此示例询问 Claude 关于您的代码库的问题并打印响应：

```bash theme={null}
claude -p "What does the auth module do?"
```

<h3 id="start-faster-with-bare-mode">
  使用裸模式更快启动
</h3>

添加 `--bare` 以通过跳过 hooks、skills、plugins、MCP 服务器、自动内存和 CLAUDE.md 的自动发现来减少启动时间。没有它，`claude -p` 会加载交互式会话相同的 [上下文](/docs/zh-CN/how-claude-code-works#the-context-window)，包括在工作目录或 `~/.claude` 中配置的任何内容。

裸模式对于 CI 和脚本很有用，您需要在每台机器上获得相同的结果。队友的 `~/.claude` 中的 hook 或项目的 `.mcp.json` 中的 MCP 服务器不会运行，因为裸模式从不读取它们。只有您显式传递的标志才会生效。

此示例在裸模式下运行一次性摘要任务，并预先批准 Read 工具，以便调用完成而无需权限提示：

```bash theme={null}
claude --bare -p "Summarize this file" --allowedTools "Read"
```

在裸模式下，Claude 可以访问 Bash、文件读取和文件编辑工具。使用标志传递您需要的任何上下文：

| 要加载        | 使用                                                      |
| ---------- | ------------------------------------------------------- |
| 系统提示添加     | `--append-system-prompt`, `--append-system-prompt-file` |
| 设置         | `--settings <file-or-json>`                             |
| MCP 服务器    | `--mcp-config <file-or-json>`                           |
| 自定义 agents | `--agents <json>`                                       |
| 插件         | `--plugin-dir <path>`, `--plugin-url <url>`             |

裸模式跳过 OAuth 和钥匙链读取。Anthropic 身份验证必须来自 `ANTHROPIC_API_KEY` 或传递给 `--settings` 的 JSON 中的 `apiKeyHelper`。Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 使用其常规提供商凭证。

<Note>
  `--bare` 是脚本和 SDK 调用的推荐模式，将在未来版本中成为 `-p` 的默认值。
</Note>

<h3 id="background-tasks-at-exit">
  退出时的后台任务
</h3>

如果 Claude 在 `claude -p` 运行期间启动 [后台 Bash 任务](/docs/zh-CN/tools-reference#bash-tool-behavior)，例如开发服务器或监视构建，该任务将在 Claude 返回其最终结果并关闭 stdin 后约五秒钟被终止。宽限期允许在结果之后立即完成的任务仍然能够传递其输出。在 v2.1.163 之前，永不退出的后台进程会无限期地保持 `claude -p` 调用打开。

后台 [subagents](/docs/zh-CN/sub-agents) 和工作流程不受五秒宽限期的限制，因为它们的结果是最终输出的一部分，所以 `claude -p` 会等待它们完成。从 v2.1.182 开始，该等待默认上限为十分钟，以便卡住的后台 agent 无法无限期地保持进程打开。使用 [`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`](/docs/zh-CN/env-vars) 调整上限，或将其设置为 `0` 以无限制地等待。

<h2 id="examples">
  示例
</h2>

这些示例突出了常见的 CLI 模式。对于 CI 和其他脚本调用，添加 [`--bare`](#start-faster-with-bare-mode) 以便它们不会选择本地配置的任何内容。

<h3 id="pipe-data-through-claude">
  通过 Claude 管道传输数据
</h3>

非交互模式读取 stdin，因此您可以像任何其他命令行工具一样管道传输数据并重定向响应。

此示例将构建日志管道传输到 Claude 并将说明写入文件：

```bash theme={null}
cat build-error.txt | claude -p 'concisely explain the root cause of this build error' > output.txt
```

使用 `--output-format json`，响应有效负载包括 `total_cost_usd` 和按模型的成本分解，因此脚本调用者可以跟踪每次调用的支出，而无需查询 [使用情况仪表板](/docs/zh-CN/costs)。

<Note>
  从 Claude Code v2.1.128 开始，管道 stdin 的上限为 10MB。如果超过上限，Claude Code 会以清晰的错误和非零状态退出。要处理更大的输入，请将内容写入文件并在提示中引用文件路径，而不是管道传输它。
</Note>

<h3 id="add-claude-to-a-build-script">
  将 Claude 添加到构建脚本
</h3>

您可以在脚本中包装非交互调用，以将 Claude 用作项目特定的 linter 或审查者。

此 `package.json` 脚本将针对 `main` 的 diff 管道传输到 Claude，并要求它报告拼写错误。管道传输 diff 意味着 Claude 不需要 Bash 权限来读取它，转义的双引号使脚本可移植到 Windows：

```json theme={null}
{
  "scripts": {
    "lint:claude": "git diff main | claude -p \"you are a typo linter. for each typo in this diff, report filename:line on one line and the issue on the next. return nothing else.\""
  }
}
```

<h3 id="get-structured-output">
  获取结构化输出
</h3>

使用 `--output-format` 控制响应的返回方式：

* `text`（默认）：纯文本输出
* `json`：包含结果、会话 ID 和元数据的结构化 JSON
* `stream-json`：用于实时流式传输的换行符分隔的 JSON

此示例以 JSON 格式返回项目摘要以及会话元数据，文本结果在 `result` 字段中：

```bash theme={null}
claude -p "Summarize this project" --output-format json
```

要获得符合特定架构的输出，请使用 `--output-format json` 与 `--json-schema` 和 [JSON Schema](https://json-schema.org/) 定义。响应包括关于请求的元数据（会话 ID、使用情况等），结构化输出在 `structured_output` 字段中。

此示例从 auth.py 中提取函数名称并将其作为字符串数组返回：

```bash theme={null}
claude -p "Extract the main function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}'
```

如果该值不是有效的 JSON Schema，`claude` 会以 `Error: --json-schema is not a valid JSON Schema` 退出，后跟验证器的诊断。Claude Code 接受使用 `format` 关键字的架构，例如 `"format": "email"`，但将 `format` 视为注释，不强制执行它。在 v2.1.205 之前，Claude Code 会静默忽略无效的架构并返回非结构化文本，并将任何包含 `format` 的架构视为无效。

<Tip>
  使用 [jq](https://jqlang.github.io/jq/) 之类的工具来解析响应并提取特定字段：

  ```bash theme={null}
  # Extract the text result
  claude -p "Summarize this project" --output-format json | jq -r '.result'

  # Extract structured output
  claude -p "Extract function names from auth.py" \
    --output-format json \
    --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}' \
    | jq '.structured_output'
  ```
</Tip>

<h3 id="stream-responses">
  流式传输响应
</h3>

使用 `--output-format stream-json` 与 `--verbose` 和 `--include-partial-messages` 来接收生成的令牌。每一行都是代表一个事件的 JSON 对象：

```bash theme={null}
claude -p "Explain recursion" --output-format stream-json --verbose --include-partial-messages
```

流的最后一行是包含最终响应文本、成本和会话元数据的 `result` 消息。在 v2.1.208 之前，管道传输大型响应可能会截断最后一行并省略 `result` 消息。

以下示例使用 [jq](https://jqlang.github.io/jq/) 来过滤文本增量并仅显示流式文本。`-r` 标志输出原始字符串（无引号），`-j` 不带换行符连接，以便令牌连续流式传输：

```bash theme={null}
claude -p "Write a poem" --output-format stream-json --verbose --include-partial-messages | \
  jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'
```

当 API 请求因可重试错误而失败时，Claude Code 在重试前发出 `system/api_retry` 事件。您可以使用此来显示重试进度或实现自定义退避逻辑。

| 字段               | 类型            | 描述                                                                                                                                                                                |
| ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`           | `"system"`    | 消息类型                                                                                                                                                                              |
| `subtype`        | `"api_retry"` | 将其标识为重试事件                                                                                                                                                                         |
| `attempt`        | 整数            | 当前尝试次数，从 1 开始                                                                                                                                                                     |
| `max_retries`    | 整数            | 允许的总重试次数                                                                                                                                                                          |
| `retry_delay_ms` | 整数            | 毫秒直到下一次尝试                                                                                                                                                                         |
| `error_status`   | 整数或 null      | HTTP 状态代码，或 `null` 表示没有 HTTP 响应的连接错误                                                                                                                                              |
| `error`          | 字符串           | 错误类别：`authentication_failed`、`oauth_org_not_allowed`、`billing_error`、`rate_limit`、`overloaded`、`invalid_request`、`model_not_found`、`server_error`、`max_output_tokens` 或 `unknown` |
| `uuid`           | 字符串           | 唯一事件标识符                                                                                                                                                                           |
| `session_id`     | 字符串           | 事件所属的会话                                                                                                                                                                           |

`system/init` 事件报告会话元数据，包括模型、工具、MCP 服务器和加载的插件。它是流中的第一个事件，除非启动事件在其之前：

* `plugin_install` 事件，当设置了 [`CLAUDE_CODE_SYNC_PLUGIN_INSTALL`](/docs/zh-CN/env-vars) 时。
* [`hook_started`、`hook_progress` 和 `hook_response` 事件](/docs/zh-CN/agent-sdk/typescript#sdkhookstartedmessage)，当配置的 [`SessionStart`](/docs/zh-CN/hooks#sessionstart) 或 [`Setup`](/docs/zh-CN/hooks#setup) hook 运行时。这些事件在 hook 生成时流式传输。Claude Code v2.1.169 至 v2.1.203 在 hook 完成后以一个批次传递它们，仍然在 `system/init` 之前；v2.1.204 恢复了实时传递。

该事件还携带一个可选的 `capabilities` 字符串数组，命名此 Claude Code 版本实现的协议行为，例如 `interrupt_receipt_v1`。检查它以进行功能检测，而不是比较版本字符串，并忽略您不认识的值。该字段需要 Claude Code v2.1.205 或更高版本，在早期版本中不存在。有关功能列表，请参阅 [`SDKSystemMessage`](/docs/zh-CN/agent-sdk/typescript#sdksystemmessage)。

使用插件字段在插件未加载时使 CI 失败：

| 字段              | 类型 | 描述                                                                                                                          |
| --------------- | -- | --------------------------------------------------------------------------------------------------------------------------- |
| `plugins`       | 数组 | 成功加载的插件，每个都有 `name` 和 `path`                                                                                                |
| `plugin_errors` | 数组 | 插件加载时错误，每个都有 `plugin`、`type` 和 `message`。包括不满足的依赖版本和 `--plugin-dir` 加载失败，例如缺失路径或无效存档。受影响的插件被降级并从 `plugins` 中缺失。当没有错误时，该键被省略 |

当设置了 [`CLAUDE_CODE_SYNC_PLUGIN_INSTALL`](/docs/zh-CN/env-vars) 时，Claude Code 在第一轮之前安装市场插件时发出 `system/plugin_install` 事件。使用这些在您自己的 UI 中显示安装进度。

| 字段           | 类型                                                   | 描述                                                           |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------ |
| `type`       | `"system"`                                           | 消息类型                                                         |
| `subtype`    | `"plugin_install"`                                   | 将其标识为插件安装事件                                                  |
| `status`     | `"started"`、`"installed"`、`"failed"` 或 `"completed"` | `started` 和 `completed` 括住整体安装；`installed` 和 `failed` 报告单个市场 |
| `name`       | 字符串，可选                                               | 市场名称，在 `installed` 和 `failed` 上存在                            |
| `error`      | 字符串，可选                                               | 失败消息，在 `failed` 上存在                                          |
| `uuid`       | 字符串                                                  | 唯一事件标识符                                                      |
| `session_id` | 字符串                                                  | 事件所属的会话                                                      |

对于具有回调和消息对象的编程流式传输，请参阅 Agent SDK 文档中的 [实时流式传输响应](/docs/zh-CN/agent-sdk/streaming-output)。

<h3 id="auto-approve-tools">
  自动批准工具
</h3>

使用 `--allowedTools` 让 Claude 使用某些工具而无需提示。此示例运行测试套件并修复失败，允许 Claude 执行 Bash 命令和读取/编辑文件而无需请求权限：

```bash theme={null}
claude -p "Run the test suite and fix any failures" \
  --allowedTools "Bash,Read,Edit"
```

要为整个会话设置基线而不是列出单个工具，请传递 [权限模式](/docs/zh-CN/permission-modes)。`dontAsk` 拒绝您的 `permissions.allow` 规则或 [只读命令集](/docs/zh-CN/permissions#read-only-commands) 中未包含的任何内容，这对于锁定的 CI 运行很有用。`AskUserQuestion`、连接器工具 [您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools) 和标记为 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具即使当允许规则匹配时也被拒绝。

`acceptEdits` 让 Claude 写入文件而无需提示，还自动批准常见的文件系统命令，例如 `mkdir`、`touch`、`mv` 和 `cp`。其他 shell 命令和网络请求仍然需要 `--allowedTools` 条目或 `permissions.allow` 规则，否则当尝试时运行会中止：

```bash theme={null}
claude -p "Apply the lint fixes" --permission-mode acceptEdits
```

<h3 id="create-a-commit">
  创建提交
</h3>

此示例审查暂存的更改并创建具有适当消息的提交：

```bash theme={null}
claude -p "Look at my staged changes and create an appropriate commit" \
  --allowedTools "Bash(git diff *),Bash(git log *),Bash(git status *),Bash(git commit *)"
```

`--allowedTools` 标志使用 [权限规则语法](/docs/zh-CN/settings#permission-rule-syntax)。尾部的 ` *` 启用前缀匹配，因此 `Bash(git diff *)` 允许任何以 `git diff` 开头的命令。空格在 `*` 之前很重要：没有它，`Bash(git diff*)` 也会匹配 `git diff-index`。

<Note>
  用户调用的 [skills](/docs/zh-CN/skills) 和自定义命令在 `-p` 模式下工作：在提示字符串中包含 `/skill-name`，Claude Code 会在运行前展开它。打开交互对话框的内置命令，例如 `/login`，在 `-p` 模式下不可用。`/model`、`/effort`、`/fast`、`/color` 和 `/rename` 接受该值作为参数，例如 `/model sonnet`，`/mcp` 不带参数打印服务器状态的文本摘要；这些形式需要 Claude Code v2.1.205 或更高版本，并遵循每个命令的 [可用性说明](/docs/zh-CN/commands#all-commands)。要从 `-p` 调用更改设置，请将 `key=value` 传递给 `/config`，例如 `/config thinking=false`。
</Note>

<h3 id="customize-the-system-prompt">
  自定义系统提示
</h3>

使用 `--append-system-prompt` 添加指令同时保持 Claude Code 的默认行为。此示例将 PR diff 传递给 Claude 并指示它审查安全漏洞：

```bash theme={null}
gh pr diff "$1" | claude -p \
  --append-system-prompt "You are a security engineer. Review for vulnerabilities." \
  --output-format json
```

有关更多选项（包括 `--system-prompt` 以完全替换默认提示），请参阅 [系统提示标志](/docs/zh-CN/cli-reference#system-prompt-flags)。

<h3 id="continue-conversations">
  继续对话
</h3>

使用 `--continue` 继续最近的对话，或使用 `--resume` 与会话 ID 继续特定对话。此示例运行审查，然后发送后续提示：

```bash theme={null}
# First request
claude -p "Review this codebase for performance issues"

# Continue the most recent conversation
claude -p "Now focus on the database queries" --continue
claude -p "Generate a summary of all issues found" --continue
```

如果您运行多个对话，请捕获会话 ID 以恢复特定对话：

```bash theme={null}
session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"
```

从同一目录运行两个命令：会话 ID 查找的范围限定为当前项目目录及其 git worktrees。有关完整范围规则，请参阅 [恢复会话](/docs/zh-CN/sessions#resume-a-session)。

<h2 id="next-steps">
  后续步骤
</h2>

* [Agent SDK 快速入门](/docs/zh-CN/agent-sdk/quickstart)：使用 Python 或 TypeScript 构建您的第一个 agent
* [CLI 参考](/docs/zh-CN/cli-reference)：所有 CLI 标志和选项
* [GitHub Actions](/docs/zh-CN/github-actions)：在 GitHub 工作流中使用 Agent SDK
* [GitLab CI/CD](/docs/zh-CN/gitlab-ci-cd)：在 GitLab 管道中使用 Agent SDK
