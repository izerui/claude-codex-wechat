> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 配置自动模式

> 告诉自动模式分类器您的组织信任哪些代码库、存储桶和域。设置环境上下文，覆盖默认的阻止和允许规则，并使用自动模式 CLI 子命令检查您的有效配置。

[自动模式](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode)让 Claude Code 无需常规权限提示即可运行，通过将工具调用路由到一个分类器，该分类器会阻止任何不可逆、破坏性或针对您环境外的操作。拒绝和显式询问规则在分类器之前进行评估，仍然会阻止或提示。使用 `autoMode` 设置块告诉该分类器您的组织信任哪些代码库、存储桶和域，以便它停止阻止常规内部操作。

<Note>
  自动模式可供所有提供商上的所有用户使用，包括 Anthropic API、Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 和已登录的 [Claude 应用网关](/docs/zh-CN/claude-apps-gateway)会话。如果 Claude Code 报告您的账户无法使用自动模式，请检查[完整要求](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode)，其中还涵盖了支持的模型和 Team 和 Enterprise 计划上的所有者启用。在 v2.1.158 到 v2.1.206 中，Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 和 Claude 应用网关会话上的自动模式需要设置 `CLAUDE_CODE_ENABLE_AUTO_MODE=1`；v2.1.207 移除了该要求。
</Note>

默认情况下，分类器仅信任工作目录和当前代码库的已配置远程。推送到您公司的源代码控制组织或写入团队云存储桶等操作会被阻止，直到您将它们添加到 `autoMode.environment`。

有关如何启用自动模式以及它默认阻止的内容，请参阅[权限模式](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode)。本页是配置参考。

本页涵盖如何：

