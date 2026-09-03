> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 开始使用桌面应用

> 在桌面上安装 Claude Code 并开始您的第一个编码会话

桌面应用为您提供具有图形界面的 Claude Code，专为并行运行多个会话而构建：用于管理并行工作的侧边栏、带有集成终端和文件编辑器的拖放布局、可视化差异审查、实时应用预览、GitHub PR 监控和自动合并以及计划任务。无需终端。

<CardGroup cols={3}>
  <Card title="Download for macOS" icon="apple" href="https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect?utm_source=claude_code&utm_medium=docs">
    Universal build for Intel and Apple Silicon
  </Card>

  <Card title="Download for Windows" icon="windows" href="https://claude.ai/api/desktop/win32/x64/setup/latest/redirect?utm_source=claude_code&utm_medium=docs">
    For x64 processors
  </Card>

  <Card title="Get Claude for Linux (beta)" icon="linux" href="/docs/en/desktop-linux">
    apt or .deb for Ubuntu and Debian
  </Card>
</CardGroup>

For Windows ARM64, download the [ARM64 installer](https://claude.ai/api/desktop/win32/arm64/setup/latest/redirect?utm_source=claude_code\&utm_medium=docs). On Linux, install with apt; see [Claude Desktop on Linux](/docs/en/desktop-linux).

<Note>
  Claude Code 需要 [Pro、Max、Team 或 Enterprise 订阅](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=desktop_quickstart_pricing)。
</Note>

本页面将指导您安装应用并开始您的第一个会话。如果您已经设置完成，请参阅[使用 Claude Code Desktop](/docs/zh-CN/desktop)了解完整参考。

桌面应用有三个选项卡：

* **Chat**：无文件访问权限的常规对话，类似于 claude.ai。
* **Cowork**：一个自主后台代理，在沙箱虚拟机中处理任务，拥有自己的环境，可以独立运行，而您可以进行其他工作。本地 Cowork 会话在您的计算机上运行虚拟机；远程 Cowork 会话改为在 Anthropic 管理的虚拟机上运行。
* **Code**：一个交互式编码助手，可直接访问您的本地文件。您可以实时审查和批准每项更改。

Chat 和 Cowork 在 [Claude 帮助中心](https://support.claude.com/)中有介绍；安装和部署桌面应用在 [Claude Desktop 支持文章](https://support.claude.com/en/collections/16163169-claude-desktop)中有介绍。本页面重点关注 **Code** 选项卡。

<h2 id="install">
  安装
</h2>

<Steps>
  <Step title="安装并登录">
    在 macOS 和 Windows 上，从上面的链接下载安装程序并运行它。在 Linux 上，请按照 [Claude Desktop on Linux](/docs/zh-CN/desktop-linux) 中的安装步骤进行操作。在 macOS 上从应用程序文件夹启动 Claude，在 Windows 上从开始菜单启动，或在 Linux 上从应用程序启动器启动，然后使用您的 Anthropic 账户登录。
  </Step>

  <Step title="打开 Code 选项卡">
    点击顶部中心的 **Code** 选项卡。如果点击 Code 提示您升级，您需要先[订阅付费计划](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=desktop_quickstart_upgrade)。如果提示您在线登录，请完成登录并重启应用。如果您看到 403 错误，请参阅[身份验证故障排除](/docs/zh-CN/desktop#403-or-authentication-errors-in-the-code-tab)。
  </Step>
</Steps>

桌面应用包含 Claude Code。您无需单独安装 Node.js 或 CLI。要从终端使用 `claude`，请单独安装 CLI。请参阅[开始使用 CLI](/docs/zh-CN/quickstart)。

<h2 id="start-your-first-session">
  开始您的第一个会话
</h2>

打开 Code 选项卡后，选择一个项目并告诉 Claude 要做什么。

<Steps>
  <Step title="选择环境和文件夹">
    选择 **Local** 以在您的机器上运行 Claude，直接使用您的文件。点击 **Select folder** 并选择您的项目目录。

    <Tip>
      从一个您熟悉的小项目开始。这是查看 Claude Code 能做什么的最快方式。在 Windows 上，必须安装 [Git](https://git-scm.com/downloads/win) 才能使本地会话正常工作。大多数 Mac 默认包含 Git。
    </Tip>

    您也可以选择：

    * **Remote**：在 Anthropic 的云基础设施上运行会话，即使关闭应用也会继续。远程会话使用与 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 相同的基础设施。
    * **SSH**：通过 SSH 连接到远程机器，例如您自己的服务器、云虚拟机或开发容器。Desktop 在您第一次连接时会自动在远程机器上安装 Claude Code。
    * **WSL**（Windows）：在 [WSL 2 发行版](/docs/zh-CN/desktop-wsl) 内运行会话；Claude Code、工具和 git 在 Linux 端执行，使用本机路径。
  </Step>

  <Step title="选择模型">
    从发送按钮旁的下拉菜单中选择模型。请参阅[模型](/docs/zh-CN/model-config#available-models)了解可用模型的比较。您可以稍后从同一下拉菜单更改模型。
  </Step>

  <Step title="告诉 Claude 要做什么">
    输入您希望 Claude 做的事情：

    * `Find a TODO comment and fix it`
    * `Add tests for the main function`
    * `Create a CLAUDE.md with instructions for this codebase`

    一个[会话](/docs/zh-CN/desktop#work-in-parallel-with-sessions)是与 Claude 关于您的代码的对话。每个会话跟踪自己的上下文和更改，因此您可以处理多个任务而不会相互干扰。
  </Step>

  <Step title="审查并接受更改">
    默认情况下，Code 选项卡以[询问权限模式](/docs/zh-CN/desktop#choose-a-permission-mode)启动，其中 Claude 提议更改并等待您的批准后再应用。您将看到：

    1. 一个[差异视图](/docs/zh-CN/desktop#review-changes-with-diff-view)，显示每个文件中将发生的确切更改
    2. 接受/拒绝按钮以批准或拒绝每项更改
    3. Claude 处理您的请求时的实时更新

    如果您拒绝更改，Claude 将询问您希望如何以不同的方式进行。在您接受之前，您的文件不会被修改。
  </Step>
</Steps>

<h2 id="now-what">
  接下来呢？
</h2>

您已经进行了第一次编辑。有关 Desktop 可以做的所有事情的完整参考，请参阅[使用 Claude Code Desktop](/docs/zh-CN/desktop)。以下是一些接下来可以尝试的事情。

**中断并引导。** 您可以随时重定向 Claude。点击停止按钮立即中断，或输入更正并按 **Enter** 发送，无需停止正在运行的操作。无论哪种方式，您都无需等待它完成或重新开始。

**为 Claude 提供更多上下文。** 在提示框中输入 `@filename` 以将特定文件拉入对话，使用附件按钮附加图像和 PDF，或直接将文件拖放到提示中。Claude 拥有的上下文越多，结果越好。请参阅[添加文件和上下文](/docs/zh-CN/desktop#add-files-and-context-to-prompts)。

**使用 skills 处理可重复的任务。** 输入 `/` 或点击 **+** → **Slash commands** 以浏览[内置命令](/docs/zh-CN/commands)、[自定义 skills](/docs/zh-CN/skills) 和插件 skills。Skills 是可重用的提示，您可以在需要时调用，例如代码审查清单或部署步骤。

**在提交前审查更改。** Claude 编辑文件后，会出现 `+12 -1` 指示器。点击它以打开[差异视图](/docs/zh-CN/desktop#review-changes-with-diff-view)，逐个文件审查修改，并对特定行进行评论。Claude 会读取您的评论并进行修订。点击 **Review code** 让 Claude 自己评估差异并留下内联建议。

**调整您拥有的控制量。** 您的[权限模式](/docs/zh-CN/desktop#choose-a-permission-mode)设置了 Claude 在不请求批准的情况下可以做多少事情：

* **Manual**：默认设置。Claude 在编辑文件或运行命令前会请求批准。
* **Accept edits**：Claude 自动接受文件编辑以加快迭代。
* **Plan**：Claude 提出一种方法而不编辑任何文件，这在大型重构前很有用。

**添加插件以获得更多功能。** 点击提示框旁的 **+** 按钮并选择 **Plugins** 以浏览和安装[插件](/docs/zh-CN/desktop#install-plugins)，这些插件添加 skills、代理、MCP servers 等。

**整理您的工作区。** 将聊天、差异、终端、文件和浏览器窗格拖放到您想要的任何布局中。使用 **Ctrl+\`** 打开终端以在会话旁运行命令，或点击文件路径以在文件窗格中打开它。请参阅[整理您的工作区](/docs/zh-CN/desktop#arrange-your-workspace)。

**预览您的应用。** 当您在桌面中运行开发服务器时，您的应用会在浏览器窗格中打开，该窗格也可以[打开外部网站](/docs/zh-CN/desktop#browse-external-sites)。Claude 可以查看正在运行的应用、测试端点、检查日志并对其看到的内容进行迭代。请参阅[预览您的应用](/docs/zh-CN/desktop#preview-your-app)。

**跟踪您的拉取请求。** 打开 PR 后，Claude Code 监控 CI 检查结果，可以自动修复失败或在所有检查通过后合并 PR。请参阅[监控拉取请求状态](/docs/zh-CN/desktop#monitor-pull-request-status)。

**将 Claude 放在日程上。** 设置[计划任务](/docs/zh-CN/desktop-scheduled-tasks)以定期自动运行 Claude：每天早上进行代码审查、每周进行依赖审计，或从您连接的工具中提取信息的简报。

**准备好时扩展。** 从侧边栏打开[并行会话](/docs/zh-CN/desktop#work-in-parallel-with-sessions)以同时处理多个任务，每个任务都在自己的 Git worktree 中，并打开[任务窗格](/docs/zh-CN/desktop#watch-background-tasks)以观看会话正在运行的子代理和后台命令。打开[侧边聊天](/docs/zh-CN/desktop#ask-a-side-question-without-derailing-the-session)以提出问题而不会偏离主线程。将[长期运行的工作发送到云](/docs/zh-CN/desktop#run-long-running-tasks-remotely)，以便即使关闭应用也能继续，或者如果任务花费的时间比预期长，[在网络或 IDE 中继续会话](/docs/zh-CN/desktop#continue-in-another-surface)。[连接外部工具](/docs/zh-CN/desktop#extend-claude-code)，如 GitHub、Slack 和 Linear，以整合您的工作流。

<h2 id="coming-from-the-cli">
  来自 CLI？
</h2>

Desktop 运行与 CLI 相同的引擎，但具有图形界面。您可以在同一项目上同时运行两者，它们共享配置（CLAUDE.md 文件、MCP servers、hooks、skills 和设置）。有关功能、标志等效项和 Desktop 中不可用内容的完整比较，请参阅 [CLI 比较](/docs/zh-CN/desktop#coming-from-the-cli)。

<h2 id="what’s-next">
  接下来是什么
</h2>

* [使用 Claude Code Desktop](/docs/zh-CN/desktop)：权限模式、并行会话、差异视图、连接器和企业配置
* [故障排除](/docs/zh-CN/desktop#troubleshooting)：常见错误和设置问题的解决方案
* [最佳实践](/docs/zh-CN/best-practices)：编写有效提示和充分利用 Claude Code 的提示
* [常见工作流](/docs/zh-CN/common-workflows)：调试、重构、测试等教程
