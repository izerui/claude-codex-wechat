> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Microsoft Foundry 上的 Claude Code

> 了解如何通过 Microsoft Foundry 配置 Claude Code，包括设置、配置和故障排除。

export const ContactSalesCard = ({surface}) => {
  const utm = content => `utm_source=claude_code&utm_medium=docs&utm_content=${surface}_${content}`;
  const iconArrowRight = (size = 13) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>;
  const STYLES = `
.cc-cs {
  --cs-slate: #141413;
  --cs-clay: #d97757;
  --cs-clay-deep: #c6613f;
  --cs-gray-000: #ffffff;
  --cs-gray-700: #3d3d3a;
  --cs-border-default: rgba(31, 30, 29, 0.15);
  font-family: inherit;
}
.dark .cc-cs {
  --cs-slate: #f0eee6;
  --cs-gray-000: #262624;
  --cs-gray-700: #bfbdb4;
  --cs-border-default: rgba(240, 238, 230, 0.14);
}
.cc-cs-card {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 14px 16px; margin: 0;
  background: var(--cs-gray-000); border: 0.5px solid var(--cs-border-default);
  border-radius: 8px; flex-wrap: wrap;
}
.cc-cs-text { font-size: 13px; color: var(--cs-gray-700); line-height: 1.5; flex: 1; min-width: 240px; }
.cc-cs-text strong { font-weight: 550; color: var(--cs-slate); }
.cc-cs-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.cc-cs-btn-clay {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--cs-clay-deep); color: #fff; border: none;
  border-radius: 8px; padding: 8px 14px;
  font-size: 13px; font-weight: 500;
  transition: background-color 0.15s; white-space: nowrap;
}
.cc-cs-btn-clay:hover { background: var(--cs-clay); }
.cc-cs-btn-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  background: transparent; color: var(--cs-gray-700);
  border: 0.5px solid var(--cs-border-default);
  border-radius: 8px; padding: 8px 14px;
  font-size: 13px; font-weight: 500;
}
.cc-cs-btn-ghost:hover { background: rgba(0, 0, 0, 0.04); }
.dark .cc-cs-btn-ghost:hover { background: rgba(255, 255, 255, 0.04); }
@media (max-width: 720px) {
  .cc-cs-actions { width: 100%; }
}
`;
  return <div className="cc-cs not-prose">
      <style>{STYLES}</style>
      <div className="cc-cs-card">
        <div className="cc-cs-text">
          <strong>Deploying Claude Code across your organization?</strong> Talk to sales about enterprise plans, SSO, and centralized billing.
        </div>
        <div className="cc-cs-actions">
          <a href={`https://claude.com/pricing?${utm('view_plans')}#plans-business`} className="cc-cs-btn-ghost">
            View plans
          </a>
          <a href={`https://claude.com/contact-sales?${utm('contact_sales')}`} className="cc-cs-btn-clay">
            Contact sales {iconArrowRight()}
          </a>
        </div>
      </div>
    </div>;
};

<ContactSalesCard surface="foundry" />

<h2 id="prerequisites">
  前置条件
</h2>

在使用 Microsoft Foundry 配置 Claude Code 之前，请确保您拥有：

* 具有 Microsoft Foundry 访问权限的 Azure 订阅
* 创建 Microsoft Foundry 资源和部署的 RBAC 权限
* 已安装并配置 Azure CLI（可选 - 仅在您没有其他获取凭证机制时需要）

