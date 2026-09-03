> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用 Ultrareview 查找错误

> 使用 /code-review ultra 在云中运行深度多代理代码审查，在合并前查找和验证错误。

<Note>
  Ultrareview 是一个研究预览功能。该功能、定价和可用性可能会根据反馈而改变。该命令现在通过 `/code-review ultra` 调用，`/ultrareview` 仍然作为别名保留。
</Note>

Ultrareview 是在 Claude Code 网络基础设施上运行的深度代码审查。当您运行 `/code-review ultra` 时，Claude Code 在远程沙箱中启动一队审查代理来查找您的分支或拉取请求中的错误。

与本地 `/code-review` 或 `/review` 相比，ultrareview 提供：

* **更高的信号质量**：每个报告的发现都经过独立复现和验证，因此结果专注于真实的错误而不是风格建议
* **更广泛的覆盖范围**：许多审查代理并行探索更改，这会发现本地审查可能遗漏的问题
* **无本地资源使用**：审查完全在远程沙箱中运行，因此您的终端在运行时保持空闲，可用于其他工作

Ultrareview 需要使用 Claude.ai 账户进行身份验证，因为它在 Claude Code 网络基础设施上运行。如果您仅使用 API 密钥登录，请先运行 `/login` 并使用 Claude.ai 进行身份验证。当使用 Claude Code 与 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 时，Ultrareview 不可用，对于已启用零数据保留的组织也不可用。

<h2 id="run-ultrareview-from-the-cli">
  从 CLI 运行 ultrareview
</h2>

从 Claude Code CLI 中的任何 git 存储库启动审查。

```text theme={null}
/code-review ultra
```

不带参数时，ultrareview 审查您当前分支与默认分支之间的差异，包括工作树中任何未提交和暂存的更改。Claude Code 捆绑存储库状态并将其上传到远程沙箱进行审查。

要审查 GitHub 拉取请求，请传递 PR 编号。

```text theme={null}
/code-review ultra 1234
```

在 PR 模式下，远程沙箱直接从主机克隆拉取请求，而不是捆绑您的本地工作树。PR 模式适用于 `github.com` 上的存储库以及 Owner 已连接到 Claude Code 的 [GitHub Enterprise Server](/docs/zh-CN/github-enterprise-server) 实例。

<Tip>
  如果您的存储库太大而无法捆绑，Claude Code 会提示您改用 PR 模式。推送您的分支并打开草稿 PR，然后运行 `/code-review ultra <PR-number>`。

  如果拉取请求的差异太大，Claude Code 会在任何审查工作运行之前以范围提示拒绝审查。
</Tip>

启动前，Claude Code 显示一个确认对话框，其中包含审查范围（包括审查分支时的文件和行数）、您剩余的免费运行次数和估计成本。确认后，审查在后台继续进行，您可以继续使用您的会话。该命令仅在您使用 `/code-review ultra` 调用时运行；Claude 不会自动启动 ultrareview。

<h2 id="pricing-and-free-runs">
  定价和免费运行
</h2>

Ultrareview 是一项高级功能，按额外使用量而不是您计划的包含使用量计费。

