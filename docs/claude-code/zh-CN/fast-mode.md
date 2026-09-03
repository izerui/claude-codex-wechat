> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用快速模式加快响应速度

> 通过切换快速模式在 Claude Code 中获得更快的 Opus 响应。

<Note>
  快速模式处于[研究预览](#research-preview)阶段。该功能、定价和可用性可能会根据反馈而改变。
</Note>

快速模式是 Claude Opus 的高速配置，使模型速度提高最多 2.5 倍，但每个令牌的成本更高。当您需要速度进行交互式工作（如快速迭代或实时调试）时，使用 `/fast` 将其打开，当成本比延迟更重要时，将其关闭。

快速模式不是一个不同的模型。它使用 Claude Opus，但采用不同的 API 配置，优先考虑速度而不是成本效率。您获得相同的质量和功能，只是响应速度更快。快速模式在 Opus 4.8 和 Opus 4.7 上受支持。它在 Sonnet、Haiku 或其他模型上不可用。

<Warning>
  Opus 4.7 的快速模式自 2026 年 6 月 25 日起已弃用，将在 2026 年 7 月 24 日移除。移除后，Opus 4.7 上的快速模式请求将返回错误，不会回退到标准 Opus 4.7。迁移到 Opus 4.8 以保持加速。
</Warning>

需要了解的内容：

* 使用 `/fast` 在 Claude Code CLI 中切换快速模式。Claude Code VS Code 扩展中不支持快速模式。
* 快速模式定价在 Opus 4.8 上为 $10/$50 MTok，在 Opus 4.7 上为 $30/$150 MTok。
* 可供订阅计划（Pro/Max/Team/Enterprise）上的所有 Claude Code 用户和 Claude 控制台使用。
* 对于订阅计划（Pro/Max/Team/Enterprise）上的 Claude Code 用户，快速模式仅通过使用额度提供，不包含在订阅速率限制中。

<h2 id="toggle-fast-mode">
  切换快速模式
</h2>

通过以下任一方式切换快速模式：

* 输入 `/fast` 并按 Tab 键打开或关闭
* 在您的[用户设置文件](/docs/zh-CN/settings)中设置 `"fastMode": true`

默认情况下，在交互式会话中打开的快速模式在会话之间保持。在[非交互式模式](/docs/zh-CN/headless)中，使用 `-p` 标志，`/fast` 仅在使用快速模式在其 [`--settings`](/docs/zh-CN/cli-reference#cli-flags) 值中启动的会话中工作，例如 `claude -p --settings '{"fastMode": true}'`；切换然后仅适用于该会话，不会保存为您的默认值，在任何其他非交互式会话中，该命令报告快速模式不可用。您可以配置快速模式在每个会话时重置。有关详细信息，请参阅[要求每个会话选择加入](#require-per-session-opt-in)。

为了获得最佳成本效率，在会话开始时启用快速模式，而不是在对话中途切换。有关详细信息，请参阅[了解成本权衡](#understand-the-cost-tradeoff)。

启用快速模式时：

* 如果您使用的是不同的模型，Claude Code 会自动切换到 Opus
* 您将看到确认消息："Fast mode ON"
* 快速模式处于活动状态时，提示旁边会出现一个小的 `↯` 图标
* 随时再次运行 `/fast` 以检查快速模式是否打开或关闭

当您再次使用 `/fast` 禁用快速模式时，您仍然保持在 Opus 上。模型不会恢复到您之前的模型。要切换到不同的模型，请使用 `/model`。

切换到不支持快速模式的模型会关闭快速模式。切换回支持的 Opus 模型时，当您保存的快速模式偏好设置为打开时，它会再次打开，这与新会话默认启动的偏好设置相同。配置了[每个会话选择加入](#require-per-session-opt-in)后，切换回不会再次打开快速模式；运行 `/fast` 以重新启用它。快速模式永远不会为保存的偏好设置为关闭的会话打开，`↯` 图标和 `Fast mode ON` 确认在激活时出现。在 v2.1.208 之前，快速模式在您切换回后保持关闭，直到您再次运行 `/fast`。

Opus 4.8 是 Claude Code v2.1.154 及更高版本中的快速模式默认值。在 v2.1.142 到 v2.1.153 版本中，快速模式默认为 Opus 4.7。

<h2 id="understand-the-cost-tradeoff">
  了解成本权衡
</h2>

快速模式的每个令牌定价高于标准 Opus，乘数因模型而异：

| 模型       | 输入 (MTok) | 输出 (MTok) |
| -------- | --------- | --------- |
| Opus 4.8 | \$10      | \$50      |
| Opus 4.7 | \$30      | \$150     |

快速模式定价在整个 1M 令牌上下文窗口中是固定的。有关要比较的标准 Opus 费率，请参阅 [Claude 定价参考](https://platform.claude.com/docs/zh-CN/about-claude/pricing)。

在对话中首次启用快速模式时，您需要为整个对话上下文支付完整的快速模式未缓存输入令牌价格。对话进行得越深入，成本就越高，因此从一开始就启用快速模式更便宜。该成本每个对话只应用一次，因此稍后关闭快速模式再打开不会重复收费。有关机制，请参阅 [快速模式如何与提示缓存交互](/docs/zh-CN/prompt-caching#turning-on-fast-mode)。

<h2 id="decide-when-to-use-fast-mode">
  决定何时使用快速模式
</h2>

快速模式最适合响应延迟比成本更重要的交互式工作：

* 快速迭代代码更改
* 实时调试会话
* 时间敏感的工作，有紧迫的截止日期

标准模式更适合：

* 速度不那么重要的长期自主任务
* 批处理或 CI/CD 管道
* 成本敏感的工作负载

<h3 id="fast-mode-vs-effort-level">
  快速模式与努力级别
</h3>

快速模式和努力级别都会影响响应速度，但方式不同：

| 设置          | 效果                         |
| ----------- | -------------------------- |
| **快速模式**    | 相同的模型质量，更低的延迟，更高的成本        |
| **较低的努力级别** | 更少的思考时间，更快的响应，在复杂任务上可能质量较低 |

您可以结合两者：在直接任务上使用快速模式和较低的[努力级别](/docs/zh-CN/model-config#adjust-effort-level)以获得最大速度。

<h2 id="requirements">
  要求
</h2>

快速模式需要以下所有条件：

* **仅限 Anthropic API 或订阅**：快速模式可通过 Anthropic 控制台 API 和使用使用额度的 Claude 订阅计划获得。它在 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 或 AWS 上的 Claude Platform 上不可用。
* **启用使用额度**：您的账户必须启用使用额度，这允许在您的计划包含的使用量之外进行计费。对于个人账户，在您的[控制台计费设置](https://platform.claude.com/settings/billing)中启用此功能。对于团队和企业，管理员必须为组织启用使用额度。

<Note>
  快速模式使用直接计入使用额度，即使您的计划上还有剩余使用量。这意味着快速模式令牌不计入您的计划包含的使用量，并从第一个令牌开始按快速模式费率收费。
</Note>

* **团队和企业的所有者启用**：快速模式默认对团队和企业组织禁用。所有者必须明确[启用快速模式](#enable-fast-mode-for-your-organization)，用户才能访问它。

<Note>
  如果您的组织尚未启用快速模式，`/fast` 命令将显示"Fast mode has been disabled by your organization."。如果您的组织的 [`availableModels`](/docs/zh-CN/model-config#restrict-model-selection) 允许列表排除了快速模式 Opus 模型，`/fast` 将被拒绝，显示"is not in your organization's allowed models"。例外情况是已在支持快速模式的允许 Opus 模型上运行的会话：`/fast` 随后在您当前的模型上启用快速模式，而不是切换模型。
</Note>

<h3 id="enable-fast-mode-for-your-organization">
  为您的组织启用快速模式
</h3>

您启用快速模式的位置取决于您的组织使用的产品：

* **控制台**（API 客户）：管理员在 [Claude Code 偏好设置](https://platform.claude.com/claude-code/preferences)中启用它
* **Claude AI**（团队和企业）：所有者在[管理员设置 > Claude Code](https://claude.ai/admin-settings/claude-code)中启用它

另一个完全禁用快速模式的选项是设置 `CLAUDE_CODE_DISABLE_FAST_MODE=1`。请参阅[环境变量](/docs/zh-CN/env-vars)。

<h3 id="require-per-session-opt-in">
  要求每个会话选择加入
</h3>

默认情况下，快速模式在会话之间保持：如果用户启用快速模式，它会在未来的会话中保持打开。要更改此行为，在任何[设置文件](/docs/zh-CN/settings#settings-files)中将 `fastModePerSessionOptIn` 设置为 `true`，这会导致每个会话以快速模式关闭开始，并要求用户使用 `/fast` 明确启用它。[团队](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=fast_mode_teams#team-&-enterprise)或[企业](https://anthropic.com/contact-sales?utm_source=claude_code\&utm_medium=docs\&utm_content=fast_mode_enterprise)计划上的所有者可以通过[服务器托管设置](/docs/zh-CN/server-managed-settings)在组织范围内部署它。

```json theme={null}
{
  "fastModePerSessionOptIn": true
}
```

这对于在用户运行多个并发会话的组织中控制成本很有用。用户在需要速度时仍然可以使用 `/fast` 启用快速模式，但它会在每个新会话开始时重置。用户的快速模式偏好仍然被保存，因此删除此设置会恢复默认的持久行为。

<h2 id="handle-rate-limits">
  处理速率限制
</h2>

快速模式与标准 Opus 有单独的速率限制。Opus 4.8 和 Opus 4.7 的快速模式共享相同的速率限制池：任一模型上的使用都会从相同的限制中扣除。当您达到快速模式速率限制或用完使用额度时：

1. 快速模式自动回退到标准速度
2. `↯` 图标变灰以指示冷却
3. 您继续以标准速度和定价工作
4. 冷却过期时，快速模式自动重新启用

要手动禁用快速模式而不是等待冷却，请再次运行 `/fast`。

<h2 id="research-preview">
  研究预览
</h2>

快速模式是一个研究预览功能。这意味着：

* 该功能可能会根据反馈而改变
* 可用性和定价可能会改变
* 底层 API 配置可能会演变

通过您通常的 Anthropic 支持渠道报告问题或反馈。

<h2 id="see-also">
  另请参阅
</h2>

* [模型配置](/docs/zh-CN/model-config)：切换模型并调整努力级别
* [有效管理成本](/docs/zh-CN/costs)：跟踪令牌使用情况并降低成本
* [状态行配置](/docs/zh-CN/statusline)：显示模型和上下文信息
