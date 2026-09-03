> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用 MCP 连接外部工具

> 配置 MCP 服务器以扩展您的代理的外部工具。涵盖传输类型、大型工具集的工具搜索、身份验证和错误处理。

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro) 是一个开放标准，用于将 AI 代理连接到外部工具和数据源。使用 MCP，您的代理可以查询数据库、与 Slack 和 GitHub 等 API 集成，以及连接到其他服务，而无需编写自定义工具实现。

MCP 服务器可以作为本地进程运行、通过 HTTP 连接或直接在您的 SDK 应用程序中执行。

<Note>
  本页面涵盖 Agent SDK 的 MCP 配置。要将 MCP 服务器添加到 Claude Code CLI 以便在每个项目中加载，请参阅 [MCP 安装范围](/docs/zh-CN/mcp#mcp-installation-scopes)。
</Note>

<h2 id="quickstart">
  快速开始
</h2>

此示例使用 [HTTP 传输](#http%2Fsse-servers) 连接到 [Claude Code 文档](https://code.claude.com/docs) MCP 服务器，并使用 [`allowedTools`](#allow-mcp-tools) 与通配符来允许来自服务器的所有工具。

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Use the docs MCP server to explain what hooks are in Claude Code",
    options: {
      mcpServers: {
        "claude-code-docs": {
          type: "http",
          url: "https://code.claude.com/docs/mcp"
        }
      },
      allowedTools: ["mcp__claude-code-docs__*"]
    }
  })) {
    if (message.type === "result" && message.subtype === "success") {
      console.log(message.result);
    }
  }
  ```

  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage


  async def main():
      options = ClaudeAgentOptions(
          mcp_servers={
              "claude-code-docs": {
                  "type": "http",
                  "url": "https://code.claude.com/docs/mcp",
              }
          },
          allowed_tools=["mcp__claude-code-docs__*"],
      )

      async for message in query(
          prompt="Use the docs MCP server to explain what hooks are in Claude Code",
          options=options,
      ):
          if isinstance(message, ResultMessage) and message.subtype == "success":
              print(message.result)


  asyncio.run(main())
  ```
</CodeGroup>

代理连接到文档服务器，搜索有关 hooks 的信息，并返回结果。

<h2 id="add-an-mcp-server">
  添加 MCP 服务器
</h2>

您可以在调用 `query()` 时在代码中配置 MCP 服务器，或在通过 [`settingSources`](#from-a-config-file) 加载的 `.mcp.json` 文件中配置。

<h3 id="in-code">
  在代码中
</h3>

在 `mcpServers` 选项中直接传递 MCP 服务器：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "List files in my project",
    options: {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
        }
      },
      allowedTools: ["mcp__filesystem__*"]
    }
  })) {
    if (message.type === "result" && message.subtype === "success") {
      console.log(message.result);
    }
  }
  ```

  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage


  async def main():
      options = ClaudeAgentOptions(
          mcp_servers={
              "filesystem": {
                  "command": "npx",
                  "args": [
                      "-y",
                      "@modelcontextprotocol/server-filesystem",
                      "/Users/me/projects",
                  ],
              }
          },
          allowed_tools=["mcp__filesystem__*"],
      )

      async for message in query(prompt="List files in my project", options=options):
          if isinstance(message, ResultMessage) and message.subtype == "success":
              print(message.result)


  asyncio.run(main())
  ```
</CodeGroup>

<h3 id="from-a-config-file">
  从配置文件
</h3>

在项目根目录创建一个 `.mcp.json` 文件。当启用 `project` 设置源时，该文件会被选中，这对默认 `query()` 选项是默认的。如果您显式设置 `settingSources`，请包含 `"project"` 以便加载此文件：

```json theme={null}
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
    }
  }
}
```

<h2 id="allow-mcp-tools">
  允许 MCP 工具
</h2>

MCP 工具需要明确的权限才能让 Claude 使用它们。没有权限，Claude 会看到工具可用，但无法调用它们。

<h3 id="tool-naming-convention">
  工具命名约定
</h3>

MCP 工具遵循命名模式 `mcp__<server-name>__<tool-name>`。例如，名为 `"github"` 的 GitHub 服务器与 `list_issues` 工具变成 `mcp__github__list_issues`。

