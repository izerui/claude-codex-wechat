> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 托管 Agent SDK

> 在生产环境中部署 Agent SDK：子进程架构、会话持久化、扩展、可观测性和 Docker、Kubernetes 及沙箱提供商的多租户隔离。

Agent SDK 生成并监督一个拥有 shell、工作目录和磁盘上会话文件的 `claude` CLI 子进程。托管它不像托管无状态 API 包装器。每个运行中的代理都是一个与本地状态绑定的长期进程，这决定了你如何分配资源、持久化会话以及跨租户扩展。

本页涵盖在你自己的基础设施上自托管：理解[子进程模型](#the-subprocess-model)、[选择会话模式](#choose-a-session-pattern)、[配置容器](#provision-the-container)和[处理生产问题](#handle-production-concerns)，如持久化、可观测性、身份验证和多租户隔离。有关可部署的 Dockerfile 和 Kubernetes 清单，请参阅[托管指南](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk/hosting)。

如果你不需要基础设施控制、自定义隔离或自己的数据平面，请考虑改用[托管代理](https://platform.claude.com/docs/zh-CN/managed-agents/overview)：一个托管的 REST API，其中 Anthropic 运行代理和沙箱，因此你的应用程序发送事件并流回结果，无需操作任何托管基础设施。

<Info>
  有关超越基本 sandboxing 的安全加固（包括网络控制、凭证管理和隔离选项），请参阅 [Secure Deployment](/docs/zh-CN/agent-sdk/secure-deployment)。
</Info>

<h2 id="the-subprocess-model">
  子进程模型
</h2>

此页面上的每个托管决策都遵循 SDK 如何运行代理的方式。当您的代码调用 `query()` 时，SDK 会生成一个单独的 `claude` CLI 进程，并通过 stdio 与其通信。该子进程拥有 shell、工作目录和本地磁盘上的 JSONL 会话记录。

<img src="https://mintcdn.com/claude-code/ikqp3_70mqIahteV/images/agent-sdk/hosting-subprocess.svg?fit=max&auto=format&n=ikqp3_70mqIahteV&q=85&s=9dac857ca9d3b1410c3734900c386004" alt="请求流：客户端到您的应用，应用在容器内通过 stdio 生成 claude CLI 子进程；子进程写入本地磁盘并通过 HTTPS 调用 api.anthropic.com" width="920" height="220" data-path="images/agent-sdk/hosting-subprocess.svg" />

一个代理会话映射到一个子进程。运行 N 个并发会话意味着 N 个子进程，每个都有自己的进程树和记录文件。默认情况下，它们都继承您应用程序的工作目录，因此当会话需要单独的文件系统时，在每个 `query()` 调用上传递 `cwd`：

<CodeGroup>
  ```typescript TypeScript theme={null}
  query({ prompt, options: { cwd: "/work/session-a" } })
  ```

  ```python Python theme={null}
  query(prompt=prompt, options=ClaudeAgentOptions(cwd="/work/session-a"))
  ```
</CodeGroup>

<h3 id="state-that-lives-on-local-disk">
  存储在本地磁盘上的状态
</h3>

三种代理状态默认存储在容器的文件系统上。它们都不会在容器重启、缩减或移动到不同节点时保留。

| 状态               | 默认位置                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| 会话记录             | `~/.claude/projects/`，或如果设置了 `CLAUDE_CONFIG_DIR`，则为其下的 `projects/` 目录 |
| `CLAUDE.md` 内存文件 | 用户层级为 `~/.claude/CLAUDE.md`，项目层级为会话的工作目录                              |
| 工作目录工件           | 会话的工作目录                                                               |

要在主机之间持久化记录，请配置 [`SessionStore` 适配器](/docs/zh-CN/agent-sdk/session-storage)。内存文件和其他工作目录工件需要自己的存储策略，例如挂载卷或对象存储同步。

有关会话、恢复和分叉在 API 级别如何工作的信息，请参阅 [Sessions](/docs/zh-CN/agent-sdk/sessions)。

<h2 id="choose-a-session-pattern">
  选择会话模式
</h2>

这四种模式涵盖会话生命周期：容器相对于它所服务的会话的生存时间。关于容器运行的位置，[托管指南](https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/07_Hosting_the_agent.ipynb)提供了[可部署代码](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk/hosting)，用于本地 Docker、Modal 和 Kubernetes。在此选择会话模式，并从指南中选择部署目标。

<h3 id="ephemeral-sessions">
  临时会话
</h3>

为每个用户任务创建一个容器，任务完成时销毁它。最适合一次性任务。用户可能仍然可以在任务完成时与 AI 交互，但一旦完成，容器就会被销毁。

示例工作负载包括 bug 调查和修复、发票和收据提取、文档翻译和媒体转换。

容器运行一个一次性入口点，该入口点调用 SDK 并退出。下面的示例显示了一个最小的 TypeScript 版本。将其保存为 `entrypoint.mts` 或在 `package.json` 中设置 `"type": "module"`，以便顶级 `await` 可用。

```typescript theme={null}
import { query } from "@anthropic-ai/claude-agent-sdk";

const prompt = process.env.TASK_PROMPT!;
for await (const message of query({ prompt, options: { maxTurns: 20 } })) {
  console.log(message);
}
```

<h3 id="long-running-sessions">
  长运行会话
</h3>

运行持久容器实例，通常每个容器托管多个 SDK 进程，以服务持续工作。最适合采取自主行动、提供内容或处理高容量消息流的代理。

示例工作负载包括对传入邮件进行分类和响应的电子邮件代理、通过容器端口托管每个用户可编辑站点的站点构建器，以及处理来自 Slack 等平台的连续流量的聊天机器人。

容器公开 HTTP 或 WebSocket 端点，并将每个活跃会话映射到一个长期查询及其后面的子进程。在 TypeScript 中，使用 [`streamInput()`](/docs/zh-CN/agent-sdk/typescript#query-object) 向活跃会话添加轮次，使用 [`startup()`](/docs/zh-CN/agent-sdk/typescript#startup) 在传入流量前预热子进程。在 Python 中，使用 [`ClaudeSDKClient`](/docs/zh-CN/agent-sdk/python#claudesdkclient) 在多个轮次中保持会话打开。调整容器大小，使其能够在内存中容纳最大并发会话数。

<h3 id="hybrid-sessions">
  混合会话
</h3>

临时容器在启动时从 [`SessionStore`](/docs/zh-CN/agent-sdk/session-storage) 进行补充，并将更新持久化回去。最适合跨越许多交互但在交互之间处于空闲状态的会话。容器在空闲期间关闭，当用户返回时重新启动。

示例工作负载包括具有间歇性检查的个人项目管理器、暂停和恢复数小时的深度研究，以及跨交互加载票证历史的客户支持代理。

根据您期望用户返回的频率调整提供商的空闲超时。在没有配置 `SessionStore` 的情况下关闭容器会丢失其转录，因此存储对于此模式是必需的，而不是可选的。

该模式的关键在于通过 ID 恢复会话，并附加共享存储：

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query, type SessionStore } from "@anthropic-ai/claude-agent-sdk";

  declare const userInput: string;
  declare const sessionId: string;          // looked up from your database by user
  declare const sessionStore: SessionStore; // S3, Redis, Postgres, or your own adapter

  for await (const message of query({
    prompt: userInput,
    options: { resume: sessionId, sessionStore },
  })) {
    // ...
  }
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ClaudeAgentOptions

  async for message in query(
      prompt=user_input,
      options=ClaudeAgentOptions(
          resume=session_id,            # looked up from your database by user
          session_store=session_store,  # S3, Redis, Postgres, or your own adapter
      ),
  ):
      ...
  ```
</CodeGroup>

有关完整的 `SessionStore` 接口和参考适配器，请参阅[会话存储](/docs/zh-CN/agent-sdk/session-storage)。

<h3 id="multi-agent-container">
  多代理容器
</h3>

在一个容器内运行多个 SDK 子进程。最适合必须紧密协作的代理，例如多代理模拟，其中代理在共享环境中相互交互。

为每个代理提供自己的工作目录，以便它们不会相互覆盖文件，并隔离设置加载，以便每个代理的 `CLAUDE.md` 文件不会泄漏到其他代理。有关特定选项，请参阅[多租户隔离](#multi-tenant-isolation)。

<h2 id="provision-the-container">
  配置容器
</h2>

<h3 id="container-based-sandboxing">
  基于容器的沙箱
</h3>

在沙箱容器内运行 SDK，以实现进程隔离、资源限制、网络控制和临时文件系统。多个提供商专门提供适合 Agent SDK 模型的沙箱容器环境。

选择提供商时需要回答的问题：

* **谁运行沙箱**：沙箱即服务提供商为您运营基础设施，而自托管选项则为您提供在自己的基础设施上运行的软件。
* **冷启动延迟**：从"创建沙箱"到"准备好接受第一个请求"需要多长时间。临时模式需要亚秒级启动。长期运行模式可以容忍更长的启动时间。
* **持久存储**：提供商是否提供持久卷或仅提供临时磁盘。混合模式需要在沙箱内或沙箱旁边的某处进行持久存储。
* **定价模型**：按秒、按请求或按小时固定计费。按秒计费适合突发的临时工作负载。按小时计费适合长期运行的会话。
* **网络**：支持自定义出站规则、出站代理和私有 VPC 对等互联，用于受管制的环境。

要评估的提供商：

* [Modal Sandbox](https://modal.com/docs/guide/sandbox)，包含[演示实现](https://modal.com/docs/examples/claude-slack-gif-creator)
* [Cloudflare Sandboxes](https://github.com/cloudflare/sandbox-sdk)
* [Daytona](https://www.daytona.io/)
* [E2B](https://e2b.dev/)
* [Fly Machines](https://fly.io/docs/machines/)
* [Vercel Sandbox](https://vercel.com/docs/functions/sandbox)

有关自托管选项（如 Docker、gVisor 和 Firecracker）以及详细的隔离配置，请参阅 [Isolation Technologies](/docs/zh-CN/agent-sdk/secure-deployment#isolation-technologies)。

<h3 id="runtime-dependencies">
  运行时依赖
</h3>

容器只需要您的 SDK 的语言运行时：

* Python SDK 需要 Python 3.10+，或 TypeScript SDK 需要 Node.js 18+
* 两个 SDK 包都为主机平台捆绑了本机 Claude Code 二进制文件，因此不需要为生成的 CLI 单独安装 Claude Code 或 Node.js

捆绑的二进制文件被固定到 SDK 包版本，因此更新 SDK 是更新 CLI 的方式。SDK 遵循 semver：持续采用补丁版本，并在采用次要版本之前查看 [TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md) 或 [Python](https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md) 更改日志。

<h3 id="resources">
  资源
</h3>

对于新启动的实例，每个代理 1 GiB RAM、5 GiB 磁盘和 1 个 CPU 是一个合理的起点。内存使用量随着会话长度和工具活动而增长，因此应根据您实际需要的会话长度和并发性进行调整，而不是根据空闲基线。有关如何计算每个主机的代理数，请参阅[扩展和并发](#scaling-and-concurrency)。

<h3 id="network">
  网络
</h3>

SDK 需要对 `api.anthropic.com` 的出站 HTTPS，或在 Amazon Bedrock 或 Google Cloud 的 Agent Platform 上运行时对您的提供商的区域端点的出站 HTTPS。如果您的代理使用 [MCP servers](/docs/zh-CN/agent-sdk/mcp) 或外部工具，它们还需要对这些端点的出站访问。对于生产环境，通过强制执行域名允许列表、注入凭证和记录请求的出站代理路由出站流量。有关完整模式，请参阅[安全部署](/docs/zh-CN/agent-sdk/secure-deployment)。

对于入站流量，在容器上公开 HTTP 或 WebSocket 端口。您的应用程序在该端口上处理客户端请求并在内部调用 SDK；子进程本身不在网络上侦听。

<h2 id="handle-production-concerns">
  处理生产环境问题
</h2>

在部署自托管代理之前，需要完成这些决策。

<h3 id="session-and-state-persistence">
  会话和状态持久化
</h3>

默认本地磁盘在重启、缩减或移动到不同节点时会丢失。对于用户期望恢复的任何会话，使用 [`SessionStore` 适配器](/docs/zh-CN/agent-sdk/session-storage)将记录副本镜像到持久存储。查看[参考实现](/docs/zh-CN/agent-sdk/session-storage#reference-implementations)了解 S3、Redis 和 Postgres 适配器，以及用于您自己实现的一致性测试套件。

关于 `SessionStore` 行为需要了解三件事：

* **仅记录**：`SessionStore` 镜像记录，不镜像 `CLAUDE.md` 内存文件或其他工作目录工件。挂载共享卷或单独同步这些文件。
* **镜像，不替换**：子进程首先写入本地磁盘，存储接收每个批次的副本。本地写入保持权威性。
* **`mirror_error` 消息**：存储拒绝的批次最多重试三次，每次重试前有短暂的退避；超时的调用不会重试。如果批次仍然失败，SDK 会丢弃它，发出 `{ type: "system", subtype: "mirror_error" }` 消息，并继续查询。如果存储持久性很重要，请对这些消息进行告警。

<h3 id="observability">
  可观测性
</h3>

Agent SDK 代理是长生命周期的进程，在许多 API 往返中生成工具调用。没有遥测，您无法看到哪些工具运行、花费了多长时间或会话在哪里停滞。

SDK 从环境继承 OpenTelemetry 配置。在容器或编排器级别设置 OTEL 环境变量，以便每个 `query()` 调用都将跨度、指标和日志事件导出到您的收集器。下面的示例为所有三个信号启用 OTLP 导出。`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` 仅对跟踪是必需的；如果您仅导出指标和日志，请省略它。

```bash title=".env' theme={null}
CLAUDE_CODE_ENABLE_TELEMETRY=1
CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector.example.com:4318
```

默认情况下，导出中不包含提示文本和工具输入。查看[控制导出中的敏感数据](/docs/zh-CN/agent-sdk/observability#control-sensitive-data-in-exports)了解选择加入标志，以及[可观测性](/docs/zh-CN/agent-sdk/observability)了解完整的信号目录。

<h3 id="auth-and-secrets">
  身份验证和密钥
</h3>

托管时有三个身份验证问题很重要：

* **Anthropic API**：子进程从其环境读取 `ANTHROPIC_API_KEY`。从您的密钥管理器提供它，或设置 `ANTHROPIC_BASE_URL` 通过在容器外注入密钥的代理路由模型调用。查看[凭证管理](/docs/zh-CN/agent-sdk/secure-deployment#credential-management)了解代理模式，以及[SDK 概述](/docs/zh-CN/agent-sdk/overview#get-started)了解支持的身份验证方法。
* **入站**：在代理容器前面的网关处放置身份验证。代理应接收预先认证的请求，不应是验证用户令牌的组件。
* **出站工具**：将工具凭证保留在代理环境之外。通过代理路由出站调用，该代理在请求离开容器后注入 API 密钥。代理进行调用；代理添加凭证。

<h3 id="scaling-and-concurrency">
  扩展和并发
</h3>

每个会话在其自己的子进程中运行，因此主机上的并发受其 RAM 可以容纳的子进程数量限制。

使用此公式调整每个主机的大小：

```text theme={null}
每个主机的代理数 = (主机 RAM - 开销) / (每个会话 RAM 上限)
```

通过在您的目标长度下运行代表性会话并在您的预期工具负载下记录峰值 RSS 来测量每个会话的上限。[资源](#resources)中的 1 GiB 起点是下限，不是上限。

水平扩展路由取决于您的模式。对于长运行会话，其中容器持有许多会话，在负载均衡器后面运行容器池，并使用 `sessionId` 上的一致性哈希将每个会话固定到一个容器。固定会话继续命中同一容器，因此同一运行的子进程，直到它被驱逐或容器重启。

来自单个会话的大量并发[子代理](/docs/zh-CN/agent-sdk/subagents)扇出可能会触及 API 速率限制。将工作分解为较小的批次，而不是发出一个宽分派。

<h3 id="cost">
  成本
</h3>

Anthropic 令牌成本通常比容器基础设施成本高一个数量级或更多。最小配置的容器运行成本大约为每小时 \$0.05，而单个长代理会话可能花费数美元的令牌。查看[成本跟踪](/docs/zh-CN/agent-sdk/cost-tracking)了解每个会话的令牌计费。

<h3 id="multi-tenant-isolation">
  多租户隔离
</h3>

默认 SDK 行为从文件系统读取设置和 `CLAUDE.md` 内存文件。在为多个租户服务的共享容器中，这些文件可能会将一个租户的上下文泄露到另一个租户的会话中。

要在共享容器内隔离租户：

* 在 TypeScript 中传递 `settingSources: []` 或在 Python 中传递 `setting_sources=[]`，以便不加载文件系统设置。
* 在 `env` 中设置 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`。[自动内存](/docs/zh-CN/memory#auto-memory)在 `~/.claude/projects/<project>/memory/` 加载到系统提示中，无论 `settingSources` 如何。查看[settingSources 不控制的内容](/docs/zh-CN/agent-sdk/claude-code-features#what-settingsources-does-not-control)了解无条件加载的其他输入。
* 将 `CLAUDE_CONFIG_DIR` 指向每个租户目录，以便租户不共享 `~/.claude.json` 全局配置。
* 使用每个租户的工作目录。在每个 `query()` 调用上显式传递 `cwd`。
* 在您的代理处应用每个租户的出站规则，例如不同的出站 IP、凭证或域名单，以便受损的租户无法通过另一个租户的出站策略泄露数据。

下面的示例将四个 SDK 级别的选项应用在一起。构造 `tenantDir` 和 `configDir`，以便每个租户获得其他租户无法读取的路径。在 TypeScript 中，`env` 替换子进程环境，因此展开 `...process.env` 以保持继承的变量，如 `PATH` 和 `ANTHROPIC_API_KEY`。在 Python 中，`env` 合并在继承的环境之上。

<CodeGroup>
  ```typescript TypeScript theme={null}
  import { query } from "@anthropic-ai/claude-agent-sdk";

  declare const prompt: string;
  declare const tenantDir: string;
  declare const configDir: string;

  for await (const message of query({
    prompt,
    options: {
      cwd: tenantDir,
      settingSources: [],
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: configDir,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      },
    },
  })) {
    // ...
  }
  ```

  ```python Python theme={null}
  from claude_agent_sdk import query, ClaudeAgentOptions

  async for message in query(
      prompt=prompt,
      options=ClaudeAgentOptions(
          cwd=tenant_dir,
          setting_sources=[],
          env={
              "CLAUDE_CONFIG_DIR": config_dir,
              "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1",
          },
      ),
  ):
      ...
  ```
</CodeGroup>

有关每个租户的网络控制，请查看[安全部署](/docs/zh-CN/agent-sdk/secure-deployment)。

<h2 id="known-limitations">
  已知限制
</h2>

在您的部署设计中规划这些限制。

| 限制                  | 解决方案                                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 没有顶级会话超时            | 会话不会自动超时。在 `Options` 中设置 `maxTurns` 以限制代理在停止前进行多少次工具使用往返。                                                                                                                               |
| 长会话中的内存增长           | 限制会话长度或定期回收子进程。请参阅 [扩展和并发](#scaling-and-concurrency)。                                                                                                                                   |
| 大规模并行子代理扇出可能会触发速率限制 | 将工作分解为较小的批次，而不是发出一个宽泛的调度。                                                                                                                                                               |
| 没有每个子代理的挂钟截止时间      | 使用 `AgentDefinition` 中的 `maxTurns` 限制每个 [subagent](/docs/zh-CN/agent-sdk/subagents)。仅对后台子代理，`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` 设置一个停滞监视程序，当 `run_in_background` 子代理停止产生输出时触发；它不是总运行时截止时间。 |

<h2 id="next-steps">
  后续步骤
</h2>

* [Hosting cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/07_Hosting_the_agent.ipynb)：包含 Docker、Modal 和 Kubernetes 的[可部署代码](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk/hosting)的笔记本演练。
* [Session storage](/docs/zh-CN/agent-sdk/session-storage)：使用 `SessionStore` 适配器在主机间持久化记录。
* [Observability](/docs/zh-CN/agent-sdk/observability)：将 OTEL 跟踪、指标和日志导出到您的收集器。
* [Secure deployment](/docs/zh-CN/agent-sdk/secure-deployment)：网络控制、凭证管理和隔离加固。
* [Cost tracking](/docs/zh-CN/agent-sdk/cost-tracking)：按会话的令牌和成本计费。
