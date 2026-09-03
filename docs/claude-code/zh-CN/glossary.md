> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 术语表

> Claude Code 术语定义。了解 agentic loop、compaction、CLAUDE.md、hooks、subagents、MCP 和其他核心概念的含义。

本术语表定义了 Claude Code 术语。每个条目都链接到深入讨论该概念的页面。对于模型级概念（如 tokens、temperature 和 RAG），请参阅[平台术语表](https://platform.claude.com/docs/zh-CN/about-claude/glossary)。

<h2 id="a">
  A
</h2>

<h3 id="agent-teams">
  Agent teams
</h3>

由团队负责人协调的多个独立 Claude Code 会话，具有共享任务列表和点对点消息传递。与在单个会话中运行且仅向父级报告的 [subagents](#subagent) 不同，团队成员各自拥有自己的上下文窗口，您可以直接与任何一个交互。Agent teams 是实验性的，必须通过设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 来启用。

了解更多：[运行 agent teams](/docs/zh-CN/agent-teams)

<h3 id="agentic-coding">
  Agentic coding
</h3>

一种工作流程，其中 AI 可以自主读取文件、运行命令和进行更改，而您可以观看、重定向或离开，与只能用文本响应的基于聊天的助手相反，您必须自己应用这些响应。Claude Code 是 agentic 的，因为它拥有允许它采取行动而不仅仅是建议的[工具](#tool)。

了解更多：[Claude Code 如何工作](/docs/zh-CN/how-claude-code-works)

<h3 id="agentic-harness">
  Agentic harness
</h3>

将语言模型转变为能力强大的编码代理的工具、上下文管理和执行环境。Claude Code 是 harness；Claude 是其中的模型。Harness 提供文件访问、shell 执行、权限控制、内存加载以及链接操作的循环。

了解更多：[Claude Code 如何工作](/docs/zh-CN/how-claude-code-works)

<h3 id="agentic-loop">
  Agentic loop
</h3>

Claude 为每个任务所经历的循环：收集上下文、采取行动、验证结果并重复直到完成。每个工具使用都会返回信息，为下一步提供信息。您可以随时中断循环进行重定向。大多数扩展点，包括 [hooks](#hook)、[skills](#skill) 和 [MCP](#mcp-model-context-protocol)，都插入到此循环的特定阶段。

了解更多：[Claude Code 如何工作](/docs/zh-CN/how-claude-code-works#the-agentic-loop)

<h3 id="artifact">
  Artifact
</h3>

Claude Code 从您的会话发布到 claude.ai 上私有 URL 的实时交互式网页，因此您可以直观地查看输出或共享它，而不是阅读终端文本。当会话重新发布时，页面会就地更新。您从 Claude Code 创建的 Artifacts 出现在与 claude.ai 对话中创建的 artifacts 相同的库中。共享取决于您的计划：在 Pro 和 Max 上，任何人都可以打开的公开链接；在 Team 和 Enterprise 上，在您的组织内共享，以及一旦所有者启用它们就可以公开链接。

了解更多：[将会话输出共享为 artifacts](/docs/zh-CN/artifacts)

<h3 id="auto-memory">
  Auto memory
</h3>

Claude 根据您的更正和偏好为自己编写的笔记，按 git 存储库存储在 `~/.claude/projects/` 下。同一存储库的所有 worktrees 共享一个 auto memory 目录。`MEMORY.md` 索引的前 200 行或 25 KB 在每个会话开始时加载。Auto memory 是 Claude 编写的对应物，与您编写的 [CLAUDE.md](#claude-md) 相对。

了解更多：[Auto memory](/docs/zh-CN/memory#auto-memory)

<h3 id="auto-mode">
  Auto mode
</h3>

一种[权限模式](#permission-mode)，其中单独的分类器模型在后台审查操作，因此大多数操作无需批准提示即可运行；显式 ask 规则仍会提示。分类器阻止范围升级、不受信任的基础设施和[提示注入](#prompt-injection)。它永远看不到工具结果，因此注入的指令无法影响其决策。

了解更多：[使用 auto mode 消除提示](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode)

<h2 id="b">
  B
</h2>

<h3 id="bare-mode">
  Bare mode
</h3>

一个启动标志 `--bare`，跳过 hooks、skills、plugins、MCP servers、auto memory 和 CLAUDE.md 的自动发现。只有您显式传递的标志才会生效。建议用于 CI 和脚本调用，其中您需要在不同机器上的相同行为，无论本地配置如何。

了解更多：[使用 bare mode 更快启动](/docs/zh-CN/headless#start-faster-with-bare-mode)

<h3 id="bundled-skills">
  Bundled skills
</h3>

包含在 Claude Code 中的基于提示的 playbooks，例如 `/batch`、`/code-review`、`/debug` 和 `/loop`。与执行固定逻辑的内置命令不同，bundled skills 为 Claude 提供详细的提示并让它编排工作，因此它们可以生成代理、读取文件并适应您的代码库。

了解更多：[Bundled skills](/docs/zh-CN/skills#bundled-skills)

<h2 id="c">
  C
</h2>

<h3 id="channel">
  Channel
</h3>

一个 [MCP server](#mcp-model-context-protocol)，将事件推送到您正在运行的会话中，以便 Claude 可以对您离开终端时发生的事情做出反应。Channels 可以是双向的：Claude 读取入站事件并通过同一 channel 回复。Telegram、Discord 和 iMessage 包含在研究预览中。

了解更多：[Channels](/docs/zh-CN/channels)

<h3 id="checkpoint">
  Checkpoint
</h3>

在每个您发送的提示处创建的还原点。Claude Code 在每次编辑之前对文件进行快照，以便 checkpoint 可以恢复它们。按两次 `Esc` 或运行 `/rewind` 将代码、对话或两者恢复到较早的点，或从选定的消息总结对话的一部分。Checkpoints 是会话本地的，与 git 分开，不跟踪通过 Bash 工具进行的更改。

了解更多：[Checkpointing](/docs/zh-CN/checkpointing)

<h3 id="claude-directory">
  `.claude` directory
</h3>

Claude Code 读取项目范围配置的目录：settings、hooks、skills、subagents、rules 和 auto memory。项目在其根目录有 `.claude/`；您的用户级默认值在 `~/.claude/`。

了解更多：[The `.claude` directory](/docs/zh-CN/claude-directory)

<h3 id="claude-md">
  CLAUDE.md
</h3>

一个 markdown 文件，包含您为 Claude 编写的持久指令，在每个会话开始时作为系统提示后的用户消息加载。在此处放置项目约定、架构笔记和"始终执行 X"规则。Project-root CLAUDE.md 在 [compaction](#compaction) 期间保留，之后从磁盘重新读取。

您可以在项目范围内的 `./CLAUDE.md` 或 `./.claude/CLAUDE.md`、用户范围内的 `~/.claude/CLAUDE.md` 或作为组织的[托管策略](#managed-settings)放置 CLAUDE.md。所有发现的文件都被连接到上下文中，而不是相互覆盖，按从最广泛的范围到最具体的范围排序。

了解更多：[CLAUDE.md files](/docs/zh-CN/memory#claude-md-files)

<h3 id="command">
  Command
</h3>

一个可重用的指令，您可以通过在提示中键入 `/name` 来调用。内置命令（如 `/clear`、`/model` 和 `/compact`）控制会话。您可以在 `.claude/commands/` 中将自己的命令定义为文件，或从 [plugin](#plugin) 安装它们。[Skills](#skill) 是打包多步骤命令的推荐方式。

了解更多：[Commands](/docs/zh-CN/commands) · [Skills](/docs/zh-CN/skills)

<h3 id="compaction">
  Compaction
</h3>

当 [context window](#context-window) 接近其限制时，自动总结您的对话。首先清除较旧的工具输出，然后总结对话。Project-root CLAUDE.md 和 auto memory 在 compaction 期间保留并从磁盘重新加载；仅在对话中给出的指令可能会丢失。运行 `/compact` 手动触发，可选择使用焦点，如 `/compact focus on the API changes`。

了解更多：[What survives compaction](/docs/zh-CN/context-window#what-survives-compaction) · [When context fills up](/docs/zh-CN/how-claude-code-works#when-context-fills-up)

<h3 id="context-window">
  Context window
</h3>

会话的工作内存，保存对话历史、文件内容、命令输出、CLAUDE.md、auto memory、加载的 skills 和系统指令。当您工作时，上下文会填满直到 [compaction](#compaction) 总结它。运行 `/context` 查看什么在使用空间。对于底层模型概念，请参阅[平台术语表](https://platform.claude.com/docs/zh-CN/about-claude/glossary#context-window)。

了解更多：[Explore the context window](/docs/zh-CN/context-window)

<h2 id="d">
  D
</h2>

<h3 id="dispatch">
  Dispatch
</h3>

一个电话启动的任务路由器，当您从 Claude 移动应用发送编码任务时，在 Desktop 应用中生成 Claude Code 会话。您的提示自动路由到正确的工具。在 Pro 和 Max 计划上可用。

了解更多：[来自 Dispatch 的会话](/docs/zh-CN/desktop#sessions-from-dispatch)

<h2 id="e">
  E
</h2>

<h3 id="effort-level">
  Effort level
</h3>

一个设置，控制 Claude 在每个回合上使用多少自适应推理思考预算。更高的努力意味着更多的思考 tokens 和更深入的推理；更低的努力更快且更便宜。Effort 在 Fable 5、Opus 4.6 及更高版本以及 Sonnet 4.6 及更高版本上受支持。

了解更多：[调整 effort level](/docs/zh-CN/model-config#adjust-effort-level)

<h3 id="extended-thinking">
  Extended thinking
</h3>

模型在响应前执行的可见逐步推理。您可以使用 [effort level](#effort-level) 调整它，或使用 `MAX_THINKING_TOKENS` 在具有固定思考预算的模型上限制思考 tokens。思考在终端中以灰色斜体文本显示。

了解更多：[使用 extended thinking](/docs/zh-CN/model-config#extended-thinking)

<h2 id="h">
  H
</h2>

<h3 id="hook">
  Hook
</h3>

一个用户定义的处理程序，在 Claude Code 生命周期中的特定点自动执行，例如在工具运行之前、文件编辑之后或会话开始时。处理程序可以是 shell 命令、HTTP 端点、MCP 工具、LLM 提示或 subagent。Hooks 是确定性的：它们在固定的生命周期点触发，而不是由模型自行决定。

Hook 配置有三个级别：

* **Hook event**：生命周期点
* **Matcher**：过滤哪些事件触发它
* **Hook handler**：运行什么

了解更多：[开始使用 hooks](/docs/zh-CN/hooks-guide) · [Hooks 参考](/docs/zh-CN/hooks)

<h2 id="m">
  M
</h2>

<h3 id="managed-settings">
  Managed settings
</h3>

由 IT 或 DevOps 在组织范围内强制执行的设置，通过管理员控制台从 Anthropic 的服务器交付，或部署到 `~/.claude` 之外的操作系统级路径。用户和项目设置无法覆盖托管设置。服务器管理的交付适用于[符合条件的配置](/docs/zh-CN/server-managed-settings#platform-availability)；请参阅[安全考虑](/docs/zh-CN/server-managed-settings#security-considerations)。使用此功能可实现安全策略、合规要求或跨一个群体的标准化工具。

了解更多：[服务器管理的设置](/docs/zh-CN/server-managed-settings) · [设置文件](/docs/zh-CN/settings#settings-files)

<h3 id="mcp-model-context-protocol">
  MCP (Model Context Protocol)
</h3>

一个开放标准，用于将 AI 工具连接到外部数据源和服务。MCP servers 为 Claude 提供 Slack、Jira、数据库、浏览器和数百个其他集成的新工具。您可以通过 `/mcp` 连接服务器或将它们添加到 `.mcp.json`。对于协议本身，请参阅[平台术语表](https://platform.claude.com/docs/zh-CN/about-claude/glossary#mcp-model-context-protocol)。

了解更多：[Model Context Protocol](/docs/zh-CN/mcp)

<h3 id="mcp-tool-search">
  MCP Tool Search
</h3>

一个上下文节省机制，延迟 MCP 工具 schemas 直到需要。只有工具名称在启动时加载；Claude 在决定使用特定工具时按需获取完整 schema。这使空闲 MCP servers 不会消耗太多上下文。

了解更多：[使用 MCP Tool Search 扩展](/docs/zh-CN/mcp#scale-with-mcp-tool-search)

<h2 id="n">
  N
</h2>

<h3 id="non-interactive-mode">
  Non-interactive mode
</h3>

一种执行单个提示并退出而不进行对话会话的模式，使用 `-p` 或 `--print` 调用。用于 CI、脚本和管道。该运行仍然保存为可恢复的会话，除非您传递 `--no-session-persistence`。[Agent SDK](/docs/zh-CN/agent-sdk/overview) 是 Python 和 TypeScript 等效项。以前称为 headless mode。

了解更多：[以编程方式运行 Claude Code](/docs/zh-CN/headless)

<h2 id="o">
  O
</h2>

<h3 id="output-style">
  Output style
</h3>

一个配置，修改 Claude 的系统提示以改变响应行为、语气或格式。Output styles 关闭默认系统提示的软件工程特定部分，与 [CLAUDE.md](#claude-md) 不同，后者作为系统提示后的用户消息传递。内置样式包括 Default、Proactive、Explanatory 和 Learning。

了解更多：[Output styles](/docs/zh-CN/output-styles)

<h2 id="p">
  P
</h2>

<h3 id="permission-mode">
  Permission mode
</h3>

会话的基线批准行为。在 CLI 中使用 `Shift+Tab` 循环或在 VS Code、Desktop 和 claude.ai 中使用模式选择器。可用模式为 `default`、`acceptEdits`、`plan`、`auto`、`dontAsk` 和 `bypassPermissions`。

`default` 模式在 CLI 中标记为 Manual，在 VS Code 和 JetBrains 扩展中也标记为 Manual，在桌面应用中也标记为 Manual，Claude Code 接受 `manual` 作为该值的别名。

了解更多：[选择权限模式](/docs/zh-CN/permission-modes)

<h3 id="permission-rule">
  Permission rule
</h3>

一个设置条目，根据工具名称和参数模式允许、询问或拒绝工具调用。规则按 deny→ask→allow 顺序评估，首先匹配获胜。Permission rules 是分层在更广泛的 [permission mode](#permission-mode) 之上的细粒度控制。

了解更多：[配置权限](/docs/zh-CN/permissions)

<h3 id="plan-mode">
  Plan mode
</h3>

一种 [permission mode](#permission-mode)，其中 Claude 研究并提议更改而不编辑您的源文件。它可以读取、搜索和运行探索命令，然后在触及任何内容之前提出批准计划。使用 `/plan` 或按 `Shift+Tab` 进入 plan mode。

了解更多：[使用 plan mode 分析后再编辑](/docs/zh-CN/permission-modes#analyze-before-you-edit-with-plan-mode)

<h3 id="plugin">
  Plugin
</h3>

一个 skills、hooks、subagents 和 MCP servers 的包，打包为单个可安装单元。Plugin skills 命名为 `plugin-name:skill-name`，以便多个 plugins 共存。通过[市场](/docs/zh-CN/plugin-marketplaces)跨团队分发 plugins。

了解更多：[Plugins](/docs/zh-CN/plugins)

<h3 id="project-trust">
  Project trust
</h3>

一个对话框，在 Claude Code 加载其配置之前接受目录。接受情况按项目目录保存，除了您的主目录，其中信任仅在当前会话中保持，并在每次启动时重新显示提示。信任控制市场 plugins 的自动安装和项目定义的 hooks 的执行。信任目录意味着其 `.claude/settings.json`、`.mcp.json` 和其他配置文件生效。

了解更多：[`.claude` directory](/docs/zh-CN/claude-directory)

<h3 id="prompt-injection">
  Prompt injection
</h3>

嵌入在文件、网页或工具结果中的恶意指令，试图将 Claude 重定向到您从未要求的操作。Claude Code 的防御包括权限系统、命令黑名单和信任验证。[Auto mode](#auto-mode) 添加了一个服务器端探针，扫描工具结果中的可疑内容，以及一个永远看不到工具结果的分类器，因此注入的文本无法影响其批准决策。

了解更多：[防止提示注入](/docs/zh-CN/security#protect-against-prompt-injection)

<h2 id="r">
  R
</h2>

<h3 id="remote-control">
  Remote Control
</h3>

一种通过 claude.ai 从您的手机或浏览器继续本地 Claude Code 会话的方式。您的代码执行和文件保留在您的机器上；界面是远程的。与在 web 上运行的 Claude Code 不同，后者在云沙箱中运行。

了解更多：[Remote Control](/docs/zh-CN/remote-control)

<h3 id="rules">
  Rules
</h3>

`.claude/rules/` 中的模块化指令文件，与 CLAUDE.md 一起加载。规则可以使用 YAML `paths:` frontmatter 进行路径范围限定，因此它仅在 Claude 读取匹配文件时加载，保持上下文精简直到相关。

了解更多：[使用 `.claude/rules/` 组织规则](/docs/zh-CN/memory#organize-rules-with-claude/rules/)

<h2 id="s">
  S
</h2>

<h3 id="sandboxing">
  Sandboxing
</h3>

Bash 工具的操作系统级文件系统和网络隔离。命令在您预先定义的边界内运行，因此 Claude 可以在其中自由工作，无需每个命令的批准提示。Sandboxing 是与 [permission rules](#permission-rule) 分开的一层。

了解更多：[Sandboxing](/docs/zh-CN/sandboxing)

<h3 id="session">
  Session
</h3>

与您当前目录相关的对话，具有自己独立的 [context window](#context-window)。会话可以使用 `claude -c` 恢复，使用 `--fork-session` 分叉以在新会话 ID 下保留历史，或在终端中并行运行。运行 `/clear` 启动新会话；前一个会话保持存储并可通过 `/resume` 获得。每个会话的记录存储在 `~/.claude/projects/` 下。

了解更多：[使用会话](/docs/zh-CN/how-claude-code-works#work-with-sessions)

<h3 id="settings-layers">
  Settings layers
</h3>

Claude Code 读取配置的层次结构，按优先级顺序从最高到最低：[托管策略](#managed-settings)、命令行参数、`.claude/settings.local.json` 处的本地设置、`.claude/settings.json` 处的项目设置，然后是 `~/.claude/settings.json` 处的用户设置。数组跨层合并；更高层的标量覆盖较低的。

了解更多：[Settings files](/docs/zh-CN/settings#settings-files)

<h3 id="skill">
  Skill
</h3>

一个 `SKILL.md` 文件，包含 Claude 添加到其工具包中的指令、知识或工作流。Claude 在相关时自动加载 skill，或您可以使用 `/skill-name` 直接调用它。Skills 遵循 Agent Skills 开放标准；Claude Code 使用调用控制和 subagent 执行扩展它。

Skills 是自定义命令的推荐后继。`.claude/commands/deploy.md` 处的文件和 `.claude/skills/deploy/SKILL.md` 处的文件都创建 `/deploy` 并以相同方式工作；现有命令文件继续工作。

了解更多：[使用 skills 扩展 Claude](/docs/zh-CN/skills)

<h3 id="subagent">
  Subagent
</h3>

一个专门的 AI 助手，在其自己的上下文窗口中运行，具有自定义系统提示、特定工具访问和独立权限。它处理委派任务并向主对话返回摘要。使用 subagents 将大型探索保留在主上下文之外或运行并行研究。与 [agent teams](#agent-teams) 不同，其中每个代理都是您可以直接交谈的完整独立会话。

内置 subagents 包括 Explore、Plan 和通用目的。

了解更多：[创建自定义 subagents](/docs/zh-CN/sub-agents)

<h3 id="surface">
  Surface
</h3>

您访问 Claude Code 的任何地方：CLI、VS Code、JetBrains、Desktop 或 claude.ai。所有 surfaces 共享相同的引擎，因此您的 CLAUDE.md、settings 和 skills 在所有 surfaces 上以相同方式工作。Slack 和 Chrome 扩展是连接到 surface 的集成，而不是 surfaces 本身。

了解更多：[平台和集成](/docs/zh-CN/platforms)

<h2 id="t">
  T
</h2>

<h3 id="teleport">
  Teleport
</h3>

一个命令 `/teleport`，将云 Claude Code 会话拉入您的本地终端。Claude 获取分支、加载对话历史并从 web 会话的最后状态恢复。反向方向是 `--cloud`，它将本地任务发送到 web 上运行。

了解更多：[从 web 到终端](/docs/zh-CN/claude-code-on-the-web#from-web-to-terminal)

<h3 id="tool">
  Tool
</h3>

Claude 可以采取的操作：读取文件、编辑代码、运行 shell 命令、搜索 web、生成 subagent。Tools 是使 Claude Code agentic 的原因。没有它们，Claude 只能用文本响应。每个工具使用都会返回一个结果，为 [agentic loop](#agentic-loop) 中 Claude 的下一个决策提供信息。

了解更多：[Claude 可用的工具](/docs/zh-CN/tools-reference)

<h3 id="turn">
  Turn
</h3>

Claude 在一个 [session](#session) 中的一个完整响应。一个 turn 从您发送消息开始，到 Claude 完成响应结束，中间可能有任意数量的 [tool](#tool) 调用。[Stop hooks](#hook) 在每个 turn 的末尾触发。一个 session 由许多 turn 组成，[agentic loop](#agentic-loop) 描述了在一个 turn 内发生的情况。

了解更多：[Claude Code 如何工作](/docs/zh-CN/how-claude-code-works#the-agentic-loop)

<h2 id="v">
  V
</h2>

<h3 id="verification-loop">
  Verification loop
</h3>

一个会话知道工作实际完成而不仅仅是看起来合理的方式。您给 Claude 一个它可以运行的检查，例如测试套件、构建或屏幕截图比较，Claude 迭代直到检查通过，而不是在一次尝试后停止。验证循环是 [`/goal`](/docs/zh-CN/goal)、无人值守运行和[动态工作流](/docs/zh-CN/workflows)的先决条件：没有它，唯一决定代理完成的东西就是代理本身。

了解更多：[给 Claude 一种验证其工作的方式](/docs/zh-CN/best-practices#give-claude-a-way-to-verify-its-work)

<h2 id="w">
  W
</h2>

<h3 id="worktree-isolation">
  Worktree isolation
</h3>

一个隔离模式，在 `.claude/worktrees/` 下的单独 git worktree 中运行 Claude，使用 `-w` 标志或 subagent 配置中的 `isolation: worktree` 启用。更改保留在单独分支的单独目录中，因此并行代理不会覆盖彼此的文件。

了解更多：[使用 git worktrees 运行并行会话](/docs/zh-CN/worktrees)

***

<h2 id="deprecated-and-renamed-terms">
  已弃用和重命名的术语
</h2>

这些术语出现在较旧的文档、博客文章和社区内容中。搜索此网站时使用当前名称。

| 旧术语             | 现在称为                                          | 注释                         |
| --------------- | --------------------------------------------- | -------------------------- |
| Headless mode   | [Non-interactive mode](#non-interactive-mode) | 相同的 `-p` 标志，相同的行为          |
| Custom commands | [Skills](#skill)                              | `.claude/commands/` 文件仍然有效 |
| Slash commands  | Commands                                      | "Slash"从产品副本中删除            |