<h3 id="auto-approve-with-allowedtools">
  使用 allowedTools 自动批准
</h3>

使用 `allowedTools` 自动批准特定的 MCP 工具，以便 Claude 可以在没有权限提示的情况下使用它们：

```typescript hidelines={1,-1} theme={null}
const _ = {
  options: {
    mcpServers: {
      // your servers
    },
    allowedTools: [
      "mcp__github__*", // All tools from the github server
      "mcp__db__query", // Only the query tool from db server
      "mcp__slack__send_message" // Only send_message from slack server
    ]
  }
};
```

通配符 (`*`) 让您允许来自服务器的所有工具，而无需逐个列出每一个。

<Note>
  **对于 MCP 访问，优先使用 `allowedTools` 而不是权限模式。** `permissionMode: "acceptEdits"` 不会自动批准 MCP 工具（仅文件编辑和文件系统 Bash 命令）。`permissionMode: "bypassPermissions"` 确实会自动批准 MCP 工具，但也会禁用大多数其他安全提示，这比必要的范围更广；请参阅 [权限如何被评估](/docs/zh-CN/agent-sdk/permissions#how-permissions-are-evaluated) 了解保留的提示。`allowedTools` 中的通配符仅授予您想要的 MCP 服务器，没有其他。请参阅 [权限模式](/docs/zh-CN/agent-sdk/permissions#permission-modes) 以获得完整比较。
</Note>

<h3 id="discover-available-tools">
  发现可用工具
</h3>

要查看 MCP 服务器提供的工具，请检查服务器的文档或连接到服务器并检查 `system` init 消息：

<CodeGroup>
  ```typescript TypeScript theme={null}
  for await (const message of query({ prompt: "...", options })) {
    if (message.type === "system" && message.subtype === "init") {
      console.log("Available MCP tools:", message.mcp_servers);
    }
  }
  ```

  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, SystemMessage


  async def main():
      async for message in query(prompt="...", options=options):
          if isinstance(message, SystemMessage) and message.subtype == "init":
              print("Available MCP tools:", message.data["mcp_servers"])


  asyncio.run(main())
  ```
</CodeGroup>

<h2 id="transport-types">
  传输类型
</h2>

MCP 服务器使用不同的传输协议与您的代理通信。检查服务器的文档以查看它支持哪种传输：

* 如果文档给您一个**要运行的命令**（如 `npx @modelcontextprotocol/server-github`），请使用 stdio
* 如果文档给您一个 **URL**，请使用 HTTP 或 SSE
* 如果您在代码中构建自己的工具，请使用 SDK MCP 服务器

<h3 id="stdio-servers">
  stdio 服务器
</h3>

通过 stdin/stdout 通信的本地进程。对于在同一台机器上运行的 MCP 服务器，请使用此选项：

<Tabs>
  <Tab title="在代码中">
    <CodeGroup>
      ```typescript TypeScript hidelines={1,-1} theme={null}
      const _ = {
        options: {
          mcpServers: {
            github: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: {
                GITHUB_TOKEN: process.env.GITHUB_TOKEN
              }
            }
          },
          allowedTools: ["mcp__github__list_issues", "mcp__github__search_issues"]
        }
      };
      ```

      ```python Python theme={null}
      options = ClaudeAgentOptions(
          mcp_servers={
              "github": {
                  "command": "npx",
                  "args": ["-y", "@modelcontextprotocol/server-github"],
                  "env": {"GITHUB_TOKEN": os.environ["GITHUB_TOKEN"]},
              }
          },
          allowed_tools=["mcp__github__list_issues", "mcp__github__search_issues"],
      )
      ```
    </CodeGroup>
  </Tab>

  <Tab title=".mcp.json">
    ```json theme={null}
    {
      "mcpServers": {
        "github": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-github"],
          "env": {
            "GITHUB_TOKEN": "${GITHUB_TOKEN}"
          }
        }
      }
    }
    ```
  </Tab>
</Tabs>

<h3 id="http/sse-servers">
  HTTP/SSE 服务器
</h3>

对于云托管的 MCP 服务器和远程 API，请使用 HTTP 或 SSE：

<Tabs>
  <Tab title="在代码中">
    <CodeGroup>
      ```typescript TypeScript hidelines={1,-1} theme={null}
      const _ = {
        options: {
          mcpServers: {
            "remote-api": {
              type: "sse",
              url: "https://api.example.com/mcp/sse",
              headers: {
                Authorization: `Bearer ${process.env.API_TOKEN}`
              }
            }
          },
          allowedTools: ["mcp__remote-api__*"]
        }
      };
      ```

      ```python Python theme={null}
      options = ClaudeAgentOptions(
          mcp_servers={
              "remote-api": {
                  "type": "sse",
                  "url": "https://api.example.com/mcp/sse",
                  "headers": {"Authorization": f"Bearer {os.environ['API_TOKEN']}"},
              }
          },
          allowed_tools=["mcp__remote-api__*"],
      )
      ```
    </CodeGroup>
  </Tab>

  <Tab title=".mcp.json">
    ```json theme={null}
    {
      "mcpServers": {
        "remote-api": {
          "type": "sse",
          "url": "https://api.example.com/mcp/sse",
          "headers": {
            "Authorization": "Bearer ${API_TOKEN}"
          }
        }
      }
    }
    ```
  </Tab>
</Tabs>

对于可流式传输的 HTTP 传输，请改用 `"type": "http"`。在 `.mcp.json` 和其他 JSON 配置文件中，`"streamable-http"` 被接受作为 `"http"` 的别名。编程式 `mcpServers` 选项仅接受 `"http"`。

<h3 id="sdk-mcp-servers">
  SDK MCP 服务器
</h3>

直接在应用程序代码中定义自定义工具，而不是运行单独的服务器进程。有关实现详情，请参阅 [自定义工具指南](/docs/zh-CN/agent-sdk/custom-tools)。

<h2 id="mcp-tool-search">
  MCP 工具搜索
</h2>

当您配置了许多 MCP 工具时，工具定义可能会消耗上下文窗口的很大一部分。工具搜索通过从上下文中隐藏工具定义并仅加载 Claude 每轮需要的工具来解决此问题。

工具搜索默认启用。有关配置选项和详情，请参阅 [工具搜索](/docs/zh-CN/agent-sdk/tool-search)。

有关更多详情，包括最佳实践和将工具搜索与自定义 SDK 工具一起使用，请参阅 [工具搜索指南](/docs/zh-CN/agent-sdk/tool-search)。

<h2 id="authentication">
  身份验证
</h2>

大多数 MCP 服务器需要身份验证才能访问外部服务。通过服务器配置中的环境变量传递凭据。

<h3 id="pass-credentials-via-environment-variables">
  通过环境变量传递凭据
</h3>

使用 `env` 字段将 API 密钥、令牌和其他凭据传递给 MCP 服务器：

<Tabs>
  <Tab title="在代码中">
    <CodeGroup>
      ```typescript TypeScript hidelines={1,-1} theme={null}
      const _ = {
        options: {
          mcpServers: {
            github: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: {
                GITHUB_TOKEN: process.env.GITHUB_TOKEN
              }
            }
          },
          allowedTools: ["mcp__github__list_issues"]
        }
      };
      ```

      ```python Python theme={null}
      options = ClaudeAgentOptions(
          mcp_servers={
              "github": {
                  "command": "npx",
                  "args": ["-y", "@modelcontextprotocol/server-github"],
                  "env": {"GITHUB_TOKEN": os.environ["GITHUB_TOKEN"]},
              }
          },
          allowed_tools=["mcp__github__list_issues"],
      )
      ```
    </CodeGroup>
  </Tab>

  <Tab title=".mcp.json">
    ```json theme={null}
    {
      "mcpServers": {
        "github": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-github"],
          "env": {
            "GITHUB_TOKEN": "${GITHUB_TOKEN}"
          }
        }
      }
    }
    ```

    `${GITHUB_TOKEN}` 语法在运行时展开环境变量。
  </Tab>
</Tabs>

有关带有调试日志的完整工作示例，请参阅 [从存储库列出问题](#list-issues-from-a-repository)。

<h3 id="http-headers-for-remote-servers">
  远程服务器的 HTTP 标头
</h3>

对于 HTTP 和 SSE 服务器，直接在服务器配置中传递身份验证标头：

<Tabs>
  <Tab title="在代码中">
    <CodeGroup>
      ```typescript TypeScript hidelines={1,-1} theme={null}
      const _ = {
        options: {
          mcpServers: {
            "secure-api": {
              type: "http",
              url: "https://api.example.com/mcp",
              headers: {
                Authorization: `Bearer ${process.env.API_TOKEN}`
              }
            }
          },
          allowedTools: ["mcp__secure-api__*"]
        }
      };
      ```

      ```python Python theme={null}
      options = ClaudeAgentOptions(
          mcp_servers={
              "secure-api": {
                  "type": "http",
                  "url": "https://api.example.com/mcp",
                  "headers": {"Authorization": f"Bearer {os.environ['API_TOKEN']}"},
              }
          },
          allowed_tools=["mcp__secure-api__*"],
      )
      ```
    </CodeGroup>
  </Tab>

  <Tab title=".mcp.json">
    ```json theme={null}
    {
      "mcpServers": {
        "secure-api": {
          "type": "http",
          "url": "https://api.example.com/mcp",
          "headers": {
            "Authorization": "Bearer ${API_TOKEN}"
          }
        }
      }
    }
    ```

    `${API_TOKEN}` 语法在运行时展开环境变量。
  </Tab>
</Tabs>

<h3 id="oauth2-authentication">
  OAuth2 身份验证
</h3>

[MCP 规范支持 OAuth 2.1](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) 用于授权。SDK 不会打开浏览器或运行交互式 OAuth 流程。当配置的服务器返回授权质询且没有可用的存储令牌时，代理运行将继续而不使用该服务器的工具，并且该服务器在 [系统初始化消息](/docs/zh-CN/agent-sdk/typescript#sdksystemmessage) 的 `mcp_servers` 数组中报告状态为 `needs-auth`。如果您的代理依赖于特定服务器的连接，请在启动时检查该数组。

要提供凭据，请在您自己的应用程序中完成 OAuth 流程，并在服务器的 `headers` 中传递生成的访问令牌：

<CodeGroup>
  ```typescript TypeScript theme={null}
  // After completing OAuth flow in your app
  const accessToken = await getAccessTokenFromOAuthFlow();

  const options = {
    mcpServers: {
      "oauth-api": {
        type: "http",
        url: "https://api.example.com/mcp",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    },
    allowedTools: ["mcp__oauth-api__*"]
  };
  ```

  ```python Python theme={null}
  # After completing OAuth flow in your app
  access_token = await get_access_token_from_oauth_flow()

  options = ClaudeAgentOptions(
      mcp_servers={
          "oauth-api": {
              "type": "http",
              "url": "https://api.example.com/mcp",
              "headers": {"Authorization": f"Bearer {access_token}"},
          }
      },
      allowed_tools=["mcp__oauth-api__*"],
  )
  ```
</CodeGroup>

<h2 id="examples">
  示例
</h2>

<h3 id="list-issues-from-a-repository">
  从存储库列出问题
</h3>

此示例连接到 [GitHub MCP 服务器](https://github.com/modelcontextprotocol/servers/tree/main/src/github) 以列出最近的问题。该示例包括调试日志以验证 MCP 连接和工具调用。

在运行之前，创建一个具有 `repo` 范围的 [GitHub 个人访问令牌](https://github.com/settings/tokens) 并将其设置为环境变量：

```bash theme={null}
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "List the 3 most recent issues in anthropics/claude-code",
    options: {
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN
          }
        }
      },
      allowedTools: ["mcp__github__list_issues"]
    }
  })) {
    // Verify MCP server connected successfully
    if (message.type === "system" && message.subtype === "init") {
      console.log("MCP servers:", message.mcp_servers);
    }

    // Log when Claude calls an MCP tool
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "tool_use" && block.name.startsWith("mcp__")) {
          console.log("MCP tool called:", block.name);
        }
      }
    }

    // Print the final result
    if (message.type === "result" && message.subtype === "success") {
      console.log(message.result);
    }
  }
  ```

  ```python Python theme={null}
  import asyncio
  import os
  from claude_agent_sdk import (
      query,
      ClaudeAgentOptions,
      ResultMessage,
      SystemMessage,
      AssistantMessage,
  )


  async def main():
      options = ClaudeAgentOptions(
          mcp_servers={
              "github": {
                  "command": "npx",
                  "args": ["-y", "@modelcontextprotocol/server-github"],
                  "env": {"GITHUB_TOKEN": os.environ["GITHUB_TOKEN"]},
              }
          },
          allowed_tools=["mcp__github__list_issues"],
      )

      async for message in query(
          prompt="List the 3 most recent issues in anthropics/claude-code",
          options=options,
      ):
          # Verify MCP server connected successfully
          if isinstance(message, SystemMessage) and message.subtype == "init":
              print("MCP servers:", message.data.get("mcp_servers"))

          # Log when Claude calls an MCP tool
          if isinstance(message, AssistantMessage):
              for block in message.content:
                  if hasattr(block, "name") and block.name.startswith("mcp__"):
                      print("MCP tool called:", block.name)

          # Print the final result
          if isinstance(message, ResultMessage) and message.subtype == "success":
              print(message.result)


  asyncio.run(main())
  ```
</CodeGroup>

<h3 id="query-a-database">
  查询数据库
</h3>

此示例使用 [Postgres MCP 服务器](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres) 查询数据库。连接字符串作为参数传递给服务器。代理自动发现数据库架构、编写 SQL 查询并返回结果：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  // Connection string from environment variable
  const connectionString = process.env.DATABASE_URL;

  for await (const message of query({
    // Natural language query - Claude writes the SQL
    prompt: "How many users signed up last week? Break it down by day.",
    options: {
      mcpServers: {
        postgres: {
          command: "npx",
          // Pass connection string as argument to the server
          args: ["-y", "@modelcontextprotocol/server-postgres", connectionString]
        }
      },
      // Allow only read queries, not writes
      allowedTools: ["mcp__postgres__query"]
    }
  })) {
    if (message.type === "result" && message.subtype === "success") {
      console.log(message.result);
    }
  }
  ```

  ```python Python theme={null}
  import asyncio
  import os
  from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage


  async def main():
      # Connection string from environment variable
      connection_string = os.environ["DATABASE_URL"]

      options = ClaudeAgentOptions(
          mcp_servers={
              "postgres": {
                  "command": "npx",
                  # Pass connection string as argument to the server
                  "args": [
                      "-y",
                      "@modelcontextprotocol/server-postgres",
                      connection_string,
                  ],
              }
          },
          # Allow only read queries, not writes
          allowed_tools=["mcp__postgres__query"],
      )

      # Natural language query - Claude writes the SQL
      async for message in query(
          prompt="How many users signed up last week? Break it down by day.",
          options=options,
      ):
          if isinstance(message, ResultMessage) and message.subtype == "success":
              print(message.result)


  asyncio.run(main())
  ```
