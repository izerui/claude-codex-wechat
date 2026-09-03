> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# SDK 中的 Plugins

> 通过 Agent SDK 加载自定义 plugins，以向 agent 会话添加 skills、agents、hooks 和 MCP servers

Plugins 允许你使用可在项目间共享的自定义功能来扩展 Claude Code。通过 Agent SDK，你可以以编程方式从本地目录加载 plugins，以便向 agent 会话添加 skills、agents、hooks 和 MCP servers。

<h2 id="what-are-plugins">
  什么是 plugins？
</h2>

Plugins 是 Claude Code 扩展的包，可以包括：

* **Skills**：Claude 自主使用的模型调用功能（也可以使用 `/skill-name` 调用）
* **Agents**：用于特定任务的专门子 agents
* **Hooks**：响应工具使用和其他事件的事件处理程序
* **MCP servers**：通过 Model Context Protocol 的外部工具集成

<Note>
  `commands/` 目录是旧版格式。对于新 plugins，请使用 `skills/`。Claude Code 继续支持两种格式以实现向后兼容性。
</Note>

有关 plugin 结构和如何创建 plugins 的完整信息，请参阅 [Plugins](/docs/zh-CN/plugins)。

<h2 id="loading-plugins">
  加载 plugins
</h2>

通过在选项配置中提供本地文件系统路径来加载 plugins。`type` 字段必须是 `"local"`，这是 SDK 接受的唯一值。要使用通过 [marketplace](/docs/zh-CN/plugin-marketplaces) 或远程存储库分发的 plugin，请先下载它并提供本地目录路径。SDK 支持从不同位置加载多个 plugins。

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Hello",
    options: {
      plugins: [
        { type: "local", path: "./my-plugin" },
        { type: "local", path: "/absolute/path/to/another-plugin" }
      ]
    }
  })) {
    // Plugin commands, agents, and other features are now available
  }
  ```

  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions


  async def main():
      async for message in query(
          prompt="Hello",
          options=ClaudeAgentOptions(
              plugins=[
                  {"type": "local", "path": "./my-plugin"},
                  {"type": "local", "path": "/absolute/path/to/another-plugin"},
              ]
          ),
      ):
          # Plugin commands, agents, and other features are now available
          pass


  asyncio.run(main())
  ```
</CodeGroup>

<h3 id="path-specifications">
  路径规范
</h3>

Plugin 路径可以是：

* **相对路径**：相对于你的当前工作目录解析（例如，`"./plugins/my-plugin"`）
* **绝对路径**：完整文件系统路径（例如，`"/home/user/plugins/my-plugin"`）

<Note>
  路径应指向 plugin 的根目录：`skills/`、`agents/`、`hooks/`、`commands/`（旧版）或 `.claude-plugin/` 的父目录，而不是子目录。
</Note>

<h2 id="verifying-plugin-installation">
  验证 plugin 安装
</h2>

当 plugins 成功加载时，它们会出现在系统初始化消息中。你可以验证你的 plugins 是否可用：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  for await (const message of query({
    prompt: "Hello",
    options: {
      plugins: [{ type: "local", path: "./my-plugin" }]
    }
  })) {
    if (message.type === "system" && message.subtype === "init") {
      // 检查已加载的 plugins
      console.log("Plugins:", message.plugins);
      // 示例: [{ name: "my-plugin", path: "./my-plugin" }]

      // Plugin skills 出现时带有 plugin 名称作为前缀
      console.log("Skills:", message.skills);
      // 示例: ["my-plugin:greet"]

      // Plugin 命令使用相同的前缀，skills 也会出现在这里
      console.log("Commands:", message.slash_commands);
      // 示例: ["compact", "context", "my-plugin:custom-command", "my-plugin:greet"]
    }
  }
  ```

  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, SystemMessage


  async def main():
      async for message in query(
          prompt="Hello",
          options=ClaudeAgentOptions(
              plugins=[{"type": "local", "path": "./my-plugin"}]
          ),
      ):
          if isinstance(message, SystemMessage) and message.subtype == "init":
              # 检查已加载的 plugins
              print("Plugins:", message.data.get("plugins"))
              # 示例: [{"name": "my-plugin", "path": "./my-plugin"}]

              # Plugin skills 出现时带有 plugin 名称作为前缀
              print("Skills:", message.data.get("skills"))
              # 示例: ["my-plugin:greet"]

              # Plugin 命令使用相同的前缀，skills 也会出现在这里
              print("Commands:", message.data.get("slash_commands"))
              # 示例: ["compact", "context", "my-plugin:custom-command", "my-plugin:greet"]


  asyncio.run(main())
  ```
