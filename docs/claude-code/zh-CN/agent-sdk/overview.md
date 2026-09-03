> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Agent SDK 概览

> 使用 Claude Code 作为库构建生产级 AI 代理

构建能够自主读取文件、运行命令、搜索网络、编辑代码等的 AI 代理。Agent SDK 为您提供了与 Claude Code 相同的工具、代理循环和上下文管理，可在 Python 和 TypeScript 中编程。有关代理工具设计背后的思考，请参阅博客上的 [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)。

<CodeGroup>
  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions


  async def main():
      async for message in query(
          prompt="Find and fix the bug in auth.py",
          options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"]),
      ):
          print(message)  # Claude reads the file, finds the bug, edits it


  asyncio.run(main())
  ```

  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Find and fix the bug in auth.ts",
    options: { allowedTools: ["Read", "Edit", "Bash"] }
  })) {
    console.log(message); // Claude reads the file, finds the bug, edits it
  }
  ```
</CodeGroup>

Agent SDK 包含用于读取文件、运行命令和编辑代码的内置工具，因此您的代理可以立即开始工作，无需您实现工具执行。深入了解快速入门或探索使用 SDK 构建的真实代理：

<CardGroup cols={2}>
  <Card title="快速入门" icon="play" href="/docs/zh-CN/agent-sdk/quickstart">
    在几分钟内构建一个 bug 修复代理
  </Card>

  <Card title="示例代理" icon="star" href="https://github.com/anthropics/claude-agent-sdk-demos">
    电子邮件助手、研究代理等
  </Card>
</CardGroup>

<h2 id="get-started">
  开始使用
</h2>