</CodeGroup>

<h2 id="error-handling">
  错误处理
</h2>

MCP 服务器可能因各种原因连接失败：服务器进程可能未安装、凭据可能无效，或远程服务器可能无法访问。

SDK 在每个查询开始时发出一个 `system` 消息，子类型为 `init`。此消息包括每个 MCP 服务器的连接状态。检查 `status` 字段以在代理开始工作之前检测连接失败：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Process data",
    options: {
      mcpServers: {
        "data-processor": dataServer
      }
    }
  })) {
    if (message.type === "system" && message.subtype === "init") {
      const failedServers = message.mcp_servers.filter((s) => s.status !== "connected");

      if (failedServers.length > 0) {
        console.warn("Failed to connect:", failedServers);
      }
    }

    if (message.type === "result" && message.subtype === "error_during_execution") {
      console.error("Execution failed");
    }
  }
  ```

  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, SystemMessage, ResultMessage


  async def main():
      options = ClaudeAgentOptions(mcp_servers={"data-processor": data_server})

      async for message in query(prompt="Process data", options=options):
          if isinstance(message, SystemMessage) and message.subtype == "init":
              failed_servers = [
                  s
                  for s in message.data.get("mcp_servers", [])
                  if s.get("status") != "connected"
              ]

              if failed_servers:
                  print(f"Failed to connect: {failed_servers}")

          if (
              isinstance(message, ResultMessage)
              and message.subtype == "error_during_execution"
          ):
              print("Execution failed")


  asyncio.run(main())
  ```
