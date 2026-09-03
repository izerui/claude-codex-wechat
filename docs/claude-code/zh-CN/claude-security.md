> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 扫描代码库中的漏洞

> 安装 Claude Security 插件以在 Claude Code 会话中扫描代码库中的漏洞，并将发现的问题转化为您可以审查和应用的补丁。

Claude Security 插件在 Claude Code 会话中运行代码库的多代理漏洞扫描。一个 Claude 代理团队映射您的架构、构建威胁模型、搜寻漏洞，并在编写报告前独立审查每个发现。使用该插件扫描整个存储库或[仅扫描一组更改](#scan-only-your-changes)，例如分支的差异、拉取请求的差异或单个提交，然后将您选择的发现转化为您自己审查和应用的补丁。

该插件在您的会话中本地运行，每次扫描都会计入您的计划使用限额。如果您想要一个监控您的存储库的托管服务，请参阅 [Claude Security](https://claude.com/product/claude-security) 产品，该产品在企业计划中可用。该插件可以访问托管产品无法访问的代码，例如托管在 GitLab 或 Bitbucket 上的存储库，或在不允许入站连接的网络上的存储库。

该插件也不同于 Claude Code 中已有的审查工具：[security guidance 插件](/docs/zh-CN/security-guidance)在 Claude 编写代码时审查代码，[`/security-review`](/docs/zh-CN/commands#all-commands) 对您的分支运行单次扫描，[Code Review](/docs/zh-CN/code-review) 审查拉取请求。有关这些层如何堆叠的信息，请参阅[该插件如何与其他安全工具配合](#how-the-plugin-fits-with-other-security-tools)。

<h2 id="prerequisites">
  前置条件
</h2>

要运行该插件，您需要：

* Claude Code v2.1.154 或更高版本，在付费计划上，用于扫描用来编排其代理的[动态工作流](/docs/zh-CN/workflows)。在 Pro 上，从 `/config` 中的"动态工作流"行启用它们。
* Python 3.9.6 或更高版本在您的 `PATH` 上可用，名称为 `python3`。使用 `python3 --version` 检查。该插件的工具仅使用 Python 标准库，因此不会安装任何内容。
* Linux、macOS 或 Windows。
* Git，用于更改扫描和将发现转化为补丁；这些任务不支持其他版本控制系统。完整扫描在任何目录中都有效，无论是否有版本控制。

<h2 id="install-the-plugin">
  安装插件
</h2>

在 Claude Code 会话中，从[官方 Anthropic 市场](/docs/zh-CN/discover-plugins#official-anthropic-marketplace)安装：

```text theme={null}
/plugin install claude-security@claude-plugins-official
```

如果安装失败，修复方法取决于 Claude Code 报告的消息：

* 如果它报告 `Marketplace "claude-plugins-official" not found`，使用 `/plugin marketplace add anthropics/claude-plugins-official` 添加市场，然后重试安装。
* 如果它报告在市场中找不到该插件，检查插件名称是否有拼写错误，然后使用 `/plugin marketplace update claude-plugins-official` 刷新您的本地市场副本，并重试安装。

然后使用 `/reload-plugins` 在当前会话中激活该插件，这会应用待处理的插件更改而无需重启：

```text theme={null}
/reload-plugins
```

该插件现在处于活跃状态，您已准备好[扫描和修复您的代码库](#scan-and-fix-your-codebase)。

<h3 id="uninstall-the-plugin">
  卸载插件
</h3>

要删除该插件，从 `/plugin` 菜单卸载它，或在您的终端中运行 `claude plugin uninstall claude-security`。

<h2 id="scan-and-fix-your-codebase">
  扫描和修复您的代码库
</h2>

该插件添加了一个命令 `/claude-security`，它打开其三个任务的菜单：扫描代码库、扫描一组更改和建议补丁。标准流程运行完整扫描，然后将其发现转化为补丁：

<Steps>
  <Step title="打开 Claude Security 菜单">
    运行 `/claude-security` 并选择 **Scan codebase**。
  </Step>

  <Step title="选择要扫描的内容">
    该插件首先读取您的存储库，然后提供整个存储库或聚焦区域，每个选项都说明了文件计数和相对成本。选择整个存储库，或回答"我不知道"，插件会为您的存储库大小选择一个合理的默认值。
  </Step>

  <Step title="确认运行">
    扫描可能需要一段时间，可能使用大量令牌，并需要在完成期间保持 Claude Code 打开。在您确认之前，不会运行任何内容。
  </Step>

  <Step title="阅读报告">
    扫描运行时，它会在每个阶段开始时报告，详细信息可在 [`/workflows`](/docs/zh-CN/workflows) 下获得。结果进入您的存储库中的时间戳目录，在[阅读扫描结果](#read-the-scan-results)中描述。
  </Step>

  <Step title="将发现转化为补丁">
    再次运行 `/claude-security` 并选择 **Suggest patches**，然后选择要解决的发现。审查过的补丁进入报告的 `patches/` 文件夹；[修复发现](#fix-findings)涵盖了每个补丁如何构建和审查。
  </Step>

  <Step title="应用您接受的补丁">
    从您的 shell 中使用 `git apply` 应用每个补丁，在其自己的拉取请求中。补丁永远不会自动应用。
  </Step>
</Steps>

您不必从菜单开始：直接要求一个任务，作为命令的参数，例如 `/claude-security scan my branch`，或用纯语言，例如"scan commit abc1234"。该插件在[自动模式](/docs/zh-CN/permission-modes)中效果最佳，这允许扫描的代理在每一步都无需权限提示地进行；当任务开始时，该插件会提醒您如何启用它。

<h3 id="scan-only-your-changes">
  仅扫描您的更改
</h3>

当您的分支有其基础没有的提交时，`/claude-security` 菜单会提供仅扫描该差异的选项，以便您可以在合并前检查分支。您也可以扫描您的一个开放拉取请求，或通过要求它来扫描单个提交，例如"scan commit abc1234"。仅扫描已提交的更改：首先提交或 stash 进行中的编辑，或运行完整扫描，它读取工作树。

更改扫描需要 git 存储库；未版本化目录的完整扫描仍然有效。查找您的开放拉取请求是唯一到达网络的步骤，仅当您的会话已有权限运行 GitHub CLI 且 `gh` 已登录时才提供。

<h3 id="scope-large-repositories">
  限制大型存储库的范围
</h3>

在大型存储库上，一次扫描一个区域而不是整个树。选择插件提供的聚焦范围之一，例如您的 API 层或您的身份验证代码，运行会根据您选择的内容调整大小。报告的覆盖部分说明了什么被检查了，什么没有。随时在不同区域运行另一次扫描。

<h3 id="read-the-scan-results">
  阅读扫描结果
</h3>

每次扫描都会将其结果写入您的存储库中的时间戳 `CLAUDE-SECURITY-<timestamp>/` 目录：

* **`CLAUDE-SECURITY-RESULTS.md`**：报告，包含每个发现的 ID，例如 `F1`，加上其影响、利用场景、严重性、置信度和建议
* **`CLAUDE-SECURITY-RESULTS.jsonl`**：相同的发现以机器可读的形式，每行一个 JSON 对象
* **`CLAUDE-SECURITY-REVISION-<commit>.json`**：修订戳，记录扫描了哪个提交、以什么工作量、未提交的更改是否是扫描树的一部分，以及运行的验证程度如何，因此报告始终与它描述的代码相关联。版本控制外的扫描在提交位置戳上 `UNVERSIONED`

该目录是扫描对您的检出所做的唯一更改，它有自己的 `.gitignore`，因此随意的 `git add` 永远不会将报告扫入提交。要在历史中保留报告以供审计跟踪，删除那一个 `.gitignore` 文件并像任何其他文件一样提交目录。

发现仅在独立验证代理分析它们后才出现在报告中，这使报告简短且值得阅读。扫描是非确定性的：同一代码的两次扫描可能会发现不同的发现。定期运行扫描，并使用修订戳将每个报告归属于它覆盖的确切代码和设置。

<h2 id="fix-findings">
  修复发现
</h2>

通过从 `/claude-security` 菜单选择 **Suggest patches** 开始修复流程，或用纯语言要求，例如"fix finding F3"，然后选择要解决的报告中的哪些发现。补丁是针对已提交的代码构建的，报告必须仍然描述您拥有的代码：其代码已更改的发现会被跳过并附注，插件会提供新扫描而不是从陈旧报告修补。每个补丁都在您的存储库的临时副本中起草，因此您的源文件保持不变，直到您自己应用补丁。

在交付前，每个补丁都由独立于编写它的代理的代理审查，当代码有测试时它会针对更改运行您的项目测试，并自行读取差异以查看它可能引入的任何新内容。仅当该审查可以保证更改解决了一个发现、不引入新漏洞并保持其他行为不变时，才会编写补丁。当它无法保证所有三个时，您会得到一个简短的注释解释原因，而不是补丁。

<h3 id="patches-are-never-applied-automatically">
  补丁永远不会自动应用
</h3>

应用补丁始终是您的决定。补丁进入报告的 `patches/` 文件夹，每个发现一个 `F<n>.patch`，旁边有一个注释解释更改。从您的 shell 应用一个，或要求 Claude 应用它并打开拉取请求：

```bash theme={null}
git apply CLAUDE-SECURITY-<timestamp>/patches/F1.patch
```

当修补的代码没有测试时，补丁的注释会说明这一点，因此您知道其审查在没有测试通过的情况下运行。在其自己的拉取请求中应用每个补丁，以便可以独立审查和测试。

<h2 id="how-the-plugin-fits-with-other-security-tools">
  该插件如何与其他安全工具配合
</h2>

Claude Security 插件是深度扫描层，在纵深防御堆栈中，与[security guidance 插件](/docs/zh-CN/security-guidance)、[`/security-review`](/docs/zh-CN/commands#all-commands)、[Code Review](/docs/zh-CN/code-review)、托管的 [Claude Security](https://claude.com/product/claude-security) 产品和您现有的扫描器一起：

| 阶段      | 工具                                                                          | 覆盖内容                        |
| :------ | :-------------------------------------------------------------------------- | :-------------------------- |
| 在会话中    | [Security guidance 插件](/docs/zh-CN/security-guidance)                            | Claude 编写的代码中的常见漏洞，在同一会话中修复 |
| 按需，单次扫描 | [`/security-review`](/docs/zh-CN/commands#all-commands)                          | 当前分支上的一次性安全扫描               |
| 按需，深度扫描 | Claude Security 插件                                                          | 存储库或差异的多代理扫描，具有独立审查的发现和补丁   |
| 在拉取请求上  | [Code Review](/docs/zh-CN/code-review)，Team 和 Enterprise 计划                      | 具有完整代码库上下文的多代理正确性和安全审查      |
| 托管      | [Claude Security](https://claude.com/product/claude-security)，Enterprise 计划 | 监控连接存储库的托管扫描                |
| 在 CI 中  | 您现有的静态分析和依赖扫描器                                                              | 特定于语言的规则、供应链检查和策略执行         |

该插件不会替换您现有的源代码安全工具。与静态分析、依赖扫描和代码审查一起运行它：它以人类安全研究人员的方式推理您的代码，这补充了这些工具提供的确定性检查。

<h2 id="troubleshooting">
  故障排除
</h2>

**`/claude-security` 菜单打开时出现 Python 警告。** 该插件需要 `python3` 3.9.6 或更高版本在您的 `PATH` 上。当它根本找不到 `python3` 时，菜单警告 Claude Security 在安装一个之前不会工作；当您的 `PATH` 上的第一个 `python3` 较旧时，警告会命名它找到的版本。安装 Python 3，或在您的 `PATH` 上放置一个较新的 `python3`，然后启动一个新会话。

**使用 Fable 5 时，您可能会看到 "Fable 5's safeguards flagged this message"。** 由于 Fable 5 的网络安全安全分类器，某些模型活动将被阻止并自动降级到 Opus。这是预期的，扫描应该仍然成功完成。

<h2 id="related-resources">
  相关资源
</h2>

要深入了解此页面涉及的部分：

* [Security guidance 插件](/docs/zh-CN/security-guidance)：在同一会话中，在 Claude 编写代码时捕获问题
* [Code Review](/docs/zh-CN/code-review)：设置 PR 时间多代理审查
* [Claude Security](https://claude.com/product/claude-security)：监控连接存储库的托管服务
* [Claude Code 安全](/docs/zh-CN/security)：Claude Code 如何处理信任、权限和保护措施
* [发现和安装插件](/docs/zh-CN/discover-plugins#official-anthropic-marketplace)：浏览其他官方插件
