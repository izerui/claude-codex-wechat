> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 常见工作流程

> 使用 Claude Code 探索代码库、修复错误、重构、测试和其他日常任务的分步指南。

本页收集了日常开发的简短工作流程。有关提示和上下文管理的更高级指导，请参阅[最佳实践](/docs/zh-CN/best-practices)。

本页涵盖：

* [提示工作流程](#prompt-recipes)，用于探索代码、修复错误、重构、测试、PR 和文档
* [恢复以前的对话](#resume-previous-conversations)，以便任务可以跨越多个会话
* [使用 worktrees 运行并行会话](#run-parallel-sessions-with-worktrees)，以便并发编辑不会冲突
* [编辑前规划](#plan-before-editing)，以在更改接触磁盘前审查更改
* [将研究委派给 subagents](#delegate-research-to-subagents)，以保持主上下文清洁
* [将 Claude 管道输入脚本](#pipe-claude-into-scripts)，用于 CI 和批处理

<h2 id="prompt-recipes">
  提示工作流程
</h2>

这些是日常任务的提示模式，如探索陌生代码、调试、重构、编写测试和创建 PR。每个都可以在任何 Claude Code 界面中工作；根据您的项目调整措辞。

<h3 id="understand-new-codebases">
  理解新的代码库
</h3>

有关在 monorepo 或大型代码库中配置 Claude Code 的信息，请参阅 [Monorepos 和大型存储库](/docs/zh-CN/large-codebases)。

<h4 id="get-a-quick-codebase-overview">
  快速获取代码库概览
</h4>

假设您刚加入一个新项目，需要快速了解其结构。

<Steps>
  <Step title="导航到项目根目录">
    ```bash theme={null}
    cd /path/to/project 
    ```
  </Step>

  <Step title="启动 Claude Code">
    ```bash theme={null}
    claude 
    ```
  </Step>

  <Step title="请求高级概览">
    ```text theme={null}
    give me an overview of this codebase
    ```
  </Step>

  <Step title="深入了解特定组件">
    ```text theme={null}
    explain the main architecture patterns used here
    ```

    ```text theme={null}
    what are the key data models?
    ```

    ```text theme={null}
    how is authentication handled?
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * 从广泛的问题开始，然后缩小到特定领域
  * 询问项目中使用的编码约定和模式
  * 请求项目特定术语的词汇表
</Tip>

<h4 id="find-relevant-code">
  查找相关代码
</h4>

假设您需要定位与特定功能相关的代码。

<Steps>
  <Step title="要求 Claude 查找相关文件">
    ```text theme={null}
    find the files that handle user authentication
    ```
  </Step>

  <Step title="获取有关组件如何交互的上下文">
    ```text theme={null}
    how do these authentication files work together?
    ```
  </Step>

  <Step title="理解执行流程">
    ```text theme={null}
    trace the login process from front-end to database
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * 明确说明您要查找的内容
  * 使用项目中的领域语言
  * 为您的语言安装[代码智能插件](/docs/zh-CN/discover-plugins#code-intelligence)，以便 Claude 能够精确地进行"转到定义"和"查找引用"导航
</Tip>

***

<h3 id="fix-bugs-efficiently">
  高效修复错误
</h3>

假设您遇到了错误消息，需要找到并修复其来源。

<Steps>
  <Step title="与 Claude 分享错误">
    ```text theme={null}
    I'm seeing an error when I run npm test
    ```
  </Step>

  <Step title="请求修复建议">
    ```text theme={null}
    suggest a few ways to fix the @ts-ignore in user.ts
    ```
  </Step>

  <Step title="应用修复">
    ```text theme={null}
    update user.ts to add the null check you suggested
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * 告诉 Claude 重现问题的命令并获取堆栈跟踪
  * 提及重现错误的任何步骤
  * 让 Claude 知道错误是间歇性的还是持续的
</Tip>

***

<h3 id="refactor-code">
  重构代码
</h3>

假设您需要更新旧代码以使用现代模式和实践。

<Steps>
  <Step title="识别用于重构的遗留代码">
    ```text theme={null}
    find deprecated API usage in our codebase
    ```
  </Step>

  <Step title="获取重构建议">
    ```text theme={null}
    suggest how to refactor utils.js to use modern JavaScript features
    ```
  </Step>

  <Step title="安全地应用更改">
    ```text theme={null}
    refactor utils.js to use ES2024 features while maintaining the same behavior
    ```
  </Step>

  <Step title="验证重构">
    ```text theme={null}
    run tests for the refactored code
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * 要求 Claude 解释现代方法的优势
  * 在需要时请求更改保持向后兼容性
  * 以小的、可测试的增量进行重构
</Tip>

***

<h3 id="work-with-tests">
  使用测试
</h3>

假设您需要为未覆盖的代码添加测试。

<Steps>
  <Step title="识别未测试的代码">
    ```text theme={null}
    find functions in NotificationsService.swift that are not covered by tests
    ```
  </Step>

  <Step title="生成测试脚手架">
    ```text theme={null}
    add tests for the notification service
    ```
  </Step>

  <Step title="添加有意义的测试用例">
    ```text theme={null}
    add test cases for edge conditions in the notification service
    ```
  </Step>

  <Step title="运行并验证测试">
    ```text theme={null}
    run the new tests and fix any failures
    ```
  </Step>
</Steps>

Claude 可以生成遵循您项目现有模式和约定的测试。请求测试时，请明确说明您想验证的行为。Claude 检查您现有的测试文件以匹配已在使用的样式、框架和断言模式。

为了获得全面的覆盖，要求 Claude 识别您可能遗漏的边界情况。Claude 可以分析您的代码路径并建议测试错误条件、边界值和容易被忽视的意外输入。

***

<h3 id="create-pull-requests">
  创建拉取请求
</h3>

您可以通过直接要求 Claude 创建拉取请求（"create a pr for my changes"），或逐步指导 Claude：

<Steps>
  <Step title="总结您的更改">
    ```text theme={null}
    summarize the changes I've made to the authentication module
    ```
  </Step>

  <Step title="生成拉取请求">
    ```text theme={null}
    create a pr
    ```
  </Step>

  <Step title="审查和细化">
    ```text theme={null}
    enhance the PR description with more context about the security improvements
    ```
  </Step>
</Steps>

当您使用 `gh pr create` 创建 PR 时，会话会自动链接到该 PR。要稍后返回它，请运行 `claude --from-pr 123`，将 123 替换为 PR 编号，或将 PR URL 粘贴到[`/resume` 选择器](/docs/zh-CN/sessions#use-the-session-picker)搜索中。

<Tip>
  在提交前审查 Claude 生成的 PR，并要求 Claude 突出显示潜在的风险或注意事项。
</Tip>

<h3 id="handle-documentation">
  处理文档
</h3>

假设您需要为代码添加或更新文档。

<Steps>
  <Step title="识别未记录的代码">
    ```text theme={null}
    find functions without proper JSDoc comments in the auth module
    ```
  </Step>

  <Step title="生成文档">
    ```text theme={null}
    add JSDoc comments to the undocumented functions in auth.js
    ```
  </Step>

  <Step title="审查和增强">
    ```text theme={null}
    improve the generated documentation with more context and examples
    ```
  </Step>

  <Step title="验证文档">
    ```text theme={null}
    check if the documentation follows our project standards
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * 指定您想要的文档样式（JSDoc、docstrings 等）
  * 请求文档中的示例
  * 请求公共 API、接口和复杂逻辑的文档
</Tip>

***

<h3 id="work-in-notes-and-non-code-folders">
  在笔记和非代码文件夹中工作
</h3>

Claude Code 可以在任何目录中工作。在笔记库、文档文件夹或任何 markdown 文件集合中运行它，以搜索、编辑和重新组织内容，就像处理代码一样。

`.claude/` 目录和 `CLAUDE.md` 与其他工具的配置目录并排存在，不会产生冲突。Claude 在每次工具调用时都会重新读取文件，因此它会在下次读取该文件时看到您在另一个应用程序中所做的编辑。

***

<h3 id="work-with-images">
  使用图像
</h3>

假设您需要在代码库中使用图像，并希望 Claude 帮助分析图像内容。

<Steps>
  <Step title="将图像添加到对话中">
    您可以使用以下任何方法：

    1. 将图像拖放到 Claude Code 窗口中
    2. 复制图像并使用 Ctrl+V 将其粘贴到 CLI 中。在 macOS 上，Cmd+V 也适用于 iTerm2。
    3. 向 Claude 提供图像路径。例如，"Analyze this image: /path/to/your/image.png"
  </Step>

  <Step title="要求 Claude 分析图像">
    ```text theme={null}
    What does this image show?
    ```

    ```text theme={null}
    Describe the UI elements in this screenshot
    ```

    ```text theme={null}
    Are there any problematic elements in this diagram?
    ```
  </Step>

  <Step title="使用图像获取上下文">
    ```text theme={null}
    Here's a screenshot of the error. What's causing it?
    ```

    ```text theme={null}
    This is our current database schema. How should we modify it for the new feature?
    ```
  </Step>

  <Step title="从视觉内容获取代码建议">
    ```text theme={null}
    Generate CSS to match this design mockup
    ```

    ```text theme={null}
    What HTML structure would recreate this component?
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * 当文本描述不清楚或繁琐时使用图像
  * 包含错误、UI 设计或图表的屏幕截图以获得更好的上下文
  * 您可以在对话中使用多个图像
  * 图像分析适用于图表、屏幕截图、模型等
  * 当 Claude 引用图像时（例如，`[Image #1]`），`Cmd+Click`（Mac）或 `Ctrl+Click`（Windows/Linux）链接以在默认查看器中打开图像
</Tip>

***

<h3 id="reference-files-and-directories">
  引用文件和目录
</h3>

使用 @ 快速包含文件或目录，无需等待 Claude 读取它们。

<Steps>
  <Step title="引用单个文件">
    ```text theme={null}
    Explain the logic in @src/utils/auth.js
    ```

    这在对话中包含文件的完整内容。
  </Step>

  <Step title="引用目录">
    ```text theme={null}
    What's the structure of @src/components?
    ```

    这提供了带有文件信息的目录列表。
  </Step>

  <Step title="引用 MCP 资源">
    ```text theme={null}
    Show me the data from @github:repos/owner/repo/issues
    ```

    这使用 @server:resource 格式从连接的 MCP 服务器获取数据。有关详细信息，请参阅 [MCP 资源](/docs/zh-CN/mcp#use-mcp-resources)。
  </Step>
</Steps>

<Tip>
  提示：

  * 文件路径可以是相对的或绝对的
  * @ 文件引用在文件的目录和父目录中添加 `CLAUDE.md` 到上下文
  * 目录引用显示文件列表，而不是内容
  * 您可以在单个消息中引用多个文件（例如，"@file1.js and @file2.js"）
</Tip>

***

<h3 id="run-claude-on-a-schedule">
  按计划运行 Claude
</h3>

假设您想让 Claude 自动定期处理任务，如每天早上审查开放的 PR、每周审计依赖项或在夜间检查 CI 失败。

根据您希望任务运行的位置选择调度选项：

| 选项                                       | 运行位置              | 最适合                                                                                                               |
| :--------------------------------------- | :---------------- | :---------------------------------------------------------------------------------------------------------------- |
| [Routines](/docs/zh-CN/routines)              | Anthropic 管理的基础设施 | 即使您的计算机关闭也应该运行的任务。也可以在 API 调用或 GitHub 事件上触发，除了计划。在 [claude.ai/code/routines](https://claude.ai/code/routines) 配置。 |
| [桌面计划任务](/docs/zh-CN/desktop-scheduled-tasks) | 您的机器，通过桌面应用       | 需要直接访问本地文件、工具或未提交更改的任务。                                                                                           |
| [GitHub Actions](/docs/zh-CN/github-actions)  | 您的 CI 管道          | 与存储库事件（如打开的 PR）相关的任务，或应该与工作流配置一起存在的 cron 计划。                                                                      |
| [`/loop`](/docs/zh-CN/scheduled-tasks)        | 当前 CLI 会话         | 会话打开时的快速轮询。任务在您开始新对话时停止；`--resume` 和 `--continue` 恢复未过期的任务。                                                       |

<Tip>
  为计划任务编写提示时，明确说明成功是什么样的以及如何处理结果。任务自主运行，所以它不能提出澄清问题。例如："审查标记为 `needs-review` 的开放 PR，对任何问题留下内联评论，并在 `#eng-reviews` Slack 频道中发布摘要。"
</Tip>

***

<h3 id="ask-claude-about-its-capabilities">
  询问 Claude 关于其功能
</h3>

Claude 内置访问其文档，可以回答关于其自身功能和限制的问题。

<h4 id="example-questions">
  示例问题
</h4>

```text theme={null}
can Claude Code create pull requests?
```

```text theme={null}
how does Claude Code handle permissions?
```

```text theme={null}
what skills are available?
```

```text theme={null}
how do I use MCP with Claude Code?
```

```text theme={null}
how do I configure Claude Code for Amazon Bedrock?
```

```text theme={null}
what are the limitations of Claude Code?
```

<Note>
  Claude 基于文档提供对这些问题的答案。有关可执行示例和实际演示，请运行 `/powerup` 以获得带有动画演示的交互式课程，或参考上面的特定工作流程部分。
</Note>

<Tip>
  提示：

  * Claude 始终可以访问最新的 Claude Code 文档，无论您使用的版本如何
  * 提出具体问题以获得详细答案
  * Claude 可以解释复杂的功能，如 MCP 集成、企业配置和高级工作流程
</Tip>

***

<h2 id="resume-previous-conversations">
  恢复以前的对话
</h2>

当任务跨越多个会话时，从您离开的地方继续，而不是重新解释上下文。Claude Code 在本地保存每个对话。

```bash theme={null}
claude --continue
```

这会恢复当前目录中最近的会话；如果还没有，它会打印 `No conversation found to continue` 并退出。使用 `claude --resume` 从列表中选择，或从运行中的会话内使用 `/resume`。有关命名、分支和完整选择器参考，请参阅[管理会话](/docs/zh-CN/sessions)。

<h2 id="run-parallel-sessions-with-worktrees">
  使用 worktrees 运行并行会话
</h2>

在一个终端中处理功能，同时 Claude 在另一个终端中修复错误，而不会编辑冲突。每个 worktree 是其自己分支上的单独检出。

```bash theme={null}
claude --worktree feature-auth
```

在第二个终端中使用不同的名称运行相同的命令以启动隔离的并行会话。有关清理、`.worktreeinclude` 和非 git VCS 支持，请参阅 [Worktrees](/docs/zh-CN/worktrees)。要从一个屏幕而不是单独的终端监视并行会话，请参阅[后台代理](/docs/zh-CN/agent-view)。

<h2 id="plan-before-editing">
  编辑前规划
</h2>

对于您想在接触磁盘前审查的更改，切换到 plan mode。Claude 读取文件并提出计划，但在您批准前不进行任何编辑。

```bash theme={null}
claude --permission-mode plan
```

您也可以在会话中按 `Shift+Tab` 切换到 plan mode。有关批准流程和在文本编辑器中编辑计划，请参阅 [Plan mode](/docs/zh-CN/permission-modes#analyze-before-you-edit-with-plan-mode)。

<h2 id="delegate-research-to-subagents">
  将研究委派给 subagents
</h2>

探索大型代码库会用文件读取填充您的上下文。委派探索，以便只有发现结果返回。

```text theme={null}
use a subagent to investigate how our auth system handles token refresh
```

subagent 在其自己的上下文窗口中读取文件并报告摘要。有关定义具有自己工具和提示的自定义代理，请参阅 [Subagents](/docs/zh-CN/sub-agents)。

<h2 id="pipe-claude-into-scripts">
  将 Claude 管道输入脚本
</h2>

以非交互方式运行 Claude 用于 CI、预提交钩子或批处理。stdin 和 stdout 像任何 Unix 工具一样工作。

```bash theme={null}
git log --oneline -20 | claude -p "summarize these recent commits"
```

有关输出格式、权限标志和扇出模式，请参阅[非交互模式](/docs/zh-CN/headless)。

<h2 id="next-steps">
  后续步骤
</h2>

<CardGroup cols={2}>
  <Card title="最佳实践" icon="lightbulb" href="/docs/zh-CN/best-practices">
    充分利用 Claude Code 的模式
  </Card>

  <Card title="管理会话" icon="rotate-left" href="/docs/zh-CN/sessions">
    恢复、命名和分支对话
  </Card>

  <Card title="Worktrees" icon="code-branch" href="/docs/zh-CN/worktrees">
    运行隔离的并行会话
  </Card>

  <Card title="扩展 Claude Code" icon="puzzle-piece" href="/docs/zh-CN/features-overview">
    添加 skills、hooks、MCP、subagents 和插件
  </Card>
</CardGroup>