</CodeGroup>

<h2 id="troubleshooting">
  故障排除
</h2>

<h3 id="server-shows-failed-status">
  服务器显示"失败"状态
</h3>

检查 `init` 消息以查看哪些服务器连接失败：

```typescript theme={null}
if (message.type === "system" && message.subtype === "init") {
  for (const server of message.mcp_servers) {
    if (server.status === "failed") {
      console.error(`Server ${server.name} failed to connect`);
    }
  }
}
```

常见原因：

* **缺少环境变量**：确保设置了所需的令牌和凭据。对于 stdio 服务器，检查 `env` 字段是否与服务器期望的匹配。
* **服务器未安装**：对于 `npx` 命令，验证包存在且 Node.js 在您的 PATH 中。
* **无效的连接字符串**：对于数据库服务器，验证连接字符串格式以及数据库是否可访问。
* **网络问题**：对于远程 HTTP/SSE 服务器，检查 URL 是否可达以及任何防火墙是否允许连接。

<h3 id="tools-not-being-called">
  工具未被调用
</h3>

如果 Claude 看到工具但不使用它们，请检查您是否已使用 `allowedTools` 授予权限：

```typescript hidelines={1,-1} theme={null}
const _ = {
  options: {
    mcpServers: {
      // your servers
    },
    allowedTools: ["mcp__servername__*"] // 自动批准来自此服务器的调用
  }
};
```

