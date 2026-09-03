> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Google Cloud 的 Agent Platform 上的 Claude Code

> 了解如何通过 Google Cloud 的 Agent Platform（原 Vertex AI）配置 Claude Code，包括设置、IAM 配置和故障排除。

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

<ContactSalesCard surface="vertex" />

<h2 id="prerequisites">
  前置条件
</h2>

在使用 Google Cloud 的 Agent Platform（原 Vertex AI）配置 Claude Code 之前，请确保您拥有：

* 启用了计费的 Google Cloud Platform (GCP) 账户
* 启用了 Google Cloud 的 Agent Platform API 的 GCP 项目
* 对所需 Claude 模型的访问权限（例如，Claude Sonnet 4.6）
* 已安装并配置的 Google Cloud SDK (`gcloud`)
* 在所需 GCP 区域中分配的配额

要使用您自己的 Google Cloud 的 Agent Platform 凭证登录，请按照下面的[使用 Google Cloud 的 Agent Platform 登录](#sign-in-with-agent-platform)进行操作。要在团队中部署 Claude Code，请使用[手动设置](#set-up-manually)步骤并在推出前[固定您的模型版本](#5-pin-model-versions)。

<h2 id="sign-in-with-agent-platform">
  使用 Agent Platform 登录
</h2>

如果您拥有 Google Cloud 凭证并想开始通过 Google Cloud 的 Agent Platform 使用 Claude Code，登录向导会引导您完成整个过程。您需要在每个项目中完成一次 GCP 端的前置条件；向导会处理 Claude Code 端的事务。

<Steps>
  <Step title="在您的 GCP 项目中启用 Claude 模型">
    为您的项目[启用 Google Cloud 的 Agent Platform API](#1-enable-agent-platform-api)，然后在 [Google Cloud 的 Agent Platform Model Garden](https://console.cloud.google.com/vertex-ai/model-garden) 中请求访问您想要的 Claude 模型。有关您的账户需要的权限，请参阅 [IAM 配置](#iam-configuration)。
  </Step>

  <Step title="启动 Claude Code 并选择 Google Cloud 的 Agent Platform">
    运行 `claude`。在登录提示处，选择 **3rd-party platform**，然后选择 **Google Vertex AI**，这是登录提示仍然用于 Google Cloud 的 Agent Platform 的标签。
  </Step>

  <Step title="按照向导提示进行操作">
    选择您如何向 Google Cloud 进行身份验证：来自 `gcloud` 的应用默认凭证、服务账户密钥文件或已在您的环境中的凭证。向导会检测您的项目和区域，验证您的项目可以调用哪些 Claude 模型，并让您固定它们。它将结果保存到您的[用户设置文件](/docs/zh-CN/settings)的 `env` 块中，因此您无需自己导出环境变量。
  </Step>
</Steps>

登录后，您可以随时运行 `/setup-vertex` 来重新打开向导并更改您的凭证、项目、区域或模型固定。模型固定步骤从您当前固定的模型开始。向导会写入 `~/.claude/settings.json`，或在设置了 [`CLAUDE_CONFIG_DIR`](/docs/zh-CN/env-vars#variables) 时写入 `$CLAUDE_CONFIG_DIR/settings.json`。

<h2 id="region-configuration">
  区域配置
</h2>

Claude Code 支持 Google Cloud 的 Agent Platform [全局](https://cloud.google.com/blog/products/ai-machine-learning/global-endpoint-for-claude-models-generally-available-on-vertex-ai)、多区域和区域端点。将 `CLOUD_ML_REGION` 设置为 `global`、多区域位置（如 `eu` 或 `us`）或特定区域（如 `us-east5`）。Claude Code 为每种形式选择正确的 Google Cloud 的 Agent Platform 主机名，包括多区域位置的 `aiplatform.eu.rep.googleapis.com` 和 `aiplatform.us.rep.googleapis.com` 主机。

<Note>
  Google Cloud 的 Agent Platform 可能不支持 Claude Code 默认模型在每个端点类型上。模型可用性在[特定区域](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations#genai-partner-models)、多区域位置和[全局端点](https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-partner-models#supported_models)之间有所不同。您可能需要切换到支持的位置或指定支持的模型。
</Note>

<h2 id="set-up-manually">
  手动设置
</h2>

要通过环境变量而不是向导配置 Google Cloud 的 Agent Platform，例如在 CI 或脚本化企业推出中，请按照下面的步骤进行。

<h3 id="1-enable-agent-platform-api">
  1. 启用 Agent Platform API
</h3>

在您的 GCP 项目中启用 Google Cloud 的 Agent Platform API：

```bash theme={null}
# 设置您的项目 ID
gcloud config set project YOUR-PROJECT-ID

# 启用 Agent Platform API
gcloud services enable aiplatform.googleapis.com
```

<h3 id="2-request-model-access">
  2. 请求模型访问权限
</h3>

请求访问 Google Cloud 的 Agent Platform 中的 Claude 模型：

1. 导航到 [Google Cloud 的 Agent Platform Model Garden](https://console.cloud.google.com/vertex-ai/model-garden)
2. 搜索"Claude"模型
3. 请求访问所需的 Claude 模型（例如，Claude Sonnet 4.6）
4. 等待批准（可能需要 24-48 小时）

<h3 id="3-configure-gcp-credentials">
  3) 配置 GCP 凭证
</h3>

Claude Code 使用标准的 Google Cloud 身份验证。

有关更多信息，请参阅 [Google Cloud 身份验证文档](https://cloud.google.com/docs/authentication)。

Claude Code v2.1.121 或更高版本通过相同的应用默认凭证链支持[基于 X.509 证书的工作负载身份联合](https://cloud.google.com/iam/docs/workload-identity-federation-with-x509-certificates)。将 `GOOGLE_APPLICATION_CREDENTIALS` 设置为您的凭证配置文件的路径。

<Note>
  Claude Code 使用 `ANTHROPIC_VERTEX_PROJECT_ID` 作为 Google Cloud 的 Agent Platform 请求的项目 ID。`GCLOUD_PROJECT` 和 `GOOGLE_CLOUD_PROJECT` 环境变量以及 `GOOGLE_APPLICATION_CREDENTIALS` 引用的凭证文件优先于它。如果这些都未设置，项目 ID 将从您的 `gcloud` 配置或附加的服务账户解析。
</Note>

<h4 id="advanced-credential-configuration">
  高级凭证配置
</h4>

Claude Code 通过 `gcpAuthRefresh` 设置支持 GCP 的自动凭证刷新。当 Claude Code 检测到您的 GCP 凭证已过期或无法加载时，它会运行配置的命令以在重试请求之前获取新凭证。

```json theme={null}
{
  "gcpAuthRefresh": "gcloud auth application-default login",
  "env": {
    "ANTHROPIC_VERTEX_PROJECT_ID": "your-project-id"
  }
}
```

命令的输出会显示给用户，但不支持交互式输入。这对于基于浏览器的身份验证流程效果很好，其中 CLI 显示 URL，您在浏览器中完成身份验证。如果身份验证未在三分钟内完成，刷新命令将超时。如果您在项目设置（如 `.claude/settings.json`）中设置 `gcpAuthRefresh`，该命令仅在您接受工作区信任提示后运行。

<h3 id="4-configure-claude-code">
  4. 配置 Claude Code
</h3>

设置以下环境变量：

```bash theme={null}
# 启用 Agent Platform 集成
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION=global
export ANTHROPIC_VERTEX_PROJECT_ID=YOUR-PROJECT-ID

# 可选：为自定义端点或网关覆盖 Agent Platform 端点 URL
# export ANTHROPIC_VERTEX_BASE_URL=https://aiplatform.googleapis.com

# 可选：如果需要，禁用 prompt caching
export DISABLE_PROMPT_CACHING=1

# 可选：请求 1 小时的 prompt cache TTL 而不是 5 分钟的默认值
export ENABLE_PROMPT_CACHING_1H=1

# 当 CLOUD_ML_REGION=global 时，为不支持全局端点的模型覆盖区域
export VERTEX_REGION_CLAUDE_HAIKU_4_5=us-east5
export VERTEX_REGION_CLAUDE_4_6_SONNET=europe-west1
```

大多数模型版本都有对应的 `VERTEX_REGION_CLAUDE_*` 变量。有关完整列表，请参阅[环境变量参考](/docs/zh-CN/env-vars)。检查 [Google Cloud 的 Agent Platform Model Garden](https://console.cloud.google.com/vertex-ai/model-garden) 以确定哪些模型支持全局端点与仅区域端点。

[Prompt caching](/docs/zh-CN/prompt-caching) 会自动启用。要禁用它，请设置 `DISABLE_PROMPT_CACHING=1`。要请求 1 小时的缓存 TTL 而不是 5 分钟的默认值，请设置 `ENABLE_PROMPT_CACHING_1H=1`；具有 1 小时 TTL 的缓存写入按更高费率计费。如需提高速率限制，请联系 Google Cloud 支持。使用 Google Cloud 的 Agent Platform 时，`/logout` 命令不可用，因为身份验证通过 Google Cloud 凭证处理。

Claude Code 在 Google Cloud 的 Agent Platform 上默认禁用 [MCP tool search](/docs/zh-CN/mcp#scale-with-mcp-tool-search)，因此 MCP 工具定义会预先加载。Google Cloud 的 Agent Platform 支持 Claude Sonnet 4.5 及更高版本以及 Claude Opus 4.5 及更高版本的工具搜索。设置 `ENABLE_TOOL_SEARCH=true` 以在这些模型上启用它。Google Cloud 的 Agent Platform 上的早期模型不接受所需的 beta 标头，如果您对它们启用工具搜索，请求将失败。

<h3 id="5-pin-model-versions">
  5. 固定模型版本
</h3>

<Warning>
  在部署到多个用户时固定特定的模型版本。如果不固定，模型别名（如 `sonnet` 和 `opus`）会解析为 Claude Code 的 Google Cloud 的 Agent Platform 内置默认值，该默认值可能滞后于最新版本，并且可能尚未在您的项目中启用。Claude Code 在启动时当默认值不可用时会[回退](#startup-model-checks)到之前的版本或更低级别的模型，但固定让您可以控制用户何时迁移到新模型。
</Warning>

将这些环境变量设置为特定的 Google Cloud 的 Agent Platform 模型 ID。

如果没有 `ANTHROPIC_DEFAULT_OPUS_MODEL`，Google Cloud 的 Agent Platform 上的 `opus` 别名会解析为 Opus 4.8，如果没有 `ANTHROPIC_DEFAULT_SONNET_MODEL`，`sonnet` 别名会解析为 Sonnet 4.5。此示例将每个别名固定到特定版本：

```bash theme={null}
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-8'
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-sonnet-5'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5@20251001'
```

有关当前和旧版模型 ID，请参阅[模型概览](https://platform.claude.com/docs/en/about-claude/models/overview)。有关完整的环境变量列表，请参阅[模型配置](/docs/zh-CN/model-config#pin-models-for-third-party-deployments)。

Claude Code 在未设置固定变量时使用这些默认模型：

| 模型类型    | 默认值                          |
| :------ | :--------------------------- |
| 主模型     | `claude-opus-4-8`            |
| 小型/快速模型 | `claude-sonnet-4-5@20250929` |

后台任务（如会话标题生成）使用小型/快速模型，通常是 Haiku 级别的模型。在 Google Cloud 的 Agent Platform 上，Claude Code 为后台任务使用默认的 Sonnet 模型，因为 Haiku 可能不会在每个项目或区域中启用。两个选择会改变哪个模型执行这些任务：

* 当您使用 `--model`、`ANTHROPIC_MODEL` 或 `model` 设置选择主模型时，后台任务使用该模型。设置 `ANTHROPIC_DEFAULT_OPUS_MODEL` 而不设置 `ANTHROPIC_DEFAULT_SONNET_MODEL` 也算作一个选择，因为内置的 Sonnet 模型可能在引导自己的 Opus 的项目中未启用。
* 要为后台任务使用 Haiku，请将 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 设置为在您的项目中可用的模型 ID。

<Warning>
  Opus 模型的每个令牌价格高于 Sonnet 模型，因此不固定主模型的部署在更新到 v2.1.207 或更高版本后将按 Opus 费率计费。要将 Sonnet 4.5 保持为主模型，请将 `ANTHROPIC_MODEL` 设置为其完整模型 ID。使用 `ANTHROPIC_DEFAULT_SONNET_MODEL` 引导默认值且不设置 `ANTHROPIC_DEFAULT_OPUS_MODEL` 的部署会保持其引导的 Sonnet 模型作为默认值。
</Warning>

在 v2.1.207 之前，Google Cloud 的 Agent Platform 上的主模型默认为 Sonnet 4.5，`opus` 别名解析为 Opus 4.6，后台任务始终使用主模型。

要进一步自定义模型：

```bash theme={null}
export ANTHROPIC_MODEL='claude-opus-4-8'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5@20251001'
```

<h2 id="startup-model-checks">
  启动模型检查
</h2>

当 Claude Code 启动并配置了 Google Cloud 的 Agent Platform 时，它会验证它打算使用的模型在您的项目中是否可访问。

如果您固定了一个比当前 Claude Code 默认值更旧的模型版本，并且您的项目可以调用较新版本，Claude Code 会提示您更新固定。接受会将新的模型 ID 写入您的[用户设置文件](/docs/zh-CN/settings)并重启 Claude Code。拒绝会被记住，直到下一个默认版本更改。

如果您没有固定模型，并且当前默认值在您的项目中不可用，Claude Code 会在当前会话中回退并显示通知。它首先尝试默认模型的早期版本，当默认值是 Opus 模型且没有可用的 Opus 版本时，会回退到默认 Sonnet 模型。回退不会被持久化。在 [Model Garden](https://console.cloud.google.com/vertex-ai/model-garden) 中启用较新的模型或[固定一个版本](#5-pin-model-versions)以使选择永久化。

<h2 id="iam-configuration">
  IAM 配置
</h2>

分配所需的 IAM 权限：

`roles/aiplatform.user` 角色包括所需的权限：

* `aiplatform.endpoints.predict` - 模型调用和令牌计数所需

对于更严格的权限，请创建仅包含上述权限的自定义角色。

有关详细信息，请参阅 [Google Cloud 的 Agent Platform IAM 文档](https://cloud.google.com/vertex-ai/docs/general/access-control)。

<Note>
  为 Claude Code 创建专用的 GCP 项目，以简化成本跟踪和访问控制。
</Note>

<h2 id="1m-token-context-window">
  1M token context window
</h2>

Claude Sonnet 5、Opus 4.6 及更高版本以及 Sonnet 4.6 在 Google Cloud 的 Agent Platform 上支持 [1M token context window](https://platform.claude.com/docs/zh-CN/build-with-claude/context-windows#context-window-sizes-by-model)。Sonnet 5 始终以 1M 窗口运行，没有 `[1m]` 变体可选择。对于其他模型，当您选择 1M 模型变体时，Claude Code 会自动启用扩展 context window。

[设置向导](#sign-in-with-agent-platform)在固定模型时提供 1M context 选项。要为手动固定的模型启用它，请在模型 ID 后附加 `[1m]`。有关详细信息，请参阅[为第三方部署固定模型](/docs/zh-CN/model-config#pin-models-for-third-party-deployments)。

<h2 id="troubleshooting">
  故障排除
</h2>

如果您遇到"无法加载默认凭证"错误：

* 运行 `gcloud auth application-default login` 来设置应用默认凭证
* 将 `GOOGLE_APPLICATION_CREDENTIALS` 设置为服务账户密钥文件路径
* 查看 [配置 GCP 凭证](#3-configure-gcp-credentials) 了解所有选项

如果您遇到配额问题：

* 通过 [Cloud Console](https://cloud.google.com/docs/quotas/view-manage) 检查当前配额或请求增加配额

如果您遇到"模型未找到"404 错误：

* 确认模型在 [Model Garden](https://console.cloud.google.com/vertex-ai/model-garden) 中已启用
* 验证该模型在您指定的位置可用。某些模型仅在 `global` 或多区域位置（如 `eu` 和 `us`）上提供，而不是在特定区域
* 如果使用 `CLOUD_ML_REGION=global`，请检查您的模型是否在 [Model Garden](https://console.cloud.google.com/vertex-ai/model-garden) 中的"支持的功能"下支持全局端点。对于不支持全局端点的模型，请执行以下任一操作：
  * 通过 `ANTHROPIC_MODEL` 或 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 指定支持的模型，或
  * 使用 `VERTEX_REGION_<MODEL_NAME>` 环境变量设置区域或多区域位置

如果您遇到 429 错误：

* 对于区域端点，请确保主模型和小型/快速模型在您选择的区域中受支持
* 考虑切换到 `CLOUD_ML_REGION=global` 以获得更好的可用性

<h2 id="additional-resources">
  其他资源
</h2>

* [Google Cloud 的 Agent Platform 文档](https://cloud.google.com/vertex-ai/docs)
* [Google Cloud 的 Agent Platform 定价](https://cloud.google.com/vertex-ai/pricing)
* [Google Cloud 的 Agent Platform 配额和限制](https://cloud.google.com/vertex-ai/docs/quotas)
