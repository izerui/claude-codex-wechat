> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用例程自动化工作

> 让 Claude Code 自动运行。定义在计划上运行、通过 API 调用触发或对来自 Anthropic 管理的云基础设施的 GitHub 事件做出反应的例程。

<Note>
  Routines 处于研究预览阶段。行为、限制和 API 表面可能会改变。
</Note>

例程是一个保存的 Claude Code 配置：一个提示、一个或多个存储库和一组 [connectors](/docs/zh-CN/mcp)，打包一次并自动运行。例程在 Anthropic 管理的云基础设施上执行，因此当您的笔记本电脑关闭时它们仍然可以工作。

每个例程可以附加一个或多个触发器：

* **Scheduled**：按照每小时、每晚或每周等定期节奏运行，或在特定的未来时间运行一次
* **API**：通过向每个例程端点发送带有持有者令牌的 HTTP POST 来按需触发
* **GitHub**：自动响应存储库事件（如拉取请求或发布）运行

单个例程可以组合触发器。例如，PR 审查例程可以每晚运行、从部署脚本触发，也可以对每个新 PR 做出反应。

Routines 在启用了 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 的 Pro、Max、Team 和 Enterprise 计划上可用。在 [claude.ai/code/routines](https://claude.ai/code/routines) 创建和管理它们，或从 CLI 使用 `/schedule`。

Team 和 Enterprise 管理员可以在 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code) 处使用 Routines 切换为所有成员禁用例程。禁用后，现有例程停止运行，成员无法创建新例程。

本页涵盖创建例程、配置每种触发器类型、管理运行以及使用限制如何应用。

<h2 id="example-use-cases">
  示例用例
</h2>

每个示例将触发器类型与例程适合的工作类型配对：无人值守、可重复且与明确的结果相关。

**积压维护。** 计划触发器每个工作日晚上针对您的问题跟踪器通过 connector 运行。例程读取自上次运行以来打开的问题，应用标签，根据引用的代码区域分配所有者，并将摘要发布到 Slack，以便团队以整理好的队列开始新的一天。

**警报分类。** 您的监控工具在错误阈值被超过时调用例程的 API 端点，将警报正文作为 `text` 传递。例程提取堆栈跟踪，将其与存储库中的最近提交相关联，并打开一个包含建议修复和返回警报链接的草稿拉取请求。值班人员审查 PR 而不是从空白终端开始。

**定制代码审查。** GitHub 触发器在 `pull_request.opened` 上运行。例程应用您团队自己的审查清单，为安全性、性能和风格问题留下内联注释，并添加摘要注释，以便人工审查者可以专注于设计而不是机械检查。

**部署验证。** 您的 CD 管道在每次生产部署后调用例程的 API 端点。例程针对新构建运行烟雾测试，扫描错误日志以查找回归，并在部署窗口关闭之前向发布频道发布 go 或 no-go。

**文档漂移。** 计划触发器每周运行。例程扫描自上次运行以来合并的 PR，标记引用已更改 API 的文档，并针对文档存储库打开更新 PR 供编辑审查。

**库移植。** GitHub 触发器在 `pull_request.closed` 上运行，筛选为一个 SDK 存储库中的合并 PR。例程将更改移植到另一种语言的并行 SDK，并打开匹配的 PR，使两个库保持同步，而无需人工重新实现每个更改。

下面的部分将介绍创建例程和配置每种触发器类型。

<h2 id="create-a-routine">
  创建例程
</h2>

