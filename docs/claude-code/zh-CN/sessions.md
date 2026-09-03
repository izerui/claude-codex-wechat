> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 管理会话

> 命名、恢复、分支和在 Claude Code 对话之间切换。涵盖 `--continue`、`--resume`、`--from-pr`、`/resume` 选择器、会话命名、导出文本记录和文本记录存储位置。

会话是与项目目录关联的已保存对话。Claude Code 在您工作时将其本地存储，因此您可以从中断处恢复、分支以尝试不同的方法，或在任务之间切换。

[桌面应用](/docs/zh-CN/desktop#work-in-parallel-with-sessions)、[网页版 Claude Code](/docs/zh-CN/claude-code-on-the-web) 和 [VS Code 扩展](/docs/zh-CN/vs-code#resume-past-conversations)各自维护自己的会话历史记录。本页涵盖 CLI。

<h2 id="resume-a-session">
  恢复会话
</h2>

会话在您工作时持续保存到[本地文本记录文件](#export-and-locate-session-data)，因此您可以在退出或运行 `/clear` 后返回到一个会话。使用这些入口点：

| 命令                          | 功能                                 |
| :-------------------------- | :--------------------------------- |
| `claude --continue`         | 恢复当前目录中最近的会话                       |
| `claude --resume`           | 打开[会话选择器](#use-the-session-picker) |
| `claude --resume <name>`    | 直接恢复命名的会话                          |
| `claude --from-pr <number>` | 恢复链接到该拉取请求的会话                      |
| `/resume`                   | 从活跃会话内切换到不同的对话                     |

使用 [`claude -p`](/docs/zh-CN/headless) 或 [Agent SDK](/docs/zh-CN/agent-sdk/overview) 创建的会话不会出现在会话选择器中，但您仍然可以通过将其会话 ID 传递给 `claude --resume <session-id>` 来恢复它。从会话启动所在的目录运行此命令：会话 ID 查找的范围限于当前项目目录及其 git worktrees，因此在其他地方创建的会话会报告 `No conversation found with session ID: <session-id>`。

<h3 id="where-the-session-picker-looks">
  会话选择器查看的位置
</h3>

会话按项目目录存储。默认情况下，会话选择器显示来自当前 worktree 的交互式会话，以及在其他地方启动但使用 `/add-dir` 添加了当前目录的会话。使用 `Ctrl+W` 扩展到存储库的所有 worktree，或使用 `Ctrl+A` 扩展到此计算机上的每个项目。

从 v2.1.169 开始，使用 [`/cd`](/docs/zh-CN/commands) 移动会话会将其重新定位到新目录的项目存储中，因此之后它会出现在该目录的选择器中。从 v2.1.196 开始，移动的会话在崩溃或强制退出后会保持不在旧目录的选择器中。在较早的版本中，当旧路径包含下划线等特殊字符时，在不干净的退出后，它也可能在旧目录的列表中重新出现。

从同一存储库的另一个 worktree 选择会话会在原地恢复它。从不相关项目选择会话会将 `cd` 和恢复命令复制到您的剪贴板。

按名称恢复会跨当前存储库及其 worktree 解析。两种形式都查找精确匹配并直接恢复它，即使它位于不同的 worktree 中：

| 命令                       | 精确匹配 | 模糊名称                           |
| :----------------------- | :--- | :----------------------------- |
| `claude --resume <name>` | 直接恢复 | 打开会话选择器，名称预填充为搜索词              |
| `/resume <name>`         | 直接恢复 | 报告错误；运行不带参数的 `/resume` 打开会话选择器 |

<h2 id="name-your-sessions">
  命名您的会话
</h2>

为会话提供描述性名称，以便在会话选择器中可以找到它们，并可以按名称恢复。当您并行处理多个任务时，这一点最重要。

| 时间     | 如何设置名称                                                                                                   |
| :----- | :------------------------------------------------------------------------------------------------------- |
| 启动时    | `claude -n auth-refactor`                                                                                |
| 在会话期间  | `/rename auth-refactor`。名称也会出现在提示栏上                                                                      |
| 从会话选择器 | 突出显示会话并按 `Ctrl+R`                                                                                        |
| 在计划接受时 | 在 [Plan Mode](/docs/zh-CN/permission-modes#analyze-before-you-edit-with-plan-mode) 中接受计划会从计划内容命名会话，除非您已经设置了一个 |

会话命名后，使用 `claude --resume <name>` 或 `/resume <name>` 返回到它。有关名称解析如何跨 worktrees 工作的信息，请参阅[恢复会话](#resume-a-session)。

您从未命名的交互式会话在启动时仍会获得默认显示名称。需要 Claude Code v2.1.196 或更高版本。默认名称将工作目录的名称与两个字符的后缀组合在一起，例如 `my-app-3f`，并在运行会话的列表中标识会话，例如 [agent view](/docs/zh-CN/agent-view) 和 `claude agents --json` 输出。

默认名称不是恢复句柄：`claude --resume <name>`、`/resume <name>` 和会话选择器仅匹配您设置的名称。命名会话会替换默认名称。

<h2 id="use-the-session-picker">
  使用会话选择器
</h2>

在会话内运行 `/resume`，或不带参数运行 `claude --resume`，以打开交互式会话选择器。使用这些快捷键导航、搜索和扩展列表：

| 快捷键                      | 操作                                                                               |
| :----------------------- | :------------------------------------------------------------------------------- |
| `↑` / `↓`                | 在会话之间导航                                                                          |
| `→` / `←`                | 展开或折叠分组的会话                                                                       |
| `Enter`                  | 恢复突出显示的会话                                                                        |
| `Space`                  | 预览会话内容。在不将其捕获为粘贴的终端上也可以使用 `Ctrl+V`                                               |
| `Ctrl+R`                 | 重命名突出显示的会话                                                                       |
| `/` 或除 `Space` 外的任何可打印字符 | 进入搜索模式并过滤会话。粘贴 GitHub、GitHub Enterprise、GitLab 或 Bitbucket 拉取或合并请求 URL 以查找创建它的会话 |
| `Ctrl+A`                 | 显示此计算机上所有项目的会话。再次按下以返回到当前存储库                                                     |
| `Ctrl+W`                 | 显示当前存储库所有 worktrees 的会话。再次按下以返回到当前 worktree。仅在多 worktree 存储库中显示                  |
| `Ctrl+B`                 | 过滤到当前 git 分支的会话。再次按下以显示所有分支                                                      |
| `Esc`                    | 退出会话选择器或搜索模式                                                                     |

每行显示会话名称（如果已设置），否则显示对话摘要或第一个提示，以及自上次活动以来的时间、消息计数和 git 分支。使用 `Ctrl+A` 扩展到所有项目后，项目路径会出现。

使用 `/branch`、`/rewind` 或 `--fork-session` 创建的分叉会话会分组在其根会话下。按 `→` 展开一个组。

<h2 id="branch-a-session">
  分支会话
</h2>

分支创建迄今为止对话的副本并将您切换到其中，保持原始对话完整。使用它来尝试不同的方法而不会丢失您所在的路径。

从会话内，运行带有可选名称的 `/branch`：

```text theme={null}
/branch try-streaming-approach
```

如果您省略名称，Claude Code 会根据对话中的第一个提示为新分支命名。从 v2.1.198 开始，这也适用于 [compaction](/docs/zh-CN/how-claude-code-works#when-context-fills-up) 之后；较早的版本会回退到字面名称 `Branched conversation`，而不是查看 compaction 摘要之外的原始第一个提示。

从命令行，将 `--continue` 或 `--resume` 与 `--fork-session` 结合：

```bash theme={null}
claude --continue --fork-session
```

原始会话保持不变，并在会话选择器中保持可用。`/branch` 确认打印两个会话 ID：您现在所在的新分支和原始分支。要返回到原始分支，将其 ID 传递给 `/resume`、使用会话选择器或运行 `/resume <original-name>`。您使用"允许此会话"批准的权限不会转移到新分支。如果您在两个终端中恢复同一会话而不分叉，来自两者的消息会交错到一个文本记录中。

对于单个会话内基于 checkpoint 的回退，请参阅 [Checkpointing](/docs/zh-CN/checkpointing)。

<h2 id="manage-context-within-a-session">
  管理会话内的上下文
</h2>

这些命令控制上下文窗口中的内容而不离开会话：

* **`/clear`**：以空上下文重新开始。之前的对话已保存并可通过 `/resume` 恢复，或在同一个 Claude Code 进程中，从[倒带菜单的上一个会话条目](/docs/zh-CN/checkpointing#rewind-past-a-cleared-conversation)恢复
* **`/compact [instructions]`**：用摘要替换历史记录，可选地专注于您指定的内容
* **`/context`**：显示当前消耗的上下文

有关压缩如何与 CLAUDE.md、skills 和规则交互的信息，请参阅[上下文窗口指南](/docs/zh-CN/context-window)。有关何时清除与压缩的策略，请参阅[最佳实践](/docs/zh-CN/best-practices#manage-your-session)。

<h2 id="export-and-locate-session-data">
  导出和定位会话数据
</h2>

运行 `/export` 打开一个菜单，让您将当前对话复制到剪贴板或将其保存为纯文本文件，消息和工具输出呈现为可读文本。传递文件名以跳过菜单并直接写入该文件。

<h3 id="access-conversations-from-scripts">
  从脚本访问对话
</h3>

`/export` 生成一个供人阅读的呈现文本记录。下面的接口生成结构化数据供脚本解析：运行的 JSON 结果、会话文本记录文件的路径或事件的实时流。根据触发脚本的内容选择：

* **运行 Claude 一次并捕获结果**：使用 [`--output-format json` 或 `stream-json`](/docs/zh-CN/headless#get-structured-output) 调用 `claude -p` 以捕获非交互式运行的结果、会话 ID、使用情况和成本作为结构化 JSON。
* **向现有会话提问**：将会话 ID 传递给 [`claude -p --resume`](/docs/zh-CN/headless#continue-conversations) 以发送后续提示（例如摘要请求），并捕获结构化响应。
* **对会话事件做出反应**：读取 [hooks](/docs/zh-CN/hooks#common-input-fields) 和 [status line commands](/docs/zh-CN/statusline#available-data) 作为输入接收的 `transcript_path` 字段。`SessionEnd` hook 可以在会话结束时存档文本记录。
* **在 TypeScript 或 Python 应用中嵌入 Claude**：使用 [Agent SDK](/docs/zh-CN/agent-sdk/overview) 以编程方式接收每条消息。

下面的示例使用第二个接口。它向现有会话发送后续提示，并使用 `jq` 读取答案：

```bash theme={null}
claude -p --resume <session-id> --output-format json "summarize what we changed" | jq -r '.result'
```

<h3 id="where-transcripts-are-stored">
  文本记录存储位置
</h3>

默认情况下，文本记录存储为 JSONL，位置为 `~/.claude/projects/<project>/<session-id>.jsonl`，其中 `<project>` 是您的工作目录路径，非字母数字字符被替换为 `-`。每行是消息、工具使用或元数据条目的 JSON 对象。条目格式是 Claude Code 的内部格式，在版本之间会发生变化，因此直接解析这些文件的脚本可能在任何版本上中断。要基于会话数据构建，请改用 `/export` 或 [脚本接口](#access-conversations-from-scripts)。

位置、保留期和写入行为是可配置的：

| 目的                | 设置                                                        | 位置                         |
| ----------------- | --------------------------------------------------------- | -------------------------- |
| 将存储移出 `~/.claude` | [`CLAUDE_CONFIG_DIR`](/docs/zh-CN/env-vars)                    | 环境变量                       |
| 更改 30 天保留期        | [`cleanupPeriodDays`](/docs/zh-CN/settings#available-settings) | `settings.json`            |
| 在所有模式下禁止文本记录写入    | [`CLAUDE_CODE_SKIP_PROMPT_HISTORY`](/docs/zh-CN/env-vars)      | 环境变量                       |
| 禁止一次非交互式运行的写入     | [`--no-session-persistence`](/docs/zh-CN/cli-reference)        | 与 `claude -p` 一起使用的 CLI 标志 |

<h2 id="see-also">
  另请参阅
</h2>

这些页面涵盖相关的会话和并行性机制：

* [Worktrees](/docs/zh-CN/worktrees)：在单独的分支上运行隔离的并行会话
* [Checkpointing](/docs/zh-CN/checkpointing)：将代码和对话回退到较早的点
* [Context window](/docs/zh-CN/context-window)：什么填充上下文以及什么在压缩中保留
* [Non-interactive mode](/docs/zh-CN/headless)：`claude -p` 下的会话行为
