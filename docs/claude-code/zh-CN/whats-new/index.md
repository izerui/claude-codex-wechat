> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 最新动态

> Claude Code 功能的每周摘要，包含代码片段、演示和背景信息，说明为什么这些功能很重要。

每周开发摘要突出了最有可能改变您工作方式的功能。每个条目都包括可运行的代码、简短的演示和完整文档的链接。有关每个错误修复和次要改进，请参阅[更新日志](/docs/zh-CN/changelog)。

<Update label="Week 28" description="July 6–10, 2026" tags={["v2.1.202–v2.1.206"]}>
  **桌面应用内置浏览器**：Claude Code 桌面版获得了内置浏览器，因此 Claude 可以调出文档、设计或任何其他网站，并以与本地开发服务器预览相同的方式与页面交互。

  本周还有：**`/doctor`** 是一个完整的设置检查，可以诊断问题并修复它们，`/checkup` 是其别名；**自动模式**阻止成绩单篡改，并在未解决的变量上在 `rm -rf` 之前询问；**代理视图行**显示彩色状态词和分类器编写的标题。

  [阅读 Week 28 摘要 →](/docs/zh-CN/whats-new/2026-w28)
</Update>

<Update label="Week 27" description="June 29 – July 3, 2026" tags={["v2.1.195–v2.1.201"]}>
  **Claude Sonnet 5**：Pro、Team Standard 和 Enterprise 订阅席位的新默认模型，具有顶级编码和工具使用能力，采用 Sonnet 定价，原生 1M 令牌上下文窗口，默认启用自适应思考。

  本周还有：**Chrome 中的 Claude** 在所有直接 Anthropic 计划上正式推出；**子代理默认在后台运行**，以便 Claude 在它们运行时继续工作；**Claude Desktop on Linux** 在 Ubuntu 和 Debian 上进入测试版；**`/radio`** 调入 Claude FM lo-fi 电台。

  [阅读 Week 27 摘要 →](/docs/zh-CN/whats-new/2026-w27)
</Update>

<Update label="Week 26" description="June 22–26, 2026" tags={["v2.1.185–v2.1.193"]}>
  **`claude mcp login`**：从您的 shell 中验证配置的 MCP 服务器，而不是使用交互式 `/mcp` 菜单，稍后可以使用 `claude mcp logout` 清除其存储的凭证。

  本周还有：**shell 模式响应命令输出**（`! npm test` 无需第二个提示即可获得解释）；**`/rewind`** 可以从运行 `/clear` 之前恢复对话；**后台子代理**现在在主会话中显示权限提示，而不是自动拒绝。

  [阅读 Week 26 摘要 →](/docs/zh-CN/whats-new/2026-w26)
</Update>

<Update label="Week 25" description="June 15–19, 2026" tags={["v2.1.178–v2.1.183"]}>
  **Artifacts**：将会话的输出转换为 claude.ai 上的实时、可共享页面，在会话工作时原地更新，现在在 Team 和 Enterprise 计划中处于测试版。

  本周还有：**拒绝和询问规则与工具参数匹配**，使用 `Tool(param:value)`，例如 `Agent(model:opus)`；**`/config key=value`** 从提示、`-p` 模式和远程控制中设置任何设置；**自动模式阻止破坏性 git 命令**，当您没有要求丢弃本地工作时。

  [阅读 Week 25 摘要 →](/docs/zh-CN/whats-new/2026-w25)
</Update>

<Update label="Week 24" description="June 8–12, 2026" tags={["v2.1.166–v2.1.176"]}>
  **`/cd`**：在对话中途将当前会话移动到新的工作目录，无需重建提示缓存。

  本周还有：**子代理可以生成自己的子代理**（后台链最多五层深）；**`--safe-mode`** 启动 Claude Code 时禁用所有自定义以进行故障排除；**`fallbackModel`** 配置最多三个按顺序尝试的备用模型。

  [阅读 Week 24 摘要 →](/docs/zh-CN/whats-new/2026-w24)
</Update>

<Update label="Week 23" description="June 1–5, 2026" tags={["v2.1.158–v2.1.165"]}>
  **Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上的 Auto mode**：auto mode 现在在第三方提供商上可用，支持 Opus 4.7 和 Opus 4.8，用后台安全检查替换权限提示。

  本周还有：**更安全的自动编辑**在 `acceptEdits` 模式下写入可以运行代码的文件前提示；**`/plugin list`** 内联打印您安装的插件；**版本要求**让托管部署要求批准的 Claude Code 版本范围。

  [阅读 Week 23 摘要 →](/docs/zh-CN/whats-new/2026-w23)
</Update>

<Update label="Week 22" description="May 25–29, 2026" tags={["v2.1.150–v2.1.157"]}>
  **Claude Opus 4.8**：Max、Team Premium、Enterprise 按需付费和 Anthropic API 账户的新默认模型，默认情况下高努力级别，对于最困难的任务使用 `/effort xhigh`。

  本周还有：**动态工作流**从 Claude 编写的脚本中编排数十到数百个子代理；**security-guidance plugin** 在 Claude 工作时审查其更改以查找漏洞；**快速模式**在 Opus 4.8 上运行，每 MTok 费用为 \$10/\$50。

  [阅读 Week 22 摘要 →](/docs/zh-CN/whats-new/2026-w22)
</Update>

<Update label="Week 21" description="May 18–22, 2026" tags={["v2.1.143–v2.1.149"]}>
  **Pro 计划上的 Auto mode**：auto mode 现在在 Pro 账户上运行，支持 Sonnet 4.6 和 Opus，用后台安全检查替换权限提示。

  本周还有：**`/usage`** 按 skill、subagent、plugin 和 MCP server 分解驱动您计划限制的因素；新的 **`/code-review`** 命令报告正确性错误；**后台会话**出现在 `/resume` 中，固定时保持活跃。

  [阅读 Week 21 摘要 →](/docs/zh-CN/whats-new/2026-w21)