从 Web 在 [claude.ai/code/routines](https://claude.ai/code/routines)、从 Desktop 应用或从 CLI 创建例程。所有三个界面都写入同一个云账户，因此您在其中一个创建的例程会立即显示在其他界面中。在 Desktop 应用中，单击侧边栏中的 **Routines**，然后单击 **New routine**，并选择 **Remote**；选择 **Local** 会创建一个 [Desktop scheduled task](/docs/zh-CN/desktop-scheduled-tasks)，它在您的机器上运行，而不是在云中运行。

创建表单设置例程的提示、存储库、环境、connectors 和触发器。

Routines 作为完整的 Claude Code 云会话自主运行：没有权限模式选择器，运行期间也没有批准提示。会话可以运行 shell 命令、使用 [skills](/docs/zh-CN/skills) 提交到克隆的存储库，并调用您包含的任何 connectors。例程可以到达的内容由您选择的存储库及其分支推送设置、[environment](/docs/zh-CN/claude-code-on-the-web#the-cloud-environment) 的网络访问和变量以及您包含的 connectors 决定。将每个范围限制在例程实际需要的范围内。

Routines 属于您的个人 claude.ai 账户。它们不与队友共享，并且计入您账户的每日运行配额。例程通过您连接的 GitHub 身份或 connectors 所做的任何事情都显示为您：提交和拉取请求携带您的 GitHub 用户，Slack 消息、Linear 票证或其他 connector 操作使用您为这些服务链接的账户。

<h3 id="create-from-the-web">
  从 Web 创建
</h3>

<Steps>
  <Step title="打开创建表单">
    访问 [claude.ai/code/routines](https://claude.ai/code/routines) 并单击 **New routine**。
  </Step>

  <Step title="命名例程并编写提示">
    给例程一个描述性名称并编写 Claude 每次运行的提示。提示是最重要的部分：例程自主运行，因此提示必须是自包含的，并明确说明要做什么以及成功是什么样的。

    提示输入包括一个模型选择器。Claude 在每次运行时使用选定的模型。
  </Step>

  <Step title="选择存储库">
    添加一个或多个 GitHub 存储库供 Claude 在其中工作。每个存储库在运行开始时从默认分支克隆。Claude 为其更改创建 `claude/` 前缀的分支。
  </Step>

  <Step title="选择环境">
    为例程选择一个 [cloud environment](/docs/zh-CN/claude-code-on-the-web#the-cloud-environment)。环境控制云会话可以访问的内容：

    * **Network access**：设置每次运行期间可用的互联网访问级别
    * **Environment variables**：提供 Claude 可以使用的 API 密钥、令牌或其他机密
    * **Setup script**：安装例程需要的依赖项和工具。结果是 [cached](/docs/zh-CN/claude-code-on-the-web#environment-caching)，因此脚本不会在每个会话上重新运行

    提供了一个 **Default** 环境，具有 **Trusted** 网络访问，允许 [default set](/docs/zh-CN/claude-code-on-the-web#default-allowed-domains) 的包注册表、云提供商 API、容器注册表和常见开发域，但阻止其他所有内容。如果您的例程需要到达您自己的服务或该列表之外的域，请在运行前编辑环境的 [network access](/docs/zh-CN/claude-code-on-the-web#network-access)。要使用单独的环境，请先 [create one](/docs/zh-CN/claude-code-on-the-web#configure-your-environment)。
  </Step>

  <Step title="选择触发器">
    在 **Select a trigger** 下，选择例程如何启动。您可以选择一种触发器类型或组合多种。

    <Tabs>
      <Tab title="Schedule">
        为定期运行选择预设频率，或在特定时间戳安排单次一次性运行。有关时区处理、交错、自定义 cron 间隔和一次性运行，请参阅 [Add a schedule trigger](#add-a-schedule-trigger)。
      </Tab>

      <Tab title="GitHub event">
        选择存储库、要响应的事件和可选过滤器。有关支持的事件和过滤器字段的完整列表，请参阅 [Add a GitHub trigger](#add-a-github-trigger)。
      </Tab>

      <Tab title="API">
        在此处选择 **API**，然后保存例程。URL 和令牌在保存例程后生成，因为它们取决于例程 ID。请参阅 [Add an API trigger](#add-an-api-trigger) 以复制 URL 并生成令牌。
      </Tab>
    </Tabs>
  </Step>

  <Step title="审查 connectors 和权限">
    表单底部的 **Connectors** 和 **Permissions** 选项卡控制例程可以到达的内容。

    在 Connectors 下，默认包括您所有连接的 [MCP connectors](/docs/zh-CN/mcp)。删除例程不需要的任何内容。Claude 可以使用包含的 connector 中的每个工具，包括写入，无需在运行期间请求权限。

    在 Permissions 下，为任何 Claude 应该能够推送到现有分支而不仅仅是 `claude/` 前缀分支的存储库启用 **Allow unrestricted branch pushes**。
  </Step>

  <Step title="创建例程">
    单击 **Create**。例程出现在列表中，并在下次其触发器之一匹配时运行。要立即启动运行，请在例程的详细信息页面上单击 **Run now**。

    每次运行都会在您的其他会话旁边创建一个新会话，您可以在其中查看 Claude 所做的工作、审查更改并创建拉取请求。
  </Step>
</Steps>

<h3 id="create-from-the-cli">
  从 CLI 创建
</h3>

在任何会话中运行 `/schedule` 以对话方式创建计划例程。您也可以直接传递描述，对于定期例程如 `/schedule daily PR review at 9am` 或一次性例程如 `/schedule clean up feature flag in one week`。Claude 会遍历 Web 表单收集的相同信息，然后将例程保存到您的账户。

成功启动看起来像一次对话：Claude 在保存前询问有关计划、存储库和提示的后续问题。如果 Claude 改为回复说您需要进行身份验证或无法连接到您的远程 claude.ai 账户，则未创建例程；请参阅 [Troubleshooting](#troubleshooting)。

CLI 中的 `/schedule` 仅创建计划例程。要添加 API 或 GitHub 触发器，请在 [claude.ai/code/routines](https://claude.ai/code/routines) 的 Web 上编辑例程。

CLI 还支持管理现有例程。运行 `/schedule list` 查看所有例程，`/schedule update` 更改一个，或 `/schedule run` 立即触发它。

<h2 id="configure-triggers">
  配置触发器
</h2>

当例程的触发器之一匹配时，例程启动。您可以将任何组合的计划、API 和 GitHub 触发器附加到同一例程，并随时从例程编辑表单的 **Select a trigger** 部分添加或删除它们。

<h3 id="add-a-schedule-trigger">
  添加计划触发器
</h3>

计划触发器按定期节奏运行例程，或在特定的未来时间运行一次。在 **Select a trigger** 部分中选择预设频率：每小时、每天、工作日或每周。时间以您的本地时区输入并自动转换，因此例程在该挂钟时间运行，无论云基础设施位于何处。

运行可能在计划时间后几分钟开始，原因是交错。每个例程的偏移是一致的。

对于自定义间隔（如每两小时或每月的第一天），在表单中选择最接近的预设，然后在 CLI 中运行 `/schedule update` 以设置特定的 cron 表达式。最小间隔是一小时；运行频率更高的表达式被拒绝。

<h4 id="schedule-a-one-off-run">
  计划一次性运行
</h4>

一次性计划在特定时间戳处触发例程一次。使用它来提醒自己本周晚些时候、在推出完成后打开清理 PR，或在上游更改到达时启动后续任务。例程触发后，它会自动禁用，Web UI 将其标记为 **Ran**。要再次运行它，请编辑例程并设置新的一次性时间。

<Note>
  一次性计划从 CLI 逐步推出，可能在您的账户上还不可用。如果 `/schedule` 仅提供定期计划，请改为在 Web 上从 [claude.ai/code/routines](https://claude.ai/code/routines) 创建一次性运行。
</Note>

通过在 CLI 中自然语言描述时间来创建一次性运行。Claude 根据当前时间解析该短语并在保存前确认绝对时间戳。

```text theme={null}
/schedule tomorrow at 9am, summarize yesterday's merged PRs
```

```text theme={null}
/schedule in 2 weeks, open a cleanup PR that removes the feature flag
```

与定期计划相同的本地到 UTC 转换适用于一次性时间戳。

一次性运行不计入每日例程运行上限。它们消耗您计划的常规订阅使用量，就像任何其他会话一样。有关详细信息，请参阅 [Usage and limits](#usage-and-limits)。

<h3 id="add-an-api-trigger">
  添加 API 触发器
</h3>

API 触发器为例程提供专用的 HTTP 端点。使用例程的持有者令牌 POST 到端点会启动新会话并返回会话 URL。使用此功能将 Claude Code 连接到警报系统、部署管道、内部工具或任何可以进行身份验证 HTTP 请求的地方。

API 触发器从 Web 添加到现有例程。CLI 目前无法创建或撤销令牌。

<Steps>
  <Step title="打开例程进行编辑">
    转到 [claude.ai/code/routines](https://claude.ai/code/routines)，单击您想通过 API 触发的例程，然后单击铅笔图标打开 **Edit routine**。
  </Step>

  <Step title="添加 API 触发器">
    滚动到 **Instructions** 框下方的 **Select a trigger** 部分，单击 **Add another trigger**，然后选择 **API**。
  </Step>

  <Step title="复制 URL 并生成令牌">
    模态显示此例程的 URL 以及示例 curl 命令。复制 URL，然后单击 **Generate token** 并立即复制令牌。令牌仅显示一次，之后无法检索，因此请将其存储在安全的地方，如您的警报工具的密钥存储。
  </Step>

  <Step title="调用端点">
    POST 到 URL 时在 `Authorization: Bearer` 标头中发送令牌。下面的 [Trigger a routine](#trigger-a-routine) 部分显示了完整示例。
  </Step>
</Steps>

每个例程都有自己的令牌，仅限于触发该例程。要轮换或撤销它，请返回同一模态并单击 **Regenerate** 或 **Revoke**。

<h4 id="trigger-a-routine">
  触发例程
</h4>

向 `/fire` 端点发送 POST 请求，在 `Authorization` 标头中包含持有者令牌。请求正文接受可选的 `text` 字段，用于运行特定的上下文，如警报正文或失败的日志，与其保存的提示一起传递给例程。该值是自由格式文本，不被解析：如果您发送 JSON 或其他结构化有效负载，例程会将其作为文字字符串接收。

下面的示例从 shell 触发例程。显示的例程 ID 和令牌是占位符：将它们替换为您在 [添加 API 触发器](#add-an-api-trigger) 时复制的 URL 和令牌，否则请求将失败并显示 `401` 身份验证错误：

```bash theme={null}
curl -X POST https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJKLMNOPQRSTUVW/fire \
  -H "Authorization: Bearer sk-ant-oat01-xxxxx" \
  -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"text": "Sentry alert SEN-4521 fired in prod. Stack trace attached."}'
```

成功的请求返回包含新会话 ID 和 URL 的 JSON 正文：

```json theme={null}
{
  "type": "routine_fire",
  "claude_code_session_id": "session_01HJKLMNOPQRSTUVWXYZ",
  "claude_code_session_url": "https://claude.ai/code/session_01HJKLMNOPQRSTUVWXYZ"
}
```

在浏览器中打开会话 URL 以实时观看运行、审查更改或手动继续对话。

<Warning>
  `/fire` 端点在 `experimental-cc-routine-2026-04-01` beta 标头下发布。请求和响应形状、速率限制和令牌语义可能在功能处于研究预览阶段时改变。破坏性更改在新的日期 beta 标头版本后发布，最近的两个先前标头版本继续工作，以便调用者有时间迁移。
</Warning>

<h4 id="api-reference">
  API 参考
</h4>

有关完整的 API 参考，包括所有错误响应、验证规则和字段限制，请参阅 Claude Platform 文档中的 [Trigger a routine via API](https://platform.claude.com/docs/zh-CN/api/claude-code/routines-fire)。

`/fire` 端点仅对 claude.ai 用户可用，不是 Claude Platform API 表面的一部分。

<h3 id="add-a-github-trigger">
  添加 GitHub 触发器
</h3>

GitHub 触发器在连接的存储库上发生匹配事件时自动启动新会话。每个匹配事件启动自己的会话。

<Note>
  在研究预览期间，GitHub webhook 事件受每个例程和每个账户的每小时上限限制。超过限制的事件被丢弃，直到窗口重置。在 [claude.ai/code/routines](https://claude.ai/code/routines) 查看您当前的限制。
</Note>

GitHub 触发器仅从 Web UI 配置。

<Steps>
  <Step title="打开例程进行编辑">
    转到 [claude.ai/code/routines](https://claude.ai/code/routines)，单击例程，然后单击铅笔图标打开 **Edit routine**。
  </Step>

  <Step title="添加 GitHub 事件触发器">
    滚动到 **Select a trigger** 部分，单击 **Add another trigger**，然后选择 **GitHub event**。
  </Step>

  <Step title="安装 Claude GitHub App">
    Claude GitHub App 必须安装在您想订阅的存储库上。如果尚未安装，触发器设置会提示您安装它。

    <Note>
      在 CLI 中运行 `/web-setup` 授予存储库访问权限以进行克隆，但它不安装 Claude GitHub App，也不启用 webhook 传递。GitHub 触发器需要安装 Claude GitHub App，触发器设置会提示您这样做。
    </Note>
  </Step>

  <Step title="配置触发器">
    选择存储库，从 [supported events](#supported-events) 列表中选择事件，并可选地添加过滤器。保存触发器。
  </Step>
</Steps>

<h4 id="supported-events">
  支持的事件
</h4>

GitHub 触发器可以订阅以下事件类别之一。在每个类别中，您可以选择特定操作（如 `pull_request.opened`）或对类别中的所有操作做出反应。

| Event        | Triggers when              |
| :----------- | :------------------------- |
| Pull request | PR 被打开、关闭、分配、标记、同步或以其他方式更新 |
| Release      | 发布被创建、发布、编辑或删除             |

<h4 id="filter-pull-requests">
  过滤拉取请求
</h4>

使用过滤器缩小哪些拉取请求启动新会话。所有过滤条件必须匹配才能触发例程。可用的过滤字段是：

| Filter      | Matches           |
| :---------- | :---------------- |
| Author      | PR 作者的 GitHub 用户名 |
| Title       | PR 标题文本           |
| Body        | PR 描述文本           |
| Base branch | PR 目标的分支          |
| Head branch | PR 来自的分支          |
| Labels      | 应用于 PR 的标签        |
| Is draft    | PR 是否处于草稿状态       |
| Is merged   | PR 是否已合并          |

每个过滤器将字段与运算符配对：equals、contains、starts with、is one of、is not one of 或 matches regex。

`matches regex` 运算符测试整个字段值，而不是其中的子字符串。要匹配包含 `hotfix` 的任何标题，请写 `.*hotfix.*`。没有周围的 `.*`，过滤器仅匹配完全是 `hotfix` 的标题，前后没有任何内容。对于不使用 regex 语法的文字子字符串匹配，请改用 `contains` 运算符。

一些示例过滤器组合：

* **Auth module review**：base branch `main`，head branch contains `auth-provider`。将任何涉及身份验证的 PR 发送给专注的审查者。
* **Ready-for-review only**：is draft is `false`。跳过草稿，以便例程仅在 PR 准备好审查时运行。
* **Label-gated backport**：labels include `needs-backport`。仅当维护者标记 PR 时才触发移植到另一个分支的例程。

<h4 id="how-sessions-map-to-events">
  会话如何映射到事件
</h4>

每个匹配的 GitHub 事件启动新会话。GitHub 触发的例程不支持跨事件重用会话，因此两个 PR 更新会产生两个独立会话。

<h2 id="manage-routines">
  管理例程
</h2>

单击列表中的例程以打开其详细信息页面。详细信息页面显示例程的存储库、connectors、提示、计划、API 令牌、GitHub 触发器和过去运行的列表。

<h3 id="view-and-interact-with-runs">
  查看和交互运行
</h3>

单击任何运行以将其作为完整会话打开。从那里您可以看到 Claude 所做的工作、审查更改、创建拉取请求或继续对话。每个运行会话的工作方式与任何其他会话相同：使用会话标题旁边的下拉菜单来重命名、存档或删除它。

<Note>
  运行列表中的绿色状态表示会话已启动并在没有基础设施错误的情况下退出。这并不意味着您提示中的任务成功。打开运行以读取记录并确认 Claude 实际做了什么。被阻止的网络请求、缺失的 connector 工具和任务级别的失败都会在那里显示，而不是在状态指示器中。
</Note>

<h3 id="edit-and-control-routines">
  编辑和控制例程
</h3>

从例程详细信息页面，您可以：

* 单击 **Run now** 立即启动运行，而无需等待下一个计划时间。
* 使用 **Repeats** 部分中的切换来暂停或恢复计划。暂停的例程保持其配置但不运行，直到您重新启用它们。
* 单击铅笔图标打开 **Edit routine** 并更改名称、提示、存储库、环境、connectors 或例程的任何触发器。**Select a trigger** 部分是您添加或删除计划、API 令牌和 GitHub 事件触发器的地方。
* 单击删除图标以删除例程。例程创建的过去会话保留在您的会话列表中。

<h3 id="repositories-and-branch-permissions">
  存储库和分支权限
</h3>

Routines 需要 GitHub 访问权限来克隆存储库。当您使用 `/schedule` 从 CLI 创建例程时，Claude 检查您的账户是否连接了 GitHub，如果没有，会提示您运行 `/web-setup`。有关授予访问权限的两种方式，请参阅 [GitHub authentication options](/docs/zh-CN/claude-code-on-the-web#github-authentication-options)。

您添加的每个存储库在每次运行时都会被克隆。Claude 从存储库的默认分支开始，除非您的提示另有指定。

默认情况下，Claude 只能推送到以 `claude/` 为前缀的分支。这可以防止例程意外修改受保护或长期分支。要为特定存储库删除此限制，请在创建或编辑例程时为该存储库启用 **Allow unrestricted branch pushes**。

<h3 id="connectors">
  Connectors
</h3>

Routines 可以使用您连接的 MCP connectors 在每次运行期间读取和写入外部服务。例如，分类支持请求的例程可能从 Slack 频道读取并在 Linear 中创建问题。

Connectors 是您账户上的 [claude.ai integrations](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai)。您在 CLI 中使用 `claude mcp add` 本地添加的 MCP 服务器存储在您的机器上而不是您的 claude.ai 账户上，因此它们不会出现在 connectors 列表中。要在例程中使用其中一个服务器，请在 [claude.ai/customize/connectors](https://claude.ai/customize/connectors) 处将其添加为 connector，或在提交的 [`.mcp.json`](/docs/zh-CN/mcp#project-scope) 中声明它，以便它是克隆存储库的一部分。

创建例程时，默认情况下包括您当前连接的所有 connectors。删除不需要的任何内容以限制 Claude 在运行期间可以访问的工具。您也可以直接从例程表单添加 connectors。

要在例程表单外管理或添加 connectors，请访问 claude.ai 上的 **Settings > Connectors** 或在 CLI 中使用 `/schedule update`。

<h3 id="environments-and-network-access">
  环境和网络访问
</h3>

每个例程在 [cloud environment](/docs/zh-CN/claude-code-on-the-web#the-cloud-environment) 中运行，该环境控制网络访问、环境变量和设置脚本。例程在每次运行时继承环境的网络策略。

**Default** 环境使用 **Trusted** 网络访问：[默认允许列表](/docs/zh-CN/claude-code-on-the-web#default-allowed-domains) 中的包注册表、云提供商 API、容器注册表和常见开发域是可访问的，但任意域不可访问。对其他主机的出站请求失败，返回 `403` 和 `x-deny-reason: host_not_allowed`。MCP connector 流量通过 Anthropic 的服务器路由，因此您添加到例程的 connectors 无需将其主机添加到 **Allowed domains** 即可工作。删除您在 [Connectors](#connectors) 下不需要的任何 connectors。

要允许其他域：

<Steps>
  <Step title="打开例程进行编辑">
    在例程的详细信息页面上，单击铅笔图标以打开 **Edit routine**。
  </Step>

  <Step title="打开环境选择器">
    在 **Instructions** 框下方，选择显示您的环境名称（例如 **Default**）的云图标。
  </Step>

  <Step title="打开环境设置">
    将鼠标悬停在列表中的环境上，然后单击右侧出现的设置图标。
  </Step>

  <Step title="更改网络访问级别">
    在 **Update cloud environment** 对话框中，将 **Network access** 更改为 **Custom** 并在 **Allowed domains** 中输入您的域。检查 **Also include default list of common package managers** 以在您的自定义域旁边保留 [默认允许列表](/docs/zh-CN/claude-code-on-the-web#default-allowed-domains)。选择 **Full** 以获得不受限制的访问。
  </Step>

  <Step title="保存">
    单击 **Save changes**。新策略从下一次运行开始应用。
  </Step>
</Steps>

有关访问级别和默认允许列表的详细信息，请参阅 [Network access](/docs/zh-CN/claude-code-on-the-web#network-access)。

<h2 id="usage-and-limits">
  使用和限制
</h2>

Routines 以与交互式会话相同的方式消耗订阅使用量。除了标准订阅限制外，routines 还对每个账户每天可以启动多少次运行有上限。在 [claude.ai/code/routines](https://claude.ai/code/routines) 或 [claude.ai/settings/usage](https://claude.ai/settings/usage) 查看您当前的消耗和剩余的每日 routine 运行次数。

当 routine 达到每日上限或您的订阅使用限制时，启用了使用额度的组织可以继续在计量超额上运行 routines。没有使用额度，额外运行被拒绝，直到窗口重置。从 claude.ai 上的 **Settings > Billing** 启用使用额度。

一次性运行不计入每日 routine 运行上限。它们像任何其他会话一样消耗您的常规订阅使用量，但它们不受每个账户每日 routine 运行配额的限制。

<h2 id="troubleshooting">
  故障排除
</h2>

<h3 id="/schedule-returns-unknown-command">
  `/schedule` 返回"Unknown command"
</h3>

当不满足其中一个要求时，CLI 会隐藏 `/schedule`：命令菜单在您输入时显示 `No commands match "/schedule"`，提交它会返回 `Unknown command: /schedule`。原因通常是以下之一：

* 您使用 Console API 密钥或云提供商（如 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry）进行身份验证。`/schedule` 需要 claude.ai 订阅登录。如果在您的 shell 中设置了 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN`，或在 `settings.json` 中设置了 `apiKeyHelper`，请先删除它，因为这些会优先于 claude.ai 登录
* `DISABLE_TELEMETRY`、`DO_NOT_TRACK`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 或 `DISABLE_GROWTHBOOK` 在您的 shell 环境或 [`settings.json` 文件](/docs/zh-CN/settings#available-settings)的 `env` 块中设置。这些会禁用功能标志获取，而 `/schedule` 依赖于此
* 您在 Claude Code 网页会话中。改为从 [web UI](https://claude.ai/code/routines) 管理例程

无论 CLI 如何配置，您始终可以在 [claude.ai/code/routines](https://claude.ai/code/routines) 处创建和管理例程。

<h3 id="/schedule-asks-you-to-authenticate">
  `/schedule` 要求您进行身份验证
</h3>

如果 `/schedule` 运行但 Claude 响应您需要先使用 claude.ai 账户进行身份验证，则 CLI 没有存储的 claude.ai 登录。API 账户不支持例程。运行 `/login`，使用您的 claude.ai 账户登录，然后再次运行 `/schedule`。

<h3 id="routines-are-disabled-by-your-organization’s-policy">
  "Routines 被您的组织的策略禁用"
</h3>

您的 Team 或 Enterprise 组织中的所有者可能已在 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code) 处关闭了 **Routines** 切换。这是一个服务器端组织设置，因此无法从您的本地配置中覆盖。请联系所有者为您的组织启用例程。

<h2 id="related-resources">
  相关资源
</h2>

* [`/loop` and in-session scheduling](/docs/zh-CN/scheduled-tasks)：在打开的 CLI 会话中计划本地任务
* [Desktop scheduled tasks](/docs/zh-CN/desktop-scheduled-tasks)：在您的机器上运行的本地计划任务，可以访问本地文件
* [Cloud environment](/docs/zh-CN/claude-code-on-the-web#the-cloud-environment)：为云会话配置运行时环境
* [MCP connectors](/docs/zh-CN/mcp)：连接外部服务，如 Slack、Linear 和 Google Drive
* [GitHub Actions](/docs/zh-CN/github-actions)：在存储库事件的 CI 管道中运行 Claude
