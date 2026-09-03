> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Amazon Bedrock 上的 Claude Code

> 了解如何通过 Amazon Bedrock 配置 Claude Code，包括设置、IAM 配置和故障排除。

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

<ContactSalesCard surface="bedrock" />

<h2 id="prerequisites">
  前置条件
</h2>

在使用 Amazon Bedrock 配置 Claude Code 之前，请确保您拥有：

* 启用了 Amazon Bedrock 访问权限的 AWS 账户
* 在 Amazon Bedrock 中访问所需的 Claude 模型（例如 Claude Sonnet 4.6）
* 已安装并配置 AWS CLI（可选 - 仅在您没有其他获取凭证的机制时需要）
* 适当的 IAM 权限

要使用您自己的 Amazon Bedrock 凭证登录，请按照下面的[使用 Amazon Bedrock 登录](#sign-in-with-bedrock)进行操作。要在团队中部署 Claude Code，请使用[手动设置](#set-up-manually)步骤并在推出前[固定您的模型版本](#4-pin-model-versions)。

<h2 id="sign-in-with-bedrock">
  使用 Bedrock 登录
</h2>

如果您拥有 AWS 凭证并想开始通过 Amazon Bedrock 使用 Claude Code，登录向导会引导您完成整个过程。您每个账户完成一次 AWS 端的前置条件；向导处理 Claude Code 端。

<Steps>
  <Step title="在您的 AWS 账户中启用 Anthropic 模型">
    在 [Amazon Bedrock 控制台](https://console.aws.amazon.com/bedrock/)中，打开模型目录，选择一个 Anthropic 模型，并提交用例表单。提交后立即授予访问权限。有关 AWS Organizations，请参阅[提交用例详情](#1-submit-use-case-details)，有关权限，请参阅 [IAM 配置](#iam-configuration)。
  </Step>

  <Step title="启动 Claude Code 并选择 Amazon Bedrock">
    运行 `claude`。在登录提示处，选择 **3rd-party platform**，然后选择 **Amazon Bedrock**。
  </Step>

  <Step title="按照向导提示操作">
    选择您如何向 AWS 进行身份验证：从您的 `~/.aws` 目录检测到的 AWS 配置文件、Amazon Bedrock API 密钥、访问密钥和密钥，或已在您的环境中的凭证。向导会获取您的区域，验证您的账户可以调用哪些 Claude 模型，并让您固定它们。它将结果保存到您的[用户设置文件](/docs/zh-CN/settings)的 `env` 块中，因此您无需自己导出环境变量。
  </Step>
</Steps>

登录后，随时运行 `/setup-bedrock` 重新打开向导并更改您的凭证、区域或模型固定。模型固定步骤从您当前固定的模型开始。向导写入 `~/.claude/settings.json`，或在设置了 [`CLAUDE_CONFIG_DIR`](/docs/zh-CN/env-vars#variables) 时写入 `$CLAUDE_CONFIG_DIR/settings.json`。

<h2 id="set-up-manually">
  手动设置
</h2>

要通过环境变量而不是向导配置 Amazon Bedrock，例如在 CI 或脚本化企业推出中，请按照下面的步骤操作。

<h3 id="1-submit-use-case-details">
  1. 提交用例详情
</h3>

Anthropic 模型的首次用户需要在调用模型之前提交用例详情。这是每个 AWS 账户执行一次的操作。

1. 确保您拥有下面描述的正确 IAM 权限
2. 导航到 [Amazon Bedrock 控制台](https://console.aws.amazon.com/bedrock/)
3. 从**模型目录**中选择一个 Anthropic 模型
4. 完成用例表单。提交后立即授予访问权限。

如果您使用 AWS Organizations，您可以使用 [`PutUseCaseForModelAccess` API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_PutUseCaseForModelAccess.html) 从管理账户提交一次表单。此调用需要 `bedrock:PutUseCaseForModelAccess` IAM 权限。批准自动扩展到子账户。

<h3 id="2-configure-aws-credentials">
  2. 配置 AWS 凭证
</h3>

Claude Code 使用默认的 AWS SDK 凭证链。使用以下方法之一设置您的凭证：

**选项 A：AWS CLI 配置**

```bash theme={null}
aws configure
```

**选项 B：环境变量（访问密钥）**

```bash theme={null}
export AWS_ACCESS_KEY_ID=your-access-key-id
export AWS_SECRET_ACCESS_KEY=your-secret-access-key
export AWS_SESSION_TOKEN=your-session-token
```

**选项 C：环境变量（SSO 配置文件）**

将 `your-profile-name` 替换为您的 AWS 配置文件的名称，然后运行这些命令。

```bash theme={null}
aws sso login --profile=your-profile-name

export AWS_PROFILE=your-profile-name
```

Claude Code 从 IAM Identity Center 区域请求角色凭证，该区域由配置文件的 `sso_region` 命名，不需要与您运行 Amazon Bedrock 的区域匹配。在 v2.1.207 中，Amazon Bedrock 区域覆盖了 `sso_region`，因此其 IAM Identity Center 实例在不同区域的配置文件无法使用 `Session token not found or invalid` 错误进行身份验证。

**选项 D：AWS 管理控制台凭证**

```bash theme={null}
aws login
```

[了解更多](https://docs.aws.amazon.com/signin/latest/userguide/command-line-sign-in.html)关于 `aws login`。

**选项 E：Amazon Bedrock API 密钥**

```bash theme={null}
export AWS_BEARER_TOKEN_BEDROCK=your-bedrock-api-key
```

Amazon Bedrock API 密钥提供了一种更简单的身份验证方法，无需完整的 AWS 凭证。[了解更多关于 Amazon Bedrock API 密钥](https://aws.amazon.com/blogs/machine-learning/accelerate-ai-development-with-amazon-bedrock-api-keys/)。

<h4 id="credential-caching-and-resolution-timeout">
  凭证缓存和解析超时
</h4>

Claude Code 解析 AWS 默认凭证提供商链一次，并将解析的凭证保存在内存中。它重复使用它们，直到它们过期前五分钟，或在没有过期时间时使用一小时，因此 SSO 支持的配置文件大约每个凭证生命周期从 IAM Identity Center 请求一次凭证。来自 API 的凭证错误会清除缓存，重试会解析新的凭证。

在 v2.1.207 之前，Claude Code 在每个 API 请求时解析链，因此 SSO 支持的配置文件每次都从 IAM Identity Center 请求新凭证，在大型部署中可能会被限流。

缓存涵盖上面的每个凭证选项，除了 Amazon Bedrock API 密钥，它不使用提供商链。要改为在每个请求时解析链，请设置 [`CLAUDE_CODE_SKIP_AWS_CRED_CACHE=1`](/docs/zh-CN/env-vars)。

链的每次解析在 60 秒后超时。如果链中的一个步骤停滞，例如等待无法接收的输入的 `credential_process` 帮助程序，请求会失败，显示 [`AWS default-chain credential resolve timed out`](/docs/zh-CN/errors#aws-default-chain-credential-resolve-timed-out)。如果您的链运行合法需要更长时间的交互式登录，例如通过 `aws-vault` 等包装器进行基于浏览器的 SSO 和 MFA，请使用 [`CLAUDE_CODE_AWS_CHAIN_RESOLVE_TIMEOUT_MS`](/docs/zh-CN/env-vars) 以毫秒为单位提高限制。在 v2.1.207 之前，停滞的凭证解析会使请求无限期等待。

<h4 id="advanced-credential-configuration">
  高级凭证配置
</h4>

Claude Code 支持 AWS SSO 和企业身份提供商的自动凭证刷新。将这些设置添加到您的 Claude Code 设置文件（请参阅[设置](/docs/zh-CN/settings)了解文件位置）。

这两个设置有不同的触发条件：

* **`awsAuthRefresh`**：仅当 Claude Code 检测到您的 AWS 凭证已过期时运行，基于本地时间戳或当 API 返回凭证错误时，然后使用刷新的凭证重试请求。
* **`awsCredentialExport`**：在会话启动和每次凭证重新加载时运行，即使您的 AWS 默认凭证提供商链中的凭证仍然有效。当您的 Amazon Bedrock 账户需要与默认提供商链会解析的凭证不同的跨账户凭证时，请使用此选项。

<h5 id="example-configuration">
  示例配置
</h5>

```json theme={null}
{
  "awsAuthRefresh": "aws sso login --profile myprofile",
  "env": {
    "AWS_PROFILE": "myprofile"
  }
}
```

<h5 id="configuration-settings-explained">
  配置设置说明
</h5>

**`awsAuthRefresh`**：用于修改 `.aws` 目录的命令，例如更新凭证、SSO 缓存或配置文件。命令的输出显示给用户，但不支持交互式输入。这适用于基于浏览器的 SSO 流，其中 CLI 显示 URL 或代码，您在浏览器中完成身份验证。

**`awsCredentialExport`**：仅在您无法修改 `.aws` 且必须直接返回凭证时使用。此命令在需要刷新凭证时运行，而不仅仅是在凭证过期时。输出被静默捕获，不显示给用户。命令必须以此格式输出 JSON：

```json theme={null}
{
  "Credentials": {
    "AccessKeyId": "value",
    "SecretAccessKey": "value",
    "SessionToken": "value",
    "Expiration": "2026-01-01T00:00:00Z"
  }
}
```

从 Claude Code v2.1.181 开始，`aws configure export-credentials --format process` 的平面输出也被接受，具有相同的密钥在顶级而不是嵌套在 `Credentials` 下。

`Expiration` 是可选的。从 Claude Code v2.1.176 开始，当命令返回有效的 ISO 8601 `Expiration` 时，Claude Code 会缓存凭证直到该时间前五分钟。没有它，或在更早的版本上，凭证被缓存一小时。

当您配置 `awsCredentialExport` 而不配置 `awsAuthRefresh` 时，Claude Code 直接使用导出的凭证，不在启动时重新解析 AWS 默认凭证提供商链。在 v2.1.206 之前，启动也会重新解析默认提供商链，这会在您的代理配置之外进行实时 SSO 或 STS 调用，并可能在具有受限出口的网络上阻止第一个提示数分钟。

<h3 id="3-configure-claude-code">
  3. 配置 Claude Code
</h3>

设置以下环境变量以启用 Amazon Bedrock：

```bash theme={null}
# 启用 Bedrock 集成
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1  # 如果您的 AWS 配置文件已设置区域，则可选

# 可选：覆盖小型/快速模型 (Bedrock 和 Mantle) 的 AWS 区域。
# 在 Bedrock 上，如果未设置 ANTHROPIC_DEFAULT_HAIKU_MODEL
# 或已弃用的 ANTHROPIC_SMALL_FAST_MODEL，则无效。
export ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION=us-west-2

# 可选：覆盖 Bedrock 端点 URL 以用于自定义端点或网关
# export ANTHROPIC_BEDROCK_BASE_URL=https://bedrock-runtime.us-east-1.amazonaws.com
```

为 Claude Code 启用 Amazon Bedrock 时，请记住以下几点：

* 从 v2.1.172 开始，您只需设置 `AWS_REGION` 来覆盖您的 AWS 配置文件的区域，或在您的配置文件没有区域时设置。Claude Code 按此顺序解析区域：

  * `AWS_REGION`
  * `AWS_DEFAULT_REGION`
  * 在您的活跃 AWS 配置文件上设置的 `region`，首先从 AWS 共享凭证文件读取，然后从共享配置文件读取，匹配 AWS SDK 优先级
  * `us-east-1`

  活跃配置文件是 `AWS_PROFILE`（如果已设置），否则为 `default`。设置 `AWS_SHARED_CREDENTIALS_FILE` 或 `AWS_CONFIG_FILE` 以指向非默认文件路径。运行 `/status` 以查看解析的区域。当区域来自您的 AWS 配置文件或默认回退时，`/status` 也会注明来源。在 v2.1.171 及更早版本上，Claude Code 不读取 AWS 配置文件，因此请显式设置 `AWS_REGION`。
* 使用 Amazon Bedrock 时，`/logout` 命令不可用，因为身份验证通过 AWS 凭证处理。
* WebSearch 工具在 Amazon Bedrock 上不可用。请参阅 [WebSearch 工具行为](/docs/zh-CN/tools-reference#websearch-tool-behavior)。
* 您可以使用设置文件来处理环境变量，如 `AWS_PROFILE`，您不希望泄露给其他进程。请参阅[设置](/docs/zh-CN/settings)了解更多信息。

<h3 id="4-pin-model-versions">
  4. 固定模型版本
</h3>

<Warning>
  在部署到多个用户时固定特定的模型版本。如果不固定，模型别名（如 `sonnet` 和 `opus`）会解析为 Claude Code 为 Amazon Bedrock 内置的默认值，这可能滞后于最新版本，并且可能在您的账户中还不可用。Claude Code 在启动时会[回退](#startup-model-checks)到上一个版本或更低级别的模型（如果默认版本不可用），但固定让您可以控制用户何时迁移到新模型。
</Warning>

将这些环境变量设置为特定的 Amazon Bedrock 模型 ID。

如果没有 `ANTHROPIC_DEFAULT_OPUS_MODEL`，Amazon Bedrock 上的 `opus` 别名会解析为 Opus 4.8，如果没有 `ANTHROPIC_DEFAULT_SONNET_MODEL`，`sonnet` 别名会解析为 Sonnet 4.5。此示例将每个别名固定到特定版本：

```bash theme={null}
export ANTHROPIC_DEFAULT_OPUS_MODEL='us.anthropic.claude-opus-4-8'
export ANTHROPIC_DEFAULT_SONNET_MODEL='us.anthropic.claude-sonnet-4-6'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='us.anthropic.claude-haiku-4-5-20251001-v1:0'
```

这些变量使用跨区域推理配置文件 ID（带有 `us.` 前缀）。如果您使用不同的区域前缀或应用推理配置文件，请相应调整。在 AWS GovCloud 区域中，使用 `us-gov.` 前缀。有关当前和旧版模型 ID，请参阅[模型概览](https://platform.claude.com/docs/en/about-claude/models/overview)。请参阅[模型配置](/docs/zh-CN/model-config#pin-models-for-third-party-deployments)了解完整的环境变量列表。

Claude Code 使用这些默认模型当未设置固定变量时：

| 模型类型    | 默认值                                            |
| :------ | :--------------------------------------------- |
| 主模型     | `us.anthropic.claude-opus-4-8`                 |
| 小型/快速模型 | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |

后台任务（如会话标题生成）使用小型/快速模型，通常是 Haiku 级别的模型。在 Amazon Bedrock 上，Claude Code 为后台任务使用默认 Sonnet 模型，因为并非每个账户或区域都启用了 Haiku。两个选择改变哪个模型执行它们：

* 当您使用 `--model`、`ANTHROPIC_MODEL` 或 `model` 设置选择主模型时，后台任务使用该模型。设置 `ANTHROPIC_DEFAULT_OPUS_MODEL` 而不设置 `ANTHROPIC_DEFAULT_SONNET_MODEL` 也算作一个选择，因为内置 Sonnet 模型可能在引导自己的 Opus 的账户中不启用。
* 要为后台任务使用 Haiku，请将 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 设置为您账户中可用的模型 ID。

<Warning>
  Opus 模型的每令牌价格高于 Sonnet 模型，因此不固定主模型的部署在更新到 v2.1.207 或更高版本后将按 Opus 费率计费。要将 Sonnet 4.5 保持为主模型，请将 `ANTHROPIC_MODEL` 设置为其完整模型 ID。使用 `ANTHROPIC_DEFAULT_SONNET_MODEL` 引导默认值且不设置 `ANTHROPIC_DEFAULT_OPUS_MODEL` 的部署会保持其引导的 Sonnet 模型作为默认值。
</Warning>

在 v2.1.207 之前，Amazon Bedrock 上的主模型默认为 Sonnet 4.5，`opus` 别名解析为 Opus 4.6，后台任务始终使用主模型。

要进一步自定义模型，请使用以下方法之一：

```bash theme={null}
# 使用推理配置文件 ID
export ANTHROPIC_MODEL='us.anthropic.claude-sonnet-4-6'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='us.anthropic.claude-haiku-4-5-20251001-v1:0'

# 使用应用推理配置文件 ARN
export ANTHROPIC_MODEL='arn:aws:bedrock:us-east-2:your-account-id:application-inference-profile/your-model-id'

# 可选：如果需要，禁用 prompt caching
export DISABLE_PROMPT_CACHING=1

# 可选：请求 1 小时 prompt cache TTL 而不是 5 分钟默认值
export ENABLE_PROMPT_CACHING_1H=1
```

1 小时缓存 TTL 的计费费率高于 5 分钟默认值。请参阅[缓存生命周期](/docs/zh-CN/prompt-caching#cache-lifetime)。

<Note>Prompt caching 可能在所有 Amazon Bedrock 区域都不可用。如果缓存令牌计数保持为零，请检查 Amazon Bedrock 文档中的[支持的模型、区域和限制](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html#prompt-caching-models)。</Note>

<h4 id="map-each-model-version-to-an-inference-profile">
  将每个模型版本映射到推理配置文件
</h4>

`ANTHROPIC_DEFAULT_*_MODEL` 环境变量为每个模型系列配置一个推理配置文件。如果您的组织需要在 `/model` 选择器中公开同一系列的多个版本，每个版本路由到其自己的应用推理配置文件 ARN，请改用[设置文件](/docs/zh-CN/settings#settings-files)中的 `modelOverrides` 设置。

此示例将四个 Opus 版本映射到不同的 ARN，以便用户可以在它们之间切换，而无需绕过您组织的推理配置文件：

```json theme={null}
{
  "modelOverrides": {
    "claude-opus-4-7": "arn:aws:bedrock:us-east-2:123456789012:application-inference-profile/opus-47-prod",
    "claude-opus-4-6": "arn:aws:bedrock:us-east-2:123456789012:application-inference-profile/opus-46-prod",
    "claude-opus-4-5-20251101": "arn:aws:bedrock:us-east-2:123456789012:application-inference-profile/opus-45-prod",
    "claude-opus-4-1-20250805": "arn:aws:bedrock:us-east-2:123456789012:application-inference-profile/opus-41-prod"
  }
}
```

当用户在 `/model` 中选择其中一个版本时，Claude Code 使用映射的 ARN 调用 Amazon Bedrock。当您通过 `--model` 或 `ANTHROPIC_MODEL` 直接传递 Anthropic 模型 ID 时，相同的映射也适用。没有覆盖的版本回退到内置的 Amazon Bedrock 模型 ID 或启动时发现的任何匹配推理配置文件。在 v2.1.200 之前，`--model` 和 `ANTHROPIC_MODEL` 值直接到达 Amazon Bedrock，不经过覆盖映射。请参阅[按版本覆盖模型 ID](/docs/zh-CN/model-config#override-model-ids-per-version)了解覆盖如何与 `availableModels` 和其他模型设置交互的详情。

<h2 id="startup-model-checks">
  启动模型检查
</h2>

当 Claude Code 启动并配置了 Amazon Bedrock 时，它会验证它打算使用的模型在您的账户中是否可访问。

如果您固定了一个比当前 Claude Code 默认值更旧的模型版本，并且您的账户可以调用较新版本，Claude Code 会提示您更新固定。接受会将新模型 ID 写入您的[用户设置文件](/docs/zh-CN/settings)并重启 Claude Code。拒绝会被记住，直到下一个默认版本更改。指向[应用推理配置文件 ARN](#map-each-model-version-to-an-inference-profile) 的固定会被跳过，因为这些由您的管理员管理。

如果您没有固定模型，并且当前默认值在您的账户中不可用，Claude Code 会在当前会话中回退并显示通知。它首先尝试默认模型的早期版本，当默认值是 Opus 模型且没有 Opus 版本可用时，会回退到默认 Sonnet 模型。回退不会被持久化。在您的 Amazon Bedrock 账户中启用较新的模型或[固定一个版本](#4-pin-model-versions)以使选择永久化。

<h2 id="iam-configuration">
  IAM 配置
</h2>

创建具有 Claude Code 所需权限的 IAM 策略：

```json theme={null}
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowModelAndInferenceProfileAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListInferenceProfiles",
        "bedrock:GetInferenceProfile"
      ],
      "Resource": [
        "arn:aws:bedrock:*:*:inference-profile/*",
        "arn:aws:bedrock:*:*:application-inference-profile/*",
        "arn:aws:bedrock:*:*:foundation-model/*"
      ]
    },
    {
      "Sid": "AllowMarketplaceSubscription",
      "Effect": "Allow",
      "Action": [
        "aws-marketplace:ViewSubscriptions",
        "aws-marketplace:Subscribe"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:CalledViaLast": "bedrock.amazonaws.com"
        }
      }
    }
  ]
}
```

为了获得更严格的权限，您可以将资源限制为特定的推理配置文件 ARN。

`bedrock:GetInferenceProfile` 让 Claude Code 能够将[应用推理配置文件 ARN](#map-each-model-version-to-an-inference-profile) 解析为其支持的基础模型，该模型用于为该模型选择正确的请求形状。

如果令牌缺少此权限，Claude Code 会通过使用备用形状重试一次来自动恢复，因此请求仍然会成功，但每个新模型都会增加一个额外的往返。授予该权限可以避免重试。这最常适用于 `AWS_BEARER_TOKEN_BEDROCK` 部署，其中令牌的策略通常比完整的 IAM 角色更窄。

有关详情，请参阅 [Amazon Bedrock IAM 文档](https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html)。

<Note>
  为 Claude Code 创建一个专用的 AWS 账户，以简化成本跟踪和访问控制。
</Note>

<h2 id="1m-token-context-window">
  1M 令牌上下文窗口
</h2>

Claude Sonnet 5、Opus 4.6 及更高版本，以及 Sonnet 4.6 在 Amazon Bedrock 上支持 [1M 令牌上下文窗口](https://platform.claude.com/docs/en/build-with-claude/context-windows#context-window-sizes-by-model)。Sonnet 5 通过 [Mantle 端点](#use-the-mantle-endpoint)提供，始终以 1M 窗口运行，没有 `[1m]` 变体可选择。对于其他模型，当您选择 1M 模型变体时，Claude Code 会自动启用扩展上下文窗口。

[设置向导](#sign-in-with-bedrock)在固定模型时提供 1M 上下文选项。要为手动固定的模型启用它，请在模型 ID 后附加 `[1m]`。请参阅[为第三方部署固定模型](/docs/zh-CN/model-config#pin-models-for-third-party-deployments)了解详情。

<h2 id="service-tiers">
  服务层级
</h2>

[Amazon Bedrock 服务层级](https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html)让您在成本和延迟之间进行权衡。将 `ANTHROPIC_BEDROCK_SERVICE_TIER` 设置为 `default`、`flex` 或 `priority`：

```bash theme={null}
export ANTHROPIC_BEDROCK_SERVICE_TIER=priority
```

Claude Code 在每个请求上将此作为 `X-Amzn-Bedrock-Service-Tier` 标头发送。层级可用性因模型和区域而异。预留容量使用[预配吞吐量](https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html) ARN 作为模型 ID，而不是此设置。

<h2 id="aws-guardrails">
  AWS Guardrails
</h2>

[Amazon Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html) 让您为 Claude Code 实现内容过滤。在 [Amazon Bedrock 控制台](https://console.aws.amazon.com/bedrock/)中创建 Guardrail，发布一个版本，然后将 Guardrail 标头添加到您的[设置文件](/docs/zh-CN/settings)。如果您使用跨区域推理配置文件，请在您的 Guardrail 上启用跨区域推理。

示例配置：

```json theme={null}
{
  "env": {
    "ANTHROPIC_CUSTOM_HEADERS": "X-Amzn-Bedrock-GuardrailIdentifier: your-guardrail-id\nX-Amzn-Bedrock-GuardrailVersion: 1"
  }
}
```

<h2 id="use-the-mantle-endpoint">
  使用 Mantle 端点
</h2>

Mantle 是一个 Amazon Bedrock 端点，通过原生 Anthropic API 形状而不是 Amazon Bedrock Invoke API 提供 Claude 模型。它使用相同的 AWS 凭证、IAM 权限和本页面前面描述的 `awsAuthRefresh` 配置。

<h3 id="enable-mantle">
  启用 Mantle
</h3>

配置了 AWS 凭证后，设置 `CLAUDE_CODE_USE_MANTLE` 以将请求路由到 Mantle 端点：

```bash theme={null}
export CLAUDE_CODE_USE_MANTLE=1
export AWS_REGION=us-east-1
```

Claude Code 从 AWS 区域构造端点 URL。从 v2.1.172 开始，区域的解析优先级与[上面的 Amazon Bedrock](#3-configure-claude-code) 相同；较早的版本仅使用 `AWS_REGION`。要为自定义端点或网关覆盖 URL，请设置 `ANTHROPIC_BEDROCK_MANTLE_BASE_URL`。

在 Claude Code 内运行 `/status` 来确认。当 Mantle 处于活动状态时，提供者行显示 `Amazon Bedrock (Mantle)`。

<h3 id="select-a-mantle-model">
  选择 Mantle 模型
</h3>

Mantle 使用以 `anthropic.` 为前缀且没有版本后缀的模型 ID，例如 `anthropic.claude-sonnet-5` 或 `anthropic.claude-haiku-4-5`。您的账户可用的模型取决于您的组织被授予的内容；其他模型 ID 列在您来自 AWS 的入职材料中。联系您的 AWS 账户团队以请求访问允许列表中的模型。

使用 `--model` 标志或在 Claude Code 内使用 `/model` 设置模型：

```bash theme={null}
claude --model anthropic.claude-haiku-4-5
```

<h3 id="run-mantle-alongside-the-invoke-api">
  在 Invoke API 旁边运行 Mantle
</h3>

您在 Mantle 上可用的模型可能不包括您今天使用的每个模型。设置 `CLAUDE_CODE_USE_BEDROCK` 和 `CLAUDE_CODE_USE_MANTLE` 让 Claude Code 从同一会话调用两个端点。与 Mantle 格式匹配的模型 ID 被路由到 Mantle，所有其他模型 ID 转到 Amazon Bedrock Invoke API。

```bash theme={null}
export CLAUDE_CODE_USE_BEDROCK=1
export CLAUDE_CODE_USE_MANTLE=1
```

要在 `/model` 选择器中显示 Mantle 模型，请在您的[设置文件](/docs/zh-CN/settings)中的 `availableModels` 中列出其 ID。此设置也将选择器限制为列出的条目。列出 `anthropic.claude-haiku-4-5` 会从选择器中移除裸 `haiku` 别名，因此也要列出版本前缀或您想保持可选择的版本的完整 ID。Mantle ID 和 `haiku` 别名解析为相同的模型族，因此合并仅保留更具体的条目。请参阅[合并行为](/docs/zh-CN/model-config#merge-behavior)：

```json theme={null}
{
  "availableModels": ["opus", "sonnet", "claude-haiku-4-5", "anthropic.claude-haiku-4-5"]
}
```

带有 `anthropic.` 前缀的条目被添加为自定义选择器选项并路由到 Mantle。将 `anthropic.claude-haiku-4-5` 替换为您的账户被授予的模型 ID。请参阅[限制模型选择](/docs/zh-CN/model-config#restrict-model-selection)了解 `availableModels` 如何与其他模型设置交互。

当两个提供商都处于活动状态时，`/status` 显示 `Amazon Bedrock + Amazon Bedrock (Mantle)`。

<h3 id="route-mantle-through-a-gateway">
  通过网关路由 Mantle
</h3>

如果您的组织通过集中式 [LLM 网关](/docs/zh-CN/llm-gateway)路由模型流量，该网关在服务器端注入 AWS 凭证，请禁用客户端身份验证，以便 Claude Code 发送没有 SigV4 签名或 `x-api-key` 标头的请求：

```bash theme={null}
export CLAUDE_CODE_USE_MANTLE=1
export CLAUDE_CODE_SKIP_MANTLE_AUTH=1
export ANTHROPIC_BEDROCK_MANTLE_BASE_URL=https://your-gateway.example.com
```

<h3 id="mantle-environment-variables">
  Mantle 环境变量
</h3>

这些变量特定于 Mantle 端点。请参阅[环境变量](/docs/zh-CN/env-vars)了解完整列表。

| 变量                                      | 目的                                        |
| :-------------------------------------- | :---------------------------------------- |
| `CLAUDE_CODE_USE_MANTLE`                | 启用 Mantle 端点。设置为 `1` 或 `true`。            |
| `ANTHROPIC_BEDROCK_MANTLE_BASE_URL`     | 覆盖默认 Mantle 端点 URL                        |
| `CLAUDE_CODE_SKIP_MANTLE_AUTH`          | 跳过客户端身份验证以用于代理设置                          |
| `ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION` | 覆盖 Haiku 类模型的 AWS 区域（与 Amazon Bedrock 共享） |

<h2 id="troubleshooting">
  故障排除
</h2>

<h3 id="authentication-loop-with-sso-and-corporate-proxies">
  使用 SSO 和企业代理的身份验证循环
</h3>

如果在使用 AWS SSO 时浏览器标签页反复生成，请从您的[设置文件](/docs/zh-CN/settings)中删除 `awsAuthRefresh` 设置。这可能发生在企业 VPN 或 TLS 检查代理中断 SSO 浏览器流时。Claude Code 将中断的连接视为身份验证失败，重新运行 `awsAuthRefresh`，并无限循环。

如果您的网络环境干扰自动基于浏览器的 SSO 流，请在启动 Claude Code 之前手动使用 `aws sso login`，而不是依赖 `awsAuthRefresh`。

<h3 id="region-issues">
  区域问题
</h3>

如果您遇到区域问题：

* 检查模型可用性：`aws bedrock list-inference-profiles --region your-region`
* 切换到支持的区域：`export AWS_REGION=us-east-1`
* 考虑使用推理配置文件进行跨区域访问

如果您收到错误"不支持按需吞吐量"：

* 将模型指定为[推理配置文件](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html) ID

Claude Code 使用 Amazon Bedrock [Invoke API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModelWithResponseStream.html)，不支持 Converse API。

<h3 id="streaming-errors-behind-a-gateway-or-proxy">
  网关或代理后的流式传输错误
</h3>

如果流式传输请求失败，错误以 `Bedrock streaming response has content-type` 开头，则 Claude Code 和 Amazon Bedrock 之间的网关或代理正在转换流式传输响应。Amazon Bedrock 以二进制事件流格式流式传输响应，内容类型为 `application/vnd.amazon.eventstream`，Claude Code 拒绝报告不同内容类型的成功流式传输响应，而不是解码它无法读取的正文。该错误命名了它收到的内容类型，通常是来自 Amazon API Gateway 和 Lambda 集成的 `text/event-stream`，该集成将流重新发出为服务器发送的事件。

在 v2.1.208 之前，相同的配置错误在整个响应被缓冲后显示为 `API Error: Truncated event message received`。

要修复它，请配置网关以通过未修改的 `InvokeModelWithResponseStream` 响应正文及其 `Content-Type` 标头。如果网关仅重写标头并通过完整的二进制正文，请设置 [`CLAUDE_CODE_DISABLE_BEDROCK_CONTENT_TYPE_GUARD=1`](/docs/zh-CN/env-vars) 以跳过检查，直到网关被修复。关闭检查后，被转换的响应正文再次失败，显示 `Truncated event message received`。

<h3 id="zero-token-counts-in-/context">
  /context 中的零令牌计数
</h3>

`/context` 命令通过将工具架构发送到 Amazon Bedrock count-tokens API 来计算每个工具组的令牌。在 Claude Code v2.1.196 之前的版本中，Amazon Bedrock 拒绝了该请求，因为架构包含其 count-tokens API 不接受的字段，因此每个工具组显示 0 个令牌。分解中的其他行（如消息和内存文件）不受影响。

更新到 v2.1.196 或更高版本。

<h3 id="mantle-endpoint-errors">
  Mantle 端点错误
</h3>

如果在设置 `CLAUDE_CODE_USE_MANTLE` 后 `/status` 没有显示 `Amazon Bedrock (Mantle)`，则该变量没有到达进程。确认它在您启动 `claude` 的 shell 中被导出，或在您的[设置文件](/docs/zh-CN/settings)的 `env` 块中设置它。

来自 Mantle 端点的 `403`（具有有效凭证）意味着您的 AWS 账户没有被授予访问您请求的模型的权限。联系您的 AWS 账户团队以请求访问。

命名模型 ID 的 `400` 意味着该模型不在 Mantle 上提供。Mantle 有其自己的模型阵容，与标准 Amazon Bedrock 目录分开，因此推理配置文件 ID（如 `us.anthropic.claude-sonnet-4-6`）将不起作用。使用 Mantle 格式的 ID，或启用[两个端点](#run-mantle-alongside-the-invoke-api)，以便 Claude Code 将每个请求路由到模型可用的端点。

<h2 id="additional-resources">
  其他资源
</h2>

* [Amazon Bedrock 文档](https://docs.aws.amazon.com/bedrock/)
* [Amazon Bedrock 定价](https://aws.amazon.com/bedrock/pricing/)
* [Amazon Bedrock 推理配置文件](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html)
* [Amazon Bedrock 令牌消耗和配额](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html)
* [Amazon Bedrock 上的 Claude Code：快速设置指南](https://community.aws/content/2tXkZKrZzlrlu0KfH8gST5Dkppq/claude-code-on-amazon-bedrock-quick-setup-guide)
* [Claude Code 监控实现 (Amazon Bedrock)](https://github.com/aws-solutions-library-samples/guidance-for-claude-code-with-amazon-bedrock/blob/main/assets/docs/MONITORING.md)
