> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 在 Claude Code Desktop 中安排定期任务

> 在 Claude Code Desktop 中设置定期任务，以定期自动运行 Claude 进行日常代码审查、依赖项审计或早晨简报。

定期任务在您选择的时间和频率自动启动新会话。使用它们进行定期工作，如日常代码审查、依赖项更新检查或从您的日历和收件箱中提取信息的早晨简报。

Desktop 应用的 **Routines** 页面让您可以创建本地定期任务和远程 [routines](/docs/zh-CN/routines)。本地任务在您的机器上运行，可直接访问您的文件和工具，但仅在应用打开且计算机处于唤醒状态时才会触发。远程 routine 在 Anthropic 管理的云基础设施上运行，即使您的计算机关闭也可以运行，还可以通过 API 调用或 GitHub 事件触发。本页面涵盖本地定期任务；有关远程 routine 及其触发选项，请参阅 [Routines](/docs/zh-CN/routines)。

<h2 id="compare-scheduling-options">
  比较调度选项
</h2>

Claude Code offers three ways to schedule recurring or one-off work:

|                            | [Cloud](/docs/en/routines)               | [Desktop](/docs/en/desktop-scheduled-tasks) | [`/loop`](/docs/en/scheduled-tasks)      |
| :------------------------- | :---------------------------------- | :------------------------------------- | :---------------------------------- |
| Runs on                    | Cloud, Anthropic-managed by default | Your machine                           | Your machine                        |
| Requires machine on        | No                                  | Yes                                    | Yes                                 |
| Requires open session      | No                                  | No                                     | Yes                                 |
| Persistent across restarts | Yes                                 | Yes                                    | Restored on `--resume` if unexpired |
| Access to local files      | No (fresh clone)                    | Yes                                    | Yes                                 |
| MCP servers                | Connectors configured per task      | [Config files](/docs/en/mcp) and connectors | Inherits from session               |
| Permission prompts         | No (runs autonomously)              | Configurable per task                  | Inherits from session               |
| Customizable schedule      | Via `/schedule` in the CLI          | Yes                                    | Yes                                 |
| Minimum interval           | 1 hour                              | 1 minute                               | 1 minute                            |

<Tip>
  Use **cloud tasks** for work that should run reliably without your machine. Use **Desktop tasks** when you need access to local files and tools. Use **`/loop`** for quick polling during a session.
</Tip>

