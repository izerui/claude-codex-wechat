> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 控制组织的 MCP 服务器访问权限

> 使用托管配置文件、允许列表和拒绝列表限制用户可以添加或连接的 MCP 服务器。

默认情况下，任何运行 Claude Code 的人都可以连接他们选择的任何 [MCP 服务器](/docs/zh-CN/mcp)。Anthropic 在将连接器添加到 [Anthropic 目录](https://claude.ai/directory)之前会根据其[列表标准](https://claude.com/docs/connectors/building/review-criteria)审查连接器，但不会对任何 MCP 服务器进行安全审计或管理。作为管理员，您可以限制在组织中运行的服务器，从部署固定的批准集到完全禁用 MCP。

本页面涵盖以下内容：

* [选择与您需要的控制级别相匹配的模式](#choose-a-pattern)
* [使用 `managed-mcp.json` 部署固定服务器集](#exclusive-control-with-managed-mcp-json)，包括如何[完全禁用 MCP](#disable-mcp-entirely)
* [使用允许列表和拒绝列表控制服务器](#policy-based-control-with-allowlists-and-denylists)
* [告知用户当限制阻止服务器时会发生什么](#how-restrictions-appear-to-users)
* [监控组织实际使用的服务器](#monitor-mcp-usage)

<Note>
  [安全](/docs/zh-CN/security)页面涵盖 MCP 威胁模型以及如何在批准服务器之前对其进行评估。[决定要强制执行的内容](/docs/zh-CN/admin-setup#decide-what-to-enforce)涵盖 MCP 限制以及其他管理控制。
</Note>

<h2 id="choose-a-pattern">
  选择一个模式
</h2>

Claude Code 支持一系列限制级别。每个模式使用以下涵盖的一种或两种机制：`managed-mcp.json` 用于部署固定集，`allowedMcpServers`/`deniedMcpServers` 用于过滤用户配置的内容。

| 模式         | 功能                                 | 配置                                                                                           |
| :--------- | :--------------------------------- | :------------------------------------------------------------------------------------------- |
| **禁用 MCP** | 任何地方都不加载服务器                        | `managed-mcp.json` 带有空服务器映射                                                                  |
| **固定部署**   | 每个用户获得相同的服务器，无法添加其他服务器             | `managed-mcp.json` 包含您想要的服务器                                                                 |
| **批准的目录**  | 发布批准的服务器列表；用户添加他们想要的服务器，其他任何内容都被阻止 | `allowedMcpServers` + `allowManagedMcpServersOnly: true`                                     |
| **仅插件服务器** | 服务器只能来自插件；用户无法添加自己的服务器             | [`strictPluginOnlyCustomization`](/docs/zh-CN/settings#strictpluginonlycustomization) 列表中包含 `mcp` |
| **软允许列表**  | 强制执行允许列表，用户可以在自己的设置中扩展             | `allowedMcpServers` 不带 `allowManagedMcpServersOnly`                                          |
| **仅拒绝列表**  | 阻止已知的坏服务器，允许其他所有服务器                | `deniedMcpServers`                                                                           |
| **无限制**    | 用户添加任何内容                           | 不部署任何托管 MCP 配置                                                                               |

<Note>
  Claude Code 没有内置的 MCP 服务器注册表供用户浏览和安装。对于批准目录模式，在用户会找到的地方（如内部 wiki）共享批准列表及其 `claude mcp add` 命令，或通过[托管插件市场](/docs/zh-CN/plugin-marketplaces#managed-marketplace-restrictions)将服务器作为插件分发，以便用户可以从 `/plugin` 浏览和安装它们。
</Note>

<h2 id="exclusive-control-with-managed-mcp-json">
  使用 managed-mcp.json 进行独占控制
</h2>

如果您部署 `managed-mcp.json` 文件，Claude Code 仅加载该文件定义的服务器。用户无法添加、修改或使用任何其他 MCP 服务器，包括插件提供的服务器。该文件还会禁止 claude.ai 连接器，除非您[允许它们与托管集一起使用](#allow-claude-ai-connectors-alongside-the-managed-set)。

两个其他设置可以进一步过滤托管集：

* `allowedMcpServers` 和 `deniedMcpServers` 也适用于托管服务器，因此不通过它们的托管服务器将不会加载。
* 用户自己的 `deniedMcpServers` 从他们的设置中合并，因此用户可以为自己阻止托管服务器。

有关完整的检查顺序，请参阅[如何评估服务器](#how-a-server-is-evaluated)。

`managed-mcp.json` 是一个独立文件，因此无法通过[服务器管理的设置](/docs/zh-CN/server-managed-settings)交付。任何可以写入具有管理员权限的系统路径的进程都可以部署它。大规模情况下，通常通过设备管理工具进行，例如 macOS 上的 Jamf 或配置文件、Windows 上的组策略或 Intune，或 Linux 上您选择的舰队管理。Claude Code 在以下路径之一查找该文件：

| 平台          | 路径                                                         |
| :---------- | :--------------------------------------------------------- |
| macOS       | `/Library/Application Support/ClaudeCode/managed-mcp.json` |
| Linux 和 WSL | `/etc/claude-code/managed-mcp.json`                        |
| Windows     | `C:\Program Files\ClaudeCode\managed-mcp.json`             |

该文件使用与项目 [`.mcp.json`](/docs/zh-CN/mcp#project-scope) 文件相同的格式：

```json theme={null}
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    },
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp"
    },
    "company-internal": {
      "type": "stdio",
      "command": "/usr/local/bin/company-mcp-server",
      "args": ["--config", "/etc/company/mcp-config.json"],
      "env": {
        "COMPANY_API_URL": "https://internal.example.com"
      }
    }
  }
}
```

<h3 id="authenticate-with-per-user-credentials">
  使用按用户凭证进行身份验证
</h3>

机器上的任何用户都可以读取此文件，因此不要在 `env` 块中存储 API 密钥或其他凭证。改用以下其中一种方式传递按用户凭证：

* [`${VAR}` 扩展](/docs/zh-CN/mcp#environment-variable-expansion-in-mcp-json)从每个用户的环境中读取机密。
* [OAuth 或按用户标头](/docs/zh-CN/mcp#authenticate-with-remote-mcp-servers)以便每个用户以自己的身份进行身份验证。
* [`headersHelper`](/docs/zh-CN/mcp#use-dynamic-headers-for-custom-authentication)在连接时生成凭证。

<h3 id="validate-the-configuration">
  验证配置
</h3>

要确认文件生效，请在托管机器上运行两个检查：

1. `claude mcp list` 仅显示 `managed-mcp.json` 中的服务器。如果用户自己的服务器仍然出现，则文件未被读取；检查路径和权限。
2. `claude mcp add --transport http test https://example.com/mcp` 失败，显示 `Cannot add MCP server: enterprise MCP configuration is active and has exclusive control over MCP servers`。URL 不需要是真实服务器，因为策略检查在联系任何内容之前拒绝该命令。

<h3 id="disable-mcp-entirely">
  完全禁用 MCP
</h3>

部署包含空服务器映射的 `managed-mcp.json` 以阻止每个 MCP 服务器：

```json theme={null}
{
  "mcpServers": {}
}
```

用户在 `/mcp` 中看不到任何 MCP 服务器，`claude mcp add` 失败，显示上述企业策略错误。用户之前配置的服务器在下次启动会话时停止加载，没有警告说明策略是原因。

<h3 id="allow-claude-ai-connectors-alongside-the-managed-set">
  允许 claude.ai 连接器与托管集一起使用
</h3>

部署 `managed-mcp.json` 默认会禁止 [claude.ai 连接器](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai)，包括管理员在 claude.ai 管理控制台中为组织配置的连接器。要将这些连接器与 `managed-mcp.json` 中的服务器一起加载，请在[托管设置源](/docs/zh-CN/admin-setup#decide-how-settings-reach-devices)中设置 `"allowAllClaudeAiMcps": true`。需要 Claude Code v2.1.149 或更高版本。

启用该设置后，Claude Code 加载的 claude.ai 连接器与未部署 `managed-mcp.json` 时加载的连接器相同。[允许列表和拒绝列表](#policy-based-control-with-allowlists-and-denylists)仍然适用于这些连接器，因此您可以使用 `deniedMcpServers` 阻止特定连接器。该设置仅影响 claude.ai 连接器；插件提供的服务器保持禁止状态。

Claude Code 仅从管理员控制的策略层读取此设置：服务器管理的设置、MDM 部署的 plist 或 HKLM 注册表项，或系统 `managed-settings.json` 文件。将其放在用户或项目设置中无效，因此用户无法重新启用独占控制禁止的连接器。

<h2 id="policy-based-control-with-allowlists-and-denylists">
  使用允许列表和拒绝列表进行基于策略的控制
</h2>

允许列表和拒绝列表过滤允许加载的已配置服务器。它们不是注册表：服务器仍然必须由用户、插件或 `managed-mcp.json` 添加，然后允许列表或拒绝列表才能应用于它。要将服务器部署给用户，请使用 [`managed-mcp.json`](#exclusive-control-with-managed-mcp-json)。两个列表也过滤通过 [`--mcp-config` CLI 标志](/docs/zh-CN/cli-reference#cli-flags) 传递的服务器；`--strict-mcp-config` 限制加载哪些配置文件，不会绕过任一列表。

要使允许列表具有权威性，请在[托管设置源](/docs/zh-CN/admin-setup#decide-how-settings-reach-devices)（如服务器管理的设置或部署的 `managed-settings.json` 文件）中一起设置 `allowedMcpServers` 和 `allowManagedMcpServersOnly: true`。[将允许列表限制为仅托管设置](#restrict-the-allowlist-to-managed-settings-only)显示配置。没有 `allowManagedMcpServersOnly`，来自每个设置源的允许列表会合并，包括用户自己的 `~/.claude/settings.json`，因此用户可以扩展您的允许列表允许的内容。拒绝列表无论如何都会从每个源合并。

<Note>
  `allowManagedMcpServersOnly` 与 `allowManagedPermissionRulesOnly` 分开，后者锁定[权限规则](/docs/zh-CN/permissions#managed-settings)。设置该标志不会强制执行 MCP 允许列表。
</Note>

<h3 id="match-servers-by-url-command-or-name">
  按 URL、命令或名称匹配服务器
</h3>

`allowedMcpServers` 和 `deniedMcpServers` 是条目列表。每个条目是一个对象，具有单个键，用于按 URL、命令或名称标识服务器：

| 键               | 匹配                      | 用于             |
| :-------------- | :---------------------- | :------------- |
| `serverUrl`     | 远程服务器 URL，精确或带有 `*` 通配符 | HTTP 和 SSE 服务器 |
| `serverCommand` | 启动 stdio 服务器的精确命令和参数    | Stdio 服务器      |
| `serverName`    | 用户分配的标签。仅精确匹配；通配符不展开    | 任一类型，但请参阅下面的警告 |

不设置 `allowedMcpServers` 与将其设置为空数组不同：

| 设置                  | 未设置（默认）  | 空数组 `[]` | 已填充       |
| :------------------ | :------- | :------- | :-------- |
| `allowedMcpServers` | 允许所有服务器  | 不允许任何服务器 | 仅允许匹配的服务器 |
| `deniedMcpServers`  | 不阻止任何服务器 | 不阻止任何服务器 | 阻止匹配的服务器  |

请参阅[托管设置中的无效条目](/docs/zh-CN/settings#invalid-entries-in-managed-settings)了解条目未通过架构验证时会发生什么。

<Warning>
  `serverName` 条目（在任一列表中）不是安全控制。名称是用户在运行 `claude mcp add` 或编辑配置文件时分配的标签，而不是底层服务器，因此用户可以将任何服务器称为 `github`。对于 claude.ai 连接器，名称是 claude.ai 返回的显示名称，可能会更改。要强制执行实际运行的服务器，请添加 `serverCommand` 或 `serverUrl` 条目。
</Warning>

`serverName` 验证在两个列表之间有所不同：

* 在 `deniedMcpServers` 中，`serverName` 接受任何非空字符串，因此您可以按显示名称阻止 [claude.ai 连接器](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai)。例如，`{ "serverName": "claude.ai Slack" }` 阻止 Slack 连接器。当您需要拒绝对重命名具有鲁棒性时，或当连接器名称冲突并获得 ` (N)` 后缀时，更倾向于使用 `serverUrl` 条目。
* 在 `allowedMcpServers` 中，`serverName` 仅限于字母、数字、连字符和下划线。使用 `serverUrl` 来允许列表 claude.ai 连接器。

要关闭所有 claude.ai 连接器，请参阅 [`disableClaudeAiConnectors`](/docs/zh-CN/mcp#disable-claude-ai-connectors)。

<h3 id="how-a-server-is-evaluated">
  如何评估服务器
</h3>

在加载服务器之前，包括来自 `managed-mcp.json` 的服务器，Claude Code 按顺序运行三个检查：

1. **合并列表。** 来自每个设置源的允许列表和拒绝列表条目合并为一个允许列表和一个拒绝列表。当 `allowManagedMcpServersOnly` 为 `true` 时，仅保留托管允许列表；拒绝列表始终从每个源合并。
2. **检查拒绝列表。** 与任何拒绝列表条目匹配的服务器（按 URL、命令或名称）被阻止。没有任何内容可以覆盖拒绝列表匹配。
3. **检查允许列表。** 如果 `allowedMcpServers` 未在任何地方设置，通过拒绝列表的每个服务器都会加载。如果已设置，服务器必须匹配的内容取决于其类型，如下表所示。

| 服务器类型          | 匹配时允许                                                                  |
| :------------- | :--------------------------------------------------------------------- |
| 远程（HTTP 或 SSE） | 一个 `serverUrl` 条目。仅当允许列表不包含 `serverUrl` 条目时，`serverName` 匹配才计数         |
| Stdio          | 一个 `serverCommand` 条目。仅当允许列表不包含 `serverCommand` 条目时，`serverName` 匹配才计数 |

这些检查中适用三个匹配规则：

* **命令精确匹配。** 每个参数，按顺序。`["npx", "-y", "server"]` 不匹配 `["npx", "server"]` 或 `["npx", "-y", "server", "--flag"]`。
* **`serverCommand` 和 `serverUrl` 值在匹配前展开。** 策略条目和服务器的配置值都经过与 `.mcp.json` 相同的 [`${VAR}` 和 `${VAR:-default}` 展开](/docs/zh-CN/mcp#environment-variable-expansion-in-mcp-json)，因此写成 `["${HOME}/bin/server"]` 的条目匹配使用相同引用或展开路径的服务器配置。在 Windows 上，引用在那里设置的环境变量，例如 `${USERPROFILE}` 而不是 `${HOME}`。`serverName` 值按字面匹配，永不展开。
* **URL 支持 `*` 通配符**在模式中的任何地方，包括方案。主机名匹配不区分大小写，忽略尾部 FQDN 点，因此 `https://Mcp.Example.com/*` 匹配 `https://mcp.example.com/api`。路径保持区分大小写。

| 模式                          | 允许                        |
| :-------------------------- | :------------------------ |
| `https://mcp.example.com/*` | 特定域上的所有路径                 |
| `https://mcp.example.com`   | 也允许该域上的所有路径。没有路径的模式匹配任何路径 |
| `https://*.example.com/*`   | `example.com` 的任何子域       |
| `http://localhost:*/*`      | localhost 上的任何端口          |
| `*://mcp.example.com/*`     | 任何方案到特定域                  |

因为 `${VAR}` 展开读取 Claude Code 自己的进程环境，引用变量的 `serverCommand` 或 `serverUrl` 策略条目展开为用户设置的任何值。对于您依赖的强制执行条目，使用字面 URL 和命令。

<h3 id="example-configuration">
  示例配置
</h3>

下面的配置设置了一个硬允许列表和一个拒绝列表。突出显示的行改变了列表其余部分的评估方式，块后的标注解释了每一行：

```json {3,5,11} theme={null}
{
  "allowedMcpServers": [
    { "serverUrl": "https://api.githubcopilot.com/*" },
    { "serverUrl": "https://mcp.sentry.dev/*" },
    { "serverCommand": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."] },
    { "serverCommand": ["python", "/usr/local/bin/approved-server.py"] },
    { "serverUrl": "https://mcp.example.com/*" },
    { "serverUrl": "https://*.internal.example.com/*" }
  ],
  "deniedMcpServers": [
    { "serverName": "dangerous-server" },
    { "serverCommand": ["npx", "-y", "unapproved-package"] },
    { "serverUrl": "https://*.untrusted.example.com/*" }
  ]
}
```

* **第 3 行**：第一个 `serverUrl` 条目。一旦存在，每个远程服务器必须匹配 URL 模式，因此用户无法通过给它一个允许的名称来获得未列出的远程服务器。
* **第 5 行**：第一个 `serverCommand` 条目。对 stdio 服务器的效果相同，因此每个本地服务器必须精确匹配列出的命令。
* **第 11 行**：拒绝列表中的 `serverName` 条目。拒绝列表条目始终适用，因此任何名为 `dangerous-server` 的服务器都被阻止，无论其 URL 或命令如何。

此允许列表中的 `serverName` 条目永远不会匹配任何内容，因为两种传输类型都已有更严格的条目。

下面的手风琴演示了如何针对其他允许列表和拒绝列表组合评估服务器。

<Accordion title="仅 URL 允许列表">
  ```json theme={null}
  {
    "allowedMcpServers": [
      { "serverUrl": "https://mcp.example.com/*" },
      { "serverUrl": "https://*.internal.example.com/*" }
    ]
  }
  ```

  | 服务器                                                | 结果              |
  | :------------------------------------------------- | :-------------- |
  | `https://mcp.example.com/api` 处的 HTTP 服务器          | 允许：匹配 URL 模式    |
  | `https://api.internal.example.com/mcp` 处的 HTTP 服务器 | 允许：匹配通配符子域      |
  | `https://external.example.com/mcp` 处的 HTTP 服务器     | 阻止：不匹配任何 URL 模式 |
  | 具有任何命令的 Stdio 服务器                                  | 阻止：没有名称或命令条目可匹配 |
</Accordion>

<Accordion title="仅命令允许列表">
  ```json theme={null}
  {
    "allowedMcpServers": [
      { "serverCommand": ["npx", "-y", "approved-package"] }
    ]
  }
  ```

  | 服务器                                                | 结果           |
  | :------------------------------------------------- | :----------- |
  | 具有 `["npx", "-y", "approved-package"]` 的 Stdio 服务器 | 允许：匹配命令      |
  | 具有 `["node", "server.js"]` 的 Stdio 服务器             | 阻止：不匹配命令     |
  | 名为 `my-api` 的 HTTP 服务器                             | 阻止：没有名称条目可匹配 |
</Accordion>

<Accordion title="混合名称和命令允许列表">
  ```json theme={null}
  {
    "allowedMcpServers": [
      { "serverName": "github" },
      { "serverCommand": ["npx", "-y", "approved-package"] }
    ]
  }
  ```

  | 服务器                                                                | 结果                         |
  | :----------------------------------------------------------------- | :------------------------- |
  | 名为 `local-tool` 的 Stdio 服务器，具有 `["npx", "-y", "approved-package"]` | 允许：匹配命令                    |
  | 名为 `local-tool` 的 Stdio 服务器，具有 `["node", "server.js"]`             | 阻止：命令条目存在但不匹配              |
  | 名为 `github` 的 Stdio 服务器，具有 `["node", "server.js"]`                 | 阻止：stdio 服务器在存在命令条目时必须匹配命令 |
  | 名为 `github` 的 HTTP 服务器                                             | 允许：匹配名称                    |
  | 名为 `other-api` 的 HTTP 服务器                                          | 阻止：名称不匹配                   |
</Accordion>

<Accordion title="仅名称允许列表">
  ```json theme={null}
  {
    "allowedMcpServers": [
      { "serverName": "github" },
      { "serverName": "internal-tool" }
    ]
  }
  ```

  | 服务器                                   | 结果       |
  | :------------------------------------ | :------- |
  | 名为 `github` 的 Stdio 服务器，具有任何命令        | 允许：无命令限制 |
  | 名为 `internal-tool` 的 Stdio 服务器，具有任何命令 | 允许：无命令限制 |
  | 名为 `github` 的 HTTP 服务器                | 允许：匹配名称  |
  | 任何名为 `other` 的服务器                     | 阻止：名称不匹配 |
</Accordion>

<Accordion title="带拒绝列表覆盖的允许列表">
  ```json theme={null}
  {
    "allowedMcpServers": [
      { "serverUrl": "https://*.example.com/*" }
    ],
    "deniedMcpServers": [
      { "serverUrl": "https://staging.example.com/*" }
    ]
  }
  ```

  | 服务器                                           | 结果                       |
  | :-------------------------------------------- | :----------------------- |
  | `https://mcp.example.com/api` 处的 HTTP 服务器     | 允许：匹配允许列表 URL 模式，无拒绝列表匹配 |
  | `https://staging.example.com/api` 处的 HTTP 服务器 | 阻止：两者都匹配，但拒绝列表优先         |
  | `https://other.com/mcp` 处的 HTTP 服务器           | 阻止：不匹配允许列表               |
</Accordion>

<h3 id="restrict-the-allowlist-to-managed-settings-only">
  将允许列表限制为仅托管设置
</h3>

要使托管允许列表成为唯一适用的列表，请在托管设置文件中设置 `allowManagedMcpServersOnly`：

```json theme={null}
{
  "allowManagedMcpServersOnly": true,
  "allowedMcpServers": [
    { "serverUrl": "https://api.githubcopilot.com/*" },
    { "serverUrl": "https://*.internal.example.com/*" }
  ]
}
```

当 `allowManagedMcpServersOnly` 为 `true` 时，来自用户、项目和本地设置的允许列表被忽略。拒绝列表仍然从所有源合并，因此用户总是可以为自己阻止服务器。

<h2 id="how-restrictions-appear-to-users">
  限制如何显示给用户
</h2>

当限制阻止服务器时，用户要么看到来自 `claude mcp add` 的错误，要么服务器无声地停止加载。使用此表识别这些报告，并在推出更改之前告知用户会发生什么：

| 限制                                          | 用户看到的内容                                                                                                    |
| :------------------------------------------ | :--------------------------------------------------------------------------------------------------------- |
| `managed-mcp.json` 存在且用户运行 `claude mcp add` | `Cannot add MCP server: enterprise MCP configuration is active and has exclusive control over MCP servers` |
| 服务器在拒绝列表上且用户运行 `claude mcp add`             | `Cannot add MCP server "<name>": server is explicitly blocked by enterprise policy`                        |
| 服务器不在允许列表上且用户运行 `claude mcp add`            | `Cannot add MCP server "<name>": not allowed by enterprise policy`                                         |
| 之前配置的服务器现在被策略阻止                             | 服务器无声地从 `/mcp` 和 `claude mcp list` 消失，没有警告                                                                 |

在最后一种情况下，用户没有收到策略是其服务器消失原因的信号，因此在推出新限制时告知受影响的用户哪些服务器被阻止。

<h2 id="monitor-mcp-usage">
  监控 MCP 使用情况
</h2>

当[配置 OpenTelemetry 导出](/docs/zh-CN/monitoring-usage)时，Claude Code 可以记录用户调用的 MCP 服务器和工具。设置 `OTEL_LOG_TOOL_DETAILS=1` 以在工具事件中包含 MCP 服务器和工具名称，然后在您的收集器中聚合它们以查看用户实际连接的服务器。请参阅[监控](/docs/zh-CN/monitoring-usage)以设置导出器和完整的事件架构。

<h2 id="configuration-summary">
  配置摘要
</h2>

本页面涵盖的每个文件和设置、它控制的内容以及如何交付它：

| 表面                           | 控制的内容                                           | 位置                                                                                                   | 如何交付                                                                                                                 |
| :--------------------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| `managed-mcp.json`           | 固定服务器集，独占控制                                     | 系统路径：`/Library/Application Support/ClaudeCode/`、`/etc/claude-code/` 或 `C:\Program Files\ClaudeCode\` | MDM、GPO、舰队管理或任何具有管理员权限的进程。无法通过服务器管理的设置设置                                                                             |
| `allowedMcpServers`          | 允许的服务器允许列表                                      | 任何[设置文件](/docs/zh-CN/settings#settings-files)；来自每个源的条目合并，除非设置了 `allowManagedMcpServersOnly`               | 为了强制执行，一个[托管设置源](/docs/zh-CN/admin-setup#decide-how-settings-reach-devices)：服务器管理的设置、`managed-settings.json`、MDM 配置文件或注册表 |
| `deniedMcpServers`           | 被阻止的服务器拒绝列表                                     | 任何设置文件；来自每个源的条目合并                                                                                    | 与 `allowedMcpServers` 相同                                                                                             |
| `allowManagedMcpServersOnly` | 将允许列表锁定为仅托管源                                    | 仅托管设置源；该设置在其他地方无效                                                                                    | 与 `allowedMcpServers` 相同                                                                                             |
| `allowAllClaudeAiMcps`       | 加载 claude.ai 连接器与 `managed-mcp.json` 一起，而不是抑制它们 | 仅托管设置源；该设置在其他地方无效                                                                                    | 与 `allowedMcpServers` 相同                                                                                             |

<h2 id="related-resources">
  相关资源
</h2>

* [决定要强制执行的内容](/docs/zh-CN/admin-setup#decide-what-to-enforce)：MCP 限制以及权限规则、沙箱和其他管理控制
* [通过 MCP 将 Claude Code 连接到工具](/docs/zh-CN/mcp)：完整的 MCP 参考，包括传输、范围和身份验证
* [设置](/docs/zh-CN/settings)：设置层次结构以及托管设置如何优先
* [服务器管理的设置](/docs/zh-CN/server-managed-settings)：从 Claude.ai 管理控制台交付 `allowedMcpServers` 和 `deniedMcpServers`
* [安全](/docs/zh-CN/security)：这些控制防御的威胁模型
* [Claude 企业管理员指南](https://claude.com/resources/tutorials/claude-enterprise-administrator-guide)：SSO、SCIM、座位管理和推出剧本