</CodeGroup>

<h2 id="using-plugin-skills">
  使用 plugin skills
</h2>

来自 plugins 的 skills 会自动使用 plugin 名称进行命名空间划分，以避免冲突。要直接调用一个，请在提示中发送 `/plugin-name:skill-name`。

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  // Load a plugin with a custom /greet skill
  for await (const message of query({
    prompt: "/my-plugin:greet", // Use plugin skill with namespace
    options: {
      plugins: [{ type: "local", path: "./my-plugin" }]
    }
  })) {
    // Claude executes the custom greeting skill from the plugin
    if (message.type === "assistant") {
      console.log(message.message.content);
    }
  }
  ```

  ```python Python theme={null}
  import asyncio
  from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, TextBlock


  async def main():
      # Load a plugin with a custom /greet skill
      async for message in query(
          prompt="/demo-plugin:greet",  # Use plugin skill with namespace
          options=ClaudeAgentOptions(
              plugins=[{"type": "local", "path": "./plugins/demo-plugin"}]
          ),
      ):
          # Claude executes the custom greeting skill from the plugin
          if isinstance(message, AssistantMessage):
              for block in message.content:
                  if isinstance(block, TextBlock):
                      print(f"Claude: {block.text}")


  asyncio.run(main())
  ```
</CodeGroup>

<Note>
  如果你通过 CLI 安装了 plugin（例如，`/plugin install my-plugin@marketplace`），你仍然可以通过提供其安装路径在 SDK 中使用它。检查 `~/.claude/plugins/` 以查找 CLI 安装的 plugins。
</Note>

<h2 id="complete-example">
  完整示例
</h2>

这是一个演示 plugin 加载和使用的完整示例：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";
  import * as path from "path";

  async function runWithPlugin() {
    const pluginPath = path.join(__dirname, "plugins", "my-plugin");

    console.log("Loading plugin from:", pluginPath);

    for await (const message of query({
      prompt: "What custom commands do you have available?",
      options: {
        plugins: [{ type: "local", path: pluginPath }],
        maxTurns: 3
      }
    })) {
      if (message.type === "system" && message.subtype === "init") {
        console.log("Loaded plugins:", message.plugins);
        console.log("Available skills:", message.skills);
        console.log("Available commands:", message.slash_commands);
      }

      if (message.type === "assistant") {
        console.log("Assistant:", message.message.content);
      }
    }
  }

  runWithPlugin().catch(console.error);
  ```

  ```python Python theme={null}
  #!/usr/bin/env python3
  """Example demonstrating how to use plugins with the Agent SDK."""

  from pathlib import Path
  import anyio
  from claude_agent_sdk import (
      AssistantMessage,
      ClaudeAgentOptions,
      SystemMessage,
      TextBlock,
      query,
  )


  async def run_with_plugin():
      """Example using a custom plugin."""
      plugin_path = Path(__file__).parent / "plugins" / "demo-plugin"

      print(f"Loading plugin from: {plugin_path}")

      options = ClaudeAgentOptions(
          plugins=[{"type": "local", "path": str(plugin_path)}],
          max_turns=3,
      )

      async for message in query(
          prompt="What custom commands do you have available?", options=options
      ):
          if isinstance(message, SystemMessage) and message.subtype == "init":
              print(f"Loaded plugins: {message.data.get('plugins')}")
              print(f"Available skills: {message.data.get('skills')}")
              print(f"Available commands: {message.data.get('slash_commands')}")

          if isinstance(message, AssistantMessage):
              for block in message.content:
                  if isinstance(block, TextBlock):
                      print(f"Assistant: {block.text}")


  if __name__ == "__main__":
      anyio.run(run_with_plugin)
  ```