<h3 id="connection-timeouts">
  连接超时
</h3>

MCP 服务器连接默认超时为 30 秒。如果您的服务器需要更长时间才能启动，连接将失败。使用 [`MCP_TIMEOUT`](/docs/zh-CN/env-vars) 环境变量提高限制，单位为毫秒。对于需要更多启动时间的服务器，还应考虑：

* 使用更轻量级的服务器（如果可用）
* 在启动代理之前预热服务器
* 检查服务器日志以了解缓慢初始化的原因

<h3 id="tool-output-exceeds-maximum-allowed-tokens">
  工具输出超过最大允许令牌数
</h3>

SDK 应用与 Claude Code 相同的 MCP 输出限制。当工具结果大于 25,000 令牌时，完整输出被保存到文件，工具结果被替换为错误消息，该消息命名文件路径，以便代理可以分部分读取输出。使用 [`MAX_MCP_OUTPUT_TOKENS`](/docs/zh-CN/env-vars) 环境变量提高限制。有关完整行为（包括服务器如何声明更高的每工具限制），请参阅 [MCP 输出限制和警告](/docs/zh-CN/mcp#mcp-output-limits-and-warnings)。

<h2 id="related-resources">
  相关资源
</h2>

* **[自定义工具指南](/docs/zh-CN/agent-sdk/custom-tools)**：构建您自己的 MCP 服务器，与您的 SDK 应用程序在进程中运行
* **[权限](/docs/zh-CN/agent-sdk/permissions)**：使用 `allowedTools` 和 `disallowedTools` 控制您的代理可以使用哪些 MCP 工具
* **[MCP 输出限制和警告](/docs/zh-CN/mcp#mcp-output-limits-and-warnings)**：SDK 如何处理超过 `MAX_MCP_OUTPUT_TOKENS` 的工具结果，包括持久化到磁盘的回退和 `anthropic/maxResultSizeChars` 按工具注解
* **[TypeScript SDK 参考](/docs/zh-CN/agent-sdk/typescript)**：完整的 API 参考，包括 MCP 配置选项
* **[Python SDK 参考](/docs/zh-CN/agent-sdk/python)**：完整的 API 参考，包括 MCP 配置选项
* **[MCP 服务器目录](https://github.com/modelcontextprotocol/servers)**：浏览可用的 MCP 服务器，用于数据库、API 等
