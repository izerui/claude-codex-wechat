> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 快速开始

> 欢迎使用 Claude Code！

本快速开始指南将在几分钟内让您使用 AI 驱动的编码辅助。完成本指南后，您将了解如何使用 Claude Code 完成常见的开发任务。

<Note>
  默认配置下，Claude Code 需要能够访问 claude.ai 和 Anthropic API 等端点才能完成安装、登录和正常使用。在中国大陆的网络环境中，这些端点可能无法直接访问。开始前，请先确认所在网络能够连通这些服务。企业代理配置以及 Amazon Bedrock 等第三方提供商的网络要求，请参阅[网络配置](/docs/zh-CN/network-config#network-access-requirements)。
</Note>

<h2 id="before-you-begin">
  开始前
</h2>

确保您拥有：

* 打开的终端或命令提示符
  * 如果您之前从未使用过终端，请查看[终端指南](/docs/zh-CN/terminal-guide)
* 一个可以使用的代码项目
* 一个 [Claude 订阅](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=quickstart_prereq)（Pro、Max、Team 或 Enterprise）、[Claude Console](https://console.anthropic.com/) 账户，或通过[支持的云提供商](/docs/zh-CN/third-party-integrations)的访问权限

<Note>
  本指南涵盖终端 CLI。Claude Code 也可在[网页](https://claude.ai/code)、[桌面应用](/docs/zh-CN/desktop)、[VS Code](/docs/zh-CN/vs-code) 和 [JetBrains IDE](/docs/zh-CN/jetbrains)、[Slack](/docs/zh-CN/slack) 中使用，以及通过 [GitHub Actions](/docs/zh-CN/github-actions) 和 [GitLab](/docs/zh-CN/gitlab-ci-cd) 进行 CI/CD。查看[所有界面](/docs/zh-CN/overview#use-claude-code-everywhere)。
</Note>

<h2 id="step-1-install-claude-code">
  步骤 1：安装 Claude Code
</h2>

To install Claude Code, use one of the following methods:

<Tabs>
  <Tab title="Native Install (Recommended)">
    **macOS, Linux, WSL:**

    ```bash theme={null}
    curl -fsSL https://claude.ai/install.sh | bash
    ```

    **Windows PowerShell:**

    ```powershell theme={null}
    irm https://claude.ai/install.ps1 | iex
    ```

    **Windows CMD:**

    ```batch theme={null}
    curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
    ```

    If you see `The token '&&' is not a valid statement separator`, you're in PowerShell, not CMD. If you see `'irm' is not recognized as an internal or external command`, you're in CMD, not PowerShell. Your prompt shows `PS C:\` when you're in PowerShell and `C:\` without the `PS` when you're in CMD.

    If the install command fails with `syntax error near unexpected token '<'`, a `403`, or another curl error, see [Troubleshoot installation](/docs/en/troubleshoot-install#find-your-error) to match the error to a fix and for alternative install methods.

    [Git for Windows](https://git-scm.com/downloads/win) is recommended on native Windows so Claude Code can use the Bash tool. If Git for Windows is not installed, Claude Code uses PowerShell as the shell tool instead. WSL setups do not need Git for Windows.

    <Info>
      Native installations automatically update in the background to keep you on the latest version.
    </Info>
  </Tab>

  <Tab title="Homebrew">
    ```bash theme={null}
    brew install --cask claude-code
    ```

    Homebrew offers two casks. `claude-code` tracks the stable release channel, which is typically about a week behind and skips releases with major regressions. `claude-code@latest` tracks the latest channel and receives new versions as soon as they ship.

    <Info>
      Homebrew installations do not auto-update. Run `brew upgrade claude-code` or `brew upgrade claude-code@latest`, depending on which cask you installed, to get the latest features and security fixes.
    </Info>
  </Tab>

  <Tab title="WinGet">
    ```powershell theme={null}
    winget install Anthropic.ClaudeCode
    ```

    <Info>
      WinGet installations do not auto-update. Run `winget upgrade Anthropic.ClaudeCode` periodically to get the latest features and security fixes.
    </Info>
  </Tab>
</Tabs>

You can also install with [apt, dnf, or apk](/docs/en/setup#install-with-linux-package-managers) on Debian, Fedora, RHEL, and Alpine.

<h2 id="step-2-log-in-to-your-account">
  步骤 2：登录您的账户
</h2>

Claude Code 需要账户才能使用。使用 `claude` 命令启动交互式会话，首次使用时系统会提示您登录：

```bash theme={null}
claude
```

对于 Claude 订阅或 Console 账户，请按照提示在浏览器中完成身份验证。要稍后切换账户或重新身份验证，请在运行的会话中输入 `/login`：

```text theme={null}
/login
```

您可以使用以下任何账户类型登录：

* [Claude Pro、Max、Team 或 Enterprise](https://claude.com/pricing?utm_source=claude_code\&utm_medium=docs\&utm_content=quickstart_login)（推荐）
* [Claude Console](https://console.anthropic.com/)（具有预付费额度的 API 访问）。首次登录时，Console 中会自动为集中成本跟踪创建一个"Claude Code"工作区。
* [Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry](/docs/zh-CN/third-party-integrations)（企业云提供商）
* 自托管的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway)（如果您的组织运行一个）：您的管理员会预先配置网关 URL，`/login` 会直接在 **Cloud gateway** 屏幕上打开，供您使用企业 SSO 登录

登录后，您的凭证将被存储，您无需再次登录。

<h2 id="step-3-start-your-first-session">
  步骤 3：启动您的第一个会话
</h2>

在任何项目目录中打开您的终端并启动 Claude Code：

```bash theme={null}
cd /path/to/your/project
claude
```

您将看到 Claude Code 提示符，其中显示版本、当前模型和上方显示的工作目录。输入 `/help` 查看可用命令，或输入 `/resume` 继续之前的对话。

<Tip>
  登录后（步骤 2），您的凭证将存储在您的系统上。在[凭证管理](/docs/zh-CN/authentication#credential-management)中了解更多信息。
</Tip>

<h2 id="step-4-ask-your-first-question">
  步骤 4：提出您的第一个问题
</h2>

让我们从理解您的代码库开始。尝试以下命令之一：

```text theme={null}
what does this project do?
```

Claude 将分析您的文件并提供摘要。您也可以提出更具体的问题：

```text theme={null}
what technologies does this project use?
```

```text theme={null}
where is the main entry point?
```

```text theme={null}
explain the folder structure
```

您也可以询问 Claude 关于其自身功能的问题：

```text theme={null}
what can Claude Code do?
```

```text theme={null}
how do I create custom skills in Claude Code?
```

```text theme={null}
can Claude Code work with Docker?
```

<Note>
  Claude Code 根据需要读取您的项目文件。您不必手动添加上下文。
</Note>

<h2 id="step-5-make-your-first-code-change">
  步骤 5：进行您的第一次代码更改
</h2>

现在让我们让 Claude Code 进行一些实际的编码。尝试一个简单的任务：

```text theme={null}
在主文件中添加一个 hello world 函数
```

Claude Code 将：

1. 找到适当的文件
2. 向您显示建议的更改
3. 请求您的批准
4. 进行编辑

<Note>
  Claude Code 在修改文件前始终请求许可。您可以批准单个更改或为会话启用"全部接受"模式。
</Note>

<h2 id="step-6-use-git-with-claude-code">
  步骤 6：在 Claude Code 中使用 Git
</h2>

Claude Code 使 Git 操作变得对话式：

```text theme={null}
我更改了哪些文件？
```

```text theme={null}
用描述性消息提交我的更改
```

您也可以提示更复杂的 Git 操作：

```text theme={null}
创建一个名为 feature/quickstart 的新分支
```

```text theme={null}
显示我最后的 5 次提交
```

```text theme={null}
帮我解决合并冲突
```

<h2 id="step-7-fix-a-bug-or-add-a-feature">
  步骤 7：修复错误或添加功能
</h2>

Claude 擅长调试和功能实现。

用自然语言描述您想要的内容：

```text theme={null}
向用户注册表单添加输入验证
```

或修复现有问题：

```text theme={null}
有一个错误，用户可以提交空表单 - 修复它
```

Claude Code 将：

* 定位相关代码
* 理解上下文
* 实现解决方案
* 如果可用，运行测试

<h2 id="step-8-test-out-other-common-workflows">
  步骤 8：尝试其他常见工作流
</h2>

有多种方式可以与 Claude 一起工作：

**重构代码**

```text theme={null}
refactor the authentication module to use async/await instead of callbacks
```

**编写测试**

```text theme={null}
write unit tests for the calculator functions
```

**更新文档**

```text theme={null}
update the README with installation instructions
```

**代码审查**

```text theme={null}
review my changes and suggest improvements
```

<Tip>
  像与有帮助的同事交谈一样与 Claude 交谈。描述您想要实现的目标，它将帮助您实现。
</Tip>

<h2 id="essential-commands">
  基本命令
</h2>

以下是日常使用中最重要的命令。Shell 命令从您的终端运行以启动或恢复 Claude Code。会话命令在 Claude Code 启动后在其内部运行。

**Shell 命令**

| 命令                  | 功能            | 示例                                  |
| ------------------- | ------------- | ----------------------------------- |
| `claude`            | 启动交互模式        | `claude`                            |
| `claude "task"`     | 运行一次性任务       | `claude "fix the build error"`      |
| `claude -p "query"` | 运行一次性查询，然后退出  | `claude -p "explain this function"` |
| `claude -c`         | 在当前目录中继续最近的对话 | `claude -c`                         |
| `claude -r`         | 恢复之前的对话       | `claude -r`                         |

**会话命令**

| 命令               | 功能             | 示例       |
| ---------------- | -------------- | -------- |
| `/clear`         | 清除对话历史         | `/clear` |
| `/help`          | 显示可用命令         | `/help`  |
| `/exit` 或 Ctrl+D | 退出 Claude Code | `/exit`  |

有关完整的 shell 命令列表，请参阅 [CLI 参考](/docs/zh-CN/cli-reference)，有关完整的会话命令列表，请参阅 [命令参考](/docs/zh-CN/commands)。

<h2 id="pro-tips-for-beginners">
  初学者专业提示
</h2>

有关更多信息，请参阅[最佳实践](/docs/zh-CN/best-practices)和[常见工作流](/docs/zh-CN/common-workflows)。

<AccordionGroup>
  <Accordion title="对您的请求要具体">
    不要说："修复错误"

    尝试："修复登录错误，用户输入错误凭证后看到空白屏幕"
  </Accordion>

  <Accordion title="使用分步说明">
    将复杂任务分解为步骤：

    ```text theme={null}
    1. 为用户配置文件创建新的数据库表
    2. 创建 API 端点以获取和更新用户配置文件
    3. 构建允许用户查看和编辑其信息的网页
    ```
  </Accordion>

  <Accordion title="让 Claude 先探索">
    在进行更改之前，让 Claude 理解您的代码：

    ```text theme={null}
    分析数据库架构
    ```

    ```text theme={null}
    构建一个仪表板，显示英国客户最常退货的产品
    ```
  </Accordion>

  <Accordion title="使用快捷方式节省时间">
    * 输入 `/` 查看所有命令和 skills
    * 使用 Tab 进行命令补全
    * 按 ↑ 查看命令历史
    * 按 `Shift+Tab` 循环切换权限模式
  </Accordion>
</AccordionGroup>

<h2 id="what’s-next">
  接下来呢？
</h2>

现在您已经学习了基础知识，探索更多高级功能：

<CardGroup cols={2}>
  <Card title="Claude Code 如何工作" icon="microchip" href="/docs/zh-CN/how-claude-code-works">
    了解代理循环、内置工具以及 Claude Code 如何与您的项目交互
  </Card>

  <Card title="最佳实践" icon="star" href="/docs/zh-CN/best-practices">
    通过有效的提示和项目设置获得更好的结果
  </Card>

  <Card title="常见工作流" icon="graduation-cap" href="/docs/zh-CN/common-workflows">
    常见任务的分步指南
  </Card>

  <Card title="扩展 Claude Code" icon="puzzle-piece" href="/docs/zh-CN/features-overview">
    使用 CLAUDE.md、skills、hooks、MCP 等进行自定义
  </Card>
</CardGroup>

<h2 id="getting-help">
  获取帮助
</h2>

* **在 Claude Code 中**：输入 `/help` 或询问"我如何..."
* **文档**：您在这里！浏览其他指南
* **社区**：加入我们的 [Discord](https://www.anthropic.com/discord) 获取提示和支持