| 计划                | 包含的免费运行 | 免费运行后                                                                                              |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Pro               | 3 次免费运行 | 按 [额外使用量](https://support.claude.com/zh-CN/articles/12429409-extra-usage-for-paid-claude-plans) 计费 |
| Max               | 3 次免费运行 | 按 [额外使用量](https://support.claude.com/zh-CN/articles/12429409-extra-usage-for-paid-claude-plans) 计费 |
| Team 和 Enterprise | 无       | 按 [额外使用量](https://support.claude.com/zh-CN/articles/12429409-extra-usage-for-paid-claude-plans) 计费 |

Pro 和 Max 订阅者获得三次免费 ultrareview 运行来尝试该功能。这三次运行是每个账户的一次性分配，不会刷新。使用完这三次后，或在免费运行期结束后，每次审查都按额外使用量计费，通常根据更改的大小花费 \$5 到 \$20。一次运行在远程会话启动后计数，因此您提前停止或未能完成的审查仍然会使用一次免费运行。对于付费审查，额外使用量仅对运行的部分计费。

由于 ultrareview 在免费运行之外始终按额外使用量计费，您的账户或组织必须在启动付费审查之前启用额外使用量。如果未启用额外使用量，Claude Code 会阻止启动并将您链接到计费设置，您可以在那里打开它。您也可以运行 `/usage-credits` 来检查或更改您的当前设置。

<h2 id="track-a-running-review">
  跟踪正在运行的审查
</h2>

审查通常需要 5 到 10 分钟。审查作为后台任务运行，因此您可以继续在会话中工作、启动其他命令或完全关闭终端。

使用 `/tasks` 查看正在运行和已完成的审查、打开审查的详细视图或停止正在进行的审查。停止审查会存档云会话，部分发现不会返回。审查完成后，验证的发现会在您的会话中显示为通知。每个发现都包括文件位置和问题的解释，因此您可以要求 Claude 直接修复它。

<h2 id="run-ultrareview-non-interactively">
  非交互式运行 ultrareview
</h2>

使用 `claude ultrareview` 子命令从 CI 或脚本启动 ultrareview，无需交互式会话。该子命令启动与 `/code-review ultra` 相同的审查，阻止直到远程审查完成，将发现打印到 stdout，成功时以代码 0 退出，失败时以代码 1 退出。

```bash theme={null}
claude ultrareview
claude ultrareview 1234
claude ultrareview origin/main
```

不带参数时，该子命令审查您当前分支与默认分支之间的差异。传递 PR 编号来审查拉取请求，或传递基础分支来审查与该分支的差异。调用该子命令表示同意交互式命令显示的计费和条款提示。

进度消息和实时会话 URL 转到 stderr，以便 stdout 保持可解析。使用这些标志来控制输出和超时：

| 标志                    | 描述                             |
| --------------------- | ------------------------------ |
| `--json`              | 打印原始 `bugs.json` 有效负载而不是格式化的发现 |
| `--timeout <minutes>` | 等待审查完成的最大分钟数。默认为 30            |

运行 `claude ultrareview` 需要与 `/code-review ultra` 相同的身份验证和使用额度配置。当审查完成时（无论是否有发现）子命令以代码 0 退出，当审查无法启动、远程会话出错或超时时以代码 1 退出，当使用 Ctrl-C 中断时以代码 130 退出。如果您中断子命令，远程审查会继续运行；按照打印到 stderr 的会话 URL 在浏览器中观看它。

对于 GitHub 拉取请求上的自动审查，[Code Review](/docs/zh-CN/code-review) 直接与您的存储库集成，并将发现作为内联 PR 注释发布，无需 CLI 步骤。

<h2 id="how-ultrareview-compares-to-/code-review-and-/review">
  ultrareview 与 /code-review 和 /review 的比较
</h2>

所有三个命令都审查代码，但它们针对工作流的不同阶段。

|      | `/code-review` | `/review <pr>`      | `/code-review ultra`            |
| ---- | -------------- | ------------------- | ------------------------------- |
| 目标   | 您的工作差异         | GitHub pull request | 您的工作差异或 pull request            |
| 运行位置 | 在您的会话中本地运行     | 在您的会话中本地运行          | 在云沙箱中远程运行                       |
| 深度   | 随着 effort 参数扩展 | 会话的 effort 级别的单次审查  | 具有独立验证的多代理队列                    |
| 持续时间 | 几秒到几分钟         | 几秒到几分钟              | 大约 5 到 10 分钟                    |
| 成本   | 计入正常使用量        | 计入正常使用量             | 免费运行，然后大约 \$5 到 \$20 每次审查作为使用额度 |
| 最适合  | 迭代时的快速反馈       | 在批准前审查团队成员的 PR      | 合并前对重大更改的信心                     |

使用 `/code-review` 获得工作时的快速反馈。使用 `/review <pr>` 查看 pull request，就像您在批准前所做的那样。在合并重大更改前使用 `/code-review ultra`，当您想要更深入的审查来捕捉单次审查可能遗漏的问题时。

<h2 id="related-resources">
  相关资源
</h2>

* [Claude Code 网络版](/docs/zh-CN/claude-code-on-the-web)：了解远程会话和云沙箱如何工作
* [使用 ultraplan 规划复杂更改](/docs/zh-CN/ultraplan)：ultrareview 的规划对应物，用于前期设计工作
* [有效管理成本](/docs/zh-CN/costs)：跟踪使用情况并设置支出限制