</Update>

<Update label="Week 20" description="May 11–15, 2026" tags={["v2.1.139–v2.1.142"]}>
  **Agent view**：`claude agents` 为每个 Claude Code 会话打开一个屏幕，显示正在运行的内容、被您阻止的内容以及已完成的内容。

  本周还有：**`/goal`** 让 Claude 在多个回合中继续工作，直到满足完成条件；**快速模式**现在默认在 Opus 4.7 上运行；**Rewind 菜单**可以使用"Summarize up to here"压缩早期上下文。

  [阅读 Week 20 摘要 →](/docs/zh-CN/whats-new/2026-w20)
</Update>

<Update label="Week 19" description="May 4–8, 2026" tags={["v2.1.128–v2.1.136"]}>
  **插件从 `.zip` 存档和 URL 加载**：`--plugin-dir` 现在接受 `.zip` 文件，`--plugin-url` 为当前会话获取插件存档。

  本周还有：**`worktree.baseRef`** 选择新的 worktrees 是从远程默认分支还是本地 `HEAD` 分支；**auto mode 硬拒绝规则**无条件阻止操作，无论允许例外如何；**hooks 看到活跃的努力级别**通过 `effort.level` 和 `$CLAUDE_EFFORT`。

  [阅读 Week 19 摘要 →](/docs/zh-CN/whats-new/2026-w19)
</Update>

<Update label="Week 18" description="April 27 – May 1, 2026" tags={["v2.1.120–v2.1.126"]}>
  **没有 Git Bash 的 Windows**：不再需要 Git for Windows，当 Bash 不存在时，Claude Code 使用 PowerShell 作为 shell 工具。

  本周还有：**`claude ultrareview`** 将云代码审查带到 CI 和脚本；**`claude project purge`** 清理项目的本地状态；将 **PR URL 粘贴到 `/resume`** 中找到创建它的会话。

  [阅读 Week 18 摘要 →](/docs/zh-CN/whats-new/2026-w18)
</Update>

<Update label="Week 17" description="April 20–24, 2026" tags={["v2.1.114–v2.1.119"]}>
  **`/ultrareview`** 作为公开研究预览版开放：一队错误搜寻代理在云中运行，发现结果会自动返回到您的 CLI 或桌面应用。

  本周还有：**会话回顾**显示终端失焦时发生的情况；**自定义主题**让您可以从 `/theme` 或插件构建和发布调色板；**Claude Code 网页版**进行了重新设计，包括新的会话侧边栏和拖放布局。

  [阅读 Week 17 摘要 →](/docs/zh-CN/whats-new/2026-w17)
</Update>

<Update label="Week 16" description="April 13–17, 2026" tags={["v2.1.105–v2.1.113"]}>
  **Claude Opus 4.7** 成为 Max 和 Team Premium 的新默认版本，具有新的 `xhigh` 努力级别（推荐用于大多数编码工作）和交互式 `/effort` 滑块来调整它。

  本周还有：**Routines** 在 Claude Code 网页版上从计划、GitHub 事件或 API 调用触发模板化云代理；**移动推送通知**在长任务完成或 Claude 需要您时向您的手机发送通知；`/usage` 显示驱动您限制的因素；CLI 迁移到本机二进制文件。

  [阅读 Week 16 摘要 →](/docs/zh-CN/whats-new/2026-w16)
</Update>

<Update label="Week 15" description="April 6–10, 2026" tags={["v2.1.92–v2.1.101"]}>
  **Ultraplan** 进入早期预览：从您的 CLI 在云中草拟计划，在网页编辑器中审查和评论，然后远程运行或拉回本地。第一次运行现在会自动为您创建云环境。

  本周还有：**Monitor** 工具将后台事件流式传输到对话中，以便 Claude 可以跟踪日志并实时响应，`/loop` 在您省略间隔时自动调整速度，`/team-onboarding` 将您的设置打包成可重放的指南，`/autofix-pr` 从您的终端打开 PR 自动修复。

  [阅读 Week 15 摘要 →](/docs/zh-CN/whats-new/2026-w15)
</Update>

<Update label="Week 14" description="March 30 – April 3, 2026" tags={["v2.1.86–v2.1.91"]}>
  **计算机使用**在研究预览版中来到 CLI：Claude 可以打开本机应用、点击 UI 并从您的终端验证更改。最适合关闭只有 GUI 才能验证的事情。

  本周还有：`/powerup` 交互式课程、无闪烁的替代屏幕渲染、每个工具的 MCP 结果大小覆盖（最高 500K）和 Bash 工具 `PATH` 上的插件可执行文件。

  [阅读 Week 14 摘要 →](/docs/zh-CN/whats-new/2026-w14)
</Update>

<Update label="Week 13" description="March 23–27, 2026" tags={["v2.1.83–v2.1.85"]}>
  **Auto mode** 在研究预览版中推出：分类器处理您的权限提示，以便安全操作无中断运行，风险操作被阻止。这是批准所有内容和 `--dangerously-skip-permissions` 之间的中间地带。

  本周还有：桌面应用中的计算机使用、Web 上的 PR 自动修复、使用 `/` 的成绩单搜索、适用于 Windows 的本机 PowerShell 工具和条件 `if` hooks。

  [阅读 Week 13 摘要 →](/docs/zh-CN/whats-new/2026-w13)
</Update>
