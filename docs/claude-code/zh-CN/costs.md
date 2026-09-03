> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 有效管理成本

> 跟踪令牌使用情况，设置团队支出限制，并通过上下文管理、模型选择、扩展思考设置和预处理 hooks 来降低 Claude Code 成本。

Claude Code 按 API 令牌消耗收费。有关订阅计划定价（Pro、Max、Team、Enterprise），请参阅 [claude.com/pricing](https://claude.com/pricing)。每个开发者的成本差异很大，取决于模型选择、代码库大小和使用模式，例如运行多个实例或自动化。

在企业部署中，平均成本约为每个开发者每个活跃日 $13，每个开发者每月 $150-250，90% 的用户每个活跃日成本保持在 \$30 以下。要估计您自己团队的支出，请从一个小的试点团体开始，并使用下面的跟踪工具建立基线，然后再进行更广泛的推出。

本页面介绍如何[跟踪成本](#track-your-costs)、[管理团队成本](#manage-costs-for-your-organization)和[减少令牌使用](#reduce-token-usage)。

<h2 id="track-your-costs">
  跟踪成本
</h2>

<h3 id="using-the-/usage-command">
  使用 `/usage` 命令
</h3>

<Note>
  `/usage` 中的 Session 块显示 API 令牌使用情况，适用于 API 用户。Claude Max 和 Pro 订阅者的使用情况包含在订阅中，因此会话成本数据与计费无关。订阅者在同一屏幕上看到计划使用条和活动统计以及使用情况明细。
</Note>

`/usage` 顶部的 Session 块显示当前会话的详细令牌使用统计。美元数字是从令牌计数本地计算的估计值，可能与您的实际账单不同。有关权威计费，请参阅 [Claude Console](https://platform.claude.com/usage) 中的使用情况页面。

```text theme={null}
Total cost:            $0.55
Total duration (API):  6m 19.7s
Total duration (wall): 6h 33m 10.2s
Total code changes:    0 lines added, 0 lines removed
```

在 Pro、Max、Team 或 Enterprise 计划上，`/usage` 还显示计入您的计划限制的内容明细。它将最近的使用情况归属于 skills、subagents、plugins 和各个 MCP 服务器，每个都显示为总数的百分比。按 `d` 或 `w` 在过去 24 小时和过去 7 天之间切换。这些数据是近似值，从此机器上的本地会话历史记录计算，因此不包括来自其他设备或 claude.ai 的使用情况。

当您的计划限制请求失败时（通常是因为使用情况端点受到速率限制），`/usage` 会显示它在过去 60 分钟内在此机器上加载的最后一个使用情况条，以及一个 `Showing last-known usage` 注释，说明该数据是多久前获取的。按 `r` 重试；成功重试会用新数据替换最后已知的条。如果没有过去 60 分钟内的快照，`/usage` 会报告使用情况端点受到速率限制，并提供相同的重试快捷方式。在 v2.1.208 之前，在尚未加载使用情况的会话中受速率限制的请求始终显示错误，没有条。

在 [VS Code 扩展](/docs/zh-CN/vs-code#check-account-and-usage) 中，相同的明细显示在"账户和使用情况"对话框中，带有"日"和"周"切换。需要 Claude Code v2.1.174 或更高版本。

<h3 id="set-a-spend-limit-on-pro-and-max">
  在 Pro 和 Max 上设置支出限制
</h3>

在 Pro 和 Max 计划上，`/usage-credits` 命令在 CLI 中打开一个对话框，您可以在其中管理 [使用额度](https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans)。从对话框中，您可以：

* 为您的账户启用使用额度
* 购买更多使用额度，可以是列出的套餐或自定义金额
* 设置、更改或移除您的每月支出限制
* 配置自动重新加载，当您的余额低于您设置的阈值时自动购买更多使用额度

在 Claude Code v2.1.207 之前的版本以及 CLI 内对话框不可用的账户上，`/usage-credits` 会在您的浏览器中打开使用额度计费页面。在 Team 和 Enterprise 计划上，具有计费访问权限的成员获得相同的浏览器页面，没有计费访问权限的成员从 CLI 发送请求，要求其管理员启用使用额度或提高限制。

更改每月支出限制需要账户的计费访问权限。如果您在仍有使用额度可用时达到该限制，Claude Code 会提示您提高或移除该限制，以便您可以继续使用而无需离开 CLI。

您输入到对话框中的金额，例如自定义购买金额、每月支出限制或自动重新加载阈值和目标，必须是数字，可选地后跟一个句号和一到两个小数位，例如 `20` 或 `20.50`。任何其他输入（包括逗号）都会显示内联错误，不会被保存。v2.1.207 之前的版本不显示对话框，而是打开计费页面。

Claude Code 要求您输入 `yes` 来确认每次购买和每次自动重新加载更改，无论金额多少，购买确认显示您批准的税后总额。更改每月支出限制仅在超过 \$1,000 或非美元计费货币的 1,000 个单位时要求相同的输入确认。在 v2.1.208 之前，购买和自动重新加载更改也使用该阈值，因此较小的金额通过标准对话框流程进行，没有额外的输入 `yes` 步骤。

金额字段打开时预填充建议值，您输入的第一个数字替换建议而不是追加到它。启用使用额度的屏幕打开时选中"取消"，因此启用它需要刻意选择而不是误按 Enter。两者都需要 Claude Code v2.1.208 或更高版本。

<h2 id="manage-costs-for-your-organization">
  管理组织的成本
</h2>

您对 Claude Code 的控制方式取决于您的组织如何访问 Claude Code：通过 Claude for Teams 或 Enterprise 计划、Claude Console 或云提供商。在 Teams 和 Enterprise 计划中，使用情况从每个成员的座位额度中扣除。在 Console 和云提供商上，使用情况按令牌计费到您的组织。如果您的组织混合使用登录方法，每个开发者将根据他们进行身份验证的方法进行计量。

该表将每种设置映射到您查看支出的位置、您限制支出的位置以及如何提取每用户数字。

| 您的设置                                                                                 | 查看支出                                                                                                             | 限制支出        | 每用户报告                                                                                                                                                                                                            |
| :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- | :---------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Claude for Teams 或 Enterprise](#claude-for-teams-and-enterprise)                    | [组织分析中的支出报告](https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans) | 管理员设置中的支出限制 | [支出报告 CSV](https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans)；Enterprise 上的 [Enterprise Analytics API](https://platform.claude.com/docs/en/api/admin/analytics) |
| [Claude Console (API)](#claude-console)                                              | [Console 使用情况页面](https://platform.claude.com/usage)                                                              | 工作区支出限制     | [Console 仪表板](https://platform.claude.com/claude-code)、[Claude Code Analytics API](https://platform.claude.com/docs/en/build-with-claude/claude-code-analytics-api)                                              |
| [Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry](#cloud-providers) | 您的云计费控制台                                                                                                         | 您的云预算控制     | [OpenTelemetry](/docs/zh-CN/monitoring-usage) 或 [LLM gateway](/docs/zh-CN/llm-gateway)                                                                                                                                     |

[OpenTelemetry 导出](/docs/zh-CN/monitoring-usage)适用于每种设置，是唯一能够以近实时方式将每用户令牌和成本指标流式传输到您自己的可观测性堆栈的选项。

<h3 id="claude-for-teams-and-enterprise">
  Claude for Teams 和 Enterprise
</h3>

在 Claude for Teams 和 Enterprise 计划中，每个成员的 Claude Code 使用情况从按座位额度中扣除，该额度在滚动五小时窗口和每周窗口上重置。该额度与 Claude chat 和 Cowork 共享，其大小取决于成员的[座位等级](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)（Standard 或 Premium）。您的控制位于 claude.ai 管理控制台中，而不是 Claude Console。

* **查看支出**：[组织分析中的支出报告](https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans)显示每个用户和每个模型的估计支出，带有 CSV 导出，每日更新。该报告涵盖使用额度支出，并在启用使用额度后出现。座位额度内的使用情况不以美元计量。
* **查看采用情况**：[分析仪表板](https://claude.ai/analytics/claude-code)显示每日活跃用户、会话和贡献指标，带有贡献数据的 CSV 导出。请参阅[使用分析跟踪团队使用情况](/docs/zh-CN/analytics)。
* **限制支出**：座位额度是默认上限。要让成员继续超过它，请启用[使用额度](https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans)并在组织、组或个人成员级别设置支出限制。
* **提取每用户数字**：在 Enterprise 计划中，[Enterprise Analytics API](https://platform.claude.com/docs/en/api/admin/analytics) 返回跨 Claude 表面（包括 Claude Code）的每用户使用情况和成本报告。主所有者在 [claude.ai/analytics/api-keys](https://claude.ai/analytics/api-keys) 处使用 `read:analytics` 范围创建密钥。在 Teams 计划中，导出[支出报告 CSV](https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans)，其中列出了每个用户和每个模型的令牌使用情况和估计支出。

[Claude Enterprise 消费指南](https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide)是管理员的规划参考。它解释了消费如何在 Claude chat、Claude Code 和 Cowork 中有所不同，并为预算提供了每用户美元起点。为编码座位预算比聊天座位更多：每个 Claude Code 轮次都包含文件内容、工具调用和多步推理，因此一个调试会话可能会消耗超过一天的聊天。

<h3 id="claude-console">
  Claude Console
</h3>

API 组织通过[工作区](https://platform.claude.com/docs/en/build-with-claude/workspaces)管理 Claude Code 支出。您可以[设置工作区支出限制](https://platform.claude.com/docs/en/build-with-claude/workspaces#workspace-limits)以限制 Claude Code 总支出，并在 Console 中[查看成本和使用情况报告](https://platform.claude.com/docs/en/build-with-claude/workspaces#usage-and-cost-tracking)。

<Note>
  当您首次使用 Claude Console 账户对 Claude Code 进行身份验证时，会自动为您创建一个名为"Claude Code"的工作区。此工作区为您的组织中的所有 Claude Code 使用情况提供集中式成本跟踪和管理。您无法为此工作区创建 API 密钥；它专门用于 Claude Code 身份验证和使用。

  对于具有自定义速率限制的组织，此工作区中的 Claude Code 流量计入您的组织整体 API 速率限制。您可以在 Claude Console 的此工作区的 Limits 页面上设置[工作区速率限制](https://platform.claude.com/docs/zh-CN/api/rate-limits#setting-lower-limits-for-workspaces)，以限制 Claude Code 的份额并保护其他生产工作负载。
</Note>

对于每用户报告，[Console 仪表板](https://platform.claude.com/claude-code)显示每个成员的支出和接受的行数，[Claude Code Analytics API](https://platform.claude.com/docs/en/build-with-claude/claude-code-analytics-api)使用[管理员 API 密钥](https://platform.claude.com/settings/admin-keys)以编程方式返回相同的每日每用户指标。请参阅[API 客户的分析](/docs/zh-CN/analytics#access-analytics-for-api-customers)。

<h4 id="rate-limit-recommendations">
  速率限制建议
</h4>

为团队设置 Claude Code 时，请根据您的组织规模考虑这些每用户的令牌/分钟 (TPM) 和请求/分钟 (RPM) 建议：

| 团队规模       | 每用户 TPM   | 每用户 RPM   |
| ---------- | --------- | --------- |
| 1-5 用户     | 200k-300k | 5-7       |
| 5-20 用户    | 100k-150k | 2.5-3.5   |
| 20-50 用户   | 50k-75k   | 1.25-1.75 |
| 50-100 用户  | 25k-35k   | 0.62-0.87 |
| 100-500 用户 | 15k-20k   | 0.37-0.47 |
| 500+ 用户    | 10k-15k   | 0.25-0.35 |

例如，如果您有 200 个用户，您可能会为每个用户请求 20k TPM，或总共 400 万 TPM (200\*20,000 = 400 万)。

随着团队规模的增长，每用户的 TPM 会减少，因为在较大的组织中，往往较少的用户同时使用 Claude Code。这些速率限制在组织级别应用，而不是按个人用户应用，这意味着当其他人未积极使用该服务时，个人用户可以暂时消耗超过其计算份额的资源。

<Note>
  如果您预期会出现异常高的并发使用情况（例如与大型团体进行的实时培训会话），您可能需要更高的每用户 TPM 分配。
</Note>

<h3 id="cloud-providers">
  云提供商
</h3>

在 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上，Claude Code 按令牌计费到您的云账户，支出控制位于您的云提供商的计费控制台中。Claude Code 不会从您的云向 Anthropic 发送指标，因此[分析仪表板](/docs/zh-CN/analytics)和 Claude Code Analytics API 不涵盖此使用情况。

对于每用户成本归因，您有三个选项：

* **OpenTelemetry**：[导出指标](/docs/zh-CN/monitoring-usage)从每个开发者的机器到您自己的可观测性堆栈。这为您提供每用户令牌计数、成本和工具活动，无论提供商如何。
* **Claude apps gateway**：自托管的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway)提供每用户使用情况归因、带有令牌计数的 OTLP 指标，以及这些提供商上的[每用户支出限制](/docs/zh-CN/claude-apps-gateway-spend-limits)。
* **LLM gateway**：通过代理路由所有 Claude Code 流量，该代理按密钥跟踪支出。几个大型企业报告使用[LiteLLM](/docs/zh-CN/llm-gateway)，一个开源工具，可以[按密钥跟踪支出](https://docs.litellm.ai/docs/proxy/virtual_keys#tracking-spend)。此项目与 Anthropic 无关，尚未进行安全审计。

<h3 id="when-a-developer-asks-about-a-limit">
  当开发者询问限制时
</h3>

开发者通常会向他们的管理员提出限制问题，因此了解他们遇到的上限会很有帮助。这三种情况意味着不同的事情：

* **"您已达到会话限制"或"您已达到每周限制"**：订阅计划上基于座位的使用窗口。这些窗口在所有模型中共享，因此使用 `/model` 切换模型不会恢复访问权限，尽管在模型特定的"您已达到 Opus 限制"消息之后它确实让开发者继续工作。该消息显示窗口何时重置，开发者可以运行 `/usage-credits` 来请求超过额度的使用情况（如果您已启用[使用额度](https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans)）。请参阅[使用限制错误](/docs/zh-CN/errors#youve-hit-your-session-limit)。
* **上下文或自动压缩警告**：不是使用限制。对话已接近模型的最大输入大小，Claude Code 总结较早的历史以释放空间。将开发者指向[减少令牌使用](#reduce-token-usage)。
* **API 或云提供商计划上的意外高支出**：通常可以追溯到从未清除的长会话或将 Opus 作为默认模型。要分享的最高影响习惯是在不相关的任务之间清除和将模型与工作相匹配，两者都在[减少令牌使用](#reduce-token-usage)中涵盖。

<h3 id="agent-team-token-costs">
  Agent 团队令牌成本
</h3>

[Agent 团队](/docs/zh-CN/agent-teams)生成多个 Claude Code 实例，每个实例都有自己的上下文窗口。令牌使用情况随活跃队友的数量和每个队友运行的时间长度而扩展。

为了保持 agent 团队成本可控：

* 为队友使用 Sonnet。它为协调任务平衡了能力和成本。
* 保持团队规模小。每个队友运行自己的上下文窗口，因此令牌使用大致与团队规模成正比。
* 保持生成提示的重点。队友会自动加载 CLAUDE.md、MCP servers 和 skills，但生成提示中的所有内容都会从一开始就添加到其上下文中。
* 工作完成后关闭队友。每个活跃的队友会继续消耗令牌，直到它退出或会话结束。
* Agent 团队默认被禁用。在您的[settings.json](/docs/zh-CN/settings)或环境中设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 以启用它们。请参阅[启用 agent 团队](/docs/zh-CN/agent-teams#enable-agent-teams)。

<h2 id="reduce-token-usage">
  减少令牌使用
</h2>

令牌成本随上下文大小而扩展：Claude 处理的上下文越多，您使用的令牌就越多。Claude Code 通过 [prompt caching](/docs/zh-CN/prompt-caching)（减少重复内容（如系统提示）的成本）和 auto-compact（在接近上下文限制时总结对话历史）自动优化成本。

以下策略可帮助您保持上下文较小并降低每条消息的成本。

<h3 id="manage-context-proactively">
  主动管理上下文
</h3>

使用 `/usage` 检查您当前的令牌使用情况，或[配置您的状态行](/docs/zh-CN/statusline#context-window-usage)以连续显示它。

* **在任务之间清除**：使用 `/clear` 在切换到不相关的工作时重新开始。陈旧的上下文会在随后的每条消息上浪费令牌。在清除之前使用 `/rename` 以便您稍后可以轻松找到会话，然后使用 `/resume` 返回到它。
* **添加自定义 compaction 指令**：`/compact Focus on code samples and API usage` 告诉 Claude 在总结期间保留什么。

您还可以在项目根目录的 CLAUDE.md 文件中自定义 compaction 行为：

```markdown theme={null}
# Compact instructions

When you are using compact, please focus on test output and code changes
```

<h3 id="choose-the-right-model">
  选择正确的模型
</h3>

Sonnet 处理大多数编码任务效果很好，成本低于 Opus。为复杂的架构决策或多步推理保留 Opus。使用 `/model` 在会话中途切换模型，或在 `/config` 中设置默认值。对于简单的 subagent 任务，在您的 [subagent 配置](/docs/zh-CN/sub-agents#choose-a-model)中指定 `model: haiku`。

<h3 id="reduce-mcp-server-overhead">
  减少 MCP server 开销
</h3>

MCP 工具定义[默认被延迟](/docs/zh-CN/mcp#scale-with-mcp-tool-search)，因此只有工具名称进入上下文，直到 Claude 使用特定工具。运行 `/context` 查看占用空间的内容。

* **在可用时优先使用 CLI 工具**：`gh`、`aws`、`gcloud` 和 `sentry-cli` 等工具比 MCP servers 更节省上下文，因为它们不添加任何每工具列表。Claude 可以直接运行 CLI 命令。
* **禁用未使用的 servers**：运行 `/mcp` 查看配置的 servers 并禁用您未积极使用的任何 servers。

<h3 id="install-code-intelligence-plugins-for-typed-languages">
  为类型化语言安装代码智能插件
</h3>

[代码智能插件](/docs/zh-CN/discover-plugins#code-intelligence)为 Claude 提供精确的符号导航，而不是基于文本的搜索，减少在探索不熟悉的代码时不必要的文件读取。单个"转到定义"调用替代了可能需要的 grep 后跟读取多个候选文件。已安装的语言服务器还会在编辑后自动报告类型错误，因此 Claude 无需运行编译器即可捕获错误。

<h3 id="offload-processing-to-hooks-and-skills">
  将处理卸载到 hooks 和 skills
</h3>

自定义 [hooks](/docs/zh-CN/hooks)可以在 Claude 看到数据之前对其进行预处理。Claude 不是读取 10,000 行日志文件来查找错误，hook 可以 grep `ERROR` 并仅返回匹配的行，将上下文从数万个令牌减少到数百个。

[skill](/docs/zh-CN/skills)可以为 Claude 提供领域知识，这样它就不必进行探索。例如，"codebase-overview" skill 可以描述您的项目架构、关键目录和命名约定。当 Claude 调用该 skill 时，它会立即获得此上下文，而不是花费令牌读取多个文件来理解结构。

例如，此 PreToolUse hook 过滤测试输出以仅显示失败：

<Tabs>
  <Tab title="settings.json">
    将此添加到您的 [settings.json](/docs/zh-CN/settings#settings-files)以在每个 Bash 命令之前运行 hook：

    ```json theme={null}
    {
      "hooks": {
        "PreToolUse": [
          {
            "matcher": "Bash",
            "hooks": [
              {
                "type": "command",
                "command": "~/.claude/hooks/filter-test-output.sh"
              }
            ]
          }
        ]
      }
    }
    ```
  </Tab>

  <Tab title="filter-test-output.sh">
    hook 调用此脚本。使用 `mkdir -p ~/.claude/hooks` 创建文件夹，将下面的脚本保存为 `~/.claude/hooks/filter-test-output.sh`，并使用 `chmod +x ~/.claude/hooks/filter-test-output.sh` 使其可执行。它检查命令是否为测试运行器并修改它以仅显示失败：

    ```bash theme={null}
    #!/bin/bash
    input=$(cat)
    cmd=$(echo "$input" | jq -r '.tool_input.command')

    # If running tests, filter to show only failures
    if [[ "$cmd" =~ ^(npm test|pytest|go test) ]]; then
      filtered_cmd="$cmd 2>&1 | grep -A 5 -E '(FAIL|ERROR|error:)' | head -100"
      echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"updatedInput\":{\"command\":\"$filtered_cmd\"}}}"
    else
      echo "{}"
    fi
    ```
  </Tab>
</Tabs>

<h3 id="move-instructions-from-claude-md-to-skills">
  将指令从 CLAUDE.md 移动到 skills
</h3>

您的 [CLAUDE.md](/docs/zh-CN/memory)文件在会话开始时加载到上下文中。如果它包含特定工作流的详细指令（如 PR 审查或数据库迁移），即使您在做不相关的工作时，这些令牌也会存在。[Skills](/docs/zh-CN/skills)仅在调用时按需加载，因此将专门指令移动到 skills 中可以保持您的基础上下文较小。目标是通过仅包含必要内容来将 CLAUDE.md 保持在 200 行以下。

<h3 id="adjust-extended-thinking">
  调整扩展思考
</h3>

扩展思考默认启用，因为它显著改进了复杂规划和推理任务的性能。思考令牌作为输出令牌计费，默认预算可能是每个请求数万个令牌，具体取决于模型。对于不需要深度推理的更简单任务，您可以通过在 `/effort` 中或在 `/model` 中降低 [effort level](/docs/zh-CN/model-config#adjust-effort-level)、在 `/config` 中禁用思考或在具有[固定思考预算](/docs/zh-CN/model-config#adaptive-reasoning-and-fixed-thinking-budgets)的模型上通过设置 `MAX_THINKING_TOKENS` [环境变量](/docs/zh-CN/env-vars)（例如 `MAX_THINKING_TOKENS=8000`）来降低预算来降低成本。自适应推理模型忽略非零预算，因此请改用 effort levels。Fable 5 上不提供禁用思考，它始终使用扩展思考。

<h3 id="delegate-verbose-operations-to-subagents">
  将冗长的操作委托给 subagents
</h3>

运行测试、获取文档或处理日志文件可能会消耗大量上下文。将这些委托给 [subagents](/docs/zh-CN/sub-agents#isolate-high-volume-operations)，以便冗长的输出保留在 subagent 的上下文中，而只有摘要返回到您的主对话。

<h3 id="manage-agent-team-costs">
  管理 agent 团队成本
</h3>

当队友在 plan mode 中运行时，Agent 团队使用的令牌大约是标准会话的 7 倍，因为每个队友维护自己的上下文窗口并作为单独的 Claude 实例运行。保持团队任务小且独立，以限制每个队友的令牌使用。有关详细信息，请参阅 [agent 团队](/docs/zh-CN/agent-teams)。

<h3 id="write-specific-prompts">
  编写具体的提示
</h3>

模糊的请求（如"改进此代码库"）会触发广泛扫描。具体的请求（如"向 auth.ts 中的登录函数添加输入验证"）让 Claude 能够以最少的文件读取高效地工作。

<h3 id="work-efficiently-on-complex-tasks">
  高效处理复杂任务
</h3>

对于较长或更复杂的工作，这些习惯有助于避免因走错路而浪费的令牌：

* **对复杂任务使用 plan mode**：按 Shift+Tab 进入 [plan mode](/docs/zh-CN/permission-modes#analyze-before-you-edit-with-plan-mode)，然后再进行实现。Claude 探索代码库并提出一个方法供您批准，防止当初始方向错误时的昂贵返工。
* **尽早纠正方向**：如果 Claude 开始朝错误的方向发展，按 Escape 立即停止。使用 `/rewind` 或双击 Escape 将对话和代码恢复到之前的 checkpoint。
* **给出验证目标**：在您的提示中包含测试用例、粘贴屏幕截图或定义预期输出。当 Claude 可以验证自己的工作时，它会在您需要请求修复之前捕获问题。
* **增量测试**：编写一个文件，测试它，然后继续。这会在问题便宜时尽早捕获问题。

<h2 id="background-token-usage">
  后台令牌使用
</h2>

Claude Code 即使在空闲时也会为某些后台功能使用令牌：

* **对话总结**：为 `claude --resume` 功能总结以前对话的后台作业
* **命令处理**：某些命令（如 `/usage`）可能会生成请求以检查状态

这些后台进程即使没有活跃交互也会消耗少量令牌（通常每个会话不到 \$0.04）。

<h2 id="understanding-changes-in-claude-code-behavior">
  了解 Claude Code 行为的变化
</h2>

Claude Code 定期接收可能改变功能工作方式的更新，包括成本报告。运行 `claude --version` 检查您的当前版本。如有具体计费问题，请通过您的[Console 账户](https://platform.claude.com/login)联系 Anthropic 支持。
