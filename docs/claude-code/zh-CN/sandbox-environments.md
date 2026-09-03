> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 选择沙箱环境

> 比较 Claude Code 沙箱选项：内置沙箱化 Bash 工具、沙箱运行时、开发容器、Docker 和虚拟机。为您的威胁模型选择合适的隔离方案。

隔离 Claude Code 会限制会话可以读取、写入和访问网络的内容。当您让 Claude 在较少权限提示的情况下工作、以无人值守方式运行它，或将其指向您不完全信任的代码时，这一点最为重要。

Claude Code 可以在多种隔离环境中运行，从轻量级的按命令沙箱到完全独立的虚拟机。本页面比较了它们隔离的内容和所需条件，帮助您为威胁模型选择合适的方案，并展示如何在整个组织中强制实施该选择。

<Info>
  有关更广泛的安全模型，请参阅 [Security](/docs/zh-CN/security)。有关 Agent SDK 部署，请参阅 [Secure deployment](/docs/zh-CN/agent-sdk/secure-deployment)。
</Info>

<h2 id="compare-sandboxing-approaches">
  比较沙箱方法
</h2>

下表中的前两种方法在主机操作系统上运行，不使用容器。其余方法将 Claude Code 放在容器或虚拟机内。

| 方法                                                | 隔离的内容                                   | 需要 Docker | 设置工作量                      |
| :------------------------------------------------ | :-------------------------------------- | :-------- | :------------------------- |
| [Sandboxed Bash tool](#sandboxed-bash-tool)       | Bash 命令及其子进程                            | 否         | macOS 上最少；Linux 和 WSL2 上较少 |
| [Sandbox runtime](#sandbox-runtime)               | 整个 Claude Code 进程，包括文件工具、MCP 服务器和 hooks | 否         | 较少                         |
| [Dev container](#dev-containers)                  | 完整开发环境                                  | 是         | 中等                         |
| [Custom container](#custom-container)             | 完整开发环境                                  | 是         | 中等到高                       |
| [Virtual machine](#virtual-machine)               | 完整操作系统                                  | 否         | 高                          |
| [Claude Code on the web](#claude-code-on-the-web) | 完整操作系统，由 Anthropic 托管                   | 否         | 无；需要 Claude 订阅和 GitHub     |

[Sandboxed Bash tool](/docs/zh-CN/sandboxing) 内置于 Claude Code 中，仅限制 Bash 命令。内置文件工具、MCP 服务器和 hooks 仍直接在您的主机上运行。表中的所有其他方法都将整个 Claude Code 进程放在隔离边界内，因此文件工具、MCP 服务器和 hooks 也受到限制。

<Warning>
  沙箱隔离可以减少违规的影响，但不能消除风险。任何允许网络出站的方法仍然可能泄露代理可以读取的数据，任何以可写方式挂载项目目录的方法仍然可能修改该代码。在依赖沙箱作为硬控制之前，请查看 [security limitations](/docs/zh-CN/sandboxing#security-limitations)。

  隔离也不会改变发送给模型的内容。您的提示和 Claude 读取的文件无论是否使用沙箱，都会传输到 Anthropic API 或您配置的提供商。有关 Claude Code 发送的内容以及如何减少它，请参阅 [Data usage](/docs/zh-CN/data-usage)。
</Warning>

<h2 id="choose-an-approach">
  选择一种方法
</h2>

将您的目标与下面的一行匹配，然后阅读随后的详细部分。

| 您想要                                                      | 开始使用                                                                                          |
| :------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| 在您自己的机器上日常工作期间减少权限提示                                     | [sandboxed Bash tool](/docs/zh-CN/sandboxing)，使用 `/sandbox` 启用                                     |
| 让 Claude 使用 `--dangerously-skip-permissions` 或自动模式无人值守工作 | 预配置的 [dev container](/docs/zh-CN/devcontainer)、任何容器或虚拟机，或 [sandbox runtime](#sandbox-runtime)      |
| 隔离 MCP 服务器和 hooks 以及 Bash，不使用 Docker                     | sandbox runtime                                                                               |
| 在不受信任的存储库上工作                                             | 专用虚拟机，或 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)（如果您有 Claude 订阅和连接的 GitHub 账户） |
| 在团队中标准化沙箱环境                                              | 预配置的 [dev container](/docs/zh-CN/devcontainer)，复制到您的存储库中                                           |
| 从没有本地设置的设备使用 Claude Code                                 | [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)，需要 Claude 订阅和连接的 GitHub 账户            |
| 为组织中的每个开发人员要求隔离                                          | [在整个组织中强制实施隔离](#enforce-isolation-across-an-organization)                                     |
| 在本机 Windows 主机上工作                                        | 容器或虚拟机，或在 WSL2 内运行 Bash 沙箱                                                                    |

<h3 id="how-isolation-relates-to-permission-modes">
  隔离与权限模式的关系
</h3>

[Permission modes](/docs/zh-CN/permission-modes) 决定工具调用是否运行以及是否首先提示您。隔离限制命令运行后可以访问的内容。两者协同工作：当权限模式允许操作在不询问您的情况下运行时，隔离边界限制这些操作可以到达的内容。

当您传递 `--dangerously-skip-permissions` 时，Claude 在不首先询问您的情况下行动；您仅会被提示显式 [ask rules](/docs/zh-CN/permissions#manage-permissions)、连接器工具 [您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)、标记为 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具，以及针对 `/` 或您的主目录的删除。没有提示来捕捉错误，您选择的隔离边界是保护您的系统的东西。始终在容器、虚拟机或 [sandbox runtime](#sandbox-runtime) 内运行 `--dangerously-skip-permissions` 会话，以便文件工具、MCP 服务器和 hooks 也在边界内。

[Auto mode](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode) 用审查操作的分类器替换提示，并阻止超出请求范围、针对无法识别的基础设施或似乎由 Claude 读取的恶意内容驱动的操作。分类器是按操作控制，而不是隔离边界，因此隔离边界仍然为无人值守运行添加纵深防御，并且不像 `--dangerously-skip-permissions` 那样是必需的。

[sandboxed Bash tool](#sandboxed-bash-tool) 本身仅限制 Bash，因此对于任一模式的完全无人值守运行都不足够。您可以分层方法：在容器或虚拟机内运行沙箱化 Bash 工具可在外部环境边界之上为您提供操作系统级命令限制。有关 Bash 沙箱本身如何与权限规则和模式交互的信息，请参阅 [How sandboxing relates to permissions and permission modes](/docs/zh-CN/sandboxing#how-sandboxing-relates-to-permissions-and-permission-modes)。

<h2 id="sandboxed-bash-tool">
  Sandboxed Bash tool
</h2>

<Note>
  此选项不支持本机 Windows。在 Windows 主机上，使用 WSL2 或下面的容器或虚拟机方法之一。
</Note>

Sandboxed Bash tool 内置于 Claude Code 中。它使用操作系统原语来限制 Claude 运行的每个 Bash 命令的文件系统和网络访问：Seatbelt（内置 macOS 沙箱）和 Linux 和 WSL2 上的 [bubblewrap](https://github.com/containers/bubblewrap)。默认情况下，它允许写入工作目录，并在命令首次需要新网络域时提示。

使用 `/sandbox` 命令启用它。[Sandboxing](/docs/zh-CN/sandboxing) 指南涵盖批准模式、默认边界以及如何扩大或缩小它。

按命令沙箱不涵盖会话中运行的所有内容：

* 其他 [built-in tools](/docs/zh-CN/tools-reference)（如 Read、Edit 和 WebFetch）在 Claude Code 进程内运行，不会生成任意代码。[Permission rules](/docs/zh-CN/permissions) 用于路径或域来控制它们。
* [MCP](/docs/zh-CN/mcp) 服务器和 hooks 是在主机上无约束运行的单独进程。

要将内置工具、MCP 服务器和 hooks 都放在一个操作系统边界后面，请在 [sandbox runtime](#sandbox-runtime)、[dev container](#dev-containers) 或 [custom container](#custom-container) 内运行整个 Claude Code 进程。

<h2 id="sandbox-runtime">
  Sandbox runtime
</h2>

[`@anthropic-ai/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime) 包将整个进程包装在内置 Bash 沙箱使用的相同 Seatbelt 或 bubblewrap 隔离中。通过它运行 Claude Code 会限制会话中的每个工具、hook 和 MCP 服务器，而不仅仅是 Bash。运行时是测试版研究预览，其配置格式可能会随着包的发展而改变。

运行时默认拒绝所有写入和网络访问，因此在通过它启动 Claude Code 之前配置它。在 `~/.srt-settings.json` 中，或您使用 `--settings` 传递的文件中，至少允许写入您的项目目录和 Claude Code 的配置路径 `~/.claude` 和 `~/.claude.json`。允许您的会话需要的网络域，包括 `api.anthropic.com` 或您配置的提供商的端点。有关完整的配置架构，请参阅包 [README](https://github.com/anthropic-experimental/sandbox-runtime)。

配置文件就位后，使用 `npx` 启动 Claude Code 并传递 `claude` 作为要包装的命令：

```bash theme={null}
npx @anthropic-ai/sandbox-runtime claude
```

Claude Code 在沙箱内启动，具有您配置的文件系统和网络边界。相同的命令适用于沙箱化独立 MCP 服务器或其他辅助进程。

<h2 id="dev-containers">
  Dev containers
</h2>

Dev container 在 VS Code 或兼容编辑器管理的 Docker 容器内运行 Claude Code，您的项目挂载在其中。您可以在存储库中使用 `.devcontainer/` 目录定义自己的。

Claude Code 存储库发布了一个 [example dev container](/docs/zh-CN/devcontainer)，其中包含默认拒绝 iptables 防火墙作为起点。将其复制到您的存储库中，并调整防火墙允许列表、基础镜像和固定的 Claude Code 版本以适应您的环境。因为防火墙阻止未批准的出站，像这样的配置支持使用 `--dangerously-skip-permissions` 运行 Claude Code 以进行无人值守工作。

<h2 id="custom-container">
  Custom container
</h2>

您可以在任何 Docker 或 OCI 容器镜像中运行 Claude Code，具有您自己的网络策略、挂载卷和 seccomp 配置文件。这是具有现有容器基础设施或 CI 运行器的组织最常见的路径。

几个托管沙箱和远程执行服务可以为您托管容器。与您操作的任何容器相同的检查清单适用：查看挂载的可写内容、容器内可访问的凭据和令牌，以及网络出站策略允许的内容。

您可以在容器内分层内置 Bash 沙箱以进行按命令限制。无特权容器需要 [Sandboxing troubleshooting](/docs/zh-CN/sandboxing#troubleshooting) 中描述的嵌套沙箱设置。

<h2 id="virtual-machine">
  Virtual machine
</h2>

专用虚拟机提供最强的分离，具有自己的内核，在云或 microVM 部署中，还有自己的虚拟化硬件。选项包括云实例、本地虚拟机管理程序和 microVM（如 Firecracker）。

当您评估不受信任的代码、您的安全策略要求代理和主机之间的内核级分离，或没有主机级方法满足您的合规要求时，使用此方法。Docker Desktop 的 [sandboxes feature](https://docs.docker.com/ai/sandboxes/) 提供了一个具有自己的 Docker 守护程序和工作区同步的 microVM，可以在已经拥有 Docker Desktop 的主机上运行 Claude Code。

<h2 id="claude-code-on-the-web">
  Claude Code on the web
</h2>

[Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 在隔离的、由 Anthropic 管理的虚拟机中运行每个会话。网络代理强制执行默认允许列表，单独的代理在沙箱外保存您的 GitHub 令牌，同时在其内部为存储库访问发出作用域凭据。

当您想要完整的虚拟机隔离而无需自己配置基础设施，或当您从没有本地开发环境的设备委派任务时，使用此方法。它需要 Claude 订阅和连接的 GitHub 账户，会话从 GitHub 克隆您的存储库。有关计划可用性和 GitHub 身份验证选项，请参阅 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)。

<h2 id="enforce-isolation-across-an-organization">
  在整个组织中强制实施隔离
</h2>

个别开发人员可以选择上述任何方法。组织可以强制实施什么，以及使用哪些工具，取决于方法：

* **Built-in Bash sandbox**：Claude Code 强制实施的唯一方法。通过 [managed settings](/docs/zh-CN/settings#settings-files) 传递 `sandbox` 设置密钥，可以是由您的 MDM 管理的文件，也可以通过 Claude.ai 上的 [server-managed settings](/docs/zh-CN/server-managed-settings)。有关要部署的密钥以及如何防止开发人员扩大策略，请参阅 [Enforce sandboxing with managed settings](/docs/zh-CN/sandboxing#enforce-sandboxing-with-managed-settings)。
* **Dev containers**：将 [example dev container](/docs/zh-CN/devcontainer) 提交到您的存储库以在团队中标准化环境。这是一个约定而不是强制边界，因为 Claude Code 不需要容器。如果开发人员不应该能够在其外部运行 Claude Code，请使用您组织的设备管理或软件允许列表工具强制实施。
* **Custom containers and VMs**：通过批准的镜像分发 Claude Code，并使用您组织的设备管理或软件允许列表工具防止在其外部安装。

<h2 id="see-also">
  另请参阅
</h2>

这些页面涵盖上述方法的配置和策略详细信息。

* [Sandboxing](/docs/zh-CN/sandboxing)：配置内置沙箱化 Bash 工具
* [Dev container](/docs/zh-CN/devcontainer)：预配置的 Docker 开发容器
* [Security](/docs/zh-CN/security)：完整的 Claude Code 安全模型
* [Secure deployment](/docs/zh-CN/agent-sdk/secure-deployment)：Agent SDK 应用程序的隔离指导
* [Settings](/docs/zh-CN/settings#sandbox-settings)：所有沙箱配置密钥，包括托管设置传递
