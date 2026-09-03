> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 选择权限模式

> 控制 Claude 在编辑文件或运行命令前是否需要征求您的同意。在 CLI 中使用 Shift+Tab 循环切换模式，或在 VS Code、Desktop 和 claude.ai 中使用模式选择器。

当 Claude 想要编辑文件、运行 shell 命令或发起网络请求时，它会暂停并要求您批准该操作。权限模式控制暂停发生的频率。您选择的模式决定了会话的流程：Manual 模式让您逐个审查每个操作，而更宽松的模式让 Claude 能够进行更长时间的不间断工作，并在完成后报告结果。对于敏感工作选择更多的监督，或在您信任工作方向时选择更少的中断。

<h2 id="available-modes">
  可用模式
</h2>

每种模式在便利性和监督之间做出不同的权衡。下表显示了在每种模式下 Claude 无需权限提示即可执行的操作。

| 模式                                                                  | 无需询问即可运行                                      | 最适合        |
| :------------------------------------------------------------------ | :-------------------------------------------- | :--------- |
| `default`                                                           | 仅读取                                           | 入门、敏感工作    |
| [`acceptEdits`](#auto-approve-file-edits-with-acceptedits-mode)     | 读取、文件编辑和常见文件系统命令（`mkdir`、`touch`、`mv`、`cp` 等） | 迭代审查的代码    |
| [`plan`](#analyze-before-you-edit-with-plan-mode)                   | 仅读取                                           | 在更改前探索代码库  |
| [`auto`](#eliminate-prompts-with-auto-mode)                         | 所有操作，带有后台安全检查                                 | 长任务、减少提示疲劳 |
| [`dontAsk`](#allow-only-pre-approved-tools-with-dontask-mode)       | 仅预先批准的工具                                      | 锁定的 CI 和脚本 |
| [`bypassPermissions`](#skip-all-checks-with-bypasspermissions-mode) | 所有操作                                          | 仅限隔离容器和虚拟机 |

在 CLI 中、`claude --help` 中、VS Code 和 JetBrains 扩展中以及桌面应用中，审查每个操作的模式被命名为 **Manual**。其配置值为 `default`，这是 hooks 和 SDK 集成使用的值。CLI 在任何地方都接受 `manual` 作为别名，例如 `claude --permission-mode manual` 或 `"defaultMode": "manual"`。Manual 标签和 `manual` 别名需要 Claude Code v2.1.200 或更高版本。桌面应用的标签不依赖于您的 CLI 版本。

在除 `bypassPermissions` 之外的每种模式中，对[受保护路径](#protected-paths)的写入永远不会自动批准，保护存储库状态和 Claude 自己的配置免受意外损坏。

模式设置基线。在顶部分层[权限规则](/docs/zh-CN/permissions#manage-permissions)以预先批准或阻止特定工具。拒绝规则、显式询问规则、[连接器工具上的组织 `ask` 设置](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 标记适用于每种模式，包括 `bypassPermissions`。允许规则在该模式中无效，因为其他所有内容都已被批准。

<h2 id="switch-permission-modes">
  切换权限模式
</h2>

您可以在会话中途、启动时或作为持久默认值切换模式。模式通过这些控件设置，而不是通过在聊天中询问 Claude。选择下面的界面以查看如何更改它。

<Tabs>
  <Tab title="CLI">
    **在会话期间**：按 `Shift+Tab` 循环切换 `default` → `acceptEdits` → `plan`。当前模式显示在状态栏中。手动模式（该循环中的 `default`）显示灰色的 `⏸ manual mode on` 徽章。在 v2.1.203 之前，状态栏在手动模式下不显示徽章。

    并非每个模式都在默认循环中：

    * `auto`：当您的账户满足 [auto 模式要求](#eliminate-prompts-with-auto-mode) 时出现；循环切换到它会在没有确认提示的情况下切换模式
    * `bypassPermissions`：在您使用 `--permission-mode bypassPermissions`、`--dangerously-skip-permissions` 或 `--allow-dangerously-skip-permissions` 启动后出现；`--allow-` 变体会将模式添加到循环中而不激活它
    * `dontAsk`：永远不会在循环中出现；使用 `--permission-mode dontAsk` 设置它

    启用的可选模式在 `plan` 之后插入，`bypassPermissions` 优先，`auto` 最后。如果您同时启用了两者，您将在循环到 `auto` 的途中循环通过 `bypassPermissions`。

    **在启动时**：将模式作为标志传递。

    ```bash theme={null}
    claude --permission-mode plan
    ```

    **作为默认值**：在 [设置](/docs/zh-CN/settings#settings-files) 中设置 `defaultMode`。

    ```json theme={null}
    {
      "permissions": {
        "defaultMode": "acceptEdits"
      }
    }
    ```

    相同的 `--permission-mode` 标志适用于 `-p` 用于 [非交互式运行](/docs/zh-CN/headless)。
  </Tab>

  <Tab title="VS Code">
    **在会话期间**：点击提示框底部的模式指示器。

    **作为默认值**：在 VS Code 设置中设置 `claudeCode.initialPermissionMode`，或使用 Claude Code 扩展设置面板。

    模式指示器显示这些标签，映射到每个标签应用的模式：

    | UI 标签              | 模式                  |
    | :----------------- | :------------------ |
    | Manual             | `default`           |
    | Edit automatically | `acceptEdits`       |
    | Plan               | `plan`              |
    | Auto               | `auto`              |
    | Bypass permissions | `bypassPermissions` |

    在 v2.1.205 之前，扩展将 `plan` 标记为 Plan mode，将 `auto` 标记为 Auto mode。

    当您的账户满足 [auto 模式部分](#eliminate-prompts-with-auto-mode) 中列出的每项要求时，Auto 模式会在模式指示器中出现。`claudeCode.initialPermissionMode` 设置不接受 `auto`。要默认以 auto 模式启动，请改为在您的 [用户设置](/docs/zh-CN/settings#settings-files) 中设置 `defaultMode`。Claude Code 忽略项目和本地设置中的 `defaultMode: "auto"`。

    绕过权限需要扩展设置中的 **Allow dangerously skip permissions** 切换，然后才能在模式指示器中出现。

    有关扩展特定的详细信息，请参阅 [VS Code 指南](/docs/zh-CN/vs-code)。
  </Tab>

  <Tab title="JetBrains">
    JetBrains 插件在 IDE 终端中运行 Claude Code，因此切换模式的工作方式与 CLI 中相同：按 `Shift+Tab` 循环切换，或在启动时传递 `--permission-mode`。
  </Tab>

  <Tab title="Desktop">
    **在会话期间**：使用发送按钮旁边的模式选择器。并非每个模式都出现在选择器中：

    * **Auto**：当您的账户满足 [auto 模式要求](#eliminate-prompts-with-auto-mode) 时出现
    * **Bypass permissions**：在 Pro 和 Max 计划上需要 Desktop 设置中的 **Allow bypass permissions mode** 切换；在 Team 和 Enterprise 计划上，组织策略控制它

    有关 desktop 特定的详细信息，请参阅 Desktop 指南中的 [选择权限模式](/docs/zh-CN/desktop#choose-a-permission-mode)。

    **作为默认值**：在 [设置](/docs/zh-CN/settings#settings-files) 中设置 `defaultMode`。桌面应用读取与 CLI 相同的设置文件，并将模式应用于新的本地会话。

    您在模式选择器中选择的模式会按文件夹记住，并对该文件夹优先于 `defaultMode`。Plan 是例外：选择它仅适用于当前会话。

    此示例将 Plan 模式设置为新本地会话的默认值：

    ```json theme={null}
    {
      "permissions": {
        "defaultMode": "plan"
      }
    }
    ```
  </Tab>

  <Tab title="Web and mobile">
    在 [claude.ai/code](https://claude.ai/code) 或移动应用中使用提示框旁边的模式下拉菜单。权限提示出现在 claude.ai 中以供批准。显示哪些模式取决于会话在何处运行：

    * **Cloud sessions** 在 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 上：Accept edits、Plan 和 Auto。Accept edits 对应于 `default` 模式：云环境预先批准文件编辑，无论模式如何，因此下拉菜单显示 Accept edits 而不是 Manual。Cloud sessions 仍然遵守设置中的 `defaultMode: "acceptEdits"`。Auto 模式仅在您的组织允许且所选模型支持时出现。Bypass permissions 不可用。
    * **[Remote Control](/docs/zh-CN/remote-control) sessions** 在您的本地机器上：Manual、Accept edits 和 Plan。您无法从应用中选择 Auto 或 Bypass permissions。下拉菜单显示本地会话所在的模式，包括从终端设置的模式，并在应用或终端中模式更改时更新。唯一的例外是 Bypass permissions：会话永远不会向 claude.ai 报告该模式，因此从终端切换到它不会改变下拉菜单显示的内容。在 v2.1.202 之前，使用 `/remote-control` 或 `claude --remote-control` 连接的会话根本不报告其模式，因此 claude.ai 和移动应用可能显示会话不在的模式。不匹配仅影响标签：Claude Code 从会话的实际模式生成权限提示，它们仍然出现在应用中以供批准。

    对于 Remote Control，您还可以在启动主机时设置起始模式：

    ```bash theme={null}
    claude remote-control --permission-mode acceptEdits
    ```
  </Tab>
</Tabs>

<h2 id="auto-approve-file-edits-with-acceptedits-mode">
  使用 acceptEdits 模式自动批准文件编辑
</h2>

`acceptEdits` 模式让 Claude 在你的工作目录中创建和编辑文件，无需提示。当此模式处于活动状态时，状态栏显示 `⏵⏵ accept edits on`。

除了文件编辑外，`acceptEdits` 模式还自动批准常见的文件系统 Bash 命令：`mkdir`、`touch`、`rm`、`rmdir`、`mv`、`cp` 和 `sed`。当这些命令带有安全环境变量（如 `LANG=C` 或 `NO_COLOR=1`）或进程包装器（如 `timeout`、`nice` 或 `nohup`）作为前缀时，也会自动批准。与文件编辑一样，自动批准仅适用于工作目录或 `additionalDirectories` 内的路径。超出该范围的路径、对[受保护路径](#protected-paths)的写入以及所有其他 Bash 命令（除了[内置只读集合](/docs/zh-CN/permissions#read-only-commands)）仍然会提示。

当启用 [PowerShell tool](/docs/zh-CN/tools-reference#powershell-tool) 时，`acceptEdits` 模式还会自动批准 `Set-Content`、`Add-Content`、`Clear-Content` 和 `Remove-Item` 在范围内路径上的操作，以及它们的常见别名。相同的范围和受保护路径规则适用。

当你想在编辑器中或通过 `git diff` 事后查看更改，而不是逐个批准每个编辑时，使用 `acceptEdits`。

从 Manual 模式按一次 `Shift+Tab` 进入它，或直接启动它：

```bash theme={null}
claude --permission-mode acceptEdits
```

<h2 id="analyze-before-you-edit-with-plan-mode">
  使用 plan mode 在编辑前进行分析
</h2>

Plan mode 告诉 Claude 研究并提议更改，但不进行实际编辑。Claude 读取文件、运行 shell 命令进行探索并编写计划，但不编辑您的源代码。权限提示的应用方式与手动模式相同，除非 [auto mode](/docs/zh-CN/auto-mode-config) 可用且 `useAutoModeDuringPlan` 已启用（这是默认设置）。启用 auto mode 后，分类器会批准只读命令（如搜索和文件读取）而无需提示。无论哪种方式，编辑都会保持阻止状态，直到您批准计划。

通过按 `Shift+Tab` 或在单个提示前加上 `/plan` 来进入 plan mode。您也可以从 CLI 启动 plan mode：

```bash theme={null}
claude --permission-mode plan
```

再次按 `Shift+Tab` 以退出 plan mode 而不批准计划。

<h3 id="review-and-approve-a-plan">
  审查并批准计划
</h3>

当计划准备好时，Claude 会呈现它并询问如何继续。从该提示中，您可以：

* 批准并在 auto mode 中启动
* 批准并接受编辑
* 批准并手动审查每个编辑
* 继续规划并提供反馈
* 使用 [Ultraplan](/docs/zh-CN/ultraplan) 进行基于浏览器的审查

批准计划会退出 plan mode 并将会话切换到每个批准选项描述的权限模式，因此 Claude 开始编辑。要再次规划，使用 `Shift+Tab` 循环回到 plan mode，或在下一个提示前加上 `/plan`。

按 `Ctrl+G` 在默认文本编辑器中打开建议的计划并在 Claude 继续之前直接编辑它。当启用 [`showClearContextOnPlanAccept`](/docs/zh-CN/settings#available-settings) 时，每个批准选项也会提供在首先清除规划上下文的选项。

接受计划也会根据计划内容自动命名会话，除非您已经使用 `--name` 或 `/rename` 设置了名称。

<h3 id="set-plan-mode-as-the-default">
  将 plan mode 设置为默认值
</h3>

要使 plan mode 成为项目的默认值，请在 `.claude/settings.json` 中设置 `defaultMode`：

```json theme={null}
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

<h2 id="eliminate-prompts-with-auto-mode">
  使用自动模式消除权限提示
</h2>

自动模式让 Claude 无需例行权限提示即可执行。一个独立的分类器模型在操作运行前审查它们，阻止任何超出您请求范围、针对无法识别的基础设施或看起来由 Claude 读取的恶意内容驱动的操作。显式的[询问规则](/docs/zh-CN/permissions#manage-permissions)仍然会强制显示提示。

针对文件系统根目录或主目录的删除操作，如 `rm -rf /` 和 `rm -rf ~`，会提示批准而不是进入分类器。当命令包含带有 `$(...)` 或反引号的命令替换，或带有 `<(...)` 的进程替换时，此提示也会触发，无论删除是在替换内部（如 `echo "$(rm -rf ~)"`），还是在同一命令的其他地方。在 v2.1.208 之前，包含这些形式的命令进入分类器而不是提示。

自动模式还会促使 Claude 继续工作而不停下来提出澄清问题，尽管当您的提示或技能明确依赖它时，Claude 仍然会询问。为了获得更强的自主行为同时保持权限提示，请改为设置[主动输出风格](/docs/zh-CN/output-styles)。

<Warning>
  自动模式减少权限提示，但不保证安全。将其用于您信任总体方向的任务，而不是作为敏感操作审查的替代品。
</Warning>

自动模式仅在您的账户满足以下所有要求时可用：

* **计划**：所有计划。
* **所有者**：在 Team 和 Enterprise 上，所有者必须在 [Claude Code 管理员设置](https://claude.ai/admin-settings/claude-code)中启用它，用户才能打开它。管理员也可以通过在[托管设置](/docs/zh-CN/permissions#managed-settings)中将 `permissions.disableAutoMode` 设置为 `"disable"` 来关闭自动模式。对于桌面应用的 Code 选项卡，`disableAutoMode` 是组织级别的控制，管理员设置切换不适用。
* **模型**：在 Anthropic API 上，Claude Opus 4.6 或更高版本，或 Sonnet 4.6 或更高版本。在 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 和已登录的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 会话上，仅支持 Claude Sonnet 5、Opus 4.7 和 Opus 4.8。较旧的模型，包括 Sonnet 4.5、Opus 4.5、Haiku 和 claude-3 模型，在任何提供商上都不受支持。
* **提供商**：在 Anthropic API、Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 和已登录的 Claude apps gateway 会话上默认可用。在 v2.1.158 到 v2.1.206 中，自动模式在除 Anthropic API 之外的所有这些提供商上都是关闭的，直到您设置 `CLAUDE_CODE_ENABLE_AUTO_MODE=1`；v2.1.207 移除了该要求。

如果 Claude Code 报告自动模式不可用，则其中一个要求未满足；这不是暂时性中断。一条单独的消息，其中命名了一个模型并说自动模式"无法确定"操作的安全性，是暂时性分类器中断；请参阅[错误参考](/docs/zh-CN/errors#auto-mode-cannot-determine-the-safety-of-an-action)。

如果您在[设置](/docs/zh-CN/settings#available-settings)中设置 `defaultMode: "auto"`，并且会话以 `default` 模式启动且没有错误，则该设置可能在 `.claude/settings.json` 或 `.claude/settings.local.json` 中。Claude Code v2.1.142 及更高版本忽略来自这些文件的 `auto`，因此存储库无法授予自己自动模式。将其移至 `~/.claude/settings.json`。

<h3 id="enable-auto-mode-on-bedrock-agent-platform-or-foundry">
  Bedrock、Agent Platform 或 Foundry 上的自动模式
</h3>

在 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud 的 Agent Platform](/docs/zh-CN/google-vertex-ai)、[Microsoft Foundry](/docs/zh-CN/microsoft-foundry) 和已登录的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 会话上，自动模式默认出现在 `Shift+Tab` 循环中。出现在循环中不会改变会话启动的模式：会话仍然以您的 [`defaultMode`](/docs/zh-CN/settings#available-settings) 启动，除非您更改它，否则为 Manual。这些提供商上仅支持 Claude Sonnet 5、Opus 4.7 和 Opus 4.8。

要使自动模式成为默认启动模式，请在用户或托管设置中设置 `"permissions": {"defaultMode": "auto"}`。

要防止开发人员使用自动模式，请在[托管设置](/docs/zh-CN/permissions#managed-settings)中将 `disableAutoMode` 设置为 `"disable"`。这会从 `Shift+Tab` 循环中移除 `auto`，并在启动时拒绝 `--permission-mode auto`。

在 v2.1.158 到 v2.1.206 中，自动模式在这些提供商上是关闭的，直到您设置 `CLAUDE_CODE_ENABLE_AUTO_MODE=1`，并且 Claude Code 在这些提供商上忽略 `defaultMode: "auto"`，除非也设置了该变量。该变量仍然被接受以保持兼容性，从 v2.1.207 开始没有效果。

<h3 id="what-the-classifier-blocks-by-default">
  分类器默认阻止的内容
</h3>

分类器信任您的工作目录和为其配置的远程，这些远程在会话启动时被配置。在会话期间使用 `git remote add` 或 `git remote set-url` 添加或重新指向的远程不受信任，其他所有内容都被视为外部，直到您[配置受信任的基础设施](/docs/zh-CN/auto-mode-config)。在 v2.1.200 之前，中途添加的远程也受信任。

**默认阻止**：

* 下载和执行代码，如 `curl | bash`
* 向外部端点发送敏感数据
* 生产部署和迁移
* 云存储上的大规模删除
* 授予 IAM 或存储库权限
* 修改共享基础设施
* 不可逆地销毁会话前存在的文件
* 强制推送
* 当推送包含敏感内容（如秘密或个人或受托数据）、包含相对于您要求的隐藏或描述错误的更改、包含从存储库外部移植或首次读取的内容，或绕过您要求的拉取请求、审查或检查时，推送到存储库的默认分支。普通推送到默认分支本身不会被阻止，清除标记的推送需要命名标记的内容或绕过的审查，而不仅仅是推送。分类器是一个层：[`permissions.deny` 规则](/docs/zh-CN/permissions#manage-permissions)在每种模式下都适用，可以完全阻止推送到默认分支，远程自己的分支保护仍然适用。在 v2.1.203 之前，任何直接推送到默认分支都被阻止
* `git reset --hard`、`git checkout -- .`、`git restore .`、`git clean -fd`、`git stash drop` 或 `git stash clear`，分类器假设会丢弃未提交的更改
* 当 HEAD 处的提交不是在此会话中创建的时，`git commit --amend`
* 从 v2.1.198 开始，当 HEAD 处的提交已经被推送时，`git commit --amend`。仅消息重述不被阻止：`--amend -m`，没有新暂存的内容，在 Claude 在此会话期间创建的提交上
* `terraform destroy`、`pulumi destroy`、`cdk destroy` 或 `terragrunt destroy`，以及应用销毁资源的计划

Claude Code v2.1.195 及更高版本默认阻止更多类别。其中几个取决于[环境](/docs/zh-CN/auto-mode-config#define-trusted-infrastructure)条目，如敏感远程目标和受保护的 IaC 范围，您可以将其缩小到具体名称。

* 写入秘密管理器，或更改 DNS 记录或 TLS 证书
* 合并没有人类批准的拉取请求、批准 Claude 自己的拉取请求或禁用 CI 检查
* 发布本身是自动化命令的评论，如 `atlantis apply` 或机器人的 `/deploy` 或 `/merge`
* 切换、调整或删除生产功能标志
* 将基础设施更改应用于受保护的 IaC 范围，或排空和移除集群节点
* 写入超出您命名的资源的共享计算集群，如标签选择器或 `--all`，捕获其他用户的作业
* 创建在每个节点上运行或拦截集群流量的 Kubernetes 资源，如 DaemonSets 和准入 webhooks
* 交互式 shell 或端口转发到敏感远程目标
* 打开隧道或反向 shell，使本地服务可从公共互联网访问
* 将实时凭证或令牌打印到记录或文件中
* 访问在您的[环境](/docs/zh-CN/auto-mode-config#define-trusted-infrastructure)中列为敏感数据位置的位置，或从中复制数据。从 v2.1.198 开始，这也阻止从一个位置向条目排除的受众发送数据
* 绕过您的内部包注册表将包安装路由到公共注册表。从 v2.1.198 开始，这也适用于您在对话中告诉 Claude 内部注册表或镜像存在的情况，而不仅仅是在您的环境中列出的情况
* 使用禁用安全防护的标志运行命令，如 `--insecure`
* 启动在没有人类批准或沙箱的情况下运行的自主代理循环，如使用 `--dangerously-skip-permissions` 或 `--no-sandbox` 启动的循环。从 v2.1.198 开始，这也涵盖运行第三方代理或评估工具，隔离和按操作批准被禁用，如使用 `--yes-always` 启动的运行器
* [Chrome 中的 Claude](/docs/zh-CN/chrome) 浏览器操作，可能会将页面内容、cookie 或凭证发送到跨域

Claude Code v2.1.198 及更高版本也默认阻止这些：

* 通过通配符、glob 或年龄过滤器而不是特定命名路径删除 `/tmp`、`$TMPDIR` 或其他共享暂存或缓存目录中的文件
* 当您自己的消息没有授权这些详细信息给该收件人时，在发送、上传、发布或写入其他人或共享系统的内容中包含敏感详细信息。当存储库在信任边界外或公开时，PR 和问题正文、提交消息和评论计为这种类型的出站内容，包括您组织自己的公开存储库；内部文件路径、代码名称、实时 API 响应数据（如电子邮件或账户标识符）和基础设施标识符计为敏感详细信息。PR、问题和提交消息范围需要 Claude Code v2.1.200 或更高版本。PR 或问题正文中的实时个人数据（如电子邮件地址、账户或组织标识符或使用指标）需要您命名这些详细信息和收件人，无论存储库的可见性或信任边界如何。该检查需要 Claude Code v2.1.203 或更高版本
* 向 Claude Code 自己的 tmux 窗格发送按键以驱动其自己的界面，分类器将其视为 Claude 更改自己的权限或监督

Claude Code v2.1.200 及更高版本也默认阻止这些：

* 注释掉、删除或强制通过保护安全行为的测试或断言，如身份验证、访问控制、输入验证或沙箱
* 删除或拆除 Claude 在会话中未创建的有状态资源，当没有更具体的删除规则适用且您没有命名该资源时
* 在第三方主机处重新指向 API 基础 URL、代理端点、webhook 接收器或注册表镜像，该主机不适合任务，包括在 `.env.example` 等示例文件中
* 使用 `git remote set-url` 或 `git remote add` 更改推送去向，除非您命名了新远程
* 推送秘密或个人或受托数据到已知为公开的存储库，或推送不属于该存储库自己工作的机密材料。dotfiles 存储库自己的主题是个人或受托数据的唯一例外，来自私有存储库到任何公开表面的内容以相同方式被阻止；两项改进都需要 Claude Code v2.1.203 或更高版本。在 v2.1.203 之前，个人数据与机密材料分组，仅当它不属于该存储库自己的工作时才被阻止。当存储库的可见性未建立时，分类器不会仅基于此阻止；它改为根据其他规则判断内容
* 针对不同存储库或组织打开拉取请求、使用 `gh repo fork` 进行分叉或推送到第三方存储库，除非您命名了该外部目标

Claude Code v2.1.203 及更高版本也默认阻止这些：

* 来自敏感本地存储或其名称、路径或类型将其标记为敏感的文件的内容进入提交、推送、PR 或问题文本、gist 或粘贴或包发布，除非您命名了源和目标。会话记录和对话日志、凭证和配置点文件夹（如 SSH 密钥、云凭证、浏览器配置文件和 shell 历史记录）以及用户数据导出都计为此，存储库为私有不会清除它

Claude Code v2.1.205 及更高版本也默认阻止这些：

* 写入 Claude Code 会话记录、`~/.claude/projects/` 下的 `.jsonl` 历史文件或您配置的配置目录，无论是直接还是通过 shell 命令。该规则也涵盖 Claude Code 为其自己的检查附加到每个记录条目的元数据行。记录是 Claude Code 写入的会话状态，而不是工作文件，篡改的条目在您恢复会话后到达每个后续检查，因此自动模式作为深度防御阻止这些写入。读取记录不被阻止
* 递归强制删除，如 `rm -rf "$VAR"` 或 `Remove-Item -Recurse -Force $dir`，其目标是分类器看不到在对话中任何地方分配的 shell 变量，或以一个为根的 glob。该值仅来自较早的命令输出，分类器从不接收，因此分类器无法根据其他删除规则验证删除目标。分类器按设计读取对话而不是命令输出，因此它阻止调用而不是猜测目标。当您命名被删除的确切路径或 Claude 使用写入命令中的已解析文字路径重新运行删除时，阻止清除。分类器可以解析其目标的删除不受影响

**默认允许**：

* 您工作目录中的本地文件操作
* 安装在您的锁定文件或清单中声明的依赖项
* 读取 `.env` 并向其匹配的 API 发送凭证
* 只读 HTTP 请求
* 推送到您启动的分支或 Claude 创建的分支
* 例行推送到存储库默认分支。在 v2.1.203 之前，任何直接推送到默认分支都被阻止

Claude Code v2.1.195 及更高版本也默认允许这些：

* 删除 Claude 在同一会话中较早创建的确切作业
* 作为您的任务的一部分，读取、审查或编写与安全相关的代码、配置和威胁模型
* 在同一多代理会话中一起工作的代理之间的消息
* 向您在 [`environment`](/docs/zh-CN/auto-mode-config#define-trusted-infrastructure) 中列出的受信任域、存储桶和服务发送数据。这仅涵盖数据流，不涵盖同一基础设施上的破坏性或凭证操作
* [Chrome 中的 Claude](/docs/zh-CN/chrome) 导航到受信任的内部域、localhost 或您命名的 URL

沙箱网络访问请求通过分类器路由，而不是默认允许。从 v2.1.198 开始，分类器重用其对网络主机和端口的判决，而不是在每次连接时重新运行：

* 允许被重用直到新内容进入对话，此时该主机被再次检查
* 在交互式 CLI 中，拒绝在轮次结束时被丢弃
* 在[非交互模式](/docs/zh-CN/headless)和 Agent SDK 会话中没有轮次边界，因此拒绝被重用于运行的其余部分
* 更改您的权限模式或规则会丢弃所有缓存的判决

运行 `claude auto-mode defaults` 查看完整规则列表。如果例行操作被阻止，管理员可以通过 `autoMode.environment` 设置添加受信任的存储库、存储桶和服务：请参阅[配置自动模式](/docs/zh-CN/auto-mode-config)。

推送到您的工作分支、例行推送到存储库默认分支以及创建与您的请求匹配的拉取请求都无需提示即可运行。分类器仅在推送存在风险时才阻止它，如强制推送或绕过您设置的审查的内容。要在保持自动模式的同时在这些操作前需要人工检查点，请添加 `permissions.ask` 规则：请参阅[常见边界](/docs/zh-CN/auto-mode-config#common-boundaries)。

<h3 id="boundaries-you-state-in-conversation">
  您在对话中陈述的边界
</h3>

分类器将您在对话中陈述的边界视为阻止信号。如果您告诉 Claude"不要推送"或"等待我审查后再部署"，分类器会阻止匹配的操作，即使默认规则会允许它们。边界保持有效，直到您在后续消息中解除它。Claude 自己的判断条件已满足不会解除它。

边界不作为规则存储。分类器在每次检查时从记录中重新读取它们，因此如果[上下文压缩](/docs/zh-CN/costs#reduce-token-usage)移除陈述它的消息，边界可能会丢失。为了获得硬保证，请改为添加[拒绝规则](/docs/zh-CN/permissions#permission-rule-syntax)。

<h3 id="when-auto-mode-falls-back">
  自动模式何时回退
</h3>

每个被拒绝的操作显示通知并出现在 `/permissions` 下的"最近拒绝"选项卡中，您可以按 `r` 使用手动批准重试它。

如果分类器连续 3 次或总共 20 次阻止操作，自动模式暂停，Claude Code 恢复提示。批准提示的操作恢复自动模式。这些阈值不可配置。任何允许的操作重置连续计数器，而总计数器在会话期间持续，仅当其自己的限制触发回退时重置。

在[非交互模式](/docs/zh-CN/headless)中使用 `-p` 标志，重复阻止会中止会话，因为没有用户可以提示。

重复阻止通常意味着分类器缺少关于您的基础设施的上下文。使用 `/feedback` 报告误报，或让管理员[配置受信任的基础设施](/docs/zh-CN/auto-mode-config)。

<AccordionGroup>
  <Accordion title="分类器如何评估操作">
    每个操作都经过固定的决策顺序。第一个匹配的步骤获胜：

    1. 与您的[允许、询问或拒绝规则](/docs/zh-CN/permissions#manage-permissions)匹配的操作立即解决。写入[受保护路径](#protected-paths)的操作即使允许规则匹配也会路由到分类器。您的组织[设置为 `ask` 的连接器工具](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和标记为 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具即使允许规则匹配也会直接提示您。内容范围的询问规则回退到权限提示
    2. 只读操作和工作目录中的文件编辑被自动批准，除了[受保护路径](#protected-paths)的写入
    3. 其他所有内容都进入分类器。您的组织[设置为 `ask` 的连接器工具](/docs/zh-CN/mcp#organization-controls-on-connector-tools)跳过分类器并直接提示您，因此组织要求的批准从不被自动批准。从 v2.1.199 开始，标记有 [`_meta["anthropic/requiresUserInteraction"]`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具也跳过分类器并直接提示您，因此同意步骤从不代表工具作者自动批准
    4. 如果分类器阻止，Claude 接收原因并尝试替代方案

    进入自动模式时，授予任意代码执行的广泛允许规则被丢弃：

    * 笼统的 `Bash(*)` 或 `PowerShell(*)`
    * 通配符解释器，如 `Bash(python*)`
    * 包管理器运行命令
    * `Agent` 允许规则

    窄规则如 `Bash(npm test)` 保留。丢弃的规则在您离开自动模式时恢复。

    分类器看到用户消息、工具调用和您的 CLAUDE.md 内容。工具结果被剥离，因此文件或网页中的恶意内容无法直接操纵它。一个单独的服务器端探针扫描传入的工具结果，并在 Claude 读取之前标记可疑内容。有关这些层如何协同工作的更多信息，请参阅[自动模式公告](https://claude.com/blog/auto-mode)和[工程深潜](https://www.anthropic.com/engineering/claude-code-auto-mode)。
  </Accordion>

  <Accordion title="自动模式如何处理子代理">
    分类器在三个点检查[子代理](/docs/zh-CN/sub-agents)工作：

    1. 在子代理启动前，委托的任务描述被评估，因此危险看起来的任务在生成时被阻止。
    2. 当子代理运行时，其每个操作都通过分类器，使用与父会话相同的规则，子代理前言中的任何 `permissionMode` 被忽略。
    3. 当子代理完成时，分类器审查其完整操作历史；如果该返回检查标记了关注，安全警告被前置到子代理的结果。

    步骤 1 需要 Claude Code v2.1.178 或更高版本。较早的版本在步骤 2 和 3 应用分类器，但在子代理启动前没有评估任务描述。
  </Accordion>

  <Accordion title="成本和延迟">
    分类器在独立于您的 `/model` 选择的服务器配置模型上运行，因此切换模型不会改变分类器可用性。分类器调用计入您的令牌使用。每次检查发送记录的一部分加上待处理操作，在执行前添加往返。受保护路径外的读取和工作目录编辑跳过分类器，因此开销主要来自 shell 命令和网络操作。从 v2.1.198 开始，主机和端口的沙箱网络判决被重用，而不是在每次连接时重新分类，因此到同一主机的重复连接不会各自添加检查。[分类器默认阻止的内容](#what-the-classifier-blocks-by-default)描述允许和拒绝持续多长时间。
  </Accordion>
</AccordionGroup>

<h2 id="allow-only-pre-approved-tools-with-dontask-mode">
  使用 dontAsk 模式仅允许预先批准的工具
</h2>

如果您设置 `dontAsk` 模式，Claude Code 会自动拒绝所有原本会提示的工具调用。Claude 仅运行与您的 `permissions.allow` 规则、[只读 Bash 命令](/docs/zh-CN/permissions#read-only-commands)匹配的操作，以及由 [PreToolUse hook](/docs/zh-CN/permissions#extend-permissions-with-hooks) 批准的调用。在 CI 管道或受限环境中使用此模式，您可以预先定义 Claude 可以执行的操作；会话永远不会等待输入。当此模式处于活动状态时，状态栏显示 `⏵⏵ don't ask on`。

Claude Code 拒绝与您的显式 [`ask` 规则](/docs/zh-CN/permissions#manage-permissions)匹配的调用，而不是提示。它还拒绝内置的 `AskUserQuestion` 工具和连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)，即使您的 allow 规则与其匹配。它以相同的方式拒绝标记有 [`_meta["anthropic/requiresUserInteraction"]`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具，因为其批准卡需要此模式永远不会收集的答案；这需要 Claude Code v2.1.199 或更高版本。

[Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 上的云会话会忽略 `defaultMode: "dontAsk"`；有关详细信息，请参阅 [bypassPermissions](#skip-all-checks-with-bypasspermissions-mode)。

在启动时使用标志设置它：

```bash theme={null}
claude --permission-mode dontAsk
```

<h2 id="skip-all-checks-with-bypasspermissions-mode">
  使用 bypassPermissions 模式跳过所有检查
</h2>

`bypassPermissions` 模式禁用权限提示和安全检查，以便工具调用立即执行，包括对[受保护路径](#protected-paths)的写入。在 v2.1.126 之前，受保护路径的写入在此模式下仍会提示。

显式的[询问规则](/docs/zh-CN/permissions#manage-permissions)和连接器工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)仍会在此模式下强制提示。标记有 [`_meta["anthropic/requiresUserInteraction"]`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具也仍会提示；这需要 Claude Code v2.1.199 或更高版本。

针对文件系统根目录或主目录的删除操作，如 `rm -rf /` 和 `rm -rf ~`，仍会作为针对模型错误的断路器进行提示。当命令包含使用 `$(...)` 或反引号的命令替换，或使用 `<(...)` 的进程替换时，断路器也会触发，无论删除操作位于替换内部（如 `echo "$(rm -rf ~)"`），还是位于同一命令中的其他位置。纯形式（作为其自己的命令输入）自断路器引入以来在此模式下已提示；在 v2.1.208 之前，包含这些形式的命令不会提示。

<Warning>
  仅在隔离环境（如容器、虚拟机或没有互联网访问的开发容器）中使用此模式，其中 Claude Code 无法损害您的主机系统。
</Warning>

您无法从未使用启用标志启动的会话进入 `bypassPermissions`；使用以下标志重新启动以启用它：

```bash theme={null}
claude --permission-mode bypassPermissions
```

`--dangerously-skip-permissions` 标志是等效的。

在 Linux 和 macOS 上，当以 root 身份或在 `sudo` 下运行时，Claude Code 拒绝以此模式启动：

```text theme={null}
--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons
```

该检查在识别的沙箱内自动跳过。要在容器中自主运行，请使用[开发容器](/docs/zh-CN/devcontainer)配置，该配置以非 root 用户身份运行 Claude Code。

[网络上的 Claude Code](/docs/zh-CN/claude-code-on-the-web) 不遵守您的设置文件中的 `defaultMode: "bypassPermissions"` 或 `"dontAsk"`，因此存储库的签入设置无法在绕过权限模式下启动云会话。该设置被静默忽略，会话改为以模式下拉菜单中显示的模式启动。有关云会话提供的模式，请参阅[切换权限模式](#switch-permission-modes)。

<Warning>
  `bypassPermissions` 不提供针对提示注入或意外操作的保护。为了获得背景安全检查且权限提示大幅减少，请改用[自动模式](#eliminate-prompts-with-auto-mode)。管理员可以通过在[托管设置](/docs/zh-CN/permissions#managed-settings)中将 `permissions.disableBypassPermissionsMode` 设置为 `"disable"` 来阻止此模式。
</Warning>

<h2 id="protected-paths">
  受保护的路径
</h2>

在除 `bypassPermissions` 之外的所有模式中，对一小组路径的写入永远不会自动批准。这可以防止意外损坏存储库状态和 Claude 自己的配置。

| 模式                             | 受保护路径写入 |
| :----------------------------- | :------ |
| `default`、`acceptEdits`、`plan` | 提示      |
| `auto`                         | 路由到分类器  |
| `dontAsk`                      | 拒绝      |
| `bypassPermissions`            | 允许      |

设置文件中的 [`permissions.allow`](/docs/zh-CN/permissions#manage-permissions) 规则不会预先批准受保护路径的写入。安全检查在 Claude Code 评估设置中的允许规则之前运行，因此 `~/.claude/settings.json` 或 `.claude/settings.json` 中的条目（如 `Edit(.claude/**)`）不会改变上表中的每个模式结果。在提示的模式中，`.claude/` 写入的提示提供**是的，允许 Claude 在此会话中编辑其自己的设置**，这会在该会话中批准后续的 `.claude/` 写入而无需再次提示。

受保护的目录：

* `.git`
* `.config/git`
* `.vscode`
* `.idea`
* `.husky`
* `.cargo`
* `.devcontainer`
* `.yarn`
* `.mvn`
* `.claude`，除了 `.claude/worktrees`，Claude 在其中存储自己的 git worktrees

受保护的文件：

* `.gitconfig`、`.gitmodules`
* `.bashrc`、`.bash_profile`、`.bash_login`、`.bash_aliases`、`.bash_logout`、`.zshrc`、`.zprofile`、`.zshenv`、`.zlogin`、`.zlogout`、`.profile`、`.envrc`
* `.npmrc`、`.yarnrc`、`.yarnrc.yml`、`.pnp.cjs`、`.pnp.loader.mjs`、`.pnpmfile.cjs`、`bunfig.toml`、`.bunfig.toml`
* `.bazelrc`、`.bazelversion`、`.bazeliskrc`
* `.pre-commit-config.yaml`、`lefthook.yml`、`lefthook.yaml`、`.lefthook.yml`、`.lefthook.yaml`
* `gradle-wrapper.properties`、`maven-wrapper.properties`
* `.devcontainer.json`
* `.ripgreprc`、`pyrightconfig.json`
* `.mcp.json`、`.claude.json`

<h2 id="see-also">
  另请参阅
</h2>

* [权限](/docs/zh-CN/permissions)：允许、询问和拒绝规则；托管策略
* [配置自动模式](/docs/zh-CN/auto-mode-config)：告诉分类器您的组织信任哪些基础设施
* [Hooks](/docs/zh-CN/hooks)：通过 `PreToolUse` 和 `PermissionRequest` hooks 的自定义权限逻辑
* [Ultraplan](/docs/zh-CN/ultraplan)：在 Claude Code 网络会话中运行计划模式，支持基于浏览器的审查
* [安全](/docs/zh-CN/security)：保障措施和最佳实践
* [沙箱](/docs/zh-CN/sandboxing)：Bash 命令的文件系统和网络隔离
* [非交互模式](/docs/zh-CN/headless)：使用 `-p` 标志运行 Claude Code
