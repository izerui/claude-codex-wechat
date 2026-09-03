> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Claude 如何记住你的项目

> 使用 CLAUDE.md 文件为 Claude 提供持久指令，并让 Claude 通过自动记忆功能自动积累学习内容。

每个 Claude Code 会话都从一个全新的上下文窗口开始。两种机制可以跨会话传递知识：

* **CLAUDE.md 文件**：你编写的指令，为 Claude 提供持久上下文
* **自动记忆**：Claude 根据你的更正和偏好自己编写的笔记

本页面涵盖以下内容：

* [编写和组织 CLAUDE.md 文件](#claude-md-files)
* [使用 `.claude/rules/` 将规则范围限定到特定文件类型](#organize-rules-with-claude/rules/)
* [配置自动记忆](#auto-memory)，使 Claude 自动记笔记
* [故障排除](#troubleshoot-memory-issues)，当指令未被遵循时

<h2 id="claude-md-vs-auto-memory">
  CLAUDE.md 与自动记忆
</h2>

Claude Code 有两个互补的记忆系统。两者都在每次对话开始时加载。Claude 将它们视为上下文，而不是强制配置。要阻止某个操作，无论 Claude 决定什么，请改用 [PreToolUse hook](/docs/zh-CN/hooks-guide)。你的指令越具体和简洁，Claude 遵循它们的一致性就越高。

|          | CLAUDE.md 文件  | 自动记忆                   |
| :------- | :------------ | :--------------------- |
| **谁编写**  | 你             | Claude                 |
| **包含内容** | 指令和规则         | 学习和模式                  |
| **范围**   | 项目、用户或组织      | 每个工作树，跨 worktrees 共享   |
| **加载到**  | 每个会话          | 每个会话（前 200 行或 25KB）    |
| **用于**   | 编码标准、工作流、项目架构 | 构建命令、调试见解、Claude 发现的偏好 |

当你想指导 Claude 的行为时，使用 CLAUDE.md 文件。自动记忆让 Claude 从你的更正中学习，无需手动操作。

Subagents 也可以维护自己的自动记忆。有关详细信息，请参阅 [subagent 配置](/docs/zh-CN/sub-agents#enable-persistent-memory)。

<h2 id="claude-md-files">
  CLAUDE.md 文件
</h2>

CLAUDE.md 文件是 markdown 文件，为项目、你的个人工作流或整个组织为 Claude 提供持久指令。你用纯文本编写这些文件；Claude 在每个会话开始时读取它们。

<h3 id="when-to-add-to-claude-md">
  何时添加到 CLAUDE.md
</h3>

将 CLAUDE.md 视为你写下你本来会重新解释的内容的地方。在以下情况下添加到它：

* Claude 第二次犯同样的错误
* 代码审查发现 Claude 应该了解这个代码库的内容
* 你在聊天中输入的相同更正或澄清是你上个会话输入的
* 新队友需要相同的上下文才能提高生产力

将其保持为 Claude 应该在每个会话中保持的事实：构建命令、约定、项目布局、"总是做 X"规则。如果一个条目是多步骤过程或仅对代码库的一部分重要，将其移到 [skill](/docs/zh-CN/skills) 或 [路径范围规则](#organize-rules-with-claude/rules/) 中。[扩展概述](/docs/zh-CN/features-overview#build-your-setup-over-time)涵盖何时使用每种机制。

<h3 id="choose-where-to-put-claude-md-files">
  选择 CLAUDE.md 文件的位置
</h3>

CLAUDE.md 文件可以位于多个位置，每个位置有不同的范围。下表按加载顺序列出它们，从最广泛的范围到最具体的范围，因此项目指令在用户指令之后出现在上下文中。

| 范围       | 位置                                                                                                                                                                    | 目的                        | 用例示例             | 共享对象         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------- | ------------ |
| **托管策略** | • macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`<br />• Linux 和 WSL: `/etc/claude-code/CLAUDE.md`<br />• Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | 由 IT/DevOps 管理的组织范围指令     | 公司编码标准、安全策略、合规要求 | 组织中的所有用户     |
| **用户指令** | `~/.claude/CLAUDE.md`                                                                                                                                                 | 所有项目的个人偏好                 | 代码样式偏好、个人工具快捷方式  | 仅你（所有项目）     |
| **项目指令** | `./CLAUDE.md` 或 `./.claude/CLAUDE.md`                                                                                                                                 | 项目的团队共享指令                 | 项目架构、编码标准、常见工作流  | 通过源代码控制的团队成员 |
| **本地指令** | `./CLAUDE.local.md`                                                                                                                                                   | 个人项目特定偏好；添加到 `.gitignore` | 你的沙箱 URL、首选测试数据  | 仅你（当前项目）     |

工作目录上方目录层次结构中的 CLAUDE.md 和 CLAUDE.local.md 文件在启动时完整加载。子目录中的文件在 Claude 读取这些目录中的文件时按需加载。有关完整的解析顺序，请参阅 [CLAUDE.md 文件如何加载](#how-claude-md-files-load)。

对于大型项目，你可以使用 [项目规则](#organize-rules-with-claude/rules/) 将指令分解为特定主题的文件。规则让你将指令范围限定到特定文件类型或子目录。

<h3 id="set-up-a-project-claude-md">
  设置项目 CLAUDE.md
</h3>

项目 CLAUDE.md 可以存储在 `./CLAUDE.md` 或 `./.claude/CLAUDE.md` 中。创建此文件并添加适用于在项目上工作的任何人的指令：构建和测试命令、编码标准、架构决策、命名约定和常见工作流。这些指令通过版本控制与你的团队共享，因此请关注项目级标准而不是个人偏好。

<Tip>
  运行 `/init` 自动生成起始 CLAUDE.md。Claude 分析你的代码库并创建一个包含构建命令、测试指令和它发现的项目约定的文件。如果 CLAUDE.md 已存在，`/init` 会建议改进而不是覆盖它。从那里进行细化，添加 Claude 不会自己发现的指令。

  设置 `CLAUDE_CODE_NEW_INIT=1` 以启用交互式多阶段流程。`/init` 询问要设置哪些工件：CLAUDE.md 文件、skills 和 hooks。然后它使用 subagent 探索你的代码库，通过后续问题填补空白，并在写入任何文件之前呈现可审查的提案。
</Tip>

<h3 id="write-effective-instructions">
  编写有效的指令
</h3>

CLAUDE.md 文件在每个会话开始时加载到上下文窗口中，与你的对话一起消耗令牌。[上下文窗口可视化](/docs/zh-CN/context-window)显示 CLAUDE.md 相对于其余启动上下文的加载位置。因为它们是上下文而不是强制配置，你编写指令的方式会影响 Claude 遵循它们的可靠性。具体、简洁、结构良好的指令效果最好。

**大小**：每个 CLAUDE.md 文件目标在 200 行以下。较长的文件消耗更多上下文并降低遵守度。如果你的指令变得很大，使用 [路径范围规则](#path-specific-rules) 以便指令仅在 Claude 处理匹配文件时加载。你也可以将内容分割成 [导入](#import-additional-files) 以便组织，尽管导入的文件仍然加载并在启动时进入上下文窗口。

**结构**：使用 markdown 标题和项目符号来分组相关指令。Claude 扫描结构的方式与读者相同：有组织的部分比密集段落更容易遵循。

**具体性**：编写具体到足以验证的指令。例如：

* "使用 2 空格缩进"而不是"正确格式化代码"
* "在提交前运行 `npm test`"而不是"测试你的更改"
* "API 处理程序位于 `src/api/handlers/`"而不是"保持文件有组织"

**一致性**：如果两条规则相互矛盾，Claude 可能会任意选择一条。定期审查你的 CLAUDE.md 文件、子目录中的嵌套 CLAUDE.md 文件和 [`.claude/rules/`](#organize-rules-with-claude/rules/) 以删除过时或冲突的指令。在 monorepos 中，使用 [`claudeMdExcludes`](#exclude-specific-claude-md-files) 跳过与你的工作无关的其他团队的 CLAUDE.md 文件。

<h3 id="import-additional-files">
  导入其他文件
</h3>

CLAUDE.md 文件可以使用 `@path/to/import` 语法导入其他文件。导入的文件在启动时展开并加载到上下文中，与引用它们的 CLAUDE.md 一起。

允许相对路径和绝对路径。相对路径相对于包含导入的文件解析，而不是工作目录。导入的文件可以递归导入其他文件，最大深度为四跳。

导入解析跳过 Markdown 代码跨度和围栏代码块。要在你的 CLAUDE.md 中提及路径而不导入它，将其包装在反引号中：写 `` `@README` `` 保持文本字面，而 `@README` 在反引号外导入文件。

要引入 README、package.json 和工作流指南，在你的 CLAUDE.md 中的任何地方使用 `@` 语法引用它们：

```text theme={null}
有关项目概述，请参阅 @README，有关此项目的可用 npm 命令，请参阅 @package.json。

# 其他指令
- git 工作流 @docs/git-instructions.md
```

对于你不想签入版本控制的私人项目偏好，在项目根目录创建 `CLAUDE.local.md`。它与 `CLAUDE.md` 一起加载并以相同方式处理。将 `CLAUDE.local.md` 添加到你的 `.gitignore` 以便它不被提交；运行 `/init` 并选择个人选项会为你做这个。

如果你在同一存储库的多个 git worktrees 中工作，一个被 gitignore 的 `CLAUDE.local.md` 仅存在于你创建它的 worktree 中。要在 worktrees 中共享个人指令，改为从你的主目录导入文件：

```text theme={null}
# 个人偏好
- @~/.claude/my-project-instructions.md
```

<Warning>
  Claude Code 第一次在项目中遇到外部导入时，它会显示一个批准对话框，列出这些文件。如果你拒绝，导入保持禁用状态，对话框不会再出现。
</Warning>

有关组织指令的更结构化方法，请参阅 [`.claude/rules/`](#organize-rules-with-claude/rules/)。

<h3 id="agents-md">
  AGENTS.md
</h3>

Claude Code 读取 `CLAUDE.md`，而不是 `AGENTS.md`。如果你的存储库已经为其他编码代理使用 `AGENTS.md`，创建一个导入它的 `CLAUDE.md`，这样两个工具都可以读取相同的指令而无需重复。你也可以在导入下方添加 Claude 特定的指令。Claude 在会话开始时加载导入的文件，然后附加其余部分：

```markdown CLAUDE.md theme={null}
@AGENTS.md

## Claude Code

对 `src/billing/` 下的更改使用 Plan Mode。
```

一个符号链接也可以工作，如果你不需要添加 Claude 特定的内容：

```bash theme={null}
ln -s AGENTS.md CLAUDE.md
```

在 Windows 上，创建符号链接需要管理员权限或开发者模式，所以改用 `@AGENTS.md` 导入。

在已经有 `AGENTS.md` 的存储库中运行 [`/init`](/docs/zh-CN/commands) 会读取它并将相关部分合并到生成的 `CLAUDE.md` 中。它也读取其他工具配置，如 `.cursorrules`、`.devin/rules/` 和 `.windsurfrules`。

<h3 id="how-claude-md-files-load">
  CLAUDE.md 文件如何加载
</h3>

Claude Code 通过从当前工作目录向上遍历目录树来读取 CLAUDE.md 文件，检查沿途的每个目录是否有 `CLAUDE.md` 和 `CLAUDE.local.md` 文件。这意味着如果你在 `foo/bar/` 中运行 Claude Code，它会从 `foo/bar/CLAUDE.md`、`foo/CLAUDE.md` 和沿途的任何 `CLAUDE.local.md` 文件加载指令。

所有发现的文件被连接到上下文中，而不是相互覆盖。在目录树中，内容从文件系统根目录向下排序到你的工作目录。对于 `foo/bar/` 示例，`foo/CLAUDE.md` 在上下文中出现在 `foo/bar/CLAUDE.md` 之前，因此更接近你启动 Claude 的位置的指令最后被读取。在每个目录中，`CLAUDE.local.md` 在 `CLAUDE.md` 之后附加，因此你的个人笔记是 Claude 在该级别读取的最后内容。

Claude 还在当前工作目录下的子目录中发现 `CLAUDE.md` 和 `CLAUDE.local.md` 文件。它们不是在启动时加载，而是在 Claude 读取这些子目录中的文件时包含。

如果你在一个大型 monorepo 中工作，其他团队的 CLAUDE.md 文件被拾取，使用 [`claudeMdExcludes`](#exclude-specific-claude-md-files) 跳过它们。对于根目录和每个目录的 CLAUDE.md 文件和规则的完整布局，请参阅 [Monorepos 和大型存储库](/docs/zh-CN/large-codebases)。

块级 HTML 注释（`<!-- maintainer notes -->`）在 CLAUDE.md 文件中在内容注入到 Claude 的上下文之前被剥离。使用它们为人类维护者留下笔记，而不在它们上花费上下文令牌。代码块内的注释被保留。当你直接用 Read 工具打开 CLAUDE.md 文件时，注释保持可见。

<h4 id="load-from-additional-directories">
  从其他目录加载
</h4>

`--add-dir` 标志使 Claude 可以访问主工作目录外的其他目录。默认情况下，不加载这些目录中的 CLAUDE.md 文件。

要也从其他目录加载记忆文件，设置 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` 环境变量：

```bash theme={null}
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../shared-config
```

这会从其他目录加载 `CLAUDE.md`、`.claude/CLAUDE.md`、`.claude/rules/*.md` 和 `CLAUDE.local.md`。如果你从 [`--setting-sources`](/docs/zh-CN/cli-reference) 中排除 `local`，`CLAUDE.local.md` 会被跳过。

<h3 id="organize-rules-with-claude/rules/">
  使用 `.claude/rules/` 组织规则
</h3>

对于较大的项目，你可以使用 `.claude/rules/` 目录将指令组织到多个文件中。这使指令保持模块化并更容易让团队维护。规则也可以 [范围限定到特定文件路径](#path-specific-rules)，因此它们仅在 Claude 处理匹配文件时加载到上下文中，减少噪音并节省上下文空间。

<Note>
  规则在每个会话或打开匹配文件时加载到上下文中。对于不需要始终在上下文中的特定任务指令，改用 [skills](/docs/zh-CN/skills)，它仅在你调用它们或 Claude 确定它们与你的提示相关时加载。
</Note>

<h4 id="set-up-rules">
  设置规则
</h4>

在你的项目的 `.claude/rules/` 目录中放置 markdown 文件。每个文件应涵盖一个主题，具有描述性文件名，如 `testing.md` 或 `api-design.md`。所有 `.md` 文件都被递归发现，因此你可以将规则组织到子目录中，如 `frontend/` 或 `backend/`：

```text theme={null}
your-project/
├── .claude/
│   ├── CLAUDE.md           # 主项目指令
│   └── rules/
│       ├── code-style.md   # 代码样式指南
│       ├── testing.md      # 测试约定
│       └── security.md     # 安全要求
```

没有 [`paths` frontmatter](#path-specific-rules) 的规则在启动时加载，优先级与 `.claude/CLAUDE.md` 相同。

<h4 id="path-specific-rules">
  特定路径的规则
</h4>

规则可以使用带有 `paths` 字段的 YAML frontmatter 范围限定到特定文件。这些条件规则仅在 Claude 处理与指定模式匹配的文件时适用。

```markdown theme={null}
---
paths:
  - "src/api/**/*.ts"
---

# API 开发规则

- 所有 API 端点必须包括输入验证
- 使用标准错误响应格式
- 包括 OpenAPI 文档注释
```

没有 `paths` 字段的规则无条件加载并适用于所有文件。路径范围规则在 Claude 读取与模式匹配的文件时触发，而不是在每次工具使用时。从 v2.1.198 起，匹配也适用于 Claude 通过项目目录的符号链接路径到达文件时，例如在符号链接的检出中。

在 `paths` 字段中使用 glob 模式按扩展名、目录或任何组合匹配文件：

| 模式                     | 匹配                     |
| ---------------------- | ---------------------- |
| `**/*.ts`              | 任何目录中的所有 TypeScript 文件 |
| `src/**/*`             | `src/` 目录下的所有文件        |
| `*.md`                 | 项目根目录中的 Markdown 文件    |
| `src/components/*.tsx` | 特定目录中的 React 组件        |

你可以指定多个模式并使用大括号扩展在一个模式中匹配多个扩展名：

```markdown theme={null}
---
paths:
  - "src/**/*.{ts,tsx}"
  - "lib/**/*.ts"
  - "tests/**/*.test.ts"
---
```

Glob 语法将 `[` 视为括号表达式的开始，例如 `[abc]`。一个包含 `[` 的模式无法读作括号表达式，例如 `photos [2024/**`，是无效的：它不匹配任何内容，规则的其他模式继续工作。要匹配文件名中的字面 `[`，将其转义为 `photos \[2024/**`。在 v2.1.207 之前，一个无效模式会导致 Read 工具对规则被评估的每个文件失败，而不是不匹配任何内容。

<h4 id="share-rules-across-projects-with-symlinks">
  使用符号链接跨项目共享规则
</h4>

`.claude/rules/` 目录支持符号链接，因此你可以维护一组共享规则并将它们链接到多个项目中。符号链接被解析并正常加载，循环符号链接被检测并优雅处理。

此示例链接共享目录和单个文件：

```bash theme={null}
ln -s ~/shared-claude-rules .claude/rules/shared
ln -s ~/company-standards/security.md .claude/rules/security.md
```

<h4 id="user-level-rules">
  用户级规则
</h4>

`~/.claude/rules/` 中的个人规则适用于你机器上的每个项目。使用它们来处理不是项目特定的偏好：

```text theme={null}
~/.claude/rules/
├── preferences.md    # 你的个人编码偏好
└── workflows.md      # 你的首选工作流
```

用户级规则在项目规则之前加载，给予项目规则更高的优先级。

<h3 id="manage-claude-md-for-large-teams">
  为大型团队管理 CLAUDE.md
</h3>

对于在团队中部署 Claude Code 的组织，你可以集中指令并控制加载哪些 CLAUDE.md 文件。

<h4 id="deploy-organization-wide-claude-md">
  部署组织范围的 CLAUDE.md
</h4>

组织可以部署一个集中管理的 CLAUDE.md，适用于机器上的所有用户。此文件不能被个人设置排除。

<Steps>
  <Step title="在托管策略位置创建文件">
    * macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`
    * Linux 和 WSL: `/etc/claude-code/CLAUDE.md`
    * Windows: `C:\Program Files\ClaudeCode\CLAUDE.md`
  </Step>

  <Step title="使用你的配置管理系统部署">
    使用 MDM、Group Policy、Ansible 或类似工具在开发者机器上分发文件。有关其他组织范围配置选项，请参阅 [托管设置](/docs/zh-CN/permissions#managed-settings)。
  </Step>
</Steps>

`claudeMd` 键让你将托管 CLAUDE.md 内容直接放入 `managed-settings.json` 中，而不是部署单独的文件。

**范围**：机器上的每个 Claude Code 会话，在每个存储库中。对于存储库特定的指导，改为提交项目 CLAUDE.md。

**优先级**：与托管 CLAUDE.md 文件相同。在用户和项目 CLAUDE.md 之前加载。

**在哪里被遵守**：仅托管和策略设置。在用户、项目或本地设置中设置 `claudeMd` 无效。

下面的示例直接在托管设置文件中添加行为指令：

```json theme={null}
{
  "claudeMd": "Always run `make lint` before committing.\nNever push directly to main."
}
```

托管 CLAUDE.md 和 [托管设置](/docs/zh-CN/settings#settings-files) 服务于不同的目的。使用设置进行技术强制，使用 CLAUDE.md 进行行为指导：

| 关注点             | 配置在                                         |
| :-------------- | :------------------------------------------ |
| 阻止特定工具、命令或文件路径  | 托管设置：`permissions.deny`                     |
| 强制沙箱隔离          | 托管设置：`sandbox.enabled`                      |
| 环境变量和 API 提供商路由 | 托管设置：`env`                                  |
| 身份验证方法和组织锁定     | 托管设置：`forceLoginMethod`、`forceLoginOrgUUID` |
| 代码样式和质量指南       | 托管 CLAUDE.md                                |
| 数据处理和合规提醒       | 托管 CLAUDE.md                                |
| Claude 的行为指令    | 托管 CLAUDE.md                                |

设置规则由客户端强制执行，无论 Claude 决定做什么。CLAUDE.md 指令塑造 Claude 的行为，但不是硬强制层。

<h4 id="exclude-specific-claude-md-files">
  排除特定的 CLAUDE.md 文件
</h4>

在大型 monorepos 中，祖先 CLAUDE.md 文件可能包含与你的工作无关的指令。`claudeMdExcludes` 设置让你按路径或 glob 模式跳过特定文件。

此示例排除顶级 CLAUDE.md 和来自父文件夹的规则目录。将其添加到 `.claude/settings.local.json` 以使排除保持本地到你的机器：

```json theme={null}
{
  "claudeMdExcludes": [
    "**/monorepo/CLAUDE.md",
    "/home/user/monorepo/other-team/.claude/rules/**"
  ]
}
```

模式使用 glob 语法与绝对文件路径匹配。你可以在任何 [设置层](/docs/zh-CN/settings#settings-files)：用户、项目、本地或托管策略配置 `claudeMdExcludes`。数组跨层合并。

托管策略 CLAUDE.md 文件不能被排除。这确保组织范围指令始终适用，无论个人设置如何。

<h2 id="auto-memory">
  自动记忆
</h2>

自动记忆让 Claude 跨会话积累知识，无需你编写任何内容。Claude 在工作时为自己保存笔记：构建命令、调试见解、架构笔记、代码样式偏好和工作流习惯。Claude 不会每个会话都保存内容。它根据信息在未来对话中是否有用来决定什么值得记住。

<h3 id="enable-or-disable-auto-memory">
  启用或禁用自动记忆
</h3>

自动记忆默认开启。要切换它，在会话中打开 `/memory` 并使用自动记忆切换，或在你的项目设置中设置 `autoMemoryEnabled`：

```json theme={null}
{
  "autoMemoryEnabled": false
}
```

要通过环境变量禁用自动记忆，设置 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`。

<h3 id="storage-location">
  存储位置
</h3>

每个项目在 `~/.claude/projects/<project>/memory/` 获得自己的记忆目录。`<project>` 路径来自 git 存储库，因此同一存储库中的所有 worktrees 和子目录共享一个自动记忆目录。在 git 存储库外，改用项目根目录。

要将自动记忆存储在不同位置，在你的 `settings.json` 中设置 `autoMemoryDirectory`。它从任何[设置范围](/docs/zh-CN/settings#settings-precedence)读取：用户、项目、本地、策略或 `--settings`。

```json theme={null}
{
  "autoMemoryDirectory": "~/my-custom-memory-dir"
}
```

该值必须是绝对路径或以 `~/` 开头。当在项目的 `.claude/settings.json` 或 `.claude/settings.local.json` 中设置时，该值仅在你接受该文件夹的工作区信任对话后才被采用，这与管理 hooks 的门相同。

目录包含一个 `MEMORY.md` 入口点和可选的主题文件：

```text theme={null}
~/.claude/projects/<project>/memory/
├── MEMORY.md          # 简洁索引，加载到每个会话
├── debugging.md       # 关于调试模式的详细笔记
├── api-conventions.md # API 设计决策
└── ...                # Claude 创建的任何其他主题文件
```

`MEMORY.md` 充当记忆目录的索引。Claude 在你的会话中读取和写入此目录中的文件，使用 `MEMORY.md` 跟踪存储的内容。

自动记忆是机器本地的。同一 git 存储库中的所有 worktrees 和子目录共享一个自动记忆目录。文件不在机器或云环境之间共享。

<h3 id="how-it-works">
  它如何工作
</h3>

`MEMORY.md` 的前 200 行或前 25KB（以先到者为准）在每次对话开始时加载。超过该阈值的内容在会话开始时不加载。Claude 通过将详细笔记移到单独的主题文件中来保持 `MEMORY.md` 简洁。

此限制仅适用于 `MEMORY.md`。CLAUDE.md 文件无论长度如何都完整加载，尽管较短的文件产生更好的遵守度。

主题文件如 `debugging.md` 或 `patterns.md` 在启动时不加载。Claude 在需要信息时使用其标准文件工具按需读取它们。

Claude 在你的会话中读取和写入记忆文件。当你在 Claude Code 界面中看到"Writing memory"或"Recalled memory"时，Claude 正在主动更新或读取 `~/.claude/projects/<project>/memory/`。

<h3 id="audit-and-edit-your-memory">
  审计和编辑你的记忆
</h3>

自动记忆文件是纯 markdown，你可以随时编辑或删除。运行 [`/memory`](#view-and-edit-with-%2Fmemory) 从会话中浏览和打开记忆文件。

<h2 id="view-and-edit-with-/memory">
  使用 `/memory` 查看和编辑
</h2>

`/memory` 命令列出在你当前会话中加载的所有 CLAUDE.md、CLAUDE.local.md 和规则文件，让你切换自动记忆开或关，并提供打开自动记忆文件夹的链接。选择任何文件在你的编辑器中打开它。

当你要求 Claude 记住某些内容时，如"总是使用 pnpm，而不是 npm"或"记住 API 测试需要本地 Redis 实例"，Claude 将其保存到自动记忆。要改为添加指令到 CLAUDE.md，直接要求 Claude，如"将其添加到 CLAUDE.md"，或通过 `/memory` 自己编辑文件。

<h2 id="troubleshoot-memory-issues">
  故障排除记忆问题
</h2>

这些是 CLAUDE.md 和自动记忆最常见的问题，以及调试步骤。

<h3 id="claude-isn’t-following-my-claude-md">
  Claude 不遵循我的 CLAUDE.md
</h3>

CLAUDE.md 内容作为用户消息在系统提示之后传递，而不是系统提示本身的一部分。Claude 读取它并尝试遵循它，但没有严格遵守的保证，特别是对于模糊或冲突的指令。

要调试：

* 运行 `/memory` 验证你的 CLAUDE.md 和 CLAUDE.local.md 文件被加载。如果文件未列出，Claude 看不到它。
* 检查相关 CLAUDE.md 是否在为你的会话加载的位置（参见 [选择 CLAUDE.md 文件的位置](#choose-where-to-put-claude-md-files)）。
* 使指令更具体。"使用 2 空格缩进"比"格式化代码很好"效果更好。
* 查找跨 CLAUDE.md 文件的冲突指令。如果两个文件为相同行为提供不同的指导，Claude 可能会任意选择一个。

如果指令是必须在特定点运行的内容，例如在每次提交之前或每次文件编辑之后，请将其写成 [hook](/docs/zh-CN/hooks-guide) 代替。Hooks 在固定的生命周期事件处作为 shell 命令执行，并且无论 Claude 决定做什么都适用。

对于你想要在系统提示级别的指令，使用 [`--append-system-prompt`](/docs/zh-CN/cli-reference#system-prompt-flags)。这必须在每次调用时传递，因此它更适合脚本和自动化而不是交互式使用。

<Tip>
  使用 [`InstructionsLoaded` hook](/docs/zh-CN/hooks#instructionsloaded) 记录确切加载了哪些指令文件、何时加载以及为什么。这对于调试特定路径规则或子目录中的延迟加载文件很有用。
</Tip>

<h3 id="i-don’t-know-what-auto-memory-saved">
  我不知道自动记忆保存了什么
</h3>

运行 `/memory` 并选择自动记忆文件夹来浏览 Claude 保存的内容。一切都是纯 markdown，你可以读取、编辑或删除。

<h3 id="my-claude-md-is-too-large">
  我的 CLAUDE.md 太大了
</h3>

超过 200 行的文件消耗更多上下文并可能降低遵守度。使用 [路径范围规则](#path-specific-rules) 仅在 Claude 处理匹配文件时加载指令，或修剪不是每个会话都需要的内容。分割到 [`@path` 导入](#import-additional-files) 有助于组织，但不会减少上下文，因为导入的文件在启动时加载。

[`/doctor`](/docs/zh-CN/commands#all-commands) 检查为已检入的 CLAUDE.md 提议修剪：它删除 Claude 可以从代码库派生的内容，例如目录布局、依赖项列表和架构概览，并保留与工具默认值不同的陷阱、基本原理和约定。修剪检查需要 Claude Code v2.1.206 或更高版本。

<h3 id="instructions-seem-lost-after-/compact">
  在 `/compact` 后指令似乎丢失了
</h3>

项目根 CLAUDE.md 在压缩中存活：在 `/compact` 之后，Claude 从磁盘重新读取它并将其重新注入到会话中。子目录中的嵌套 CLAUDE.md 文件不会自动重新注入；它们在 Claude 下次读取该子目录中的文件时重新加载。

如果指令在压缩后消失，它要么仅在对话中给出，要么位于尚未重新加载的嵌套 CLAUDE.md 中。将仅对话的指令添加到 CLAUDE.md 以使其持久化。有关完整的细分，请参阅 [什么在压缩中存活](/docs/zh-CN/context-window#what-survives-compaction)。

有关大小、结构和具体性的指导，请参阅 [编写有效的指令](#write-effective-instructions)。

<h2 id="related-resources">
  相关资源
</h2>

* [调试你的配置](/docs/zh-CN/debug-your-config)：诊断为什么 CLAUDE.md 或设置未生效
* [Skills](/docs/zh-CN/skills)：打包按需加载的可重复工作流
* [Settings](/docs/zh-CN/settings)：使用设置文件配置 Claude Code 行为
* [Subagent 记忆](/docs/zh-CN/sub-agents#enable-persistent-memory)：让 subagents 维护自己的自动记忆
