> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 将会话输出作为 artifacts 共享

> Artifacts 将 Claude Code 的工作转化为实时交互式页面，可在 claude.ai 上保持私密、与您的组织共享或发布到公开链接。

<Note>
  Artifacts 在 Pro、Max、Team 和 Enterprise 计划上可用，需要使用 [`/login`](/docs/zh-CN/setup#authenticate) 登录的会话。有关完整的要求集，请参阅 [可用性](#availability)。
</Note>

Artifact 是一个实时交互式网页，Claude Code 从您的会话发布到 claude.ai 上的私有 URL。您可以在浏览器中打开它，当会话继续时它会就地更新。当您想让其他人也看到它时，可以从页面标题中共享它。例如，使用 artifact 来引导审阅者查看带有注释的 diff 的拉取请求、从会话数据构建仪表板，或维护一个随着 Claude 工作而填充的调查时间线。

<Frame>
  <img src="https://mintcdn.com/claude-code/kaHIYYMIYMYPxQg9/images/artifacts-viewer.png?fit=max&auto=format&n=kaHIYYMIYMYPxQg9&q=85&s=dbfd671cdb0d15f49f808b9e89778fe1" alt="在 claude.ai/code/artifact 中打开的 artifact。查看器标题显示 artifact 标题 acme-funnel-fix、Share 按钮和作者头像。Share 菜单打开，显示'始终共享最新版本'切换、显示'共享版本 2'的版本选择器、'Acme 中的所有人'受众选择器和'复制链接'按钮。标题下方，artifact 页面显示两个并排的移动模型、一个漏斗图表和一行指标卡。" width="2511" height="1890" data-path="images/artifacts-viewer.png" />
</Frame>

<h2 id="when-to-use-an-artifact">
  何时使用 artifact
</h2>

当终端文本不是 Claude 生成的内容的合适媒介时，请使用 artifact：输出更容易查看和交互，而不是逐行阅读。Claude 从您的会话可以访问的任何内容构建页面，包括您的代码库和通过您的 [连接工具](/docs/zh-CN/mcp) 拉取的数据，因此页面可以显示需要段落才能描述的内容。例如，要求 Claude：

* 引导审阅者查看带有注释的 diff 的拉取请求
* 从会话已拉取的数据呈现仪表板
* 并排布置多个设计或实现选项
* 维护一个在长任务运行时填充的调查时间线
* 向队友发送链接，而不是将输出粘贴到 Slack
* 发布一个 [通过 MCP 连接器拉取新鲜数据](#pull-live-data-with-mcp-connectors) 的状态板，每次有人打开它时都会拉取新数据

有关与这些选项匹配的提示，请参阅 [您可以构建的内容](#what-you-can-build)，以及 [通过 MCP 连接器拉取实时数据](#pull-live-data-with-mcp-connectors) 了解连接器支持的板的提示。

<h3 id="what-an-artifact-is-not">
  Artifact 不是什么
</h3>

Artifact 是工作的捕获，不是应用程序。它是一个自包含的页面，没有后端，因此无法存储表单输入或提供多个路由，当有人查看它时，它访问外部数据的唯一途径是 [调用 MCP 连接器](#pull-live-data-with-mcp-connectors)。对于具有后端的托管内部工具，请改为在您自己的基础设施上部署它。有关完整的限制集，请参阅 [页面约束](#page-constraints)。

<h2 id="create-an-artifact">
  创建 artifact
</h2>

当输出适合页面时，Claude 可能会自动发布 artifact，或者您可以直接要求一个。要请求，请用纯语言命名功能或描述您想要的视觉输出。任何比作为文本阅读更容易看到的内容都是很好的候选，例如注释的 diff、图表或一组要比较的选项。下面的提示是两个示例；有关更多模式，请参阅 [您可以构建的内容](#what-you-can-build)。

```text wrap theme={null}
Make an artifact that walks through this PR with the diff annotated inline.
```

```text wrap theme={null}
Build a dashboard artifact of last week's deploy failures by service and keep it updated as you investigate.
```

Claude 将页面写入项目中的 HTML 或 Markdown 文件，然后发布它。在发布新 artifact 之前，Claude Code 会要求权限；它可能会说类似 `Claude wants to publish "Deploy failures by service" (deploy-failures.html) to a private page on claude.ai` 的内容。重新发布您已经批准的 artifact 不会再次提示。

选择 **Yes** 以发布。Claude 打印 URL，您的浏览器打开到新页面。随时按 `Ctrl+]` 从终端重新打开最近的 artifact。

Claude 为 artifact 选择标题和浏览器标签图标的表情符号。两者都出现在您在 claude.ai 上的 [artifacts 库](#share-an-artifact) 和共享链接中，因此如果您想要特定的标题或图标，请要求 Claude 使用它。

要在发布新 artifact 时停止浏览器自动打开，请在您的环境中设置 `CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0`。

如果 Claude 响应它无法发布，或写入本地 HTML 文件而没有链接，则该工具未为您的会话启用。检查 [可用性](#availability) 要求。

<h2 id="update-an-artifact">
  更新 artifact
</h2>

要求 Claude 修改页面，或让长时间运行的任务在取得进展时重新发布。Claude 编辑基础文件并再次发布到相同的 URL。

```text wrap theme={null}
Add a per-region breakdown below the summary chart and republish.
```

任何打开页面的人都会看到就地更新。每次发布都会成为一个版本，从页面标题中的 **Share** 控件，您可以选择查看者看到哪个版本。

要从不同的会话更新 artifact，请向 Claude 提供 artifact 的 URL 并要求它修改。没有 URL，新会话总是创建新 artifact 而不是更新现有的。

```text wrap theme={null}
Update https://claude.ai/code/artifact/5fbea6f3-... with today's numbers.
```

<h2 id="share-an-artifact">
  分享一个artifact
</h2>

新的artifact仅对你可见。要分享它，请在浏览器中打开该artifact，并使用页面标题中的**Share**控件。标题中会显示你是该artifact的作者，因此与你分享的任何人都可以看到谁发布了该页面。它还链接到你的库，位于[claude.ai/code/artifacts](https://claude.ai/code/artifacts)，其中列出了你创建的每个artifact。

你可以与谁分享取决于你的计划：

* **在你的组织内**：在Team和Enterprise计划中，向你组织中的特定人员或整个组织授予访问权限。查看者以你组织的成员身份登录claude.ai以查看该页面。
* **公开**：分享一个链接，互联网上的任何人都可以打开，无需登录claude.ai。在Pro和Max计划中，公开链接是分享artifact的唯一方式。在Team和Enterprise计划中，公开分享处于关闭状态，直到Owner[为组织启用它](#control-public-sharing)。

<h3 id="let-someone-edit-with-you">
  让某人与你一起编辑
</h3>

与你分享的人默认是查看者：他们可以看到你发布的每个版本，但无法更改页面。在Team和Enterprise计划中，你也可以让某人成为编辑者。在分享对话框中，添加一个人并将其角色从**viewer**切换到**editor**。

编辑者发布新版本的方式与你[从另一个会话更新artifact](#update-an-artifact)的方式相同：他们在自己的会话中向Claude提供artifact的URL，Claude会拉取当前内容并使用他们的更改重新发布。打开该页面的每个人都会实时看到每个更新。

<h2 id="pull-live-data-with-mcp-connectors">
  使用 MCP 连接器拉取实时数据
</h2>

artifact 可以在每次有人查看它时调用 [MCP 连接器](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai)，因此页面显示的是当前数据而不是构建它的会话中的快照。来自 artifact 的连接器调用在 Pro、Max、Team 和 Enterprise 计划上可用，需要 Claude Code v2.1.209 或更高版本。在早期版本上，Claude 会发布该页面，其中包含会话在构建时收集的任何数据。

要创建一个由连接器支持的页面，请在提示中命名连接器和您想要的数据：

```text wrap theme={null}
Build a dashboard artifact of our open pull requests that pulls the live list through my GitHub connector when the page loads.
```

Claude 在发布时声明页面可能调用的连接器，页面无法调用该声明之外的连接器。只有来自您 claude.ai 账户的连接器符合条件：Claude 在声明中命名它们，当有人查看页面时，每个调用都会 [通过查看账户自己的连接](#how-connector-calls-work-for-viewers) 运行到该连接器。您在 Claude Code 中配置的本地 MCP 服务器（例如来自 `.mcp.json` 的服务器）可以在 Claude 构建页面时提供数据，但已发布的页面无法调用它们。

页面在加载时获取数据，可以按间隔刷新或当查看者在页面上使用刷新控件时刷新。响应缓存在查看者的浏览器中，因此重新打开的页面会立即从缓存的响应呈现，然后使用新结果更新。

<h3 id="how-connector-calls-work-for-viewers">
  连接器调用如何为查看者工作
</h3>

当已发布的页面调用连接器时，该调用使用查看页面的人的账户，而不是发布它的人的账户：

* **每个查看者使用自己的连接器**：调用通过查看账户的已连接工具进行，因此两个打开同一仪表板的人可能会看到不同的数据，具体取决于他们的账户可以访问什么。页面永远看不到任何人的凭证；claude.ai 代表页面进行调用。
* **查看者首先批准访问**：claude.ai 在页面的第一次连接器调用之前向每个查看者请求权限。拒绝的查看者或未连接页面使用的连接器的查看者仍然可以看到页面，但没有其实时部分。
* **操作也使用查看者的账户**：页面可以提供控件，调用具有副作用的连接器工具，例如发布消息或更新问题。操作通过选择控件的人的账户进行。

当您计划共享由连接器支持的页面时，请要求 Claude 在每个实时部分中包含一条后备消息，该消息命名它需要的连接器。缺少连接的查看者随后会看到要连接的内容，而不是空白部分。

调用连接器的 artifact 无法在任何计划上共享到公共链接。在 Team 和 Enterprise 计划上，您可以将其保持为私密或 [在您的组织内共享](#share-an-artifact)。在 Pro 和 Max 计划上，其中公共链接是唯一的共享方式，由连接器支持的 artifact 对您保持私密。

<h3 id="the-page-shows-no-live-data-for-a-viewer">
  页面对查看者显示无实时数据
</h3>

当由连接器支持的页面呈现但其实时部分对您共享的某人保持空白时，请处理这些原因：

* **查看者未连接连接器**：连接器是按账户的，因此每个查看者都需要自己连接到页面调用的每个连接器。他们可以在 claude.ai 上的 **Settings > Connectors** 下添加一个，然后重新加载页面。
* **查看者拒绝了权限请求**：拒绝在该页面加载的其余时间内持续。重新加载页面会再次显示权限请求。
* **为组织关闭了连接器调用**：所有者控制管理设置中的 [**Enable artifact connectors** 切换](#control-connector-calls-from-artifacts)。

<h2 id="what-you-can-build">
  您可以构建的内容
</h2>

Artifact 是单个 HTML 页面，因此您可以用 HTML、CSS 和内联 JavaScript 表达的任何内容都在范围内。下面的模式最常出现。

<h3 id="walk-through-a-change">
  逐步讲解更改
</h3>

要求一个页面，在相关行旁边呈现 diff 或设计更改并带有注释，以便审阅者可以在代码旁边阅读您的推理，而不是从描述中重建它。

```text wrap theme={null}
Make an artifact that walks through this PR. Render the diff with margin annotations and color-code findings by severity.
```

<h3 id="compare-alternatives">
  比较替代方案
</h3>

要求在一个页面上有多个变体，以便您可以相互评估它们。这适用于布局、文案、API 形状或实现计划。

```text wrap theme={null}
Make an artifact with four distinctly different layouts for the settings panel. Vary density and grouping, and lay them out as a grid with a one-line tradeoff under each.
```

<h3 id="tune-with-interactive-controls">
  使用交互式控件进行调整
</h3>

要求滑块、切换或输入字段绑定到您正在调整的任何内容，以便您可以直接探索值，而不是描述它们。

```text wrap theme={null}
Build an artifact with sliders for the easing curve, duration, and delay so I can try values on this transition. Show the animation live as I move them.
```

<h3 id="bring-the-result-back-to-your-session">
  将结果带回您的会话
</h3>

Artifact 可以充当您随后交给 Claude 的决定的轻量级编辑器。要求一个导出控件，生成您可以粘贴到终端的文本，以便与页面交互的结果流回会话，而不是停留在页面上。

```text wrap theme={null}
Make a triage board artifact with each open issue as a draggable card across Now, Next, Later, and Cut columns. Add a "Copy as prompt" button that gives me the final ordering to paste back here.
```

<h3 id="track-work-in-progress">
  跟踪进行中的工作
</h3>

要求 Claude 在长任务运行时保持 artifact 最新，以便任何拥有链接的人都可以跟随，而无需阅读终端。

```text wrap theme={null}
Turn this migration plan into a checklist artifact. Check items off as you complete them and add a note for anything you skip.
```

<h2 id="improve-the-visual-design">
  改进视觉设计
</h2>

从 Claude Code v2.1.183 开始，Claude 在构建 artifact 时应用内置设计技能，因此页面获得深思熟虑的调色板、排版和布局，无需额外提示。该技能还在选择自己的设计之前查找项目中的现有设计系统。要保持 artifacts 与您产品的品牌一致，请在 Claude 可以找到的地方记录您的设计令牌，例如项目的 [CLAUDE.md](/docs/zh-CN/memory) 或存储库中的主题文件：

```markdown theme={null}
## Design system

- Colors: primary #1a4d8f, accent #f59e0b, surface #f8fafc
- Typography: Inter for body, JetBrains Mono for code
- Spacing: 8px scale, 6px border radius
```

Claude 将您的设计系统视为比其自己的选择更高的优先级，并将您的提示视为比两者都更高的优先级。上面的标题和格式是一个示例；任何清晰的颜色、字体和间距列表都有效。

<h2 id="page-constraints">
  页面约束
</h2>

每个 artifact 是一个自包含的页面。Claude Code 将您发布的文件包装在 HTML 文档 shell 中，并在严格的内容安全策略 (CSP) 下提供它，这决定了页面可以做什么。

| 约束    | 效果                                                                                                                                                                                                       |
| :---- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 无外部请求 | CSP 阻止从任何其他主机加载的脚本、样式表、字体和图像，以及 `fetch`、XHR 和 WebSocket 调用。Claude 内联 CSS 和 JavaScript，并将图像嵌入为数据 URI，以便页面呈现而无需任何外部请求。[Connector 调用](#pull-live-data-with-mcp-connectors)是例外：页面将它们交给 claude.ai，由它自己进行网络调用。 |
| 无后端   | Artifact 是静态页面。它无法存储通过表单提交的数据或自行验证查看者。它在有人查看时获取数据的唯一方式是[调用 MCP connectors](#pull-live-data-with-mcp-connectors)，而不是它自己的 API。                                                                             |
| 单页    | 相对链接不解析，因为没有任何内容与页面一起部署。对于多部分内容，Claude 使用页面内锚点而不是单独的文件。                                                                                                                                                  |
| 源文件类型 | 发布的文件必须是 `.html`、`.htm` 或 `.md`。Markdown 文件呈现为样式化的 HTML。                                                                                                                                                 |
| 呈现大小  | 呈现的页面必须为 16 MiB 或更小。大型嵌入图像是发布因大小失败的常见原因。                                                                                                                                                                 |

生成 artifact 使用输出令牌，就像任何其他响应一样，样式化页面比相同内容作为终端文本更耗费令牌。内联 CSS、用于交互式控件的 JavaScript，尤其是嵌入为数据 URI 的图像是主要贡献者。要减少 artifact 的令牌成本：

* 对于图表，优先选择 SVG 或 HTML 和 CSS，而不是嵌入的光栅图像
* 省略您不需要的交互性
* 让页面汇总大型数据集，而不是完整内联它们

<h2 id="availability">
  可用性
</h2>

Artifacts 需要以下所有条件。当不满足其中一个时，Claude 写入本地 HTML 文件或说它无法发布。

| 要求    | 可用时间                                                                                                                                                                                                                                                                                                                              |
| :---- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 计划    | Pro、Max、Team 或 Enterprise。在 Pro 和 Max 计划上，artifacts 仅对您私有，不适用任何管理员管理。在 Team 计划上，artifacts 默认启用。在 Enterprise 计划上，Owner 在 claude.ai 管理设置中 [启用它们](#manage-artifacts-for-your-organization)。                                                                                                                                          |
| 身份验证  | 会话由 claude.ai 账户支持：在 CLI 或桌面应用中使用 `/login` 登录。Claude Tag 会话通过代理的身份登录，因此不需要任何步骤。使用 API 密钥、[网关令牌](/docs/zh-CN/llm-gateway) 或云提供商凭证的会话无法发布。                                                                                                                                                                                               |
| 模型提供商 | Anthropic API。在 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud 的 Agent Platform](/docs/zh-CN/google-vertex-ai) 或 [Microsoft Foundry](/docs/zh-CN/microsoft-foundry) 上不可用。                                                                                                                                                            |
| 组织策略  | 客户管理的加密密钥 (CMEK)、HIPAA 和 [零数据保留](/docs/zh-CN/zero-data-retention) 未为组织启用。                                                                                                                                                                                                                                                              |
| 表面    | Claude Code CLI 版本 2.1.183 或更高版本，或 Claude 桌面应用版本 1.13576.0 或更高版本。当 Claude Tag 和 artifacts 都为组织启用时，[Claude Tag](https://claude.com/docs/claude-tag/overview) 会话也可以发布 artifacts。在 [Agent SDK](/docs/zh-CN/agent-sdk/overview)、GitHub Action 和 MCP-server 上下文中默认关闭，以及当设置 [`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`](/docs/zh-CN/env-vars) 时。 |

<h2 id="disable-artifacts">
  禁用 artifacts
</h2>

要根据您组织的设置为您自己的会话关闭 artifacts，请使用以下任何一种：

| 方法                         | 设置                                  |
| :------------------------- | :---------------------------------- |
| [设置文件](/docs/zh-CN/settings)    | `"disableArtifact": true`           |
| [环境变量](/docs/zh-CN/env-vars)    | `CLAUDE_CODE_DISABLE_ARTIFACT=1`    |
| [权限规则](/docs/zh-CN/permissions) | 将 `Artifact` 添加到 `permissions.deny` |

<h2 id="manage-artifacts-for-your-organization">
  为您的组织管理 artifacts
</h2>

Team 和 Enterprise 计划上的管理员从 [claude.ai 管理设置](https://claude.ai/admin-settings/claude-code) 控制 artifacts。Artifact 内容存储在 Anthropic 运营的基础设施上，仅对发布组织的经过身份验证的成员可见，除非该 artifact 是[公开共享](#control-public-sharing)的。

<h3 id="enable-or-disable-artifacts">
  启用或禁用 artifacts
</h3>

要为整个组织启用或禁用 artifacts，请转到 **Settings > Claude Code > Capabilities** 并使用 **Artifacts** 切换。在具有基于角色的访问控制的 Enterprise 计划上，您还可以将 artifacts 限制到特定角色：转到 **Settings > Roles**，编辑角色，并在 **Claude Code** 组下设置 **Artifacts** 权限。

<h3 id="control-connector-calls-from-artifacts">
  控制来自 artifacts 的连接器调用
</h3>

[来自 artifacts 的连接器调用](#pull-live-data-with-mcp-connectors)有自己的切换，与打开或关闭 artifacts 的 **Artifacts** 切换分开。转到 [**Settings > Capabilities**](https://claude.ai/admin-settings/capabilities) 并使用 **Enable artifact connectors** 切换。同一切换控制在 claude.ai 对话中创建的 artifacts 的连接器调用，这就是为什么它位于 **Settings > Capabilities** 而不是 **Settings > Claude Code** 下。

<h3 id="control-public-sharing">
  控制公开共享
</h3>

在 Team 和 Enterprise 计划上，公开共享默认处于关闭状态，因此成员只能在组织内共享 artifacts，直到管理员将其打开。要让成员将 artifacts 发布到任何人都可以查看而无需登录的公开链接，请转到 **Settings > Claude Code > Capabilities** 并在 **Artifacts** 切换下打开 **External sharing**。将其关闭会阻止通过现有公开链接的访问，而不会更改每个 artifact 的受众；如果您重新启用它，访问将恢复。

<h3 id="set-a-retention-policy">
  设置保留策略
</h3>

要设置在自动删除之前保留 artifacts 的时间长度，请转到 **Settings > Data & privacy controls**。您可以为仍然对其作者私有的 artifacts 和已共享的 artifacts 设置单独的保留期。

<h3 id="review-the-audit-log">
  查看审计日志
</h3>

发布、共享和删除 artifact 各自出现在您组织的审计日志中，位于 `claude_artifact_*` 事件类型下，这是用于在 claude.ai 对话中创建的 artifacts 的同一系列。

<h3 id="allowlist-the-viewer-domain">
  将查看器域列入允许列表
</h3>

claude.ai 上的查看器从沙箱 `*.claudeusercontent.com` 源加载每个 artifact。如果您的组织限制出站网络访问，请将该域添加到您的允许列表中，与 `claude.ai` 一起。有关完整列表，请参阅 [网络访问要求](/docs/zh-CN/network-config#network-access-requirements)。

<h3 id="list-and-delete-artifacts-with-the-compliance-api">
  使用 Compliance API 列出和删除 artifacts
</h3>

[Compliance API](https://docs.claude.com/en/api/compliance) 提供端点来列出组织的 artifacts、检索特定版本的内容和删除 artifact：

| 方法       | 端点                                                                  |
| :------- | :------------------------------------------------------------------ |
| `GET`    | `/v1/compliance/code/artifacts`                                     |
| `GET`    | `/v1/compliance/code/artifacts/{artifact_id}/versions/{version_id}` |
| `DELETE` | `/v1/compliance/code/artifacts/{artifact_id}`                       |

有关请求和响应架构，请参阅 [Compliance API 参考](https://docs.claude.com/en/api/compliance/code/artifacts)。

<h2 id="related-resources">
  相关资源
</h2>

* 浏览与 artifacts 配对的 [提示模式和工作流](/docs/zh-CN/prompt-library)
* 将您重复使用的 artifact 提示转换为 [skill](/docs/zh-CN/skills)，以便您可以将其作为命令调用
* [连接 MCP 服务器](/docs/zh-CN/mcp)，以便 Claude 可以在构建页面时将数据拉入 artifact
