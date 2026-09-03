> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用顾问工具升级困难决策

> 将您的主模型与更强大的顾问模型配对，Claude 在任务期间的关键时刻咨询该模型。

<Note>
  顾问工具是实验性的，需要 Anthropic API。它在 Amazon Bedrock、Claude Platform on AWS、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上不可用。行为、定价和可用性可能会改变。
</Note>

顾问工具让 Claude 在任务期间的关键时刻咨询第二个通常更强大的模型，例如在提交方法之前、陷入重复错误时或在声明任务完成之前。顾问接收完整的对话，包括每个工具调用和结果，并返回 Claude 在继续之前应用的指导。

顾问在 Anthropic 基础设施上作为[服务器工具](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool)运行，可供订阅和 API 计费账户使用。您选择哪个模型充当顾问，Claude 决定何时调用它。

本页介绍如何启用顾问、接受哪些模型配对、Claude 在咨询期间显示什么，以及顾问使用如何计费。

<h2 id="when-to-use-the-advisor">
  何时使用顾问
</h2>

顾问适合长期、多步骤的任务，其中大多数轮次是常规的，但计划质量决定了结果。示例包括大型重构、错误不断重复的调试会话，以及您希望在 Claude 声明完成之前独立检查的任务。

在短任务上（几乎没有计划的地方）或需要每一轮都使用最强模型的工作上，它的价值较少。对于这些情况，[切换主模型](/docs/zh-CN/model-config#setting-your-model)，或查看[顾问与 opusplan 和子代理的比较](#compare-with-related-features)以获取其他获取第二意见的方式。

<h2 id="enable-the-advisor">
  启用顾问
</h2>

您可以通过三种方式设置顾问模型：

* **`/advisor` 命令**：在会话中途设置或更改顾问，并将其保存为默认值
* **`advisorModel` 设置**：在您的[设置文件](/docs/zh-CN/settings)中配置持久默认值
* **`--advisor` 标志**：在启动时为单个会话设置顾问

如果其中任何一个设置了顾问模型，则对于主模型[支持它](#choose-an-advisor-model)的会话，顾问是启用的。要停止使用它，请参阅[关闭顾问](#turn-the-advisor-off)。

<Note>
  要使用 Fable 5 作为顾问，您需要 Claude Code v2.1.170 或更高版本以及您的组织的 [Fable 5 访问权限](/docs/zh-CN/model-config#work-with-fable-5)。
</Note>

<h3 id="use-the-/advisor-command">
  使用 `/advisor` 命令
</h3>

运行不带参数的 `/advisor` 以打开列出可用顾问模型的选择器，或直接传递模型：

```
/advisor opus
```

您的选择被保存到用户设置中的 `advisorModel`，并在会话之间持久化。如果您的组织的 [`availableModels`](/docs/zh-CN/model-config#restrict-model-selection) 允许列表排除了保存的顾问模型，则在您使用 `/advisor` 选择允许的模型之前，顾问不会被调用。如果您当前的主模型不支持顾问，选择仍然被保存，并在您使用 [`/model`](/docs/zh-CN/model-config#setting-your-model) 切换到[兼容的主模型](#choose-an-advisor-model)时激活。

<h3 id="set-advisormodel-in-settings">
  在设置中设置 `advisorModel`
</h3>

要在不打开会话的情况下将顾问配置为默认值，请在设置文件中设置它：

```json theme={null}
{
  "advisorModel": "opus"
}
```

<h3 id="use-the-advisor-flag">
  使用 `--advisor` 标志
</h3>

要为单个会话设置顾问而不更改保存的设置，请使用该标志启动：

```bash theme={null}
claude --advisor opus
```

该标志在该会话中优先于 `advisorModel` 设置。如果会话的主模型不支持顾问，或者请求的顾问模型被您的组织的 [`availableModels`](/docs/zh-CN/model-config#restrict-model-selection) 允许列表排除，它会以错误退出。

<h2 id="choose-an-advisor-model">
  选择顾问模型
</h2>

顾问的能力必须至少与主模型相同。每个主模型接受的顾问是：

| 主模型                 | 接受的顾问                   | 注释                                                                                    |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| Haiku 4.5           | Fable、Opus、Sonnet       | Haiku 可以调用顾问但不能充当顾问                                                                   |
| Sonnet 4.6          | Fable、Opus、Sonnet       |                                                                                       |
| Sonnet 5            | Fable、Opus、Sonnet 5     | Sonnet 4.6 顾问被拒绝                                                                      |
| Opus 4.6            | Fable、Opus、Sonnet 5     | Sonnet 5 和 Opus 4.6 的能力排名相同，因此 Opus 4.6 主模型接受 Sonnet 5 顾问                             |
| Opus 4.7 或更高版本      | Fable、Opus 4.7、Opus 4.8 | Opus 4.7 和 Opus 4.8 的能力排名相同，因此任一个都可以接受另一个作为顾问。Opus 4.7 主模型与 Opus 4.6 或 Sonnet 5 顾问被拒绝 |
| Fable 5 (v2.1.170+) | Fable                   | Opus 或 Sonnet 顾问被拒绝                                                                   |

Fable 5 需要 Claude Code v2.1.170 或更高版本以及 Fable 5 访问权限，无论它是充当主模型还是顾问。

将顾问设置为 `opus`、`sonnet` 或 `fable`。这些别名解析为每个模型的最新版本。您也可以传递完整的模型 ID，例如 `claude-opus-4-8`。

子代理继承配置的顾问，并对其自己的模型应用相同的配对检查。

Claude Code 在发送请求之前验证配对：

* 如果顾问的能力低于主模型，顾问不会附加到主模型的请求中。`/advisor` 命令输出和通知会显示这一点。其自己的模型满足配对的子代理仍然可以使用顾问。
* 如果主模型或顾问是 Claude Code 无法识别的模型，顾问不会附加。

<h3 id="common-model-pairings">
  常见模型配对
</h3>

任何接受的配对都有效。这些组合以不同的方式平衡成本和能力：

| 配对                     | 何时使用                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Sonnet 主模型 + Opus 顾问   | Sonnet 处理常规工作，并将规划、模糊失败和完成检查升级到 Opus                                                |
| Sonnet 主模型 + Fable 顾问  | Fable 5 在决策点的指导，无需全程运行 Fable 5。需要 v2.1.170 或更高版本以及 Fable 5 访问权限                     |
| Haiku 主模型 + Opus 顾问    | 最低成本的主模型具有强大的规划能力。预期成本高于仅 Haiku，但低于将主模型切换到 Sonnet 或 Opus                            |
| Opus 主模型 + Opus 顾问     | 第二个 Opus 审查第一个。对于高风险任务很有用，其中独立检查比成本更重要                                              |
| Fable 主模型 + Fable 顾问   | 当 Fable 5 可用时的最高能力配对 (v2.1.170+)。Fable 是比 Opus 和 Sonnet 更高的层级，因此它是 Fable 主模型唯一接受的顾问 |
| Sonnet 主模型 + Sonnet 顾问 | 用于捕捉常规疏忽的低成本第二意见                                                                    |

<h2 id="when-claude-consults-the-advisor">
  Claude 何时咨询顾问
</h2>

Claude 决定何时调用顾问。它倾向于在提交方法之前、错误不断重复时以及在声明任务完成之前咨询，但时间是由模型驱动的，而不是基于规则的。

您可以在提示中要求咨询，就像您会请求任何工具一样，例如 `consult the advisor before you continue`。没有设置来限制或强制顾问调用；如果您希望 Claude 在任务期间更频繁或更少地咨询顾问，请在您的说明中说明。

<h2 id="what-you-see-during-a-session">
  会话期间您看到的内容
</h2>

当 Claude 调用顾问时，成绩单显示一条 `Advising` 行，其中包含顾问模型名称，同时调用正在进行中。当结果返回时，该行确认顾问已审查对话。按 `Ctrl+O` 展开它并阅读顾问的完整指导。

Claude 通常遵循顾问的指导，但在其自己的证据与特定声明相矛盾时进行调整：如果推荐的步骤在尝试时失败，或文件内容与建议相矛盾，Claude 会显示冲突而不是无条件地遵循指导。

顾问始终接收完整的对话，Claude 控制时间。为了获得更多控制或不同的配置，请参阅[顾问与子代理和 opusplan 的比较](#compare-with-related-features)。

<h2 id="cost">
  成本
</h2>

每个顾问调用都会将对话发送到顾问模型，因此除了主模型的使用外，它还会以顾问模型的费率消耗令牌。使用 API 计费，顾问令牌按顾问模型的输入和输出费率计费。在订阅计划上，顾问使用计入您的计划使用限制。

Claude 在决策点而不是每一轮都调用顾问，因此将更快的主模型与更强的顾问配对通常比全程运行更强的模型成本更低。顾问使用计入由 [`/usage`](/docs/zh-CN/costs#track-your-costs) 显示的会话总计。

有关顾问令牌如何在 API 响应中报告的信息，请参阅 Claude API 文档中的[使用和计费](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool#usage-and-billing)。

<h2 id="impact-on-prompt-caching">
  对提示缓存的影响
</h2>

在会话中途启用或禁用顾问不会使主模型的[提示缓存](/docs/zh-CN/prompt-caching)失效。与[更改模型或努力级别](/docs/zh-CN/prompt-caching#actions-that-invalidate-the-cache)不同，切换 `/advisor` 会保持缓存的前缀完整，顾问返回的指导在后续轮次中作为成绩单的一部分被缓存。

顾问模型自己对对话的读取不被缓存。每个顾问调用都会重新处理完整的成绩单，调用之间没有重用。

<h2 id="requirements">
  要求
</h2>

顾问工具需要以下所有条件：

* **仅 Anthropic API**：顾问是服务器执行的工具。它在 Amazon Bedrock、Claude Platform on AWS、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上不可用。通过配置了 `ANTHROPIC_BASE_URL` 的 [LLM 网关](/docs/zh-CN/llm-gateway)，可用性取决于网关是否将请求完整转发到 Anthropic API。
* **支持的主模型**：Opus 4.6 或更高版本、Sonnet 4.6 或更高版本，或 Haiku 4.5。Fable 5 在 Claude Code v2.1.170 或更高版本上也符合条件。

<h2 id="turn-the-advisor-off">
  关闭顾问
</h2>

要停止使用顾问并清除保存的 `advisorModel`，运行 `/advisor off` 或在 `/advisor` 选择器中选择 **No advisor**：

```
/advisor off
```

要完全禁用顾问工具，设置 `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1`。`/advisor` 命令变为不可用，任何配置的 `advisorModel` 都会被忽略。`--advisor` 标志被接受但没有效果；传递它的现有脚本继续工作而不会出现错误。请参阅[环境变量](/docs/zh-CN/env-vars)。

<h2 id="compare-with-related-features">
  与相关功能比较
</h2>

顾问是结合模型优势的几种方式之一。根据您希望何时涉及第二个模型来选择。

| 方法                                                       | 更强的模型何时运行                                                                                       | 如何启动              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| 顾问工具                                                     | 在任务中途的决策点                                                                                       | Claude 在需要指导时调用它  |
| [`opusplan`](/docs/zh-CN/model-config#opusplan-model-setting) | 在计划模式期间当[由 `availableModels` 允许](/docs/zh-CN/model-config#restrict-model-selection)时，然后切换到 Sonnet 执行 | 您进入计划模式           |
| [子代理](/docs/zh-CN/sub-agents#choose-a-model)，设置了 `model`      | 对于整个委派的子任务                                                                                      | Claude 委派，或您调用子代理 |
| [`/model`](/docs/zh-CN/model-config#setting-your-model)       | 对于所有后续轮次                                                                                        | 您切换模型             |

<h2 id="see-also">
  另请参阅
</h2>

* [模型配置](/docs/zh-CN/model-config)：切换模型、设置努力级别并使用 `opusplan`
* [有效管理成本](/docs/zh-CN/costs)：跨模型跟踪令牌使用情况
* [Claude API 中的顾问工具](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool)：了解底层服务器工具，或直接从 Messages API 使用它
* [顾问策略](https://claude.com/blog/the-advisor-strategy)：为什么将快速主模型与更强的顾问配对有效