* [为推送和拉取请求添加人工检查点](#common-boundaries)，使用 `permissions.ask`
* [选择在何处设置规则](#where-the-classifier-reads-configuration)，跨越 CLAUDE.md、用户设置和托管设置
* [定义受信任的基础设施](#define-trusted-infrastructure)，使用 `autoMode.environment`
* [覆盖阻止和允许规则](#override-the-block-and-allow-rules)，当默认值不适合您的管道时
* [将所有 shell 命令路由通过分类器](#route-all-shell-commands-through-the-classifier)，使用 `autoMode.classifyAllShell`
* [检查您的有效配置](#inspect-the-defaults-and-your-effective-config)，使用 `claude auto-mode` 子命令
* [查看拒绝](#review-denials)，以便您知道接下来要添加什么

<h2 id="common-boundaries">
  常见边界
</h2>

自动模式默认允许推送到您的工作分支、例行推送到存储库默认分支以及拉取请求创建。分类器仅在存在风险时（例如强制推送或绕过您设置的审查的内容）才会阻止推送。如果您想在每次推送或拉取请求之前进行人工检查点，请添加权限规则：以下配方将为其他所有操作保持自动模式开启。

最直接的机制是 [`permissions.ask`](/docs/zh-CN/permissions#permission-rule-syntax)。内容范围的 ask 规则（如下面的规则）在分类器之前进行评估，并且即使在自动模式下也始终强制权限提示，因为显式 ask 规则是您明确表示要对该操作进行提示的意图。在您的 [settings](/docs/zh-CN/settings#settings-files) 中添加规则：

```json theme={null}
{
  "permissions": {
    "ask": [
      "Bash(git push *)",
      "Bash(gh pr create *)"
    ]
  }
}
```

选择与边界需要的严格程度相匹配的机制：

| 边界        | 机制                    | 自动模式中的行为                                                                                                          |
| :-------- | :-------------------- | :---------------------------------------------------------------------------------------------------------------- |
| 在操作前提示    | `permissions.ask`     | 始终为内容范围的规则（如上面的配方）提示。分类器无法自动批准匹配的操作。                                                                              |
| 永不运行操作    | `permissions.deny`    | 在咨询分类器之前阻止。分类器和用户意图都无法覆盖它。                                                                                        |
| 此会话的一次性边界 | 在对话中说明，例如"在我审查之前不要推送" | 分类器阻止匹配的操作，但如果 [context compaction](/docs/zh-CN/costs#reduce-token-usage) 删除了说明该边界的消息，边界可能会丢失。使用 ask 或 deny 规则以获得持久保证。 |

<h2 id="where-the-classifier-reads-configuration">
  分类器读取配置的位置
</h2>

分类器读取与 Claude 本身加载的相同 [CLAUDE.md](/docs/zh-CN/memory) 内容，因此项目的 CLAUDE.md 中的指令（如"从不强制推送"）会同时引导 Claude 和分类器。从那里开始了解项目约定和行为规则。

对于跨项目应用的规则，例如受信任的基础设施或组织范围的拒绝规则，请使用 `autoMode` 设置块。分类器从以下范围读取 `autoMode`：

| 范围                         | 文件                                     | 用途               |
| :------------------------- | :------------------------------------- | :--------------- |
| 单个开发者                      | `~/.claude/settings.json`              | 个人受信任的基础设施       |
| 组织范围                       | [托管设置](/docs/zh-CN/server-managed-settings) | 分发给所有开发者的受信任基础设施 |
| `--settings` 标志或 Agent SDK | 内联 JSON                                | 自动化的每次调用覆盖       |

分类器不从 `.claude/settings.json` 或 `.claude/settings.local.json` 中的项目设置读取 `autoMode`。两个文件都位于仓库目录中，因此已检入的仓库或构建步骤可能会注入自己的允许规则。在 v2.1.207 之前，分类器也读取 `.claude/settings.local.json`；将该文件中的任何 `autoMode` 块移动到 `~/.claude/settings.json`。排除 `.claude/settings.local.json` 也解决了仓库提交该文件或本地工具或构建步骤写入该文件的情况。

来自每个范围的条目被合并。开发者可以使用个人条目扩展 `environment`、`allow`、`soft_deny` 和 `hard_deny`，但不能删除托管设置提供的条目。由于允许规则在分类器内充当软块规则的例外，开发者添加的 `allow` 条目可以覆盖组织的 `soft_deny` 条目：组合是累加的，而不是硬策略边界。

<Note>
  分类器是在[权限系统](/docs/zh-CN/permissions)之后运行的第二道门。对于必须永远不运行的操作，无论用户意图或分类器配置如何，请在托管设置中使用 `permissions.deny`，它在咨询分类器之前阻止操作，无法被覆盖。
</Note>

<h2 id="define-trusted-infrastructure">
  定义受信任的基础设施
</h2>

对于大多数组织，`autoMode.environment` 是您唯一需要设置的字段。它告诉分类器哪些代码库、存储桶和域是受信任的：分类器使用它来决定"外部"的含义，因此任何未列出的目标都是潜在的数据泄露目标。

从 Claude Code v2.1.198 开始，`claude auto-mode defaults` 打印三种环境条目。v2.1.195 之前的版本仅打印前五个信任槽。

* **上下文槽**：描述您的组织、技术栈和安全态势，以便分类器读取您上下文中的其他规则。与其他两种不同，上下文槽没有针对它们的规则。每个都默认为 `None configured` 或保守假设（如下所示）：
  * **组织**
  * **Claude Code 的主要用途**：默认为软件开发
  * **云提供商**
  * **代码库可见性**：除非其远程主机和名称另有说明，或会话中较早的可见性检查分类器读取的内容显示它是公开的，否则代码库被假定为私有。分类器读取您的消息和 Claude 运行的命令，而不是它们的输出，因此证据必须是它能读取的内容，例如您自己的消息将存储库命名为公开；单独的 `gh repo view` 的输出无法到达它。转录证据检查需要 Claude Code v2.1.200 或更高版本
  * **内部共享 / 代码片段托管**：公共粘贴和 gist 服务被视为在信任边界之外，直到您命名一个
  * **特定于组织的 CLI**
  * **密钥管理**
  * **默认 / 受保护的分支**：`main` 和 `master` 被视为受保护，直到您命名其他分支
  * **CI/CD 部署目标**
  * **网络态势**
  * **受保护的部署命名空间 / 环境**：回退到敏感远程目标启发式方法，直到您命名它们
  * **数据保留 / 解密**
* **信任槽**：命名分类器视为在您边界内的内容。槽位是受信任的代码库、源代码控制、受信任的内部域、受信任的云存储桶、关键内部服务和内部包注册表。代码库和源代码控制条目默认为工作代码库及其配置的远程。所有其他信任槽默认为 `None configured`，因此在您添加之前没有其他内容是受信任的。存储库的可见性仅限于机密材料：私有存储库是机密材料的可接受目标，但将存储库设为私有永远不会清除秘密、个人或受信任的数据进入其中，分类器将从工作存储库外部移植、重新指向或首次读取的内容视为不是该存储库自己的工作。此范围界定需要 Claude Code v2.1.203 或更高版本。
* **敏感性槽**：命名保护规则视为高风险的内容。槽位是敏感数据位置和受众、敏感远程目标和受保护的 IaC 范围。每个都默认为广泛的启发式方法，例如将任何名称中包含 `prod` 或 `production` 的主机或命名空间视为敏感远程目标，因此保护规则在您配置任何内容之前就处于活动状态。在敏感性槽中命名具体目标会使这些规则应用于命名的目标而不是启发式方法。

要在默认值旁边添加您自己的条目，请在数组中包含字面字符串 `"$defaults"`。默认条目会在该位置被拼接进去，因此您的自定义条目可以在它们之前或之后。

以下示例保持默认条目并添加组织的代码库、存储桶、域和服务。

```json theme={null}
{
  "autoMode": {
    "environment": [
      "$defaults",
      "Source control: github.example.com/acme-corp and all repos under it",
      "Trusted cloud buckets: s3://acme-build-artifacts, gs://acme-ml-datasets",
      "Trusted internal domains: *.corp.example.com, api.internal.example.com",
      "Key internal services: Jenkins at ci.example.com, Artifactory at artifacts.example.com"
    ]
  }
}
```

条目是散文，不是正则表达式或工具模式。分类器将它们读作自然语言规则。按照您向新工程师描述基础设施的方式编写它们。一个全面的环境部分涵盖：

* **组织**：您的公司名称以及 Claude Code 的主要用途，例如软件开发、基础设施自动化或数据工程
* **源代码控制**：您的开发者推送到的每个 GitHub、GitLab 或 Bitbucket 组织
* **云提供商和受信任的存储桶**：Claude 应该能够读取和写入的存储桶名称或前缀
* **受信任的内部域**：您网络内的 API、仪表板和服务的主机名，例如 `*.internal.example.com`
* **关键内部服务**：CI、工件注册表、内部包索引、事件工具
* **内部包注册表**：私有 npm、PyPI 或其他注册表，安装应该通过它路由，因此绕过它安装到公共注册表的安装会被阻止
* **敏感数据位置和受众**：保存个人数据、机密业务数据、凭证、受管制数据或类似敏感材料的存储桶、数据库或路径，以及每个位置中的数据可能与之共享的受众，以便分类器保护这些位置而不是从内容猜测。Claude Code v2.1.195 至 v2.1.197 将此条目命名为 PII / 受管制数据位置，仅涵盖保存个人或受管制数据的位置，不包括受众维度
* **敏感远程目标**：计为生产的命名空间、主机或容器，因此远程 shell 和端口转发到它们需要您的明确批准
* **受保护的 IaC 范围**：其应用或销毁应始终需要您命名更改的基础设施资源
* **其他上下文**：受管制行业的约束、多租户基础设施或影响分类器应将什么视为风险的合规要求

内部包注册表、敏感数据位置和受众、敏感远程目标和受保护的 IaC 范围条目需要 Claude Code v2.1.195 或更高版本。早期版本仍将它们读作纯上下文，但没有针对它们的内置规则。

一个有用的起始模板：填入括号中的字段并删除任何不适用的行。

```json theme={null}
{
  "autoMode": {
    "environment": [
      "$defaults",
      "Organization: {COMPANY_NAME}. Primary use: {PRIMARY_USE_CASE, e.g. software development, infrastructure automation}",
      "Source control: {SOURCE_CONTROL, e.g. GitHub org github.example.com/acme-corp}",
      "Cloud provider(s): {CLOUD_PROVIDERS, e.g. AWS, GCP, Azure}",
      "Trusted cloud buckets: {TRUSTED_BUCKETS, e.g. s3://acme-builds, gs://acme-datasets}",
      "Trusted internal domains: {TRUSTED_DOMAINS, e.g. *.internal.example.com, api.example.com}",
      "Key internal services: {SERVICES, e.g. Jenkins at ci.example.com, Artifactory at artifacts.example.com}",
      "Additional context: {EXTRA, e.g. regulated industry, multi-tenant infrastructure, compliance requirements}"
    ]
  }
}
```

您提供的上下文越具体，分类器就越能区分常规内部操作和数据泄露尝试。

您不需要一次性填写所有内容。合理的推出方式：从默认值开始，添加您的源代码控制组织和关键内部服务，这解决了最常见的误报，例如推送到您自己的代码库。接下来添加受信任的域和云存储桶。当出现阻止时填写其余部分。

<h2 id="override-the-block-and-allow-rules">
  覆盖阻止和允许规则
</h2>

三个额外的字段让您替换分类器的内置规则列表：

* `autoMode.hard_deny`：无条件安全边界
* `autoMode.soft_deny`：用户意图可以清除的破坏性操作
* `autoMode.allow`：软阻止规则的例外

每个都是散文描述的数组，读作自然语言规则。对于在分类器之前运行的基于工具模式的硬阻止，请使用 [`permissions.deny`](/docs/zh-CN/permissions)。

在分类器内，优先级分为四个层级：

* `hard_deny` 规则无条件阻止。用户意图和 `allow` 例外不适用。
* `soft_deny` 规则接下来阻止。用户意图和 `allow` 例外可以覆盖这些。
* `allow` 规则然后覆盖匹配的 `soft_deny` 规则作为例外。
* 明确的用户意图覆盖剩余的软阻止：如果用户的消息直接且具体地描述 Claude 即将采取的确切操作，分类器允许它，即使 `soft_deny` 规则匹配。

一般请求不算作明确意图。要求 Claude"清理代码库"不授权强制推送，但要求 Claude"强制推送此分支"则授权。

要放松，当分类器重复标记默认例外不涵盖的常规模式时，添加到 `allow`。要收紧，为您的环境特定的破坏性风险添加到 `soft_deny`（默认值会遗漏），或为必须永远不能跨越的安全边界添加到 `hard_deny`。要保持内置规则同时添加您自己的规则，请在数组中包含字面字符串 `"$defaults"`。默认规则会在该位置拼接，因此您的自定义规则可以在它们之前或之后，并且当内置列表在版本发布中更改时，您继续继承更新。

以下示例在所有四个列表中保持默认值，并向每个列表添加特定于组织的规则。

```json theme={null}
{
  "autoMode": {
    "environment": [
      "$defaults",
      "Source control: github.example.com/acme-corp and all repos under it"
    ],
    "allow": [
      "$defaults",
      "Deploying to the staging namespace is allowed: staging is isolated from production and resets nightly",
      "Writing to s3://acme-scratch/ is allowed: ephemeral bucket with a 7-day lifecycle policy"
    ],
    "soft_deny": [
      "$defaults",
      "Never run database migrations outside the migrations CLI, even against dev databases",
      "Never modify files under infra/terraform/prod/: production infrastructure changes go through the review workflow"
    ],
    "hard_deny": [
      "$defaults",
      "Never send repository contents to third-party code-review APIs"
    ]
  }
}
```

<Danger>
  在不包含 `"$defaults"` 的情况下设置 `environment`、`allow`、`soft_deny` 或 `hard_deny` 中的任何一个会替换该部分的整个默认列表。如果您设置一个没有 `"$defaults"` 的数组，您会丢弃该部分的内置规则：

  * `soft_deny`：每个内置软阻止规则，包括强制推送、`curl | bash`、生产部署和自动模式绕过
  * `hard_deny`：内置的数据泄露规则
</Danger>

每个部分独立评估，因此单独设置 `environment` 会保持默认 `allow`、`soft_deny` 和 `hard_deny` 列表完整。仅在您打算完全拥有该列表时才省略 `"$defaults"`。要安全地执行此操作，请运行 `claude auto-mode defaults` 打印内置规则，将它们复制到您的设置文件中，然后根据您自己的管道和风险容限审查每条规则。

<h2 id="route-all-shell-commands-through-the-classifier">
  将所有 shell 命令路由通过分类器
</h2>

默认情况下，窄 Bash 和 PowerShell 允许规则（例如 `Bash(npm test)`）会进入自动模式并在分类器运行之前解决。自动模式仅暂停授予任意代码执行的广泛规则，例如 `Bash(*)` 或通配符解释器。这意味着窄规则仍然可以让破坏性参数通过而不被分类器看到，例如脚本路径或规则前缀未预期的标志。

将 `autoMode.classifyAllShell` 设置为 `true` 以在自动模式处于活动状态时暂停每个 Bash 和 PowerShell 允许规则，以便分类器评估每个 shell 命令，无论您的允许列表如何。

```json theme={null}
{
  "autoMode": {
    "classifyAllShell": true
  }
}
```

这用延迟换取覆盖：允许规则会立即批准的命令现在等待分类器决定，每个 shell 命令计为一个分类器调用。

该设置仅在自动模式处于活动状态时适用，您的允许规则在其他权限模式中表现正常。

<Note>
  `autoMode.classifyAllShell` 需要 Claude Code v2.1.193 或更高版本。早期版本忽略该键并继续将窄 shell 允许规则进入自动模式。
</Note>

<h2 id="inspect-the-defaults-and-your-effective-config">
  检查默认值和您的有效配置
</h2>

三个 CLI 子命令帮助您检查和验证您的配置。

将内置 `environment`、`allow`、`soft_deny` 和 `hard_deny` 规则打印为 JSON：

```bash theme={null}
claude auto-mode defaults
```

要读取一条规则的完整措辞而不通过 `jq` 管道，请传递 `--label` 和规则标签的开头，例如 `claude auto-mode defaults --label 'Git Destructive'`。匹配是对每条规则标签的不区分大小写的前缀，没有匹配的部分打印为空列表。需要 Claude Code v2.1.208 或更高版本。

打印分类器实际使用的内容作为 JSON，应用您的设置（如果设置）或使用默认值：

```bash theme={null}
claude auto-mode config
```

获取关于您的自定义 `allow`、`soft_deny` 和 `hard_deny` 规则的 AI 反馈：

```bash theme={null}
claude auto-mode critique
```

保存设置后运行 `claude auto-mode config` 以确认有效规则是您期望的，其中 `"$defaults"` 已展开到位。如果您编写了自定义规则，`claude auto-mode critique` 会审查它们并标记模糊、冗余或可能导致误报的条目。

如果您需要删除或重写内置规则而不是在其旁边添加，请将 `claude auto-mode defaults` 的输出保存到文件，编辑列表，并将结果粘贴到您的设置文件中以替换 `"$defaults"`。

<h2 id="review-denials">
  查看拒绝
</h2>

当自动模式拒绝工具调用时，拒绝被记录在 `/permissions` 下的"最近拒绝"选项卡中。在被拒绝的操作上按 `r` 将其标记为重试：当您退出对话框时，Claude Code 发送一条消息告诉模型它可能重试该工具调用并恢复对话。

在 Claude Code v2.1.193 及更高版本中，分类器对每个拒绝的原因出现在成绩单中被阻止的工具调用旁边、拒绝通知中以及"最近拒绝"选项卡上的每个条目下。使用原因来决定修复是 `environment` 条目、`allow` 例外还是在您的下一条消息中使用明确意图重试。

对同一目标的重复拒绝通常意味着分类器缺少上下文。将该目标添加到 `autoMode.environment`，然后运行 `claude auto-mode config` 确认它生效。

要以编程方式对拒绝做出反应，请使用 [`PermissionDenied` hook](/docs/zh-CN/hooks#permissiondenied)。

<h2 id="see-also">
  另请参阅
</h2>

* [权限模式](/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode)：自动模式是什么、它默认阻止什么以及如何启用它
* [托管设置](/docs/zh-CN/server-managed-settings)：在您的组织中部署 `autoMode` 配置
* [权限](/docs/zh-CN/permissions)：在分类器运行之前应用的允许、询问和拒绝规则
* [设置](/docs/zh-CN/settings)：完整的设置参考，包括 `autoMode` 键
