> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Desktop application

> 充分利用 Claude Code Desktop：使用 Git 隔离的并行会话、拖放窗格布局、集成终端和文件编辑器、侧边聊天、计算机使用、从手机 Dispatch 会话、可视化 diff 审查、应用预览、PR 监控、连接器和企业配置。

Claude Desktop 应用有三个选项卡：**Chat** 用于对话，**Cowork** 用于 [Dispatch 和更长的代理工作](https://claude.com/product/cowork)，**Code** 用于软件开发。本页是 Code 选项卡的参考。

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

安装后，启动 Claude，登录，然后点击 **Code** 选项卡。第一次在 Windows 上打开它时，你需要安装 [Git for Windows](https://git-scm.com/downloads/win)；安装后重启应用。有关首次会话的演练，请参阅[快速开始指南](/docs/zh-CN/desktop-quickstart)。

在 Code 选项卡中，每个对话都是一个**会话**：它有自己的聊天历史、项目文件夹和代码更改，独立于任何其他会话。侧边栏列出你的会话，让你可以并行运行多个会话。在一个会话中，你可以：

* [使用 diff 视图审查和评论更改](#review-changes-with-diff-view)，然后[通过 CI 监控生成的 PR](#monitor-pull-request-status)
* [在浏览器窗格中预览你的运行应用](#preview-your-app)，同时 Claude 验证自己的更改，并[在其旁边打开外部网站](#browse-external-sites)
* [整理窗格](#arrange-your-workspace)，将聊天、diff、浏览器、终端和文件编辑器并排放置
* 提出[侧边问题](#ask-a-side-question-without-derailing-the-session)，使用会话的上下文而不偏离主线
* [连接外部工具](#connect-external-tools)，如 GitHub、Slack 和 Linear
* 让 Claude [打开应用和控制你的屏幕](#let-claude-use-your-computer)
* 在你的机器上、[云中](#run-long-running-tasks-remotely)或通过 [SSH](#ssh-sessions) 运行

有关[计划的定期工作](/docs/zh-CN/desktop-scheduled-tasks)、[快捷键](#keyboard-shortcuts)或[从手机发送任务](#sessions-from-dispatch)，请参阅链接的页面和部分。如果你已经使用基于终端的 CLI，请参阅 [CLI 比较](#coming-from-the-cli)了解哪些内容可以继续使用。

<h2 id="start-a-session">
  启动会话
</h2>

在发送第一条消息之前，在提示区域配置四件事：

* **环境**：选择 Claude 运行的位置。选择 **Local** 用于你的机器，**Remote** 用于 Anthropic 托管的云会话，[**SSH 连接**](#ssh-sessions)用于你管理的远程机器，或在 Windows 上选择 [**WSL 发行版**](/docs/zh-CN/desktop-wsl)。请参阅[环境配置](#environment-configuration)。
* **项目文件夹**：选择 Claude 工作的文件夹或存储库。对于远程会话，你可以添加[多个存储库](#run-long-running-tasks-remotely)。
* **模型**：从发送按钮旁的下拉菜单中选择一个[模型](/docs/zh-CN/model-config#available-models)。你可以在会话期间更改此设置。
* **权限模式**：从[模式选择器](#choose-a-permission-mode)中选择 Claude 拥有多少自主权。你可以在会话期间更改此设置。

输入你的任务并按 **Enter** 启动。每个会话独立跟踪其自己的上下文和更改。

<h2 id="work-with-code">
  使用代码
</h2>

为 Claude 提供正确的上下文，控制它自己做多少工作，并审查它更改的内容。

<h3 id="use-the-prompt-box">
  使用提示框
</h3>

输入你想让 Claude 做的事情并按 **Enter** 发送。Claude 读取你的项目文件，进行更改，并根据你的[权限模式](#choose-a-permission-mode)运行命令。你可以随时重定向 Claude：点击停止按钮立即中断，或输入更正并按 **Enter** 发送，无需停止正在运行的操作。Claude 在当前操作完成后立即读取更正，并在下一步之前进行调整。

提示框旁的 **+** 按钮让你可以访问文件附件、[skills](#use-skills)、[连接器](#connect-external-tools) 和[插件](#install-plugins)。

<h3 id="add-files-and-context-to-prompts">
  向提示添加文件和上下文
</h3>

提示框支持两种方式来引入外部上下文：

* **@mention 文件**：输入 `@` 后跟文件名，将文件添加到对话上下文。Claude 然后可以读取和引用该文件。@mention 在云会话和 WSL 会话中不可用。
* **附加文件**：使用附件按钮将图像、PDF 和其他文件附加到你的提示，或直接将文件拖放到提示中。这对于共享错误的屏幕截图、设计模型或参考文档很有用。

<h3 id="choose-a-permission-mode">
  选择权限模式
</h3>

权限模式控制 Claude 在会话期间拥有多少自主权：它是否在编辑文件、运行命令或两者之前询问。你可以随时使用发送按钮旁的模式选择器切换模式。从 Manual 开始以准确查看 Claude 的操作，然后随着你变得更舒适，转移到 Accept edits 或 Plan。

要为新的本地会话设置默认模式，请将 `permissions.defaultMode` 添加到你的[设置文件](/docs/zh-CN/settings#settings-files)。桌面应用读取与 CLI 相同的设置文件。你在选择器中选择的模式会被记住，每个文件夹都会优先于 `defaultMode`，除了 Plan，它仅适用于当前会话。

| 模式                     | 设置键                 | 行为                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manual**             | `default`           | Claude 在编辑文件或运行命令之前询问。你会看到一个 diff，可以接受或拒绝每个更改。推荐给新用户。                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Accept edits**       | `acceptEdits`       | Claude 自动接受文件编辑和常见的文件系统命令，如 `mkdir`、`touch` 和 `mv`，但在运行其他终端命令之前仍然询问。当你信任文件更改并想要更快的迭代时，使用此选项。                                                                                                                                                                                                                                                                                                                                                                   |
| **Plan**               | `plan`              | Claude 读取文件并运行命令来探索，然后提出计划而不编辑你的源代码。适合复杂任务，你想先审查方法。                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Auto**               | `auto`              | Claude 执行所有操作，并进行后台安全检查以验证与你的请求的一致性。减少权限提示，同时保持监督。在你的账户满足下面的[可用性要求](#auto-mode-availability)时出现；没有单独的设置切换。                                                                                                                                                                                                                                                                                                                                                     |
| **Bypass permissions** | `bypassPermissions` | Claude 运行时没有权限提示，除了由显式[询问规则](/docs/zh-CN/permissions#manage-permissions)强制的权限提示、连接器工具[你的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)、标记为 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具，或当 Claude [在外部网站上操作](#browse-external-sites)时由安全分类器强制的权限提示；等同于 CLI 中的 `--dangerously-skip-permissions`。在 Pro 和 Max 计划上，在你的设置 → Claude Code 中的"允许绕过权限模式"下启用；在 Team 和 Enterprise 计划上没有设置切换，组织政策控制它。仅在沙箱容器或虚拟机中使用。 |

代码选项卡的早期版本将这些模式标记为 Ask permissions、Auto accept edits 和 Plan mode。

`dontAsk` 权限模式仅在 [CLI](/docs/zh-CN/permission-modes#allow-only-pre-approved-tools-with-dontask-mode) 中可用。

<span id="auto-mode-availability" />

Auto mode 在 Anthropic API 上对所有用户可用，需要 Claude Opus 4.6 或更高版本，或 Sonnet 4.6 或更高版本。在路由到 Google Cloud 的 Agent Platform 的企业部署中，auto mode [默认可用](/docs/zh-CN/permission-modes#enable-auto-mode-on-bedrock-agent-platform-or-foundry)，仅支持 Claude Sonnet 5、Opus 4.7 和 Opus 4.8。在 Claude Code v2.1.207 之前，Google Cloud 的 Agent Platform 上的企业部署必须设置 `CLAUDE_CODE_ENABLE_AUTO_MODE` 来启用 auto mode。

<Tip title="最佳实践">
  在 Plan 中启动复杂任务，以便 Claude 在进行更改之前制定方法。一旦你批准计划，切换到 Accept edits 或 Manual 来执行它。有关此工作流的更多信息，请参阅[先探索，然后计划，然后编码](/docs/zh-CN/best-practices#explore-first-then-plan-then-code)。
</Tip>

云会话支持 Accept edits、Plan 和 Auto。Accept edits 对应于 `default` 模式：云会话预先批准文件编辑，所以选择器显示 Accept edits 而不是 Manual。Bypass permissions 不可用，因为云环境已经是沙箱化的。

企业管理员可以限制哪些权限模式可用。有关详细信息，请参阅[企业配置](#enterprise-configuration)。

<h3 id="preview-your-app">
  预览你的应用
</h3>

Claude 可以启动开发服务器并在浏览器窗格中打开它来验证其更改。这适用于前端 Web 应用以及后端服务器：Claude 可以测试 API 端点、查看服务器日志并迭代它发现的问题。在大多数情况下，Claude 在编辑项目文件后自动启动服务器。你也可以随时要求 Claude 预览。默认情况下，Claude [自动验证](#auto-verify-changes)每次编辑后的更改。

浏览器窗格也可以打开项目中的静态 HTML 文件、PDF、图像和视频。点击聊天中的 HTML、PDF、图像或视频路径在那里打开它。

从浏览器窗格，你可以：

* 在浏览器窗格中直接与你运行的应用交互
* 观看 Claude 自动验证其自己的更改：它拍摄屏幕截图、检查 DOM、点击元素、填充表单并修复它发现的问题
* 从会话工具栏中的服务器下拉菜单启动或停止服务器
* 通过在下拉菜单中选择 **Persist sessions** 来在服务器重启时保持 cookie 和本地存储，这样你就不必在开发期间重新登录
* 编辑服务器配置或一次停止所有服务器

Claude 根据你的项目创建初始服务器配置。如果你的应用使用自定义开发命令，编辑 `.claude/launch.json` 以匹配你的设置。有关完整参考，请参阅[配置预览服务器](#configure-preview-servers)。

要清除保存的会话数据，或完全关闭浏览器，请使用设置 → Claude Code 中的切换开关。

<h3 id="browse-external-sites">
  浏览外部网站
</h3>

浏览器窗格是一个选项卡式浏览器，所以你可以在你运行的应用旁边打开文档、问题跟踪器或任何其他网站。要打开浏览器，在 macOS 上按 **Cmd+Shift+B** 或在 Windows 上按 **Ctrl+Shift+B**，或从 **Views** 菜单中选择它。当你点击聊天中的外部链接时，一个选择器提供 **Open in app** 来使用浏览器窗格或 **Default browser** 来使用你自己的；在 macOS 上 **Cmd** 点击或在 Windows 上 **Ctrl** 点击直接在你的系统浏览器中打开链接。你可以登录窗格中的网站，包括弹出式登录流程，如 Google OAuth。

Claude 可以使用与[验证你的应用](#preview-your-app)相同的工具来读取和交互外部页面，并有两个额外的安全检查：

* 安全分类器在每个权限模式中审查 Claude 在外部页面上的写入操作，如点击和输入。这些是与[自动模式](#choose-a-permission-mode)相同的分类器，当它们标记一个操作时，你会获得一个权限提示，无论模式如何。
* 在除 Auto 和 Bypass permissions 之外的权限模式中，在 Claude 导航到新网站之前，域名允许列表检查也适用。

<h4 id="approve-claude’s-actions-on-a-site">
  批准 Claude 在网站上的操作
</h4>

Claude 第一次在外部网站上操作时，会出现一个权限卡，Claude 等待你的选择：**Allow once**、**Always allow** 或 **Deny**。**Allow once** 批准操作而不保存任何内容。**Always allow** 在你的设备上保存该网站的批准，你可以在设置中撤销它。每个网站都需要自己的批准，包括子域。你的本地开发服务器和项目文件不需要批准，所以[自动验证](#auto-verify-changes)继续工作而不提示。

即使在批准的网站上，Claude 也不会在没有你的输入的情况下购买物品、创建账户或绕过 CAPTCHA。在浏览器窗格中浏览使用与 [Chrome 中的 Claude 扩展](/docs/zh-CN/chrome)相同的安全模型。有关 Claude 如何处理敏感网站和风险操作的信息，请参阅[安全使用 Chrome 中的 Claude](https://support.claude.com/en/articles/12902428-using-claude-in-chrome-safely)。

<h4 id="choose-between-the-browser-and-the-chrome-extension">
  在浏览器和 Chrome 扩展之间选择
</h4>

浏览器窗格使用干净的浏览器配置文件，与你的个人浏览器分开，没有你保存的登录或历史记录。使用它来构建和测试你的应用以及不需要你的身份的网站。当你想让 Claude 在你的登录会话中充当你时，改用 [Chrome 中的 Claude 扩展](/docs/zh-CN/chrome)，它共享你的浏览器的登录状态。

<h4 id="restrict-external-browsing-for-your-organization">
  限制你的组织的外部浏览
</h4>

浏览器遵循与 [Chrome 中的 Claude 扩展](https://support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls)相同的[网站允许列表和阻止列表控制](https://support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls)。如果你的组织已经为扩展配置了这些列表，浏览器会自动尊重它们。管理员也可以使用 [`browserExternalPageTools` 托管设置](#managed-settings)关闭 Claude 在外部页面上的工具。禁用工具后，用户仍然可以导航到外部网站；Claude 的工具无法读取或对其进行操作。

要完全关闭外部浏览，请将 [`disableBrowserExternalNavigation` 托管设置](#managed-settings)设置为 `true`。这会阻止浏览器中的所有外部导航，包括你的组织允许列表上的网站；localhost 开发服务器和文件预览继续工作。使用 `browserExternalPageTools` 让用户继续浏览外部网站而不使用 Claude 的工具，使用 `disableBrowserExternalNavigation` 为用户和 Claude 阻止外部网站。

<h3 id="review-changes-with-diff-view">
  使用 diff 视图审查更改
</h3>

Claude 对你的代码进行更改后，diff 视图让你在创建拉取请求之前逐个文件审查修改。

当 Claude 更改文件时，会出现一个 diff 统计指示器，显示添加和删除的行数，例如 `+12 -1`。点击此指示器打开 diff 查看器，它在左侧显示文件列表，在右侧显示每个文件的更改。

要对特定行进行注释，点击 diff 中的任何行以打开注释框。输入你的反馈并按 **Enter** 添加注释。在多行添加注释后，一次提交所有注释：

* **macOS**：按 **Cmd+Enter**
* **Windows**：按 **Ctrl+Enter**

Claude 读取你的注释并进行请求的更改，这些更改显示为你可以审查的新 diff。

<h3 id="review-your-code">
  审查你的代码
</h3>

在 diff 视图中，点击右上角工具栏中的 **Review code** 来要求 Claude 在你提交之前评估更改。Claude 检查当前 diff 并直接在 diff 视图中留下注释。你可以回复任何注释或要求 Claude 修改。

审查侧重于高信号问题：编译错误、明确的逻辑错误、安全漏洞和明显的错误。它不标记样式、格式、预先存在的问题或 linter 会捕获的任何内容。

<h3 id="monitor-pull-request-status">
  监控拉取请求状态
</h3>

打开拉取请求后，CI 状态栏出现在会话中。Claude Code 使用 GitHub CLI 轮询检查结果并显示失败。

* **Auto-fix**：启用后，Claude 通过读取失败输出并迭代来自动尝试修复失败的 CI 检查。
* **Auto-merge**：启用后，Claude 在所有检查通过后合并 PR。合并方法是压缩。Auto-merge 必须在你的 GitHub 存储库设置中[启用](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-auto-merge-for-pull-requests-in-your-repository)才能工作。

使用 CI 状态栏中的 **Auto-fix** 和 **Auto-merge** 切换来启用任一选项。Claude Code 还在 CI 完成时发送桌面通知。要在 PR 合并或关闭后自动存档会话，在设置 → Claude Code 中打开[自动存档](#work-in-parallel-with-sessions)。

<Note>
  PR 监控需要在你的机器上安装并验证 [GitHub CLI (`gh`)](https://cli.github.com/)。如果未安装 `gh`，Desktop 会在你第一次尝试创建 PR 时提示你安装它。
</Note>

<h2 id="arrange-your-workspace">
  整理工作区
</h2>

Code 选项卡围绕你可以以任何布局排列的窗格构建：聊天、diff、浏览器、终端、文件、plan、tasks 和 subagent。通过其标题拖动窗格来重新定位它，或拖动窗格边缘来调整大小。在 macOS 上按 **Cmd+\\** 或在 Windows 上按 **Ctrl+\\** 来关闭焦点窗格。从会话工具栏中的 **Views** 菜单打开其他窗格。

<Note>
  本部分中的窗格布局、终端、文件编辑器和视图模式需要 Claude Desktop v1.2581.0 或更高版本。在 macOS 上打开 **Claude → Check for Updates** 或在 Windows 上打开 **Help → Check for Updates** 来更新。
</Note>

<h3 id="run-commands-in-the-terminal">
  在终端中运行命令
</h3>

集成终端让你在不切换到另一个应用的情况下运行命令。从 **Views** 菜单打开它，或在 macOS 或 Windows 上按 **Ctrl+\`**。终端在你的会话工作目录中打开，并与 Claude 共享相同的环境，因此 `npm test` 或 `git status` 等命令看到 Claude 正在编辑的相同文件。要打开第二个终端选项卡，点击终端窗格标题中的 **+** 或右键点击聊天中的文件夹来选择 **Open in terminal**。终端仅在本地会话中可用。

<h3 id="open-and-edit-files">
  打开和编辑文件
</h3>

点击聊天或 diff 查看器中的文件路径在文件窗格中打开它。HTML、PDF、图像和视频路径改为在[浏览器窗格](#preview-your-app)中打开。进行现场编辑并点击 **Save** 来写回。如果文件自你打开它以来在磁盘上更改，窗格会警告你并让你覆盖或丢弃。点击 **Discard** 来恢复你的编辑，或点击窗格标题中的路径来复制绝对路径。

文件窗格在本地和 SSH 会话中可用。对于云会话，要求 Claude 进行更改。

<h3 id="open-files-in-other-apps">
  在其他应用中打开文件
</h3>

右键点击聊天、diff 查看器或文件窗格中的任何文件路径来打开上下文菜单：

* **Attach as context**：将文件添加到你的下一个提示
* **Open in**：在已安装的编辑器（如 VS Code、Cursor 或 Zed）中打开文件
* **Show in Finder**（macOS）、**Show in Explorer**（Windows）：打开包含文件夹
* **Copy path**：将绝对路径复制到你的剪贴板

<h3 id="switch-view-modes">
  切换视图模式
</h3>

视图模式控制聊天记录中显示多少详细信息。从发送按钮旁的 **Transcript view** 下拉菜单切换模式，或在 macOS 或 Windows 上按 **Ctrl+O** 来循环浏览它们。

| 模式          | 显示内容                       |
| ----------- | -------------------------- |
| **Normal**  | 工具调用折叠成摘要，带有完整文本响应         |
| **Verbose** | Claude 采取的每个工具调用、文件读取和中间步骤 |
| **Summary** | 仅 Claude 的最终响应和它所做的更改      |

在调试 Claude 为什么采取特定操作时使用 Verbose。当你运行多个会话并想快速扫描结果时使用 Summary。

<h3 id="keyboard-shortcuts">
  快捷键
</h3>

在 macOS 上按 **Cmd+/** 或在 Windows 上按 **Ctrl+/** 来查看 Code 选项卡中可用的所有快捷键。在 Windows 上，对下面的快捷键使用 **Ctrl** 代替 **Cmd**。会话循环、终端切换和视图模式切换在每个平台上使用 **Ctrl**。

| 快捷键                                   | 操作            |
| ------------------------------------- | ------------- |
| `Cmd` `/`                             | 显示快捷键         |
| `Cmd` `N`                             | 新会话           |
| `Cmd` `W`                             | 关闭会话          |
| `Ctrl` `Tab` / `Ctrl` `Shift` `Tab`   | 下一个或上一个会话     |
| `Cmd` `Shift` `]` / `Cmd` `Shift` `[` | 下一个或上一个会话     |
| `Esc`                                 | 停止 Claude 的响应 |
| `Cmd` `Shift` `D`                     | 切换 diff 窗格    |
| `Cmd` `Shift` `B`                     | 切换浏览器窗格       |
| `Cmd` `Shift` `S`                     | 在浏览器中选择元素     |
| `Ctrl` `` ` ``                        | 切换终端窗格        |
| `Cmd` `\`                             | 关闭焦点窗格        |
| `Cmd` `;`                             | 打开侧边聊天        |
| `Ctrl` `O`                            | 循环视图模式        |
| `Cmd` `Shift` `M`                     | 打开权限模式菜单      |
| `Cmd` `Shift` `I`                     | 打开模型菜单        |
| `Cmd` `Shift` `E`                     | 打开工作量菜单       |
| `1`–`9`                               | 在打开的菜单中选择项目   |

这些快捷键仅适用于 Code 选项卡。基于终端的[交互模式快捷键](/docs/zh-CN/interactive-mode#keyboard-shortcuts)（如 `Shift+Tab` 来循环模式）在 Desktop 中不适用。

<h3 id="check-usage">
  检查使用情况
</h3>

点击模型选择器旁的使用环形图来查看你当前的上下文窗口使用情况和你的计划在该期间的使用情况。上下文使用是按会话的；计划使用在所有 Claude Code 表面上共享。

<h2 id="let-claude-use-your-computer">
  让 Claude 使用你的计算机
</h2>

计算机使用让 Claude 打开你的应用、控制你的屏幕，并像你一样直接在你的机器上工作。要求 Claude 在移动模拟器中测试原生应用、与没有 CLI 的桌面工具交互，或自动化只能通过 GUI 工作的东西。

<Note>
  计算机使用是 macOS 和 Windows 上的研究预览版，需要 Pro 或 Max 计划。它在 Team 或 Enterprise 计划上不可用。Claude Desktop 应用必须运行。
</Note>

计算机使用默认关闭。[在设置中启用它](#enable-computer-use)，然后 Claude 才能控制你的屏幕。在 macOS 上，你还需要授予辅助功能和屏幕录制权限。

<Warning>
  与[沙箱化 Bash 工具](/docs/zh-CN/sandboxing)不同，计算机使用在你的实际桌面上运行，可以访问你批准的任何内容。Claude 检查每个操作并标记来自屏幕内容的潜在提示注入，但信任边界不同。有关最佳实践，请参阅[计算机使用安全指南](https://support.claude.com/en/articles/14128542)。
</Warning>

<h3 id="when-computer-use-applies">
  何时应用计算机使用
</h3>

Claude 有多种方式与应用或服务交互，计算机使用是最广泛和最慢的。它首先尝试最精确的工具：

* 如果你有一个服务的[连接器](#connect-external-tools)，Claude 使用连接器。
* 如果任务是 shell 命令，Claude 使用 Bash。
* 如果任务是浏览器工作且你已设置[Chrome 中的 Claude](/docs/zh-CN/chrome)，Claude 使用那个。
* 如果以上都不适用，Claude 使用计算机使用。

[按应用访问层](#app-permissions)强化了这一点：浏览器限制为仅查看，终端和 IDE 限制为仅点击，即使计算机使用处于活跃状态，也会引导 Claude 使用专用工具。屏幕控制保留给其他工具无法到达的东西，如原生应用、硬件控制面板、移动模拟器或没有 API 的专有工具。

<h3 id="enable-computer-use">
  启用计算机使用
</h3>

计算机使用默认关闭。如果你要求 Claude 做需要它的事情而它关闭时，Claude 会告诉你如果在设置中启用计算机使用，它可以完成任务。

<Steps>
  <Step title="更新桌面应用">
    确保你有最新版本的 Claude Desktop。在 macOS 和 Windows 上，在 [claude.com/download](https://claude.com/download) 下载或更新；在 Linux 上，通过你的包管理器更新（[说明](/docs/zh-CN/desktop-linux)）。然后重启应用。
  </Step>

  <Step title="打开切换">
    在桌面应用中，转到**设置 > 常规**（在**桌面应用**下）。找到**计算机使用**切换并打开它。在 Windows 上，切换立即生效，设置完成。在 macOS 上，继续下一步。

    如果你看不到切换，确认你在 macOS 或 Windows 上使用 Pro 或 Max 计划，然后更新并重启应用。
  </Step>

  <Step title="授予 macOS 权限">
    在 macOS 上，在切换生效之前授予两个系统权限：

    * **Accessibility**：让 Claude 点击、输入和滚动
    * **Screen Recording**：让 Claude 看到你屏幕上的内容

    设置页面显示每个权限的当前状态。如果任一被拒绝，点击徽章打开相关的系统设置窗格。
  </Step>
</Steps>

<h3 id="app-permissions">
  应用权限
</h3>

Claude 第一次需要使用应用时，会话中会出现提示。点击**允许此会话**或**拒绝**。批准持续当前会话，或在 [Dispatch 生成的会话](#sessions-from-dispatch)中持续 30 分钟。

提示还显示 Claude 为该应用获得的控制级别。这些层由应用类别固定，无法更改：

| 层    | Claude 可以做什么      | 适用于      |
| :--- | :---------------- | :------- |
| 仅查看  | 在屏幕截图中看到应用        | 浏览器、交易平台 |
| 仅点击  | 点击和滚动，但不能输入或使用快捷键 | 终端、IDE   |
| 完全控制 | 点击、输入、拖动和使用快捷键    | 其他所有内容   |

像终端、Finder 或文件浏览器以及系统设置或设置这样具有广泛影响的应用在提示中显示额外警告，以便你知道批准它们授予什么。

你可以在**设置 > 常规**（在**桌面应用**下）中配置两个设置：

* **拒绝的应用**：在此处添加应用以拒绝它们而不提示。Claude 可能仍然通过允许应用中的操作间接影响被拒绝的应用，但它无法直接与被拒绝的应用交互。
* **Claude 完成时取消隐藏应用**：当 Claude 工作时，你的其他窗口被隐藏，以便它仅与批准的应用交互。当 Claude 完成时，隐藏的窗口被恢复，除非你关闭此设置。

<h2 id="manage-sessions">
  管理会话
</h2>

每个会话是一个独立的对话，拥有自己的上下文和更改。你可以并行运行多个会话、分支侧边聊天、将工作发送到云，或让 Dispatch 从你的手机为你启动会话。

<h3 id="work-in-parallel-with-sessions">
  使用会话并行工作
</h3>

点击侧边栏中的 **+ New session**，或在 macOS 上按 **Cmd+N** 或在 Windows 上按 **Ctrl+N**，来并行处理多个任务。按 **Ctrl+Tab** 和 **Ctrl+Shift+Tab** 来循环侧边栏中的会话。对于 Git 存储库，每个会话使用 [Git worktrees](/docs/zh-CN/worktrees) 获得自己的项目隔离副本，因此一个会话中的更改不会影响其他会话，直到你提交它们。

要同时查看两个会话，在 macOS 上按住 **Cmd** 或在 Windows 上按住 **Ctrl** 并点击侧边栏中的会话。会话在第二个窗格中打开，与你已经打开的窗格并排。当分割处于活跃状态时，点击另一个侧边栏会话会替换具有焦点的窗格。在 macOS 上按 **Cmd+\\** 或在 Windows 上按 **Ctrl+\\** 来关闭焦点窗格并返回到单个会话。

Worktrees 默认存储在 `<project-root>/.claude/worktrees/` 中。你可以在设置 → Claude Code 中的"Worktree location"下将其更改为自定义目录。你也可以设置一个分支前缀，该前缀会添加到每个 worktree 分支名称前面，这对于保持 Claude 创建的分支有组织很有用。要在完成后删除 worktree，请将鼠标悬停在侧边栏中的会话上并点击存档图标。要在 PR 合并或关闭时让会话自动存档，在设置 → Claude Code 中打开 **Auto-archive after PR merge or close**。自动存档仅适用于已完成运行的本地会话。

要在新 worktrees 中包含 gitignored 文件（如 `.env`），在你的项目根目录中创建一个 [`.worktreeinclude` 文件](/docs/zh-CN/worktrees#copy-gitignored-files-into-worktrees)。

<Note>
  会话隔离需要 [Git](https://git-scm.com/downloads)。大多数 Mac 默认包含 Git。在终端中运行 `git --version` 来检查。在 Windows 上，Git 是 Code 选项卡工作所必需的：[下载 Git for Windows](https://git-scm.com/downloads/win)，安装它，然后重启应用。如果你遇到 Git 错误，请在 [Cowork 选项卡](https://claude.com/product/cowork) 中询问 Claude 来帮助排除你的设置。
</Note>

使用侧边栏顶部的控制来按状态、项目或环境过滤会话，并按项目分组会话。要重命名会话，点击活跃会话顶部工具栏中的会话标题。要检查上下文使用情况，请参阅[检查使用情况](#check-usage)。当上下文填满时，Claude 自动总结对话并继续工作。你也可以输入 `/compact` 来更早触发总结并释放上下文空间。有关压缩工作原理的详细信息，请参阅[上下文窗口](/docs/zh-CN/how-claude-code-works#the-context-window)。

桌面应用在 Code 会话完成任务且你当前未查看该会话时发送操作系统通知。

<h3 id="ask-a-side-question-without-derailing-the-session">
  在不偏离会话的情况下提出侧边问题
</h3>

侧边聊天让你提出一个使用你的会话上下文的问题，但不会添加任何内容回到主对话。当你想要理解一段代码、检查一个假设或探索一个想法而不引导会话偏离时，使用它。

在 macOS 上按 **Cmd+;** 或在 Windows 上按 **Ctrl+;** 来打开侧边聊天，或在提示框中输入 `/btw`。侧边聊天可以读取主线程中到该点为止的所有内容。完成后，关闭侧边聊天并在你离开的地方继续主会话。侧边聊天在本地、SSH 和 WSL 会话中可用。

<h3 id="watch-background-tasks">
  观看后台任务
</h3>

任务窗格显示在当前会话内运行的后台工作：子代理、后台 shell 命令和[动态工作流](/docs/zh-CN/workflows)。从 **Views** 菜单打开它或将其拖入你的布局。

点击任何条目来在子代理窗格中查看其输出或停止它。要查看其他会话在做什么，使用[侧边栏](#work-in-parallel-with-sessions)。

<h3 id="run-long-running-tasks-remotely">
  远程运行长时间运行的任务
</h3>

对于大型重构、测试套件、迁移或其他长时间运行的任务，在启动会话时选择 **Remote** 而不是 **Local**。远程会话在 Anthropic 的云基础设施上运行，即使你关闭应用或关闭计算机，也会继续运行。随时检查进度或引导 Claude 朝不同方向发展。你也可以从 [claude.ai/code](https://claude.ai/code) 或 Claude iOS 应用监控远程会话。

远程会话也支持多个存储库。选择云环境后，点击存储库 pill 旁的 **+** 按钮向会话添加其他存储库。每个存储库都有自己的分支选择器。这对于跨越多个代码库的任务很有用，例如更新共享库及其使用者。

有关远程会话如何工作的更多信息，请参阅 [Web 上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)。

<h3 id="continue-in-another-surface">
  在另一个表面继续
</h3>

**Continue in** 菜单，可从会话工具栏右下角的 VS Code 图标访问，让你将会话移动到另一个表面：

* **Web 上的 Claude Code**：将你的本地会话发送到远程继续运行。Desktop 推送你的分支，生成对话摘要，并创建具有完整上下文的新远程会话。你可以然后选择存档本地会话或保留它。这需要干净的工作树，对于 SSH 会话不可用。
* **你的 IDE**：在当前工作目录的支持的 IDE 中打开你的项目。

<h3 id="sessions-from-dispatch">
  来自 Dispatch 的会话
</h3>

[Dispatch](https://support.claude.com/en/articles/13947068) 是一个与 Claude 的持久对话，存在于 [Cowork](https://claude.com/product/cowork) 选项卡中。你向 Dispatch 发送任务消息，它决定如何处理。

任务可以通过两种方式成为 Code 会话：你直接要求一个，例如"打开 Claude Code 会话并修复登录错误"，或 Dispatch 决定任务是开发工作并自己生成一个。通常路由到 Code 的任务包括修复错误、更新依赖项、运行测试或打开拉取请求。研究、文档编辑和电子表格工作保留在 Cowork 中。

无论哪种方式，Code 会话都会在 Code 选项卡的侧边栏中出现，带有 **Dispatch** 徽章。当它完成或需要你的批准时，你会在手机上收到推送通知。

如果你启用了[计算机使用](#let-claude-use-your-computer)，Dispatch 生成的 Code 会话也可以使用它。这些会话中的应用批准在 30 分钟后过期并重新提示，而不是像常规 Code 会话那样持续整个会话。

有关设置、配对和 Dispatch 设置，请参阅 [Dispatch 帮助文章](https://support.claude.com/en/articles/13947068)。Dispatch 需要 Pro 或 Max 计划，在 Team 或 Enterprise 计划上不可用。

Dispatch 是远离终端时与 Claude 合作的几种方式之一。请参阅[平台和集成](/docs/zh-CN/platforms#work-when-you-are-away-from-your-terminal)来比较它与远程控制、Channels、Slack 和计划任务。

<h2 id="extend-claude-code">
  扩展 Claude Code
</h2>

连接外部服务、添加可重用工作流、自定义 Claude 的行为并配置预览服务器。要在一个地方管理连接器、skills 和插件，请点击侧边栏中的**自定义**。

<h3 id="connect-external-tools">
  连接外部工具
</h3>

对于本地和 [SSH](#ssh-sessions) 会话，点击提示框旁的 **+** 按钮并选择 **Connectors** 来添加集成，如 Google Calendar、Slack、GitHub、Linear、Notion 等。你可以在会话之前或期间添加连接器。**+** 按钮在云会话中不可用，但 [routines](/docs/zh-CN/routines) 在 routine 创建时配置连接器。

要管理或断开连接器，请在桌面应用中转到设置 → Connectors，或从提示框中的 Connectors 菜单中选择 **Manage connectors**。

连接后，Claude 可以读取你的日历、发送消息、创建问题并直接与你的工具交互。你可以询问 Claude 在你的会话中配置了哪些连接器。

连接器是[MCP servers](/docs/zh-CN/mcp)，具有图形设置流程。使用它们快速与支持的服务集成。对于连接器中未列出的集成，通过[设置文件](/docs/zh-CN/mcp#installing-mcp-servers)手动添加 MCP servers。你也可以[创建自定义连接器](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)。

<h3 id="use-skills">
  使用 skills
</h3>

[Skills](/docs/zh-CN/skills)扩展 Claude 可以做的事情。Claude 在相关时自动加载它们，或者你可以直接调用一个：在提示框中输入 `/` 或点击 **+** 按钮并选择 **Slash commands** 来浏览可用的内容。这包括[内置命令](/docs/zh-CN/commands)、你的[自定义 skills](/docs/zh-CN/skills#create-your-first-skill)、来自你的代码库的项目 skills 以及来自任何[已安装插件](/docs/zh-CN/plugins)的 skills。选择一个，它会在输入字段中突出显示。在它之后输入你的任务并照常发送。

你可以在 Claude 工作时发送命令，就像任何其他消息一样，会话在轮次完成后返回空闲状态。在 v2.1.206 之前，在轮次中间发送的命令可能会导致会话显示为运行状态，你之后发送的消息未被传递。

<h3 id="install-plugins">
  安装插件
</h3>

[Plugins](/docs/zh-CN/plugins)是可重用的包，为 Claude Code 添加 skills、agents、hooks、MCP servers 和 LSP 配置。你可以从桌面应用安装插件，而无需使用终端。

对于本地和 [SSH](#ssh-sessions) 会话，点击提示框旁的 **+** 按钮并选择 **Plugins** 来查看你已安装的插件及其 skills。要添加插件，从子菜单中选择 **Add plugin** 来打开插件浏览器，它显示来自你配置的[市场](/docs/zh-CN/plugin-marketplaces)的可用插件，包括官方 Anthropic 市场。选择 **Manage plugins** 来启用、禁用或卸载插件。

插件可以限定到你的用户账户、特定项目或仅本地。如果你的组织集中管理插件，这些插件在桌面会话中的可用方式与在 CLI 中相同。插件在云会话或 WSL 会话中不可用。有关完整的插件参考，包括创建你自己的插件，请参阅 [plugins](/docs/zh-CN/plugins)。

<h3 id="configure-preview-servers">
  配置预览服务器
</h3>

Claude 自动检测你的开发服务器设置并将配置存储在启动会话时选择的文件夹根目录的 `.claude/launch.json` 中。Preview 使用此文件夹作为其工作目录，因此如果你选择了父文件夹，具有自己开发服务器的子文件夹将不会自动检测。要使用子文件夹的服务器，要么直接在该文件夹中启动会话，要么手动添加配置。

要自定义服务器的启动方式，例如使用 `yarn dev` 而不是 `npm run dev` 或更改端口，手动编辑文件或点击服务器下拉菜单中的 **Edit configuration** 在你的代码编辑器中打开它。该文件支持带注释的 JSON。

```json theme={null}
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "my-app",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

你可以定义多个配置来从同一项目运行不同的服务器，例如前端和 API。请参阅下面的[示例](#examples)。

<h4 id="auto-verify-changes">
  自动验证更改
</h4>

启用 `autoVerify` 时，Claude 在编辑文件后自动验证代码更改。它拍摄屏幕截图、检查错误并在完成响应之前确认更改有效。

自动验证默认打开。通过在 `.claude/launch.json` 中添加 `"autoVerify": false` 来按项目禁用它，或从服务器下拉菜单切换它。

```json theme={null}
{
  "version": "0.0.1",
  "autoVerify": false,
  "configurations": [...]
}
```

禁用时，预览工具仍然可用，你可以随时要求 Claude 验证。自动验证使其在每次编辑后自动进行。

<h4 id="configuration-fields">
  配置字段
</h4>

`configurations` 数组中的每个条目接受以下字段：

| 字段                  | 类型        | 描述                                                                                                                       |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`              | string    | 此服务器的唯一标识符                                                                                                               |
| `runtimeExecutable` | string    | 要运行的命令，例如 `npm`、`yarn` 或 `node`                                                                                          |
| `runtimeArgs`       | string\[] | 传递给 `runtimeExecutable` 的参数，例如 `["run", "dev"]`                                                                          |
| `port`              | number    | 你的服务器监听的端口。默认为 3000                                                                                                      |
| `cwd`               | string    | 相对于你的项目根目录的工作目录。默认为项目根目录。使用 `${workspaceFolder}` 显式引用项目根目录                                                               |
| `env`               | object    | 其他环境变量作为键值对，例如 `{ "NODE_ENV": "development" }`。不要在这里放置秘密，因为此文件被提交到你的存储库。要将秘密传递给你的开发服务器，在[本地环境编辑器](#local-sessions)中设置它们。 |
| `autoPort`          | boolean   | 如何处理端口冲突。见下文                                                                                                             |
| `program`           | string    | 用 `node` 运行的脚本。请参阅[何时使用 `program` vs `runtimeExecutable`](#when-to-use-program-vs-runtimeexecutable)                     |
| `args`              | string\[] | 传递给 `program` 的参数。仅在设置 `program` 时使用                                                                                     |

<a id="when-to-use-program-vs-runtimeexecutable" />

<h5 id="when-to-use-program-vs-runtimeexecutable">
  何时使用 `program` vs `runtimeExecutable`
</h5>

使用 `runtimeExecutable` 和 `runtimeArgs` 通过包管理器启动开发服务器。例如，`"runtimeExecutable": "npm"` 和 `"runtimeArgs": ["run", "dev"]` 运行 `npm run dev`。

当你有一个想用 `node` 直接运行的独立脚本时，使用 `program`。例如，`"program": "server.js"` 运行 `node server.js`。使用 `args` 传递其他标志。

<h4 id="port-conflicts">
  端口冲突
</h4>

`autoPort` 字段控制当你的首选端口已在使用时会发生什么：

* **`true`**：Claude 自动查找并使用空闲端口。适合大多数开发服务器。
* **`false`**：Claude 失败并出现错误。当你的服务器必须使用特定端口时使用此选项，例如 OAuth 回调或 CORS 允许列表。
* **未设置（默认）**：Claude 询问服务器是否需要该确切端口，然后保存你的答案。

当 Claude 选择不同的端口时，它通过 `PORT` 环境变量将分配的端口传递给你的服务器。

<h4 id="examples">
  示例
</h4>

这些配置显示了不同项目类型的常见设置：

<Tabs>
  <Tab title="Next.js">
    此配置使用 Yarn 在端口 3000 上运行 Next.js 应用：

    ```json theme={null}
    {
      "version": "0.0.1",
      "configurations": [
        {
          "name": "web",
          "runtimeExecutable": "yarn",
          "runtimeArgs": ["dev"],
          "port": 3000
        }
      ]
    }
    ```
  </Tab>

  <Tab title="多个服务器">
    对于具有前端和 API 服务器的 monorepo，定义多个配置。前端使用 `autoPort: true`，因此如果 3000 被占用，它会选择空闲端口，而 API 服务器需要端口 8080：

    ```json theme={null}
    {
      "version": "0.0.1",
      "configurations": [
        {
          "name": "frontend",
          "runtimeExecutable": "npm",
          "runtimeArgs": ["run", "dev"],
          "cwd": "apps/web",
          "port": 3000,
          "autoPort": true
        },
        {
          "name": "api",
          "runtimeExecutable": "npm",
          "runtimeArgs": ["run", "start"],
          "cwd": "server",
          "port": 8080,
          "env": { "NODE_ENV": "development" },
          "autoPort": false
        }
      ]
    }
    ```
  </Tab>

  <Tab title="Node.js 脚本">
    要直接运行 Node.js 脚本而不是使用包管理器命令，使用 `program` 字段：

    ```json theme={null}
    {
      "version": "0.0.1",
      "configurations": [
        {
          "name": "server",
          "program": "server.js",
          "args": ["--verbose"],
          "port": 4000
        }
      ]
    }
    ```
  </Tab>
</Tabs>

<h2 id="environment-configuration">
  环境配置
</h2>

你在[启动会话](#start-a-session)时选择的环境决定了 Claude 执行的位置以及你如何连接：

* **Local**：在你的机器上运行，直接访问你的文件
* **Remote**：在 Anthropic 的云基础设施上运行。即使你关闭应用，会话也会继续。
* **SSH**：在你通过 SSH 连接的远程机器上运行，例如你自己的服务器、云虚拟机或开发容器
* **WSL**（Windows）：在你的机器上的 [WSL 2 发行版](/docs/zh-CN/desktop-wsl)内运行，使用其 Linux 工具链和本地路径

<h3 id="local-sessions">
  本地会话
</h3>

桌面应用并不总是继承你的完整 shell 环境。在 macOS 上，当你从 Dock 或 Finder 启动应用时，它读取你的 shell 配置文件，例如 `~/.zshrc` 或 `~/.bashrc`，来提取 `PATH` 和一组固定的 Claude Code 变量，但你在那里导出的其他变量不会被拾取。在 Windows 上，应用继承用户和系统环境变量，但不读取 PowerShell 配置文件。

要在任何平台上为本地会话和开发服务器设置环境变量，在提示框中打开环境下拉菜单，将鼠标悬停在 **Local** 上，然后点击齿轮图标来打开本地环境编辑器。你在此处保存的变量在你的机器上加密存储，并适用于你启动的每个本地会话和预览服务器。你也可以将变量添加到你的 `~/.claude/settings.json` 文件中的 `env` 键，尽管这些仅到达 Claude 会话而不是开发服务器。有关支持的变量的完整列表，请参阅[环境变量](/docs/zh-CN/env-vars)。

[Extended thinking](/docs/zh-CN/model-config#extended-thinking)默认启用，这改进了复杂推理任务的性能，但使用额外的令牌。要禁用思考，在本地环境编辑器中将 `MAX_THINKING_TOKENS` 设置为 `0`；这对 Fable 5 没有影响，Fable 5 始终使用 extended thinking。在[第三方提供商](/docs/zh-CN/third-party-integrations)上，`0` 会省略 `thinking` 参数，自适应推理模型可能仍然会思考。在具有[自适应推理](/docs/zh-CN/model-config#adjust-effort-level)的模型上，任何其他 `MAX_THINKING_TOKENS` 值都被忽略，因为自适应推理控制思考深度。在 Opus 4.6 和 Sonnet 4.6 上，设置 `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` 为 `1` 来使用固定思考预算；Fable 5、Sonnet 5 和 Opus 4.7 及更高版本始终使用自适应推理，没有固定预算模式。

<h3 id="cloud-sessions">
  云会话
</h3>

云会话即使在你关闭应用后也会在后台继续。使用计入你的[订阅计划限制](/docs/zh-CN/costs)，没有单独的计算费用。

你可以创建具有不同网络访问级别和环境变量的自定义云环境。在启动云会话时选择环境下拉菜单并选择 **Add environment**。有关配置网络访问和环境变量的详细信息，请参阅[云环境](/docs/zh-CN/claude-code-on-the-web#the-cloud-environment)。

<h3 id="ssh-sessions">
  SSH 会话
</h3>

SSH 会话让你在远程机器上运行 Claude Code，同时使用桌面应用作为你的界面。这对于使用存在于云虚拟机、开发容器或具有特定硬件或依赖项的服务器上的代码库很有用。

要添加 SSH 连接，在启动会话之前点击环境下拉菜单并选择 **+ Add SSH connection**。对话框要求：

* **Name**：此连接的友好标签
* **SSH Host**：`user@hostname` 或在 `~/.ssh/config` 中定义的主机
* **SSH Port**：如果留空，默认为 22，或使用你的 SSH 配置中的端口
* **Identity File**：你的私钥的路径，例如 `~/.ssh/id_rsa`。留空以使用默认密钥或你的 SSH 配置。

添加后，连接出现在环境下拉菜单中。选择它在该机器上启动会话。Claude 在远程机器上运行，可以访问其文件和工具。

远程机器必须运行 Linux 或 macOS。桌面应用在你第一次连接时会自动在远程机器上安装 Claude Code。连接后，SSH 会话支持权限模式、连接器、plugins 和 MCP servers。

<h4 id="pre-configure-ssh-connections-for-your-team">
  为你的团队预配置 SSH 连接
</h4>

管理员可以通过将 `sshConfigs` 添加到[托管设置](/docs/zh-CN/settings#settings-precedence)文件来向团队成员分发 SSH 连接。以这种方式定义的连接会自动出现在每个用户的环境下拉菜单中，并显示为托管的，因此用户可以选择它们，但不能在应用中编辑或删除它们。

以下示例预配置了一个在远程主机上的 `~/projects` 中打开的单个连接：

```json theme={null}
{
  "sshConfigs": [
    {
      "id": "shared-dev-vm",
      "name": "Shared Dev VM",
      "sshHost": "user@dev.example.com",
      "sshPort": 22,
      "sshIdentityFile": "~/.ssh/id_ed25519",
      "startDirectory": "~/projects"
    }
  ]
}
```

每个条目需要 `id`、`name` 和 `sshHost`。`sshPort`、`sshIdentityFile` 和 `startDirectory` 字段是可选的。用户也可以将 `sshConfigs` 添加到他们自己的 `~/.claude/settings.json`，这是通过对话框添加的连接存储的位置。

<h4 id="restrict-which-ssh-hosts-users-can-connect-to">
  限制用户可以连接的 SSH 主机
</h4>

管理员可以通过将 `sshHostAllowlist` 添加到[托管设置](/docs/zh-CN/settings#settings-precedence)文件来限制 Desktop 的 SSH 会话到一组已批准的主机。设置后，用户只能连接到其解析的主机名与其中一个模式匹配的主机。将其设置为空数组以完全禁用 SSH 会话。

以下示例允许连接到 `devboxes.example.com` 下的任何主机以及单个命名的堡垒主机：

```json theme={null}
{
  "sshHostAllowlist": ["*.devboxes.example.com", "bastion.example.com"]
}
```

模式不区分大小写。`*` 匹配任何主机，`*.example.com` 匹配 `example.com` 和任何子域。其他任何内容都是精确匹配。检查针对通过 `ssh -G` 进行 `~/.ssh/config` 解析后的主机名运行，因此允许 `Host` 别名和 `ProxyCommand`/`ProxyJump` 条目，只要解析的 `HostName` 匹配。

`sshHostAllowlist` 仅从托管设置中读取；用户或项目设置中的值被忽略。只有 Claude Desktop 应用遵守此设置；Claude Code CLI 和 IDE 扩展不读取它，它也不限制通过 Bash 工具运行的 `ssh` 命令。它管理 Desktop 应用连接到的主机，而不是网络出口，因此如果你需要硬边界，请将其与你的组织的网络或零信任控制配对。

<h2 id="enterprise-configuration">
  企业配置
</h2>

Teams 或 Enterprise 计划上的组织可以通过管理员控制台控制、托管设置文件和设备管理策略来管理桌面应用行为。

<h3 id="admin-console-controls">
  管理员控制台控制
</h3>

这些设置通过[管理员设置控制台](https://claude.ai/admin-settings/claude-code)配置：

* **Desktop 中的 Code**：控制你的组织中的用户是否可以在桌面应用中访问 Claude Code
* **Web 中的 Code**：为你的组织启用或禁用[Web 会话](/docs/zh-CN/claude-code-on-the-web)
* **Remote Control**：为你的组织启用或禁用[远程控制](/docs/zh-CN/remote-control)
* **禁用绕过权限模式**：防止你的组织中的用户启用绕过权限模式

<h3 id="managed-settings">
  托管设置
</h3>

托管设置覆盖项目和用户设置，并应用于 Desktop 中的 Claude Code 会话。你可以在你的组织的[托管设置](/docs/zh-CN/settings#settings-precedence)文件中设置这些键，或通过管理员控制台远程推送它们。

| 键                                          | 描述                                                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissions.disableBypassPermissionsMode` | 设置为 `"disable"` 以防止用户启用绕过权限模式。                                                                                                                                                     |
| `disableAutoMode`                          | 设置为 `"disable"` 以防止用户启用 [Auto](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode) 模式。从模式选择器中删除 Auto。也在 `permissions` 下接受。                                                   |
| `autoMode`                                 | 自定义 auto 模式分类器在你的组织中信任和阻止的内容。请参阅[配置 auto 模式](/docs/zh-CN/auto-mode-config)。                                                                                                             |
| `browserExternalPageTools`                 | 设置为 `"disabled"` 以防止 Claude 使用工具在[浏览器窗格](#browse-external-sites)中读取或作用于外部页面。用户仍然可以自己导航到外部网站，本地开发服务器预览不受影响。                                                                         |
| `disableBrowserExternalNavigation`         | 设置为 `true` 以完全关闭[浏览器窗格](#browse-external-sites)中的外部浏览。用户和 Claude 都无法导航到外部网站，localhost 开发服务器预览不受影响。该值必须是 JSON 布尔值 `true`；字符串 `"true"` 被忽略。                                          |
| `sshConfigs`                               | 预配置[SSH 连接](#pre-configure-ssh-connections-for-your-team)，在环境下拉菜单中显示。用户无法编辑或删除托管连接。                                                                                                |
| `sshHostAllowlist`                         | 限制 [SSH 会话](#restrict-which-ssh-hosts-users-can-connect-to)连接到已解析主机名与这些模式之一匹配的主机。空数组禁用 SSH 会话。仅从托管设置中读取。                                                                           |
| `managedMcpServers`                        | 将 MCP 服务器配置推送到第三方部署中的所有用户。每个条目指定 `"http"`、`"sse"` 或 `"stdio"` 的传输、连接详细信息，以及可选的 `toolPolicy` 映射，该映射限制该服务器中用户可以调用的工具。仅在第三方 (3P) Desktop 部署中可用。通过托管设置文件或 MDM 提供此键，因为第三方部署不接收管理员控制台设置。 |

哪些托管设置到达 Desktop 会话取决于该会话运行的位置。模型限制（如 [`availableModels`](/docs/zh-CN/model-config#restrict-model-selection)）在 Desktop 的 Claude Code 会话中的执行方式与在终端 CLI 中相同；请参阅[表面覆盖](/docs/zh-CN/model-config#surface-coverage)。

* **此机器上的本地会话**：部署到磁盘的托管设置文件适用。通过管理员控制台远程推送的托管设置也在会话使用组织登录或直接配置的 API 密钥向 Anthropic 的 API 进行身份验证时到达这些会话，遵循与终端 CLI 相同的[设置优先级](/docs/zh-CN/settings#settings-precedence)。
* **[云会话](#cloud-sessions)**：在 Anthropic 管理的虚拟机上运行，仅接收[服务器管理的设置](/docs/zh-CN/server-managed-settings)。
* **[SSH 会话](#ssh-sessions)**：会话从远程主机读取托管设置文件。Desktop 本身在创建连接时从本地机器的托管设置中读取 `sshConfigs` 和 `sshHostAllowlist`。

`permissions.disableBypassPermissionsMode` 和 `disableAutoMode` 也在用户和项目设置中工作，但将它们放在托管设置中可防止用户覆盖它们。

Claude Code 从用户设置、`--settings` 标志和托管设置中读取 `autoMode`，但不从 `.claude/settings.json` 或 `.claude/settings.local.json` 中读取：两个文件都位于存储库目录中，因此克隆的存储库或构建步骤无法注入其自己的分类器规则。在 v2.1.207 之前，Claude Code 也读取 `.claude/settings.local.json`。

有关托管专用设置的完整列表，包括 `allowManagedPermissionRulesOnly` 和 `allowManagedHooksOnly`，请参阅[托管专用设置](/docs/zh-CN/permissions#managed-only-settings)。

<h3 id="device-management-policies">
  设备管理策略
</h3>

IT 团队可以通过 macOS 上的 MDM 或 Windows 上的组策略管理桌面应用。可用的策略包括启用或禁用 Claude Code 功能、控制自动更新和设置自定义部署 URL。

* **macOS**：通过使用 Jamf 或 Kandji 等工具的 `com.anthropic.claudefordesktop` 偏好域配置
* **Windows**：通过 `SOFTWARE\Policies\Claude` 处的注册表配置

<h3 id="network-access-requirements">
  网络访问要求
</h3>

Desktop 从 Anthropic CDN 主机加载其应用程序代码和用户内容。

```text theme={null}
anthropic.com
*.anthropic.com
claude.ai
*.claude.ai
claude.com
*.claude.com
claude.app
*.claude.app
*.claudeusercontent.com
*.claudemcpcontent.com
```

流量在端口 443 上使用 HTTPS，除非你为 [OTLP](/docs/zh-CN/monitoring-usage)、LLM 网关或 MCP 服务器配置自定义端口。

有关代理服务器、自定义证书颁发机构、mTLS 和独立 CLI 需要的域，请参阅[网络配置](/docs/zh-CN/network-config)。

要减少防火墙通配符的数量，请改为允许这些 Anthropic 主机。某些子域是动态生成的，必须保持为通配符。

```text theme={null}
anthropic.com
api.anthropic.com
a-api.anthropic.com
a-cdn.anthropic.com
s-cdn.anthropic.com
assets-proxy.anthropic.com
claude.ai
a.claude.ai
a-cdn.claude.ai
assets.claude.ai
downloads.claude.ai
*.livepreview.claude.ai
claude.com
platform.claude.com
*.livepreview.claude.app
*.claudeusercontent.com
*.claudemcpcontent.com
```

<h3 id="authentication-and-sso">
  身份验证和 SSO
</h3>

企业组织可以要求所有用户使用 SSO。有关计划级别的详细信息，请参阅[身份验证](/docs/zh-CN/authentication)，有关 SAML 配置，请参阅[设置 SSO](https://support.claude.com/en/articles/13132885-setting-up-single-sign-on-sso)；OIDC 设置在 [Claude Enterprise Administrator Guide](https://claude.com/resources/tutorials/claude-enterprise-administrator-guide) 中介绍。

<h3 id="data-handling">
  数据处理
</h3>

Claude Code 在本地会话中本地处理你的代码，或在云会话中在 Anthropic 的云基础设施上处理。对话和代码上下文被发送到 Anthropic 的 API 进行处理。有关数据保留、隐私和合规性的详细信息，请参阅[数据处理](/docs/zh-CN/data-usage)。

<h3 id="deployment">
  部署
</h3>

Desktop 可以通过企业部署工具分发：

* **macOS**：通过 MDM（如 Jamf 或 Kandji）使用 `.dmg` 安装程序分发
* **Windows**：通过 MSIX 包部署。有关企业部署选项（包括静默安装），请参阅[为 Windows 部署 Claude Desktop](https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows)

有关在防火墙中允许列表的域，请参阅上面的[网络访问要求](#network-access-requirements)。有关代理设置、自定义证书颁发机构和 LLM 网关，请参阅[网络配置](/docs/zh-CN/network-config)。

有关完整的企业配置参考，请参阅[企业配置指南](https://support.claude.com/en/articles/12622667-enterprise-configuration)。

<h2 id="coming-from-the-cli">
  来自 CLI？
</h2>

如果你已经使用 Claude Code CLI，Desktop 运行相同的底层引擎，具有图形界面。你可以在同一机器上同时运行两者，甚至在同一项目上。每个维护单独的会话历史，但它们通过 CLAUDE.md 文件共享配置和项目内存。

要将 CLI 会话移动到 Desktop，在终端中运行 `/desktop`。Claude 保存你的会话并在桌面应用中打开它，然后退出 CLI。此命令在 macOS 和 Windows 上可用，当你使用 Claude 订阅登录时。它不适用于 API 密钥身份验证或 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry。

<Tip>
  何时使用 Desktop vs CLI：当你想要管理一个窗口中的并行会话、并排排列窗格或可视化审查更改时，使用 Desktop。当你需要脚本、自动化或更喜欢终端工作流时，使用 CLI。
</Tip>

<h3 id="cli-flag-equivalents">
  CLI 标志等效项
</h3>

此表显示了常见 CLI 标志的桌面应用等效项。未列出的标志没有桌面等效项，因为它们是为脚本或自动化设计的。

| CLI                                   | Desktop 等效项                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--model sonnet`                      | 发送按钮旁的模型下拉菜单                                                                              |
| `--resume`, `--continue`              | 点击侧边栏中的会话                                                                                 |
| `--permission-mode`                   | 发送按钮旁的模式选择器                                                                               |
| `--dangerously-skip-permissions`      | 绕过权限模式。在 Pro 和 Max 计划上，在设置 → Claude Code → "允许绕过权限模式"中启用它；在 Team 和 Enterprise 计划上，组织策略控制它 |
| `--add-dir`                           | 在云会话中使用 **+** 按钮添加多个存储库                                                                   |
| `--allowedTools`, `--disallowedTools` | 无每个会话的等效项。[设置文件](/docs/zh-CN/settings)中的权限规则仍然适用。                                              |
| `--verbose`                           | [Verbose 视图模式](#switch-view-modes)在 Transcript 视图下拉菜单中                                    |
| `--print`, `--output-format`          | 不可用。Desktop 仅是交互式的。                                                                       |
| `ANTHROPIC_MODEL` 环境变量                | 发送按钮旁的模型下拉菜单                                                                              |
| `MAX_THINKING_TOKENS` 环境变量            | 在本地环境编辑器中设置。请参阅[环境配置](#environment-configuration)。                                        |

<h3 id="shared-configuration">
  共享配置
</h3>

Desktop 和 CLI 读取相同的配置文件，因此你的设置会转移：

* **[CLAUDE.md](/docs/zh-CN/memory)** 和 `CLAUDE.local.md` 文件在你的项目中被两者使用
* **[MCP servers](/docs/zh-CN/mcp)** 在 `~/.claude.json` 或 `.mcp.json` 中配置在两者中工作
* **[Hooks](/docs/zh-CN/hooks)** 和 **[skills](/docs/zh-CN/skills)** 在设置中定义适用于两者
* **[Settings](/docs/zh-CN/settings)** 在 `~/.claude.json` 和 `~/.claude/settings.json` 中是共享的。权限规则、允许的工具和 `settings.json` 中的其他设置适用于 Desktop 会话。
* **Models**：相同的[模型](/docs/zh-CN/model-config#available-models)在两者中都可用。在 Desktop 中，从发送按钮旁的下拉菜单中选择模型。你可以在会话期间从相同的下拉菜单更改模型。

<Note>
  **来自 Claude Desktop 聊天应用的 MCP servers**：Desktop 应用从 `claude_desktop_config.json` 将 MCP servers 加载到 Code 选项卡会话中，以及来自 `~/.claude.json` 和 `.mcp.json` 的服务器。在 `claude_desktop_config.json` 中定义的服务器在 Desktop 聊天表面和 Code 选项卡中都可用。

  独立 CLI 不读取 `claude_desktop_config.json`。在 macOS 和 WSL 上，运行 `claude mcp add-from-claude-desktop` 将这些服务器复制到 `~/.claude.json`。请参阅[从 Claude Desktop 导入 MCP servers](/docs/zh-CN/mcp#import-mcp-servers-from-claude-desktop)了解导入流程和范围选项。
</Note>

<h3 id="feature-comparison">
  功能比较
</h3>

此表比较了 CLI 和 Desktop 之间的核心功能。有关 CLI 标志的完整列表，请参阅 [CLI 参考](/docs/zh-CN/cli-reference)。

| 功能                                        | CLI                                                            | Desktop                                                                                                                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 权限模式                                      | 所有模式，包括 `dontAsk`                                              | Manual、Accept edits、Plan 和 Auto。绕过权限在模式选择器中出现一次启用：通过 Pro 和 Max 计划上的设置切换，或通过 Team 和 Enterprise 计划上的组织策略                                                                                                                                                               |
| `--dangerously-skip-permissions`          | CLI 标志                                                         | 绕过权限模式。在 Pro 和 Max 计划上，在设置 → Claude Code → "允许绕过权限模式"中启用它；在 Team 和 Enterprise 计划上，组织策略控制它                                                                                                                                                                            |
| [第三方提供商](/docs/zh-CN/third-party-integrations) | Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry | Anthropic 的 API 默认。对于网关路由，请参阅[将桌面应用连接到网关](/docs/zh-CN/llm-gateway-connect#desktop-app)。要在 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 或自托管 LLM 网关上运行 Code 选项卡，请参阅 [Claude Desktop on 3P](https://claude.com/docs/third-party/claude-desktop/overview)。 |
| [MCP servers](/docs/zh-CN/mcp)                 | 在设置文件中配置                                                       | 本地和 SSH 会话的连接器 UI，或设置文件                                                                                                                                                                                                                                              |
| [Plugins](/docs/zh-CN/plugins)                 | `/plugin` 命令                                                   | 插件管理器 UI                                                                                                                                                                                                                                                             |
| @mention 文件                               | 基于文本                                                           | 带自动完成；仅本地和 SSH 会话                                                                                                                                                                                                                                                    |
| 文件附件                                      | 不可用                                                            | 图像、PDF                                                                                                                                                                                                                                                               |
| 会话隔离                                      | [`--worktree`](/docs/zh-CN/cli-reference) 标志                        | 自动 worktrees                                                                                                                                                                                                                                                         |
| 多个会话                                      | 单独的终端                                                          | 侧边栏选项卡                                                                                                                                                                                                                                                               |
| 定期任务                                      | Cron 作业、CI 管道                                                  | [计划任务](/docs/zh-CN/desktop-scheduled-tasks)                                                                                                                                                                                                                               |
| 计算机使用                                     | [通过 `/mcp` 在 macOS 上启用](/docs/zh-CN/computer-use)                   | [应用和屏幕控制](#let-claude-use-your-computer)在 macOS 和 Windows 上                                                                                                                                                                                                          |
| Dispatch 集成                               | 不可用                                                            | [Dispatch 会话](#sessions-from-dispatch)在侧边栏中                                                                                                                                                                                                                          |
| 脚本和自动化                                    | [`--print`](/docs/zh-CN/cli-reference)、[Agent SDK](/docs/zh-CN/headless) | 不可用                                                                                                                                                                                                                                                                  |

<h3 id="what’s-not-available-in-desktop">
  Desktop 中不可用的内容
</h3>

以下功能仅在 CLI 或 VS Code 扩展中可用，除非另有说明：

* **第三方提供商**：Desktop 默认连接到 Anthropic 的 API。要通过网关路由 Desktop，请参阅[将桌面应用连接到网关](/docs/zh-CN/llm-gateway-connect#desktop-app)。企业部署可以通过[托管设置](https://claude.com/docs/third-party/claude-desktop/configuration)配置 Google Cloud 的 Agent Platform 和网关提供商。对于 CLI 中的 Amazon Bedrock 或 Microsoft Foundry，请参阅[快速入门](/docs/zh-CN/quickstart)。作为上述部分的例外，[Claude Desktop on 3P](https://claude.com/docs/third-party/claude-desktop/overview)在 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 或自托管 LLM 网关上运行 Code 选项卡。
* **Linux (beta)**：Linux 桌面应用中尚不提供计算机使用。请参阅 [Claude Desktop on Linux](/docs/zh-CN/desktop-linux)。
* **内联代码建议**：Desktop 不提供自动完成风格的建议。它通过对话提示和显式代码更改工作。
* **Agent teams**：并行 Claude Code 会话相互通信在 [CLI](/docs/zh-CN/agent-teams) 中可用，不在 Desktop 中。对于一个会话内的多 agent 工作，使用[动态工作流](/docs/zh-CN/workflows)，它在 Desktop 中运行。
* **Terminal-dialog 命令**：在终端中打开交互式面板的内置命令，其行为在 Code 选项卡中有所不同。直接编辑[设置文件](/docs/zh-CN/settings)来管理权限规则和配置，或从独立 CLI 运行命令。
  * 没有参数形式的命令，例如 `/permissions`，回复 `isn't available in this environment`。
  * `/config` 打开设置 → Claude Code。命令后的文本被忽略，所以 `/config theme=dark` 不设置主题。

<h2 id="troubleshooting">
  故障排除
</h2>

下面的部分涵盖特定于桌面应用的问题。对于出现在聊天中的运行时 API 错误，如 `API Error: 500`、`529 Overloaded`、`429` 或 `Prompt is too long`，请参阅[错误参考](/docs/zh-CN/errors)。这些错误及其修复在 CLI、Desktop 和 Web 中是相同的。

<h3 id="check-your-version">
  检查你的版本
</h3>

要查看你运行的桌面应用版本：

* **macOS**：点击菜单栏中的 **Claude**，然后点击 **About Claude**
* **Windows**：点击 **Help**，然后点击 **About**

点击版本号将其复制到你的剪贴板。

<h3 id="403-or-authentication-errors-in-the-code-tab">
  Code 选项卡中的 403 或身份验证错误
</h3>

如果在使用 Code 选项卡时看到 `Error 403: Forbidden` 或其他身份验证失败：

1. 从应用菜单中注销并重新登录。这是最常见的修复。
2. 验证你有活跃的付费订阅：Pro、Max、Team 或 Enterprise。
3. 如果 CLI 工作但 Desktop 不工作，完全退出桌面应用，而不仅仅是关闭窗口，然后重新打开并登录。
4. 检查你的互联网连接和代理设置。

<h3 id="blank-or-stuck-screen-on-launch">
  启动时屏幕空白或卡住
</h3>

如果应用打开但显示空白或无响应的屏幕：

1. 重启应用。
2. 检查待处理的更新。在 macOS 和 Windows 上，应用在启动时自动更新；在 Linux 上，通过 apt 更新，如 [Claude Desktop on Linux](/docs/zh-CN/desktop-linux) 中所述。
3. 在托管网络上，确认你的防火墙允许[网络访问要求](#network-access-requirements)中的 CDN 主机。
4. 在 Windows 上，在 **Windows 日志 → 应用程序** 下的事件查看器中检查崩溃日志。

<h3 id="failed-to-load-session">
  "Failed to load session"
</h3>

如果你看到 `Failed to load session`，选定的文件夹可能不再存在，Git 存储库可能需要未安装的 Git LFS，或文件权限可能阻止访问。尝试选择不同的文件夹或重启应用。

<h3 id="session-not-finding-installed-tools">
  会话找不到已安装的工具
</h3>

如果 Claude 找不到 `npm`、`node` 或其他 CLI 命令等工具，验证工具在你的常规终端中工作，检查你的 shell 配置文件是否正确设置 PATH，并重启桌面应用以重新加载环境变量。

<h3 id="git-and-git-lfs-errors">
  Git 和 Git LFS 错误
</h3>

在 Windows 上，Git 是启动本地会话的 Code 选项卡所必需的。如果你看到"Git is required"，安装 [Git for Windows](https://git-scm.com/downloads/win) 并重启应用。

如果你看到"Git LFS is required by this repository but is not installed"，从 [git-lfs.com](https://git-lfs.com/) 安装 Git LFS，运行 `git lfs install`，并重启应用。

<h3 id="mcp-servers-not-working-on-windows">
  MCP servers 在 Windows 上不工作
</h3>

如果 MCP server 切换不响应或服务器在 Windows 上连接失败，检查服务器在你的设置中是否正确配置，重启应用，验证服务器进程在任务管理器中运行，并查看服务器日志以获取连接错误。

<h3 id="app-won’t-quit">
  应用无法退出
</h3>

* **macOS**：按 Cmd+Q。如果应用不响应，使用 Cmd+Option+Esc 强制退出，选择 Claude，然后点击强制退出。
* **Windows**：使用 Ctrl+Shift+Esc 的任务管理器来结束 Claude 进程。

<h3 id="windows-specific-issues">
  Windows 特定问题
</h3>

* **安装后 PATH 未更新**：打开新的终端窗口。PATH 更新仅适用于新的终端会话。
* **并发安装错误**：如果你看到关于另一个安装正在进行的错误，但实际上没有，尝试以管理员身份运行安装程序。

<h3 id="branch-doesn’t-exist-yet-when-opening-in-cli">
  在 CLI 中打开时"Branch doesn't exist yet"
</h3>

远程会话可以创建在你的本地机器上不存在的分支。点击会话工具栏中的分支名称来复制它，然后在本地获取它：

```bash theme={null}
git fetch origin <branch-name>
git checkout <branch-name>
```

<h3 id="still-stuck">
  仍然卡住？
</h3>

* 在桌面应用中打开 Help → Get Support，或直接访问 [Claude 支持中心](https://support.claude.com/)
* 对于在独立 `claude` CLI 中也能重现的问题，在 [GitHub Issues](https://github.com/anthropics/claude-code/issues) 上搜索或提交错误

提交问题时，包括你的桌面应用版本、你的操作系统、确切的错误消息和相关日志。在 macOS 上，检查 Console.app。在 Windows 上，检查事件查看器 → Windows 日志 → 应用程序。
