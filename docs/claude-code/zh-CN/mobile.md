> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Claude Code 移动版

> 从您的手机使用 Claude 应用程序启动、监控和指导 Claude Code 任务，支持 iOS 和 Android。

Claude [iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) 和 [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude) 应用是 Claude Code 会话的客户端，而不是代码运行的地方。从您的手机，您可以访问 Anthropic 托管基础设施上的[云会话](#start-and-monitor-cloud-sessions)、通过[远程控制](#continue-a-local-session-with-remote-control)运行在您自己机器上的会话，或通过 [Dispatch](/docs/zh-CN/desktop#sessions-from-dispatch) 访问桌面应用。

<Note>
  Claude Code 没有单独的移动应用：云会话和远程控制都位于 Claude 应用中的 **Code** 选项卡中，Dispatch 是您在应用中向其发送消息的任务。
</Note>

<h2 id="get-the-app">
  获取应用程序
</h2>

<Steps>
  <Step title="下载 Claude 应用程序">
    为 [iOS](https://apps.apple.com/us/app/claude-by-anthropic/id6473753684) 或 [Android](https://play.google.com/store/apps/details?id=com.anthropic.claude) 安装 Claude 应用程序。在 iPad 上，安装相同的 iOS 应用程序。

    <Tip>
      在 Claude Code 会话中运行 `/mobile` 以显示您可以扫描的下载二维码。`/ios` 和 `/android` 执行相同的操作。
    </Tip>
  </Step>

  <Step title="登录">
    使用您用于 Claude Code 的相同 claude.ai 账户和组织登录。云会话和远程控制需要 claude.ai 账户，因此无法通过 Anthropic Console API 密钥或来自 Amazon Bedrock 等第三方提供商的方式访问。
  </Step>

  <Step title="打开 Code 选项卡">
    在应用程序的导航中点击 **Code** 以访问您的会话，或在您的手机上打开 [claude.ai/code/new](https://claude.ai/code/new) 以在应用程序中启动新的 Code 会话。如果您看不到 Code 选项卡，您的计划或组织可能不包括这些功能；请参阅[按订阅计划的可用性](/docs/zh-CN/feature-availability#availability-by-subscription-plan)。
  </Step>
</Steps>

<h2 id="work-from-your-phone">
  从您的手机工作
</h2>

从应用程序中，您可以启动云会话、驱动在您的计算机上运行的 Claude Code 会话，或向 Dispatch 消息传递任务。应用程序对所有三者都是相同的；它们在工作发生的位置上有所不同。

| 功能                                                | 您连接到的内容                   | 何时使用                                                                   |
| :------------------------------------------------ | :------------------------ | :--------------------------------------------------------------------- |
| [Claude Code 网页版](/docs/zh-CN/claude-code-on-the-web)  | Anthropic 托管基础设施上的云会话     | 您的存储库在 GitHub 上，任务应在您放下手机后继续运行。请参阅[网页快速入门](/docs/zh-CN/web-quickstart)进行设置。 |
| [远程控制](/docs/zh-CN/remote-control)                     | 在您的计算机上运行的 Claude Code 会话 | 工作需要您的本地文件系统、工具或 MCP 服务器。                                              |
| [Dispatch](/docs/zh-CN/desktop#sessions-from-dispatch) | 您计算机上的桌面应用程序              | 您想消息传递一个任务，让 Dispatch 决定如何运行它。需要 Pro 或 Max 计划。                         |

如果您的计算机将关闭，请使用云会话：它们在 Anthropic 的基础设施上运行，并在您的笔记本电脑关闭后继续运行。远程控制和 Dispatch 驱动您自己的机器，因此它需要保持打开状态并运行 Claude Code 或桌面应用程序。如果您的机器在远程控制会话期间进入睡眠状态，会话将在其恢复在线时重新连接。

有关也涵盖 Channels、Slack 和计划任务的更完整比较，请参阅[当您远离终端时工作](/docs/zh-CN/platforms#work-when-you-are-away-from-your-terminal)。

云会话和远程控制从 **Code** 选项卡运行，下面将介绍。对于 Dispatch（您在应用程序中作为任务消息传递），请参阅[来自 Dispatch 的会话](/docs/zh-CN/desktop#sessions-from-dispatch)。

<h3 id="start-and-monitor-cloud-sessions">
  启动和监控云会话
</h3>

Claude Code 网页版在 Anthropic 托管的云基础设施上运行任务，因此会话在您放下手机后继续进行。从 Code 选项卡中，选择一个存储库和分支，描述任务，然后提交。会话在设备之间持久化：您在笔记本电脑上启动的任务已准备好从您的手机进行审查，您从手机启动的任务在您回到办公桌时正在等待。

在应用程序中打开会话以检查进度、回答 Claude 的问题或将其引导到新的方向。您也可以告诉 Claude [监视拉取请求](/docs/zh-CN/claude-code-on-the-web#auto-fix-pull-requests)并在 CI 失败或审查评论到达时修复它们。要连接 GitHub 并设置您的环境，请按照[网页快速入门](/docs/zh-CN/web-quickstart)进行操作，并查看[Claude Code 网页版](/docs/zh-CN/claude-code-on-the-web)了解云会话可以执行的所有操作。

<h3 id="continue-a-local-session-with-remote-control">
  使用远程控制继续本地会话
</h3>

远程控制将 Claude 应用程序连接到在您的机器上运行的 Claude Code 会话，因此代码执行和文件系统访问保持本地，而您从手机驱动会话。在您的计算机上使用 `claude remote-control` 启动会话，或在已打开的会话中运行 `/remote-control`。然后扫描终端可以显示的会话二维码，或打开 Claude 应用程序，点击 **Code**，然后从列表中选择会话。有关每个选项，请参阅[从另一个设备连接](/docs/zh-CN/remote-control#connect-from-another-device)。

您在 Claude 应用程序中添加的附件也会到达本地会话：Claude Code 将图像或文件下载到您的机器，并将其作为 `@` 文件引用传递给 Claude。有关要求、调用模式和故障排除，请参阅[远程控制概述](/docs/zh-CN/remote-control)。

<h3 id="get-push-notifications">
  获取推送通知
</h3>

当远程控制处于活动状态时，Claude 可以向您的手机发送推送通知，通常在长时间运行的任务完成或需要您做出决定时。您也可以在提示中请求一个，例如 `notify me when the tests finish`。有关两个 `/config` 切换和交付故障排除，请参阅[移动推送通知](/docs/zh-CN/remote-control#mobile-push-notifications)。

Dispatch 在其生成的 Code 会话完成或需要您的批准时发送自己的通知，如[来自 Dispatch 的会话](/docs/zh-CN/desktop#sessions-from-dispatch)中所述。

<h2 id="limitations">
  限制
</h2>

移动客户端涵盖了会话需要的大部分内容，但有一些限制：

* **仅限本地命令**：仅在终端界面中运行的命令，例如 `/plugin` 和 `/resume`，无法从应用程序中工作。[远程控制限制](/docs/zh-CN/remote-control#limitations)列出了从移动设备工作的命令以及它们的行为如何不同。
* **权限模式**：云会话在模式下拉菜单中提供接受编辑、Plan 和 Auto，远程控制会话提供 Manual、接受编辑和 Plan。在任何情况下，您都无法从应用程序中选择 Bypass permissions，也无法为远程控制会话选择 Auto。请参阅[切换权限模式](/docs/zh-CN/permission-modes#switch-permission-modes)。
* **Dispatch 计划**：Dispatch 需要 Pro 或 Max 计划，在 Team 或 Enterprise 上不可用。

<h2 id="related-resources">
  相关资源
</h2>

* [平台和集成](/docs/zh-CN/platforms)：比较 Claude Code 运行的每个表面
* [Claude Code 网页版](/docs/zh-CN/claude-code-on-the-web)：云会话如何运行以及如何在您的终端之间移动工作
* [配置云环境](/docs/zh-CN/cloud-environments)：云会话的网络访问级别、环境变量和设置脚本
* [远程控制](/docs/zh-CN/remote-control)：从任何设备继续本地会话
* [来自 Dispatch 的会话](/docs/zh-CN/desktop#sessions-from-dispatch)：Dispatch 任务如何在桌面应用程序中成为 Code 会话
* [Channels](/docs/zh-CN/channels)：通过 Telegram、Discord 或 iMessage 从您的手机询问 Claude 一些事情，同时工作在您的机器上运行
* [Slack 中的 Claude Code](/docs/zh-CN/slack)：通过提及 `@Claude` 从您的 Slack 工作区委派编码任务
