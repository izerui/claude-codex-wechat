> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用 Remote Control 从任何设备继续本地会话

> 使用 Remote Control 从您的手机、平板电脑或任何浏览器继续本地 Claude Code 会话。适用于 claude.ai/code 和 Claude 移动应用。

<Note>
  Remote Control 处于研究预览阶段，在所有计划中都可用。在 Team 和 Enterprise 上，在所有者在 [Claude Code 管理员设置](https://claude.ai/admin-settings/claude-code)中启用 Remote Control 切换之前，它默认处于关闭状态。
</Note>

Remote Control 将 [claude.ai/code](https://claude.ai/code) 或 Claude 应用（[iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) 和 [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude)）连接到在您的机器上运行的 Claude Code 会话。在您的办公桌上启动一个任务，然后从沙发上的手机或另一台计算机上的浏览器继续。

当您在机器上启动 Remote Control 会话时，Claude 始终在本地运行，因此您的代码执行和文件系统访问保留在您的机器上。使用 Remote Control，您可以：

* **远程使用您的完整本地环境**：您的文件系统、[MCP servers](/docs/zh-CN/mcp)、工具和项目配置都保持可用，输入 `@` 会自动完成本地项目中的文件路径
* **同时从两个界面工作**：对话和 [subagents](/docs/zh-CN/sub-agents) 和 [dynamic workflows](/docs/zh-CN/workflows) 的进度在所有连接的设备上保持同步，因此您可以从终端、浏览器和手机交替发送消息。在 v2.1.207 之前，由 [Desktop app](/docs/zh-CN/desktop) 托管的会话不会将 subagent 或工作流进度发送到连接的设备。
* **从您的手机或浏览器发送图像和文件**：当您在 Claude 应用或 claude.ai/code 中添加附件时，Claude Code 会将其下载到您的机器并将其作为 `@` 文件引用传递给 Claude，可以带有或不带有标题。在 v2.1.202 之前，Claude Code 可能会在不带标题的附件到达会话之前将其丢弃。
* **在中断后恢复**：如果您的笔记本电脑进入睡眠状态或网络断开，当您的机器重新上线时，会话会自动重新连接。Claude Code 在连接重建时对 subagents 和工作流的状态更新进行排队，并在恢复后传递它们。在 v2.1.207 之前，在重新连接或凭证刷新期间发送的更新可能会丢失，因此连接的设备会继续将已完成的任务显示为正在运行。

与[网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)（在云基础设施上运行）不同，Remote Control 会话直接在您的机器上运行并与您的本地文件系统交互。网络和移动界面只是该本地会话的一个窗口。

本页涵盖设置、如何启动和连接到会话，以及 Remote Control 与网络上的 Claude Code 的比较。

<h2 id="requirements">
  要求
</h2>

在使用 Remote Control 之前，请确认您的环境满足以下条件：

* **订阅**：在 Pro、Max、Team 和 Enterprise 计划中可用。不支持 API 密钥。在 Team 和 Enterprise 上，Owner 必须首先在 [Claude Code 管理员设置](https://claude.ai/admin-settings/claude-code)中启用 Remote Control 切换。
* **身份验证**：运行 `claude` 并使用 `/login` 通过 claude.ai 登录（如果您还没有登录）。
* **API 端点**：在 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上不可用。从 v2.1.196 开始，当 [`ANTHROPIC_BASE_URL`](/docs/zh-CN/env-vars) 指向 `api.anthropic.com` 以外的主机（例如 [LLM gateway](/docs/zh-CN/llm-gateway) 或代理）时，Remote Control 也会被禁用。取消设置该变量以使用 Remote Control。
* **工作区信任**：在您的项目目录中至少运行一次 `claude` 以接受工作区信任对话框。

<h2 id="start-a-remote-control-session">
  启动 Remote Control 会话
</h2>

您可以从 CLI 或 VS Code 扩展启动 Remote Control 会话。CLI 提供三种调用模式；VS Code 使用 `/remote-control` 命令。

<Tabs>
  <Tab title="服务器模式">
    导航到您的项目目录并运行：

    ```bash theme={null}
    claude remote-control
    ```

    该进程在您的终端中以服务器模式保持运行，等待远程连接。它显示一个会话 URL，您可以使用该 URL 从[另一个设备连接](#connect-from-another-device)，您可以按空格键显示 QR 码以从手机快速访问。当远程会话处于活动状态时，终端显示连接状态和工具活动。

    可用标志：

    | 标志                                              | 描述                                                                                                                                                                                                                                         |
    | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | `--name "My Project"`                           | 设置自定义会话标题，在 claude.ai/code 的会话列表中可见。                                                                                                                                                                                                       |
    | `--remote-control-session-name-prefix <prefix>` | 未设置显式名称时自动生成的会话名称的前缀。默认为您的机器的主机名，生成类似 `myhost-graceful-unicorn` 的名称。设置 `CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX` 以获得相同效果。                                                                                                                |
    | `-c`, `--continue`                              | 恢复从此目录启动的最近的 Remote Control 会话，而不是创建新会话。不能与 `--session-id`、`--spawn`、`--capacity` 或 `--create-session-in-dir` 结合使用。需要 Claude Code v2.1.200 或更高版本；早期版本会将该标志拒绝为未知参数。                                                                         |
    | `--session-id <id>`                             | 通过其 ID 恢复特定的 Remote Control 会话。不能与 `--continue`、`--spawn`、`--capacity` 或 `--create-session-in-dir` 结合使用。需要 Claude Code v2.1.200 或更高版本；早期版本会将该标志拒绝为未知参数。                                                                                    |
    | `--spawn <mode>`                                | 服务器如何创建会话。<br />• `same-dir`（默认）：所有会话共享当前工作目录，因此如果编辑相同的文件可能会冲突。<br />• `worktree`：每个按需会话都获得自己的 [git worktree](/docs/zh-CN/worktrees)。需要 git 存储库。<br />• `session`：单会话模式。恰好提供一个会话并拒绝其他连接。仅在启动时设置。<br />在运行时按 `w` 在 `same-dir` 和 `worktree` 之间切换。 |
    | `--capacity <N>`                                | 最大并发会话数。默认为 32。不能与 `--spawn=session` 一起使用。                                                                                                                                                                                                 |
    | `--[no-]create-session-in-dir`                  | 在服务器启动时在当前目录中预创建一个会话，以便您有地方立即输入。在 `worktree` 模式下，此会话保留在当前目录中，而按需会话获得隔离的 worktrees。默认启用；传递 `--no-create-session-in-dir` 以不创建任何会话启动。                                                                                                         |
    | `--verbose`                                     | 显示详细的连接和会话日志。                                                                                                                                                                                                                              |
    | `--sandbox` / `--no-sandbox`                    | 启用或禁用[沙箱](/docs/zh-CN/sandboxing)以进行文件系统和网络隔离。默认关闭。                                                                                                                                                                                             |
  </Tab>

  <Tab title="交互式会话">
    要启动启用了 Remote Control 的普通交互式 Claude Code 会话，请使用 `--remote-control` 标志（或 `--rc`）：

    ```bash theme={null}
    claude --remote-control
    ```

    可选地为会话传递一个名称：

    ```bash theme={null}
    claude --remote-control "My Project"
    ```

    这为您提供了一个完整的交互式会话在您的终端中，您也可以从 claude.ai 或 Claude 应用控制。与 `claude remote-control`（服务器模式）不同，您可以在会话也可远程使用时在本地输入消息。
  </Tab>

  <Tab title="从现有会话">
    如果您已经在 Claude Code 会话中并想远程继续它，请使用 `/remote-control`（或 `/rc`）命令：

    ```text theme={null}
    /remote-control
    ```

    传递一个名称作为参数以设置自定义会话标题：

    ```text theme={null}
    /remote-control My Project
    ```

    这启动一个 Remote Control 会话，该会话继承您当前的对话历史记录。

    此命令不支持 `--verbose`、`--sandbox` 和 `--no-sandbox` 标志。
  </Tab>

  <Tab title="VS Code">
    在 [Claude Code VS Code 扩展](/docs/zh-CN/vs-code)中，在提示框中输入 `/remote-control` 或 `/rc`，或使用 `/` 打开命令菜单并选择它。

    ```text theme={null}
    /remote-control
    ```

    提示框上方会出现一个横幅，显示连接状态。连接后，单击横幅中的**在浏览器中打开**直接转到会话，或在 [claude.ai/code](https://claude.ai/code) 的会话列表中找到它。会话 URL 也会发布在对话中。

    要断开连接，请单击横幅上的关闭图标或再次运行 `/remote-control`。

    与 CLI 不同，VS Code 命令不接受名称参数或显示 QR 码。会话标题从您的对话历史记录或第一条提示派生。
  </Tab>
</Tabs>

<h3 id="check-connection-status">
  检查连接状态
</h3>

在交互式终端会话中，当连接处于活动状态时，`/rc active` 指示器位于输入框下方的页脚中，如果终端太窄无法容纳它，则隐藏。指示器文本是指向 claude.ai 上会话的链接。使用向下箭头键选择它并按 Enter，或再次运行 `/remote-control`，打开状态面板，其中包含会话 URL 和 QR 码，您可以使用它从[另一个设备连接](#connect-from-another-device)。

如果连接失败，会出现一条通知，显示失败原因，指示器从页脚消失。再次运行 `/remote-control` 以重试。

<h3 id="connect-from-another-device">
  从另一个设备连接
</h3>

一旦 Remote Control 会话处于活动状态，您有几种方式从另一个设备连接：

* **打开会话 URL** 在任何浏览器中直接转到 [claude.ai/code](https://claude.ai/code) 上的会话。
* **扫描 QR 码** 显示在会话 URL 旁边，直接在 Claude 应用中打开它。使用 `claude remote-control` 时，按空格键切换 QR 码显示。
* **打开 [claude.ai/code](https://claude.ai/code) 或 Claude 应用** 并在会话列表中按名称查找会话。在 Claude 移动应用中，点击导航中的**代码**以访问会话列表。Remote Control 会话在在线时显示带有绿色状态点的计算机图标。

当您连接时，设备显示会话已在后台运行的任何子代理和工作流。在 v2.1.208 之前，连接到在交互式终端中托管的会话的设备在其中一个子代理或工作流启动或停止之前不会显示已在运行的子代理和工作流。

远程会话标题按以下顺序选择：

1. 您传递给 `--name`、`--remote-control` 或 `/remote-control` 的名称
2. 您使用 `/rename` 设置的标题
3. 现有对话历史记录中的最后一条有意义的消息
4. 自动生成的名称，如 `myhost-graceful-unicorn`，其中 `myhost` 是您的机器的主机名或您使用 `--remote-control-session-name-prefix` 设置的前缀

如果您没有设置显式名称，一旦您发送提示，标题会更新以反映您的提示。从 Claude Code v2.1.176 开始，自动生成的标题与您的对话语言相匹配，或与配置的 [`language`](/docs/zh-CN/settings#available-settings) 设置相匹配。从 claude.ai 或 Claude 应用重命名会话也会更新在 `claude --resume` 中显示的本地标题。

如果环境已经有活动会话，您将被询问是否继续它或启动新会话。

如果您还没有 Claude 应用，请在 Claude Code 中使用 `/mobile` 命令显示 [iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) 或 [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude) 的下载 QR 码。

<h3 id="enable-remote-control-for-all-sessions">
  为所有会话启用 Remote Control
</h3>

默认情况下，Remote Control 仅在您显式运行 `claude remote-control`、`claude --remote-control` 或 `/remote-control` 时激活。要为每个交互式会话自动启用它，请在 Claude Code 中运行 `/config` 并将**为所有会话启用 Remote Control** 设置为 `true`。将其设置为 `false` 以禁用，或将其保留为未设置以遵循您的组织的默认值。在桌面应用中，您也可以从**设置 → Claude Code → 默认启用远程控制**切换此选项。在 [VS Code 扩展](/docs/zh-CN/vs-code#use-the-prompt-box)中，相同的切换显示为命令菜单的设置部分中的**为所有会话启用 Remote Control**；需要 Claude Code v2.1.203 或更高版本。

启用此设置后，每个交互式 Claude Code 进程注册一个远程会话。如果您运行多个实例，每个实例都获得自己的环境和会话。要从单个进程运行多个并发会话，请改用[服务器模式](#start-a-remote-control-session)。

<h2 id="connection-and-security">
  连接和安全
</h2>

您的本地 Claude Code 会话仅发出出站 HTTPS 请求，从不在您的机器上打开入站端口。当您启动 Remote Control 时，它向 Anthropic API 注册并轮询工作。当您从另一个设备连接时，服务器通过流连接在网络或移动客户端和您的本地会话之间路由消息。

所有流量都通过 Anthropic API 通过 TLS 传输，与任何 Claude Code 会话的传输安全相同。连接使用多个短期凭证，每个凭证的范围限定为单一目的并独立过期。

Remote Control 连接时，会话记录（包括您的消息、Claude 的响应和工具活动）存储在 Anthropic 服务器上。存储的记录保持您的设备之间的对话同步，并让会话在网络中断后重新连接。执行和文件系统访问保留在您的机器上，存储的记录根据[数据使用](/docs/zh-CN/data-usage)政策保留。

要完全关闭 Remote Control，请使用 [`disableRemoteControl`](/docs/zh-CN/settings#available-settings) 设置。具有零数据保留等合规要求的组织无法启用 Remote Control。

<h2 id="trusted-devices">
  受信任的设备
</h2>

<Note>
  受信任的设备目前处于测试阶段。功能和特性可能会随着体验的完善而演变。

  受信任的设备在 Team 和 Enterprise 计划中可用。在管理员启用它之前，它默认处于关闭状态。
</Note>

受信任的设备是一个组织范围的设置，要求成员在从 claude.ai、Claude 移动应用或 Claude Desktop 查看或控制 Remote Control 会话之前验证其设备。它将 Remote Control 访问权限与已知设备和最近的身份验证绑定，而不仅仅是已登录的账户。

当设置打开时，与 Remote Control 会话交互需要以下两项：

* **已注册的设备**：成员用于 Remote Control 的每个浏览器、手机或桌面应用都会注册自己的凭证。注册仅在完整登录后不久提供，因此设备作为真实身份验证的一部分加入受信任列表，而不是在后台静默加入。
* **最近的登录**：成员的登录不能超过 18 小时。成员不需要每天重新登录，而是使用 Face ID、Touch ID、Windows Hello 或通行密钥确认存在。此生物识别步骤立即刷新会话。

生物识别检查通过操作系统或浏览器在设备上运行，与通行密钥登录的机制相同。Anthropic 从不接收或存储指纹、面部数据或任何其他生物识别信息。仅存储设备的公钥和基本元数据，如显示名称、平台和注册时间。

该设置仅适用于 Remote Control。常规 Claude 聊天、终端中的 Claude Code 和 API 使用不受影响。

<h3 id="enable-trusted-devices-for-your-organization">
  为您的组织启用受信任的设备
</h3>

管理员从 Claude Code 管理员控制台启用该设置。

<Steps>
  <Step title="打开 Claude Code 管理员设置">
    转到 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code)。**需要受信任的设备**切换出现在 Remote Control 设置下方。
  </Step>

  <Step title="打开需要受信任的设备">
    该设置适用于组织的每个成员以及在您启用它后启动的 Remote Control 会话。在切换打开之前已经运行的会话不会被追溯保护，并继续运行而不需要设备要求，直到它们结束。不提供按团队或按项目的范围。
  </Step>

  <Step title="告诉成员期望什么">
    在启用该设置后，成员第一次从浏览器、手机或桌面应用查看或控制新的 Remote Control 会话时，系统会提示他们注册该设备。提前告知他们可以避免混淆。
  </Step>
</Steps>

<h3 id="what-members-see">
  成员看到什么
</h3>

注册是每个设备的一次性步骤。之后，唯一可见的变化是偶尔的生物识别提示。

* **首次在每个设备上使用**：成员被要求注册。如果他们的登录不是最近的，他们首先通过您的正常流程登录，包括配置的 SSO，然后确认注册。
* **日常使用**：拥有已注册设备和最近登录的成员看不到任何提示。当登录超过 18 小时时，下一次 Remote Control 交互会显示单个 Face ID、Touch ID、Windows Hello 或通行密钥提示。
* **未注册的设备**：Remote Control 会话无法查看或控制，直到设备被注册。该设备上的常规 Claude 聊天不受影响。
* **没有平台身份验证器**：在没有 Face ID、Touch ID 或 Windows Hello 的机器上的成员可以使用硬件安全密钥，或重新登录而不是升级。
* **在终端中**：运行 Claude Code 的机器在开发人员登录到 CLI 时自动接收自己的凭证。终端中没有单独的注册步骤。

<h3 id="manage-enrolled-devices">
  管理已注册的设备
</h3>

成员可以从账户设置中查看和撤销自己的设备。

打开 [claude.ai/settings/account](https://claude.ai/settings/account#trusted-devices) 并找到**受信任的设备**部分，查看每个已注册设备及其名称、平台和注册日期。删除设备会立即撤销其凭证，设备可以在新登录后重新注册。凭证如果不续期也会自动过期，因此未使用的设备会自动从受信任列表中删除。

对于丢失或被盗的设备，成员从此页面删除它。如果成员无法登录，管理员可以在管理员控制台中使用**到处登出**为该成员撤销每个会话和已注册设备，之后成员重新注册他们仍然持有的设备。

<h2 id="remote-control-vs-claude-code-on-the-web">
  Remote Control 与网络上的 Claude Code 的比较
</h2>

Remote Control 和[网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)都使用 claude.ai/code 界面。关键区别在于会话运行的位置：Remote Control 在您的机器上执行，因此您的本地 MCP servers、工具和项目配置保持可用。网络上的 Claude Code 在 Anthropic 管理的云基础设施中执行。

当您处于本地工作中间并想从另一个设备继续时，使用 Remote Control。当您想在没有任何本地设置的情况下启动任务、处理您没有克隆的存储库或并行运行多个任务时，使用网络上的 Claude Code。

<h2 id="mobile-push-notifications">
  移动推送通知
</h2>

当 Remote Control 处于活动状态时，Claude 可以向您的手机发送推送通知。

Claude 决定何时推送。它通常在长时间运行的任务完成或需要您的决定来继续时发送一个。您也可以在提示中请求推送，例如 `notify me when the tests finish`。除了下面的两个开/关切换外，没有按事件配置。

要设置移动推送通知：

<Steps>
  <Step title="安装 Claude 移动应用">
    下载 Claude 应用（[iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) 或 [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude)）。
  </Step>

  <Step title="使用您的 Claude Code 账户登录">
    使用您在终端中用于 Claude Code 的相同账户和组织。
  </Step>

  <Step title="允许通知">
    接受来自操作系统的通知权限提示。
  </Step>

  <Step title="在 Claude Code 中启用推送">
    在您的终端中，运行 `/config` 并启用**当 Claude 决定时推送**以获取主动通知，启用**当需要操作时推送**以获取权限提示和问题，或两者都启用。
  </Step>
</Steps>

如果通知没有到达：

* 如果 `/config` 显示**未注册移动设备**，请在您的手机上打开 Claude 应用，以便它可以刷新其推送令牌。下次 Remote Control 连接时，警告会清除。
* 在 iOS 上，焦点模式和通知摘要可能会抑制或延迟推送。检查设置 → 通知 → Claude。
* 在 Android 上，激进的电池优化可能会延迟传递。在系统设置中将 Claude 应用从电池优化中豁免。

Claude Code 在您在连接的终端中输入或专注时会跳过移动推送通知。从 v2.1.181 开始，您可以将 [`CLAUDE_CLIENT_PRESENCE_FILE`](/docs/zh-CN/env-vars) 设置为标记文件路径，以将其扩展到您在机器上的任何时间，即使在另一个窗口中：当文件存在时，通知会被跳过。配置屏幕锁定侦听器或类似工具，以在屏幕解锁时创建文件，在屏幕锁定时删除文件。

<h2 id="limitations">
  限制
</h2>

* **每个交互式进程一个远程会话**：在服务器模式之外，每个 Claude Code 实例一次支持一个远程会话。使用[服务器模式](#start-a-remote-control-session)从单个进程运行多个并发会话。
* **本地进程必须保持运行**：Remote Control 作为本地进程运行。如果您关闭终端、退出 VS Code 或以其他方式停止 `claude` 进程，会话结束。
* **扩展网络中断**：如果您的机器处于唤醒状态但无法在大约 10 分钟以上的时间内到达网络，会话超时并且进程退出。再次运行 `claude remote-control` 以启动新会话。
* **Ultraplan 断开 Remote Control**：启动 [ultraplan](/docs/zh-CN/ultraplan) 会话会断开任何活动的 Remote Control 会话，因为两个功能都占据 claude.ai/code 界面，一次只能连接一个。
* **某些命令仅限本地**：仅在终端界面中运行的命令，例如 `/plugin` 或 `/resume`，仅从本地 CLI 工作，无论您是否传递参数。以下命令可从移动和网络工作：
  * 文本输出命令：`/compact`、`/clear`、`/context`、`/usage`、`/exit`、`/usage-credits`（运行文本形式而不是打开 CLI 内对话框）、`/recap`、`/reload-plugins`
  * `/model`、`/effort`、`/fast`、`/color` 和 `/rename`：将值作为参数传递，例如 `/model sonnet` 或 `/effort high`。从移动和网络，`/model` 和 `/effort` 在终端选择器或滑块的位置接受参数。
  * `/mcp`，从 v2.1.166 开始：从移动应用返回服务器状态的文本摘要而不是打开选择器。在网络上，`/mcp` 单独打开 [claude.ai 连接器](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai) 的目录而不是返回摘要。`reconnect`、`enable` 和 `disable` [子命令](/docs/zh-CN/commands#all-commands)可从两者工作。与本地 CLI 不同，不带服务器名称的 `/mcp reconnect` 会重新连接每个已失败或需要身份验证的服务器。
  * `/config`，从 v2.1.181 开始：从移动应用，传递 `key=value` 以设置一个设置，或不带参数运行它以列出您可以设置的键。在网络上，`/config` 打开您设置的 Claude Code 部分，并忽略命令后的文本。

<h2 id="troubleshooting">
  故障排除
</h2>

<h3 id="remote-control-requires-a-claude-ai-subscription">
  "Remote Control 需要 claude.ai 订阅"
</h3>

您未使用 claude.ai 账户进行身份验证。运行 `claude auth login` 并选择 claude.ai 选项。如果在您的环境中设置了 `ANTHROPIC_API_KEY`，请先取消设置它。

在 v2.1.206 之前，在未登出的情况下运行 `/remote-control` 会报告 `Unknown command: /remote-control` 而不是此消息。

<h3 id="remote-control-requires-a-full-scope-login-token">
  "Remote Control 需要完整范围的登录令牌"
</h3>

您使用来自 `claude setup-token` 或 `CLAUDE_CODE_OAUTH_TOKEN` 环境变量的长期令牌进行身份验证。这些令牌仅限于推理，无法建立 Remote Control 会话。运行 `claude auth login` 以改用完整范围的会话令牌进行身份验证。

<h3 id="unable-to-determine-your-organization-for-remote-control-eligibility">
  "无法确定您的组织以进行 Remote Control 资格检查"
</h3>

您的缓存账户信息已过期或不完整。运行 `claude auth login` 以刷新它。

<h3 id="remote-control-is-not-yet-enabled-for-your-account">
  "Remote Control 尚未为您的账户启用"
</h3>

Remote Control 推出尚未到达您的账户，或您的缓存权利已过期。如果您最近更改了计划，请运行 `claude auth logout` 然后 `claude auth login` 以刷新它们。运行 `claude doctor` 以查看哪个单独的资格检查失败。环境变量冲突、无法到达的检查和组织策略各自产生自己的消息，因此此错误意味着推出门本身。

<h3 id="couldn’t-verify-remote-control-eligibility">
  "无法验证 Remote Control 资格"
</h3>

Claude Code 无法到达功能标志服务以检查是否为您的账户启用了 Remote Control，通常是因为您离线或代理阻止了请求。一旦您有网络访问权限，请重试，或运行 `claude doctor` 以获取详细信息。相关消息"无法验证您的组织的 Remote Control 策略"具有相同的原因和相同的修复。这两条消息都在 v2.1.178 中添加。

<h3 id="remote-control-is-only-available-when-using-claude-via-api-anthropic-com">
  "Remote Control 仅在通过 api.anthropic.com 使用 Claude 时可用"
</h3>

该会话不是直接与 Anthropic API 通信，因此没有 claude.ai 后端可配对。这发生在 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上。从 v2.1.196 开始，当 [`ANTHROPIC_BASE_URL`](/docs/zh-CN/env-vars) 指向 `api.anthropic.com` 以外的主机时，例如 [LLM 网关](/docs/zh-CN/llm-gateway) 或代理，即使您使用 claude.ai 登录，也会发生这种情况。取消设置 `ANTHROPIC_BASE_URL` 并重启会话以使用 Remote Control。

<h3 id="remote-control-is-disabled-by-your-organization’s-policy">
  "Remote Control 被您的组织的策略禁用"
</h3>

此错误有四个不同的原因。首先运行 `/status` 以查看您使用的登录方法和订阅。

* **您使用 API 密钥或 Console 账户进行身份验证**：Remote Control 需要 claude.ai OAuth。运行 `/login` 并选择 claude.ai 选项。如果在您的环境中设置了 `ANTHROPIC_API_KEY`，请取消设置它。
* **您的组织的所有者尚未启用它**：Remote Control 在 Team 和 Enterprise 计划上默认处于关闭状态。所有者可以在 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code) 通过打开 **Remote Control** 切换来启用它。此切换是服务器端组织设置。
* **管理员切换呈灰色**：您的组织有数据保留或合规配置与 Remote Control 不兼容。这无法从管理面板更改。请联系 Anthropic 支持以讨论选项。
* **错误提及 `disableRemoteControl`**：您的 IT 管理员已通过[托管设置](/docs/zh-CN/settings#settings-files)在此设备上禁用了 Remote Control，独立于组织范围的切换。

<h3 id="remote-credentials-fetch-failed">
  "Remote credentials fetch failed"
</h3>

Claude Code 无法从 Anthropic API 获取短期凭证以建立连接。使用 `--verbose` 重新运行以查看完整错误：

```bash theme={null}
claude remote-control --verbose
```

常见原因：

* 未登录：运行 `claude` 并使用 `/login` 使用您的 claude.ai 账户进行身份验证。Remote Control 不支持 API 密钥身份验证。
* 网络或代理问题：防火墙或代理可能阻止出站 HTTPS 请求。Remote Control 需要访问端口 443 上的 Anthropic API。
* 会话创建失败：如果您还看到 `Session creation failed — see debug log`，失败发生在设置的早期。检查您的订阅是否处于活动状态。

<h3 id="couldn’t-reconnect-to-your-remote-control-session">
  "无法重新连接到您的 Remote Control 会话"
</h3>

当您使用 `claude --resume` 或 `claude --continue` 恢复对话时，Claude Code 会重新连接到该对话中记录的 Remote Control 会话。此消息意味着重新连接因可能是临时的原因（例如网络中断或服务器错误）而失败，因此 Claude Code 无法确认远程会话是否仍然存在。当服务器确认之前的会话不再存在时，Claude Code 会创建新的 Remote Control 会话而不显示此消息。

您的本地会话继续运行而不使用 Remote Control。运行 `/remote-control` 以重试连接，或启动 Claude Code 而不使用 `--resume` 以创建新的 Remote Control 会话。

在 v2.1.200 之前，重新连接失败会创建新的 Remote Control 会话而不是显示此消息，这在 claude.ai/code 的会话列表中留下了额外的会话。

<h3 id="your-organization-requires-trusted-devices-for-remote-control-but-this-device-is-not-enrolled">
  "您的组织需要受信任的设备用于 Remote Control，但此设备未注册"
</h3>

您的组织已[启用受信任的设备](#trusted-devices)，此机器尚未注册。在 Claude Code 中运行 `/login`。注册作为登录的一部分进行，没有单独的注册命令。

<h3 id="session-expired-for-trusted-device-check">
  "session expired for trusted-device check"
</h3>

您的登录已超过 18 小时。在 Claude Code 中运行 `/login`，或在 claude.ai 或移动应用提示您时使用 Face ID、Touch ID、Windows Hello 或通行密钥确认。请参阅[受信任的设备](#trusted-devices)。

<h2 id="choose-the-right-approach">
  选择正确的方法
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

<h2 id="related-resources">
  相关资源
</h2>

* [网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)：在 Anthropic 管理的云环境中运行会话，而不是在您的机器上
* [Ultraplan](/docs/zh-CN/ultraplan)：从您的终端启动云规划会话并在浏览器中查看计划
* [Channels](/docs/zh-CN/channels)：将 Telegram、Discord 或 iMessage 转发到会话中，以便 Claude 在您离开时对消息做出反应
* [Dispatch](/docs/zh-CN/desktop#sessions-from-dispatch)：从您的手机发送任务消息，它可以生成 Desktop 会话来处理它
* [身份验证](/docs/zh-CN/authentication)：设置 `/login` 并管理 claude.ai 的凭证
* [CLI 参考](/docs/zh-CN/cli-reference)：包括 `claude remote-control` 的标志和命令的完整列表
* [安全](/docs/zh-CN/security)：Remote Control 会话如何适应 Claude Code 安全模型
* [数据使用](/docs/zh-CN/data-usage)：在本地和远程会话期间通过 Anthropic API 流动的数据
