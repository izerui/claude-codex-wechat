> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 通过 MCP 将 Claude Code 连接到工具

> 了解如何使用 Model Context Protocol 将 Claude Code 连接到您的工具。

Claude Code 可以通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction)（一个用于 AI 工具集成的开源标准）连接到数百个外部工具和数据源。MCP 服务器为 Claude Code 提供对您的工具、数据库和 API 的访问权限。

当您发现自己从另一个工具（如问题跟踪器或监控仪表板）复制数据到聊天中时，请连接一个服务器。连接后，Claude 可以直接读取和操作该系统，而不是从您粘贴的内容中工作。

如果您是第一次连接服务器，请从 [MCP 快速入门](/docs/zh-CN/mcp-quickstart) 开始，获取分步演练。本页面是完整参考。

<h2 id="what-you-can-do-with-mcp">
  使用 MCP 可以做什么
</h2>

连接 MCP 服务器后，您可以要求 Claude Code：

* **从问题跟踪器实现功能**："添加 JIRA 问题 ENG-4521 中描述的功能，并在 GitHub 上创建 PR。"
* **分析监控数据**："检查 Sentry 和 Statsig 以检查 ENG-4521 中描述的功能的使用情况。"
* **查询数据库**："根据我们的 PostgreSQL 数据库，查找使用功能 ENG-4521 的 10 个随机用户的电子邮件。"
* **集成设计**："根据在 Slack 中发布的新 Figma 设计更新我们的标准电子邮件模板"
* **自动化工作流**："创建 Gmail 草稿，邀请这 10 个用户参加关于新功能的反馈会议。"
* **对外部事件做出反应**：MCP 服务器也可以充当[频道](/docs/zh-CN/channels)，将消息推送到您的会话中，因此当您不在时，Claude 可以对 Telegram 消息、Discord 聊天或 webhook 事件做出反应。

<h2 id="find-and-build-mcp-servers">
  查找和构建 MCP 服务器
</h2>

