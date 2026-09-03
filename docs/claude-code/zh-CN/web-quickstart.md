> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 在网络上开始使用 Claude Code

> 从浏览器或手机在云中运行 Claude Code。连接 GitHub 仓库、提交任务，并在无需本地设置的情况下审查 PR。

<Note>
  Claude Code on the web 处于研究预览阶段，适用于 Pro、Max 和 Team 用户，以及拥有高级席位或 Chat + Claude Code 席位的企业用户。
</Note>

Claude Code on the web 在 Anthropic 管理的云基础设施上运行，而不是在您的机器上。从浏览器中的 [claude.ai/code](https://claude.ai/code) 或 Claude 移动应用提交任务。

您需要一个 GitHub 仓库来[开始使用](#connect-github-and-create-an-environment)。Claude 将其克隆到隔离的虚拟机中，进行更改，并为您推送一个分支以供审查。会话在设备间持久化，因此您在笔记本电脑上开始的任务稍后可以从手机上审查。

Claude Code on the web 适用于：

* **并行任务**：同时运行多个独立任务，每个任务在自己的会话和分支中，无需管理多个 worktrees
* **您本地没有的仓库**：Claude 在每个会话中新鲜克隆仓库，因此您无需检出它
* **不需要频繁指导的任务**：提交一个定义明确的任务，做其他事情，当 Claude 完成时审查结果
* **代码问题和探索**：理解代码库或追踪功能如何实现，无需本地检出

对于需要您的本地配置、工具或环境的工作，在本地运行 Claude Code 或使用 [Remote Control](/docs/zh-CN/remote-control) 更合适。

<h2 id="how-sessions-run">
  会话如何运行
</h2>

当您提交任务时：

1. **克隆和准备**：您的仓库被克隆到 Anthropic 管理的 VM，如果配置了，您的[设置脚本](/docs/zh-CN/claude-code-on-the-web#setup-scripts)会运行。
2. **配置网络**：互联网访问根据您的环境的[访问级别](/docs/zh-CN/claude-code-on-the-web#access-levels)设置。
3. **工作**：Claude 分析代码、进行更改、运行测试并检查其工作。您可以全程观看和指导，或者离开，当完成时返回。
4. **推送分支**：当 Claude 到达停止点时，它将其分支推送到 GitHub。您审查差异、留下内联注释、创建 PR 或发送另一条消息以继续。

推送分支时会话不会关闭。PR 创建和进一步编辑都在同一对话中进行。

<h2 id="compare-ways-to-run-claude-code">
  比较运行 Claude Code 的方式
</h2>

Claude Code 在任何地方的行为都相同。改变的是代码执行的位置以及您的本地配置是否可用。Desktop 应用提供本地和云会话，因此其下面的答案取决于您选择的是哪一个：

|                                     | On the web                                                                                     | Remote Control  | Terminal CLI | Desktop app |
| :---------------------------------- | :--------------------------------------------------------------------------------------------- | :-------------- | :----------- | :---------- |
| **代码运行在**                           | Anthropic 云 VM                                                                                 | 您的机器            | 您的机器         | 您的机器或云 VM   |
| **您从以下位置聊天**                        | claude.ai 或移动应用                                                                                | claude.ai 或移动应用 | 您的终端         | Desktop UI  |
| **使用您的本地配置**                        | 否，仅限仓库                                                                                         | 是               | 是            | 本地为是，云为否    |
| **需要 GitHub**                       | 是，或通过 `--cloud` [捆绑本地仓库](/docs/zh-CN/claude-code-on-the-web#send-local-repositories-without-github) | 否               | 否            | 仅限云会话       |
| **断开连接时继续运行**                       | 是                                                                                              | 当终端保持打开时        | 否            | 取决于会话类型     |
| **[权限模式](/docs/zh-CN/permission-modes)** | 接受编辑、Plan、自动                                                                                   | 询问、自动接受编辑、Plan  | 所有模式         | 取决于会话类型     |
| **网络访问**                            | 每个环境可配置                                                                                        | 您的机器网络          | 您的机器网络       | 取决于会话类型     |

请参阅[终端快速入门](/docs/zh-CN/quickstart)、[Desktop 应用](/docs/zh-CN/desktop)或 [Remote Control](/docs/zh-CN/remote-control) 文档来设置这些。

<h2 id="connect-github-and-create-an-environment">
  连接 GitHub 并创建环境
</h2>

设置是一次性过程。如果您已经使用 GitHub CLI，您可以[从您的终端执行此操作](#connect-from-your-terminal)而不是浏览器。

<Steps>
  <Step title="访问 claude.ai/code">
    转到 [claude.ai/code](https://claude.ai/code) 并使用您的 Anthropic 账户登录。
  </Step>

  <Step title="安装 Claude GitHub App">
    登录后，claude.ai/code 会提示您连接 GitHub。按照提示安装 Claude GitHub App 并授予其访问您的仓库的权限。云会话适用于现有的 GitHub 仓库，因此要启动新项目，请先[在 GitHub 上创建一个空仓库](https://github.com/new)。
  </Step>

  <Step title="创建您的环境">
    连接 GitHub 后，系统会提示您创建云环境。环境控制 Claude 在会话期间可以访问的网络以及创建新会话时运行的内容。请参阅[已安装的工具](/docs/zh-CN/claude-code-on-the-web#installed-tools)了解无需任何配置即可使用的内容。

    表单有以下字段：

    * **Name**：显示标签。当您为不同的项目或访问级别有多个环境时很有用。
    * **Network access**：控制会话可以在互联网上访问的内容。默认值 `Trusted` 允许连接到[常见包注册表](/docs/zh-CN/claude-code-on-the-web#default-allowed-domains)，如 npm、PyPI 和 RubyGems，同时阻止一般互联网访问。
    * **Environment variables**：可选变量，在每个会话中可用，采用 `.env` 格式。不要用引号包装值，因为引号会作为值的一部分存储。这些对任何可以编辑此环境的人都可见。
    * **Setup script**：可选的 Bash 脚本，在 Claude Code 启动前运行。使用它来安装云 VM 不包含的系统工具，如 `apt install -y gh`。结果被[缓存](/docs/zh-CN/claude-code-on-the-web#environment-caching)，因此脚本不会在每个会话上重新运行。请参阅[设置脚本](/docs/zh-CN/claude-code-on-the-web#setup-scripts)了解示例和调试提示。

    对于第一个项目，保留默认值并单击**Create environment**。您可以[稍后编辑它或为不同的项目创建其他环境](/docs/zh-CN/claude-code-on-the-web#configure-your-environment)。
  </Step>
</Steps>

<h3 id="connect-from-your-terminal">
  从您的终端连接
</h3>

如果您已经使用 GitHub CLI (`gh`)，您可以在不打开浏览器的情况下设置 Claude Code on the web。这需要 [Claude Code CLI](/docs/zh-CN/quickstart)。`/web-setup` 读取您的本地 `gh` 令牌，将其链接到您的 Claude 账户，如果您没有云环境，则创建一个默认的云环境。

<Note>
  启用了[零数据保留](/docs/zh-CN/zero-data-retention)的组织无法使用 `/web-setup` 或其他云会话功能。如果未安装或验证 GitHub CLI，`/web-setup` 会打开浏览器入门流程。
</Note>

<Steps>
  <Step title="使用 GitHub CLI 进行身份验证">
    在您的 shell 中，如果您还没有进行身份验证，请对 GitHub CLI 进行身份验证：

    ```bash theme={null}
    gh auth login
    ```
  </Step>

  <Step title="登录到 Claude">
    在 Claude Code CLI 中，运行 `/login` 以使用您的 claude.ai 账户登录。如果您已经登录，请跳过此步骤。
  </Step>

  <Step title="运行 /web-setup">
    在 Claude Code CLI 中，运行：

    ```text theme={null}
    /web-setup
    ```

    这会将您的 `gh` 令牌同步到您的 Claude 账户。如果您还没有云环境，`/web-setup` 会创建一个具有 Trusted 网络访问和无设置脚本的环境。您可以[稍后编辑环境或添加变量](/docs/zh-CN/claude-code-on-the-web#configure-your-environment)。一旦 `/web-setup` 完成，您可以从您的终端使用 [`--cloud`](/docs/zh-CN/claude-code-on-the-web#from-terminal-to-web) 启动云会话，或使用 [`/schedule`](/docs/zh-CN/routines) 设置定期任务。
  </Step>
</Steps>

<h2 id="start-a-task">
  开始任务
</h2>

连接了 GitHub 和创建了环境后，您已准备好提交任务。

<Steps>
  <Step title="选择仓库和分支">
    从 [claude.ai/code](https://claude.ai/code) 或 Claude 移动应用中的 Code 选项卡，单击输入框下方的仓库选择器，并为 Claude 选择要在其中工作的仓库。每个仓库都显示一个分支选择器。更改它以从功能分支而不是默认分支启动 Claude。您可以添加多个仓库以在一个会话中跨它们工作。
  </Step>

  <Step title="选择权限模式">
    输入旁边的模式下拉菜单默认为**Accept edits**，其中 Claude 进行更改并推送分支而无需停止以获得批准。如果您希望 Claude 提出方法并在编辑文件前等待您的同意，请切换到**Plan Mode**。云会话不提供 Manual 或 Bypass 权限。请参阅[权限模式的完整列表](/docs/zh-CN/permission-modes#available-modes)了解每种权限允许的操作。
  </Step>

  <Step title="描述任务并提交">
    输入您想要的内容的描述并按 Enter。要具体：

    * 命名文件或函数："Add a README with setup instructions" 或 "Fix the failing auth test in `tests/test_auth.py`" 比 "fix tests" 更好
    * 如果您有错误输出，请粘贴它
    * 描述预期行为，而不仅仅是症状

    Claude 克隆仓库，如果配置了则运行您的设置脚本，并开始工作。每个任务都有自己的会话和自己的分支，因此您无需等待一个完成就可以开始另一个。
  </Step>
</Steps>

<h2 id="pre-fill-sessions">
  预填充会话
</h2>

您可以通过向 [claude.ai/code](https://claude.ai/code) URL 添加查询参数来预填充新会话的提示、仓库和环境。使用此功能来构建集成，例如问题跟踪器中的按钮，该按钮使用问题描述作为提示打开 Claude Code。

| 参数             | 描述                                                                 |
| :------------- | :----------------------------------------------------------------- |
| `prompt`       | 要在输入框中预填充的提示文本。也接受别名 `q`。                                          |
| `prompt_url`   | 要从中获取提示文本的 URL，用于太长而无法嵌入查询字符串的提示。URL 必须允许跨源请求。当也设置了 `prompt` 时被忽略。 |
| `repositories` | 要预选的 `owner/repo` 段的逗号分隔列表。也接受别名 `repo`。                           |
| `environment`  | [环境](#connect-github-and-create-an-environment)的名称或 ID 以预选。        |

对每个值进行 URL 编码。下面的示例打开表单，其中已选择提示和仓库：

```text theme={null}
https://claude.ai/code?prompt=Fix%20the%20login%20bug&repositories=acme/webapp
```

<h2 id="review-and-iterate">
  审查和迭代
</h2>

当 Claude 完成时，审查更改，在特定行上留下反馈，并继续直到差异看起来正确。

<Steps>
  <Step title="打开差异视图">
    差异指示器显示整个会话中添加和删除的行，例如 `+42 -18`。选择它以打开差异视图，左侧是文件列表，右侧是更改。
  </Step>

  <Step title="留下内联注释">
    选择差异中的任何行，输入您的反馈，然后按 Enter。注释排队直到您发送下一条消息，然后它们与其捆绑。Claude 看到"at `src/auth.ts:47`, don't catch the error here"与您的主要指令一起，因此您不必描述问题在哪里。
  </Step>

  <Step title="创建拉取请求">
    当差异看起来正确时，选择差异视图顶部的**Create PR**。您可以将其作为完整 PR、草稿打开，或跳转到 GitHub 的撰写页面，其中包含生成的标题和描述。
  </Step>

  <Step title="在 PR 后继续迭代">
    创建 PR 后会话保持活跃。将 CI 失败输出或审查者注释粘贴到聊天中，并要求 Claude 解决它们。要让 Claude 自动监控 PR，请参阅[自动修复拉取请求](/docs/zh-CN/claude-code-on-the-web#auto-fix-pull-requests)。
  </Step>
</Steps>

<h2 id="troubleshoot-setup">
  故障排除设置
</h2>

<h3 id="no-repositories-appear-after-connecting-github">
  连接 GitHub 后没有仓库出现
</h3>

云会话可以使用连接的 GitHub 账户可以看到的任何仓库，无论 Claude GitHub App 安装在哪些仓库上。如果仓库丢失，请验证连接的 GitHub 账户在 GitHub 上有权访问它。如果您还想为仓库启用[自动修复](/docs/zh-CN/claude-code-on-the-web#auto-fix-pull-requests)，请在其上安装应用：在 github.com 上，打开**Settings → Applications → Claude → Configure** 并验证仓库是否列在**Repository access** 下。私有仓库需要与公共仓库相同的授权。

<h3 id="the-page-only-shows-a-github-login-button">
  页面仅显示 GitHub 登录按钮
</h3>

云会话需要连接的 GitHub 账户。通过上面的浏览器流程连接，或如果您使用 GitHub CLI，从您的终端运行 `/web-setup`。如果您根本不想连接 GitHub，请参阅 [Remote Control](/docs/zh-CN/remote-control) 以在您自己的机器上运行 Claude Code 并从网络监控它。

<h3 id="not-available-for-the-selected-organization">
  "Not available for the selected organization"
</h3>

企业组织可能需要管理员启用 Claude Code on the web。联系您的 Anthropic 账户团队。

<h3 id="/web-setup-shows-no-commands-match-or-unknown-command">
  `/web-setup` 显示 "No commands match" 或 "Unknown command"
</h3>

`/web-setup` 在 Claude Code CLI 内运行，而不是在您的 shell 中。首先启动 `claude`，然后在提示符处输入 `/web-setup`。

如果您在 Claude Code 内输入它，命令菜单显示 `No commands match "/web-setup"`，或提交它返回 `Unknown command: /web-setup`，该命令被隐藏是因为未满足要求。原因通常是您使用 API 密钥或第三方提供商而不是 claude.ai 订阅进行身份验证。运行 `/login` 以使用您的 claude.ai 账户登录。

<h3 id="could-not-create-a-cloud-environment-or-no-cloud-environment-available-when-using-cloud-or-ultraplan">
  使用 `--cloud` 或 ultraplan 时出现 "Could not create a cloud environment" 或 "No cloud environment available"
</h3>

远程会话功能如果您没有云环境，会自动创建一个默认的云环境。如果您看到 "Could not create a cloud environment"，自动创建失败。如果您看到 "No cloud environment available"，您的 CLI 早于自动创建。在任何一种情况下，在 Claude Code CLI 中运行 `/web-setup` 以手动创建一个，或访问 [claude.ai/code](https://claude.ai/code) 并按照上面的**Create your environment** 步骤。

<h3 id="setup-script-failed">
  设置脚本失败
</h3>

设置脚本以非零状态退出，这会阻止会话启动。常见原因：

* 包安装失败，因为注册表不在您的[网络访问级别](/docs/zh-CN/claude-code-on-the-web#access-levels)中。`Trusted` 涵盖大多数包管理器；`None` 阻止它们全部。
* 脚本引用在新鲜克隆中不存在的文件或路径。
* 在本地工作的命令在 Ubuntu 上需要不同的调用。

要调试，在脚本顶部添加 `set -x` 以查看哪个命令失败。对于非关键命令，附加 `|| true` 以便它们不会阻止会话启动。

<h3 id="new-sessions-hang-or-time-out-during-setup">
  新会话在设置期间挂起或超时
</h3>

如果新会话在设置脚本步骤上停滞或在脚本完成前因通用容器错误而失败，脚本可能超过了构建[环境缓存](/docs/zh-CN/claude-code-on-the-web#environment-caching)的大约五分钟时间预算。拉取大型 Docker 镜像、同步完整依赖树或下载模型权重等繁重步骤经常会将总数推过限制，特别是当它们一个接一个运行时。

要解决此问题，修剪脚本使其可靠地在五分钟内完成：

* 使用 `&` 和最后的 `wait` 并行运行独立安装，而不是按顺序运行它们。
* 将最大的下载移出设置脚本，进入[SessionStart hook](/docs/zh-CN/claude-code-on-the-web#setup-scripts-vs-sessionstart-hooks)，在后台启动它们，以便会话在它们完成时变得可用。
* 从设置脚本中删除长重试睡眠，因为停滞的重试循环会计入预算。

<h3 id="session-keeps-running-after-closing-the-tab">
  关闭选项卡后会话继续运行
</h3>

这是设计使然。关闭选项卡或导航离开不会停止会话。它在后台继续运行，直到 Claude 完成当前任务，然后空闲。从侧边栏，您可以[存档会话](/docs/zh-CN/claude-code-on-the-web#archive-sessions)以将其从列表中隐藏，或[删除它](/docs/zh-CN/claude-code-on-the-web#delete-sessions)以永久删除它。

<h2 id="next-steps">
  后续步骤
</h2>

现在您可以提交和审查任务，这些页面涵盖接下来的内容：从您的终端启动云会话、安排定期工作以及给 Claude 常设指令。

* [使用 Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)：完整参考，包括将会话传送到您的终端、设置脚本、环境变量和网络配置
* [Routines](/docs/zh-CN/routines)：按计划、通过 API 调用或响应 GitHub 事件自动化工作
* [CLAUDE.md](/docs/zh-CN/memory)：给 Claude 持久指令和上下文，在每个会话开始时加载
* 为 [iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) 或 [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude) 安装 Claude 移动应用以从您的手机监控会话。从 Claude Code CLI，`/mobile` 显示 QR 码。
