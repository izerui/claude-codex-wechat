> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 修改系统提示词

> 在 `claude_code` 预设和自定义系统提示词之间进行选择，并通过 CLAUDE.md、输出样式、追加或完全自定义提示词来自定义行为。

系统提示词定义了 Claude 的行为、能力和响应风格。从用于 CLI 或 IDE 类编码工具的 `claude_code` 预设开始，其中人类观察并指导工作。为具有不同界面、身份或权限模型的代理编写自己的提示词。

本页涵盖：

* [系统提示词如何工作](#how-system-prompts-work)，包含一个决策表，用于在预设、带有 `append` 的预设和自定义提示词之间进行选择
* [自定义代理行为](#customize-agent-behavior)，使用 CLAUDE.md 文件、输出样式、`append` 或自定义字符串
* [比较四种方法](#compare-the-four-approaches)，按持久性、范围和它们保留的内容进行比较
* [组合方法](#combine-approaches)，将自定义方法分层组合在一起

<h2 id="how-system-prompts-work">
  系统提示词的工作原理
</h2>

系统提示词是初始指令集，它塑造了 Claude 在整个对话中的行为方式。Agent SDK 有三个起点：

* **最小默认值**：当你在 TypeScript 中不设置 `systemPrompt` 或在 Python 中不设置 `system_prompt` 时，SDK 使用最小提示词，涵盖工具调用但省略了 Claude Code 的编码指南、响应风格和项目上下文。这与 `claude -p` 不同，后者默认使用完整的 Claude Code 提示词。如果你从 CLI 迁移并想要匹配的行为，请设置 `claude_code` 预设。
* **`claude_code` 预设**：Claude Code CLI 使用的完整系统提示词，包含工具使用说明、代码风格和格式化指南、响应语气和详细程度规则、安全和安全指令，以及关于工作目录和环境的上下文。在 TypeScript 中设置 `systemPrompt: { type: "preset", preset: "claude_code" }`，或在 Python 中设置 `system_prompt={"type": "preset", "preset": "claude_code"}`，可选择使用 `append` 在末尾添加你自己的指令。
* **自定义字符串**：你自己编写的提示词。SDK 仅发送你提供的内容。

<h3 id="decide-on-a-starting-point">
  决定起点
</h3>

决定因素是你的代理与 Claude Code 的相似程度：一个在存储库中运行的编码代理，有人类观看流式输出并指导工作。你的产品离这个越远，你就越想编写自己的提示词。

| 你正在构建                                                | 使用                         | 你获得的内容                                        |
| :--------------------------------------------------- | :------------------------- | :-------------------------------------------- |
| 一个 CLI 或类似 IDE 的编码工具，其中人类观看和指导，Claude Code 的默认值是你想要的 | `claude_code` 预设           | 完整的 Claude Code 提示词：工具指导、安全规则、终端友好的响应、存储库约定感知 |
| 相同类型的工具，加上产品特定的规则，如编码标准、输出格式或域上下文                    | `claude_code` 预设加 `append` | 上述所有内容，加上你的指令添加在预设之后。没有任何内容被删除，所以这是风险最低的自定义   |
| 具有不同表面、身份或权限模型的代理，或非编码代理                             | 自定义提示词字符串                  | 仅你编写的内容。你负责替换你的代理仍然需要的工具指导和安全指令               |
| 一个薄工具调用循环，没有代理角色，你在用户提示词中提供所有行为                      | 无 `systemPrompt` 选项        | 最小默认值：工具调用支持，仅此而已                             |

"不同于 Claude Code" 通常意味着以下之一：

* **不同的表面**：输出不是由触发它的人在终端中读取的。聊天 UI、结构化输出消费者和非编码自动化各自需要一个与其输出呈现和审查方式相匹配的提示词。无人值守的编码自动化，如修复 lint 错误或审查差异的 CI 作业，仍然适合预设，因为工作本身就是预设为之编写的。
* **不同的身份**：代理不应该将自己呈现为 Claude Code。支持机器人、数据分析助手或任何特定领域的代理需要自己的名称、范围和角色。
* **不同的权限模型**：代理自主运行，无需人类批准每一步，或在一组狭窄的资源上运行。Claude Code 的提示词假设人类在循环中，可以访问完整的工具集。
* **非编码任务**：Claude Code 提示词的大部分是编码指导。对于研究、内容或运营代理，该指导与你实际需要的指令竞争。

[比较表](#compare-the-four-approaches)显示了每种自定义方法保留的内容。

<h2 id="customize-agent-behavior">
  自定义 agent 行为
</h2>

输出样式、`append` 和自定义提示词字符串各自直接改变系统提示词。CLAUDE.md 采用不同的方式：SDK 读取它并将其内容作为项目上下文注入到对话中，而不是注入到系统提示词中，因此它与你选择的任何系统提示词一起塑造行为。[Skills](/docs/zh-CN/agent-sdk/skills)、[hooks](/docs/zh-CN/agent-sdk/hooks) 和 [permissions](/docs/zh-CN/agent-sdk/permissions) 也在系统提示词之外塑造行为，并在各自的页面上介绍。

<h3 id="claude-md-files-for-project-level-instructions">
  CLAUDE.md 文件用于项目级指令
</h3>

CLAUDE.md 文件为 Claude 提供持久的项目上下文和指令。SDK 将其内容注入到对话中，而不是注入到系统提示词中，因此它们可以与任何系统提示词配置一起工作。关于在 CLAUDE.md 中放什么、在哪里放置它以及如何编写有效的指令，请参阅 [Claude 如何记住你的项目](/docs/zh-CN/memory)。本节涵盖 SDK 特定的内容：CLAUDE.md 如何加载。

当匹配的设置源被启用时，SDK 读取 CLAUDE.md：`'project'` 从工作目录加载 `CLAUDE.md` 或 `.claude/CLAUDE.md`，`'user'` 加载 `~/.claude/CLAUDE.md`。默认 `query()` 选项启用两个源，因此 CLAUDE.md 会自动加载。如果你在 TypeScript 中显式设置 `settingSources` 或在 Python 中设置 `setting_sources`，请包含你需要的源。CLAUDE.md 加载由设置源控制，而不是由 `claude_code` 预设控制。

<h4 id="load-claude-md-with-the-sdk">
  使用 SDK 加载 CLAUDE.md
</h4>

要加载 CLAUDE.md，请设置 `settingSources` 以包含你的 CLAUDE.md 所在的级别。下面的示例加载项目级 CLAUDE.md 以及 `claude_code` 预设，因此 Claude 既有完整的编码 agent 提示词，也有你的项目约定：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  const messages = [];

  for await (const message of query({
    prompt: "Add a new React component for user profiles",
    options: {
      systemPrompt: {
        type: "preset",
        preset: "claude_code" // 使用 Claude Code 的系统提示词
      },
      settingSources: ["project"] // 从项目加载 CLAUDE.md
    }
  })) {
    messages.push(message);
  }

  // 现在 Claude 可以访问来自 CLAUDE.md 的项目指南
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ClaudeAgentOptions

  messages = []

  async for message in query(
      prompt="Add a new React component for user profiles",
      options=ClaudeAgentOptions(
          system_prompt={
              "type": "preset",
              "preset": "claude_code",  # 使用 Claude Code 的系统提示词
          },
          setting_sources=["project"],  # 从项目加载 CLAUDE.md
      ),
  ):
      messages.append(message)

  # 现在 Claude 可以访问来自 CLAUDE.md 的项目指南
  ```
</CodeGroup>

CLAUDE.md 在项目的所有会话中持久存在，通过 git 与你的团队共享，并自动发现而无需代码更改。如果你传递空的 `settingSources` 数组，则不会加载。

<h3 id="output-styles-for-persistent-configurations">
  输出样式用于持久配置
</h3>

输出样式是保存的配置，可以修改 Claude 的系统提示词。它们存储为 markdown 文件，可以在会话和项目中重复使用。

<h4 id="create-an-output-style">
  创建输出样式
</h4>

输出样式是一个 markdown 文件，其 [frontmatter](/docs/zh-CN/output-styles#frontmatter) 中有元数据，后面是提示词内容。将其保存到 `~/.claude/output-styles/` 以获得在每个项目中可用的用户级样式，或保存到你的存储库中的 `.claude/output-styles/` 以获得可以提交和与你的团队共享的项目级样式。

默认情况下，自定义输出样式会用你自己的指令替换 `claude_code` 预设的软件工程指令。要保留它们并在其基础上分层你的指令，请在 frontmatter 中设置 `keep-coding-instructions: true`。当你的 agent 仍在进行软件工程工作时保留它们。当你完全替换角色时省略它们。

下面的示例定义了一个代码审查角色，它保留了编码指令，因为审查代码仍然受益于 Claude Code 的安全性和代码质量指导。将其保存为 `~/.claude/output-styles/code-reviewer.md` 以在项目中可用：

```markdown ~/.claude/output-styles/code-reviewer.md theme={null}
---
name: Code Reviewer
description: Thorough code review assistant
keep-coding-instructions: true
---

You are an expert code reviewer.

For every code submission:
1. Check for bugs and security issues
2. Evaluate performance
3. Suggest improvements
4. Rate code quality (1-10)
```

<h4 id="activate-an-output-style">
  激活输出样式
</h4>

创建后，通过以下方式激活输出样式：

* **CLI**：运行 `/config` 并选择输出样式
* **设置**：在 `.claude/settings.local.json` 中设置 `outputStyle`
* **TypeScript SDK**：在传递给 `query()` 的内联 `settings` 对象内设置 `outputStyle`，或将 `settings` 指向设置它的设置文件。`outputStyle` 不是顶级 `Options` 字段：

  ```typescript theme={null}
  const options = { settings: { outputStyle: "Explanatory" } };
  ```

Python SDK 没有以编程方式选择输出样式的选项。对于无法写入 `.claude/settings.local.json` 的仅代码部署，请改用 `append` 或自定义提示词字符串。

**SDK 用户注意：** 当你在选项中包含 `settingSources: ['user']` 或 `settingSources: ['project']`（TypeScript）/ `setting_sources=["user"]` 或 `setting_sources=["project"]`（Python）时，输出样式会被加载。

<h3 id="append-to-the-claude_code-preset">
  追加到 `claude_code` 预设
</h3>

你可以使用带有 `append` 属性的 Claude Code 预设来添加自定义指令，同时保留所有内置功能。

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  const messages = [];

  for await (const message of query({
    prompt: "Help me write a Python function to calculate fibonacci numbers",
    options: {
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "Always include detailed docstrings and type hints in Python code."
      }
    }
  })) {
    messages.push(message);
    if (message.type === "assistant") {
      console.log(message.message.content);
    }
  }
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage

  messages = []

  async for message in query(
      prompt="Help me write a Python function to calculate fibonacci numbers",
      options=ClaudeAgentOptions(
          system_prompt={
              "type": "preset",
              "preset": "claude_code",
              "append": "Always include detailed docstrings and type hints in Python code.",
          }
      ),
  ):
      messages.append(message)
      if isinstance(message, AssistantMessage):
          print(message.content)
  ```
</CodeGroup>

<h4 id="improve-prompt-caching-across-users-and-machines">
  改进跨用户和机器的提示词缓存
</h4>

默认情况下，两个使用相同 `claude_code` 预设和 `append` 文本的会话，如果从不同的工作目录运行，仍然无法共享提示词缓存条目。这是因为预设在你的 `append` 文本之前在系统提示词中嵌入了每个会话的上下文：工作目录、它是否是 git 存储库、平台、活跃的 shell、操作系统版本和自动记忆路径。该上下文中的任何差异都会产生不同的系统提示词和缓存未命中。CLAUDE.md 内容不会影响系统提示词缓存，因为 SDK 将其注入到对话中，而不是系统提示词。

要使系统提示词在会话中相同，请在 TypeScript 中设置 `excludeDynamicSections: true`，或在 Python 中设置 `"exclude_dynamic_sections": True`。每个会话的上下文移动到第一条用户消息中，只在系统提示词中保留静态预设和你的 `append` 文本，以便相同的配置在用户和机器之间共享缓存条目。

<Note>
  `excludeDynamicSections` 需要 `@anthropic-ai/claude-agent-sdk` v0.2.98 或更高版本，或 Python 的 `claude-agent-sdk` v0.1.58 或更高版本。它仅适用于预设对象形式，当 `systemPrompt` 是字符串时无效。
</Note>

以下示例将共享的 `append` 块与 `excludeDynamicSections` 配对，以便从不同目录运行的 agent 群可以重复使用相同的缓存系统提示词：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Triage the open issues in this repo",
    options: {
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "You operate Acme's internal triage workflow. Label issues by component and severity.",
        excludeDynamicSections: true
      }
    }
  })) {
    // ...
  }
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ClaudeAgentOptions

  async for message in query(
      prompt="Triage the open issues in this repo",
      options=ClaudeAgentOptions(
          system_prompt={
              "type": "preset",
              "preset": "claude_code",
              "append": "You operate Acme's internal triage workflow. Label issues by component and severity.",
              "exclude_dynamic_sections": True,
          },
      ),
  ):
      ...
  ```
</CodeGroup>

**权衡：** 工作目录、git 存储库标志、平台、活跃的 shell、操作系统版本和自动记忆路径仍然会到达 Claude，但作为第一条用户消息的一部分，而不是系统提示词。用户消息中的指令比系统提示词中的相同文本的权重略低，因此在推理当前目录或自动记忆路径时，Claude 可能会更少地依赖它们。当跨会话缓存重复使用比最大化权威环境上下文更重要时，启用此选项。

对于非交互式 CLI 模式中的等效标志，请参阅 [`--exclude-dynamic-system-prompt-sections`](/docs/zh-CN/cli-reference)。

<h3 id="custom-system-prompts">
  自定义系统提示词
</h3>

你可以提供自定义字符串作为 `systemPrompt` 以完全用你自己的指令替换默认值。

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  const customPrompt = `You are a Python coding specialist.
  Follow these guidelines:
  - Write clean, well-documented code
  - Use type hints for all functions
  - Include comprehensive docstrings
  - Prefer functional programming patterns when appropriate
  - Always explain your code choices`;

  const messages = [];

  for await (const message of query({
    prompt: "Create a data processing pipeline",
    options: {
      systemPrompt: customPrompt
    }
  })) {
    messages.push(message);
    if (message.type === "assistant") {
      console.log(message.message.content);
    }
  }
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage

  custom_prompt = """You are a Python coding specialist.
  Follow these guidelines:
  - Write clean, well-documented code
  - Use type hints for all functions
  - Include comprehensive docstrings
  - Prefer functional programming patterns when appropriate
  - Always explain your code choices"""

  messages = []

  async for message in query(
      prompt="Create a data processing pipeline",
      options=ClaudeAgentOptions(system_prompt=custom_prompt),
  ):
      messages.append(message)
      if isinstance(message, AssistantMessage):
          print(message.content)
  ```
</CodeGroup>

<h2 id="compare-the-four-approaches">
  比较四种方法
</h2>

这四种自定义方法在存储位置、共享方式以及从 `claude_code` 预设保留的内容方面有所不同。

| 功能        | CLAUDE.md | 输出样式     | 带有追加的 `systemPrompt` | 自定义 `systemPrompt` |
| --------- | --------- | -------- | -------------------- | ------------------ |
| **持久性**   | 每个项目文件    | 保存为文件    | 仅会话                  | 仅会话                |
| **可重用性**  | 每个项目      | 跨项目      | 代码重复                 | 代码重复               |
| **管理**    | 在文件系统上    | CLI + 文件 | 在代码中                 | 在代码中               |
| **默认工具**  | 保留        | 保留       | 保留                   | 丢失（除非包含）           |
| **内置安全**  | 维护        | 维护       | 维护                   | 必须添加               |
| **环境上下文** | 自动        | 自动       | 自动                   | 必须提供               |
| **自定义级别** | 仅添加       | 替换或扩展默认  | 仅添加                  | 完全控制               |
| **版本控制**  | 与项目一起     | 是        | 与代码一起                | 与代码一起              |
| **范围**    | 项目特定      | 用户或项目    | 代码会话                 | 代码会话               |

"带有追加"是指在 TypeScript 中使用 `systemPrompt: { type: "preset", preset: "claude_code", append: "..." }`，或在 Python 中使用 `system_prompt={"type": "preset", "preset": "claude_code", "append": "..."}`。CLAUDE.md 不会改变系统提示本身：SDK 将其内容作为项目上下文注入到对话中。

<h2 id="use-cases-and-best-practices">
  用例和最佳实践
</h2>

<h3 id="when-to-use-claude-md">
  何时使用 CLAUDE.md
</h3>

使用 CLAUDE.md 来存储应该应用于项目中每个会话的指令，无论该会话使用哪个系统提示词：编码标准、常见命令、架构上下文和团队约定。CLAUDE.md 被提交到你的存储库，因此它与它描述的代码保持同步。有关完整指导，请参阅 [何时添加到 CLAUDE.md](/docs/zh-CN/memory#when-to-add-to-claude-md)。

当启用 `project` 设置源时，CLAUDE.md 文件会加载，这对默认的 `query()` 选项是这样的。如果你显式设置 `settingSources`（TypeScript）或 `setting_sources`（Python），请包含 `'project'` 以继续加载项目级 CLAUDE.md。

<h3 id="when-to-use-output-styles">
  何时使用输出样式
</h3>

输出样式用于你想在 CLI 和 SDK 中重复使用的角色，而无需更改应用程序代码。因为它们作为文件存在于 `.claude/output-styles` 中，同一个角色可从 CLI 中的 `/config` 和加载匹配设置源的任何 SDK 会话中获得。

**最适合：**

* 跨会话的持久行为更改
* 团队共享配置
* 专门的助手，如代码审查者、数据科学家或 DevOps 助手
* 需要版本控制的复杂提示词修改

**示例：**

* 创建专用的 SQL 优化助手
* 构建安全聚焦的代码审查者
* 开发具有特定教学法的教学助手

<h3 id="when-to-use-systemprompt-with-append">
  何时使用带有追加的 `systemPrompt`
</h3>

当 `claude_code` 预设已经适合你的产品，而你只需要添加额外指令时，使用 `append`。你保留预设的工具指导、安全规则和编码约定，而无需重新实现它们。

**最适合：**

* 添加特定的编码标准或偏好
* 自定义输出格式
* 添加特定领域的知识
* 修改响应详细程度
* 增强 Claude Code 的默认行为而不失去工具指令

<h3 id="when-to-use-custom-systemprompt">
  何时使用自定义 `systemPrompt`
</h3>

当你的代理的表面、身份或权限模型与 Claude Code 的不同时，使用自定义提示词，如 [决定起点](#decide-on-a-starting-point) 中所述。你定义完整的指令集，包括你的代理需要的任何工具指导和安全规则。

**最适合：**

* 完全控制 Claude 的行为
* 专门的单会话任务
* 测试新的提示词策略
* 不需要默认工具的情况
* 构建具有独特行为的专门代理

<h2 id="combine-approaches">
  组合方法
</h2>

这些方法可以组合使用。持久化的输出样式或 CLAUDE.md 设置长期行为，而 `append` 在不触及保存配置的情况下在顶部分层会话特定的指令。

<h3 id="combine-an-output-style-with-session-specific-additions">
  将输出样式与会话特定的添加组合
</h3>

下面的示例假设代码审查员输出样式已经处于活动状态。`append` 块在角色的基础上分层会话特定的焦点区域，因此单个审查会话可以优先考虑 OAuth 和令牌存储，而无需更改保存的输出样式：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  // 假设"Code Reviewer"输出样式处于活动状态（通过 /config 或设置）
  // 添加会话特定的焦点区域
  const messages = [];

  for await (const message of query({
    prompt: "Review this authentication module",
    options: {
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: `
          For this review, prioritize:
          - OAuth 2.0 compliance
          - Token storage security
          - Session management
        `
      }
    }
  })) {
    messages.push(message);
  }
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ClaudeAgentOptions

  # 假设"Code Reviewer"输出样式处于活动状态（通过 /config 或设置）
  # 添加会话特定的焦点区域
  messages = []

  async for message in query(
      prompt="Review this authentication module",
      options=ClaudeAgentOptions(
          system_prompt={
              "type": "preset",
              "preset": "claude_code",
              "append": """
              For this review, prioritize:
              - OAuth 2.0 compliance
              - Token storage security
              - Session management
              """,
          }
      ),
  ):
      messages.append(message)
  ```
</CodeGroup>

<h2 id="see-also">
  另请参阅
</h2>

* [输出样式](/docs/zh-CN/output-styles)：为 CLI 创建、管理和共享输出样式，包括文件格式和存储位置
* [Claude 如何记住您的项目](/docs/zh-CN/memory)：CLAUDE.md 中应放入的内容、放置位置以及如何编写有效的项目说明
* [TypeScript SDK 参考](/docs/zh-CN/agent-sdk/typescript)：完整的 `Options` 类型，包括 `systemPrompt`、`settingSources` 和 `settings`
* [Python SDK 参考](/docs/zh-CN/agent-sdk/python)：完整的 `ClaudeAgentOptions` 类型，包括 `system_prompt` 和 `setting_sources`
* [Settings](/docs/zh-CN/settings)：`settings.json` 参考，包括输出样式和其他配置的存储位置