在 [Anthropic Directory](https://claude.ai/directory) 中浏览已审核的连接器。Directory 连接器使用与 Claude Code 相同的 MCP 基础设施，因此您可以使用 `claude mcp add` 添加列出的任何远程服务器。

<Warning>
  在连接每个服务器之前，请验证您信任该服务器。获取外部内容的服务器可能会使您面临 [提示注入风险](/docs/zh-CN/security#protect-against-prompt-injection)。
</Warning>

要构建您自己的服务器，请参阅 [MCP 服务器指南](https://modelcontextprotocol.io/docs/develop/build-server) 了解协议基础知识，以及 [Claude 连接器构建文档](https://claude.com/docs/connectors/building) 了解身份验证、测试和 Directory 提交。

您也可以使用官方的 [`mcp-server-dev` plugin](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/mcp-server-dev) 让 Claude 为您搭建服务器。

<Steps>
  <Step title="安装 plugin">
    在 Claude Code 会话中，运行：

    ```
    /plugin install mcp-server-dev@claude-plugins-official
    ```

    如果 Claude Code 报告找不到 marketplace，请先运行 `/plugin marketplace add anthropics/claude-plugins-official`，然后重试安装。安装完成后，运行 `/reload-plugins` 在当前会话中激活它。
  </Step>

  <Step title="运行构建 skill">
    ```
    /mcp-server-dev:build-mcp-server
    ```

    Claude 会询问您的用例，并搭建一个远程 HTTP 或本地 stdio 服务器。
  </Step>
</Steps>

<h2 id="installing-mcp-servers">
  安装 MCP 服务器
</h2>

MCP 服务器可以根据您的需求以多种方式进行配置：

<h3 id="option-1-add-a-remote-http-server">
  选项 1：添加远程 HTTP 服务器
</h3>

HTTP 服务器是连接到远程 MCP 服务器的推荐选项。这是云服务最广泛支持的传输方式。

```bash theme={null}
# 基本语法
claude mcp add --transport http <name> <url>

# 真实示例：连接到 Notion
claude mcp add --transport http notion https://mcp.notion.com/mcp

# 带有 Bearer 令牌的示例
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"
```

在通过 `.mcp.json`、`~/.claude.json` 或 `claude mcp add-json` 中的 JSON 配置 MCP 服务器时，`type` 字段接受 `streamable-http` 作为 `http` 的别名。MCP 规范对此传输使用名称 `streamable-http`，因此从服务器文档复制的配置无需修改即可工作。

没有 `type` 但有 `url` 的 JSON 条目是配置错误，因为 Claude Code 将没有 `type` 的条目读取为 stdio 服务器。Claude Code 会跳过该服务器并报告 `MCP server "<name>" has a "url" but no "type"; add "type": "http" (or "sse" / "ws") to this entry`。在 v2.1.202 之前，Claude Code 将此配置错误报告为 `command: expected string, received undefined`。

<h3 id="option-2-add-a-remote-sse-server">
  选项 2：添加远程 SSE 服务器
</h3>

<Warning>
  SSE (Server-Sent Events) 传输已弃用。请在可用的地方使用 HTTP 服务器。
</Warning>

```bash theme={null}
# 基本语法
claude mcp add --transport sse <name> <url>

# 真实示例：连接到 Asana
claude mcp add --transport sse asana https://mcp.asana.com/sse

# 带有身份验证标头的示例
claude mcp add --transport sse private-api https://api.company.com/sse \
  --header "X-API-Key: your-key-here"
```

<h3 id="option-3-add-a-local-stdio-server">
  选项 3：添加本地 stdio 服务器
</h3>

Stdio 服务器作为您机器上的本地进程运行。它们非常适合需要直接系统访问或自定义脚本的工具。

Claude Code 在生成的服务器的环境中设置 `CLAUDE_PROJECT_DIR`，指向项目根目录，因此您的服务器可以解析项目相对路径，而无需依赖工作目录。这与 hooks 在其 `CLAUDE_PROJECT_DIR` 变量中接收的目录相同。从服务器进程内部读取它，例如 Node 中的 `process.env.CLAUDE_PROJECT_DIR` 或 Python 中的 `os.environ["CLAUDE_PROJECT_DIR"]`。

`CLAUDE_PROJECT_DIR` 是稳定的项目根目录，在会话中途添加或删除工作目录时不会改变。限制自己的文件系统访问到一组允许目录的服务器应该改为实现 MCP `roots/list` 请求。Claude Code 使用会话的启动目录加上您通过 `--add-dir`、`/add-dir` 或 `additionalDirectories` 设置授予的每个[额外工作目录](/docs/zh-CN/permissions#working-directories)来回答 `roots/list`。当该集合改变时，Claude Code 发送 `notifications/roots/list_changed`。在 v2.1.203 之前，`roots/list` 仅返回启动目录，Claude Code 不发送 `notifications/roots/list_changed`。

此变量在服务器的环境中设置，而不是在 Claude Code 自己的环境中，因此在项目或用户范围的 `.mcp.json` `command` 或 `args` 中通过 `${VAR}` 扩展引用它需要一个默认值，例如 `${CLAUDE_PROJECT_DIR:-.}`。插件提供的 MCP 配置直接替换 `${CLAUDE_PROJECT_DIR}`，不需要默认值。

```bash theme={null}
# 基本语法
claude mcp add [options] <name> -- <command> [args...]

# 真实示例：添加 Airtable 服务器
claude mcp add --env AIRTABLE_API_KEY=YOUR_KEY --transport stdio airtable \
  -- npx -y airtable-mcp-server
```

<Note>
  **重要：使用 `--` 分隔服务器参数**

  对于 stdio 服务器，`--`（双破折号）将 Claude 自己的选项（如 `--transport`、`--env` 和 `--scope`）与运行服务器的命令和参数分开。`--` 之后的所有内容都会原封不动地传递给服务器。

  例如：

  * `claude mcp add --transport stdio myserver -- npx server` → 运行 `npx server`
  * `claude mcp add --env KEY=value --transport stdio myserver -- python server.py --port 8080` → 运行 `python server.py --port 8080`，环境中有 `KEY=value`

  没有 `--`，Claude Code 会尝试将服务器的标志（如上面的 `--port`）解析为自己的选项。

  `--env` 接受多个 `KEY=value` 对。如果服务器名称直接跟在 `--env` 之后，CLI 会将该名称读取为另一对并拒绝它，因此请在 `--env` 和服务器名称之间放置至少一个其他选项，如上面的示例所示。
</Note>

<h3 id="option-4-add-a-remote-websocket-server">
  选项 4：添加远程 WebSocket 服务器
</h3>

WebSocket 服务器保持持久的双向连接，适合于向 Claude 主动推送事件的远程 MCP 服务器。当您的服务器仅响应请求时，请改用 HTTP，因为 HTTP 支持 OAuth 和 `claude mcp add --transport` 标志，而 WebSocket 两者都不支持。

在 `.mcp.json` 中或使用 `claude mcp add-json` 配置 WebSocket 服务器：

```bash theme={null}
claude mcp add-json events-server \
  '{"type":"ws","url":"wss://mcp.example.com/socket","headers":{"Authorization":"Bearer YOUR_TOKEN"}}'
```

`type: "ws"` 条目接受与 `http` 相同的 `url`、`headers`、`headersHelper`、`timeout` 和 `alwaysLoad` 字段。身份验证仅限于标头，因此在 `headers` 中传递静态令牌或在连接时使用 [`headersHelper`](#use-dynamic-headers-for-custom-authentication) 生成一个。`claude mcp add --transport` 标志不接受 `ws`。

<h3 id="managing-your-servers">
  管理您的服务器
</h3>

配置后，您可以使用这些命令管理您的 MCP 服务器：

```bash theme={null}
# 列出所有配置的服务器
claude mcp list

# 获取特定服务器的详细信息
claude mcp get github

# 删除服务器
claude mcp remove github

# （在 Claude Code 中）检查服务器状态
/mcp
```

来自 `.mcp.json` 的项目范围服务器如果等待您的批准，会在 `claude mcp list` 中显示为 `⏸ 待批准`。运行 `claude` 交互式命令来审查和批准它们。`claude mcp get <name>` 将待批准的服务器显示为 `⏸ 待批准`，将被拒绝的服务器显示为 `✗ 已拒绝`。

从 v2.1.196 开始，`claude mcp list` 和 `claude mcp get` 仅从未检入存储库的设置文件中读取 `.mcp.json` 批准，直到您通过在其中运行 `claude` 并接受工作区信任对话框来信任工作区。克隆的存储库无法批准其自己的服务器：提交到项目的 `.claude/settings.json` 的 [`enableAllProjectMcpServers` 或 `enabledMcpjsonServers`](/docs/zh-CN/settings#available-settings) 在不受信任的文件夹中被忽略，服务器保持在 `⏸ 待批准` 状态，而不是被连接和健康检查。

这些来源的批准仍然适用于不受信任的文件夹：

* 您的用户 `~/.claude/settings.json`
* 托管设置
* 使用 `--settings` 传递的设置

未跟踪的 `.claude/settings.local.json` 中的批准也适用，但仅在您接受该文件夹或其父目录之一的信任对话框后：Claude Code 运行 git 来检查文件是否被跟踪，并且仅在受信任的文件夹中运行该检查。在您从未信任过的文件夹中，文件的批准会等待信任对话框，除非该文件夹是您自己的配置主目录：您的主目录，或一个您已将其 `.claude` 设置为 [`CLAUDE_CONFIG_DIR`](/docs/zh-CN/env-vars) 的目录。在 v2.1.207 之前，未跟踪的 `.claude/settings.local.json` 在您从未信任过的文件夹中批准了服务器。

任何设置文件中的 `disabledMcpjsonServers` 条目仍然会拒绝该服务器。

`/mcp` 面板在每个连接的服务器旁边显示工具计数，并标记声称工具功能但未公开任何工具的服务器。

配置为空 `url` 的远程服务器在 `/mcp`、`claude mcp list` 和[`/plugin`](/docs/zh-CN/plugins)管理器中显示为 `未配置`，Claude Code 不会尝试连接到它。插件可以包含一个占位符条目，如下所示，用于您稍后配置的连接器，因此 Claude Code 不会将其报告为错误或设置问题。服务器在 `/mcp` 中的详细视图读取 `未为此服务器配置 URL`；设置条目的 `url` 以连接它。在 v2.1.208 之前，Claude Code 将空 `url` 报告为配置问题，并提示重新连接。

如果您的请求需要来自仍在后台连接的服务器的工具，Claude 会在继续之前等待该服务器。启用[工具搜索](#scale-with-mcp-tool-search)（这是默认设置）后，等待发生在 `ToolSearch` 调用内部。在没有工具搜索的配置中，例如 Google Cloud 的 Agent Platform、自定义 `ANTHROPIC_BASE_URL` 或 `ENABLE_TOOL_SEARCH=false`，Claude 改为使用 `WaitForMcpServers` 工具。

某些服务器名称为 Claude Code 的内置服务器保留：`workspace`、`claude-in-chrome`、`computer-use`、`Claude Preview` 和 `Claude Browser`。如果您的配置定义了具有保留名称的服务器，Claude Code 会在加载时跳过它，并显示一条警告，要求您重命名它。`claude mcp add` 会以错误拒绝保留名称。

`Claude Preview` 和 `Claude Browser` 都命名了 [Claude Code 桌面应用的预览窗格](/docs/zh-CN/desktop#preview-your-app)使用的内置服务器。在 v2.1.205 之前，`Claude Browser` 不是保留的，因此用户配置的服务器可以在该名称下注册。

<h3 id="dynamic-tool-updates">
  动态工具更新
</h3>

Claude Code 支持 MCP `list_changed` 通知，允许 MCP 服务器动态更新其可用工具、提示和资源，而无需您断开连接并重新连接。当 MCP 服务器发送 `list_changed` 通知时，Claude Code 会自动刷新来自该服务器的可用功能。

<h3 id="automatic-reconnection">
  自动重新连接
</h3>

如果 HTTP 或 SSE 服务器在会话中途断开连接，Claude Code 会自动以指数退避方式重新连接：最多五次尝试，从一秒延迟开始，每次加倍。服务器在 `/mcp` 中显示为待处理状态，同时重新连接正在进行中。五次失败尝试后，服务器被标记为失败，您可以从 `/mcp` 手动重试。Stdio 服务器是本地进程，不会自动重新连接。

相同的退避策略也适用于 HTTP 或 SSE 服务器在启动时初始连接失败的情况。从 v2.1.121 开始，Claude Code 在瞬时错误（如 5xx 响应、连接被拒绝或超时）上最多重试初始连接三次，如果仍然无法连接，则将服务器标记为失败。身份验证和未找到错误不会重试，因为它们需要配置更改才能解决。

当配置的服务器无法连接时，Claude Code 告诉 Claude 哪个服务器失败及其连接错误，包括在 `ToolSearch` 结果中找不到匹配工具，因此 Claude 在其响应中报告连接失败。需要[工具搜索](#scale-with-mcp-tool-search)，默认启用。在没有工具搜索的配置中，例如自定义 `ANTHROPIC_BASE_URL`、`ENABLE_TOOL_SEARCH=false` 或不支持工具搜索的模型，以及在 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上，Claude Code 不会向 Claude 报告失败的服务器连接。在 v2.1.205 之前，Claude Code 不会将连接错误传递给 Claude，Claude 可能会响应，就像失败的服务器的工具从未配置过一样。

从 v2.1.191 开始，在成功连接后运行的功能发现请求（如 `tools/list`、`prompts/list` 和 `resources/list`）也会在短退避的情况下最多重试三次瞬时网络和服务器错误。身份验证错误、4xx 响应和请求超时不会重试。

<h3 id="push-messages-with-channels">
  使用频道推送消息
</h3>

MCP 服务器也可以直接将消息推送到您的会话中，以便 Claude 可以对外部事件（如 CI 结果、监控警报或聊天消息）做出反应。要启用此功能，您的服务器声明 `claude/channel` 功能，并在启动时使用 `--channels` 标志选择加入。请参阅 [Channels](/docs/zh-CN/channels) 以使用官方支持的频道，或 [Channels reference](/docs/zh-CN/channels-reference) 以构建您自己的频道。

<Tip>
  提示：

  * 使用 `-s` 或 `--scope` 标志指定配置的存储位置：
    * `local`（默认）：仅在当前项目中对您可用。较旧版本称此范围为 `project`
    * `project`：通过 `.mcp.json` 文件与项目中的每个人共享
    * `user`：在所有项目中对您可用。较旧版本称此范围为 `global`
  * 使用 `-e` 或 `--env` 标志设置环境变量（例如，`-e KEY=value`）
  * `--transport` 和 `--header` 标志也接受 `-t` 和 `-H` 短形式
  * 使用 `MCP_TIMEOUT` 环境变量配置 MCP 服务器启动超时（例如，`MCP_TIMEOUT=10000 claude` 设置 10 秒超时）
  * 通过向该服务器的 `.mcp.json` 条目添加 `timeout` 字段（以毫秒为单位）来设置每个服务器的工具执行超时，例如 `"timeout": 600000` 表示十分钟。这仅对该服务器覆盖 `MCP_TOOL_TIMEOUT` 环境变量
  * 当 MCP 工具输出超过 10,000 个令牌时，Claude Code 将显示警告，并默认将输出限制为 25,000 个令牌。要增加此限制，请设置 `MAX_MCP_OUTPUT_TOKENS` 环境变量（例如，`MAX_MCP_OUTPUT_TOKENS=50000`）；警告阈值是固定的。请参阅 [MCP 输出限制和警告](#mcp-output-limits-and-warnings)
  * 使用 `/mcp` 对需要 OAuth 2.0 身份验证的远程服务器进行身份验证
</Tip>

每个服务器的 `timeout` 是每个工具调用的硬时钟限制，来自服务器的进度通知不会延长它。低于 1000 的值被忽略，并回退到 `MCP_TOOL_TIMEOUT`，或在该变量未设置时回退到其约 28 小时的默认值。对于 HTTP、SSE 或 [claude.ai connector](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai) 服务器，还有第二个每请求计时器，涵盖从每个请求到服务器第一个响应字节的时间。该计时器为 60 秒，除非您设置每个服务器的 `timeout` 或 `MCP_TOOL_TIMEOUT`；将任一设置为 60 秒或更高会将每请求计时器提高到该值，较低的值不会缩短它，未设置的 `MCP_TOOL_TIMEOUT` 的 28 小时默认值永远不会影响它。Stdio 和 WebSocket 服务器没有每请求计时器。在 v2.1.162 之前，低于 1000 的值被限制为一秒。

每个服务器至少 1000 的 `timeout` 也充当下面描述的空闲超时的下限：Claude Code 永远不会因为空闲而在每个服务器的 `timeout` 之前中止该服务器的工具调用。需要 Claude Code v2.1.203 或更高版本。

对 MCP 服务器的工具调用如果在空闲窗口内没有发送响应和进度通知，将以错误中止，而不是等待时钟限制。空闲超时需要 Claude Code v2.1.187 或更高版本。它适用于除 IDE 服务器和 SDK 进程内服务器之外的每种服务器类型。空闲窗口对于 HTTP、SSE、WebSocket 和 [claude.ai connector](#use-mcp-servers-from-claude-ai) 服务器默认为五分钟，对于 stdio 服务器默认为 30 分钟。在 v2.1.203 之前，stdio 服务器不受空闲超时的限制。

在毫秒中设置 [`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`](/docs/zh-CN/env-vars) 环境变量以更改空闲窗口，或将其设置为 `0` 以禁用检查。

<h3 id="plugin-provided-mcp-servers">
  插件提供的 MCP 服务器
</h3>

[Plugins](/docs/zh-CN/plugins) 可以捆绑 MCP 服务器，在启用插件时自动提供工具和集成。插件 MCP 服务器的工作方式与用户配置的服务器相同。

**插件 MCP 服务器的工作原理**：

* 插件在插件根目录的 `.mcp.json` 中或在 `plugin.json` 中内联定义 MCP 服务器
* 启用插件时，其 MCP 服务器会自动启动
* 插件 MCP 工具与手动配置的 MCP 工具一起出现
* 插件服务器通过插件安装进行管理，不是 `/mcp` 命令

**示例插件 MCP 配置**：

在插件根目录的 `.mcp.json` 中：

```json theme={null}
{
  "mcpServers": {
    "database-tools": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": {
        "DB_URL": "${DB_URL}"
      }
    }
  }
}
```

或在 `plugin.json` 中内联：

```json theme={null}
{
  "name": "my-plugin",
  "mcpServers": {
    "plugin-api": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/api-server",
      "args": ["--port", "8080"]
    }
  }
}
```

**插件 MCP 功能**：

* **自动生命周期**：在会话启动时，启用的插件的服务器会自动连接。如果您在会话期间启用或禁用插件，请运行 `/reload-plugins` 以连接或断开其 MCP 服务器
* **路径占位符**：`${CLAUDE_PLUGIN_ROOT}` 解析为插件的安装目录，`${CLAUDE_PLUGIN_DATA}` 解析为其[持久状态](/docs/zh-CN/plugins-reference#persistent-data-directory)目录，`${CLAUDE_PROJECT_DIR}` 解析为稳定的项目根目录。替换适用于：
  * `stdio` 服务器：`command`、`args`、`env`
  * `http`、`sse` 和 `ws` 服务器：`url`、`headers` 和 `headersHelper`。在 v2.1.195 之前，`headersHelper` 将占位符作为字面字符串传递
* **用户环境访问**：访问与手动配置的服务器相同的环境变量
* **多种传输类型**：支持 stdio、SSE、HTTP 和 WebSocket 传输，尽管传输支持可能因服务器而异

**查看插件 MCP 服务器**：

```bash theme={null}
# 在 Claude Code 中，查看所有 MCP 服务器，包括插件服务器
/mcp
```

插件服务器在列表中出现，并带有指示它们来自插件的指示符。

**插件 MCP 工具名称**：

来自插件捆绑的 MCP 服务器的工具在其可调用名称中包括插件名称和服务器密钥。完整形式是 `mcp__plugin_<plugin-name>_<server-name>__<tool-name>`，其中 `A-Z`、`a-z`、`0-9`、`_` 和 `-` 之外的任何字符都被替换为 `_`。对于名为 `my-plugin` 的插件中捆绑的 `database-tools` 服务器，`query` 工具可调用为：

```
mcp__plugin_my-plugin_database-tools__query
```

在[权限规则](/docs/zh-CN/permissions)中、技能的 `allowed-tools` 列表中、[子代理的 `tools` 字段](/docs/zh-CN/sub-agents#available-tools)中或[钩子匹配器](/docs/zh-CN/hooks#match-mcp-tools)中引用工具时，使用此完整名称。针对裸服务器密钥（如 `mcp__database-tools__.*`）编写的钩子匹配器永远不会对插件捆绑的服务器触发。

服务器本身在作用域名称 `plugin:<plugin-name>:<server-name>`（如 `plugin:my-plugin:database-tools`）下注册。在需要配置的服务器名称的地方使用该名称，例如[`mcp_tool` 钩子的 `server` 字段](/docs/zh-CN/hooks#mcp-tool-hook-fields)。

**插件 MCP 服务器的优势**：

* **捆绑分发**：工具和服务器打包在一起
* **自动设置**：无需手动 MCP 配置
* **团队一致性**：安装插件时每个人都获得相同的工具

有关使用插件捆绑 MCP 服务器的详细信息，请参阅[插件组件参考](/docs/zh-CN/plugins-reference#mcp-servers)。

<h2 id="mcp-installation-scopes">
  MCP 安装范围
</h2>

MCP 服务器可以在三个不同的范围级别进行配置。您选择的范围控制服务器在哪些项目中加载以及配置是否与您的团队共享。管理员还可以通过[托管配置](#managed-mcp-configuration)在企业级别部署服务器。

| 范围                   | 加载位置   | 与团队共享    | 存储位置                |
| -------------------- | ------ | -------- | ------------------- |
| [本地](#local-scope)   | 仅当前项目  | 否        | `~/.claude.json`    |
| [项目](#project-scope) | 仅当前项目  | 是，通过版本控制 | 项目根目录中的 `.mcp.json` |
| [用户](#user-scope)    | 您的所有项目 | 否        | `~/.claude.json`    |

<h3 id="local-scope">
  本地范围
</h3>

本地范围是默认范围。本地范围的服务器仅在您添加它的项目中加载，并对您保持私密。Claude Code 将其存储在 `~/.claude.json` 中该项目的路径下，因此相同的服务器不会出现在您的其他项目中。对个人开发服务器、实验配置或包含您不想在版本控制中的凭据的服务器使用本地范围。

<Note>
  MCP 服务器的"本地范围"术语与一般本地设置不同。MCP 本地范围的服务器存储在 `~/.claude.json`（您的主目录）中，而一般本地设置使用 `.claude/settings.local.json`（在项目目录中）。有关设置文件位置的详细信息，请参阅[设置](/docs/zh-CN/settings#settings-files)。
</Note>

```bash theme={null}
# 添加本地范围的服务器（默认）
claude mcp add --transport http stripe https://mcp.stripe.com

# 显式指定本地范围
claude mcp add --transport http stripe --scope local https://mcp.stripe.com
```

该命令将服务器写入 `~/.claude.json` 中您当前项目的条目。下面的示例显示从 `/path/to/your/project` 运行时的结果：

```json theme={null}
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "stripe": {
          "type": "http",
          "url": "https://mcp.stripe.com"
        }
      }
    }
  }
}
```

<h3 id="project-scope">
  项目范围
</h3>

项目范围的服务器通过在项目根目录中存储配置在 `.mcp.json` 文件中来启用团队协作。此文件设计为检入版本控制，确保所有团队成员都可以访问相同的 MCP 工具和服务。添加项目范围的服务器时，Claude Code 会自动创建或更新此文件，使用适当的配置结构。

```bash theme={null}
# 添加项目范围的服务器
claude mcp add --transport http paypal --scope project https://mcp.paypal.com/mcp
```

生成的 `.mcp.json` 文件遵循标准化格式：

```json theme={null}
{
  "mcpServers": {
    "shared-server": {
      "command": "/path/to/server",
      "args": [],
      "env": {}
    }
  }
}
```

出于安全原因，Claude Code 在使用来自 `.mcp.json` 文件的项目范围的服务器之前会提示批准。如果您需要重置这些批准选择，请使用 `claude mcp reset-project-choices` 命令。

<h3 id="user-scope">
  用户范围
</h3>

用户范围的服务器存储在 `~/.claude.json` 中，并提供跨项目可访问性，使其在您机器上的所有项目中可用，同时对您的用户帐户保持私密。此范围适用于个人实用程序服务器、开发工具或您在不同项目中经常使用的服务。

```bash theme={null}
# 添加用户服务器
claude mcp add --transport http hubspot --scope user https://mcp.hubspot.com/anthropic
```

<h3 id="scope-hierarchy-and-precedence">
  范围层次结构和优先级
</h3>

当具有相同名称的服务器在多个位置定义时，Claude Code 连接到它一次，使用来自最高优先级源的定义。整个服务器条目来自该源；字段不会跨范围合并。

1. 本地范围
2. 项目范围
3. 用户范围
4. [插件提供的服务器](/docs/zh-CN/plugins)
5. [claude.ai 连接器](#use-mcp-servers-from-claude-ai)

三个范围按名称匹配重复项。插件和连接器按端点匹配，因此指向与上述服务器相同的 URL 或命令的连接器被视为重复项。

<h3 id="environment-variable-expansion-in-mcp-json">
  `.mcp.json` 中的环境变量扩展
</h3>

Claude Code 支持 `.mcp.json` 文件中的环境变量扩展，允许团队共享配置，同时为特定于机器的路径和 API 密钥等敏感值保持灵活性。

**支持的语法：**

* `${VAR}` - 扩展为环境变量 `VAR` 的值
* `${VAR:-default}` - 如果设置了 `VAR`，则扩展为 `VAR`，否则使用 `default`

**扩展位置：**
环境变量可以在以下位置扩展：

* `command` - 服务器可执行文件路径
* `args` - 命令行参数
* `env` - 传递给服务器的环境变量
* `url` - 对于 HTTP 服务器类型
* `headers` - 对于 HTTP 服务器身份验证

**带有变量扩展的示例：**

```json theme={null}
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

如果未设置所需的环境变量且没有默认值，Claude Code 会将文字 `${VAR}` 文本保留在值中，并为该服务器报告缺失变量警告。配置仍然会加载，因此请设置变量或添加 `:-default` 回退，以便服务器使用您想要的值启动。

<h2 id="practical-examples">
  实际示例
</h2>

<h3 id="example-monitor-errors-with-sentry">
  示例：使用 Sentry 监控错误
</h3>

```bash theme={null}
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
```

使用您的 Sentry 帐户进行身份验证：

```text theme={null}
/mcp
```

然后调试生产问题：

```text theme={null}
过去 24 小时内最常见的错误是什么？
```

```text theme={null}
显示我错误 ID abc123 的堆栈跟踪
```

```text theme={null}
哪个部署引入了这些新错误？
```

<h3 id="example-connect-to-github-for-code-reviews">
  示例：连接到 GitHub 进行代码审查
</h3>

GitHub 的远程 MCP 服务器使用作为标头传递的 GitHub 个人访问令牌进行身份验证。要获取一个，请打开您的 [GitHub 令牌设置](https://github.com/settings/personal-access-tokens)，生成一个新的细粒度令牌，具有对您希望 Claude 使用的存储库的访问权限，然后添加服务器：

```bash theme={null}
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer YOUR_GITHUB_PAT"
```

然后使用 GitHub：

```text theme={null}
审查 PR #456 并建议改进
```

```text theme={null}
为我们刚发现的错误创建新问题
```

```text theme={null}
显示分配给我的所有开放 PR
```

<h3 id="example-query-your-postgresql-database">
  示例：查询您的 PostgreSQL 数据库
</h3>

```bash theme={null}
claude mcp add --transport stdio db -- npx -y @bytebase/dbhub \
  --dsn "postgresql://readonly:pass@prod.db.com:5432/analytics"
```

然后自然地查询您的数据库：

```text theme={null}
本月我们的总收入是多少？
```

```text theme={null}
显示订单表的架构
```

```text theme={null}
查找 90 天内未进行购买的客户
```

<h2 id="authenticate-with-remote-mcp-servers">
  使用远程 MCP 服务器进行身份验证
</h2>

许多基于云的 MCP 服务器需要身份验证。Claude Code 支持 OAuth 2.0 以实现安全连接。

Claude Code 将远程服务器标记为需要身份验证，当服务器响应 `401 Unauthorized` 或 `403 Forbidden` 时。对于您尚未登录的服务器，任一状态代码都会在 `/mcp` 中标记它，以便您可以完成 OAuth 流程。

当对您已登录的 OAuth 服务器的请求返回 `401 Unauthorized` 时，Claude Code 会刷新存储的令牌、重新连接并重试请求一次。只有在该重试也失败时，它才会在 `/mcp` 中标记服务器。在 v2.1.206 之前，由于网络错误等暂时性原因导致的令牌刷新失败会将 OAuth 服务器标记为在会话的其余时间需要身份验证，即使其刷新令牌仍然有效。

从 v2.1.195 开始，当令牌刷新失败，因为服务器拒绝了存储的刷新令牌时，Claude Code 会立即显示一个指向 `/mcp` 的通知。连接的服务器的菜单中提供了"重新身份验证"选项，因此您可以在下一个工具调用失败之前重新登录。

返回指向其授权服务器的 `WWW-Authenticate` 标头的自定义服务器获得与任何其他远程服务器相同的自动发现。

从 v2.1.193 开始，当一个或多个配置的服务器需要身份验证时，Claude Code 也会在启动时显示通知，因此您无需打开 `/mcp` 来发现哪些服务器需要登录。

在非交互模式下，没有 `/mcp` 面板，因此 Claude Code 无法为您运行 OAuth 流程。从 v2.1.196 开始，当配置的服务器在 `claude -p` 或启用了[工具搜索](#scale-with-mcp-tool-search)的 Agent SDK 运行期间需要身份验证时（这是默认设置），Claude Code 会告诉 Claude 该服务器的工具不可用，直到您授权它。Claude 可以命名需要登录的服务器，而不是响应就像服务器未配置一样。从与 `/mcp` 的交互式会话或 `claude mcp login <name>` 完成登录。

如果您为服务器配置了 `headers.Authorization`，而服务器拒绝了该标头，Claude Code 会将连接报告为失败，而不是回退到 OAuth。检查令牌对于 MCP 端点是否有效，或删除标头以使用 OAuth 流程。

<Steps>
  <Step title="添加需要身份验证的服务器">
    例如：

    ```bash theme={null}
    claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
    ```
  </Step>

  <Step title="在 Claude Code 中使用 /mcp 命令">
    在 Claude Code 中，使用命令：

    ```text theme={null}
    /mcp
    ```

    然后按照浏览器中的步骤登录。
  </Step>
</Steps>

<Tip>
  提示：

  * 身份验证令牌安全存储并自动刷新
  * 使用 `/mcp` 菜单中的"清除身份验证"撤销访问权限
  * 如果您的浏览器没有自动打开，请复制提供的 URL 并手动打开
  * 如果浏览器重定向在身份验证后失败并出现连接错误，请将浏览器地址栏中的完整回调 URL 粘贴到 Claude Code 中出现的 URL 提示中
  * OAuth 身份验证适用于 HTTP 服务器
</Tip>

<h3 id="authenticate-from-the-command-line">
  从命令行进行身份验证
</h3>

从 v2.1.186 开始，`claude mcp login <name>` 直接从您的 shell 运行配置的服务器的 OAuth 流程，因此您无需在会话内打开 `/mcp` 面板。

```bash theme={null}
claude mcp login sentry
```

要稍后清除存储的凭据，请运行 `claude mcp logout <name>`。

从 v2.1.191 开始，该命令检测何时没有本地浏览器可用，例如在 SSH 会话期间或在没有显示服务器的 Linux 上，并打印授权 URL 而不是尝试打开浏览器。在您的本地计算机上打开 URL，然后将浏览器地址栏中的完整重定向 URL 粘贴回提示符。该命令需要交互式终端来执行粘贴步骤，因此请使用 `ssh -t` 连接。传递 `--no-browser` 以强制 URL 提示，即使检测到本地浏览器。

```bash theme={null}
claude mcp login sentry --no-browser
```

<h3 id="use-a-fixed-oauth-callback-port">
  使用固定的 OAuth 回调端口
</h3>

某些 MCP 服务器需要预先注册的特定重定向 URI。默认情况下，Claude Code 为 OAuth 回调选择随机可用端口。使用 `--callback-port` 固定端口，使其与 `http://localhost:PORT/callback` 形式的预注册重定向 URI 匹配。

您可以单独使用 `--callback-port`（使用动态客户端注册）或与 `--client-id` 一起使用（使用预配置的凭据）。

```bash theme={null}
# 使用动态客户端注册的固定回调端口
claude mcp add --transport http \
  --callback-port 8080 \
  my-server https://mcp.example.com/mcp
```

<h3 id="use-pre-configured-oauth-credentials">
  使用预配置的 OAuth 凭据
</h3>

某些 MCP 服务器不支持通过动态客户端注册进行自动 OAuth 设置。如果您看到类似"不兼容的身份验证服务器：不支持动态客户端注册"的错误，服务器需要预配置的凭据。Claude Code 也支持使用客户端 ID 元数据文档 (CIMD) 而不是动态客户端注册的服务器，并自动发现这些服务器。如果自动发现失败，请首先通过服务器的开发者门户注册 OAuth 应用，然后在添加服务器时提供凭据。

<Steps>
  <Step title="使用服务器注册 OAuth 应用">
    通过服务器的开发者门户创建应用，并记下您的客户端 ID 和客户端密钥。

    许多服务器还需要重定向 URI。如果是这样，请选择一个端口并以 `http://localhost:PORT/callback` 的格式注册重定向 URI。在下一步中使用该相同的端口与 `--callback-port`。
  </Step>

  <Step title="使用您的凭据添加服务器">
    选择以下方法之一。用于 `--callback-port` 的端口可以是任何可用的端口。它只需要与您在上一步中注册的重定向 URI 匹配。

    <Tabs>
      <Tab title="claude mcp add">
        使用 `--client-id` 传递您的应用的客户端 ID。`--client-secret` 标志使用掩盖的输入提示输入密钥：

        ```bash theme={null}
        claude mcp add --transport http \
          --client-id your-client-id --client-secret --callback-port 8080 \
          my-server https://mcp.example.com/mcp
        ```
      </Tab>

      <Tab title="claude mcp add-json">
        在 JSON 配置中包含 `oauth` 对象，并将 `--client-secret` 作为单独的标志传递：

        ```bash theme={null}
        claude mcp add-json my-server \
          '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"your-client-id","callbackPort":8080}}' \
          --client-secret
        ```
      </Tab>

      <Tab title="claude mcp add-json（仅回调端口）">
        使用 `--callback-port` 而不使用客户端 ID 来固定端口，同时使用动态客户端注册：

        ```bash theme={null}
        claude mcp add-json my-server \
          '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"callbackPort":8080}}'
        ```
      </Tab>

      <Tab title="CI / 环境变量">
        通过环境变量设置密钥以跳过交互式提示：

        ```bash theme={null}
        MCP_CLIENT_SECRET=your-secret claude mcp add --transport http \
          --client-id your-client-id --client-secret --callback-port 8080 \
          my-server https://mcp.example.com/mcp
        ```
      </Tab>
    </Tabs>
  </Step>

  <Step title="在 Claude Code 中进行身份验证">
    在 Claude Code 中运行 `/mcp` 并按照浏览器登录流程。
  </Step>
</Steps>

<Tip>
  提示：

  * 客户端密钥安全地存储在您的系统钥匙链（macOS）或凭据文件中，而不是在您的配置中
  * 如果服务器使用没有密钥的公共 OAuth 客户端，仅使用 `--client-id` 而不使用 `--client-secret`
  * `--callback-port` 可以与或不与 `--client-id` 一起使用
  * 这些标志仅适用于 HTTP 和 SSE 传输。它们对 stdio 服务器没有影响
  * 使用 `claude mcp get <name>` 验证为服务器配置了 OAuth 凭据
</Tip>

<h3 id="override-oauth-metadata-discovery">
  覆盖 OAuth 元数据发现
</h3>

指向 Claude Code 一个特定的 OAuth 授权服务器元数据 URL 以绕过默认发现链。当 MCP 服务器的标准端点出错时，或当您想通过内部代理路由发现时，设置 `authServerMetadataUrl`。默认情况下，Claude Code 首先检查 RFC 9728 受保护资源元数据（位于 `/.well-known/oauth-protected-resource`），然后回退到 RFC 8414 授权服务器元数据（位于 `/.well-known/oauth-authorization-server`）。

在您的服务器配置中的 `.mcp.json` 的 `oauth` 对象中设置 `authServerMetadataUrl`：

```json theme={null}
{
  "mcpServers": {
    "my-server": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "authServerMetadataUrl": "https://auth.example.com/.well-known/openid-configuration"
      }
    }
  }
}
```

URL 必须使用 `https://`。元数据 URL 的 `scopes_supported` 覆盖上游服务器公开的范围。

<h3 id="restrict-oauth-scopes">
  限制 OAuth 范围
</h3>

设置 `oauth.scopes` 以固定 Claude Code 在授权流程中请求的范围。这是限制 MCP 服务器到安全团队批准的子集的支持方式，当上游授权服务器公开的范围超过您想要授予的范围时。该值是单个空格分隔的字符串，与 RFC 6749 §3.3 中的 `scope` 参数格式匹配。

```json theme={null}
{
  "mcpServers": {
    "slack": {
      "type": "http",
      "url": "https://mcp.slack.com/mcp",
      "oauth": {
        "scopes": "channels:read chat:write search:read"
      }
    }
  }
}
```

`oauth.scopes` 优先于 `authServerMetadataUrl` 和服务器在 `/.well-known` 发现的范围。将其保留未设置以让 MCP 服务器确定请求的范围集。

从 v2.1.196 开始，当未设置 `oauth.scopes` 时，Claude Code 请求服务器的 `WWW-Authenticate` 标头或其受保护资源元数据提供的范围，当两者都未提供时不发送 `scope` 参数。它不再从自动发现的授权服务器元数据请求完整的 `scopes_supported` 目录。请求该目录导致公开仅限管理员或模板范围的身份提供者拒绝授权请求，出现 `invalid_scope` 错误。从配置的 `authServerMetadataUrl` 获取的元数据仍然将其 `scopes_supported` 作为请求的范围提供。

如果授权服务器在 `scopes_supported` 中公开 `offline_access`，Claude Code 会将其附加到固定范围，以便可以在没有新浏览器登录的情况下刷新访问令牌。

如果服务器稍后为工具调用返回 403 `insufficient_scope`，Claude Code 会使用相同的固定范围重新进行身份验证。当您需要的工具需要固定范围之外的范围时，扩展 `oauth.scopes`。

<h3 id="use-dynamic-headers-for-custom-authentication">
  使用动态标头进行自定义身份验证
</h3>

如果您的 MCP 服务器使用 OAuth 以外的身份验证方案（例如 Kerberos、短期令牌或内部 SSO），请使用 `headersHelper` 在连接时生成请求标头。Claude Code 运行命令并将其输出合并到连接标头中。

```json theme={null}
{
  "mcpServers": {
    "internal-api": {
      "type": "http",
      "url": "https://mcp.internal.example.com",
      "headersHelper": "/opt/bin/get-mcp-auth-headers.sh"
    }
  }
}
```

命令也可以是内联的：

```json theme={null}
{
  "mcpServers": {
    "internal-api": {
      "type": "http",
      "url": "https://mcp.internal.example.com",
      "headersHelper": "echo '{\"Authorization\": \"Bearer '\"$(get-token)\"'\"}'"
    }
  }
}
```

**要求：**

* 命令必须将字符串键值对的 JSON 对象写入标准输出
* 命令在 shell 中运行，超时时间为 10 秒，从会话的当前工作目录运行。对脚本使用绝对路径或 `PATH` 上的命令
* 动态标头覆盖任何具有相同名称的静态 `headers`

助手在每次连接时运行（在会话启动和重新连接时）。没有缓存，因此您的脚本负责任何令牌重用。

从 v2.1.193 开始，如果工具调用返回 `401 Unauthorized` 或 `403 Forbidden`，Claude Code 会自动重新运行助手，使用新标头重新连接，并重试调用一次。只有在该重试也失败时，Claude Code 才会在 `/mcp` 中将服务器标记为需要身份验证。

Claude Code 在执行助手时设置这些环境变量：

| 变量                            | 值                                                           |
| :---------------------------- | :---------------------------------------------------------- |
| `CLAUDE_CODE_MCP_SERVER_NAME` | MCP 服务器的名称                                                  |
| `CLAUDE_CODE_MCP_SERVER_URL`  | MCP 服务器的 URL                                                |
| `CLAUDE_PLUGIN_ROOT`          | 插件的根目录。仅当[插件](/docs/zh-CN/plugins-reference#mcp-servers)提供服务器时设置 |

使用这些来编写一个为多个 MCP 服务器服务的单个助手脚本。

对于插件提供的服务器，助手也会在其工作目录设置为插件根目录的情况下运行，因此相对 `headersHelper` 路径在插件目录内解析，而不是针对会话的工作目录。需要 Claude Code v2.1.195 或更高版本。

插件提供的 `headersHelper` 无法引用插件的 [`${user_config.*}`](/docs/zh-CN/plugins-reference#user-configuration) 值，因为命令通过 shell 运行。Claude Code 报告服务器配置错误，并显示[错误](/docs/zh-CN/errors#plugin-command-references-user-config)，不替换该值。将 `${user_config.KEY}` 放在服务器的 `headers` 字段中，该字段不会被 shell 解析，或让助手脚本从其自己的环境或配置文件中读取该值。在 v2.1.207 之前，`headersHelper` 替换了 `${user_config.*}` 值。

<Note>
  `headersHelper` 执行任意 shell 命令。在项目或本地范围定义时，它仅在您接受工作区信任对话框后运行。
</Note>

<h2 id="add-mcp-servers-from-json-configuration">
  从 JSON 配置添加 MCP 服务器
</h2>

如果您有 MCP 服务器的 JSON 配置，您可以直接添加它：

<Steps>
  <Step title="从 JSON 添加 MCP 服务器">
    ```bash theme={null}
    # 基本语法
    claude mcp add-json <name> '<json>'

    # 示例：添加带有 JSON 配置的 HTTP 服务器
    claude mcp add-json weather-api '{"type":"http","url":"https://api.weather.com/mcp","headers":{"Authorization":"Bearer token"}}'

    # 示例：添加带有 JSON 配置的 stdio 服务器
    claude mcp add-json local-weather '{"type":"stdio","command":"/path/to/weather-cli","args":["--api-key","abc123"],"env":{"CACHE_DIR":"/tmp"}}'

    # 示例：添加带有预配置 OAuth 凭据的 HTTP 服务器
    claude mcp add-json my-server '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"your-client-id","callbackPort":8080}}' --client-secret
    ```
  </Step>

  <Step title="验证服务器已添加">
    ```bash theme={null}
    claude mcp get weather-api
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * 确保 JSON 在您的 shell 中正确转义
  * JSON 必须符合 MCP 服务器配置架构
  * 您可以使用 `--scope user` 将服务器添加到您的用户配置而不是项目特定的配置
</Tip>

<h2 id="import-mcp-servers-from-claude-desktop">
  从 Claude Desktop 导入 MCP 服务器
</h2>

如果您已在 Claude Desktop 中配置了 MCP 服务器，您可以导入它们：

<Steps>
  <Step title="从 Claude Desktop 导入服务器">
    ```bash theme={null}
    # 基本语法 
    claude mcp add-from-claude-desktop 
    ```
  </Step>

  <Step title="选择要导入的服务器">
    运行命令后，您将看到一个交互式对话框，允许您选择要导入的服务器。
  </Step>

  <Step title="验证服务器已导入">
    ```bash theme={null}
    claude mcp list 
    ```
  </Step>
</Steps>

通过 `claude mcp` 命令添加的服务器名称只能包含字母、数字、连字符和下划线。Claude Desktop 不应用该限制，因此名称中包含任何其他字符（如空格）的 Claude Desktop 服务器无法导入。导入会报告它拒绝的每个名称，并仍然导入您选择的其他服务器。在 v2.1.205 之前，第一个无效名称会停止导入，所选的服务器都不会被添加。

<Tip>
  提示：

  * 此功能仅在 macOS 和 Windows Subsystem for Linux (WSL) 上有效
  * 它从这些平台上的标准位置读取 Claude Desktop 配置文件
  * 使用 `--scope user` 标志将服务器添加到您的用户配置
  * 导入的服务器将保持与 Claude Desktop 中相同的名称，当名称仅包含字母、数字、连字符和下划线时。Claude Code 会报告名称中包含任何其他字符的服务器并跳过它
  * 如果具有相同名称的服务器已存在，它们将获得数字后缀（例如，`server_1`）
</Tip>

<h2 id="use-mcp-servers-from-claude-ai">
  使用来自 claude.ai 的 MCP 服务器
</h2>

如果您已使用 [claude.ai](https://claude.ai) 帐户登录 Claude Code，您在 claude.ai 中添加的 MCP 服务器（称为 [connectors](https://claude.com/docs/connectors)）会自动在 Claude Code 中可用：

<Steps>
  <Step title="在 claude.ai 中配置 MCP 服务器">
    在 [claude.ai/customize/connectors](https://claude.ai/customize/connectors) 添加服务器。在 Team 和 Enterprise 计划上，仅管理员可以添加服务器。
  </Step>

  <Step title="对 MCP 服务器进行身份验证">
    在 claude.ai 中完成任何必需的身份验证步骤。
  </Step>

  <Step title="在 Claude Code 中查看和管理服务器">
    在 Claude Code 中，使用命令：

    ```text theme={null}
    /mcp
    ```

    claude.ai 服务器在列表中出现，并带有指示它们来自 claude.ai 的指示符。
  </Step>
</Steps>

从 v2.1.161 开始，您从未登录过的连接器会折叠在 claude.ai 部分末尾的 `Show unused connectors` 行后面，因此组织预配的列表不会填满面板。选择该行以展开它们。您之前登录过的连接器即使当前需要重新身份验证，也会保持可见。

Claude.ai 连接器仅在您的活跃[身份验证方法](/docs/zh-CN/authentication#authentication-precedence)是您的 claude.ai 订阅时才会被获取。当 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`apiKeyHelper` 或第三方提供商（如 Amazon Bedrock 或 Google Cloud 的 Agent Platform）处于活跃状态时，它们不会被加载，即使您之前运行过 `/login`。如果 `/mcp` 未列出您添加的连接器，请运行 `/status` 以确认哪种身份验证方法处于活跃状态，取消设置该环境变量或删除 `apiKeyHelper` 设置，然后运行 `/login` 以选择您的 claude.ai 帐户。

您在 Claude Code 中添加的服务器优先于指向相同 URL 的 claude.ai 连接器。发生这种情况时，`/mcp` 会将连接器列为隐藏，并显示如何删除重复项（如果您更希望使用连接器）。

某些 Anthropic 托管的连接器（如 Microsoft 365、Gmail 和 Google Calendar）不支持来自 Claude Code 的本地 OAuth，因为上游身份提供商仅接受 claude.ai 注册的重定向 URL。从 v2.1.162 开始，在 `/mcp` 中对这些主机之一进行身份验证会显示一条消息，指导您改为在 claude.ai 上的"设置"→"连接器"中连接它。连接后，连接器会自动出现在 Claude Code 中。

<h3 id="organization-controls-on-connector-tools">
  组织对连接器工具的控制
</h3>

您的组织可以对 [claude.ai connectors](https://claude.com/docs/connectors) 设置按工具控制。Claude Code 在启动时读取这些设置并在本地强制执行。运行 `/mcp` 以查看哪个设置适用于连接器上的每个工具。

* **工具设置为 `ask`**：Claude Code 会在每次调用时提示，原因是 `Your organization requires approval for this tool`。即使在 `acceptEdits`、`auto` 和 `bypassPermissions` [permission modes](/docs/zh-CN/permissions#permission-modes) 中，提示也会出现，并且永远不会提供记住您选择的选项。匹配该工具的 [Allow rules](/docs/zh-CN/permissions) 也不会跳过提示。在 `dontAsk` 模式中（从不提示），Claude Code 会改为拒绝该调用。
* **工具设置为 `blocked`**：Claude Code 在 Claude 看到之前过滤掉该工具，因此它永远不会出现在工具列表中。

强制执行这些控制需要 Claude Code v2.1.129 或更高版本。早期版本会忽略这些设置并应用标准权限流程。

<h3 id="disable-claude-ai-connectors">
  禁用 claude.ai 连接器
</h3>

要在 Claude Code 中禁用 claude.ai MCP 服务器，请将 [`disableClaudeAiConnectors`](/docs/zh-CN/settings#available-settings) 设置为 `true`（在任何设置范围内）：

```json theme={null}
{
  "disableClaudeAiConnectors": true
}
```

此设置使用任意源为真的语义：任何设置源中的 `true` 优先。已检入的项目 `.claude/settings.json` 可以选择退出云连接器，但项目级别的 `false` 无法重新启用用户级别或策略级别的 `true` 已禁用的连接器。通过 `--mcp-config` 显式传递的服务器不受影响。

您也可以将 `ENABLE_CLAUDEAI_MCP_SERVERS` 环境变量设置为 `false`，这对当前 shell 会话具有相同的效果：

```bash theme={null}
ENABLE_CLAUDEAI_MCP_SERVERS=false claude
```

要阻止单个 claude.ai 连接器而不是全部，请按名称或 URL 模式将它们添加到 [`deniedMcpServers`](/docs/zh-CN/managed-mcp)。例如，`serverName` 条目 `"claude.ai Slack"` 会阻止 Slack 连接器。要仅为当前项目切换连接器的开启或关闭，请使用 `/mcp` 面板。

<Note>
  这些客户端设置管理本地 Claude Code 会话。在 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 会话中，claude.ai 连接器由远程主机预配，并作为显式 `--mcp-config` 条目到达，因此 `disableClaudeAiConnectors` 不适用。连接器 URL 也通过会话代理重写，因此针对供应商 URL 的 `deniedMcpServers` `serverUrl` 模式将不匹配。从您的 claude.ai 组织设置管理云会话可以使用哪些连接器。
</Note>

<h2 id="use-claude-code-as-an-mcp-server">
  将 Claude Code 用作 MCP 服务器
</h2>

您可以将 Claude Code 本身用作 MCP 服务器，其他应用程序可以连接到它：

```bash theme={null}
# 启动 Claude 作为 stdio MCP 服务器
claude mcp serve
```

您可以通过将此配置添加到 claude\_desktop\_config.json 在 Claude Desktop 中使用它：

```json theme={null}
{
  "mcpServers": {
    "claude-code": {
      "type": "stdio",
      "command": "claude",
      "args": ["mcp", "serve"],
      "env": {}
    }
  }
}
```

<Warning>
  **配置可执行文件路径**：`command` 字段必须引用 Claude Code 可执行文件。如果 `claude` 命令不在您的系统 PATH 中，您需要指定可执行文件的完整路径。

  要查找完整路径：

  ```bash theme={null}
  which claude
  ```

  然后在您的配置中使用完整路径：

  ```json theme={null}
  {
    "mcpServers": {
      "claude-code": {
        "type": "stdio",
        "command": "/full/path/to/claude",
        "args": ["mcp", "serve"],
        "env": {}
      }
    }
  }
  ```

  没有正确的可执行文件路径，您会遇到类似 `spawn claude ENOENT` 的错误。
</Warning>

<Tip>
  提示：

  * 服务器提供对 Claude 的工具（如 View、Edit、LS 等）的访问权限。
  * 在 Claude Desktop 中，尝试要求 Claude 读取目录中的文件、进行编辑等。
  * 此 MCP 服务器仅向您的 MCP 客户端公开 Claude Code 的工具，因此您自己的客户端负责为单个工具调用实现用户确认。
</Tip>

<h2 id="mcp-output-limits-and-warnings">
  MCP 输出限制和警告
</h2>

当 MCP 工具产生大量输出时，Claude Code 可帮助管理令牌使用情况，以防止压倒您的对话上下文：

* **输出警告阈值**：当任何 MCP 工具输出超过 10,000 个令牌时，Claude Code 显示警告
* **可配置限制**：您可以使用 `MAX_MCP_OUTPUT_TOKENS` 环境变量调整最大允许的 MCP 输出令牌
* **默认限制**：默认最大值为 25,000 个令牌
* **范围**：环境变量适用于不声明自己限制的工具。声明 [`anthropic/maxResultSizeChars`](#raise-the-limit-for-a-specific-tool) 的工具对文本内容使用该值，无论 `MAX_MCP_OUTPUT_TOKENS` 设置为什么。返回图像数据的工具仍受 `MAX_MCP_OUTPUT_TOKENS` 限制

要为产生大量输出的工具增加限制：

```bash theme={null}
export MAX_MCP_OUTPUT_TOKENS=50000
claude
```

这在使用以下 MCP 服务器时特别有用：

* 查询大型数据集或数据库
* 生成详细的报告或文档
* 处理广泛的日志文件或调试信息

<h3 id="raise-the-limit-for-a-specific-tool">
  为特定工具提高限制
</h3>

如果您正在构建 MCP 服务器，您可以通过在工具的 `tools/list` 响应条目中设置 `_meta["anthropic/maxResultSizeChars"]` 来允许单个工具返回大于默认持久化到磁盘阈值的结果。Claude Code 将该工具的阈值提高到注释值，最高为 500,000 个字符的硬上限。

这对于返回本质上很大但必要的输出的工具很有用，例如数据库架构或完整文件树。没有注释，超过默认阈值的结果会被持久化到磁盘，并在对话中被文件引用替换。

```json theme={null}
{
  "name": "get_schema",
  "description": "Returns the full database schema",
  "_meta": {
    "anthropic/maxResultSizeChars": 200000
  }
}
```

对于文本内容，注释独立于 `MAX_MCP_OUTPUT_TOKENS` 应用，因此用户不需要为声明它的工具提高环境变量。返回图像数据的工具仍受令牌限制。

<Warning>
  如果您经常遇到特定 MCP 服务器的输出警告，而您不控制这些服务器，请考虑增加 `MAX_MCP_OUTPUT_TOKENS` 限制。您也可以要求服务器作者添加 `anthropic/maxResultSizeChars` 注释或对其响应进行分页。注释对返回图像内容的工具没有影响；对于这些，提高 `MAX_MCP_OUTPUT_TOKENS` 是唯一的选择。
</Warning>

<h2 id="tool-input-schemas-with-a-root-level-combinator">
  具有根级组合器的工具输入架构
</h2>

某些 MCP 服务器将工具的输入架构声明为 JSON Schema 联合，在架构的顶级使用 `anyOf`、`oneOf` 或 `allOf`。Claude API 不接受这些关键字在架构根目录。它接受嵌套在 `properties` 内的组合器，Claude Code 原样发送。

从 Claude Code v2.1.195 开始，具有根级组合器的工具保持可用。在将工具发送到 API 之前，Claude Code 将架构展平为单个对象，并在工具的描述前面添加一个句子，告诉 Claude 哪些参数组属于一起：

* `allOf`：来自每个分支的属性被合并，每个分支的 `required` 列表仍然适用
* `anyOf` 和 `oneOf`：来自每个分支的属性被合并，每个分支的 `required` 列表在工具描述中描述，而不是由架构强制执行

您的服务器接收 Claude 选择的任何参数，因此请继续在服务器端验证组合。

当 Claude Code 无法生成 API 接受的架构，或在不接收启用重写的远程配置的部署上（例如离线机器）时，它会跳过该工具，在服务器的日志中记录原因，并保持服务器的其他工具可用。早于 v2.1.195 的版本会跳过其输入架构具有根级 `anyOf`、`oneOf` 或 `allOf` 的每个工具。

<h2 id="require-approval-for-a-specific-tool">
  要求特定工具的批准
</h2>

如果您正在构建 MCP 服务器，您可以通过在工具的 `tools/list` 响应条目中将 `_meta["anthropic/requiresUserInteraction"]` 设置为 `true` 来标记工具需要每次调用时的明确批准。该值必须是 JSON 布尔值 `true`；任何其他值都被忽略。

Claude Code 在每次调用时显示该工具的权限提示，即使在 `acceptEdits`、`auto` 和 `bypassPermissions` [权限模式](/docs/zh-CN/permissions#permission-modes) 中，并且不为其提供"不再询问"选项。[允许规则](/docs/zh-CN/permissions#permission-rule-syntax)与工具匹配也不会跳过提示。在 `dontAsk` 模式中（从不提示），Claude Code 改为拒绝调用。

提示必须到达一个人。在非交互模式下使用 [`--permission-prompt-tool`](/docs/zh-CN/cli-reference#cli-flags)，标记工具的 `allow` 结果从提示工具转换为拒绝，消息为 `MCP tool requires user interaction; not supported via --permission-prompt-tool`。Agent SDK 的 [`canUseTool` 回调](/docs/zh-CN/agent-sdk/permissions)确实接收这些调用并可以批准它们，因为 SDK 主机应该向用户显示它们。

对于权限提示本身就是重点的工具，请使用此功能，例如同意或访问授予步骤，其中自动批准意味着没有人类曾经同意。来自同一服务器的其他工具保持其正常权限行为。

以下 `tools/list` 条目标记一个工具始终需要批准。

```json theme={null}
{
  "name": "grant_access",
  "description": "Requests access to a protected resource",
  "_meta": {
    "anthropic/requiresUserInteraction": true
  }
}
```

`anthropic/requiresUserInteraction` 注释需要 Claude Code v2.1.199 或更高版本。较早的版本忽略它并应用标准权限流程。

当会话连接到[远程控制](/docs/zh-CN/remote-control)或 SDK 主机时，Claude Code 将权限请求标记为需要用户交互，因此客户端向您显示工具的权限提示，而不是一键批准操作。

<h2 id="respond-to-mcp-elicitation-requests">
  响应 MCP 引发请求
</h2>

MCP 服务器可以在任务中途使用引发来请求您的结构化输入。当服务器需要无法自行获取的信息时，Claude Code 会显示交互式对话框并将您的响应传递回服务器。您无需进行任何配置：当服务器请求时，引发对话框会自动出现。

服务器可以通过两种方式请求输入：

* **表单模式**：Claude Code 显示一个对话框，其中包含服务器定义的表单字段（例如，用户名和密码提示）。填写字段并提交。
* **URL 模式**：Claude Code 打开浏览器 URL 以进行身份验证或批准。在浏览器中完成流程，然后在 CLI 中确认。

要自动响应引发请求而不显示对话框，请使用 [`Elicitation` hook](/docs/zh-CN/hooks#elicitation)。

如果您正在构建使用引发的 MCP 服务器，请参阅 [MCP 引发规范](https://modelcontextprotocol.io/docs/learn/client-concepts#elicitation)以了解协议详细信息和架构示例。

<h2 id="use-mcp-resources">
  使用 MCP 资源
</h2>

MCP 服务器可以公开资源，您可以使用 @ 提及来引用，类似于您引用文件的方式。

<h3 id="reference-mcp-resources">
  引用 MCP 资源
</h3>

<Steps>
  <Step title="列出可用资源">
    在您的提示中键入 `@` 以查看来自所有连接的 MCP 服务器的可用资源。资源与文件一起出现在自动完成菜单中。
  </Step>

  <Step title="引用特定资源">
    使用格式 `@server:protocol://resource/path` 来引用资源：

    ```text theme={null}
    Can you analyze @github:issue://123 and suggest a fix?
    ```

    ```text theme={null}
    Please review the API documentation at @docs:file://api/authentication
    ```
  </Step>

  <Step title="多个资源引用">
    您可以在单个提示中引用多个资源：

    ```text theme={null}
    Compare @postgres:schema://users with @docs:file://database/user-model
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * 资源在引用时会自动获取并作为附件包含
  * 资源路径在 @ 提及自动完成中可进行模糊搜索
  * Claude Code 在服务器支持时自动提供列出和读取 MCP 资源的工具
  * 资源可以包含 MCP 服务器提供的任何类型的内容（文本、JSON、结构化数据等）
</Tip>

<h2 id="scale-with-mcp-tool-search">
  使用 MCP 工具搜索进行扩展
</h2>

工具搜索通过延迟工具定义直到 Claude 需要它们来保持 MCP 上下文使用低。仅工具名称和服务器说明在会话启动时加载，因此添加更多 MCP 服务器对您的上下文窗口的影响最小。Claude Code 不对每个服务器施加固定的工具上限；实际限制是您的上下文窗口预算。

<h3 id="how-it-works">
  工作原理
</h3>

工具搜索默认启用。MCP 工具被延迟而不是预先加载到上下文中，Claude 使用搜索工具在任务需要时发现相关的工具。仅 Claude 实际使用的工具进入上下文。从您的角度来看，MCP 工具的工作方式与之前完全相同。

如果您更喜欢基于阈值的加载，请设置 `ENABLE_TOOL_SEARCH=auto` 以在工具适合上下文窗口的 10% 内时预先加载架构，仅延迟溢出部分。有关所有选项，请参阅[配置工具搜索](#configure-tool-search)。

<h3 id="for-mcp-server-authors">
  对于 MCP 服务器作者
</h3>

如果您正在构建 MCP 服务器，启用工具搜索时服务器说明字段会变得更有用。服务器说明可帮助 Claude 了解何时搜索您的工具，类似于 [skills](/docs/zh-CN/skills) 的工作方式。

添加清晰、描述性的服务器说明，说明：

* 您的工具处理的任务类别
* Claude 应何时搜索您的工具
* 您的服务器提供的关键功能

Claude Code 将工具描述和服务器说明截断为每个 2KB。保持它们简洁以避免截断，并将关键详细信息放在开头。

<h3 id="configure-tool-search">
  配置工具搜索
</h3>

工具搜索默认启用：MCP 工具被延迟并按需发现。Claude Code 在 Google Cloud 的 Agent Platform 上默认禁用它。当 `ANTHROPIC_BASE_URL` 指向非第一方主机时，它也被禁用，因为大多数代理不转发 `tool_reference` 块。显式设置 `ENABLE_TOOL_SEARCH` 以覆盖任一回退。

设置 [`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`](/docs/zh-CN/env-vars) 保持工具搜索关闭，`ENABLE_TOOL_SEARCH` 无法覆盖它。该变量删除 `defer_loading` 工具定义和 `tool_reference` 内容块所需的 beta 标头。

工具搜索需要支持 `tool_reference` 块的模型：Claude Sonnet 4.5、Claude Haiku 4.5、Claude Opus 4.5 及更高版本的模型。有关当前列表，请参阅 [API 文档中的模型兼容性](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool#model-compatibility)。在 Google Cloud 的 Agent Platform 上，工具搜索支持 Claude Sonnet 4.5 及更高版本以及 Claude Opus 4.5 及更高版本。

使用 `ENABLE_TOOL_SEARCH` 环境变量控制工具搜索行为：

| 值        | 行为                                                                                                                                                                          |
| :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| （未设置）    | 所有 MCP 工具被延迟并按需加载。在 Google Cloud 的 Agent Platform 上或当 `ANTHROPIC_BASE_URL` 是非第一方主机时回退到预先加载                                                                                  |
| `true`   | 所有 MCP 工具被延迟。Claude Code 即使在 Google Cloud 的 Agent Platform 上和通过代理也会发送 beta 标头。对于早于 Sonnet 4.5 或 Opus 4.5 的 Google Cloud 的 Agent Platform 模型或不支持 `tool_reference` 块的代理，请求会失败 |
| `auto`   | 阈值模式：如果工具适合上下文窗口的 10% 内，则预先加载，否则延迟                                                                                                                                          |
| `auto:N` | 阈值模式，带有自定义百分比，其中 `N` 是 0-100。例如，`auto:5` 表示 5%                                                                                                                              |
| `false`  | 所有 MCP 工具预先加载，无延迟                                                                                                                                                           |

```bash theme={null}
# 使用自定义 5% 阈值
ENABLE_TOOL_SEARCH=auto:5 claude

# 完全禁用工具搜索
ENABLE_TOOL_SEARCH=false claude
```

或在您的 [settings.json `env` 字段](/docs/zh-CN/settings#available-settings) 中设置值。

您也可以专门禁用 `ToolSearch` 工具：

```json theme={null}
{
  "permissions": {
    "deny": ["ToolSearch"]
  }
}
```

<h3 id="exempt-a-server-from-deferral">
  豁免服务器延迟
</h3>

如果服务器的工具应始终对 Claude 可见而无需搜索步骤，请在该服务器的配置中将 `alwaysLoad` 设置为 `true`。来自该服务器的每个工具随后在会话启动时加载到上下文中，无论 `ENABLE_TOOL_SEARCH` 设置如何。对于 Claude 在每个回合都需要的少量工具，请使用此选项，因为每个预先加载的工具会消耗本来可用于您的对话的上下文。

以下 `.mcp.json` 条目豁免一个 HTTP 服务器，同时保持其他服务器延迟：

```json theme={null}
{
  "mcpServers": {
    "core-tools": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "alwaysLoad": true
    }
  }
}
```

`alwaysLoad` 字段在所有服务器类型上可用，需要 Claude Code v2.1.121 或更高版本。MCP 服务器也可以通过在工具的 `_meta` 对象中包含 `"anthropic/alwaysLoad": true` 来标记单个工具为始终加载，这对该工具仅具有相同的效果。

设置 `alwaysLoad: true` 也会阻止启动直到服务器连接，上限为标准 5 秒连接超时。即使 MCP 启动在其他方面[默认为非阻塞](/docs/zh-CN/env-vars)，这也适用，因为工具必须在构建第一个提示时存在。其他服务器继续在后台连接。

<h2 id="use-mcp-prompts-as-commands">
  将 MCP 提示用作命令
</h2>

MCP 服务器可以公开在 Claude Code 中作为命令可用的提示。

<h3 id="execute-mcp-prompts">
  执行 MCP 提示
</h3>

<Steps>
  <Step title="发现可用的提示">
    键入 `/` 以查看所有可用的命令，包括来自 MCP 服务器的命令。MCP 提示以 `/mcp__servername__promptname` 的格式出现。
  </Step>

  <Step title="执行不带参数的提示">
    ```text theme={null}
    /mcp__github__list_prs
    ```
  </Step>

  <Step title="执行带参数的提示">
    许多提示接受参数。在命令后面用空格分隔传递它们：

    ```text theme={null}
    /mcp__github__pr_review 456
    ```

    ```text theme={null}
    /mcp__jira__create_issue "Bug in login flow" high
    ```
  </Step>
</Steps>

<Tip>
  提示：

  * MCP 提示从连接的服务器动态发现
  * 参数根据提示的定义参数进行解析
  * 提示结果直接注入到对话中
  * 服务器和提示名称被规范化，空格转换为下划线
</Tip>

<h2 id="managed-mcp-configuration">
  托管 MCP 配置
</h2>

对于需要对用户可以连接的 MCP 服务器进行集中控制的组织，请参阅[托管 MCP 配置](/docs/zh-CN/managed-mcp)。它涵盖使用 `managed-mcp.json` 部署固定服务器集、使用 `allowedMcpServers` 和 `deniedMcpServers` 限制服务器，以及当服务器被阻止时用户看到的内容。
