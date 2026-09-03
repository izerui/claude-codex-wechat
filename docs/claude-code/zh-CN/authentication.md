> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 身份验证

> 登录 Claude Code 并为个人、团队和组织配置身份验证。

Claude Code 支持多种身份验证方法，具体取决于您的设置。个人用户可以使用 Claude.ai 账户登录，而团队可以使用 Claude for Teams 或 Enterprise、Claude Console 或云提供商（如 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry）。

<h2 id="log-in-to-claude-code">
  登录 Claude Code
</h2>

[安装 Claude Code](/docs/zh-CN/setup#install-claude-code) 后，在终端中运行 `claude`。首次启动时，Claude Code 会打开浏览器窗口供您登录。

如果浏览器没有自动打开，请按 `c` 将登录 URL 复制到剪贴板，然后将其粘贴到浏览器中。

如果您的浏览器在您登录后显示登录代码而不是重定向回来，请将其粘贴到终端的 `Paste code here if prompted` 提示符处。这种情况在浏览器无法访问 Claude Code 的本地回调服务器时会发生，这在 WSL2、SSH 会话和容器中很常见。

登录完成后，终端会显示 `Login successful`，并提示您按 `Enter` 继续。

您可以使用以下任何账户类型进行身份验证：

* **Claude Pro 或 Max 订阅**：使用您的 Claude.ai 账户登录。在 [claude.com/pricing](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=authentication_pro_max) 订阅。
* **Claude for Teams 或 Enterprise**：使用您的团队管理员邀请您的 Claude.ai 账户登录。
* **Claude Console**：使用您的 Console 凭证登录。您的管理员必须先 [邀请您](#claude-console-authentication)。
* **云提供商**：如果您的组织使用 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud's Agent Platform](/docs/zh-CN/google-vertex-ai) 或 [Microsoft Foundry](/docs/zh-CN/microsoft-foundry)，请在运行 `claude` 之前设置所需的环境变量，或在登录提示符处选择 **3rd-party platform**，这将为 Bedrock 和 Vertex AI 启动交互式设置向导。不需要浏览器登录。
* **云网关**：如果您的组织运行自托管的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway)，请通过 `/login` 使用企业 SSO 登录。网关颁发的令牌是会话的唯一凭证。

管理员可以使用 [`forceLoginMethod` 和 `forceLoginOrgUUID`](/docs/zh-CN/settings#available-settings) 托管设置来限制交互式登录。当设置其中任何一个时，由 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 或 `apiKeyHelper` 进行身份验证的会话在启动时会被阻止；云提供商会话不受影响。

要登出并重新身份验证，请在 Claude Code 提示符处输入 `/logout`。登出还会重置您的首次启动设置状态，因此下次运行 `claude` 时，它会再次引导您完成登录和设置。

如果您在登录时遇到问题，请参阅 [身份验证故障排除](/docs/zh-CN/troubleshoot-install#login-and-authentication)。

<h2 id="set-up-team-authentication">
  设置团队身份验证
</h2>

对于团队和组织，您可以通过以下方式之一配置 Claude Code 访问：

* [Claude for Teams 或 Enterprise](#claude-for-teams-or-enterprise)，推荐用于大多数团队
* [Claude Console](#claude-console-authentication)
* [Claude apps gateway](/docs/zh-CN/claude-apps-gateway)，一个自托管网关，使用您的 IdP 为开发人员签名，并将推理路由到您配置的云提供商
* [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)
* [Google Cloud's Agent Platform](/docs/zh-CN/google-vertex-ai)
* [Microsoft Foundry](/docs/zh-CN/microsoft-foundry)

<h3 id="claude-for-teams-or-enterprise">
  Claude for Teams 或 Enterprise
</h3>

[Claude for Teams](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=authentication_teams#team-&-enterprise) 和 [Claude for Enterprise](https://anthropic.com/contact-sales?utm_source=claude_code\&utm_medium=docs\&utm_content=authentication_enterprise) 为使用 Claude Code 的组织提供最佳体验。团队成员可以访问 Claude Code 和网络版 Claude，具有集中式计费和团队管理。

* **Claude for Teams**：自助服务计划，具有协作功能、管理工具和计费管理。最适合较小的团队。
* **Claude for Enterprise**：添加 SSO、域名捕获、基于角色的权限、合规性 API 和托管策略设置，用于组织范围的 Claude Code 配置。最适合具有安全和合规性要求的大型组织。

<Steps>
  <Step title="订阅">
    订阅 [Claude for Teams](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=authentication_teams_step#team-&-enterprise) 或联系销售部门了解 [Claude for Enterprise](https://anthropic.com/contact-sales?utm_source=claude_code\&utm_medium=docs\&utm_content=authentication_enterprise_step)。
  </Step>

  <Step title="邀请团队成员">
    从管理员仪表板邀请团队成员。
  </Step>

  <Step title="安装并登录">
    团队成员安装 Claude Code 并使用其 Claude.ai 账户登录。
  </Step>
</Steps>

<h3 id="claude-console-authentication">
  Claude Console 身份验证
</h3>

对于偏好基于 API 的计费的组织，您可以通过 Claude Console 设置访问权限。

<Steps>
  <Step title="创建或使用 Console 账户">
    使用您现有的 Claude Console 账户或创建新账户。
  </Step>

  <Step title="添加用户">
    您可以通过以下任一方法添加用户：

    * 从 Console 内批量邀请用户：Settings -> Members -> Invite
    * [设置 SSO](https://support.claude.com/en/articles/13132885-setting-up-single-sign-on-sso)
  </Step>

  <Step title="分配角色">
    邀请用户时，分配以下角色之一：

    * **Claude Code** 角色：用户只能创建 Claude Code API 密钥
    * **Developer** 角色：用户可以创建任何类型的 API 密钥
  </Step>

  <Step title="用户完成设置">
    每个受邀用户需要：

    * 接受 Console 邀请
    * [检查系统要求](/docs/zh-CN/setup#system-requirements)
    * [安装 Claude Code](/docs/zh-CN/setup#install-claude-code)
    * 使用 Console 账户凭证登录
  </Step>
</Steps>

<h3 id="cloud-provider-authentication">
  云提供商身份验证
</h3>

对于使用 Amazon Bedrock、Google Cloud's Agent Platform 或 Microsoft Foundry 的团队：

<Steps>
  <Step title="遵循提供商设置">
    遵循 [Amazon Bedrock 文档](/docs/zh-CN/amazon-bedrock)、[Google Cloud's Agent Platform 文档](/docs/zh-CN/google-vertex-ai) 或 [Microsoft Foundry 文档](/docs/zh-CN/microsoft-foundry)。
  </Step>

  <Step title="分发配置">
    将环境变量和生成云凭证的说明分发给您的用户。阅读有关如何 [在此处管理配置](/docs/zh-CN/settings) 的更多信息。
  </Step>

  <Step title="安装 Claude Code">
    用户可以 [安装 Claude Code](/docs/zh-CN/setup#install-claude-code)。
  </Step>
</Steps>

<h2 id="credential-management">
  凭证管理
</h2>

Claude Code 安全地管理您的身份验证凭证：

* **存储位置**：
  * 在 macOS 上，凭证存储在加密的 macOS Keychain 中。
  * 在 Linux 上，凭证存储在 `~/.claude/.credentials.json` 中，文件模式为 `0600`。
  * 在 Windows 上，凭证存储在 `%USERPROFILE%\.claude\.credentials.json` 中，并继承您的用户配置文件目录的访问控制，默认情况下将文件限制为您的用户帐户。
  * 如果您在 Linux 或 Windows 上设置了 `CLAUDE_CONFIG_DIR` 环境变量，`.credentials.json` 文件将位于该目录下。
  * Claude Code 通过 `/login` 和 `/logout` 管理 `.credentials.json`。要通过自定义 API 端点路由请求，请改为设置 [`ANTHROPIC_BASE_URL`](/docs/zh-CN/env-vars) 环境变量。
* **支持的身份验证类型**：Claude.ai 凭证、Claude API 凭证、Microsoft Foundry Auth、Bedrock Auth、Vertex Auth 和 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 会话令牌。
* **自定义凭证脚本**：[`apiKeyHelper`](/docs/zh-CN/settings#available-settings) 设置可以配置为运行返回 API 密钥的 shell 脚本。
* **刷新间隔**：默认情况下，`apiKeyHelper` 在 5 分钟后或在 HTTP 401 响应时调用。设置 `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` 环境变量以获得自定义刷新间隔。
* **缓慢助手通知**：如果 `apiKeyHelper` 返回密钥需要超过 10 秒，Claude Code 会在提示栏中显示警告通知，显示经过的时间。如果您经常看到此通知，请检查您的凭证脚本是否可以优化。
* **助手失败**：当脚本以错误退出、超时或不输出任何内容时，请求在三次尝试内失败，并显示 [`Your apiKeyHelper script is failing`](/docs/zh-CN/errors#your-apikeyhelper-script-is-failing)。在 v2.1.208 之前，助手失败显示为通用 401，经过大约十次无声重试。

`apiKeyHelper`、`ANTHROPIC_API_KEY` 和 `ANTHROPIC_AUTH_TOKEN` 适用于 CLI 和包装它的表面，包括 VS Code 扩展、Agent SDK 和 GitHub Actions。Claude Desktop 和云会话不会调用 `apiKeyHelper` 或读取这些环境变量：它们使用 OAuth，除了运行 [第三方推理配置](/docs/zh-CN/llm-gateway-connect#desktop-app) 的桌面会话外，这些会话使用该配置的凭证进行身份验证。

<h3 id="renew-an-expiring-login">
  续期即将过期的登录
</h3>

当您使用 `/login` 创建的登录在过期前五天内时，Claude Code 会在启动时显示警告：`您的登录将在 3 天后过期 · 运行 /login 以续期`。需要 Claude Code v2.1.203 或更高版本。

运行 `/login` 以续期。该警告仅供参考，永远不会阻止请求：身份验证将继续工作，直到登录实际过期。登录生命周期本身不变；提前警告是 v2.1.203 添加的功能。

一旦存储的登录过期且无法刷新，每个请求都会失败，显示 [`Login expired · Please run /login`](/docs/zh-CN/errors#login-expired)，直到您再次登录。在 v2.1.206 之前，过期的登录显示为模型错误。

该警告仅在 claude.ai 或 Claude Console 登录是活跃凭证时出现，而不是在云提供商、`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 或 `apiKeyHelper` 提供凭证时出现。

对于运行无人值守的会话，提前续期最为重要。在 [agent view 中的后台会话](/docs/zh-CN/agent-view) 或 [Remote Control](/docs/zh-CN/remote-control) 会话一旦登录过期，就会停止进行，并且在您再次登录之前无法恢复。

<h3 id="authentication-precedence">
  身份验证优先级
</h3>

当存在多个凭证时，Claude Code 按以下顺序选择一个：

1. 云提供商凭证，当设置了 `CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_VERTEX` 或 `CLAUDE_CODE_USE_FOUNDRY` 时。有关设置，请参阅 [第三方集成](/docs/zh-CN/third-party-integrations)。
2. `ANTHROPIC_AUTH_TOKEN` 环境变量。作为 `Authorization: Bearer` 标头发送。当通过 [LLM 网关或代理](/docs/zh-CN/llm-gateway) 进行路由时使用此选项，该网关或代理使用持有者令牌而不是 Anthropic API 密钥进行身份验证。
3. `ANTHROPIC_API_KEY` 环境变量。作为 `X-Api-Key` 标头发送。用于直接 Anthropic API 访问，使用来自 [Claude Console](https://platform.claude.com) 的密钥。在交互模式下，系统会提示您一次批准或拒绝该密钥，您的选择会被记住。要稍后更改它，请使用 `/config` 中的"使用自定义 API 密钥"切换。该切换仅在 `ANTHROPIC_API_KEY` 在您的环境中设置时出现。在非交互模式（`-p`）下，当密钥存在时始终使用该密钥。
4. [`apiKeyHelper`](/docs/zh-CN/settings#available-settings) 脚本输出。用于动态或轮换凭证，例如从保管库获取的短期令牌。
5. `CLAUDE_CODE_OAUTH_TOKEN` 环境变量。由 [`claude setup-token`](#generate-a-long-lived-token) 生成的长期 OAuth 令牌。用于 CI 管道和脚本，其中浏览器登录不可用。
6. 来自 `/login` 的订阅 OAuth 凭证。这是 Claude Pro、Max、Team 和 Enterprise 用户的默认设置。

一个已签名的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 会话位于此列表之外：它是一个提供商选择，如 Amazon Bedrock 或 Google Cloud 的 Agent Platform，并且它优先于它们。当网关会话存在时，即使设置了 `CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_VERTEX` 或 `CLAUDE_CODE_USE_FOUNDRY`，CLI 也会使用网关令牌进行身份验证，上面的持有者令牌、API 密钥和 `apiKeyHelper` 条目不会被使用。

如果您有活跃的 Claude 订阅，但环境中也设置了 `ANTHROPIC_API_KEY`，则 API 密钥在批准后优先。如果密钥属于已禁用或过期的组织，这可能会导致身份验证失败。运行 `unset ANTHROPIC_API_KEY` 以回退到您的订阅，并检查 `/status` 以确认哪种方法处于活跃状态。`Login method` 行显示您的订阅帐户，当 API 密钥在使用时会出现 `API key` 行。

[Claude Code on the Web](/docs/zh-CN/claude-code-on-the-web) 始终使用您的订阅凭证。如果您在沙箱环境中设置 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN`，它不会覆盖您的订阅凭证。

<h3 id="generate-a-long-lived-token">
  生成长期令牌
</h3>

对于 CI 管道、脚本或其他不可用交互式浏览器登录的环境，使用 `claude setup-token` 生成一年期 OAuth 令牌：

```bash theme={null}
claude setup-token
```

该命令会引导您完成 OAuth 授权并将令牌打印到终端。它不会将令牌保存在任何地方；复制它并将其设置为 `CLAUDE_CODE_OAUTH_TOKEN` 环境变量，无论您想在何处进行身份验证：

```bash theme={null}
export CLAUDE_CODE_OAUTH_TOKEN=your-token
```

此令牌使用您的 Claude 订阅进行身份验证，需要 Pro、Max、Team 或 Enterprise 计划。它的范围仅限于推理，无法建立 [Remote Control](/docs/zh-CN/remote-control) 会话。

[Bare mode](/docs/zh-CN/headless#start-faster-with-bare-mode) 不读取 `CLAUDE_CODE_OAUTH_TOKEN`。如果您的脚本传递 `--bare`，请改用 `ANTHROPIC_API_KEY` 或 `apiKeyHelper` 进行身份验证。
