> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 在 Claude 编写代码时捕获安全问题

> 安装 security-guidance 插件，让 Claude 在编写代码时自动审查其代码更改中的漏洞，并在同一会话中修复这些问题。

security-guidance 插件让 Claude 在工作时审查自己的代码更改中是否存在常见漏洞，并在同一会话中修复发现的问题。该插件可以捕获注入、不安全的反序列化和不安全的 DOM API 等问题，防止代码进入拉取请求，减少人工审查人员的工作量。

安装后，该插件会自动运行。无需调用任何内容，也无需记住单独的命令。

该插件是 [Code Review](/docs/zh-CN/code-review) 的会话内伴侣，Code Review 在拉取请求上运行。该插件减少了进入 PR 的内容。Code Review 捕获遗漏的内容。有关该插件如何与按需审查和 CI 扫描配合使用的信息，请参阅 [此插件如何与其他安全工具配合](#how-this-fits-with-other-security-tools)。

<h2 id="prerequisites">
  前置条件
</h2>

* Claude Code CLI 版本 2.1.144 或更高版本
* Python 3.8 或更高版本在您的 `PATH` 中。该插件按顺序尝试 `python3`、`python` 和 `py -3`
* 您工作目录的 git 存储库。回合结束和提交审查针对 git 状态进行 diff，在存储库外会静默跳过。每次编辑模式检查在任何地方都有效

首次运行时，该插件在 `~/.claude/security/` 下创建虚拟环境，并将 Claude Agent SDK 安装到其中，这需要 `pip` 和网络访问。如果该安装失败，提交审查会回退到单次审查而不是代理审查。在 Windows 上，虚拟环境步骤被跳过，因此代理提交审查仅在 `claude-agent-sdk` 已经可导入时运行，否则以相同方式回退。

<h2 id="install-the-plugin">
  安装插件
</h2>

在 Claude Code 会话中，从 [官方 Anthropic 市场](/docs/zh-CN/discover-plugins#official-anthropic-marketplace) 安装：

```text theme={null}
/plugin install security-guidance@claude-plugins-official
```

安装会提示输入范围。选择用户范围以将插件写入您的用户设置，这样它会在您在此计算机上启动的每个新本地会话中加载。如果 Claude Code 报告找不到市场，请先运行 `/plugin marketplace add anthropics/claude-plugins-official`，然后重试安装。

然后在当前会话中使用 `/reload-plugins` 激活它，这会应用待处理的插件更改而无需重启：

```text theme={null}
/reload-plugins
```

<h3 id="enable-in-cloud-sessions-and-shared-repositories">
  在云会话和共享存储库中启用
</h3>

用户范围的插件不会进入 [网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web)，因为这些会话在 Anthropic 基础设施上运行，而不是在您的计算机上。要在那里启用该插件，或为克隆存储库的所有人打开它，请在项目的已检入设置中声明它：

```json .claude/settings.json theme={null}
{
  "enabledPlugins": {
    "security-guidance@claude-plugins-official": true
  }
}
```

管理员可以通过在 [托管设置](/docs/zh-CN/admin-setup) 中设置 [`enabledPlugins`](/docs/zh-CN/settings#plugin-settings) 来在组织范围内启用该插件。

<h2 id="what-the-plugin-checks">
  插件检查的内容
</h2>

该插件在三个点审查 Claude 的工作，每个点的深度不同：

* [在每次文件编辑时](#on-each-file-edit)：对危险调用的快速模式匹配，无需模型调用
* [在每个回合结束时](#at-the-end-of-each-turn)：对该回合更改的所有内容进行后台模型审查
* [在 Claude 进行的每次提交或推送时](#on-each-commit-or-push-claude-makes)：读取周围代码的更深层代理审查

您可以通过 [添加自己的规则](#add-your-own-rules) 来扩展每一层。内置检查无法单独删除，但您可以 [独立禁用每一层](#disable-or-uninstall)。

<h3 id="on-each-file-edit">
  在每次文件编辑时
</h3>

当 Claude 写入文件时，该插件会扫描新内容中的已知危险模式。这是一个没有模型调用的模式匹配，因此不会增加使用成本。

示例模式类别：

* 动态代码执行：`eval(`、`new Function`、`os.system`、`child_process.exec`
* 不安全的反序列化：`pickle`
* DOM 注入：`dangerouslySetInnerHTML`、`.innerHTML =`、`document.write`
* 工作流文件：`.github/workflows/` 下的编辑，可以授予存储库级权限

检查在编辑完成后运行，并将警告附加到 Claude 的下一步上下文中。每个警告在每个会话中每个文件每个模式触发一次，因此同一文件中的重复匹配不会淹没对话。

您可以使用 `security-patterns.yaml` 文件 [向此层添加自己的模式](#add-custom-per-edit-patterns)。

<h3 id="at-the-end-of-each-turn">
  在每个回合结束时
</h3>

一个回合是 Claude 响应的一轮：您发送消息，Claude 工作并回复，回合结束。在每个回合之后，该插件计算工作树中在回合期间更改的所有内容的 git diff，包括来自 Claude 的编辑工具、Bash 命令和子代理的更改，并将其发送到专注于安全的单独 Claude 审查。审查在后台运行，因此 Claude 的回复不会延迟。如果审查发现问题，Claude 会被重新提示发现的问题并作为后续行动解决它们。

这捕获了字符串匹配无法捕获的问题，例如：

* 授权绕过
* 不安全的直接对象引用
* 注入
* 服务器端请求伪造
* 弱密码学

您可以在会话中直接看到发现和 Claude 的解决方案。审查涵盖每个回合最多 30 个更改的文件，在最多连续三次后才会让步给您。

<h3 id="on-each-commit-or-push-claude-makes">
  在 Claude 进行的每次提交或推送时
</h3>

当 Claude 通过其 Bash 工具运行 `git commit` 或 `git push` 时，该插件在后台运行对更改的更深层代理审查。此审查读取周围代码，包括调用者、清理程序和相关文件，以决定发现是否真实，然后再报告它。额外的上下文可以降低在隔离时看起来危险但在您的代码库中是安全的模式上的误报。

此层仅在 Claude 通过其 Bash 工具进行的提交和推送时触发。您从自己的 shell 运行的提交，包括会话内的 `!` shell 转义，不会被审查。提交和推送审查的上限为每滚动小时 20 次。如果提交审查的发现重复了回合结束审查已经报告的内容，Claude 不会被重新提示，因此干净的提交不会从此层产生可见的输出。

<h3 id="review-independence-and-limits">
  审查独立性和限制
</h3>

该插件不会要求编写代码的同一 Claude 实例对自己进行评分。每次编辑检查是一个确定性的字符串匹配，不涉及模型。回合结束和提交审查作为单独的 Claude 调用运行，具有新鲜的上下文和以安全为重点的提示：审查者从 diff 开始，对原始方法没有投入，仅被指示查找问题。

这些层都不会阻止写入或提交。发现作为指令到达编写 Claude，Claude 在对话中解决它们，审查模型可能会遗漏问题。将该插件视为深度防御的一层，而不是完整的安全解决方案。请参阅 [此插件如何与其他安全工具配合](#how-this-fits-with-other-security-tools)。

<h2 id="add-your-own-rules">
  添加您自己的规则
</h2>

该插件有两个扩展点：用于模型支持的审查的 Markdown 指导文件，以及用于每次编辑字符串匹配的 YAML 或 JSON 模式文件。两者都是附加的。您可以添加检查，但无法从这些文件中禁用内置检查。

<h3 id="add-guidance-for-the-model-backed-reviews">
  为模型支持的审查添加指导
</h3>

在您的项目中创建 `.claude/claude-security-guidance.md`，并用纯语言描述您的威胁模型和审查清单。模型支持的审查将其作为附加上下文加载，与内置漏洞清单一起。

以下示例适用于具有角色门控管理员路由和客户数据日志记录策略的网络服务：

```markdown .claude/claude-security-guidance.md theme={null}
# 此存储库的安全指导

- 不要在 INFO 级别或更高级别记录 `customer_id` 或 `account_number`。
- `/admin` 下的所有路由必须在任何数据库读取之前调用 `require_role("admin")`。
- 使用 `crypto.timingSafeEqual` 进行令牌比较，而不是 `===`。
```

这些规则是审查者的指导，而不是确定性的护栏。该插件将违规作为发现呈现给 Claude 以修复，但它不会阻止写入或保证捕获每个违规。指导仅是附加的：说要忽略漏洞类别的规则不会抑制这些发现。对于硬执行，将该插件与 [阻止编辑受保护文件的钩子](/docs/zh-CN/hooks-guide#block-edits-to-protected-files) 或 CI 检查配对。

<h3 id="add-custom-per-edit-patterns">
  添加自定义的每次编辑模式
</h3>

创建 `.claude/security-patterns.yaml` 以向 [每次编辑模式检查](#on-each-file-edit) 添加正则表达式或子字符串规则。这些作为确定性字符串匹配与内置模式一起运行：

```yaml .claude/security-patterns.yaml theme={null}
patterns:
  - rule_name: internal_api_key
    substrings: ["sk_live_", "AKIA"]
    reminder: "硬编码的 API 密钥前缀。从密钥管理器加载凭证。"
  - rule_name: tenant_unfiltered_query
    regex: "\\.objects\\.all\\(\\)"
    paths: ["**/src/tenants/**"]
    reminder: "多租户代码必须按 org_id 过滤。"
```

| 字段              | 类型  | 描述                                                         |
| :-------------- | :-- | :--------------------------------------------------------- |
| `rule_name`     | 字符串 | 警告中显示的标识符                                                  |
| `reminder`      | 字符串 | 附加到 Claude 上下文的警告文本，上限为 1 KB                               |
| `regex`         | 字符串 | 针对编辑内容匹配的 Python 正则表达式                                     |
| `substrings`    | 列表  | 文字子字符串；提供此项或 `regex`                                       |
| `paths`         | 列表  | 可选的 glob 模式；规则仅适用于匹配的文件。Glob 针对完整文件路径匹配，因此在项目相对模式前加上 `**/` |
| `exclude_paths` | 列表  | 可选的 glob 模式以跳过；与 `paths` 相同的匹配                             |

该插件还读取 `.claude/security-patterns.yml` 和 `.claude/security-patterns.json`，具有相同的架构。JSON 适用于任何 Python 安装。YAML 形式需要 PyYAML 可导入，该插件不会为您安装。该插件加载最多 50 个自定义规则，并跳过看起来容易发生灾难性回溯的正则表达式。

<h3 id="rule-file-lookup-locations">
  规则文件查找位置
</h3>

该插件在相同位置查找 `claude-security-guidance.md` 和 `security-patterns.yaml`，与插件的启用方式无关：

| 范围   | 路径                                          | 注释                |
| :--- | :------------------------------------------ | :---------------- |
| 用户   | `~/.claude/claude-security-guidance.md`     | 适用于您计算机上的每个项目     |
| 项目   | `.claude/claude-security-guidance.md`       | 与存储库一起检入          |
| 项目本地 | `.claude/claude-security-guidance.local.md` | Gitignored，用于个人覆盖 |

该插件加载所有存在的位置并连接它们，指导文件的组合上限为 8 KB。管理员可以通过设备管理将用户范围文件推送到 `~/.claude/` 来分发组织范围的规则。相同的路径适用于 `security-patterns.yaml`。

<h2 id="usage-cost">
  使用成本
</h2>

[每次编辑模式检查](#on-each-file-edit) 不进行模型调用，不增加成本。[回合结束](#at-the-end-of-each-turn) 和 [提交](#on-each-commit-or-push-claude-makes) 审查各自花费额外的模型使用，计入您的 [使用](/docs/zh-CN/costs)，就像任何其他 Claude 请求一样。提交审查是代理性的，每次提交可能需要多个模型回合，上限为每滚动小时 20 次审查。预期大约每个更改文件的回合有一次审查调用，每次提交有一次更深层审查，两者都受上述上限的约束。

两个模型支持的审查默认使用 Claude Opus 4.7。设置 `SECURITY_REVIEW_MODEL` 为回合结束审查选择不同的模型，设置 `SG_AGENTIC_MODEL` 为提交审查。

该插件在所有计划上都可用。

<h2 id="disable-or-uninstall">
  禁用或卸载
</h2>

要关闭单个层同时保持其余部分，请设置匹配的环境变量：

| 变量                              | 效果                                                 |
| :------------------------------ | :------------------------------------------------- |
| `ENABLE_PATTERN_RULES=0`        | 禁用 [每次编辑模式检查](#on-each-file-edit)                  |
| `ENABLE_STOP_REVIEW=0`          | 禁用 [回合结束 diff 审查](#at-the-end-of-each-turn)        |
| `ENABLE_COMMIT_REVIEW=0`        | 禁用 [提交和推送审查](#on-each-commit-or-push-claude-makes) |
| `ENABLE_CODE_SECURITY_REVIEW=0` | 一次禁用所有模型支持的审查                                      |
| `SECURITY_GUIDANCE_DISABLE=1`   | 禁用插件而不卸载                                           |

要在用户范围内暂停插件：

```text theme={null}
/plugin disable security-guidance@claude-plugins-official
```

要从用户范围中删除它：

```text theme={null}
/plugin uninstall security-guidance@claude-plugins-official
```

如果插件通过项目的 `.claude/settings.json` 启用，从 `/plugin` 禁用它会将覆盖写入您的 `.claude/settings.local.json`，而不是编辑已检入的文件，因此该插件对您保持关闭，而不影响队友。同一对话框还提供了通过从共享的 `.claude/settings.json` 中删除插件来为所有人卸载该插件的选项；该选项需要 Claude Code v2.1.203 或更高版本。如果它通过 [托管设置](/docs/zh-CN/admin-setup) 启用，只有管理员可以禁用它。

<h2 id="how-the-plugin-integrates-with-claude-code">
  插件如何与 Claude Code 集成
</h2>

该插件完全基于 [hooks](/docs/zh-CN/hooks)，这是在 Claude 循环中的特定点运行您自己的代码的机制。它注册：

| Hook 事件                                                | 目的                   |
| :----------------------------------------------------- | :------------------- |
| `SessionStart`                                         | 引导插件的 Python 环境      |
| `UserPromptSubmit`                                     | 捕获回合结束审查 diff 的工作树基线 |
| `PostToolUse` 在 `Edit`、`Write` 和 `NotebookEdit` 上      | 每次编辑模式匹配             |
| `Stop`                                                 | 回合结束 diff 审查，在后台运行   |
| `PostToolUse` 在 `Bash` 上，过滤到 `git commit` 和 `git push` | 提交和推送审查，在后台运行        |

如果您构建自己的 hooks，[插件的源代码](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance) 是从 hook 运行单独模型调用并将结果反馈给会话的工作示例。

<h2 id="how-this-fits-with-other-security-tools">
  此插件如何与其他安全工具配合
</h2>

该插件是深度防御方法中的一层。它最早捕获问题，当代码仍在编辑器中时，但它不是保证，也不能替代后来的检查。典型的堆栈：

| 阶段     | 工具                                                     | 覆盖内容                        |
| :----- | :----------------------------------------------------- | :-------------------------- |
| 在会话中   | Security guidance 插件                                   | Claude 编写的代码中的常见漏洞，在同一会话中修复 |
| 按需     | [`/security-review`](/docs/zh-CN/commands#all-commands)     | 对当前分支的一次性安全检查，在您要求时运行       |
| 在拉取请求上 | [Code Review](/docs/zh-CN/code-review)，Team 和 Enterprise 计划 | 具有完整代码库上下文的多代理正确性和安全审查      |
| 在 CI 中 | 您现有的静态分析和依赖扫描器                                         | 语言特定的规则、供应链检查和该插件不尝试的策略执行   |

每个后来的阶段捕获早期阶段遗漏的内容。该插件的价值在于减少到达它们的数量，而不是消除对它们的需求。

<h2 id="troubleshooting">
  故障排除
</h2>

该插件将运行时诊断写入 `~/.claude/security/log.txt`。如果审查未出现，请先检查那里。

审查层在对话中跳过而不显示消息的常见原因：

* 目录不是 git 存储库：回合结束和提交审查需要 git 状态，在存储库外跳过
* 会话没有 Anthropic 身份验证：模型支持的审查跳过，仅每次编辑模式检查运行
* `security-patterns.yaml` 文件存在但 PyYAML 不可导入：文件被忽略。改用 `security-patterns.json`

<h2 id="related-resources">
  相关资源
</h2>

要深入了解此页面涉及的部分：

* [Code Review](/docs/zh-CN/code-review)：设置 PR 时间多代理审查
* [使用 hooks 自动化工作流](/docs/zh-CN/hooks-guide)：在相同的生命周期点构建您自己的检查
* [发现和安装插件](/docs/zh-CN/discover-plugins#official-anthropic-marketplace)：浏览其他官方插件
