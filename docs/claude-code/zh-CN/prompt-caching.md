> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Claude Code 如何使用 prompt caching

> Claude Code 自动管理 prompt caching。了解为什么模型切换会触发缓慢的未缓存回合、`/compact` 的成本、为什么 CLAUDE.md 编辑在会话中期不适用，以及如何检查缓存命中率。

Prompt caching 使 Claude Code 更快、更经济高效。没有缓存，API 会在每个回合重新处理您的完整历史记录。有了缓存，它会重用已经处理过的内容，只对更改的部分进行新工作。

Claude Code 为您处理 prompt caching，除非您[禁用它](#disable-prompt-caching)。了解 prompt caching 的工作原理仍然很有用，因为某些操作会使缓存失效，使下一个响应更慢、更昂贵，同时它重建缓存。本页涵盖哪些操作会这样做、为什么某些设置等待重启才能应用，以及当使用量看起来很高时如何检查缓存性能。

<h2 id="how-the-cache-is-organized">
  缓存的组织方式
</h2>

每次您在 Claude Code 中发送消息时，它都会发出新的 API 请求。模型在请求之间不记得任何东西，所以 Claude Code 重新发送完整的上下文：系统提示、您的项目上下文、每条先前的消息和工具结果，以及您的新消息。新内容附加在末尾，这意味着每个请求的大部分与前一个请求相同。Prompt caching 是 API 避免重新处理未更改部分的方式。

API 通过将每个请求的开始部分（称为前缀）与最近处理过的内容进行匹配来缓存。在正常回合中，前缀是整个先前请求，只有最新的交换是新的。匹配是精确的，所以前缀中任何地方的更改都会重新计算其后的所有内容。没有按文件或按段的缓存。有关底层机制，请参阅 API 参考中的[prompt caching 如何工作](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#how-prompt-caching-works)。

<img src="https://mintcdn.com/claude-code/VbDJw--l6T9a9Wvm/images/prompt-caching-prefix.svg?fit=max&auto=format&n=VbDJw--l6T9a9Wvm&q=85&s=f2e8f0b8298a50305fe428ca3f1d1594" className="dark:hidden" alt="四个回合显示为增长的水平条。每个回合的请求包含前一个回合的所有内容加上最后附加的最新交换。在第二和第三个回合中，未更改的前缀从缓存中读取，只处理新的交换。在第四个回合中，系统提示更改了，所以前缀不再匹配，整个请求被重新处理并写入。" width="720" height="454" data-path="images/prompt-caching-prefix.svg" />

<img src="https://mintcdn.com/claude-code/_xqph1dUOslCOwsj/images/prompt-caching-prefix-dark.svg?fit=max&auto=format&n=_xqph1dUOslCOwsj&q=85&s=297dc1c639f0915cae858d0c4b6f3be5" className="hidden dark:block" alt="四个回合显示为增长的水平条。每个回合的请求包含前一个回合的所有内容加上最后附加的最新交换。在第二和第三个回合中，未更改的前缀从缓存中读取，只处理新的交换。在第四个回合中，系统提示更改了，所以前缀不再匹配，整个请求被重新处理并写入。" width="720" height="454" data-path="images/prompt-caching-prefix-dark.svg" />

为了充分利用前缀匹配，Claude Code 组织每个请求，使回合之间很少更改的内容首先出现：

| 层     | 内容                   | 更改时间                             |
| ----- | -------------------- | -------------------------------- |
| 系统提示  | 核心指令、工具定义、输出样式       | 加载的工具定义集合更改，或 Claude Code 升级     |
| 项目上下文 | CLAUDE.md、自动内存、无范围规则 | 会话开始，或在 `/clear` 或 `/compact` 之后 |
| 对话    | 您的消息、Claude 的响应、工具结果 | 每个回合                             |

对对话层的更改会保留系统提示和项目上下文缓存。对系统提示的更改会使所有内容失效，因为所有后续内容现在位于不同的前缀后面。第三列给出常见触发器而不是详尽列表，下面的部分涵盖完整集合，包括在会话开始时固定的输出样式等内容。

前缀匹配规则解释了本页上的大多数行为。例如，[Plan Mode](/docs/zh-CN/permission-modes#analyze-before-you-edit-with-plan-mode) 和[技能加载](/docs/zh-CN/skills)将其指令附加为对话消息，所以缓存的前缀保持完整。

两个设置根本不是提示文本的一部分，所以它们不出现在层表中，但两者都是缓存密钥的一部分：

* **Model**：每个模型都有自己的缓存。切换模型会重新计算整个请求，即使内容相同。请参阅下面的[切换模型](#switching-models)。
* **Effort level**：同一模型的每个工作量级别都有自己的缓存。在会话中期更改它会重新计算整个请求，Claude Code 会要求您在应用更改之前确认。请参阅下面的[更改工作量级别](#changing-effort-level)。

<Tip>
  在会话顶部选择您的模型和工作量级别，然后在任务之间的自然中断处保存 `/compact`。您在任务中期进行的更改越少，缓存命中率就越高。
</Tip>

<h3 id="where-the-cache-lives">
  缓存位置
</h3>

缓存发生在服务器端，在为您的模型提供服务的任何基础设施中。它的位置取决于您如何进行身份验证：

* **API 密钥、Claude 订阅或 [Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws)**：缓存位于 Anthropic 的基础设施中，通过 [Claude API](https://platform.claude.com/docs) 访问
* **Amazon Bedrock 或 Google Cloud 的 Agent Platform**：缓存位于您的云提供商的服务基础设施中
* **Microsoft Foundry**：请求路由到 Anthropic 的基础设施
* **自定义 `ANTHROPIC_BASE_URL` 或 [LLM gateway](/docs/zh-CN/llm-gateway)**：缓存位于您的请求转发到的任何地方，缓存是否工作取决于网关

有关每个提供商存储和处理的内容，请参阅[数据使用](/docs/zh-CN/data-usage)。无论缓存位于何处，条目在不活动期间后过期，[缓存生命周期](#cache-lifetime)下面涵盖 TTL 以及如何延长它。

<h2 id="actions-that-invalidate-the-cache">
  使缓存失效的操作
</h2>

这些操作会导致下一个请求错过部分或全部缓存。您会看到一个一次性的较慢、更昂贵的回合，之后新的前缀被缓存。一旦您知道它们有成本，大多数都可以在任务中期避免。模型切换可能感觉是免费的，直到您注意到随后的较慢回合。

* [切换模型](#switching-models)
* [更改工作量级别](#changing-effort-level)
* [启用快速模式](#turning-on-fast-mode)
* [连接或断开 MCP 服务器](#connecting-or-disconnecting-an-mcp-server)
* [启用或禁用插件](#enabling-or-disabling-a-plugin)
* [拒绝整个工具](#denying-an-entire-tool)
* [压缩对话](#compacting-the-conversation)
* [升级 Claude Code](#upgrading-claude-code)

<h3 id="switching-models">
  切换模型
</h3>

每个模型都有自己的缓存。使用 [`/model`](/docs/zh-CN/model-config#setting-your-model) 切换意味着下一个请求读取整个对话历史记录而没有缓存命中，即使内容相同。

[`opusplan` 模型设置](/docs/zh-CN/model-config#opusplan-model-setting)在 Plan Mode 期间解析为 Opus，在执行期间解析为 Sonnet，所以每个 Plan Mode 切换都是模型切换并启动新缓存。

[Fable 5 上的自动模型回退](/docs/zh-CN/model-config#automatic-model-fallback)也是一个模型切换。当安全分类器标记请求时，Claude Code 在默认 Opus 模型上重新运行它，会话继续进行。

<h3 id="changing-effort-level">
  更改工作量级别
</h3>

缓存由[工作量级别](/docs/zh-CN/model-config#adjust-effort-level)以及模型进行键控，所以使用 `/effort` 切换意味着下一个请求读取整个对话历史记录而没有缓存命中。一旦对话已开始，Claude Code 会在应用会使缓存失效的工作量更改之前显示确认对话框。解析为已生效的相同级别的更改（例如显式设置模型的默认值）会跳过对话框并保持缓存。

<h3 id="turning-on-fast-mode">
  启用快速模式
</h3>

启用[快速模式](/docs/zh-CN/fast-mode)会添加一个请求头，该请求头是缓存键的一部分，所以下一个请求读取整个对话历史记录而没有缓存命中。这些未缓存的输入令牌按[快速模式费率](/docs/zh-CN/fast-mode#understand-the-cost-tradeoff)计费，这就是为什么在会话开始时启用它的成本低于在长会话深处启用它的成本。从非 Opus 模型启用快速模式也会[切换您的模型](#switching-models)，这本身会启动新缓存。

成本每个对话应用一次。在第一个快速模式回合之后，Claude Code 继续发送请求头，仅改变请求的速度设置，这不是缓存键的一部分。关闭快速模式、[在速率限制后自动回退到标准速度](/docs/zh-CN/fast-mode#handle-rate-limits)以及稍后重新启用它都保持缓存。`/clear` 和 `/compact` 重置这个，因为它们无论如何都在这些点重建缓存。

<h3 id="connecting-or-disconnecting-an-mcp-server">
  连接或断开 MCP 服务器
</h3>

工具定义位于系统提示层中，所以当请求之间的工具定义集合更改时，缓存会失效。切换[顾问工具](/docs/zh-CN/advisor)是一个例外：其定义位于缓存断点之后，所以启用或禁用 `/advisor` 会保持缓存的前缀完整。[MCP 服务器](/docs/zh-CN/mcp)更改是否执行此操作取决于其工具是否由[工具搜索](/docs/zh-CN/mcp#scale-with-mcp-tool-search)延迟或加载到前缀中：

* **延迟工具**，在支持的模型上是默认设置：服务器连接、断开连接或更改其工具列表仅附加新内容，不会扰乱已缓存的任何内容。
* **加载到前缀中的工具**：对它们的任何更改都会使缓存失效。这发生在[工具搜索不可用或被禁用](/docs/zh-CN/mcp#configure-tool-search)时，例如在 Google Cloud 的 Agent Platform 上或使用自定义 `ANTHROPIC_BASE_URL` 网关时。它也发生在标记为 [`alwaysLoad`](/docs/zh-CN/mcp#exempt-a-server-from-deferral) 的服务器或工具上，以及由[基于阈值的加载](/docs/zh-CN/mcp#configure-tool-search)保持在前面的定义上。

当工具加载到前缀中时，失效的最常见原因是服务器在会话中期连接或断开连接，这可能在没有您采取任何操作的情况下发生：stdio 服务器的进程退出、HTTP 会话过期或服务器[在暂时故障后自动重新连接](/docs/zh-CN/mcp#automatic-reconnection)。连接的服务器也可以推送[动态工具更新](/docs/zh-CN/mcp#dynamic-tool-updates)来更改其工具列表。

编辑您的 MCP 配置本身不会改变缓存。新配置仅在重启后生效，这是服务器连接或断开连接的时间。

<h3 id="enabling-or-disabling-a-plugin">
  启用或禁用插件
</h3>

[插件](/docs/zh-CN/plugins)捆绑了多个组件类型，更改的成本取决于插件提供的组件。Skills、commands、agents、hooks、LSP 服务器、monitors 和 themes 永远不会使缓存失效：它们添加到请求中的任何内容都附加在现有对话之后，所以下一个请求为新内容付费，但仍然从缓存中读取它之前的所有内容。

例外是提供 [MCP 服务器](/docs/zh-CN/plugins-reference#mcp-servers)的插件。启用或禁用一个遵循与[连接或断开 MCP 服务器](#connecting-or-disconnecting-an-mcp-server)相同的规则：当服务器的工具被延迟时缓存保存，当它们加载到前缀中时下一个请求重新读取整个对话。

插件更改在您运行 [`/reload-plugins`](/docs/zh-CN/discover-plugins#apply-plugin-changes-without-restarting) 或启动新会话时应用。成本（无论是附加的公告还是完整的重新读取）显示在重新加载后的第一个回合，而不是当您运行 `/plugin install`、`/plugin enable` 或 `/plugin disable` 时。从 v2.1.163 开始，当重新加载会触发完整重新读取时，`/reload-plugins` 会显示警告并不应用重新加载。传递 `--force` 以强制应用。

禁用您在会话早期启用的插件会恢复之前的请求形状。如果该前缀仍在其[缓存生命周期](#cache-lifetime)内，下一个请求读取较旧的缓存条目而不是重建。

<h3 id="denying-an-entire-tool">
  拒绝整个工具
</h3>

添加像 `Bash` 或 `WebFetch` 这样的裸工具名称作为[拒绝规则](/docs/zh-CN/permissions#manage-permissions)会将该工具从 Claude 的上下文中完全移除。内置工具定义加载到系统提示层中，所以在会话中期添加或移除这些规则之一会使缓存失效。无论您通过 `/permissions` 添加它还是通过[直接编辑设置文件](/docs/zh-CN/settings#when-edits-take-effect)，更改都会在下一个回合生效。

只有与工具名称位置匹配的拒绝规则才有这种效果：裸工具名称、等效的 `Bash(*)` 形式或[工具名称通配符](/docs/zh-CN/permissions#tool-name-wildcards)如 `"*"`。匹配仅 MCP 工具的通配符（如 `"mcp__*"`）以相同方式移除这些工具，但当匹配的工具被[延迟](#connecting-or-disconnecting-an-mcp-server)时保持缓存完整，这是默认设置，因为延迟定义从未在缓存的前缀中。作用域拒绝规则如 `Bash(rm *)`，以及所有允许和询问规则，都不会改变 Claude 看到的工具。Claude Code 在 Claude 尝试调用时检查它们，保持前缀完整。

<h3 id="compacting-the-conversation">
  压缩对话
</h3>

[压缩](/docs/zh-CN/context-window#what-survives-compaction)用摘要替换您的消息历史记录。根据设计，这会使对话层失效，因为下一个请求有一个新的、更短的历史记录，与旧的历史记录不共享前缀。Claude Code 重用系统提示层并从磁盘重新加载项目上下文，只有在 CLAUDE.md 和内存自会话开始以来未更改时才缓存命中。

为了生成摘要，Claude Code 发送一个一次性请求，其系统提示、工具和历史记录与您的对话相同，加上作为最终用户消息附加的摘要指令。因为它共享您的前缀，该请求读取现有缓存而不是重新处理完整历史记录。压缩的大部分时间用于生成摘要，而不是缓存未命中。随后的回合仅为更短的摘要重建对话缓存，所以压缩后的回合不是缓慢的部分。

<Tip>
  当您丢弃的上下文是您不再需要的内容时，压缩对您有利。要选择其开销何时发生，请在工作中的自然中断处（例如任务之间）运行 `/compact`，而不是等待自动压缩在任务中期触发。如果您走上了想要完全放弃的路径，请改为[`/rewind`](#rewinding-the-conversation)到较早的回合。重绕会截断回到已经缓存的前缀，而不是像压缩那样构建新的前缀。
</Tip>

<h3 id="upgrading-claude-code">
  升级 Claude Code
</h3>

新的 Claude Code 版本通常会更新系统提示或工具定义，所以升级后的第一个请求从顶部重建缓存。[自动更新](/docs/zh-CN/setup#auto-updates)在后台下载新版本，但在下次启动时应用它们，从不在会话中期，所以您会看到这是重启后的一个未缓存的第一个回合，而不是会话期间的惊喜。设置 `DISABLE_AUTOUPDATER=1` 来控制何时应用升级。

<Note>
  升级后[恢复会话](/docs/zh-CN/sessions#resume-a-session)会重新处理整个对话历史记录而没有缓存命中，因为历史记录现在位于不同的系统提示后面。成本随着恢复的对话有多长而扩展，所以回到长会话的第一个回合可能是您发送的最昂贵的请求。
</Note>

<h2 id="actions-that-keep-the-cache">
  保持缓存的操作
</h2>

这些操作要么附加到对话的末尾，要么根本不接触请求。其中一些，例如编辑 CLAUDE.md 或更改输出样式，也是为什么设置更改等待重启才能应用的原因。

* [编辑存储库中的文件](#editing-files-in-your-repository)
* [在会话中期编辑 CLAUDE.md](#editing-claude-md-mid-session)
* [更改输出样式](#changing-output-style)
* [更改权限模式](#changing-permission-mode)
* [调用技能和命令](#invoking-skills-and-commands)
* [运行 `/recap`](#running-%2Frecap)
* [重绕对话](#rewinding-the-conversation)
* [生成子代理](#subagents-and-the-cache)

<h3 id="editing-files-in-your-repository">
  编辑存储库中的文件
</h3>

文件内容仅在 Claude 读取它们时进入上下文，读取附加到对话。编辑 Claude 之前读过的文件不会追溯更改历史记录中的较早读取。相反，Claude Code 附加一个 `<system-reminder>` 注意文件已更改，如果需要，Claude 会重新读取它。

<h3 id="editing-claude-md-mid-session">
  在会话中期编辑 CLAUDE.md
</h3>

您的项目根目录和用户级 CLAUDE.md 文件在会话开始时读取一次并保存在内存中。在会话中期编辑它们不会使缓存失效，但编辑也不适用。Claude 继续使用在会话开始时加载的版本。新内容在下一个 `/clear`、`/compact` 或重启时加载。

[子目录中的嵌套 CLAUDE.md 文件](/docs/zh-CN/memory)和[带有 `paths:` frontmatter 的规则](/docs/zh-CN/memory#path-specific-rules)稍后加载，当 Claude 首次读取匹配文件时。在加载前编辑一个确实会生效。加载后，内容是对话历史记录的一部分，所以中期编辑不会追溯更改它。

<h3 id="changing-output-style">
  更改输出样式
</h3>

[输出样式](/docs/zh-CN/output-styles)是系统提示的一部分，Claude Code 在会话开始时读取一次。通过 `/config` 或 `outputStyle` 设置在会话中期更改它不会使缓存失效，但更改也不适用。Claude 继续使用在会话开始时加载的样式。新样式在下一个 `/clear` 或重启时加载。

<h3 id="changing-permission-mode">
  更改权限模式
</h3>

在[权限模式](/docs/zh-CN/permission-modes)之间切换，例如从默认到接受编辑，不会改变系统提示或工具定义，所以模式更改是缓存安全的。例外是带有 [`opusplan`](/docs/zh-CN/model-config#opusplan-model-setting) 模型设置的 Plan Mode，它在进入或离开 Plan Mode 时在 Opus 和 Sonnet 之间切换模型。这使模式切换成为[模型切换](#switching-models)。

<h3 id="invoking-skills-and-commands">
  调用技能和命令
</h3>

[技能](/docs/zh-CN/skills)和[命令](/docs/zh-CN/commands)在调用点将其指令注入为用户消息。对话中较早的任何内容都不会改变。

<h3 id="running-/recap">
  运行 `/recap`
</h3>

[`/recap`](/docs/zh-CN/interactive-mode#session-recap) 生成一个摘要以在您的终端中显示。与 `/compact` 不同，它将摘要附加为命令输出而不是替换您的消息历史记录，所以缓存的前缀保持完整。

<h3 id="rewinding-the-conversation">
  重绕对话
</h3>

[`/rewind`](/docs/zh-CN/checkpointing) 将您的对话截断回较早的回合。剩余的历史记录是缓存在该点构建时的相同内容，系统提示和项目上下文层未更改，所以下一个请求命中较早的缓存条目。自那时以来的每个回合都通过该前缀读取，即使原始回合比 TTL 更久远，也保持条目温暖。

恢复文件检查点与对话一起对缓存没有单独的影响。文件内容仅在 Claude 读取它们时进入上下文，与[编辑存储库中的文件](#editing-files-in-your-repository)相同。

<h2 id="cache-lifetime">
  缓存生命周期
</h2>

缓存的前缀在不活动期间后过期。每个命中缓存的请求都会重置计时器，所以只要您继续工作，缓存就保持温暖。在足够长的间隙之后，下一个请求重新计算完整输入并重新建立缓存，这就是为什么步开后的第一个回合可能明显更慢。

生存时间 (TTL) 控制缓存存活的间隙有多长。API 提供两个：五分钟 TTL 和[一小时 TTL](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#1-hour-cache-duration)，它通过更长的中断保持缓存温暖，但[以更高的速率计费缓存写入](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#pricing)。Claude Code 根据您如何进行身份验证为您选择 TTL，您可以使用环境变量覆盖它。

<h3 id="on-a-claude-subscription">
  在 Claude 订阅上
</h3>

在 Claude 订阅上，Claude Code 自动请求一小时 TTL。使用包含在您的计划中，而不是按令牌计费，所以更长的 TTL 不会额外花费您任何费用，只会影响缓存保持温暖的时间。

如果您已超过计划的使用限制，Claude Code 正在使用[使用额度](https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans)，您需要为该使用付费，所以 Claude Code 自动将 TTL 降低到五分钟。

<h3 id="on-an-api-key-or-third-party-provider">
  在 API 密钥或第三方提供商上
</h3>

在 API 密钥、Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 或 Claude Platform on AWS 上，您支付按令牌费率，所以 TTL 默认保持在更便宜的五分钟。要选择加入[一小时 TTL](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-caching#1-hour-cache-duration)，设置 `ENABLE_PROMPT_CACHING_1H=1`。

在 Amazon Bedrock 上，prompt caching 支持、最小可缓存前缀长度和一小时 TTL 可用性都因模型而异。如果缓存令牌计数保持为零，请检查 Amazon Bedrock 文档中的[支持的模型、区域和限制](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html#prompt-caching-models)。

<h3 id="override-the-ttl">
  覆盖 TTL
</h3>

设置 `FORCE_PROMPT_CACHING_5M=1` 以强制五分钟 TTL，无论身份验证如何。这在您调试缓存行为、比较两个 TTL 或覆盖在[托管设置](/docs/zh-CN/settings#settings-files)中设置的 `ENABLE_PROMPT_CACHING_1H` 时很有用。

<h2 id="cache-scope">
  缓存范围
</h2>

在 Claude Code 中，缓存有效地限定在一台机器和目录。系统提示嵌入工作目录、平台、shell、OS 版本和自动内存路径，所以两个不同目录中的会话构建不同的前缀并错过彼此的缓存。这包括同一存储库的 worktrees，因为每个 worktree 都有自己的工作目录。

您在同一目录中并行运行的会话构建匹配的前缀并读取彼此的缓存。顺序会话仅当启动时的 git 状态快照匹配时才共享前缀，因为系统提示也捕获分支和最近的提交。

底层 API 缓存更广泛。缓存在组织之间隔离，在某些提供商上，[在组织内的工作区之间隔离](https://platform.claude.com/docs/zh-CN/build-with-claude/prompt-caching#cache-storage-and-sharing)。在这些边界内，任何两个具有相同模型和前缀的请求读取相同的缓存。对于运行自动化流程队列的 Agent SDK 调用者，请参阅[改进跨用户和机器的 prompt caching](/docs/zh-CN/agent-sdk/modifying-system-prompts#improve-prompt-caching-across-users-and-machines)以抑制系统提示的按机器部分并跨机器共享缓存。

<h2 id="check-cache-performance">
  检查缓存性能
</h2>

缓存性能显示为 API 在每个响应上报告的两个令牌计数。实时观看它们的最直接方式是读取 `current_usage` 对象的[状态行脚本](/docs/zh-CN/statusline)：

| 字段                            | 含义                             |
| ----------------------------- | ------------------------------ |
| `cache_creation_input_tokens` | 在此回合写入缓存的令牌，按缓存写入速率计费          |
| `cache_read_input_tokens`     | 在此回合从缓存提供的令牌，按标准输入速率的大约 10% 计费 |

高读取与创建比率意味着缓存工作良好。如果创建在回合之间保持高位，您的前缀中有什么在改变。[使缓存失效的操作](#actions-that-invalidate-the-cache)部分列出了常见原因。

为了在整个组织中获得可见性，OpenTelemetry 导出器报告每个用户和会话的缓存读取和创建令牌。有关指标和事件属性参考，请参阅[监控使用](/docs/zh-CN/monitoring-usage)。

<h2 id="subagents-and-the-cache">
  子代理和缓存
</h2>

[子代理](/docs/zh-CN/sub-agents)启动自己的对话，具有自己的系统提示和工具集，与父代的分开。它构建自己的缓存，在第一次调用时没有缓存命中，并在自己的回合中预热。子代理使用五分钟 TTL，即使在订阅上，因为自动一小时 TTL 适用于主对话。

父代的缓存不受影响。从父代的一侧，子代理的调用和结果附加到对话，保留父代的前缀完整。

[分叉](/docs/zh-CN/sub-agents#fork-the-current-conversation)相比之下，完全继承父代的系统提示、工具和对话历史记录，所以其第一个请求读取父代的缓存。[压缩对话](#compacting-the-conversation)中描述的压缩摘要调用使用相同的前缀共享方法。

<h2 id="disable-prompt-caching">
  禁用 prompt caching
</h2>

禁用缓存在使用特定模型或提供商调试缓存行为时偶尔很有用。要关闭它，请将以下环境变量之一设置为 `1`：

| 变量                              | 效果           |
| ------------------------------- | ------------ |
| `DISABLE_PROMPT_CACHING`        | 对所有模型禁用      |
| `DISABLE_PROMPT_CACHING_HAIKU`  | 仅对 Haiku 禁用  |
| `DISABLE_PROMPT_CACHING_SONNET` | 仅对 Sonnet 禁用 |
| `DISABLE_PROMPT_CACHING_OPUS`   | 仅对 Opus 禁用   |
| `DISABLE_PROMPT_CACHING_FABLE`  | 仅对 Fable 禁用  |

要在整个组织中设置缓存策略，请将这些或[TTL 变量](#cache-lifetime)中的任何一个放在[托管设置](/docs/zh-CN/settings#settings-files)的 `env` 块中。对于正常使用，保持缓存启用。

<h2 id="related-resources">
  相关资源
</h2>

* [从构建 Claude Code 中学到的经验：Prompt caching 就是一切](https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything)：Plan Mode、延迟工具加载和压缩的设计原理
* [探索上下文窗口](/docs/zh-CN/context-window)：什么加载到上下文中以及何时加载
* [减少令牌使用](/docs/zh-CN/costs#reduce-token-usage)：超越缓存的策略，用于管理上下文大小
* [跟踪和减少成本](/docs/zh-CN/agent-sdk/cost-tracking)：Agent SDK 调用者的缓存令牌跟踪和 TTL 配置
* [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)：底层 API 机制、断点和定价