<Note>
  默认情况下，定期任务针对您的工作目录的任何状态运行，包括未提交的更改。在创建任务时启用 worktree 切换，为每次运行提供其自己的隔离 Git worktree，与 [parallel sessions](/docs/zh-CN/desktop#work-in-parallel-with-sessions) 的工作方式相同。
</Note>

<h2 id="create-a-scheduled-task">
  创建定期任务
</h2>

单击侧边栏中的 **Routines**，然后单击 **New routine** 并选择 **Local**。配置这些字段：

| 字段           | 描述                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Name         | 任务的标识符。转换为小写 kebab-case 并用作磁盘上的文件夹名称。在您的任务中必须是唯一的。                                                         |
| Description  | 任务列表中显示的简短摘要。                                                                                              |
| Instructions | 任务运行时 Claude 应该做什么。以您在提示框中编写任何消息的相同方式编写此内容。instructions 输入包括权限模式和模型的选择器，在其下方您选择工作文件夹以及是否在隔离的 worktree 中运行。 |
| Schedule     | 任务运行的频率。请参阅下面的 [schedule options](#schedule-options)。                                                      |

在保存任务之前需要一个文件夹。如果您还没有信任该文件夹，Desktop 会在保存前提示您信任它。

您也可以通过在任何会话中描述您想要的内容来创建任务。例如，"设置一个每天早上 9 点运行的日常代码审查"会创建一个定期任务，"提醒我明天下午 3 点检查部署"会创建一个一次性任务，在触发后禁用自己。

<h2 id="schedule-options">
  调度选项
</h2>

从 Schedule 控件中选择一个预设：

* **Manual**：无调度，仅在您单击 **Run now** 时运行。适用于保存您按需触发的提示
* **Hourly**：每小时运行一次
* **Daily**：显示时间选择器，默认为本地时间上午 9:00
* **Weekdays**：与 Daily 相同，但跳过星期六和星期日
* **Weekly**：显示时间选择器和日期选择器

对于选择器不提供的间隔，例如每 15 分钟、每月的第一天或在特定未来时间的单次运行，请在任何 Desktop 会话中询问 Claude 来设置调度。使用纯语言；例如，"安排一个任务每 6 小时运行一次所有测试。"

<h2 id="how-scheduled-tasks-run">
  定期任务如何运行
</h2>

定期任务在您的机器上运行。Desktop 在应用打开时每分钟检查一次调度，并在任务到期时启动一个新会话，独立于您打开的任何手动会话。每个任务在计划时间后会有几分钟的小延迟，以错开 API 流量。延迟是确定性的：同一任务总是在相同的偏移量处启动。

当任务触发时，您会收到桌面通知，新会话会在侧边栏的 **Scheduled** 部分下出现。打开它以查看 Claude 做了什么、审查更改或响应权限提示。会话的工作方式与任何其他会话相同：Claude 可以编辑文件、运行命令、创建提交和打开拉取请求。

任务仅在 desktop 应用运行且计算机处于唤醒状态时运行。如果您的计算机在计划时间内进入睡眠状态，该运行将被跳过。要防止空闲睡眠，请在 Settings 中的 **Desktop app → General** 下启用 **Keep computer awake**。关闭笔记本电脑盖仍会使其进入睡眠状态。对于需要在计算机关闭时运行或应该通过 API 调用或 GitHub 事件触发的任务，请改为创建远程 [routine](/docs/zh-CN/routines)。

<h2 id="missed-runs">
  错过的运行
</h2>

当应用启动或计算机唤醒时，Desktop 会检查每个任务是否在过去七天内错过了任何运行。如果有，Desktop 会为最近错过的时间启动恰好一次追赶运行，并丢弃任何更早的运行。一个错过六天的日常任务在唤醒时运行一次。当追赶运行启动时，Desktop 会显示通知。

在编写提示时请记住这一点。计划在上午 9 点运行的任务可能在晚上 11 点运行，如果您的计算机整天处于睡眠状态。如果时间很重要，请在提示本身中添加护栏，例如："仅审查今天的提交。如果已经是下午 5 点之后，请跳过审查，只发布一份错过内容的摘要。"

<h2 id="permissions-for-scheduled-tasks">
  定期任务的权限
</h2>

每个任务都有自己的权限模式，您在创建或编辑任务时设置。来自 `~/.claude/settings.json` 的允许规则也适用于定期任务会话。如果任务在 Ask 模式下运行并需要运行它没有权限的工具，运行将停滞，直到您批准它。会话保持在侧边栏中打开，以便您稍后可以回答。

为了避免停滞，在创建任务后单击 **Run now**，查看权限提示，并为每个提示选择"always allow"。该任务的未来运行会自动批准相同的工具，无需提示。您可以从任务的详细信息页面查看和撤销这些批准。

连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和标记为 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具在每次调用时都会提示，并且不提供"always allow"选项。调用这些工具的运行每次都会停滞。

<h2 id="manage-scheduled-tasks">
  管理定期任务
</h2>

单击 **Routines** 列表中的任务以打开其详细信息页面。从这里您可以：

* **Run now**：立即启动任务，无需等待下一个计划时间
* **Status**：在 Active 和 Paused 之间切换，以暂停或恢复定期运行，而无需删除任务
* **Edit**：更改 instructions、schedule、folder 或其他设置
* **Review history**：查看每次过去的运行，包括跳过的运行。将鼠标悬停在跳过的条目上以查看原因：您的计算机处于睡眠状态、前一次运行仍在进行中，或其他定期任务已在运行。单击 **Show more** 以加载较早的条目。
* **Review allowed permissions**：从 **Always allowed** 面板查看和撤销此任务的已保存工具批准
* **Delete**：删除任务并存档它创建的所有会话。确认对话框中会出现 **Also delete files on disk** 复选框；选中它以同时删除任务的 `SKILL.md` 文件和 `~/.claude/scheduled-tasks/` 中的关联数据。

您也可以通过在任何 Desktop 会话中询问 Claude 来列出、创建、编辑和暂停任务。例如，"pause my dependency-audit task"或"show me my scheduled tasks"。要删除任务，请使用其详细信息页面上的 **Delete** 按钮。

定期任务还可以使用 `update_scheduled_task` MCP 工具从运行中的会话内修改其自己的调度或提示。这让任务可以根据它发现的内容重新调度自己，例如，当它检测到发布分支已创建时，将代码审查重新调度为更早运行。

要在磁盘上编辑任务的提示，请打开 `~/.claude/scheduled-tasks/<task-name>/SKILL.md`（如果设置了 [`CLAUDE_CONFIG_DIR`](/docs/zh-CN/env-vars)，则在其下）。该文件使用 YAML frontmatter 表示 `name` 和 `description`，提示作为正文。更改在下一次运行时生效。Schedule、folder、model 和 enabled 状态不在此文件中：通过 Edit 表单更改它们或询问 Claude。

<h2 id="related-resources">
  相关资源
</h2>

* [Routines](/docs/zh-CN/routines)：在 Anthropic 管理的基础设施上按计划、通过 API 调用或响应 GitHub 事件运行任务，即使您的计算机关闭
* [Run prompts on a schedule](/docs/zh-CN/scheduled-tasks)：在 CLI 中使用 `/loop` 的会话范围调度
* [Claude Code GitHub Actions](/docs/zh-CN/github-actions)：在 CI 中按计划运行 Claude，而不是在您的机器上
* [Use Claude Code Desktop](/docs/zh-CN/desktop)：完整的 Desktop 应用指南