</CodeGroup>

<h2 id="plugin-structure-reference">
  Plugin 结构参考
</h2>

Plugin 目录通常包含一个 `.claude-plugin/plugin.json` 清单文件。清单是可选的。省略时，Claude Code 会从目录布局自动发现组件。该目录可以包括：

```text theme={null}
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin 清单（可选，不需要它也能自动发现组件）
├── skills/                   # Agent Skills（自主调用或通过 /skill-name）
│   └── my-skill/
│       └── SKILL.md
├── commands/                 # 旧版：改用 skills/ 代替
│   └── custom-cmd.md
├── agents/                   # 自定义 agents
│   └── specialist.md
├── hooks/                    # 事件处理程序
│   └── hooks.json
└── .mcp.json                # MCP 服务器定义
```

有关创建 plugins 的详细信息，请参阅：

* [Plugins](/docs/zh-CN/plugins) - 完整的 plugin 开发指南
* [Plugins reference](/docs/zh-CN/plugins-reference) - 技术规范和架构

<h2 id="common-use-cases">
  常见用例
</h2>

<h3 id="development-and-testing">
  开发和测试
</h3>

在开发期间加载 plugins，无需全局安装它们：

```typescript theme={null}
plugins: [{ type: "local", path: "./dev-plugins/my-plugin" }];
```

<h3 id="project-specific-extensions">
  项目特定的扩展
</h3>

在你的项目存储库中包含 plugins，以实现团队范围的一致性：

```typescript theme={null}
plugins: [{ type: "local", path: "./project-plugins/team-workflows" }];
```

<h3 id="multiple-plugin-sources">
  多个 plugin 源
</h3>

组合来自不同位置的 plugins：

```typescript theme={null}
plugins: [
  { type: "local", path: "./local-plugin" },
  { type: "local", path: "~/.claude/custom-plugins/shared-plugin" }
];
```

<h2 id="troubleshooting">
  故障排除
</h2>

<h3 id="plugin-not-loading">
  Plugin 未加载
</h3>

如果你的 plugin 未出现在初始化消息中：

1. **检查路径**：确保路径指向 plugin 根目录，即 `skills/`、`agents/`、`hooks/`、`commands/`（旧版）或 `.claude-plugin/` 的父目录
2. **验证 plugin.json**：如果你的 plugin 包含清单文件，确保它具有有效的 JSON 语法
3. **检查文件权限**：确保 plugin 目录可读

<h3 id="skills-not-appearing">
  Skills 未出现
</h3>

如果 plugin skills 不起作用：

1. **使用命名空间**：调用 plugin skills 时使用 `/plugin-name:skill-name` 格式
2. **检查初始化消息**：验证 skill 是否以正确的命名空间出现在 `skills` 列表中
3. **验证 skill 文件**：确保每个 skill 在 `skills/` 下的自己的子目录中都有一个 `SKILL.md` 文件，例如 `skills/my-skill/SKILL.md`

<h3 id="path-resolution-issues">
  路径解析问题
</h3>

如果相对路径不起作用：

1. **检查工作目录**：相对路径从你的当前工作目录解析
2. **使用绝对路径**：为了可靠性，考虑使用绝对路径
3. **规范化路径**：使用路径实用程序正确构造路径

<h2 id="see-also">
  另请参阅
</h2>

* [Plugins](/docs/zh-CN/plugins) - 完整的 plugin 开发指南
* [Plugins reference](/docs/zh-CN/plugins-reference) - 技术规范
* [Commands](/docs/zh-CN/agent-sdk/slash-commands) - 在 SDK 中使用 slash commands
* [Subagents](/docs/zh-CN/agent-sdk/subagents) - 使用专门的 agents
* [Skills](/docs/zh-CN/agent-sdk/skills) - 使用 Agent Skills
