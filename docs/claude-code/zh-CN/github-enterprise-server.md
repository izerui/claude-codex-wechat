> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Claude Code 与 GitHub Enterprise Server

> 将 Claude Code 连接到自托管的 GitHub Enterprise Server 实例，用于网络会话、代码审查和插件市场。

<Note>
  GitHub Enterprise Server 支持适用于 Team 和 Enterprise 计划。
</Note>

GitHub Enterprise Server (GHES) 支持让您的组织使用 Claude Code 处理托管在自管理 GitHub 实例上的存储库，而不是 github.com。一旦所有者连接您的 GHES 实例，开发人员可以运行网络会话和获得自动化代码审查，无需任何按存储库的配置。您实例上托管的插件市场也受支持；凭证要求因表面而异，如 [GHES 上的插件市场](#plugin-marketplaces-on-ghes) 中所述。

对于 github.com 上的存储库，请参阅 [网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web) 和 [代码审查](/docs/zh-CN/code-review)。要在您自己的 CI 基础设施中运行 Claude，请参阅 [GitHub Actions](/docs/zh-CN/github-actions)。

<h2 id="what-works-with-github-enterprise-server">
  GitHub Enterprise Server 支持的功能
</h2>

下表显示了哪些 Claude Code 功能支持 GHES 以及与 github.com 行为的任何差异。

| 功能                | GHES 支持 | 备注                                                                                      |
| :---------------- | :------ | :-------------------------------------------------------------------------------------- |
| 网络上的 Claude Code  | ✅ 支持    | 所有者连接 GHES 实例一次；开发人员像往常一样使用 `claude --cloud` 或 [claude.ai/code](https://claude.ai/code) |
| 代码审查              | ✅ 支持    | 与 github.com 相同的自动化 PR 审查                                                               |
| Claude Security   | ✅ 支持    | 在 [claude.ai/security](https://claude.ai/security) 为 Enterprise 计划提供公开测试版               |
| Teleport 会话       | ✅ 支持    | 使用 `--teleport` 在网络和终端之间移动会话                                                            |
| 插件市场              | ✅ 支持    | 凭证要求因表面而异。请参阅 [GHES 上的插件市场](#plugin-marketplaces-on-ghes)                               |
| 贡献指标              | ✅ 支持    | 通过 webhook 传递到 [分析仪表板](/docs/zh-CN/analytics)                                                |
| GitHub Actions    | ✅ 支持    | 需要手动工作流设置；`/install-github-app` 仅适用于 github.com                                         |
| GitHub MCP server | ❌ 不支持   | GitHub MCP server 不适用于 GHES 实例                                                          |

<h2 id="admin-setup">
  管理员设置
</h2>

一个所有者将您的 GHES 实例连接到 Claude Code 一次。之后，您组织中的开发人员可以使用 GHES 存储库，无需任何额外配置。您需要在 Claude 组织中具有所有者或主要所有者角色，以及在 GHES 实例上创建 GitHub App 的权限。

引导式设置生成 GitHub App 清单，并将您重定向到 GHES 实例以一键创建应用。如果您的环境阻止重定向流，可以使用 [替代手动设置](#manual-setup)。

<Steps>
  <Step title="打开 Claude Code 管理员设置">
    转到 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code) 并找到 GitHub Enterprise Server 部分。
  </Step>

  <Step title="启动引导式设置">
    点击 **连接**。输入连接的显示名称和您的 GHES 主机名，例如 `github.example.com`。如果您的 GHES 实例使用自签名或私有证书颁发机构，请在可选字段中粘贴 CA 证书。
  </Step>

  <Step title="创建 GitHub App">
    点击 **继续到 GitHub Enterprise**。您的浏览器重定向到您的 GHES 实例，并显示预填充的应用清单。审查配置并点击 **创建 GitHub App**。GHES 将您重定向回 Claude，应用凭证自动存储。
  </Step>

  <Step title="在您的存储库上安装应用">
    从您的 GHES 实例上的 GitHub App 页面，在您希望 Claude 访问的存储库或组织上安装应用。您可以从一个子集开始，稍后添加更多。
  </Step>

  <Step title="启用功能">
    返回 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code) 并为您的 GHES 存储库启用 [代码审查](/docs/zh-CN/code-review#set-up-code-review)、Claude Security 和 [贡献指标](/docs/zh-CN/analytics#enable-contribution-metrics)，使用与 github.com 相同的配置。
  </Step>
</Steps>

<h3 id="github-app-permissions">
  GitHub App 权限
</h3>

清单使用 Claude 在网络会话、代码审查、Claude Security 和贡献指标中需要的权限和 webhook 事件配置 GitHub App：

| 权限               | 访问 | 用途              |
| :--------------- | :- | :-------------- |
| Contents         | 读写 | 克隆存储库和推送分支      |
| Pull requests    | 读写 | 创建 PR 和发布审查评论   |
| Issues           | 读写 | 响应问题提及          |
| Checks           | 读写 | 发布代码审查检查运行      |
| Actions          | 读  | 读取 CI 状态以进行自动修复 |
| Repository hooks | 读写 | 接收贡献指标的 webhook |
| Metadata         | 读  | GitHub 对所有应用的要求 |

应用订阅 `pull_request`、`issue_comment`、`pull_request_review_comment`、`pull_request_review` 和 `check_run` 事件。

<h3 id="manual-setup">
  手动设置
</h3>

如果引导式重定向流被您的网络配置阻止，请点击 **手动添加** 而不是连接。在您的 GHES 实例上创建 GitHub App，具有 [上述权限和事件](#github-app-permissions)，然后在表单中输入应用凭证：主机名、OAuth 客户端 ID 和密钥、GitHub App ID、客户端 ID、客户端密钥、webhook 密钥和私钥。

<h3 id="network-requirements">
  网络要求
</h3>

您的 GHES 实例必须可从 Anthropic 基础设施访问，以便 Claude 可以克隆存储库和发布审查评论。如果您的 GHES 实例在防火墙后面，请将 [Anthropic API IP 地址](https://platform.claude.com/docs/en/api/ip-addresses) 加入白名单。

<h2 id="developer-workflow">
  开发人员工作流
</h2>

一旦您的管理员连接了 GHES 实例，就不需要开发人员端的配置。Claude Code 从您工作目录中的 git 远程自动检测您的 GHES 主机名。

像往常一样从您的 GHES 实例克隆存储库：

```bash theme={null}
git clone git@github.example.com:platform/api-service.git
cd api-service
```

然后启动网络会话。Claude 从您的 git 远程检测 GHES 主机，并通过您组织的配置实例路由会话：

```bash theme={null}
claude --cloud "Add retry logic to the payment webhook handler"
```

会话在 Anthropic 基础设施上运行，从 GHES 克隆您的存储库，并将更改推送回分支。使用 `/tasks` 或在 [claude.ai/code](https://claude.ai/code) 监控进度。有关完整的远程会话工作流（包括差异审查、自动修复和例程），请参阅 [网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)。

<h3 id="teleport-sessions-to-your-terminal">
  将会话 Teleport 到您的终端
</h3>

使用 `claude --teleport` 将网络会话拉入您的本地终端。Teleport 在获取分支和加载会话历史之前验证您在同一 GHES 存储库的检出中。有关详细信息，请参阅 [teleport 要求](/docs/zh-CN/claude-code-on-the-web#teleport-requirements)。

<h2 id="plugin-marketplaces-on-ghes">
  GHES 上的插件市场
</h2>

在您的 GHES 实例上托管插件市场，以在您的组织中分发内部工具。市场结构与 github.com 托管的市场相同，但安装方式因您添加市场的位置而异，并且凭证在不同的界面上有所不同：

| 界面                             | 安装方式                                                                                 | 每个用户需要什么                                                                          |
| :----------------------------- | :----------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| Claude Code CLI 和桌面应用          | Claude Code 使用机器现有的 git 凭证克隆市场存储库                                                    | 从其机器对您的 GHES 主机的 Git 访问权限                                                         |
| 托管设置（`extraKnownMarketplaces`） | Claude Code 注册条目并使用机器现有的 git 凭证克隆存储库                                                 | 从其机器对您的 GHES 主机的 Git 访问权限                                                         |
| claude.ai 组织插件设置               | 所有者选择 GHES 实例作为源；Anthropic 的后端使用来自 [admin setup](#admin-setup) 的 GitHub App 获取并同步存储库 | 添加后每个用户无需任何操作。添加它的所有者需要连接自己的 GitHub Enterprise 账户作为访问检查，并且 GitHub App 必须安装在市场存储库上 |
| claude.ai 用户设置                 | Anthropic 的后端使用提交用户的 GitHub Enterprise 连接获取存储库                                       | 连接到 Claude 的自己的 GitHub Enterprise 账户                                              |
| Claude Code 网页版                | 云会话在会话沙箱内克隆市场。沙箱只有在会话的存储库位于同一实例上时才能访问您的 GHES 实例，其 git 凭证的范围限于会话的存储库                  | 对于 GHES 托管的市场不可靠：与会话存储库不同的主机无法访问，即使是同一实例的安装也可能失败。改用 CLI、托管设置或 claude.ai           |

<Warning>
  当从用户设置添加市场时，claude.ai 上的 GitHub Enterprise 连接是按用户的。[admin setup](#admin-setup) 将您的 GHES 实例连接到您的组织，但它不连接单个用户账户：每个从自己的设置添加 GHES 市场的用户必须首先连接自己的 GitHub Enterprise 账户，一个用户的连接（包括所有者的）不会覆盖任何其他人。由所有者在组织插件设置中添加的市场不会对用户施加此要求，因为持续的获取使用组织的 GitHub App。添加市场的所有者仍然需要在添加时连接自己的 GitHub Enterprise 账户。
</Warning>

<h3 id="add-a-ghes-marketplace">
  添加 GHES 市场
</h3>

`owner/repo` 简写始终解析为 github.com。对于 GHES 托管的市场，使用完整的 git URL。建议使用 HTTPS URL：

```bash theme={null}
/plugin marketplace add https://github.example.com/platform/claude-plugins.git
```

如果机器已经信任您的 GHES 主机，SSH URL 也可以工作：

```bash theme={null}
/plugin marketplace add git@github.example.com:platform/claude-plugins.git
```

Claude Code 以非交互方式运行 git，并拒绝连接到不在机器 `known_hosts` 文件中的主机的 SSH 连接。带有 git 凭证助手的 HTTPS URL 避免了 `known_hosts` 要求。

有关构建市场的完整指南，请参阅 [创建和分发插件市场](/docs/zh-CN/plugin-marketplaces)。

<h3 id="pre-register-ghes-marketplaces-with-managed-settings">
  使用托管设置预注册 GHES 市场
</h3>

`extraKnownMarketplaces` 设置预注册市场，以便开发人员无需手动设置即可获得它。它可以从 [任何设置文件](/docs/zh-CN/settings#extraknownmarketplaces) 工作，包括存储库的 `.claude/settings.json`；托管设置在整个组织范围内提供它：

```json theme={null}
{
  "extraKnownMarketplaces": {
    "internal-tools": {
      "source": {
        "source": "git",
        "url": "https://github.example.com/platform/claude-plugins.git"
      }
    }
  }
}
```

Claude Code 在本地安装这些市场：它注册每个条目并使用机器现有的 git 凭证克隆存储库。此路径不经过 claude.ai，因此不需要按用户的 GitHub Enterprise 连接。为了成功推出：

* **使用完整的 git URL。** `owner/repo` 简写始终解析为 github.com，无法引用 GHES 主机。
* **优先使用 HTTPS URL。** SSH 克隆在不信任您的 GHES 主机密钥的机器上失败。带有您组织标准 git 凭证助手的 HTTPS URL 在任何配置了凭证的机器上都可以工作。
* **确认每台机器都可以从您的 GHES 主机克隆。** 如果机器缺少凭证，市场会被注册但永远不会安装，其插件报告为未找到而不是提示输入凭证。
* **确认设置到达每台机器。** 托管设置文件仅在部署到的机器上生效，例如通过您的设备管理系统。有关文件位置，请参阅 [托管设置](/docs/zh-CN/settings#settings-files)。

<h3 id="allowlist-ghes-marketplaces-in-managed-settings">
  在托管设置中将 GHES 市场加入白名单
</h3>

如果您的组织使用 [托管设置](/docs/zh-CN/settings) 来限制开发人员可以添加哪些市场，请使用 `hostPattern` 源类型来允许来自您的 GHES 实例的所有市场，而无需枚举每个存储库：

```json theme={null}
{
  "strictKnownMarketplaces": [
    {
      "source": "hostPattern",
      "hostPattern": "^github\\.example\\.com$"
    }
  ]
}
```

有关完整的架构，请参阅 [strictKnownMarketplaces](/docs/zh-CN/settings#strictknownmarketplaces) 和 [extraKnownMarketplaces](/docs/zh-CN/settings#extraknownmarketplaces) 设置参考。

<h2 id="limitations">
  限制
</h2>

一些功能在 GHES 上的行为与 github.com 上不同。[功能表](#what-works-with-github-enterprise-server) 总结了支持；本部分涵盖了解决方法。

* **`/install-github-app` 命令**：改为在 claude.ai 上遵循 [管理员设置](#admin-setup) 流程。如果您还想在 GHES 上使用 GitHub Actions 工作流，请手动调整 [示例工作流](https://github.com/anthropics/claude-code-action/blob/main/examples/claude.yml)。
* **GitHub MCP server**：改为使用为您的 GHES 主机配置的 `gh` CLI。运行 `gh auth login --hostname github.example.com` 进行身份验证，然后 Claude 可以在会话中使用 `gh` 命令。

<h2 id="troubleshooting">
  故障排除
</h2>

<h3 id="web-session-fails-to-clone-repository">
  网络会话无法克隆存储库
</h3>

如果 `claude --cloud` 因克隆错误而失败，请验证 Owner 已完成您的 GHES 实例的设置，并且 GitHub App 已安装在您正在处理的存储库上。与连接该实例的 Owner 确认在 Claude 设置中注册的主机名与您的 git 远程中的主机名匹配。

<h3 id="marketplace-add-fails-with-a-policy-error">
  市场添加因策略错误而失败
</h3>

如果 `/plugin marketplace add` 因您的 GHES URL 而被阻止，您的组织已限制市场源。要求您的管理员在 [托管设置](#allowlist-ghes-marketplaces-in-managed-settings) 中为您的 GHES 主机名添加 `hostPattern` 条目。

<h3 id="marketplace-add-on-claude-ai-fails-with-a-github-access-error">
  claude.ai 上的市场添加因 GitHub 访问错误而失败
</h3>

如果从您的用户设置添加 GHES 市场失败并出现通用错误（如"无法添加市场"），请先检查您的 GitHub Enterprise 连接。这是当您自己的 GitHub Enterprise 账户未连接到 Claude 时出现的情况，即使您的组织的 GHES 实例已配置且其他用户已连接。该对话框不会指向 GitHub Enterprise 连接流程，"浏览"选项卡上的"连接到 GitHub"选项会登录到 github.com，这不会授予对 GHES 存储库的访问权限。

要连接您的 GitHub Enterprise 账户：[claude.ai/code](https://claude.ai/code) 上的存储库选择器为每个已配置的 GHES 实例提供连接选项，Owner 也可以从 [Claude Code 管理员设置](https://claude.ai/admin-settings/claude-code) 的 GitHub Enterprise 部分进行连接。然后再次添加市场。或者，要求 Owner 在组织插件设置中添加市场，这样可以消除每个用户的连接要求。

在其他 claude.ai 界面上，GHES 市场上的"找不到存储库。如果是私有的，需要 GitHub 访问"错误通常表示相同的缺失连接。通过上述路径之一连接您的 GitHub Enterprise 账户，然后重试。

<h3 id="ghes-instance-not-reachable">
  GHES 实例无法访问
</h3>

如果审查或网络会话超时，您的 GHES 实例可能无法从 Anthropic 基础设施访问。确认您的防火墙允许来自 [Anthropic API IP 地址](https://platform.claude.com/docs/zh-CN/api/ip-addresses) 的入站连接。

<h2 id="related-resources">
  相关资源
</h2>

这些页面更深入地涵盖了本指南中引用的功能：

* [网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)：在云基础设施上运行 Claude Code 会话
* [代码审查](/docs/zh-CN/code-review)：自动化 PR 审查
* [插件市场](/docs/zh-CN/plugin-marketplaces)：构建和分发插件目录
* [分析](/docs/zh-CN/analytics)：跟踪使用情况和贡献指标
* [托管设置](/docs/zh-CN/settings)：组织范围的策略配置
* [网络配置](/docs/zh-CN/network-config)：防火墙和 IP 白名单要求
