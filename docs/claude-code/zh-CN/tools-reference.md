> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 工具参考

> Claude Code 可以使用的工具的完整参考，包括权限要求和每个工具的行为。

Claude Code 可以访问一组内置工具，帮助它理解和修改您的代码库。工具名称是您在[权限规则](/docs/zh-CN/permissions#tool-specific-permission-rules)、[subagent 工具列表](/docs/zh-CN/sub-agents)和 [hook 匹配器](/docs/zh-CN/hooks)中使用的确切字符串。要完全禁用某个工具，请将其名称添加到[权限设置](/docs/zh-CN/permissions#tool-specific-permission-rules)中的 `deny` 数组。

要添加自定义工具，请连接一个 [MCP server](/docs/zh-CN/mcp)。要使用可重用的基于提示的工作流扩展 Claude，请编写一个 [skill](/docs/zh-CN/skills)，它通过现有的 `Skill` 工具运行，而不是添加新的工具条目。

Permission required 列显示该工具在默认权限模式下是否对工作目录内的路径进行提示。标记为"否"的文件访问工具，包括 `Read`、`Grep` 和 `Glob`，仍然会对[工作目录和其他目录](/docs/zh-CN/permissions#working-directories)之外的路径进行提示。`Bash` 标记为"是"，但运行一组内置的[只读命令](/docs/zh-CN/permissions#read-only-commands)而无需提示。

| 工具                     | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 需要权限 |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--- |
| `Agent`                | 生成一个具有自己 context window 的 [subagent](/docs/zh-CN/sub-agents)，用于处理任务。请参阅 [Agent 工具行为](#agent-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                      | 否    |
| `Artifact`             | 将 HTML 或 Markdown 文件发布为 [artifact](/docs/zh-CN/artifacts)：一个私有的、交互式的 claude.ai 页面。您可以与公开链接共享它，或在 Team 和 Enterprise 计划上在您的组织内共享，其中公开共享需要所有者[启用它](/docs/zh-CN/artifacts#control-public-sharing)。需要 Pro、Max、Team 或 Enterprise 计划和 `/login` 身份验证；请参阅[可用性](/docs/zh-CN/artifacts#availability)                                                                                                                                                                                                                                                 | 是    |
| `AskUserQuestion`      | 提出多选问题以收集需求或澄清歧义。问题保持打开状态直到您回答：默认情况下没有空闲超时。要让空闲对话框自动继续，请将 [`askUserQuestionTimeout`](/docs/zh-CN/settings#available-settings) 设置设置为 `60s`、`5m` 或 `10m`，可以在您的用户 `settings.json` 中或从 `/config` 中的**问题自动继续超时**行进行设置。一旦经过所选的空闲时间且没有输入，对话框会自动关闭：它会提交您已选择的任何选项，并告诉 Claude 您可能离开了键盘，因此 Claude 会根据自己的判断继续进行，稍后可以重新提问。最后 20 秒会出现倒计时。任何按键都会重启计时器，对于报告焦点的终端上的焦点窗口也是如此。超时仅适用于 `AskUserQuestion` 的多选问题；权限提示（包括计划批准）在空闲时永远不会自动解决。在 v2.1.198 和 v2.1.199 中，对话框默认在 60 秒空闲后自动继续，[`CLAUDE_AFK_TIMEOUT_MS`](/docs/zh-CN/env-vars#variables) 是改变这一点的唯一方式  | 否    |
| `Bash`                 | 在您的环境中执行 shell 命令。请参阅 [Bash 工具行为](#bash-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 是    |
| `CronCreate`           | 在当前会话中安排定期或一次性提示。任务是会话范围的，在 `--resume` 或 `--continue` 时如果未过期则会恢复。请参阅[计划任务](/docs/zh-CN/scheduled-tasks)                                                                                                                                                                                                                                                                                                                                                                                                                         | 否    |
| `CronDelete`           | 按 ID 取消计划任务                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 否    |
| `CronList`             | 列出会话中的所有计划任务                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 否    |
| `Edit`                 | 对特定文件进行有针对性的编辑。请参阅 [Edit 工具行为](#edit-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 是    |
| `EnterPlanMode`        | 切换到 Plan Mode 以在编码前设计方法                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 否    |
| `EnterWorktree`        | 创建一个隔离的 [git worktree](/docs/zh-CN/worktrees) 并切换到它。传递 `path` 以切换到现有 worktree，而不是创建新的。首次进入时，目标可能是当前存储库的 worktree，或在多存储库工作区中，是嵌套在其中的存储库的 worktree。在 v2.1.203 之前，嵌套存储库的 worktree 被拒绝。`.claude/worktrees/` 之外的 `path` 会在进入前提示您的批准，因为它会移动会话的工作目录和对该位置的写入访问权限。新 worktree 创建和 `.claude/worktrees/` 下的路径不会提示。在 v2.1.206 之前，Claude 进入 `.claude/worktrees/` 之外的路径而无需提示。从 worktree 会话内，或从具有固定工作目录的 subagent（例如 [`isolation: worktree`](/docs/zh-CN/sub-agents#supported-frontmatter-fields)）中，仅 `path` 形式可用，目标必须在会话存储库的 `.claude/worktrees/` 下 | 是    |
| `ExitPlanMode`         | 提出计划以供批准并退出 Plan Mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 是    |
| `ExitWorktree`         | 退出 worktree 会话并返回到原始目录。不适用于已在自己的工作目录中运行的 subagents，例如使用 [`isolation: worktree`](/docs/zh-CN/sub-agents#supported-frontmatter-fields)                                                                                                                                                                                                                                                                                                                                                                                            | 否    |
| `Glob`                 | 基于模式匹配查找文件。请参阅 [Glob 工具行为](#glob-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 否    |
| `Grep`                 | 在文件内容中搜索模式。请参阅 [Grep 工具行为](#grep-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 否    |
| `ListMcpResourcesTool` | 列出连接的 [MCP servers](/docs/zh-CN/mcp) 公开的资源                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 否    |
| `LSP`                  | 通过语言服务器进行代码智能：跳转到定义、查找引用、报告类型错误和警告。请参阅 [LSP 工具行为](#lsp-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 否    |
| `Monitor`              | 在后台运行命令并将每个输出行反馈给 Claude，以便它可以对日志条目、文件更改或轮询状态做出反应。还可以打开 WebSocket 并将每条传入消息视为事件。请参阅 [Monitor 工具](#monitor-tool)                                                                                                                                                                                                                                                                                                                                                                                                             | 是    |
| `NotebookEdit`         | 修改 Jupyter notebook 单元格。请参阅 [NotebookEdit 工具行为](#notebookedit-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                               | 是    |
| `PowerShell`           | 本地执行 PowerShell 命令。请参阅 [PowerShell 工具](#powershell-tool)了解可用性                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 是    |
| `PushNotification`     | 发送桌面通知，以及当 [Remote Control](/docs/zh-CN/remote-control) 已连接时发送手机推送，以便长时间运行的任务或[计划任务](/docs/zh-CN/scheduled-tasks)可以在您离开时联系您。推送传递通过 Anthropic 托管的基础设施运行，该基础设施无法从 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 访问                                                                                                                                                                                                                                                                                                  | 否    |
| `Read`                 | 读取文件内容。请参阅 [Read 工具行为](#read-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 否    |
| `ReadMcpResourceTool`  | 按 URI 读取特定 MCP 资源                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 否    |
| `RemoteTrigger`        | 在 claude.ai 上创建、更新、运行和列出 [Routines](/docs/zh-CN/routines)。支持 `/schedule` 命令。Routines 存在于 claude.ai 上，需要 Pro、Max、Team 或 Enterprise 计划，因此此工具无法从 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 访问                                                                                                                                                                                                                                                                                                               | 否    |
| `ReportFindings`       | 将代码审查发现报告为结构化列表，每个发现包含文件、摘要和失败场景，以便 Claude Code 可以呈现它们而不是将其打印为文本。当活跃的代码审查指令告诉它时，Claude 会调用它。需要 Claude Code v2.1.196 或更高版本。从 v2.1.199 起，发现还可以携带可选的 `category` slug，例如 `correctness` 或 `test-coverage`，显示在呈现列表中的文件位置旁边                                                                                                                                                                                                                                                                                                       | 否    |
| `ScheduleWakeup`       | 重新安排 [self-paced `/loop`](/docs/zh-CN/scheduled-tasks#let-claude-choose-the-interval) 的下一次迭代。Claude 在每次迭代结束时调用此工具以选择下一次运行的时间，范围在一分钟到一小时之间；您不需要直接调用它。要结束循环，Claude 会调用它并设置 `stop: true`，这会取消待处理的唤醒。`stop` 字段需要 Claude Code v2.1.202 或更高版本。待处理的唤醒显示在 [Stop hook input](/docs/zh-CN/hooks#stop-input) 中的 `session_crons` 中。在 Amazon Bedrock、Claude Platform on AWS、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上不可用，其中没有间隔的 `/loop` 提示按固定时间表运行                                                                                     | 否    |
| `SendMessage`          | 向 [agent team](/docs/zh-CN/agent-teams) 队友发送消息，或按 agent ID 或名称[恢复 subagent](/docs/zh-CN/sub-agents#resume-subagents)。已完成的 subagent 在后台自动恢复；您从 `/tasks` 停止的 subagent 不会，调用返回拒绝。结构化的团队协议消息需要 agent teams。接收者永远不会将来自另一个 agent 的消息视为您的同意或批准。从 v2.1.198 起，subagent 将来自启动它的 agent 的消息视为正常任务指示，而不是对等请求。从 v2.1.199 起，发送到现在解析为与对话早期不同的 agent 的名称会被拒绝而不是传递；请参阅[恢复 subagents](/docs/zh-CN/sub-agents#resume-subagents)                                                                                                                               | 否    |
| `SendUserFile`         | 将会话中的文件发送给您，带有可选的标题，以便生成的报告、图表、屏幕截图或构建的工件到达您的设备，而不仅仅是在记录中提及。从 v2.1.196 起，可选的 `display` 输入控制呈现方式：`render` 在客户端中内联打开文件，`attach` 仅显示下载卡，未设置时客户端按文件类型决定。当连接了 [Remote Control](/docs/zh-CN/remote-control) 客户端或会话在托管云环境（如 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)）中运行时可用。传递通过 Anthropic 托管的基础设施运行，因此该工具在 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上不可用                                                                                                                                       | 否    |
| `ShareOnboardingGuide` | 上传 `ONBOARDING.md` 并返回队友可以在 Claude Code 中打开的共享链接。在编写指南后从 `/team-onboarding` 调用。适用于 Pro、Max、Team 和 Enterprise 计划上的 claude.ai 订阅者                                                                                                                                                                                                                                                                                                                                                                                            | 是    |
| `Skill`                | 在主对话中执行 [skill](/docs/zh-CN/skills#control-who-invokes-a-skill)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 是    |
| `TaskCreate`           | 在任务列表中创建新任务                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 否    |
| `TaskGet`              | 检索特定任务的完整详细信息                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 否    |
| `TaskList`             | 列出所有任务及其当前状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 否    |
| `TaskOutput`           | 检索后台任务的输出。已弃用，改用 `Read` 读取任务的输出文件路径。当没有任务与 ID 匹配时，错误会按 ID 和描述列出运行中的后台 agents。在 v2.1.203 之前，错误仅命名缺失的 ID                                                                                                                                                                                                                                                                                                                                                                                                                     | 否    |
| `TaskStop`             | 按 ID 停止运行中的后台任务。它还接受 [agent-team 队友](/docs/zh-CN/agent-teams)或按 agent ID 或名称的命名后台 agent。在 v2.1.198 之前，它仅接受后台任务 ID。当没有任务与 ID 匹配时，错误会按 ID 和描述列出运行中的后台 agents，包括另一个 agent 生成的 agents。在 v2.1.203 之前，错误列出了运行中的队友和命名 agents，但不包括另一个 agent 生成的后台 agents，因此无法从主对话中识别或停止这些 agents                                                                                                                                                                                                                                                        | 否    |
| `TaskUpdate`           | 更新任务状态、依赖项、详细信息或删除任务                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 否    |
| `TodoWrite`            | 管理会话任务清单。在 v2.1.142 起默认禁用，改用 `TaskCreate`、`TaskGet`、`TaskList` 和 `TaskUpdate`。设置 `CLAUDE_CODE_ENABLE_TASKS=0` 以重新启用                                                                                                                                                                                                                                                                                                                                                                                                        | 否    |
| `ToolSearch`           | 当启用 [tool search](/docs/zh-CN/mcp#scale-with-mcp-tool-search) 时搜索并加载延迟工具                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 否    |
| `WaitForMcpServers`    | 等待一个或多个仍在后台连接的 [MCP servers](/docs/zh-CN/mcp)，以便请求可以使用它们的工具而无需重启会话。Claude 会在所需的服务器尚未连接时调用它。仅当禁用 [tool search](/docs/zh-CN/mcp#scale-with-mcp-tool-search) 时出现，因为启用时 `ToolSearch` 会处理等待                                                                                                                                                                                                                                                                                                                                               | 否    |
| `WebFetch`             | 从指定 URL 获取内容。请参阅 [WebFetch 工具行为](#webfetch-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 是    |
| `WebSearch`            | 执行网络搜索。请参阅 [WebSearch 工具行为](#websearch-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 是    |
| `Workflow`             | 运行一个 [dynamic workflow](/docs/zh-CN/workflows)：一个在后台协调许多 subagents 并返回一个统一结果的脚本                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 是    |
| `Write`                | 创建或覆盖文件。请参阅 [Write 工具行为](#write-tool-behavior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 是    |

<h2 id="configure-tools-with-permission-rules-and-hooks">
  使用权限规则和 hooks 配置工具
</h2>

在大多数情况下，Claude 决定何时使用这些工具，您在与 Claude 交互时不需要自己命名它们。当定义权限和其他配置时，您直接引用工具名称：

* 在设置中的 [`permissions.allow` 和 `permissions.deny`](/docs/zh-CN/settings#available-settings)，以及 `/permissions` 界面
* 在 [CLI 标志](/docs/zh-CN/cli-reference)中的 `--allowedTools` 和 `--disallowedTools`
* 在 Agent SDK 的 [`allowedTools` 和 `disallowedTools`](/docs/zh-CN/agent-sdk/permissions#allow-and-deny-rules) 选项中
* 在 [subagent 的 `tools` 或 `disallowedTools`](/docs/zh-CN/sub-agents#supported-frontmatter-fields) frontmatter 中
* 在 [skill 的 `allowed-tools`](/docs/zh-CN/skills#frontmatter-reference) frontmatter 中
* 在 hook 的 [`if` 条件](/docs/zh-CN/hooks-guide#filter-by-tool-name-and-arguments-with-the-if-field)中

所有这些都接受相同的规则格式，`ToolName(specifier)`。specifier 取决于工具，几个工具共享一种格式：

| 规则格式                           | 适用于                     | 详情                                                                 |
| :----------------------------- | :---------------------- | :----------------------------------------------------------------- |
| `Bash(npm run *)`              | Bash、Monitor            | [命令模式匹配](/docs/zh-CN/permissions#bash)                                  |
| `PowerShell(Get-ChildItem *)`  | PowerShell              | [命令模式匹配](/docs/zh-CN/permissions#powershell)                            |
| `Read(~/secrets/**)`           | Read、Grep、Glob、LSP      | [路径模式匹配](/docs/zh-CN/permissions#read-and-edit)                         |
| `Edit(/src/**)`                | Edit、Write、NotebookEdit | [路径模式匹配](/docs/zh-CN/permissions#read-and-edit)                         |
| `Skill(deploy *)`              | Skill                   | [Skill 名称匹配](/docs/zh-CN/skills#restrict-claude%E2%80%99s-skill-access) |
| `Agent(Explore)`               | Agent                   | [Subagent 类型匹配](/docs/zh-CN/permissions#agent-subagents)                |
| `WebFetch(domain:example.com)` | WebFetch                | [域名匹配](/docs/zh-CN/permissions#webfetch)                                |
| `WebSearch`                    | WebSearch               | 无 specifier；允许或拒绝整个工具                                              |

此处未列出的工具，例如 `ExitPlanMode` 或 `ShareOnboardingGuide`，仅接受不带 specifier 的裸工具名称。

`Edit(...)` 允许规则也授予对相同路径的读取访问权限，因此您不需要匹配的 `Read(...)` 规则。`Read(...)` 拒绝规则也会阻止 Edit 工具在相同路径上的使用，包括在该处创建新文件，因为编辑需要读取结果。Edit 上的 `Read` 拒绝检查需要 Claude Code v2.1.208 或更高版本。

Hook `matcher` 字段使用裸工具名称，而不是带括号的规则格式。请参阅[匹配器模式](/docs/zh-CN/hooks#matcher-patterns)了解匹配规则。对于每个工具在 hooks 中传递给 `tool_input` 的字段名称，请参阅 [PreToolUse 输入参考](/docs/zh-CN/hooks#pretooluse-input)。

<h2 id="agent-tool-behavior">
  Agent 工具行为
</h2>

Agent 工具在单独的 context window 中生成一个 subagent。subagent 自主地完成其任务，然后向父对话返回单个文本结果。父对话看不到 subagent 的中间工具调用或输出，只看到最终结果。

要限制 subagent 运行的轮数，请在 [subagent 定义](/docs/zh-CN/sub-agents#supported-frontmatter-fields)中设置 `maxTurns`。

同一个 Agent 工具也在启用 fork 模式时启动[分叉 subagents](/docs/zh-CN/sub-agents#fork-the-current-conversation)。fork 继承完整的父对话，而不是从头开始，始终在后台运行，并且仍然在您的终端中显示权限提示。本节的其余部分描述命名的 subagents。

命名的 subagent 可以使用哪些工具取决于 [subagent 定义](/docs/zh-CN/sub-agents)中的 `tools` 和 `disallowedTools` 字段：

* **两个字段都未设置**：subagent 继承父对话可用的每个工具。
* **仅设置 `tools`**：subagent 仅获得列出的工具。
* **仅设置 `disallowedTools`**：subagent 获得除列出的工具外的每个父工具。
* **两个都设置**：`disallowedTools` 优先。同时列在两个中的工具会被移除。

当 subagent 的 `tools` 列表最终没有任何工具时，例如因为每个条目都拼写错误或命名了一个对 subagents 不可用的工具，Agent 工具会返回一个错误，列出这些条目，而不是启动 subagent。在 v2.1.208 之前，subagent 会以无工具的方式启动，可能返回空结果或令人困惑的结果。

启动 subagent 本身不会提示权限。Claude Code 在运行时根据您的权限规则检查 subagent 自己的工具调用。

从 v2.1.198 起，subagents 默认在后台运行；当 Claude 需要结果后才继续时，它会在前台运行一个。

* **前台 subagents** 显示您在主对话中会看到的相同权限提示，在每个工具调用发生时。
* **后台 subagents** 从 v2.1.186 起在您的主会话中显示权限提示。提示会指出是哪个 subagent 在请求，按 Esc 会拒绝该工具调用而不停止 subagent。在 v2.1.186 之前，后台 subagents 会自动拒绝任何会提示的工具调用并继续运行而不使用该工具。

要首先限制 subagent 可以访问的内容，请缩小其 `tools` 字段，将 Bash 排除在列表之外，或在设置中设置拒绝规则，如[控制 subagent 功能](/docs/zh-CN/sub-agents#control-subagent-capabilities)中所述。有关选择前台或后台的更多信息，请参阅[在前台或后台运行 subagents](/docs/zh-CN/sub-agents#run-subagents-in-foreground-or-background)。

<h2 id="bash-tool-behavior">
  Bash 工具行为
</h2>

Bash 工具在单独的进程中运行每个命令，具有以下持久性行为：

* 当 Claude 在主会话中运行 `cd` 时，只要它保持在项目目录内或您使用 `--add-dir`、`/add-dir` 或设置中的 `additionalDirectories` 添加的[额外工作目录](/docs/zh-CN/permissions#working-directories)内，新的工作目录就会延续到后续的 Bash 命令。Subagent 会话永远不会延续工作目录更改。
  * 如果 `cd` 落在这些目录之外，Claude Code 会重置为项目目录，并将 `Shell cwd was reset to <dir>` 附加到工具结果。
  * 要禁用此延续，使每个 Bash 命令都在项目目录中启动，请设置 `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1`。
* 环境变量不持久。一个命令中的 `export` 在下一个命令中将不可用。
* 在您的 shell 启动文件中定义的别名和 shell 函数可用。在会话启动时，Claude Code 会根据您的 shell 来源 `~/.zshrc`、`~/.bashrc` 或 `~/.profile`，捕获生成的别名、函数和 shell 选项，并将它们应用于每个 Bash 命令。

在启动 Claude Code 之前激活您的 virtualenv 或 conda 环境。要使环境变量在 Bash 命令之间保持不变，请在启动 Claude Code 之前将 [`CLAUDE_ENV_FILE`](/docs/zh-CN/env-vars) 设置为 shell 脚本，或使用 [SessionStart hook](/docs/zh-CN/hooks#persist-environment-variables) 动态填充它。

两个限制限制每个命令：

* **超时**：默认为两分钟。Claude 可以使用 `timeout` 参数请求每个命令最多 10 分钟。使用 [`BASH_DEFAULT_TIMEOUT_MS` 和 `BASH_MAX_TIMEOUT_MS`](/docs/zh-CN/env-vars) 覆盖默认值和上限。
* **输出长度**：默认为 30,000 个字符。当命令产生超过该数量的输出时，Claude Code 将完整输出保存到会话目录中的文件，并给 Claude 文件路径加上开头的简短预览。Claude 在需要其余部分时读取或搜索该文件。使用 [`BASH_MAX_OUTPUT_LENGTH`](/docs/zh-CN/env-vars) 提高限制，最高为 150,000 个字符的硬上限。

对于长时间运行的进程，例如开发服务器或监视构建，Claude 可以设置 `run_in_background: true` 以将命令作为后台任务启动并在其运行时继续工作。使用 `/tasks` 列出和停止后台任务。在使用 `-p` 标志的非交互模式下，[后台任务在运行的最终结果后不久结束](/docs/zh-CN/headless#background-tasks-at-exit)。

<h2 id="edit-tool-behavior">
  Edit 工具行为
</h2>

Edit 工具执行精确的字符串替换。它接受 `old_string` 和 `new_string` 并用后者替换前者。它不使用正则表达式或模糊匹配。

三个检查必须通过才能应用编辑。在任何检查之前，与 [`Read` 拒绝规则](/docs/zh-CN/permissions#tool-specific-permission-rules)匹配的路径会被拒绝，包括在那里创建新文件。此拒绝需要 Claude Code v2.1.208 或更高版本。

* **编辑前读取**：Claude 在当前对话中读取文件后才能编辑它，并且以 [`PARTIAL view` 通知](#read-tool-behavior)中断的读取不计数。Claude Opus 4.6、Claude Haiku 4.5 和更早的模型始终需要读取。较新的模型可以在读取不需要权限提示且 Read 工具可用时编辑未读文件。
* **匹配**：`old_string` 必须在文件中完全按照编写的方式出现。单个空格或缩进差异足以导致不匹配。
* **唯一性**：`old_string` 必须恰好出现一次。当它出现多次时，Claude 要么提供一个更长的字符串，其中包含足够的周围上下文来确定一个出现，要么设置 `replace_all: true` 来替换所有出现。

在 Claude 最后读取文件后在磁盘上更改的文件仍然可以编辑，当 `old_string` 与当前内容完全且明确匹配，并且 Claude Code 可以读取文件而无需提示时。针对文件的当前内容进行匹配可以保持安全，结果会注明该文件包含其他更改，以便 Claude 在依赖周围内容的编辑之前重新读取它。在任何其他情况下，例如过时的 `old_string` 或与多个出现匹配而没有 `replace_all` 的情况，Claude 在编辑前重新读取文件。未读和已更改文件的宽松处理需要 Claude Code v2.1.208 或更高版本；在此之前，Claude Code 拒绝对它在对话中未读过或在读取后在磁盘上更改的任何文件进行编辑。

使用 Bash 查看文件也满足编辑前读取要求，当命令是 `cat`、`head`、`tail`、`sed -n 'X,Yp'`、`grep`、`egrep` 或 `fgrep` 在单个文件上，没有管道或重定向时。管道输出和其他 Bash 命令不计入编辑前读取检查。

这仅影响编辑资格，不影响权限。[Read 和 Edit 拒绝规则](/docs/zh-CN/permissions#tool-specific-permission-rules)也适用于 Claude Code 在 Bash 中识别的文件命令，例如 `cat`、`head`、`tail`、`sed` 和 `grep`，但不适用于间接读取或写入文件的任意子进程，例如自己打开文件的 Python 或 Node 脚本。对于编辑前读取，识别的命令集与上面的拒绝规则列表不同：例如，`egrep` 和 `fgrep` 计入编辑前读取但不针对 Read 拒绝规则进行检查。对于覆盖每个进程的操作系统级别强制，请[启用沙箱](/docs/zh-CN/sandboxing)。

<h2 id="glob-tool-behavior">
  Glob 工具行为
</h2>

Glob 工具按名称模式查找文件。它支持标准 glob 语法，包括 `**` 用于递归目录匹配：

* `**/*.js` 匹配任何深度的所有 `.js` 文件
* `src/**/*.ts` 匹配 `src/` 下的所有 `.ts` 文件
* `*.{json,yaml}` 匹配当前目录中的 `.json` 和 `.yaml` 文件

结果按修改时间排序，并限制为 100 个文件。如果达到上限，Claude 会在结果中看到截断标志，并可以缩小模式。

Glob 默认不尊重 `.gitignore`，因此它找到被 gitignore 的文件以及跟踪的文件。这与 [Grep](#grep-tool-behavior) 不同，后者跳过被 gitignore 的文件。要使 Glob 尊重 `.gitignore`，请在启动 Claude Code 之前设置 `CLAUDE_CODE_GLOB_NO_IGNORE=false`。

包含空字节的 `pattern` 或 `path` 值会返回错误，要求 Claude 将其删除。

<h2 id="grep-tool-behavior">
  Grep 工具行为
</h2>

Grep 工具在文件内容中搜索模式。[Glob](#glob-tool-behavior) 按名称查找文件，Grep 在文件内查找行。

Grep 基于 [ripgrep](https://github.com/BurntSushi/ripgrep) 并使用 ripgrep 的正则表达式语法，而不是 POSIX grep。包含正则表达式元字符的模式需要转义。例如，在 Go 代码中查找 `interface{}` 需要模式 `interface\{\}`。

一个 ripgrep 拒绝的模式、glob 或文件类型会返回一个包含 ripgrep 诊断信息的错误，这样 Claude 可以更正输入并再次搜索。在 v2.1.208 之前，Claude Code 将被拒绝的输入报告为 `No files found`，而不是错误，即使搜索的文本存在于目标文件中。

三种输出模式控制返回的内容：

* `files_with_matches`：仅文件路径，无行内容。这是默认值。
* `content`：匹配的行及其文件和行号。
* `count`：每个文件的匹配计数，后跟所有匹配文件的总计数。总计覆盖每一个匹配，即使工具的 `head_limit` 或 `offset` 参数截断了列出的每个文件条目。在 v2.1.208 之前，总计仅对列出的条目求和。

Claude 可以使用 `glob` 参数（例如 `**/*.tsx`）按文件范围结果，或使用 `type` 参数（例如 `py` 或 `rust`）按语言范围结果。默认情况下，模式在单行内匹配。Claude 可以设置 `multiline: true` 以跨行边界匹配。

Grep 尊重 `.gitignore`，因此被 gitignore 的文件会被跳过。要搜索被 gitignore 的文件，Claude 直接传递其路径。

<h2 id="lsp-tool-behavior">
  LSP 工具行为
</h2>

LSP 工具为 Claude 提供来自运行中的语言服务器的代码智能。在每次文件编辑后，它会自动报告类型错误和警告，以便 Claude 可以在没有单独构建步骤的情况下修复问题。Claude 还可以直接调用它来导航代码：

* 跳转到符号的定义
* 查找对符号的所有引用
* 获取位置处的类型信息
* 列出文件中的符号
* 按名称在工作区中搜索符号
* 查找接口的实现
* 追踪调用层次结构

该工具在您为您的语言安装 [code intelligence plugin](/docs/zh-CN/discover-plugins#code-intelligence) 之前处于非活动状态。该插件捆绑了语言服务器配置，您需要单独安装服务器二进制文件。

<h2 id="monitor-tool">
  Monitor 工具
</h2>

Monitor 工具让 Claude 在后台监视某些内容，并在其更改时做出反应，而无需暂停对话。要求 Claude：

* 跟踪日志文件并在错误出现时标记它们
* 轮询 PR 或 CI 作业并在其状态更改时报告
* 监视目录以查找文件更改
* 跟踪您指向的任何长时间运行脚本的输出
* 连接到 WebSocket 源并在每条消息到达时报告

对于大多数监视，Claude 编写一个小脚本，在后台运行它，并在每行到达时接收它。对于已经推送事件的服务器，Claude 可以打开 [WebSocket](#websocket-source) 而不是运行脚本。

您可以在同一会话中继续工作，Claude 在事件到达时插入。通过要求 Claude 取消它或结束会话来停止监视。

当 Monitor 运行命令时，它使用与 [Bash 相同的权限规则](/docs/zh-CN/permissions#tool-specific-permission-rules)，因此您为 Bash 设置的 `allow` 和 `deny` 模式也适用于此处。[WebSocket 源](#websocket-source)有其自己的批准提示。

该工具在 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上不可用。当设置了 `DISABLE_TELEMETRY` 或 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 时，它也不可用。

插件可以声明在插件处于活动状态时自动启动的监视，而不是要求 Claude 启动它们。请参阅 [plugin monitors](/docs/zh-CN/plugins-reference#monitors)。

<h3 id="websocket-source">
  WebSocket 源
</h3>

<Note>
  WebSocket 源需要 Claude Code v2.1.195 或更高版本。
</Note>

当服务器已经通过 WebSocket 推送事件时，Claude 可以直接连接到它，而不是编写轮询脚本。每种套接字活动要么成为一个事件，要么结束监视：

* **文本消息**：每条消息都成为一个事件，即使消息跨越多行。
* **二进制消息**：不通过。Claude 接收一个占位符行，例如 `[binary frame, 512 bytes]`。
* **大于 1 MiB 的消息**：监视结束，因此请订阅存在的过滤源。
* **套接字关闭**：监视结束，Claude 接收关闭代码。

WebSocket 监视使用 `ws` 输入代替 `command`，单个 Monitor 调用不能将两者结合。`ws` 输入有两个字段：

| 字段          | 必需 | 描述                                                         |
| :---------- | :- | :--------------------------------------------------------- |
| `url`       | 是  | 要连接的端点。必须是 `ws://` 或 `wss://` URL，不包含嵌入的凭证或空格，仅使用 ASCII 字符 |
| `protocols` | 否  | 在握手期间提供的 WebSocket 子协议名称。每个条目必须是有效的子协议令牌，列表不能包含重复项         |

`timeout_ms` 和 `persistent` 输入的行为与它们对命令的行为相同：监视在截止时间结束，除非设置了 `persistent`，`TaskStop` 会提前取消它。

打开 WebSocket 会提示批准，提示不提供跳过同一主机的未来提示的选项。

Claude Code 拒绝指向私有、链接本地或云元数据地址的 URL，包括解析为这些地址的主机名。它还拒绝 `sandbox.network.deniedDomains` 中的主机，以及当在托管设置中设置了 [`allowManagedDomainsOnly`](/docs/zh-CN/settings#sandbox-settings) 时，任何在托管允许列表之外的主机。

<h2 id="notebookedit-tool-behavior">
  NotebookEdit 工具行为
</h2>

NotebookEdit 一次修改一个 Jupyter notebook 单元格，按其 `cell_id` 定位单元格。它不像 [Edit](#edit-tool-behavior) 在纯文本文件上那样在整个 notebook 中执行字符串替换。

三种编辑模式控制目标单元格发生的情况：

* `replace`：覆盖单元格的源。这是默认值。
* `insert`：在目标后添加新单元格。没有 `cell_id` 时，新单元格位于 notebook 的开始。需要 `cell_type` 设置为 `code` 或 `markdown`。
* `delete`：删除目标单元格。

权限规则使用 `Edit(...)` 路径格式。像 `Edit(notebooks/**)` 这样的规则涵盖该目录中的 NotebookEdit 调用。

<h2 id="powershell-tool">
  PowerShell 工具
</h2>

PowerShell 工具让 Claude 本地运行 PowerShell 命令。在 Windows 上，这意味着命令在 PowerShell 中运行，而不是通过 Git Bash 路由。该工具的可用方式取决于您的平台：

* **没有 Git Bash 的 Windows**：该工具会自动启用。
* **安装了 Git Bash 的 Windows**：该工具正在逐步推出。
* **Linux、macOS 和 WSL**：该工具是选择加入的。

<h3 id="enable-the-powershell-tool">
  启用 PowerShell 工具
</h3>

在您的环境或 `settings.json` 中设置 `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`：

```json theme={null}
{
  "env": {
    "CLAUDE_CODE_USE_POWERSHELL_TOOL": "1"
  }
}
```

在 Windows 上，将变量设置为 `0` 以选择退出推出。在 Linux、macOS 和 WSL 上，该工具需要 PowerShell 7 或更高版本：安装 `pwsh` 并确保它在您的 `PATH` 中。

在 Windows 上，Claude Code 自动检测 `pwsh.exe`（PowerShell 7+），回退到 `powershell.exe`（PowerShell 5.1）。启用该工具后，Claude 将 PowerShell 视为主 shell。当安装了 Git Bash 时，Bash 工具仍可用于 POSIX 脚本。

Claude Code 使用 `-ExecutionPolicy Bypass` 在进程范围内生成 PowerShell，因此 `.ps1` 脚本和模块导入可以在默认 Windows 安装上工作，无需更改计算机的策略。进程范围绕过不会覆盖组策略 `MachinePolicy` 或 `UserPolicy`，因此企业策略仍然适用。要改为遵守计算机的有效执行策略，请设置 `CLAUDE_CODE_POWERSHELL_RESPECT_EXECUTION_POLICY=1`。

<h3 id="shell-selection-in-settings-hooks-and-skills">
  设置、hooks 和 skills 中的 shell 选择
</h3>

三个额外的设置控制 PowerShell 的使用位置：

* [`settings.json`](/docs/zh-CN/settings#available-settings) 中的 `"defaultShell": "powershell"`：通过 PowerShell 路由交互式 `!` 命令。需要启用 PowerShell 工具。
* 单个 [command hooks](/docs/zh-CN/hooks#command-hook-fields) 上的 `"shell": "powershell"`：在 PowerShell 中运行该 hook。Hooks 直接生成 PowerShell，因此无论 `CLAUDE_CODE_USE_POWERSHELL_TOOL` 如何，这都有效。
* [skill frontmatter](/docs/zh-CN/skills#frontmatter-reference) 中的 `shell: powershell`：在 PowerShell 中运行 `` !`command` `` 块。需要启用 PowerShell 工具。

同样的主会话工作目录重置行为（如 Bash 工具部分所述）适用于 PowerShell 命令，包括 `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` 环境变量。

从 v2.1.196 开始，PowerShell 工具与 Bash 工具的搜索和 diff 退出代码处理方式相匹配。来自 `grep`、`egrep`、`fgrep` 和 `git grep` 的退出代码 1 表示没有匹配项，来自 `git diff` 的退出代码 1 表示存在差异，因此这些结果不会作为命令失败报告给 Claude。

<h3 id="preview-limitations">
  预览限制
</h3>

PowerShell 工具在预览期间有以下已知限制：

* PowerShell 配置文件未加载
* 在 Windows 上，不支持 sandboxing

<h2 id="read-tool-behavior">
  Read 工具行为
</h2>

Read 工具接受文件路径并返回带有行号的内容。Claude 被指示始终传递绝对路径。

默认情况下，Read 从开始返回文件。当整个文件读取超过令牌限制时，Read 返回第一页，并显示 `PARTIAL view` 通知，告诉 Claude 它收到了多少文件内容以及如何使用 `offset` 和 `limit` 读取更多内容。传递显式 `offset` 或 `limit` 的读取仍然超过令牌限制时会返回错误。

使用显式 `limit` 的读取会在选定的行超过令牌限制可能容纳的内容时立即停止，并返回错误而不加载范围的其余部分。该错误告诉 Claude 使用较小的 `limit`，或者当单行非常大时，改为使用 [Grep](#grep-tool-behavior) 搜索特定内容。在 v2.1.208 之前，Claude Code 在拒绝前会将整个范围加载到内存中，因此具有极长单行的文件可能会耗尽内存。

读取空文件会返回一个通知，说明文件存在但其内容为空，而超过最后一行的 `offset` 会返回一个给出文件行数的通知。在 v2.1.208 之前，读取空文件会返回过去末尾的通知。

Read 处理纯文本之外的几种文件类型：

* **图像**：PNG、JPG 和其他图像格式作为 Claude 可以看到的视觉内容返回，而不是原始字节。Claude Code 在发送前调整大小并重新压缩大图像以适应模型的图像大小限制，因此 Claude 可能会看到大截图的缩小版本。从 v2.1.196 开始，调整大小后仍然大于 500KB 的图像会以降低质量的 JPEG 格式重新编码，其像素尺寸保持不变。如果 Claude 在大图像中遗漏了细微的像素级细节，请要求它首先裁剪感兴趣的区域，例如使用 ImageMagick 通过 Bash。
* **PDFs**：Claude 完整读取短 `.pdf` 文件。对于超过 10 页的 PDFs，它使用 `pages` 参数（例如 `"1-5"`）按范围读取，一次最多 20 页。
* **Jupyter notebooks**：`.ipynb` 文件返回所有单元格及其输出，包括代码、markdown 和可视化。

Read 仅读取文件，不读取目录。Claude 使用通过 Bash 工具的 `ls` 列出目录内容。

<h2 id="webfetch-tool-behavior">
  WebFetch 工具行为
</h2>

WebFetch 接受 URL 和描述要提取内容的提示。它获取页面，当服务器返回 HTML 时将响应转换为 Markdown，并使用小型快速模型针对内容运行提示。对于大多数获取，Claude 接收该模型的答案，而不是原始页面。转换步骤不可配置。

这使 WebFetch 在设计上是有损的。提取提示确定到达 Claude 的内容，因此说页面不提及某内容的结果可能只意味着提示没有询问它。要求 Claude 使用更具体的提示再次获取，或通过 Bash 使用 `curl` 获取未处理的页面。

几种行为塑造 Claude 接收的响应：

* HTTP URLs 自动升级到 HTTPS。
* 大页面在处理前被截断到固定字符限制。
* 响应缓存 15 分钟，因此相同 URL 的重复获取快速返回。
* 当 URL 重定向到不同的主机时，WebFetch 返回一个文本结果，命名原始 URL 和重定向目标，而不是跟随它。Claude 然后使用第二个 WebFetch 调用获取新 URL。

在默认和 `acceptEdits` 权限模式中，WebFetch 在首次到达新域时提示，除了一组内置的预批准文档域可以无需提示地获取。要提前允许另一个域而不提示，请添加像 `WebFetch(domain:example.com)` 这样的权限规则。`auto` 和 `bypassPermissions` [权限模式](/docs/zh-CN/permissions#permission-modes)完全跳过提示。

`deny`、`ask` 或 `allow` 中的显式 `WebFetch(domain:...)` 规则优先于预批准集合，因此您可以阻止预批准域或要求对其进行提示。

WebFetch 设置以 `Claude-User` 开头的 `User-Agent` 标头，以及优先 Markdown 而不是 HTML 的 `Accept` 标头，以便支持内容协商的服务器可以直接返回 Markdown。Sandbox [网络规则](/docs/zh-CN/sandboxing)单独配置，因此您希望沙箱进程到达的域仍然需要显式沙箱权限规则。

<h2 id="websearch-tool-behavior">
  WebSearch 工具行为
</h2>

WebSearch 针对 Anthropic 的[网络搜索](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)后端运行查询，并返回结果标题和 URLs。它不获取结果页面。要读取 Claude 在搜索结果中找到的页面，它使用 [WebFetch](#webfetch-tool-behavior) 进行后续操作。

该工具可能在返回结果之前发出最多八个后端搜索，在内部优化搜索。Claude 可以使用 `allowed_domains` 范围结果以仅包含某些主机，或使用 `blocked_domains` 排除它们。这两个列表不能在单个调用中组合。

搜索后端不可配置。要使用不同的提供商进行搜索，请添加一个 [MCP server](/docs/zh-CN/mcp)，公开搜索工具。

WebSearch 权限规则不接受 specifier。`allow` 或 `deny` 中的裸 `WebSearch` 条目是唯一的形式。

<Note>
  WebSearch 在 Claude API、[Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws) 和 Microsoft Foundry 上可用。在 Google Cloud 的 Agent Platform 上，它适用于 Claude 4 及更高版本的模型，包括 Opus、Sonnet 和 Haiku。Amazon Bedrock 不公开服务器端网络搜索工具。
</Note>

<h2 id="write-tool-behavior">
  Write 工具行为
</h2>

Write 工具创建新文件或用提供的完整内容覆盖现有文件。它不追加或合并。

如果目标路径已存在，Claude 必须在当前对话中至少读取过该文件一次才能覆盖它。对未读现有文件的 Write 失败并出现错误。此约束不适用于新文件。

使用 Bash 查看文件也满足此要求，如 [Edit 工具行为](#edit-tool-behavior)中所述。

对于现有文件的部分更改，Claude 使用 Edit 而不是 Write。

<h2 id="check-which-tools-are-available">
  检查哪些工具可用
</h2>

您的确切工具集取决于您的提供商、平台和设置。要检查在运行中的会话中加载了什么，请直接询问 Claude：

```text theme={null}
What tools do you have access to?
```

Claude 提供对话摘要。对于确切的 MCP 工具名称，请运行 `/mcp`。

<Note>
  [advisor tool](/docs/zh-CN/advisor) 是一个 [server tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool)，由 API 运行，而不是 Claude Code 实现的工具。它没有您可以在权限规则或 hook 匹配器中引用的名称。
</Note>

<h2 id="see-also">
  另请参阅
</h2>

* [MCP servers](/docs/zh-CN/mcp)：通过连接外部服务器添加自定义工具
* [权限](/docs/zh-CN/permissions)：权限系统、规则语法和工具特定模式
* [Subagents](/docs/zh-CN/sub-agents)：为 subagents 配置工具访问
* [Hooks](/docs/zh-CN/hooks-guide)：在工具执行前后运行自定义命令
