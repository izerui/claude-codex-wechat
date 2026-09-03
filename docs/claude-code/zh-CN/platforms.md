> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 平台和集成

> 选择在哪里运行 Claude Code 以及连接什么工具。比较 CLI、Desktop、VS Code、JetBrains、Web 以及 Chrome、Slack 和 CI/CD 等集成。

Claude Code 在任何地方运行相同的底层引擎，但每个界面都针对不同的工作方式进行了优化。本页面帮助您为工作流选择合适的平台，并连接您已经使用的工具。

<h2 id="where-to-run-claude-code">
  在哪里运行 Claude Code
</h2>

根据您喜欢的工作方式和项目所在位置选择平台。

| 平台                                   | 最适合                                               | 您获得的功能                                                                                                                                                    |
| :----------------------------------- | :------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CLI](/docs/zh-CN/quickstart)             | 终端工作流、脚本编写、远程服务器                                  | 完整功能集、[Agent SDK](/docs/zh-CN/headless)、[计算机使用](/docs/zh-CN/computer-use)在 macOS 上（Pro 和 Max）、第三方提供商                                                                |
| [Desktop](/docs/zh-CN/desktop)            | 视觉审查、并行会话、托管设置                                    | Diff 查看器、应用预览、Pro 和 Max 上的[计算机使用](/docs/zh-CN/desktop#let-claude-use-your-computer)和 [Dispatch](/docs/zh-CN/desktop#sessions-from-dispatch)                         |
| [VS Code](/docs/zh-CN/vs-code)            | 在 VS Code 内工作而无需切换到终端                             | 内联 diff、集成终端、文件上下文                                                                                                                                        |
| [JetBrains](/docs/zh-CN/jetbrains)        | 在 IntelliJ、PyCharm、WebStorm 或其他 JetBrains IDE 内工作 | Diff 查看器、选择共享、终端会话                                                                                                                                        |
| [Web](/docs/zh-CN/claude-code-on-the-web) | 不需要太多操作的长时间运行任务，或应该在您离线时继续的工作                     | Anthropic 托管云、断开连接后继续运行                                                                                                                                   |
| Mobile                               | 在远离计算机时启动和监控任务                                    | 来自 iOS 和 Android 版 Claude 应用的云会话、用于本地会话的 [Remote Control](/docs/zh-CN/remote-control)、Pro 和 Max 上的 [Dispatch](/docs/zh-CN/desktop#sessions-from-dispatch) 到 Desktop |

CLI 是终端原生工作的最完整界面：脚本编写和 Agent SDK 仅限 CLI。第三方提供商也可在 [VS Code](/docs/zh-CN/vs-code#use-third-party-providers) 中使用。企业 [Desktop](/docs/zh-CN/desktop) 部署支持 Google Cloud 的 Agent Platform，Desktop 支持[网关提供商](/docs/zh-CN/llm-gateway-connect#desktop-app)；对于 Amazon Bedrock 或 Microsoft Foundry，请使用 CLI 或 VS Code，或 [Claude Desktop on 3P](https://claude.com/docs/third-party/claude-desktop/overview)，它在这些提供商上运行 Code 选项卡。Desktop 和 IDE 扩展为了视觉审查和更紧密的编辑器集成而放弃了一些仅限 CLI 的功能。Web 在 Anthropic 的云中运行，因此任务在您断开连接后继续进行。Mobile 是这些相同云会话的瘦客户端，或通过 Remote Control 进入本地会话，并可以使用 Dispatch 向 Desktop 发送任务。

您可以在同一项目上混合使用多个界面。配置、项目内存和 MCP 服务器在本地界面之间共享。

<h2 id="connect-your-tools">
  连接您的工具
</h2>

集成让 Claude 与代码库外的服务协作。

| 集成                                      | 功能                             | 用途                           |
| :-------------------------------------- | :----------------------------- | :--------------------------- |
| [Chrome](/docs/zh-CN/chrome)                 | 使用您登录的会话控制浏览器                  | 测试 Web 应用、填充表单、自动化没有 API 的网站 |
| [GitHub Actions](/docs/zh-CN/github-actions) | 在 CI 管道中运行 Claude              | 自动化 PR 审查、问题分类、计划维护          |
| [GitLab CI/CD](/docs/zh-CN/gitlab-ci-cd)     | 与 GitHub Actions 相同，但用于 GitLab | GitLab 上的 CI 驱动自动化           |
| [Code Review](/docs/zh-CN/code-review)       | 自动审查每个 PR                      | 在人工审查前捕获错误                   |
| [Slack](/docs/zh-CN/slack)                   | 响应频道中的 `@Claude` 提及            | 将错误报告转换为团队聊天中的拉取请求           |

对于此处未列出的集成，[MCP 服务器](/docs/zh-CN/mcp)和[连接器](/docs/zh-CN/desktop#connect-external-tools)让您连接几乎任何东西：Linear、Notion、Google Drive 或您自己的内部 API。

<h2 id="work-when-you-are-away-from-your-terminal">
  远离终端时工作
</h2>

Claude Code offers several ways to work when you're not at your terminal. They differ in what triggers the work, where Claude runs, and how much you need to set up.

|                                                          | Trigger                                                                                        | Claude runs on                                                                               | Setup                                                                                                                                | Best for                                                      |
| :------------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ |
| [Dispatch](/docs/en/desktop#sessions-from-dispatch)           | Message a task from the Claude mobile app                                                      | Your machine (Desktop)                                                                       | [Pair the mobile app with Desktop](https://support.claude.com/en/articles/13947068)                                                  | Delegating work while you're away, minimal setup              |
| [Remote Control](/docs/en/remote-control)                     | Drive a running session from [claude.ai/code](https://claude.ai/code) or the Claude mobile app | Your machine (CLI or VS Code)                                                                | Run `claude remote-control`                                                                                                          | Steering in-progress work from another device                 |
| [Channels](/docs/en/channels)                                 | Push events from a chat app like Telegram or Discord, or your own server                       | Your machine (CLI)                                                                           | [Install a channel plugin](/docs/en/channels#quickstart) or [build your own](/docs/en/channels-reference)                                      | Reacting to external events like CI failures or chat messages |
| [Slack](/docs/en/slack)                                       | Mention `@Claude` in a team channel                                                            | Anthropic cloud                                                                              | [Install the Slack app](/docs/en/slack#setting-up-claude-code-in-slack) with [Claude Code on the web](/docs/en/claude-code-on-the-web) enabled | PRs and reviews from team chat                                |
| [Self-hosted environments](/docs/en/self-hosted-environments) | Start a [cloud session](/docs/en/claude-code-on-the-web) and pick your organization's environment   | Your organization's infrastructure                                                           | [Deploy runners](/docs/en/self-hosted-environments-quickstart), on Team and Enterprise plans                                              | Cloud sessions that must run inside your network              |
| [Scheduled tasks](/docs/en/scheduled-tasks)                   | Set a schedule                                                                                 | [CLI](/docs/en/scheduled-tasks), [Desktop](/docs/en/desktop-scheduled-tasks), or [cloud](/docs/en/routines) | Pick a frequency                                                                                                                     | Recurring automation like daily reviews                       |

如果您不确定从哪里开始，[安装 CLI](/docs/zh-CN/quickstart) 并在项目目录中运行它。如果您不想使用终端，[Desktop](/docs/zh-CN/desktop-quickstart) 为您提供相同的引擎和图形界面。

<h2 id="related-resources">
  相关资源
</h2>

<h3 id="platforms">
  平台
</h3>

* [CLI 快速入门](/docs/zh-CN/quickstart)：在终端中安装并运行您的第一个命令
* [Desktop](/docs/zh-CN/desktop)：视觉 diff 审查、并行会话、计算机使用和 Dispatch
* [VS Code](/docs/zh-CN/vs-code)：编辑器内的 Claude Code 扩展
* [JetBrains](/docs/zh-CN/jetbrains)：IntelliJ、PyCharm 和其他 JetBrains IDE 的扩展
* [Web 上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)：断开连接时继续运行的云会话
* Mobile：用于在远离计算机时启动和监控任务的 [iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) 和 [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude) 版 Claude 应用

<h3 id="integrations">
  集成
</h3>

* [Chrome](/docs/zh-CN/chrome)：使用您登录的会话自动化浏览器任务
* [计算机使用](/docs/zh-CN/computer-use)：让 Claude 在 macOS 上打开应用和控制您的屏幕
* [GitHub Actions](/docs/zh-CN/github-actions)：在 CI 管道中运行 Claude
* [GitLab CI/CD](/docs/zh-CN/gitlab-ci-cd)：GitLab 的相同功能
* [Code Review](/docs/zh-CN/code-review)：每个拉取请求上的自动审查
* [Slack](/docs/zh-CN/slack)：从团队聊天发送任务，获取 PR 返回

<h3 id="remote-access">
  远程访问
</h3>

* [Dispatch](/docs/zh-CN/desktop#sessions-from-dispatch)：从您的手机发送任务，它可以生成 Desktop 会话
* [Remote Control](/docs/zh-CN/remote-control)：从您的手机或浏览器驱动运行中的会话
* [Channels](/docs/zh-CN/channels)：将来自聊天应用或您自己的服务器的事件推送到会话中
* [Scheduled tasks](/docs/zh-CN/scheduled-tasks)：按定期计划运行提示
