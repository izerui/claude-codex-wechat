> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 零数据保留

> 了解 Claude for Enterprise 上 Claude Code 的零数据保留 (ZDR)，包括范围、禁用功能以及如何请求启用。

零数据保留 (ZDR) 在通过 Claude for Enterprise 使用 Claude Code 时可用。启用 ZDR 后，Claude Code 会话期间生成的提示和模型响应会实时处理，在返回响应后不会由 Anthropic 存储，除非需要遵守法律或防止滥用。

<Note>
  ZDR 不包含在标准 Claude for Enterprise 计划中，也无法从您的管理员设置中启用。它仅适用于符合条件的账户，需要由 Anthropic 单独启用。如果您的组织需要 ZDR，请[联系销售](https://www.anthropic.com/contact-sales?utm_source=claude_code\&utm_medium=docs\&utm_content=zero_data_retention_request)或您的 Anthropic 账户团队以确认资格。
</Note>

Claude for Enterprise 上的 ZDR 为企业客户提供了使用 Claude Code 并实现零数据保留的能力，同时可以访问管理功能：

* 按用户的成本控制
* [分析](/docs/zh-CN/analytics)仪表板
* [服务器管理的设置](/docs/zh-CN/server-managed-settings)
* 审计日志

Claude for Enterprise 上 Claude Code 的 ZDR 仅适用于 Anthropic 的直接平台。对于在 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上的 Claude 部署，请参考这些平台的数据保留政策。

<h2 id="zdr-scope">
  ZDR 范围
</h2>

ZDR 涵盖 Claude for Enterprise 上的 Claude Code 推理。

<Warning>
  ZDR 在每个组织的基础上启用。每个新组织都需要由您的 Anthropic 账户团队单独启用 ZDR。ZDR 不会自动应用于在同一账户下创建的新组织。请联系您的账户团队为任何新组织启用 ZDR。
</Warning>

<h3 id="what-zdr-covers">
  ZDR 涵盖的内容
</h3>

ZDR 涵盖通过 Claude for Enterprise 上的 Claude Code 进行的模型推理调用。当您在终端中使用 Claude Code 时，您发送的提示和 Claude 生成的响应不会由 Anthropic 保留。这适用于 ZDR 组织可用的每个模型。某些模型需要数据保留，在 ZDR 下不可用；请参阅 [ZDR 下的模型可用性](#model-availability-under-zdr)。

<h3 id="what-zdr-does-not-cover">
  ZDR 不涵盖的内容
</h3>

ZDR 不适用于以下内容，即使对于启用了 ZDR 的组织也是如此。这些功能遵循[标准数据保留政策](/docs/zh-CN/data-usage#data-retention)：

| 功能             | 详情                                                                                    |
| -------------- | ------------------------------------------------------------------------------------- |
| claude.ai 上的聊天 | 通过 Claude for Enterprise 网络界面的聊天对话不受 ZDR 保护。                                          |
| Cowork         | Cowork 会话不受 ZDR 保护。                                                                   |
| Claude Code 分析 | 不存储提示或模型响应，但收集生产力元数据，如账户电子邮件和使用统计。对于 ZDR 组织，贡献指标不可用；[分析仪表板](/docs/zh-CN/analytics)仅显示使用指标。 |
| 用户和席位管理        | 管理数据，如账户电子邮件和席位分配，根据标准政策保留。                                                           |
| 第三方集成          | 由第三方工具、MCP servers 或其他外部集成处理的数据不受 ZDR 保护。请独立审查这些服务的数据处理实践。                            |

<h2 id="features-disabled-under-zdr">
  ZDR 下禁用的功能
</h2>

当为 Claude for Enterprise 上的 Claude Code 组织启用 ZDR 时，某些需要存储提示或完成的功能会在后端级别自动禁用：

| 功能                                                 | 原因                                |
| -------------------------------------------------- | --------------------------------- |
| [网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)  | 需要服务器端存储对话历史。                     |
| 来自 Desktop 应用的[云会话](/docs/zh-CN/desktop#cloud-sessions) | 需要包含提示和完成的持久会话数据。                 |
| [Artifacts](/docs/zh-CN/artifacts)                      | 需要在 Anthropic 运营的基础设施上存储已发布的页面内容。 |
| 反馈提交 (`/feedback`)                                 | 提交反馈会将对话数据发送给 Anthropic。          |
| [Remote Control](/docs/zh-CN/remote-control)            | 在 Anthropic 服务器上存储会话记录以跨设备同步对话。   |

这些功能在后端被阻止，无论客户端显示如何。如果您在启动期间在 Claude Code 终端中看到禁用的功能，尝试使用它会返回一个错误，指示组织的政策不允许该操作。

如果未来的功能需要存储提示或完成，它们也可能被禁用。

<h3 id="model-availability-under-zdr">
  ZDR 下的模型可用性
</h3>

Claude Fable 5 不适用于启用了零数据保留的组织。此模型类别[需要数据保留](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention#model-specific-data-retention-requirements)，因此来自 ZDR 组织的请求无法由其提供。该模型在 ZDR 组织的 `/model` 选择器中要么不存在，要么显示为禁用，并附带需要禁用 ZDR 的通知，服务器无论客户端配置如何都会拒绝对其的请求。

其他模型在 ZDR 下仍然可用。Fable 5 不是默认模型，`best` 别名在可用的地方解析为 Fable 5，在不可用的地方（包括 ZDR 组织）解析为 Opus。

<h2 id="data-retention-for-policy-violations">
  政策违规的数据保留
</h2>

即使启用了 ZDR，Anthropic 也可能在法律要求或解决使用政策违规时保留数据。如果会话因政策违规而被标记，Anthropic 可能会保留相关的输入和输出长达 2 年，与 Anthropic 的标准 ZDR 政策一致。

<h2 id="request-zdr">
  请求 ZDR
</h2>

要为 Claude for Enterprise 上的 Claude Code 请求 ZDR，请[联系销售](https://www.anthropic.com/contact-sales?utm_source=claude_code\&utm_medium=docs\&utm_content=zero_data_retention_request)或您的 Anthropic 账户团队。您的账户团队将在内部提交请求，Anthropic 将在确认符合条件后在您的组织上审查并启用 ZDR。所有启用操作都会被审计记录。

如果您当前通过按使用量付费的 API 密钥使用 Claude Code 的 ZDR，您可以过渡到 Claude for Enterprise 以获得对管理功能的访问权限，同时为 Claude Code 保持 ZDR。请联系您的账户团队以协调迁移。
