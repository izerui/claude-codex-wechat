> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 配置服务器管理的设置

> 通过 Claude.ai 上基于网络的界面为您的组织集中配置 Claude Code，无需设备管理基础设施。

服务器管理的设置允许组织所有者通过 claude.ai 控制台中的 [**Admin Settings > Claude Code > Managed settings**](https://claude.ai/admin-settings/claude-code) 集中配置 Claude Code。Claude Code 客户端在用户使用组织 OAuth 登录或直接配置的 API 密钥进行身份验证时自动获取这些设置，在支持服务器管理交付的平台上。请参阅[平台可用性](#platform-availability)。

这种方法专为没有设备管理基础设施的组织或需要为非托管设备上的用户管理设置的组织而设计。

<Note>
  服务器管理的设置可供 [Claude for Teams](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=server_settings_teams#team-&-enterprise) 和 [Claude for Enterprise](https://anthropic.com/contact-sales?utm_source=claude_code\&utm_medium=docs\&utm_content=server_settings_enterprise) 客户使用。
</Note>

<h2 id="requirements">
  要求
</h2>

要使用服务器管理的设置，您需要：

* Claude for Teams 或 Claude for Enterprise 计划
* 您的 Claude 组织中的所有者或主要所有者角色，以查看和编辑配置
* 对 `api.anthropic.com` 的网络访问

<h2 id="choose-between-server-managed-and-endpoint-managed-settings">
  在服务器管理和端点管理的设置之间选择
</h2>

Claude Code 支持两种集中配置方法。服务器管理的设置从 Anthropic 的服务器传递配置。[端点管理的设置](/docs/zh-CN/settings#settings-files)通过本机操作系统策略（macOS 托管首选项、Windows 注册表）或托管设置文件直接部署到设备。

| 方法                                            | 最适合                   | 安全模型                             |
| :-------------------------------------------- | :-------------------- | :------------------------------- |
| **服务器管理的设置**                                  | 没有 MDM 的组织，或非托管设备上的用户 | 在身份验证时从 Anthropic 的服务器传递的设置      |
| **[端点管理的设置](/docs/zh-CN/settings#settings-files)** | 具有 MDM 或端点管理的组织       | 通过 MDM 配置文件、注册表策略或托管设置文件部署到设备的设置 |

如果您的设备已在 MDM 或端点管理解决方案中注册，端点管理的设置提供更强的安全保证，因为设置文件可以在操作系统级别受到保护，防止用户修改。端点管理的设置不会到达[云会话](/docs/zh-CN/model-config#surface-coverage)，因此在网络上使用 Claude Code 的组织也应该配置服务器管理的设置。

<h2 id="configure-server-managed-settings">
  配置服务器管理的设置
</h2>

<Steps>
  <Step title="打开管理控制台">
    在 claude.ai 控制台中，转到 [**Admin Settings > Claude Code > Managed settings**](https://claude.ai/admin-settings/claude-code)。

    如果链接将您重定向到不同的 Admin Settings 页面而不是 Claude Code 页面，您的账户没有所需的角色。Admin 和其他非 Owner 角色无法查看或编辑托管设置，因此请要求您的组织中的 Owner 或 Primary Owner 进行更改。请参阅[访问控制](#access-control)。
  </Step>

  <Step title="定义您的设置">
    将您的配置添加为 JSON。支持 [`settings.json` 中可用的所有设置](/docs/zh-CN/settings#available-settings)，除了限制于操作系统级别策略传递的设置外；有关该简短列表，请参阅[当前限制](#current-limitations)。这包括 [hooks](/docs/zh-CN/hooks)、[环境变量](/docs/zh-CN/env-vars) 和[仅限托管的设置](/docs/zh-CN/permissions#managed-only-settings)，如 `allowManagedPermissionRulesOnly`。

    此示例强制执行权限拒绝列表，防止用户绕过权限，并将权限规则限制为在托管设置中定义的规则：

    ```json theme={null}
    {
      "permissions": {
        "deny": [
          "Bash(curl *)",
          "Read(./.env)",
          "Read(./.env.*)",
          "Read(./secrets/**)"
        ],
        "disableBypassPermissionsMode": "disable"
      },
      "allowManagedPermissionRulesOnly": true
    }
    ```

    Hooks 使用与 `settings.json` 中相同的格式。

    此示例在整个组织中每次文件编辑后运行审计脚本：

    ```json theme={null}
    {
      "hooks": {
        "PostToolUse": [
          {
            "matcher": "Edit|Write",
            "hooks": [
              { "type": "command", "command": "/usr/local/bin/audit-edit.sh" }
            ]
          }
        ]
      }
    }
    ```

    要配置 [auto mode](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode) 分类器，使其了解您的组织信任的存储库、存储桶和域：

    ```json theme={null}
    {
      "autoMode": {
        "environment": [
          "Source control: github.example.com/acme-corp and all repos under it",
          "Trusted cloud buckets: s3://acme-build-artifacts, gs://acme-ml-datasets",
          "Trusted internal domains: *.corp.example.com"
        ]
      }
    }
    ```

    由于 hooks 执行 shell 命令，用户在应用前会看到[安全批准对话框](#security-approval-dialogs)。有关 `autoMode` 条目如何影响分类器阻止的内容以及关于 `environment`、`allow`、`soft_deny` 和 `hard_deny` 字段的重要警告，请参阅[配置 auto mode](/docs/zh-CN/auto-mode-config)。
  </Step>

  <Step title="保存并部署">
    保存您的更改。Claude Code 客户端在下次启动或每小时轮询周期时接收更新的设置。
  </Step>
</Steps>

<h3 id="verify-settings-delivery">
  验证设置传递
</h3>

要确认设置正在被应用，请要求用户重新启动 Claude Code。如果配置包含触发[安全批准对话框](#security-approval-dialogs)的设置，用户会在启动时看到描述托管设置的提示。您还可以通过让用户运行 `/permissions` 来验证托管权限规则是否处于活动状态，以查看其有效的权限规则。

<h3 id="access-control">
  访问控制
</h3>

以下角色可以管理服务器管理的设置：

* **主要所有者**
* **所有者**

限制对受信任人员的访问，因为设置更改适用于组织中的所有用户。

<h3 id="managed-only-settings">
  仅限托管的设置
</h3>

大多数[设置键](/docs/zh-CN/settings#available-settings)可在任何范围内工作。少数几个键仅从托管设置中读取，当放置在用户或项目设置文件中时无效。有关完整列表，请参阅[仅限托管的设置](/docs/zh-CN/permissions#managed-only-settings)。任何不在该列表上的设置仍然可以放置在托管设置中，并具有最高优先级。

<h3 id="current-limitations">
  当前限制
</h3>

服务器管理的设置有以下限制：

* 设置统一应用于组织中的所有用户。尚不支持按组配置。
* [`managed-mcp.json`](/docs/zh-CN/managed-mcp) 文件无法通过服务器管理的设置分发。改为在那里传递 `allowedMcpServers` 和 `deniedMcpServers` 策略键。
* 限制于操作系统级别策略源的设置，如 `policyHelper` 和 `wslInheritsWindowsSettings`，不被遵守。改为通过 MDM 或系统 `managed-settings.json` 文件部署它们。

<h2 id="settings-delivery">
  设置传递
</h2>

<h3 id="settings-precedence">
  设置优先级
</h3>

服务器管理的设置和[端点管理的设置](/docs/zh-CN/settings#settings-files)都占据 Claude Code [设置层次结构](/docs/zh-CN/settings#settings-precedence)中的最高层。没有其他设置级别可以覆盖它们，包括命令行参数。

在托管层内，配置的 [`policyHelper`](/docs/zh-CN/settings#compute-managed-settings-with-a-policy-helper) 优先于所有其他托管源，包括服务器管理的设置：其输出成为该运行的唯一托管配置。

否则，Claude Code 使用首先传递非空配置的源。首先检查服务器管理的设置，然后检查端点管理的设置。源不合并：如果服务器管理的设置传递任何键，其他端点管理的设置将被完全忽略。如果服务器管理的设置不传递任何内容，端点管理的设置将应用。

有一个例外适用：当任何管理员控制的托管源设置一小组[跨源锁定键](/docs/zh-CN/settings#settings-precedence)（例如沙箱允许列表锁）时，这些键会被遵守；用户可写的 HKCU 注册表层被排除。

如果您清除管理控制台中的服务器管理配置，意图回退到端点管理的 plist 或注册表策略，请注意[缓存的设置](#fetch-and-caching-behavior)在客户端机器上持久化，直到下次成功获取。运行 `/status` 查看哪个托管源处于活动状态。

<h3 id="fetch-and-caching-behavior">
  获取和缓存行为
</h3>

Claude Code 在启动时从 Anthropic 的服务器获取设置，并在活动会话期间每小时轮询一次更新。

**首次启动而无缓存的设置：**

* Claude Code 异步获取设置
* 如果获取失败，Claude Code 继续运行而不使用托管设置
* 在设置加载之前有一个简短的窗口，其中限制尚未被强制执行

**后续启动且有缓存的设置：**

* 缓存的设置在启动时立即应用，除了下面描述的传输、路由和身份验证环境变量
* Claude Code 在后台获取新鲜设置
* 缓存的设置通过网络故障持久化。被保留的环境变量保持被保留状态，直到获取成功

从 v2.1.198 开始，Claude Code 在缓存的 `env` 块中保留三类变量，直到服务器确认该会话的有效负载。这可以防止缓存的代理、证书颁发机构、端点或凭证值重定向、拦截或重新身份验证确认有效负载的设置获取。加固仅适用于服务器获取的设置缓存：通过 MDM 或 `managed-settings.json` 部署的[端点管理的设置](/docs/zh-CN/settings#settings-files)不受影响。被保留的类别是：

* 代理和 TLS 配置，例如 `HTTPS_PROXY`、`NODE_EXTRA_CA_CERTS` 和 mTLS 客户端证书变量 `CLAUDE_CODE_CLIENT_CERT` 和 `CLAUDE_CODE_CLIENT_KEY`
* API 路由和提供商选择，包括 `ANTHROPIC_BASE_URL`、提供商选择变量（例如 `CLAUDE_CODE_USE_BEDROCK` 和 `CLAUDE_CODE_USE_VERTEX`）以及提供商端点 URL（例如 `ANTHROPIC_BEDROCK_BASE_URL`）
* 身份验证凭证，例如 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 和 `CLAUDE_CODE_OAUTH_TOKEN`

缓存 `env` 块中的所有其他键（例如遥测和 OpenTelemetry 配置）在启动时应用，如前所述。获取成功后，被保留的变量在会话的其余时间应用。

如果您的组织需要代理来访问 `api.anthropic.com`，请在 shell 环境或[用户设置](/docs/zh-CN/settings#settings-files)中设置它，而不仅仅在托管 `env` 块中。首次启动没有缓存，所以这些源已经是初始获取所必需的。

Claude Code 自动应用设置更新而无需重新启动，除了高级设置（如 OpenTelemetry 配置）需要完全重新启动才能生效。

<h3 id="invalid-entries-in-delivered-settings">
  已传递设置中的无效条目
</h3>

已传递的有效负载使用与其他托管源相同的规则进行容错解析。当有效负载包含未通过架构验证的条目时，Claude Code 会删除该条目、显示验证错误，并应用每个剩余的有效设置。有关字段级行为的详细信息，请参阅[托管设置中的无效条目](/docs/zh-CN/settings#invalid-entries-in-managed-settings)，包括如何处理安全强制字段。需要 Claude Code v2.1.169 或更高版本。

服务器管理的传递添加了这些行为：

* 位于 `~/.claude/remote-settings.json` 的缓存存储已删除无效条目的已保存有效负载。原始无效有效负载永远不会被持久化。
* 当有效负载中没有字段可以被保存时，Claude Code 保留最后接受的缓存设置并记录致命错误。
* [安全批准对话框](#security-approval-dialogs)评估已保存的有效负载，因此被删除的无效条目永远不会被呈现以供批准，也永远不会执行。

要调试传递问题，请运行 `claude --debug-file <path>` 并在日志中搜索 `Remote settings`。在向组织推出有效负载更改之前，使用 `claude doctor` 在测试机器上验证有效负载更改。

<h3 id="enforce-fail-closed-startup">
  强制执行故障关闭启动
</h3>

默认情况下，如果远程设置获取在启动时失败，CLI 继续运行而不使用托管设置。对于这个简短的未强制执行窗口不可接受的环境，在您的托管设置中设置 `forceRemoteSettingsRefresh: true`。

当此设置处于活动状态时，CLI 在启动时阻止，直到远程设置被新鲜获取。如果获取失败，CLI 退出而不是继续运行而不使用策略。此设置自我延续：一旦从服务器传递，它也会在本地缓存，以便后续启动即使在新会话的首次成功获取之前也强制执行相同的行为。

要启用此功能，请将键添加到您的托管设置配置中：

```json theme={null}
{
  "forceRemoteSettingsRefresh": true
}
```

您也可以在[端点管理的](/docs/zh-CN/settings#settings-files) MDM 配置文件或系统 `managed-settings.json` 文件中设置此键，以在首次启动时强制执行故障关闭行为，在任何服务器有效负载被传递之前。从 v2.1.191 开始，此标志是上述[优先级规则](#settings-precedence)的例外：当在任何托管源中设置时，即使也存在缓存的服务器管理有效负载，它也会被遵守，因此当服务器管理的设置存在时，MDM 传递的值不会被忽略。

设置获取还发送 `Cache-Control: no-cache` 标头，以便中间 HTTP 代理不会提供陈旧的响应。

在启用此设置之前，请确保您的网络策略允许连接到 `api.anthropic.com`。如果该端点无法访问，CLI 在启动时退出，用户无法启动 Claude Code。

从 v2.1.139 开始，`claude auth` 子命令（如 `claude auth login`）不受此检查的限制，因此当过期的凭证是设置获取失败的原因时，用户可以重新身份验证。

<h3 id="security-approval-dialogs">
  安全批准对话框
</h3>

某些可能带来安全风险的设置在应用前需要明确的用户批准：

* **Shell 命令设置**：执行 shell 命令的设置
* **自定义环境变量**：不在已知安全允许列表中的变量
* **Hook 配置**：任何 hook 定义
* **托管 CLAUDE.md 内容**：通过托管设置传递的 `claudeMd` 值

当这些设置存在时，用户会看到一个安全对话框，解释正在配置的内容。用户必须批准才能继续。如果用户拒绝设置，Claude Code 会退出。

<Note>
  非交互式运行（例如 `claude -p` 或 Agent SDK 会话）无法显示对话框。当传递的设置需要批准时，Claude Code 仅为该运行应用它们：它不会将它们记录为已批准或写入[本地缓存](#fetch-and-caching-behavior)，下一个交互式会话会显示对话框。在用户在交互式会话中批准之前，每个非交互式运行都会在启动时再次获取设置。在 v2.1.207 之前，非交互式运行会将设置保存为已批准，因此后来的交互式会话永远不会为它们显示对话框。
</Note>

<h2 id="platform-availability">
  平台可用性
</h2>

服务器管理的设置需要直接连接到 `api.anthropic.com`，并且交付需要会话使用组织 OAuth 登录或直接配置的 API 密钥进行身份验证。由 [`apiKeyHelper`](/docs/zh-CN/settings#available-settings) 脚本返回的密钥不会触发设置获取。

在使用第三方模型提供商时，服务器管理的设置不可用：

* Amazon Bedrock
* Google Cloud 的 Agent Platform
* Microsoft Foundry
* [Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws)
* 通过 `ANTHROPIC_BASE_URL` 或第三方 [LLM gateways](/docs/zh-CN/llm-gateway) 的自定义 API 端点

如果您在 shell 中导出 `CLAUDE_CODE_USE_*` 提供商变量或非默认的 `ANTHROPIC_BASE_URL`，Claude Code 将跳过您的会话的设置获取。您无法使用服务器管理的 `env` 块清除导出，因为该块通过导出阻止的获取到达。[端点管理的设置](/docs/zh-CN/settings#settings-files) `env` 块也不会恢复获取：Claude Code 在应用管理的 `env` 块之前检查资格，因此覆盖会改变会话的提供商选择，但获取保持跳过。

要恢复服务器管理的交付，请从 shell 中删除导出，或在用户设置 `env` 块中将变量设置为 `""`，该块在资格检查之前应用。要在不依赖用户更改其 shell 的情况下强制执行策略，请改为通过端点管理的通道交付设置。

对于 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 部署，自托管的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 提供等效的远程管理设置交付：网关登录的客户端从网关而不是 `api.anthropic.com` 获取管理设置。启动时的失败语义不同：无法到达网关的网关客户端以错误退出，而不是回退到缓存的设置，而每小时的后台刷新在两个通道上都是故障开放的。

<h2 id="audit-logging">
  审计日志
</h2>

设置更改的审计日志事件可通过合规 API 或审计日志导出获得。请联系您的 Anthropic 账户团队以获取访问权限。

审计事件包括执行的操作类型、执行操作的账户和设备，以及对先前值和新值的引用。

<h2 id="security-considerations">
  安全考虑
</h2>

服务器管理的设置提供集中的策略强制执行，但它们作为客户端控制运行，而不是安全边界。在非托管设备上，用户不需要管理员或 sudo 访问权限来绕过它们。

| 场景                                     | 行为                                                                                                                                                                                                                                           |
| :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户编辑缓存的设置文件                            | 篡改的文件在启动时应用，但正确的设置在下次服务器获取时恢复。从 v2.1.198 开始，`env` 块中的传输、API 路由和身份验证环境变量在[服务器确认有效负载后被保留](#fetch-and-caching-behavior)                                                                                                                         |
| 用户删除缓存的设置文件                            | 首次启动行为发生：设置异步获取，有一个简短的未强制执行的窗口                                                                                                                                                                                                               |
| 用户运行修改的 Claude Code 二进制文件              | 能够运行修改的客户端的用户可以绕过任何客户端控制                                                                                                                                                                                                                     |
| 用户运行较旧的 Claude Code 版本                 | 早于服务器管理设置的版本不会获取或应用它们                                                                                                                                                                                                                        |
| API 不可用                                | 如果可用，缓存的设置应用，否则托管设置在下次成功获取前不被强制执行。从 v2.1.198 开始，缓存的 `env` 块中的传输、API 路由和身份验证环境变量在[获取失败时被保留](#fetch-and-caching-behavior)；缓存的其余部分仍然适用。使用 `forceRemoteSettingsRefresh: true` 时，CLI 退出而不是继续，除了 [`claude auth` 子命令](#enforce-fail-closed-startup) |
| 用户使用不同的组织进行身份验证                        | 不为托管组织外的账户传递设置                                                                                                                                                                                                                               |
| 用户配置[第三方模型提供商](#platform-availability) | 服务器管理的设置被绕过。这包括设置 `CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_MANTLE`、`CLAUDE_CODE_USE_VERTEX`、`CLAUDE_CODE_USE_FOUNDRY`、`CLAUDE_CODE_USE_ANTHROPIC_AWS` 或非默认的 `ANTHROPIC_BASE_URL`                                                           |
| 网络流量被拦截或重定向                            | 禁用的 TLS 验证或拦截的流量可以改变客户端接收的设置                                                                                                                                                                                                                 |

要检测运行时配置更改，请使用 [`ConfigChange` hooks](/docs/zh-CN/hooks#configchange) 来记录修改或在未授权的更改生效前阻止它们。

要限制用户可以使用客户端提供的凭证访问的组织，请参阅 Claude 帮助中心中的[使用租户限制强制执行网络级访问控制](https://support.claude.com/en/articles/13198485-enforce-network-level-access-control-with-tenant-restrictions)。为了获得更强的强制执行保证，请在已在 MDM 解决方案中注册的设备上使用[端点管理的设置](/docs/zh-CN/settings#settings-files)。

<h2 id="see-also">
  另请参阅
</h2>

用于管理 Claude Code 配置的相关页面：

* [Settings](/docs/zh-CN/settings)：完整的配置参考，包括所有可用的设置
* [Endpoint-managed settings](/docs/zh-CN/settings#settings-files)：由 IT 部门部署到设备的托管设置
* [Authentication](/docs/zh-CN/authentication)：设置用户对 Claude Code 的访问
* [Security](/docs/zh-CN/security)：安全保障和最佳实践