<Note>
  如果您要将 Claude Code 部署给多个用户，请[固定您的模型版本](#4-pin-model-versions)以防止在 Anthropic 发布新模型时出现破损。
</Note>

<h2 id="setup">
  设置
</h2>

<h3 id="1-provision-microsoft-foundry-resource">
  1. 配置 Microsoft Foundry 资源
</h3>

首先，在 Azure 中创建 Claude 资源：

1. 导航到 [Microsoft Foundry 门户](https://ai.azure.com/)
2. 创建新资源，记下您的资源名称
3. 为 Claude 模型创建部署，记下您为每个模型指定的部署名称；您将在第 4 步中将这些名称设置为模型变量：
   * Claude Opus
   * Claude Sonnet
   * Claude Haiku

<h3 id="2-configure-azure-credentials">
  2) 配置 Azure 凭证
</h3>

Claude Code 支持三种 Microsoft Foundry 身份验证方法。选择最适合您安全要求的方法。

**选项 A：API 密钥身份验证**

1. 在 Microsoft Foundry 门户中导航到您的资源
2. 转到**端点和密钥**部分
3. 复制 **API 密钥**
4. 设置环境变量，将 `your-azure-api-key` 替换为您复制的密钥：

```bash theme={null}
export ANTHROPIC_FOUNDRY_API_KEY=your-azure-api-key
```

**选项 B：Microsoft Entra ID 身份验证**

当未设置 `ANTHROPIC_FOUNDRY_API_KEY` 和 `ANTHROPIC_FOUNDRY_AUTH_TOKEN` 时，Claude Code 会自动使用 Azure SDK [默认凭证链](https://learn.microsoft.com/en-us/azure/developer/javascript/sdk/authentication/credential-chains#defaultazurecredential-overview)。
这支持多种方法来验证本地和远程工作负载。

在本地环境中，您通常可以使用 Azure CLI：

```bash theme={null}
az login
```

**选项 C：Bearer 令牌身份验证**

Claude Code 在每个请求中将 `ANTHROPIC_FOUNDRY_AUTH_TOKEN` 的值作为 `Authorization: Bearer` 标头发送。当另一个进程（例如主机应用程序或登录脚本）已经为您获取了访问令牌时，请使用此选项。需要 Claude Code v2.1.203 或更高版本。

将变量设置为 Microsoft Entra ID 为您的资源颁发的 Bearer 令牌：

```bash theme={null}
export ANTHROPIC_FOUNDRY_AUTH_TOKEN=your-entra-access-token
```

`ANTHROPIC_FOUNDRY_AUTH_TOKEN` 优先于 `ANTHROPIC_FOUNDRY_API_KEY` 和默认凭证链。

<Note>
  使用 Microsoft Foundry 时，`/logout` 命令不可用，因为身份验证通过 Azure 凭证处理。
</Note>

<h3 id="3-configure-claude-code">
  3. 配置 Claude Code
</h3>

设置以下环境变量以启用 Microsoft Foundry：

```bash theme={null}
# 启用 Microsoft Foundry 集成
export CLAUDE_CODE_USE_FOUNDRY=1

# Azure 资源名称（将 {resource} 替换为您的资源名称）
export ANTHROPIC_FOUNDRY_RESOURCE={resource}
# 或提供完整的基础 URL：
# export ANTHROPIC_FOUNDRY_BASE_URL=https://{resource}.services.ai.azure.com/anthropic
```

<h3 id="4-pin-model-versions">
  4. 固定模型版本
</h3>

<Warning>
  为每个部署固定特定的模型版本。如果不固定版本，模型别名（如 `sonnet` 和 `opus`）会解析为 Claude Code 为 Microsoft Foundry 内置的默认值，这可能滞后于最新版本，并且可能在您的账户中尚不可用。Microsoft Foundry 没有启动模型检查，因此当默认值不可用时请求会失败。创建 Azure 部署时，请选择特定的模型版本而不是"自动更新到最新版本"。
</Warning>

设置模型变量以匹配您在第 1 步中创建的部署名称。

如果没有 `ANTHROPIC_DEFAULT_OPUS_MODEL`，Microsoft Foundry 上的 `opus` 别名会解析为 Opus 4.6。将其设置为 Opus 4.8 ID 以使用最新模型：

```bash theme={null}
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-8'
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-sonnet-5'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5'
```

后台任务（如会话标题生成）使用小型/快速模型，通常是 Haiku 级别的模型。在 Microsoft Foundry 上，Claude Code 默认使用主模型，因为并非每个账户都有 Haiku 部署。要为后台任务使用 Haiku，请将 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 设置为您账户中可用的 Haiku 部署，如上所示。

有关当前和旧版模型 ID，请参阅[模型概览](https://platform.claude.com/docs/en/about-claude/models/overview)。有关完整的环境变量列表，请参阅[模型配置](/docs/zh-CN/model-config#pin-models-for-third-party-deployments)。

[Prompt caching](/docs/zh-CN/prompt-caching) 会自动启用。要请求 1 小时的缓存 TTL 而不是 5 分钟的默认值，请设置以下变量；具有 1 小时 TTL 的缓存写入按更高的费率计费：

```bash theme={null}
export ENABLE_PROMPT_CACHING_1H=1
```

<h3 id="5-run-claude-code">
  5. 运行 Claude Code
</h3>

设置环境变量后，从您的项目目录启动 Claude Code：

```bash theme={null}
claude
```

Claude Code 从环境中读取 `CLAUDE_CODE_USE_FOUNDRY` 和其他 Microsoft Foundry 变量，并在第一个提示时连接到您的 Azure 资源。与 Amazon Bedrock 和 Google Cloud 的 Agent Platform 不同，Microsoft Foundry 没有交互式设置向导，因此第 3 和第 4 步中的环境变量是唯一的配置路径。

要验证您的设置，请在 Claude Code 中运行 `/status`。API 提供商行显示 `Microsoft Foundry`，以及您配置的资源名称或基础 URL。

<h2 id="azure-rbac-configuration">
  Azure RBAC 配置
</h2>

`Azure AI User` 和 `Cognitive Services User` 默认角色包括调用 Claude 模型所需的所有权限。

对于更严格的权限，请创建具有以下内容的自定义角色：

```json theme={null}
{
  "permissions": [
    {
      "dataActions": [
        "Microsoft.CognitiveServices/accounts/providers/*"
      ]
    }
  ]
}
```

有关详情，请参阅 [Microsoft Foundry RBAC 文档](https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/rbac-azure-ai-foundry)。

<h2 id="troubleshooting">
  故障排除
</h2>

如果您收到错误"Failed to get token from azureADTokenProvider: ChainedTokenCredential authentication failed"：

* 在环境中配置 Entra ID，或设置 `ANTHROPIC_FOUNDRY_API_KEY`。

如果请求在第一个提示上反复出现连接错误而失败：

* 检查 `ANTHROPIC_FOUNDRY_RESOURCE` 是否设置为您的实际资源名称，而不是占位符。Claude Code 从此值构建端点 URL，因此不正确的名称会指向不存在的主机。

<h2 id="additional-resources">
  其他资源
</h2>

* [Microsoft Foundry 文档](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-azure-ai-foundry)
* [Microsoft Foundry 模型](https://ai.azure.com/explore/models)
* [Microsoft Foundry 定价](https://azure.microsoft.com/en-us/pricing/details/ai-foundry/)
