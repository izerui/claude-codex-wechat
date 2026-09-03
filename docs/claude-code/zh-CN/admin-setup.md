> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 为您的组织设置 Claude Code

> 针对部署 Claude Code 的管理员的决策地图，涵盖 API 提供商、托管设置、策略执行、使用情况监控和数据处理。

Claude Code 通过托管设置强制执行组织策略，这些设置优先于本地开发人员配置。您可以从 Claude 管理控制台、移动设备管理 (MDM) 系统或磁盘上的文件传递这些设置。这些设置控制 Claude 可以访问的工具、命令、服务器和网络目标。

本页按顺序介绍部署决策。每一行都链接到下面的部分和该区域的参考页面。

<Note>
  SSO、SCIM 预配和座位分配在 Claude 账户级别配置。有关这些步骤，请参阅 [Claude 企业管理员指南](https://claude.com/resources/tutorials/claude-enterprise-administrator-guide) 和 [座位分配](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)。
</Note>

| 决策                                               | 您的选择                     | 参考                                                                                                                                                                                     |
| :----------------------------------------------- | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [选择您的 API 提供商](#choose-your-api-provider)        | Claude Code 的身份验证位置和计费方式 | [Authentication](/docs/zh-CN/authentication)、[Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud's Agent Platform](/docs/zh-CN/google-vertex-ai)、[Microsoft Foundry](/docs/zh-CN/microsoft-foundry) |
| [决定设置如何到达设备](#decide-how-settings-reach-devices) | 托管策略如何到达开发人员机器           | [Server-managed settings](/docs/zh-CN/server-managed-settings)、[Settings files](/docs/zh-CN/settings#settings-files)                                                                             |
| [决定要强制执行的内容](#decide-what-to-enforce)            | 允许哪些工具、命令和集成             | [Permissions](/docs/zh-CN/permissions)、[Sandboxing](/docs/zh-CN/sandboxing)                                                                                                                      |
| [设置使用情况可见性](#set-up-usage-visibility)            | 如何跟踪支出和采用情况              | [Analytics](/docs/zh-CN/analytics)、[Monitoring](/docs/zh-CN/monitoring-usage)、[Costs](/docs/zh-CN/costs)                                                                                              |
| [审查数据处理](#review-data-handling)                  | 数据保留和合规性态势               | [Data usage](/docs/zh-CN/data-usage)、[Security](/docs/zh-CN/security)                                                                                                                            |

<h2 id="choose-your-api-provider">
  选择您的 API 提供商
</h2>

Claude Code 通过多个 API 提供商之一连接到 Claude。您的选择会影响计费、身份验证、您继承的合规性态势，以及您的开发人员可以使用的 Claude Code 功能。

| 提供商                           | 何时选择                                                   |
| :---------------------------- | :----------------------------------------------------- |
| Claude for Teams / Enterprise | 您希望 Claude Code 和 claude.ai 在一个按座位订阅下，无需运行基础设施。这是默认建议。 |
| Claude Console                | 您是 API 优先或希望按使用量付费                                     |
| Amazon Bedrock                | 您希望继承现有的 AWS 合规控制和计费                                   |
| Google Cloud's Agent Platform | 您希望继承现有的 GCP 合规控制和计费                                   |
| Microsoft Foundry             | 您希望继承现有的 Azure 合规控制和计费                                 |

某些 Claude Code 功能需要 claude.ai 账户。[Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)、[Routines](/docs/zh-CN/routines)、[Code Review](/docs/zh-CN/code-review)、[Remote Control](/docs/zh-CN/remote-control) 和 [Chrome extension](/docs/zh-CN/chrome) 不能仅通过 Console API 密钥或云提供商凭证使用。如果您通过 Amazon Bedrock、Google Cloud's Agent Platform 或 Microsoft Foundry 部署，请计划开发人员是否还需要 Claude for Teams 或 Enterprise 座位。每个功能页面都列出了其计划要求。

有关涵盖身份验证、区域和功能奇偶性的完整提供商比较，请参阅 [enterprise deployment overview](/docs/zh-CN/third-party-integrations)。每个提供商的身份验证设置在 [Authentication](/docs/zh-CN/authentication) 中。

[Network configuration](/docs/zh-CN/network-config) 中的代理和防火墙要求适用于所有提供商。如果您想要在多个提供商前面有单个端点或集中式请求日志记录，请参阅 [LLM gateway](/docs/zh-CN/llm-gateway)。

<h2 id="decide-how-settings-reach-devices">
  决定设置如何到达设备
</h2>

托管设置定义优先于本地开发人员配置的策略。Claude Code 按优先级顺序检查以下四个来源，并应用返回非空配置的第一个，但有一个例外：当任何管理员控制的来源设置了一小组[跨源锁定键](/docs/zh-CN/settings#settings-precedence)（例如沙箱允许列表锁定）时，这些键会被遵守。

| 机制                      | 传递                                                                                                                                                                                                  | 优先级 | 平台            |
| :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-- | :------------ |
| Server-managed          | claude.ai 管理控制台，或用于网关登录的自托管 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway)                                                                                                                       | 最高  | 全部            |
| plist / registry policy | macOS: `com.anthropic.claudecode` plist<br />Windows: `HKLM\SOFTWARE\Policies\ClaudeCode`                                                                                                           | 高   | macOS、Windows |
| File-based managed      | macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`<br />Linux 和 WSL: `/etc/claude-code/managed-settings.json`<br />Windows: `C:\Program Files\ClaudeCode\managed-settings.json` | 中   | 全部            |
| Windows user registry   | `HKCU\SOFTWARE\Policies\ClaudeCode`                                                                                                                                                                 | 最低  | 仅 Windows     |

已配置的 [`policyHelper`](/docs/zh-CN/settings#compute-managed-settings-with-a-policy-helper) 会抢占所有四个来源：其输出成为该运行的唯一托管配置。请参阅[设置优先级](/docs/zh-CN/settings#settings-precedence)。

Server-managed 设置在身份验证时到达设备，并在活跃会话期间每小时刷新一次，无需端点基础设施。通过 claude.ai 管理控制台传递需要 Claude for Teams 或 Enterprise 计划。在 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上的部署可以通过运行 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 获得相同的远程传递，或改用基于文件或操作系统级别的机制之一。

如果您的组织混合使用提供商，请为 claude.ai 用户配置 [server-managed settings](/docs/zh-CN/server-managed-settings) 加上 [file-based 或 plist/registry 回退](/docs/zh-CN/settings#settings-files)，以便其他用户仍然接收托管策略。

plist 和 HKLM 注册表位置适用于任何提供商，并且由于需要管理员权限才能写入，因此可以抵抗篡改。Windows 用户注册表中的 HKCU 可以在没有提升权限的情况下写入，因此将其视为便利默认值而不是执行通道。

默认情况下，WSL 仅读取 `/etc/claude-code` 处的 Linux 文件路径。要将您的 Windows 注册表和 `C:\Program Files\ClaudeCode` 策略扩展到同一台机器上的 WSL，请在这些仅限管理员的 Windows 来源之一中设置 [`wslInheritsWindowsSettings: true`](/docs/zh-CN/settings#available-settings)。

无论您选择哪种机制，托管值都优先于用户和项目设置。数组设置（如 `permissions.allow` 和 `permissions.deny`）合并来自所有源的条目，因此开发人员可以扩展托管列表但不能从中删除。对于[两个例外](/docs/zh-CN/settings#settings-precedence)，`fallbackModel` 和 `availableModels`，托管值替换较低层而不是合并。

请参阅 [Server-managed settings](/docs/zh-CN/server-managed-settings) 和 [Settings files and precedence](/docs/zh-CN/settings#settings-files)。

<h3 id="wsl-sessions-in-claude-code-desktop">
  WSL 会话在 Claude Code Desktop 中
</h3>

在 Windows 上，[Claude Code Desktop 可以在 WSL 2 发行版内运行 Code 会话](/docs/zh-CN/desktop-wsl)。会话的 Claude Code 进程在发行版内运行，因此它通过上述 WSL 发现路径解析托管设置：除非部署了 `wslInheritsWindowsSettings: true`，否则仅限 Windows 的来源无法到达它。

在存在托管设置的设备上，Desktop WSL 会话默认不可用。如果您的组织想要启用它们，请联系您的 Anthropic 账户团队。启用后：

* 通过 HKLM 注册表或 `C:\Program Files\ClaudeCode` 文件部署 `wslInheritsWindowsSettings: true`，以便 WSL 会话继承与主机会话相同的策略。
* 通过在 WSL 会话内运行 `/status` 进行验证：`Setting sources` 行应显示 `Enterprise managed settings` 以及您部署的 Windows 来源，`(HKLM)` 或 `(file)`。

WSL 2 实用程序 VM 内的进程对 Windows 端端点检测传感器不可见。如果您使用 CrowdStrike Falcon，请在 WSL 2 上启用 Falcon Linux 传感器，并使用 CrowdStrike 的 WSL 文档所需的两个排除项，用于 WSL 虚拟机进程和 VM 磁盘映像，以便可以观察到发行版内的进程和文件活动。Claude Code 的 [OpenTelemetry 工具执行遥测](/docs/zh-CN/monitoring-usage) 对 WSL 和本机会话的发出方式相同。

<h2 id="decide-what-to-enforce">
  决定要强制执行的内容
</h2>

托管设置可以锁定工具、沙箱执行、限制 MCP 服务器和插件源，以及控制哪些 hooks 运行。每一行都是一个控制表面，具有驱动它的设置键。

| 控制                                                                                        | 它的作用                                                                                                                                                           | 关键设置                                                                                                  |
| :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| [Permission rules](/docs/zh-CN/permissions)                                                    | 允许、询问或拒绝特定工具和命令                                                                                                                                                | `permissions.allow`、`permissions.deny`                                                                |
| [Permission lockdown](/docs/zh-CN/permissions#managed-only-settings)                           | 仅托管权限规则适用；禁用 `--dangerously-skip-permissions`                                                                                                                  | `allowManagedPermissionRulesOnly`、`permissions.disableBypassPermissionsMode`                          |
| [Sandboxing](/docs/zh-CN/sandboxing)                                                           | 具有域允许列表的操作系统级文件系统和网络隔离                                                                                                                                         | `sandbox.enabled`、`sandbox.network.allowedDomains`                                                    |
| [Managed policy CLAUDE.md](/docs/zh-CN/memory#deploy-organization-wide-claude-md)              | 在每个会话中加载的组织范围指令，无法排除                                                                                                                                           | 托管策略路径处的文件                                                                                            |
| [MCP server control](/docs/zh-CN/managed-mcp)                                                  | 限制用户可以添加或连接的 MCP 服务器，或部署固定集合                                                                                                                                   | `allowedMcpServers`、`deniedMcpServers`、`allowManagedMcpServersOnly` 或已部署的 `managed-mcp.json` 文件       |
| [Plugin marketplace control](/docs/zh-CN/plugin-marketplaces#managed-marketplace-restrictions) | 限制用户可以添加和安装的市场来源，拒绝为单次运行侧加载插件、agents 和 MCP 服务器的 CLI 标志，并允许列出哪些市场的插件可以被建议                                                                                       | `strictKnownMarketplaces`、`blockedMarketplaces`、`disableSideloadFlags`、`pluginSuggestionMarketplaces` |
| [Customization lockdown](/docs/zh-CN/settings#strictpluginonlycustomization)                   | 阻止 skills、agents、hooks 和 MCP 服务器来自用户和项目源，使它们只能来自插件或托管设置                                                                                                        | `strictPluginOnlyCustomization`                                                                       |
| [Hook restrictions](/docs/zh-CN/settings#hook-configuration)                                   | 仅托管 hooks 加载；限制 HTTP hook URL                                                                                                                                  | `allowManagedHooksOnly`、`allowedHttpHookUrls`                                                         |
| [Login enforcement](/docs/zh-CN/settings#available-settings)                                   | 限制交互式登录到特定方法或 Anthropic 组织。设置后，由 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 或 `apiKeyHelper` 进行身份验证的会话在启动时被阻止；云提供商会话不受影响                                       | `forceLoginMethod`、`forceLoginOrgUUID`                                                                |
| [Disable agent view](/docs/zh-CN/agent-view#how-background-sessions-are-hosted)                | 关闭 `claude agents`、`--bg`、`/background` 和按需监督程序                                                                                                                | `disableAgentView`                                                                                    |
| [Model restrictions](/docs/zh-CN/model-config#restrict-model-selection)                        | `availableModels` 筛选模型选择器中显示的模型。添加 `enforceAvailableModels` 也会限制自动选择的默认模型。请参阅 [surface coverage](/docs/zh-CN/model-config#surface-coverage) 了解此设置如何到达 CLI、web 和 IDE | `availableModels`、`enforceAvailableModels`                                                            |
| [Version floor](/docs/zh-CN/settings)                                                          | 防止自动更新安装低于组织范围最小值的版本                                                                                                                                           | `minimumVersion`                                                                                      |
| [Required version range](/docs/zh-CN/settings)                                                 | 当运行版本超出组织批准的范围时拒绝启动。比 `minimumVersion` 更强大，后者仅阻止降级                                                                                                             | `requiredMinimumVersion`、`requiredMaximumVersion`                                                     |

通过 claude.ai 或 Anthropic API 进行身份验证的组织成员也可以在不部署设置的情况下管理模型：[organization model restrictions](/docs/zh-CN/model-config#organization-model-restrictions) 禁用单个模型，[organization default model](/docs/zh-CN/model-config#organization-default-model) 设置新会话启动时使用的模型，[organization effort limits](/docs/zh-CN/model-config#organization-effort-limits) 限制每个角色的工作量级别。这三个控制都需要 Claude Enterprise 计划。模型限制和工作量限制在服务器端强制执行；默认模型是一个起点，用户可以更改，除非组织强制执行。强制执行仅适用于有限的组织集合；请咨询您的 Anthropic 账户团队了解可用性。这些控制都不会到达 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 或 [Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws) 上的会话；在这些提供商上，使用上面的 `availableModels` 进行限制，并在托管设置中使用 `model` 键作为默认值。

[Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 有其自己的管理表面：在管理设置中的 Cloud environments 页面上，所有者和管理员创建 [organization-shared environments](/docs/zh-CN/claude-code-on-the-web#organization-shared-environments)，设置成员云会话的 [network access level](/docs/zh-CN/claude-code-on-the-web#network-access)、环境变量和设置脚本，并选择组织的默认环境。

权限规则和沙箱覆盖不同的层。拒绝 WebFetch 会阻止 Claude 的 fetch 工具，但如果允许 Bash，`curl` 和 `wget` 仍然可以到达任何 URL。沙箱通过在操作系统级别强制执行的网络域允许列表来弥补这一差距。

有关这些控制防御的威胁模型，请参阅 [Security](/docs/zh-CN/security)。

<h2 id="set-up-usage-visibility">
  设置使用情况可见性
</h2>

根据您需要报告的内容选择监控。仪表板、API 和支出控制在 Claude for Teams 或 Enterprise 计划与 Claude Console 组织之间有所不同，因此在围绕某项功能规划报告之前，请检查"可用性"列。

| 功能                     | 您获得的内容                                                   | 可用性                                                                                                                                                                                                                     | 从何处开始                                                    |
| :--------------------- | :------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| Usage monitoring       | 会话、工具和令牌的 OpenTelemetry 导出                               | 所有提供商                                                                                                                                                                                                                   | [Monitoring usage](/docs/zh-CN/monitoring-usage)              |
| Analytics dashboard    | Teams / Enterprise 上具有排行榜的采用和贡献指标；Console 上的每用户使用情况和支出指标 | Teams / Enterprise 在 [claude.ai/analytics](https://claude.ai/analytics/claude-code)，Console 在 [platform.claude.com/claude-code](https://platform.claude.com/claude-code)                                                | [Analytics](/docs/zh-CN/analytics)                            |
| Programmatic reporting | 通过 API 的每用户使用情况和成本数据                                     | Enterprise 的 [Enterprise Analytics API](https://platform.claude.com/docs/en/api/admin/analytics)，Console 的 [Claude Code Analytics API](https://platform.claude.com/docs/en/build-with-claude/claude-code-analytics-api) | [Costs](/docs/zh-CN/costs#manage-costs-for-your-organization) |
| Spend controls         | 支出限制和速率限制                                                | Teams / Enterprise 的管理员设置，Console 的工作区限制；在第三方云上，云预算控制或具有每用户[支出限制](/docs/zh-CN/claude-apps-gateway-spend-limits)的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway)                                                           | [Costs](/docs/zh-CN/costs#manage-costs-for-your-organization) |

在 Teams 和 Enterprise 上，每用户使用情况和支出数字来自您组织的分析设置中的[支出报告](https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans)，而不是分析仪表板。云提供商通过 AWS Cost Explorer、GCP Billing 或 Azure Cost Management 公开支出。有关跨 Claude chat、Claude Code 和 Cowork 规划企业预算的信息，请参阅 [Claude Enterprise consumption guide](https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide)。

<h2 id="review-data-handling">
  审查数据处理
</h2>

在 Team、Enterprise、Claude API 和云提供商计划上，Anthropic 不会在您的代码或提示上训练模型。您的 API 提供商决定保留和合规性态势。

| 主题                        | 需要了解的内容                                  | 从何处开始                                             |
| :------------------------ | :--------------------------------------- | :------------------------------------------------ |
| Data usage policy         | Anthropic 收集的内容、保留多长时间、永远不会用于训练的内容       | [Data usage](/docs/zh-CN/data-usage)                   |
| Zero Data Retention (ZDR) | 请求完成后不存储任何内容。在 Claude for Enterprise 上可用 | [Zero data retention](/docs/zh-CN/zero-data-retention) |
| Security architecture     | 网络模型、加密、身份验证、审计跟踪                        | [Security](/docs/zh-CN/security)                       |

如果您需要请求级别的审计日志或按数据敏感性路由流量，请在开发人员和您的提供商之间放置网关：自托管的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 记录带有 IdP 身份的每个请求审计日志，或使用另一个 [LLM gateway](/docs/zh-CN/llm-gateway)。有关监管要求和认证，请参阅 [Legal and compliance](/docs/zh-CN/legal-and-compliance)。

<h2 id="verify-and-onboard">
  验证和入职
</h2>

配置托管设置后，让开发人员在 Claude Code 中运行 `/status`。在 **Status** 选项卡上，`Setting sources` 行显示 `Enterprise managed settings` 后跟括号中的源，为 `(remote)`、`(plist)`、`(HKLM)`、`(HKCU)` 或 `(file)` 之一。请参阅 [验证活跃设置](/docs/zh-CN/settings#verify-active-settings)。

分享这些资源以帮助开发人员入门：

* [快速入门](/docs/zh-CN/quickstart)：从安装到使用项目的首次会话演练
* [常见工作流](/docs/zh-CN/common-workflows)：代码审查、重构和调试等日常任务的模式
* [Claude 101](https://anthropic.skilljar.com/claude-101) 和 [Claude Code in Action](https://anthropic.skilljar.com/claude-code-in-action)：自定进度的 Anthropic Academy 课程

对于登录问题，请将开发人员指向 [身份验证故障排除](/docs/zh-CN/troubleshoot-install#login-and-authentication)。最常见的修复是：

* 运行 `/logout` 然后 `/login` 以切换账户
* 如果缺少企业身份验证选项，运行 `claude update`
* 更新后重启终端

如果开发人员看到"您还没有被添加到您的组织"，他们的座位不包括 Claude Code 访问权限，需要在管理控制台中更新。

<h2 id="next-steps">
  后续步骤
</h2>

选择提供商和传递机制后，继续进行详细配置：

* [Server-managed settings](/docs/zh-CN/server-managed-settings)：从 Claude 管理控制台传递托管策略
* [Settings reference](/docs/zh-CN/settings)：每个设置键、文件位置和优先级规则
* [Monorepos and large repos](/docs/zh-CN/large-codebases)：为部署到 monorepo 的组织提供的按目录配置模式
* [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud's Agent Platform](/docs/zh-CN/google-vertex-ai)、[Microsoft Foundry](/docs/zh-CN/microsoft-foundry)：提供商特定部署
* [Claude Enterprise Administrator Guide](https://claude.com/resources/tutorials/claude-enterprise-administrator-guide)：SSO、SCIM、座位管理和推出手册