<Steps>
  <Step title="安装 SDK">
    <Tabs>
      <Tab title="TypeScript">
        ```bash theme={null}
        npm install @anthropic-ai/claude-agent-sdk
        ```
      </Tab>

      <Tab title="Python (uv)">
        [uv](https://docs.astral.sh/uv/) 是一个快速的 Python 包管理器，可以自动处理虚拟环境：

        ```bash theme={null}
        uv init
        uv add claude-agent-sdk
        ```
      </Tab>

      <Tab title="Python (pip)">
        创建并激活虚拟环境，然后安装该包。安装到虚拟环境中可以避免 `error: externally-managed-environment` 失败，该失败是最近的 Debian、Ubuntu 和 Homebrew 安装上的系统 Python 在 venv 外运行 `pip install` 时返回的。

        在 macOS 或 Linux 上：

        ```bash theme={null}
        python3 -m venv .venv
        source .venv/bin/activate
        pip install claude-agent-sdk
        ```

        在 Windows 上：

        ```powershell theme={null}
        py -m venv .venv
        .venv\Scripts\Activate.ps1
        pip install claude-agent-sdk
        ```

        如果 PowerShell 因执行策略错误而阻止 `Activate.ps1`，请先运行 `Set-ExecutionPolicy -Scope Process RemoteSigned`。

        Python 包需要 Python 3.10 或更高版本。如果 pip 报告 `No matching distribution found for claude-agent-sdk`，说明您的解释器版本早于 3.10。在 macOS 或 Linux 上运行 `python3 --version`，或在 Windows 上运行 `py --version`，以检查版本。
      </Tab>
    </Tabs>

    <Note>
      TypeScript SDK 为您的平台捆绑了一个本地 Claude Code 二进制文件作为可选依赖项，因此您无需单独安装 Claude Code。
    </Note>
  </Step>

  <Step title="设置您的 API 密钥">
    从[控制台](https://platform.claude.com/)获取 API 密钥，然后将其设置为环境变量。

    在 macOS 或 Linux 上：

    ```bash theme={null}
    export ANTHROPIC_API_KEY=sk-ant-xxxxx
    ```

    在 Windows PowerShell 上：

    ```powershell theme={null}
    $env:ANTHROPIC_API_KEY = "sk-ant-xxxxx"
    ```

    SDK 还支持通过第三方 API 提供商进行身份验证：

    * **Amazon Bedrock**：设置 `CLAUDE_CODE_USE_BEDROCK=1` 环境变量并配置 AWS 凭证
    * **Claude Platform on AWS**：设置 `CLAUDE_CODE_USE_ANTHROPIC_AWS=1` 和 `ANTHROPIC_AWS_WORKSPACE_ID`，然后配置 AWS 凭证
    * **Google Cloud 的 Agent Platform**：设置 `CLAUDE_CODE_USE_VERTEX=1` 环境变量并配置 Google Cloud 凭证
    * **Microsoft Azure**：设置 `CLAUDE_CODE_USE_FOUNDRY=1` 环境变量并配置 Azure 凭证

    有关详细信息，请参阅 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Claude Platform on AWS](/docs/zh-CN/claude-platform-on-aws)、[Google Cloud 的 Agent Platform](/docs/zh-CN/google-vertex-ai) 或 [Microsoft Foundry](/docs/zh-CN/microsoft-foundry) 的设置指南。

    <Note>
      除非事先获得批准，否则 Anthropic 不允许第三方开发人员为其产品（包括基于 Claude Agent SDK 构建的代理）提供 claude.ai 登录或速率限制。请改用本文档中描述的 API 密钥身份验证方法。
    </Note>
  </Step>

  <Step title="运行您的第一个代理">
    此示例创建一个代理，该代理使用内置工具列出当前目录中的文件。

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from claude_agent_sdk import query, ClaudeAgentOptions


      async def main():
          async for message in query(
              prompt="What files are in this directory?",
              options=ClaudeAgentOptions(allowed_tools=["Bash", "Glob"]),
          ):
              if hasattr(message, "result"):
                  print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query } from "@anthropic-ai/claude-agent-sdk";

      for await (const message of query({
        prompt: "What files are in this directory?",
        options: { allowedTools: ["Bash", "Glob"] }
      })) {
        if ("result" in message) console.log(message.result);
      }
      ```
    </CodeGroup>
  </Step>
</Steps>

**准备好构建了吗？** 按照[快速入门](/docs/zh-CN/agent-sdk/quickstart)在几分钟内创建一个查找和修复 bug 的代理。

<h2 id="capabilities">
  功能
</h2>

使 Claude Code 强大的一切都可在 SDK 中使用：

<Tabs>
  <Tab title="内置工具">
    您的代理可以开箱即用地读取文件、运行命令和搜索代码库。关键工具包括：

    | 工具                                                                             | 功能                               |
    | ------------------------------------------------------------------------------ | -------------------------------- |
    | **Read**                                                                       | 读取工作目录中的任何文件                     |
    | **Write**                                                                      | 创建新文件                            |
    | **Edit**                                                                       | 对现有文件进行精确编辑                      |
    | **Bash**                                                                       | 运行终端命令、脚本、git 操作                 |
    | **Monitor**                                                                    | 监视后台脚本并对每个输出行作为事件做出反应            |
    | **Glob**                                                                       | 按模式查找文件（`**/*.ts`、`src/**/*.py`） |
    | **Grep**                                                                       | 使用正则表达式搜索文件内容                    |
    | **WebSearch**                                                                  | 搜索网络以获取当前信息                      |
    | **WebFetch**                                                                   | 获取并解析网页内容                        |
    | **[AskUserQuestion](/docs/zh-CN/agent-sdk/user-input#handle-clarifying-questions)** | 向用户提出带有多选选项的澄清问题                 |

    此示例创建一个代理，该代理在您的代码库中搜索 TODO 注释：

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from claude_agent_sdk import query, ClaudeAgentOptions


      async def main():
          async for message in query(
              prompt="Find all TODO comments and create a summary",
              options=ClaudeAgentOptions(allowed_tools=["Read", "Glob", "Grep"]),
          ):
              if hasattr(message, "result"):
                  print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query } from "@anthropic-ai/claude-agent-sdk";

      for await (const message of query({
        prompt: "Find all TODO comments and create a summary",
        options: { allowedTools: ["Read", "Glob", "Grep"] }
      })) {
        if ("result" in message) console.log(message.result);
      }
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Hooks">
    在代理生命周期的关键点运行自定义代码。SDK hooks 使用回调函数来验证、记录、阻止或转换代理行为。

    **可用 hooks：** `PreToolUse`、`PostToolUse`、`Stop`、`SessionStart`、`SessionEnd`、`UserPromptSubmit` 等。

    此示例将所有文件更改记录到审计文件：

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from datetime import datetime
      from claude_agent_sdk import query, ClaudeAgentOptions, HookMatcher


      async def log_file_change(input_data, tool_use_id, context):
          file_path = input_data.get("tool_input", {}).get("file_path", "unknown")
          with open("./audit.log", "a") as f:
              f.write(f"{datetime.now()}: modified {file_path}\n")
          return {}


      async def main():
          async for message in query(
              prompt="Refactor utils.py to improve readability",
              options=ClaudeAgentOptions(
                  permission_mode="acceptEdits",
                  hooks={
                      "PostToolUse": [
                          HookMatcher(matcher="Edit|Write", hooks=[log_file_change])
                      ]
                  },
              ),
          ):
              if hasattr(message, "result"):
                  print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";
      import { appendFile } from "fs/promises";

      const logFileChange: HookCallback = async (input) => {
        const filePath = (input as any).tool_input?.file_path ?? "unknown";
        await appendFile("./audit.log", `${new Date().toISOString()}: modified ${filePath}\n`);
        return {};
      };

      for await (const message of query({
        prompt: "Refactor utils.py to improve readability",
        options: {
          permissionMode: "acceptEdits",
          hooks: {
            PostToolUse: [{ matcher: "Edit|Write", hooks: [logFileChange] }]
          }
        }
      })) {
        if ("result" in message) console.log(message.result);
      }
      ```
    </CodeGroup>

    [了解更多关于 hooks →](/docs/zh-CN/agent-sdk/hooks)
  </Tab>

  <Tab title="子代理">
    生成专门的代理来处理专注的子任务。您的主代理委派工作，子代理报告结果。

    定义具有专门说明的自定义代理。子代理通过 Agent 工具调用，因此在 `allowedTools` 中包含 `Agent` 以自动批准这些调用：

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition


      async def main():
          async for message in query(
              prompt="Use the code-reviewer agent to review this codebase",
              options=ClaudeAgentOptions(
                  allowed_tools=["Read", "Glob", "Grep", "Agent"],
                  agents={
                      "code-reviewer": AgentDefinition(
                          description="Expert code reviewer for quality and security reviews.",
                          prompt="Analyze code quality and suggest improvements.",
                          tools=["Read", "Glob", "Grep"],
                      )
                  },
              ),
          ):
              if hasattr(message, "result"):
                  print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query } from "@anthropic-ai/claude-agent-sdk";

      for await (const message of query({
        prompt: "Use the code-reviewer agent to review this codebase",
        options: {
          allowedTools: ["Read", "Glob", "Grep", "Agent"],
          agents: {
            "code-reviewer": {
              description: "Expert code reviewer for quality and security reviews.",
              prompt: "Analyze code quality and suggest improvements.",
              tools: ["Read", "Glob", "Grep"]
            }
          }
        }
      })) {
        if ("result" in message) console.log(message.result);
      }
      ```
    </CodeGroup>

    来自子代理上下文内的消息包含 `parent_tool_use_id` 字段，让您可以跟踪哪些消息属于哪个子代理执行。

    [了解更多关于子代理 →](/docs/zh-CN/agent-sdk/subagents)
  </Tab>

  <Tab title="MCP">
    通过 Model Context Protocol 连接到外部系统：数据库、浏览器、API 和[数百个更多](https://github.com/modelcontextprotocol/servers)。

    此示例连接 [Playwright MCP 服务器](https://github.com/microsoft/playwright-mcp)以为您的代理提供浏览器自动化功能：

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from claude_agent_sdk import query, ClaudeAgentOptions


      async def main():
          async for message in query(
              prompt="Open example.com and describe what you see",
              options=ClaudeAgentOptions(
                  mcp_servers={
                      "playwright": {"command": "npx", "args": ["@playwright/mcp@latest"]}
                  }
              ),
          ):
              if hasattr(message, "result"):
                  print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query } from "@anthropic-ai/claude-agent-sdk";

      for await (const message of query({
        prompt: "Open example.com and describe what you see",
        options: {
          mcpServers: {
            playwright: { command: "npx", args: ["@playwright/mcp@latest"] }
          }
        }
      })) {
        if ("result" in message) console.log(message.result);
      }
      ```
    </CodeGroup>

    [了解更多关于 MCP →](/docs/zh-CN/agent-sdk/mcp)
  </Tab>

  <Tab title="权限">
    精确控制您的代理可以使用哪些工具。允许安全操作、阻止危险操作或要求对敏感操作进行批准。

    <Note>
      对于交互式批准提示和 `AskUserQuestion` 工具，请参阅[处理批准和用户输入](/docs/zh-CN/agent-sdk/user-input)。
    </Note>

    此示例创建一个只读代理，可以分析但不能修改代码。`allowed_tools` 预先批准 `Read`、`Glob` 和 `Grep`。

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from claude_agent_sdk import query, ClaudeAgentOptions


      async def main():
          async for message in query(
              prompt="Review this code for best practices",
              options=ClaudeAgentOptions(
                  allowed_tools=["Read", "Glob", "Grep"],
              ),
          ):
              if hasattr(message, "result"):
                  print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query } from "@anthropic-ai/claude-agent-sdk";

      for await (const message of query({
        prompt: "Review this code for best practices",
        options: {
          allowedTools: ["Read", "Glob", "Grep"]
        }
      })) {
        if ("result" in message) console.log(message.result);
      }
      ```
    </CodeGroup>

    [了解更多关于权限 →](/docs/zh-CN/agent-sdk/permissions)
  </Tab>

  <Tab title="会话">
    在多次交换中保持上下文。Claude 记住读取的文件、完成的分析和对话历史。稍后恢复会话，或分叉它们以探索不同的方法。

    此示例从第一个查询中捕获会话 ID，然后恢复以继续完整上下文：

    <CodeGroup>
      ```python Python theme={null}
      import asyncio
      from claude_agent_sdk import query, ClaudeAgentOptions, SystemMessage, ResultMessage


      async def main():
          session_id = None

          # First query: capture the session ID
          async for message in query(
              prompt="Read the authentication module",
              options=ClaudeAgentOptions(allowed_tools=["Read", "Glob"]),
          ):
              if isinstance(message, SystemMessage) and message.subtype == "init":
                  session_id = message.data["session_id"]

          # Resume with full context from the first query
          async for message in query(
              prompt="Now find all places that call it",  # "it" = auth module
              options=ClaudeAgentOptions(resume=session_id),
          ):
              if isinstance(message, ResultMessage):
                  print(message.result)


      asyncio.run(main())
      ```

      ```typescript TypeScript theme={null}
      import { query } from "@anthropic-ai/claude-agent-sdk";

      let sessionId: string | undefined;

      // First query: capture the session ID
      for await (const message of query({
        prompt: "Read the authentication module",
        options: { allowedTools: ["Read", "Glob"] }
      })) {
        if (message.type === "system" && message.subtype === "init") {
          sessionId = message.session_id;
        }
      }

      // Resume with full context from the first query
      for await (const message of query({
        prompt: "Now find all places that call it", // "it" = auth module
        options: { resume: sessionId }
      })) {
        if ("result" in message) console.log(message.result);
      }
      ```
    </CodeGroup>

    [了解更多关于会话 →](/docs/zh-CN/agent-sdk/sessions)
  </Tab>
</Tabs>

<h3 id="claude-code-features">
  Claude Code 功能
</h3>

SDK 还支持 Claude Code 的基于文件系统的配置。使用默认选项，SDK 从您的工作目录中的 `.claude/` 和 `~/.claude/` 加载这些。要限制加载哪些源，请在您的选项中设置 `setting_sources`（Python）或 `settingSources`（TypeScript）。

| 功能                                                  | 描述                              | 位置                                |
| --------------------------------------------------- | ------------------------------- | --------------------------------- |
| [Skills](/docs/zh-CN/agent-sdk/skills)                   | Claude 自动使用或您使用 `/name` 调用的专门功能 | `.claude/skills/*/SKILL.md`       |
| [Commands](/docs/zh-CN/agent-sdk/slash-commands)         | 旧格式的自定义命令。为新的自定义命令使用 skills     | `.claude/commands/*.md`           |
| [Memory](/docs/zh-CN/agent-sdk/modifying-system-prompts) | 项目上下文和说明                        | `CLAUDE.md` 或 `.claude/CLAUDE.md` |
| [Plugins](/docs/zh-CN/agent-sdk/plugins)                 | 使用 skills、代理、hooks 和 MCP 服务器扩展  | 通过 `plugins` 选项编程                 |

<h2 id="compare-the-agent-sdk-to-other-claude-tools">
  将 Agent SDK 与其他 Claude 工具进行比较
</h2>

Claude 平台提供了多种使用 Claude 构建的方式。以下是 Agent SDK 的适用场景：

<Tabs>
  <Tab title="Agent SDK vs Client SDK">
    [Anthropic Client SDK](https://platform.claude.com/docs/zh-CN/api/client-sdks) 为您提供直接 API 访问：您发送提示并自己实现工具执行。**Agent SDK** 为您提供具有内置工具执行的 Claude。

    使用 Client SDK，您实现工具循环。使用 Agent SDK，Claude 处理它：

    <CodeGroup>
      ```python Python theme={null}
      # Client SDK: You implement the tool loop
      response = client.messages.create(...)
      while response.stop_reason == "tool_use":
          result = your_tool_executor(response.tool_use)
          response = client.messages.create(tool_result=result, **params)

      # Agent SDK: Claude handles tools autonomously
      async for message in query(prompt="Fix the bug in auth.py"):
          print(message)
      ```

      ```typescript TypeScript theme={null}
      // Client SDK: You implement the tool loop
      let response = await client.messages.create({ ...params });
      while (response.stop_reason === "tool_use") {
        const result = yourToolExecutor(response.tool_use);
        response = await client.messages.create({ tool_result: result, ...params });
      }

      // Agent SDK: Claude handles tools autonomously
      for await (const message of query({ prompt: "Fix the bug in auth.ts" })) {
        console.log(message);
      }
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Agent SDK vs Claude Code CLI">
    相同的功能，不同的界面：

    | 用例       | 最佳选择 |
    | -------- | ---- |
    | 交互式开发    | CLI  |
    | CI/CD 管道 | SDK  |
    | 自定义应用程序  | SDK  |
    | 一次性任务    | CLI  |
    | 生产自动化    | SDK  |

    许多团队同时使用两者：CLI 用于日常开发，SDK 用于生产。工作流在它们之间直接转换。
  </Tab>

  <Tab title="Agent SDK vs Managed Agents">
    [Managed Agents](https://platform.claude.com/docs/zh-CN/managed-agents/overview) 是一个托管的 REST API：Anthropic 运行代理和沙箱，您的应用程序发送事件并流回结果。**Agent SDK** 是一个在您自己的进程内运行代理循环的库。

    |           | Agent SDK                  | Managed Agents               |
    | --------- | -------------------------- | ---------------------------- |
    | **运行位置**  | 您的进程，您的基础设施                | Anthropic 管理的基础设施            |
    | **界面**    | Python 或 TypeScript 库      | REST API                     |
    | **代理工作于** | 您的基础设施上的文件                 | 每个会话的托管沙箱                    |
    | **会话状态**  | 您的文件系统上的 JSONL             | Anthropic 托管的事件日志            |
    | **自定义工具** | 进程内 Python 或 TypeScript 函数 | Claude 触发工具；您执行并返回结果         |
    | **最适合**   | 本地原型设计，直接在您的文件系统和服务上工作的代理  | 生产代理，无需操作沙箱或会话基础设施，长期运行和异步会话 |

    一个常见的路径是先使用 Agent SDK 在本地进行原型设计，然后为生产环境迁移到 Managed Agents。
  </Tab>
</Tabs>

<h2 id="changelog">
  更新日志
</h2>

查看完整的更新日志以了解 SDK 更新、bug 修复和新功能：

* **TypeScript SDK**：[查看 CHANGELOG.md](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md)
* **Python SDK**：[查看 CHANGELOG.md](https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md)

<h2 id="reporting-bugs">
  报告 bug
</h2>

如果您在 Agent SDK 中遇到 bug 或问题：

* **TypeScript SDK**：[在 GitHub 上报告问题](https://github.com/anthropics/claude-agent-sdk-typescript/issues)
* **Python SDK**：[在 GitHub 上报告问题](https://github.com/anthropics/claude-agent-sdk-python/issues)

<h2 id="branding-guidelines">
  品牌指南
</h2>

对于集成 Claude Agent SDK 的合作伙伴，使用 Claude 品牌是可选的。在您的产品中引用 Claude 时：

**允许：**

* "Claude Agent"（首选用于下拉菜单）
* "Claude"（当已在标记为"Agents"的菜单中时）
* "{YourAgentName} Powered by Claude"（如果您有现有的代理名称）

**不允许：**

* "Claude Code" 或 "Claude Code Agent"
* Claude Code 品牌的 ASCII 艺术或模仿 Claude Code 的视觉元素

您的产品应保持自己的品牌，不应显示为 Claude Code 或任何 Anthropic 产品。如有关于品牌合规性的问题，请联系 Anthropic [销售团队](https://www.anthropic.com/contact-sales)。

<h2 id="license-and-terms">
  许可证和条款
</h2>

Claude Agent SDK 的使用受 [Anthropic 商业服务条款](https://www.anthropic.com/legal/commercial-terms)管制，包括当您使用它为您自己的客户和最终用户提供的产品和服务时，除非特定组件或依赖项由该组件的 LICENSE 文件中指示的不同许可证覆盖。

<h2 id="next-steps">
  后续步骤
</h2>

<CardGroup cols={2}>
  <Card title="快速入门" icon="play" href="/docs/zh-CN/agent-sdk/quickstart">
    构建一个在几分钟内查找和修复 bug 的代理
  </Card>

  <Card title="示例代理" icon="star" href="https://github.com/anthropics/claude-agent-sdk-demos">
    电子邮件助手、研究代理等
  </Card>

  <Card title="TypeScript SDK" icon="code" href="/docs/zh-CN/agent-sdk/typescript">
    完整的 TypeScript API 参考和示例
  </Card>

  <Card title="Python SDK" icon="code" href="/docs/zh-CN/agent-sdk/python">
    完整的 Python API 参考和示例
  </Card>
</CardGroup>
