> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 监控

> 了解如何为 Claude Code 启用和配置 OpenTelemetry。

通过 OpenTelemetry (OTel) 导出遥测数据，跨组织跟踪 Claude Code 使用情况、成本和工具活动。Claude Code 通过标准指标协议导出指标作为时间序列数据，通过日志/事件协议导出事件，以及可选地通过 [traces 协议](#traces-beta) 导出分布式跟踪。配置您的指标、日志和跟踪后端以满足您的监控要求。

<h2 id="quick-start">
  快速开始
</h2>

使用环境变量配置 OpenTelemetry：

```bash theme={null}
# 1. 启用遥测
export CLAUDE_CODE_ENABLE_TELEMETRY=1

# 2. 选择导出器（两者都是可选的 - 仅配置您需要的）
export OTEL_METRICS_EXPORTER=otlp       # 选项：otlp、prometheus、console、none
export OTEL_LOGS_EXPORTER=otlp          # 选项：otlp、console、none

# 3. 配置 OTLP 端点（用于 OTLP 导出器）
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# 4. 设置身份验证（如果需要）
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer your-token"

# 5. 用于调试：减少导出间隔
export OTEL_METRIC_EXPORT_INTERVAL=10000  # 10 秒（默认：60000ms）
export OTEL_LOGS_EXPORT_INTERVAL=5000     # 5 秒（默认：5000ms）

# 6. 运行 Claude Code
claude
```

<Note>
  默认导出间隔为指标 60 秒和日志 5 秒。在设置期间，您可能希望使用更短的间隔用于调试目的。请记住为生产使用重置这些值。
</Note>

有关完整配置选项，请参阅 [OpenTelemetry 规范](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/protocol/exporter.md#configuration-options)。

<h2 id="administrator-configuration">
  管理员配置
</h2>

管理员可以通过 [托管设置文件](/docs/zh-CN/settings#settings-files) 为所有用户配置 OpenTelemetry 设置。这允许在整个组织中集中控制遥测设置。有关设置如何应用的更多信息，请参阅 [设置优先级](/docs/zh-CN/settings#settings-precedence)。

示例托管设置配置：

```json theme={null}
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.example.com:4317",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer example-token"
  }
}
```

<Note>
  托管设置可以通过 MDM（移动设备管理）或其他设备管理解决方案分发。在托管设置文件中定义的环境变量具有高优先级，用户无法覆盖。
</Note>

Claude Code 不会将 `OTEL_*` 环境变量传递给它生成的子进程，包括 Bash 工具、hooks、MCP 服务器和语言服务器。通过 Bash 工具运行的已进行 OpenTelemetry 检测的应用程序不会继承 Claude Code 的导出器端点或标头，因此如果该应用程序需要导出自己的遥测，请直接在命令中设置这些变量。

<h2 id="configuration-details">
  配置详情
</h2>

<h3 id="common-configuration-variables">
  常见配置变量
</h3>

| 环境变量                                                | 描述                                                                                                                                                                                                        | 示例值                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `CLAUDE_CODE_ENABLE_TELEMETRY`                      | 启用遥测收集（必需）                                                                                                                                                                                                | `1`                                                                   |
| `OTEL_METRICS_EXPORTER`                             | 指标导出器类型，逗号分隔。使用 `none` 禁用                                                                                                                                                                                 | `console`、`otlp`、`prometheus`、`none`                                  |
| `OTEL_LOGS_EXPORTER`                                | 日志/事件导出器类型，逗号分隔。使用 `none` 禁用                                                                                                                                                                              | `console`、`otlp`、`none`                                               |
| `OTEL_EXPORTER_OTLP_PROTOCOL`                       | OTLP 导出器的协议，适用于所有信号                                                                                                                                                                                       | `grpc`、`http/json`、`http/protobuf`                                    |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                       | 所有信号的 OTLP 收集器端点                                                                                                                                                                                          | `http://localhost:4317`                                               |
| `OTEL_EXPORTER_OTLP_METRICS_PROTOCOL`               | 指标协议，覆盖常规设置                                                                                                                                                                                               | `grpc`、`http/json`、`http/protobuf`                                    |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`               | OTLP 指标端点，覆盖常规设置                                                                                                                                                                                          | `http://localhost:4318/v1/metrics`                                    |
| `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL`                  | 日志协议，覆盖常规设置                                                                                                                                                                                               | `grpc`、`http/json`、`http/protobuf`                                    |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`                  | OTLP 日志端点，覆盖常规设置                                                                                                                                                                                          | `http://localhost:4318/v1/logs`                                       |
| `OTEL_EXPORTER_OTLP_HEADERS`                        | OTLP 的身份验证标头                                                                                                                                                                                              | `Authorization=Bearer token`                                          |
| `OTEL_METRIC_EXPORT_INTERVAL`                       | 导出间隔（毫秒）（默认：60000）                                                                                                                                                                                        | `5000`、`60000`                                                        |
| `OTEL_LOGS_EXPORT_INTERVAL`                         | 日志导出间隔（毫秒）（默认：5000）                                                                                                                                                                                       | `1000`、`10000`                                                        |
| `OTEL_LOG_USER_PROMPTS`                             | 启用用户提示内容的日志记录（默认：禁用）                                                                                                                                                                                      | `1` 启用                                                                |
| `OTEL_LOG_ASSISTANT_RESPONSES`                      | 启用在 `assistant_response` 事件上记录助手响应文本（默认：禁用）。未设置时，回退到 `OTEL_LOG_USER_PROMPTS` 的值。需要 Claude Code v2.1.193 或更高版本                                                                                             | `1` 启用，`0` 保持编辑                                                       |
| `OTEL_LOG_TOOL_DETAILS`                             | 启用在工具事件和 trace span 属性中记录工具参数和输入参数：Bash 命令、MCP 服务器和工具名称、技能名称和工具输入。还在 `user_prompt` 事件上启用自定义、插件和 MCP 命令名称（默认：禁用）                                                                                           | `1` 启用                                                                |
| `OTEL_LOG_TOOL_CONTENT`                             | 启用在 span 事件中记录工具输入和输出内容（默认：禁用）。需要 [tracing](#traces-beta)。内容在 60 KB 处截断                                                                                                                                   | `1` 启用                                                                |
| `OTEL_LOG_RAW_API_BODIES`                           | 将完整的 Anthropic Messages API 请求和响应 JSON 作为 `api_request_body` / `api_response_body` 日志事件发出（默认：禁用）。主体包括整个对话历史。启用此选项意味着同意 `OTEL_LOG_USER_PROMPTS`、`OTEL_LOG_TOOL_DETAILS` 和 `OTEL_LOG_TOOL_CONTENT` 会揭示的所有内容 | `1` 用于在 60 KB 处截断的内联主体，或 `file:<dir>` 用于磁盘上的未截断主体，事件中带有 `body_ref` 指针 |
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` | 指标时间性偏好（默认：`delta`）。如果您的后端期望累积时间性，请设置为 `cumulative`                                                                                                                                                       | `delta`、`cumulative`                                                  |
| `CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS`       | 刷新动态标头的间隔（默认：1740000ms / 29 分钟）                                                                                                                                                                           | `900000`                                                              |

<h3 id="mtls-authentication">
  mTLS 身份验证
</h3>

您为 OTLP 导出器配置客户端证书的方式取决于用于该信号的 OTLP 协议，通过 `OTEL_EXPORTER_OTLP_PROTOCOL` 或每个信号的覆盖设置。相同的配置适用于指标、日志和跟踪。

| 协议                          | 客户端证书变量                                                                                                                                           | 信任收集器的 CA                        |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------- |
| `http/protobuf`、`http/json` | `CLAUDE_CODE_CLIENT_CERT`、`CLAUDE_CODE_CLIENT_KEY` 和可选的 `CLAUDE_CODE_CLIENT_KEY_PASSPHRASE`。请参阅 [网络配置](/docs/zh-CN/network-config#mtls-authentication) | `NODE_EXTRA_CA_CERTS`            |
| `grpc`                      | `OTEL_EXPORTER_OTLP_CLIENT_KEY` 和 `OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE`，或每个信号的变体，例如 `OTEL_EXPORTER_OTLP_METRICS_CLIENT_KEY` 以为每个信号使用不同的证书       | `OTEL_EXPORTER_OTLP_CERTIFICATE` |

对于 `grpc`，OpenTelemetry SDK 直接读取标准 OTLP 变量，因此设置每个信号指标变量的现有配置继续工作。

<h3 id="metrics-cardinality-control">
  指标基数控制
</h3>

以下环境变量控制指标中包含哪些属性以管理基数：

| 环境变量                                       | 描述                                              | 默认值     | 禁用示例    |
| ------------------------------------------ | ----------------------------------------------- | ------- | ------- |
| `OTEL_METRICS_INCLUDE_SESSION_ID`          | 在指标中包含 session.id 属性                            | `true`  | `false` |
| `OTEL_METRICS_INCLUDE_VERSION`             | 在指标中包含 app.version 属性                           | `false` | `true`  |
| `OTEL_METRICS_INCLUDE_ACCOUNT_UUID`        | 在指标中包含 user.account\_uuid 和 user.account\_id 属性 | `true`  | `false` |
| `OTEL_METRICS_INCLUDE_ENTRYPOINT`          | 在指标中包含 app.entrypoint 属性                        | `false` | `true`  |
| `OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES` | 将 `OTEL_RESOURCE_ATTRIBUTES` 中的键作为属性包含在指标数据点上   | `true`  | `false` |

这些变量有助于控制指标的基数，这会影响指标后端中的存储要求和查询性能。较低的基数通常意味着更好的性能和更低的存储成本，但分析的数据粒度较低。

<h3 id="traces-beta">
  Traces（测试版）
</h3>

分布式跟踪导出 span，将每个用户提示链接到它触发的 API 请求和工具执行，因此您可以在跟踪后端中将完整请求视为单个 trace。

跟踪默认关闭。要启用它，请同时设置 `CLAUDE_CODE_ENABLE_TELEMETRY=1` 和 `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`，然后设置 `OTEL_TRACES_EXPORTER` 以选择 span 的发送位置。Traces 重用 [常见 OTLP 配置](#common-configuration-variables) 用于端点、协议、标头和 [mTLS](#mtls-authentication)。

| 环境变量                                  | 描述                                                  | 示例值                                |
| ------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` | 启用 span 跟踪（必需）。也接受 `ENABLE_ENHANCED_TELEMETRY_BETA` | `1`                                |
| `OTEL_TRACES_EXPORTER`                | Traces 导出器类型，逗号分隔。使用 `none` 禁用                      | `console`、`otlp`、`none`            |
| `OTEL_EXPORTER_OTLP_TRACES_PROTOCOL`  | Traces 协议，覆盖 `OTEL_EXPORTER_OTLP_PROTOCOL`          | `grpc`、`http/json`、`http/protobuf` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | OTLP traces 端点，覆盖 `OTEL_EXPORTER_OTLP_ENDPOINT`     | `http://localhost:4318/v1/traces`  |
| `OTEL_TRACES_EXPORT_INTERVAL`         | Span 批量导出间隔（毫秒）（默认：5000）                            | `1000`、`10000`                     |

Spans 默认编辑用户提示文本、工具输入详情和工具内容。设置 `OTEL_LOG_USER_PROMPTS=1`、`OTEL_LOG_TOOL_DETAILS=1` 和 `OTEL_LOG_TOOL_CONTENT=1` 以包含它们。

当跟踪处于活动状态时，Bash 和 PowerShell 子进程会自动继承包含活动工具执行 span 的 W3C trace 上下文的 `TRACEPARENT` 环境变量。这让任何读取 `TRACEPARENT` 的子进程可以在同一 trace 下将其自己的 span 作为父级，通过 Claude 运行的脚本和命令启用端到端分布式跟踪。

当跟踪处于活动状态时，如果 Claude Code 直接连接到 Anthropic API，每个模型请求都会携带一个 W3C `traceparent` 标头，设置为 `claude_code.llm_request` span 的上下文，API 的 `traceresponse` 标头被记录为 span 链接。这些一起通过任何兼容的中介将 Claude Code 的客户端 span 连接到服务器端跟踪。标头不会发送给第三方提供商。

默认情况下，模型和 HTTP MCP 请求上的 `traceparent` 标头仅在 `ANTHROPIC_BASE_URL` 未设置或指向 Anthropic API 时发送，因为某些代理会拒绝无法识别的标头。子进程 `TRACEPARENT` 变量由相同的开关控制以保持一致性。如果您通过自定义 `ANTHROPIC_BASE_URL` 代理运行 Claude Code 并希望传播 trace 上下文，请设置 `CLAUDE_CODE_PROPAGATE_TRACEPARENT=1`。

在 Agent SDK 和使用 `-p` 启动的非交互式会话中，Claude Code 还在启动每个交互 span 时从其自己的环境中读取 `TRACEPARENT` 和 `TRACESTATE`。这让嵌入过程可以将其活动的 W3C trace 上下文传递到子进程中，以便 Claude Code 的 span 显示为调用者分布式跟踪的子级。交互式会话忽略入站 `TRACEPARENT` 以避免意外继承来自 CI 或容器环境的环境值。

<h4 id="span-hierarchy">
  Span 层次结构
</h4>

每个用户提示启动一个 `claude_code.interaction` 根 span。API 调用、工具调用和 hook 执行被记录为其子级。工具 span 有两个自己的子 span：一个用于等待权限决策所花费的时间，一个用于执行本身。当 Agent 工具或旧版 Task 工具生成子代理时，子代理的 API 和工具 span 嵌套在父级的 `claude_code.tool` span 下。

```text theme={null}
claude_code.interaction
├── claude_code.llm_request
├── claude_code.hook                    (需要详细的测试版跟踪)
└── claude_code.tool
    ├── claude_code.tool.blocked_on_user
    ├── claude_code.tool.execution
    └── (Agent 工具) 子代理 claude_code.llm_request / claude_code.tool span
```

在 Agent SDK 和 `claude -p` 会话中，当在环境中设置 `TRACEPARENT` 时，`claude_code.interaction` 本身成为调用者 span 的子级。

<h4 id="span-attributes">
  Span 属性
</h4>

每个 span 都携带 [标准属性](#standard-attributes) 加上与其名称匹配的 `span.type` 属性。下表列出了在每个 span 上设置的其他属性。`llm_request`、`tool.execution` 和 `hook` span 在记录失败时设置 OpenTelemetry 状态 `ERROR`；其他 span 始终以状态 `UNSET` 结束。

**`claude_code.interaction`**

| 属性                        | 描述                               | 门控条件                    |
| ------------------------- | -------------------------------- | ----------------------- |
| `user_prompt`             | 提示文本。除非设置了门控条件，否则值为 `<REDACTED>` | `OTEL_LOG_USER_PROMPTS` |
| `user_prompt_length`      | 提示长度（字符数）                        |                         |
| `interaction.sequence`    | 此会话中交互的基于 1 的计数器                 |                         |
| `interaction.duration_ms` | 轮次的实际时钟持续时间                      |                         |

**`claude_code.llm_request`**

| 属性                               | 描述                                                                                                  | 门控条件                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- |
| `model`                          | 模型标识符                                                                                               |                         |
| `gen_ai.system`                  | 始终为 `anthropic`。OpenTelemetry GenAI 语义约定                                                            |                         |
| `gen_ai.request.model`           | 与 `model` 相同的值。OpenTelemetry GenAI 语义约定                                                             |                         |
| `query_source`                   | 发出请求的子系统，例如 `repl_main_thread` 或子代理名称                                                               |                         |
| `agent_id`                       | 发出请求的子代理或队友的标识符。在主会话中不存在                                                                            |                         |
| `parent_agent_id`                | 生成此代理的代理的标识符。对于主会话和直接从其生成的代理不存在                                                                     |                         |
| `workflow.run_id`                | [Workflow](/docs/zh-CN/workflows) 工具运行的运行标识符，前缀为 `wf_`，生成此代理。对于不是由工作流生成的代理不存在                            |                         |
| `workflow.name`                  | 生成此代理的工作流的名称。用户编写的名称被替换为 `custom`，除非设置了门控条件                                                         | `OTEL_LOG_TOOL_DETAILS` |
| `speed`                          | `fast` 或 `normal`                                                                                   |                         |
| `llm_request.context`            | `interaction`、`tool` 或 `standalone`，取决于父 span                                                       |                         |
| `duration_ms`                    | 包括重试的实际时钟持续时间                                                                                       |                         |
| `ttft_ms`                        | 首个令牌的时间（毫秒）                                                                                         |                         |
| `input_tokens`                   | API 使用块中的输入令牌计数                                                                                     |                         |
| `output_tokens`                  | 输出令牌计数                                                                                              |                         |
| `cache_read_tokens`              | 从提示缓存读取的令牌                                                                                          |                         |
| `cache_creation_tokens`          | 写入提示缓存的令牌                                                                                           |                         |
| `request_id`                     | 来自 `request-id` 响应标头的 Anthropic API 请求 ID                                                           |                         |
| `gen_ai.response.id`             | 与 `request_id` 相同的值。OpenTelemetry GenAI 语义约定                                                        |                         |
| `client_request_id`              | 最后一次尝试的客户端生成的 `x-client-request-id`                                                                 |                         |
| `attempt`                        | 为此请求进行的总尝试次数                                                                                        |                         |
| `success`                        | `true` 或 `false`                                                                                    |                         |
| `status_code`                    | 请求失败时的 HTTP 状态代码                                                                                    |                         |
| `error`                          | 请求失败时的错误消息                                                                                          |                         |
| `response.has_tool_call`         | 当响应包含工具使用块时为 `true`                                                                                 |                         |
| `stop_reason`                    | API 响应 `stop_reason`，例如 `end_turn`、`tool_use`、`max_tokens`、`stop_sequence`、`pause_turn` 或 `refusal` |                         |
| `gen_ai.response.finish_reasons` | 与 `stop_reason` 相同的值，包装在字符串数组中。OpenTelemetry GenAI 语义约定                                             |                         |

每次重试尝试也被记录为 `gen_ai.request.attempt` span 事件，具有 `attempt` 和 `client_request_id` 属性。

**`claude_code.tool`**

| 属性                    | 描述                                                                                                                                                         | 门控条件                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `tool_name`           | 工具名称                                                                                                                                                       |                         |
| `duration_ms`         | 包括权限等待和执行的实际时钟持续时间                                                                                                                                         |                         |
| `result_tokens`       | 工具结果的近似令牌大小                                                                                                                                                |                         |
| `agent_id`            | 运行工具的子代理或队友的标识符。在主会话中不存在                                                                                                                                   |                         |
| `parent_agent_id`     | 生成此代理的代理的标识符。对于主会话和直接从其生成的代理不存在                                                                                                                            |                         |
| `workflow.run_id`     | 生成此代理的 Workflow 工具运行的运行标识符，前缀为 `wf_`。对于不是由工作流生成的代理不存在                                                                                                      |                         |
| `workflow.name`       | 生成此代理的工作流的名称。用户编写的名称被替换为 `custom`，除非设置了门控条件                                                                                                                | `OTEL_LOG_TOOL_DETAILS` |
| `tool_use_id`         | 此调用的模型 `tool_use` 块 id。与 [tool\_result](#tool-result-event) 和 [tool\_decision](#tool-decision-event) 事件以及 hook 有效负载中的 `tool_use_id` 匹配，因此您可以将 span 连接到这些记录 |                         |
| `gen_ai.tool.call.id` | 与 `tool_use_id` 相同的值。OpenTelemetry GenAI 语义约定                                                                                                              |                         |
| `file_path`           | Read、Edit 和 Write 工具的目标文件路径                                                                                                                                | `OTEL_LOG_TOOL_DETAILS` |
| `full_command`        | Bash 工具的命令字符串                                                                                                                                              | `OTEL_LOG_TOOL_DETAILS` |
| `skill_name`          | Skill 工具的技能名称                                                                                                                                              | `OTEL_LOG_TOOL_DETAILS` |
| `subagent_type`       | Agent 工具或旧版 Task 工具的子代理类型                                                                                                                                  | `OTEL_LOG_TOOL_DETAILS` |

当 `OTEL_LOG_TOOL_CONTENT=1` 时，此 span 还记录一个 `tool.output` span 事件，其属性包含工具的输入和输出主体，在每个属性处截断为 60 KB。

**`claude_code.tool.blocked_on_user`**

| 属性            | 描述                                                    | 门控条件 |
| ------------- | ----------------------------------------------------- | ---- |
| `duration_ms` | 等待权限决策所花费的时间                                          |      |
| `decision`    | `accept` 或 `reject`                                   |      |
| `source`      | 决策来源，与 [Tool decision event](#tool-decision-event) 匹配 |      |

**`claude_code.tool.execution`**

| 属性                    | 描述                                                               | 门控条件                    |
| --------------------- | ---------------------------------------------------------------- | ----------------------- |
| `duration_ms`         | 运行工具主体所花费的时间                                                     |                         |
| `tool_use_id`         | 与父 `claude_code.tool` span 上的值相同                                 |                         |
| `gen_ai.tool.call.id` | 与 `tool_use_id` 相同的值。OpenTelemetry GenAI 语义约定                    |                         |
| `success`             | `true` 或 `false`                                                 |                         |
| `error`               | 执行失败时的错误类别字符串，例如 `Error:ENOENT` 或 `ShellError`。当设置了门控条件时包含完整错误消息 | `OTEL_LOG_TOOL_DETAILS` |

**`claude_code.hook`**

此 span 仅在详细的测试版跟踪处于活动状态时发出，这需要 `ENABLE_BETA_TRACING_DETAILED=1` 和 `BETA_TRACING_ENDPOINT` 以及上述跟踪导出器配置。在交互式 CLI 会话中，这还需要您的组织被列入该功能的白名单。Agent SDK 和非交互式 `-p` 会话不受限制。仅设置 `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` 时不会发出。

| 属性                       | 描述                               | 门控条件                    |
| ------------------------ | -------------------------------- | ----------------------- |
| `hook_event`             | Hook 事件类型，例如 `PreToolUse`        |                         |
| `hook_name`              | 完整 hook 名称，例如 `PreToolUse:Write` |                         |
| `num_hooks`              | 执行的匹配 hook 命令数                   |                         |
| `hook_definitions`       | JSON 序列化的 hook 配置                | `OTEL_LOG_TOOL_DETAILS` |
| `duration_ms`            | 所有匹配 hook 的实际时钟持续时间              |                         |
| `num_success`            | 成功完成的 hook 计数                    |                         |
| `num_blocking`           | 返回阻止决策的 hook 计数                  |                         |
| `num_non_blocking_error` | 失败但未阻止的 hook 计数                  |                         |
| `num_cancelled`          | 在完成前取消的 hook 计数                  |                         |

<Note>
  其他内容承载属性，例如 `new_context`、`system_prompt_preview`、`user_system_prompt`、`tool_input` 和 `response.model_output`，仅在详细的测试版跟踪处于活动状态时发出。它们不是稳定 span 架构的一部分。`user_system_prompt` 还需要 `OTEL_LOG_USER_PROMPTS=1`。它仅包含您通过 `systemPrompt` SDK 选项或 `--system-prompt` 和 `--append-system-prompt` 标志提供的系统提示文本，在 60 KB 处截断，并且每个会话发出一次而不是每个请求发出一次。
</Note>

<h3 id="dynamic-headers">
  动态标头
</h3>

对于需要动态身份验证的企业环境，您可以配置脚本来动态生成标头。动态标头仅适用于 `http/protobuf` 和 `http/json` 协议。`grpc` 导出器仅使用静态 `OTEL_EXPORTER_OTLP_HEADERS` 值。

<h4 id="settings-configuration">
  设置配置
</h4>

添加到您的 `.claude/settings.json`：

```json theme={null}
{
  "otelHeadersHelper": "/bin/generate_opentelemetry_headers.sh"
}
```

该值可以是可执行文件的路径，包括包含空格的路径，或带有参数的 shell 命令行。在 Windows 上，该值始终通过 shell 运行，因此在 JSON 值内引用包含空格的路径。

<h4 id="script-requirements">
  脚本要求
</h4>

脚本必须输出有效的 JSON，其中包含表示 HTTP 标头的字符串键值对：

```bash theme={null}
#!/bin/bash
# 示例：多个标头
echo "{\"Authorization\": \"Bearer $(get-token.sh)\", \"X-API-Key\": \"$(get-api-key.sh)\"}"
```

如果助手失败或打印不符合这些要求的输出，Claude Code 会在以下位置报告错误：

* `/status` 输出
* 调试日志，当使用 [`--debug`](/docs/zh-CN/cli-reference#cli-flags) 运行或在会话中运行 `/debug` 后
* stderr，在使用 `-p` 启动的非交互式会话中

<h4 id="refresh-behavior">
  刷新行为
</h4>

标头助手脚本在启动时运行，之后定期运行以支持令牌刷新。默认情况下，脚本每 29 分钟运行一次。使用 `CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS` 环境变量自定义间隔。

<h3 id="multi-team-organization-support">
  多团队组织支持
</h3>

具有多个团队或部门的组织可以使用 `OTEL_RESOURCE_ATTRIBUTES` 环境变量添加自定义属性以区分不同的组：

```bash theme={null}
# 添加自定义属性用于团队识别
export OTEL_RESOURCE_ATTRIBUTES="department=engineering,team.id=platform,cost_center=eng-123"
```

这些自定义属性将包含在所有指标和事件中，允许您：

* 按团队或部门过滤指标
* 按成本中心跟踪成本
* 创建特定于团队的仪表板
* 为特定团队设置警报

Claude Code 将这些值作为属性附加到每个指标数据点和事件记录上，除了在 OTLP 资源块中发送它们。因为大多数指标后端将数据点属性公开为可查询的标签，您可以直接按自定义键对指标进行分组和过滤。自定义键永远不会覆盖 [标准属性](#standard-attributes)，例如 `user.id` 或 `session.id`：当键冲突时，Claude Code 保留内置值。

每个自定义键都成为每个指标系列上的标签，因此高基数值会增加指标后端中的存储成本。要仅在资源块中发送自定义属性并从数据点标签中省略它们，请设置 `OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES=false`。请参阅 [指标基数控制](#metrics-cardinality-control)。

<Warning>
  `OTEL_RESOURCE_ATTRIBUTES` 环境变量使用逗号分隔的键=值对，具有严格的格式要求：

  * **不允许空格**：值不能包含空格。例如，`user.organizationName=My Company` 无效
  * **格式**：必须是逗号分隔的键=值对：`key1=value1,key2=value2`
  * **允许的字符**：仅 US-ASCII 字符，不包括控制字符、空格、双引号、逗号、分号和反斜杠
  * **特殊字符**：超出允许范围的字符必须进行百分比编码

  对于需要空格的值，请改用下划线或驼峰式大小写。以下示例以每种形式设置 `org.name`：

  ```bash theme={null}
  export OTEL_RESOURCE_ATTRIBUTES="org.name=Johns_Organization"
  export OTEL_RESOURCE_ATTRIBUTES="org.name=JohnsOrganization"
  ```

  您可以对任何字符进行百分比编码，不仅仅是被排除的字符。此示例对空格和撇号进行编码：

  ```bash theme={null}
  export OTEL_RESOURCE_ATTRIBUTES="org.name=John%27s%20Organization"
  ```

  用引号包装值不会转义空格。例如，`org.name="My Company"` 会导致字面值 `"My Company"`（包括引号），而不是 `My Company`。
</Warning>

<h3 id="example-configurations">
  示例配置
</h3>

在运行 `claude` 之前设置这些环境变量。每个块显示不同导出器或部署场景的完整配置：

```bash theme={null}
# 控制台调试（1 秒间隔）
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=console
export OTEL_METRIC_EXPORT_INTERVAL=1000

# OTLP/gRPC
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Prometheus
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=prometheus

# 多个导出器
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=console,otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json

# 指标和日志的不同端点/后端
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_METRICS_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://metrics.example.com:4318
export OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://logs.example.com:4317

# 仅指标（无事件/日志）
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# 仅事件/日志（无指标）
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

<h2 id="available-metrics-and-events">
  可用的指标和事件
</h2>

<h3 id="standard-attributes">
  标准属性
</h3>

所有指标和事件共享这些标准属性：

| 属性                             | 描述                                                                                          | 控制方式                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `session.id`                   | 唯一的会话标识符                                                                                    | `OTEL_METRICS_INCLUDE_SESSION_ID`（默认：true）          |
| `app.version`                  | 当前 Claude Code 版本                                                                           | `OTEL_METRICS_INCLUDE_VERSION`（默认：false）            |
| `app.entrypoint`               | 会话的启动方式，例如 `cli`、`sdk-cli`、`sdk-ts`、`sdk-py` 或 `claude-vscode`                              | `OTEL_METRICS_INCLUDE_ENTRYPOINT`（默认：false）         |
| `organization.id`              | 组织 UUID（已认证时）                                                                               | 可用时始终包含                                             |
| `user.account_uuid`            | 账户 UUID（已认证时）                                                                               | `OTEL_METRICS_INCLUDE_ACCOUNT_UUID`（默认：true）        |
| `user.account_id`              | 账户 ID，采用与 Anthropic 管理 API 匹配的标记格式（已认证时），例如 `user_01BWBeN28...`                             | `OTEL_METRICS_INCLUDE_ACCOUNT_UUID`（默认：true）        |
| `user.id`                      | 在首次运行时生成并保存在 `~/.claude.json` 中的随机匿名标识符。它不包含任何个人信息，也不是从您的 Claude 账户派生的。删除该文件会在下次运行时生成新的无关值。 | 始终包含                                                |
| `user.email`                   | 用户电子邮件地址（通过 OAuth 认证时）                                                                      | 可用时始终包含                                             |
| `terminal.type`                | 终端类型，例如 `iTerm.app`、`vscode`、`cursor` 或 `tmux`                                              | 检测到时始终包含                                            |
| `OTEL_RESOURCE_ATTRIBUTES` 中的键 | 您设置的自定义属性，例如 `department` 或 `team.id`。请参阅 [多团队组织支持](#multi-team-organization-support)       | `OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES`（默认：true） |

当 Claude Code 登录到 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 时，CLI 会使用来自网关会话的已认证身份标记导出：`user.id` 是 IdP 主体而不是匿名安装标识符，`user.email` 是已登录的电子邮件，`user.groups` 作为逗号分隔的字符串携带 IdP 组成员身份。每个导出还携带 `identity.source: gateway-oidc`。网关身份最后应用，因此通过 `OTEL_RESOURCE_ATTRIBUTES` 设置的 `user.*` 和 `identity.*` 键在网关会话上被忽略。

事件另外包含以下属性。这些永远不会附加到指标，因为它们会导致无限基数：

* `prompt.id`：UUID 将用户提示与所有后续事件关联到下一个提示。请参阅 [事件关联属性](#event-correlation-attributes)。
* `workspace.host_paths`：在桌面应用中选择的主机工作区目录，作为字符串数组
* `workflow.run_id`：运行标识符，前缀为 `wf_`，在属于 [Workflow](/docs/zh-CN/workflows) 工具运行的代理发出的 API 和工具事件上。按一个 `workflow.run_id` 过滤事件可以重建该运行的 API 请求和工具结果。标识符涵盖工作流脚本生成的代理以及这些代理依次生成的任何代理，例如技能调用。它与 Workflow 工具结果中报告的运行标识符匹配。在所有其他事件上不存在。需要 Claude Code v2.1.202 或更高版本
* `workflow.name`：工作流的名称，其脚本的 `meta.name`，与 `workflow.run_id` 一起发出。内置工作流名称在运行执行未修改的内置脚本时按原样出现。用户创作的名称（包括内置脚本的编辑副本）被替换为 `custom`，除非设置了 `OTEL_LOG_TOOL_DETAILS=1`。需要 Claude Code v2.1.202 或更高版本

<h3 id="metrics">
  指标
</h3>

Claude Code 导出以下指标：

| 指标名称                                  | 描述                | 单位     |
| ------------------------------------- | ----------------- | ------ |
| `claude_code.session.count`           | 启动的 CLI 会话计数      | count  |
| `claude_code.lines_of_code.count`     | 修改的代码行数计数         | count  |
| `claude_code.pull_request.count`      | 创建的拉取请求数          | count  |
| `claude_code.commit.count`            | 创建的 git 提交数       | count  |
| `claude_code.cost.usage`              | Claude Code 会话的成本 | USD    |
| `claude_code.token.usage`             | 使用的令牌数            | tokens |
| `claude_code.code_edit_tool.decision` | 代码编辑工具权限决策计数      | count  |
| `claude_code.active_time.total`       | 总活跃时间（秒）          | s      |

<h3 id="metric-details">
  指标详情
</h3>

每个指标都包含上面列出的标准属性。具有额外上下文特定属性的指标如下所述。

<h4 id="session-counter">
  会话计数器
</h4>

在每个会话开始时递增。

**属性**：

* 所有 [标准属性](#standard-attributes)
* `start_type`：会话的启动方式。`"fresh"`、`"resume"`、`"continue"` 或 `"agents_view"` 之一。`"agents_view"` 值标识 `claude agents` 仪表板进程，这是用户启动的本地 UI 而不是对话会话。在您的仪表板中过滤此值以将 UI 进程启动与对话会话分开。

<h4 id="lines-of-code-counter">
  代码行计数器
</h4>

当添加或删除代码时递增。

**属性**：

* 所有 [标准属性](#standard-attributes)
* `type`：（`"added"`、`"removed"`）
* `model`：进行更改的模型的模型标识符（例如，"claude-sonnet-5"）

<h4 id="pull-request-counter">
  拉取请求计数器
</h4>

通过 shell 命令或 MCP 工具通过 Claude Code 创建拉取请求或合并请求时递增。

**属性**：

* 所有 [标准属性](#standard-attributes)

<h4 id="commit-counter">
  提交计数器
</h4>

通过 Claude Code 创建 git 提交时递增。

**属性**：

* 所有 [标准属性](#standard-attributes)

<h4 id="cost-counter">
  成本计数器
</h4>

在每个 API 请求后递增。

**属性**：

* 所有 [标准属性](#standard-attributes)
* `model`：模型标识符（例如，"claude-sonnet-5"）
* `query_source`：发出请求的子系统的类别。`"main"`、`"subagent"` 或 `"auxiliary"` 之一
* `speed`：当请求使用快速模式时为 `"fast"`。否则不存在
* `effort`：应用于请求的 [努力级别](/docs/zh-CN/model-config#adjust-effort-level)：`"low"`、`"medium"`、`"high"`、`"xhigh"` 或 `"max"`。当模型不支持努力时不存在。
* `agent.name`：发出请求的子代理类型。内置代理名称和来自官方市场插件的代理按原样出现。其他用户定义的代理名称被替换为 `"custom"`。当请求不是由命名子代理类型发出时不存在。
* `skill.name`：对请求活跃的技能，由 Skill 工具、`/` 命令设置或由生成的子代理继承。内置、捆绑、用户定义和官方市场插件技能名称按原样出现。第三方插件技能名称被替换为 `"third-party"`。当没有技能活跃时不存在。
* `plugin.name`：当活跃技能或子代理由插件提供时的拥有插件。官方市场插件名称按原样出现。第三方插件名称被替换为 `"third-party"`。当技能和子代理都没有拥有插件时不存在。
* `marketplace.name`：拥有插件安装来源的市场。仅为官方市场插件发出。否则不存在。
* `mcp_server.name`：MCP 服务器，其工具在产生此请求的轮次中运行。内置、claude.ai 代理和官方注册表服务器名称按原样出现。用户配置的服务器名称被替换为 `"custom"`。当没有 MCP 工具运行时不存在。
* `mcp_tool.name`：在产生此请求的轮次中运行的 MCP 工具，与 `mcp_server.name` 具有相同的编辑。当没有 MCP 工具运行时不存在。

<h4 id="token-counter">
  令牌计数器
</h4>

在每个 API 请求后递增。

**属性**：

* 所有 [标准属性](#standard-attributes)
* `type`：（`"input"`、`"output"`、`"cacheRead"`、`"cacheCreation"`）
* `model`：模型标识符（例如，"claude-sonnet-5"）
* `query_source`：发出请求的子系统的类别。`"main"`、`"subagent"` 或 `"auxiliary"` 之一
* `speed`：当请求使用快速模式时为 `"fast"`。否则不存在
* `effort`：应用于请求的 [努力级别](/docs/zh-CN/model-config#adjust-effort-level)。有关详情，请参阅 [成本计数器](#cost-counter)。
* `agent.name`、`skill.name`、`plugin.name`、`marketplace.name`、`mcp_server.name`、`mcp_tool.name`：请求的技能、插件、代理和 MCP 归属。有关定义和编辑行为，请参阅 [成本计数器](#cost-counter)。

<h4 id="code-edit-tool-decision-counter">
  代码编辑工具决策计数器
</h4>

当用户接受或拒绝 Edit、Write 或 NotebookEdit 工具使用时递增。

**属性**：

* 所有 [标准属性](#standard-attributes)
* `tool_name`：工具名称（`"Edit"`、`"Write"`、`"NotebookEdit"`）
* `decision`：用户决策（`"accept"`、`"reject"`）
* `source`：决策来源。`"config"`、`"hook"`、`"user_permanent"`、`"user_temporary"`、`"user_abort"` 或 `"user_reject"` 之一。请参阅 [工具决策事件](#tool-decision-event) 了解每个值的含义。
* `language`：编辑文件的编程语言，例如 `"TypeScript"`、`"Python"`、`"JavaScript"` 或 `"Markdown"`。对于无法识别的文件扩展名，返回 `"unknown"`。

<h4 id="active-time-counter">
  活跃时间计数器
</h4>

跟踪实际花费在积极使用 Claude Code 上的时间，不包括空闲时间。此指标在用户交互期间递增（输入、读取响应）以及在 CLI 处理期间（工具执行、AI 响应生成）。

**属性**：

* 所有 [标准属性](#standard-attributes)
* `type`：`"user"` 用于键盘交互，`"cli"` 用于工具执行和 AI 响应

<h3 id="events">
  事件
</h3>

Claude Code 通过 OpenTelemetry 日志/事件导出以下事件（当配置了 `OTEL_LOGS_EXPORTER` 时）：

<h4 id="event-correlation-attributes">
  事件关联属性
</h4>

当用户提交提示时，Claude Code 可能会进行多个 API 调用并运行多个工具。`prompt.id` 属性让您将所有这些事件与触发它们的单个提示联系起来。

| 属性          | 描述                             |
| ----------- | ------------------------------ |
| `prompt.id` | UUID v4 标识符，链接处理单个用户提示时生成的所有事件 |

要跟踪由单个提示触发的所有活动，请按特定 `prompt.id` 值过滤您的事件。这会返回 user\_prompt 事件、任何 api\_request 事件以及处理该提示时发生的任何 tool\_result 事件。

<Note>
  `prompt.id` 有意从指标中排除，因为每个提示生成唯一的 ID，这会创建一个不断增长的时间序列数。仅将其用于事件级分析和审计跟踪。
</Note>

<h4 id="user-prompt-event">
  用户提示事件
</h4>

当用户提交提示时记录。

**事件名称**：`claude_code.user_prompt`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"user_prompt"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `prompt_length`：提示的长度
* `prompt`：提示内容。默认为已编辑。设置 `OTEL_LOG_USER_PROMPTS=1` 以包含它
* `command_name`：当提示调用命令时的命令名称。内置和捆绑的命令名称（例如 `compact` 或 `debug`）按原样发出；别名（例如 `reset`）按输入方式发出而不是规范名称。自定义、插件和 MCP 命令名称折叠为 `custom` 或 `mcp`，除非设置了 `OTEL_LOG_TOOL_DETAILS=1`
* `command_source`：命令存在时的来源：`builtin`、`custom` 或 `mcp`。插件提供的命令报告为 `custom`

<h4 id="assistant-response-event">
  助手响应事件
</h4>

在每个返回来自模型的文本内容的 API 请求后记录。仅包含响应的文本块；思考块和工具使用块被排除。需要 Claude Code v2.1.193 或更高版本。

**事件名称**：`claude_code.assistant_response`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"assistant_response"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `response_length`：响应文本的长度（字符数）
* `response`：响应文本，在 60 KB 处截断。默认为 `<REDACTED>` 编辑。设置 `OTEL_LOG_ASSISTANT_RESPONSES=1` 以包含它。当 `OTEL_LOG_ASSISTANT_RESPONSES` 未设置时，`OTEL_LOG_USER_PROMPTS` 控制它，因此设置 `OTEL_LOG_ASSISTANT_RESPONSES=0` 以在启用提示日志记录时保持响应编辑
* `model`：模型标识符（例如，"claude-sonnet-5"）
* `request_id`：来自响应的 `request-id` 标头的 Anthropic API 请求 ID。仅当 API 返回时存在
* `query_source`：发出请求的子系统，例如 `"repl_main_thread"`、`"compact"` 或子代理名称

<h4 id="tool-result-event">
  工具结果事件
</h4>

当工具完成执行时记录。如果工具调用被拒绝，则不会发出；请参阅 [工具决策事件](#tool-decision-event) 了解拒绝。

**事件名称**：`claude_code.tool_result`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"tool_result"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `tool_name`：工具的名称
* `tool_use_id`：此工具调用的唯一标识符。与传递给 hooks 的 `tool_use_id` 匹配，允许在 OTel 事件和 hook 捕获的数据之间进行关联。
* `success`：`"true"` 或 `"false"`
* `duration_ms`：执行时间（毫秒）
* `error_type`：工具失败时的错误类别字符串，例如 `"Error:ENOENT"` 或 `"ShellError"`
* `error`（当 `OTEL_LOG_TOOL_DETAILS=1` 时）：工具失败时的完整错误消息
* `decision_type`：始终为 `"accept"`，因为此事件仅在工具运行后发出。拒绝的调用不会产生工具结果
* `decision_source`：权限决策来源。`"config"`、`"hook"`、`"user_permanent"` 或 `"user_temporary"` 之一。请参阅 [工具决策事件](#tool-decision-event) 了解每个值的含义。仅拒绝的来源 `"user_abort"` 和 `"user_reject"` 永远不会出现在此事件上。
* `tool_input_size_bytes`：JSON 序列化工具输入的大小（字节）
* `tool_result_size_bytes`：工具结果的大小（字节）
* `mcp_server_scope`：MCP 服务器范围标识符（用于 MCP 工具）
* `tool_parameters`（当 `OTEL_LOG_TOOL_DETAILS=1` 时）：包含工具特定参数的 JSON 字符串：
  * 对于 Bash 工具：包括 `bash_command`、`full_command`、`timeout`、`description`、`dangerouslyDisableSandbox` 和 `git_commit_id`（git commit 命令成功时的提交 SHA）
  * 对于 WorkspaceBash 工具：包括 `bash_command`、`full_command`、`timeout`
  * 对于 MCP 工具：包括 `mcp_server_name`、`mcp_tool_name`
  * 对于 Skill 工具：包括 `skill_name`
  * 对于 Agent 工具或旧版 Task 工具：包括 `subagent_type`
* `tool_input`（当 `OTEL_LOG_TOOL_DETAILS=1` 时）：JSON 序列化的工具参数。超过 512 个字符的单个值被截断，完整有效负载限制为约 4 K 字符。适用于所有工具，包括 MCP 工具。

<h4 id="api-request-event">
  API 请求事件
</h4>

为每个对 Claude 的 API 请求记录。

**事件名称**：`claude_code.api_request`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"api_request"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `model`：使用的模型（例如，"claude-sonnet-5"）
* `cost_usd`：USD 估计成本
* `duration_ms`：请求持续时间（毫秒）
* `input_tokens`：输入令牌数
* `output_tokens`：输出令牌数
* `cache_read_tokens`：从缓存读取的令牌数
* `cache_creation_tokens`：用于缓存创建的令牌数
* `request_id`：来自响应的 `request-id` 标头的 Anthropic API 请求 ID，例如 `"req_011..."`。仅当 API 返回时存在。
* `speed`：`"fast"` 或 `"normal"`，指示是否启用了快速模式
* `query_source`：发出请求的子系统，例如 `"repl_main_thread"`、`"compact"` 或子代理名称
* `effort`：应用于请求的 [努力级别](/docs/zh-CN/model-config#adjust-effort-level)：`"low"`、`"medium"`、`"high"`、`"xhigh"` 或 `"max"`。当模型不支持努力时不存在。
* `agent.name`、`skill.name`、`plugin.name`、`marketplace.name`、`mcp_server.name`、`mcp_tool.name`：请求的技能、插件、代理和 MCP 归属。有关定义和编辑行为，请参阅 [成本计数器](#cost-counter)。

<h4 id="api-error-event">
  API 错误事件
</h4>

当对 Claude 的 API 请求失败时记录。

**事件名称**：`claude_code.api_error`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"api_error"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `model`：使用的模型（例如，"claude-sonnet-5"）
* `error`：错误消息
* `status_code`：HTTP 状态代码（数字形式）。对于非 HTTP 错误（例如连接失败）不存在。
* `duration_ms`：请求持续时间（毫秒）
* `attempt`：进行的总尝试次数，包括初始请求（`1` 表示没有发生重试）
* `request_id`：来自响应的 `request-id` 标头的 Anthropic API 请求 ID，例如 `"req_011..."`。仅当 API 返回时存在。
* `speed`：`"fast"` 或 `"normal"`，指示是否启用了快速模式
* `query_source`：发出请求的子系统，例如 `"repl_main_thread"`、`"compact"` 或子代理名称
* `effort`：应用于请求的 [努力级别](/docs/zh-CN/model-config#adjust-effort-level)。当模型不支持努力时不存在。
* `agent.name`、`skill.name`、`plugin.name`、`marketplace.name`、`mcp_server.name`、`mcp_tool.name`：请求的技能、插件、代理和 MCP 归属。有关定义和编辑行为，请参阅 [成本计数器](#cost-counter)。

<h4 id="api-refusal-event">
  API 拒绝事件
</h4>

当 API 请求返回 `stop_reason: "refusal"` 时记录。拒绝在成功响应流上到达，而不是作为 HTTP 错误，因此 `api_error` 事件不会为它们触发。此事件让您跟踪拒绝频率并按与 `api_request` 和 `api_error` 相同的属性对拒绝进行分组。

**事件名称**：`claude_code.api_refusal`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"api_refusal"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `model`：来自请求的模型标识符
* `request_id`：来自响应的 `request-id` 标头的 Anthropic API 请求 ID，例如 `"req_011..."`。仅当 API 返回时存在。
* `query_source`：发出请求的子系统，例如 `"repl_main_thread"`、`"compact"` 或子代理名称。有关定义，请参阅 [`api_request`](#api-request-event)。
* `speed`：当 [快速模式](/docs/zh-CN/fast-mode) 活跃时为 `"fast"`，或 `"normal"`
* `attempt`：重试尝试次数。第一次尝试是 `1`。
* `effort`：应用于请求的 [努力级别](/docs/zh-CN/model-config#adjust-effort-level)。当模型不支持努力时不存在。
* `server_fallback_hop`：当 API 的服务器端模型回退已在不同模型上重试此拒绝时为 `true`，因此用户没有看到此特定拒绝。当请求以拒绝结束时为 `false`。单个轮次可以发出 `true` hop 事件和稍后的 `false` 最终事件，当回退模型也拒绝时。
* `has_category`：当 API 响应携带 `stop_details.category` 为 `"cyber"`、`"bio"`、`"frontier_llm"` 或 `"reasoning_extraction"` 时为 `true`。当响应没有类别或值在该集合之外时为 `false`。当 `server_fallback_hop` 为 `true` 时不存在，因为 hop 块不携带 `stop_details`。
* `has_explanation`：当 API 响应携带 `stop_details.explanation` 时为 `true`，否则为 `false`。当 `server_fallback_hop` 为 `true` 时不存在。
* `category`：来自 API 响应的 `stop_details.category` 值。`"cyber"`、`"bio"`、`"frontier_llm"` 或 `"reasoning_extraction"` 之一。仅当设置了 `OTEL_LOG_TOOL_DETAILS=1` 且 `has_category` 为 `true` 时存在。
* `agent.name`、`skill.name`、`plugin.name`、`marketplace.name`、`mcp_server.name`、`mcp_tool.name`：请求的技能、插件、代理和 MCP 归属。有关定义和编辑行为，请参阅 [成本计数器](#cost-counter)。

<h4 id="api-request-body-event">
  API 请求主体事件
</h4>

当设置了 `OTEL_LOG_RAW_API_BODIES` 时，为每个 API 请求尝试记录。每次尝试发出一个事件，因此使用调整参数的重试各自产生自己的事件。

**事件名称**：`claude_code.api_request_body`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"api_request_body"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `body`：JSON 序列化的 Messages API 请求参数（系统提示、消息、工具等），在 60 KB 处截断。先前助手轮次中的扩展思考内容被编辑。仅在内联模式下发出（`OTEL_LOG_RAW_API_BODIES=1`）。
* `body_ref`：包含未截断主体的 `<dir>/<uuid>.request.json` 文件的绝对路径。仅在文件模式下发出（`OTEL_LOG_RAW_API_BODIES=file:<dir>`）。
* `body_length`：未截断的主体长度。当 `OTEL_LOG_RAW_API_BODIES=file:<dir>` 时为 UTF-8 字节，或当 `=1` 时为 UTF-16 代码单位
* `body_truncated`：当发生内联截断时为 `"true"`。在文件模式下和未发生截断时不存在。
* `model`：来自请求参数的模型标识符
* `query_source`：发出请求的子系统（例如，`"compact"`）

<h4 id="api-response-body-event">
  API 响应主体事件
</h4>

当设置了 `OTEL_LOG_RAW_API_BODIES` 时，为每个成功的 API 响应记录。

**事件名称**：`claude_code.api_response_body`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"api_response_body"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `body`：JSON 序列化的 Messages API 响应（id、内容块、使用情况、停止原因），在 60 KB 处截断。扩展思考内容被编辑。仅在内联模式下发出（`OTEL_LOG_RAW_API_BODIES=1`）。
* `body_ref`：包含未截断主体的 `<dir>/<request_id>.response.json` 文件的绝对路径。仅在文件模式下发出（`OTEL_LOG_RAW_API_BODIES=file:<dir>`）。
* `body_length`：未截断的主体长度。当 `OTEL_LOG_RAW_API_BODIES=file:<dir>` 时为 UTF-8 字节，或当 `=1` 时为 UTF-16 代码单位
* `body_truncated`：当发生内联截断时为 `"true"`。在文件模式下和未发生截断时不存在。
* `model`：模型标识符
* `query_source`：发出请求的子系统
* `request_id`：来自响应的 `request-id` 标头的 Anthropic API 请求 ID，例如 `"req_011..."`。仅当 API 返回时存在。

<h4 id="tool-decision-event">
  工具决策事件
</h4>

当做出工具权限决策（接受/拒绝）时记录。

**事件名称**：`claude_code.tool_decision`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"tool_decision"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `tool_name`：工具的名称（例如，"Read"、"Edit"、"Write"、"NotebookEdit"）
* `tool_use_id`：此工具调用的唯一标识符。与传递给 hooks 的 `tool_use_id` 匹配，允许在 OTel 事件和 hook 捕获的数据之间进行关联。
* `decision`：`"accept"` 或 `"reject"`
* `source`：决策来源：
  * `"config"`：基于项目设置、用户个人设置中的允许规则、企业托管策略、`--allowedTools` 或 `--disallowedTools` 标志、活跃权限模式、来自同一交互式 CLI 会话中较早提示的会话范围授予或因为工具本身是安全的，自动决策而不提示。事件不指示这些来源中的哪一个匹配。
  * `"hook"`：`PreToolUse` 或 `PermissionRequest` hook 返回了决策。
  * `"user_permanent"`：当用户在权限提示时选择"是，并且不要再问..."时发出，将允许规则保存到其个人设置。在交互式 CLI 中，仅为该选择本身发出；与保存规则匹配的后续调用发出 `"config"`。在 Agent SDK 或非交互式 `-p` 会话中，初始选择和后续规则匹配都发出 `"user_permanent"`。视为接受。
  * `"user_temporary"`：当用户在权限提示时选择"是"，或在文件编辑或读取提示上选择"...仅在此会话期间"选项时发出。在交互式 CLI 中，仅为该选择本身发出；与该会话范围允许匹配的后续调用发出 `"config"`。在 Agent SDK 或非交互式 `-p` 会话中，选择和后续匹配都发出 `"user_temporary"`。视为接受。
  * `"user_abort"`：当用户关闭权限提示而不回答时发出。视为拒绝。
  * `"user_reject"`：当用户选择"否"时发出。在交互式 CLI 中，仅为该选择本身发出；与用户个人设置中的拒绝规则匹配的调用发出 `"config"`。在 Agent SDK 或非交互式 `-p` 会话中，与个人设置中的拒绝规则匹配的调用发出 `"user_reject"`。视为拒绝。
* `tool_parameters`（当 `OTEL_LOG_TOOL_DETAILS=1` 时）：包含工具特定参数的 JSON 字符串。形状与 [工具结果事件](#tool-result-event) 相同，除了执行后字段（例如 `git_commit_id`）。对于接受的调用，如果权限决策通过 `updatedInput` 重写工具输入，值可能与 `tool_result` 不同。使用此属性查看当 `decision` 为 `"reject"` 时拒绝了哪个命令。
  * 对于 Bash 工具：包括 `bash_command`、`full_command`、`timeout`、`description`、`dangerouslyDisableSandbox`
  * 对于 WorkspaceBash 工具：包括 `bash_command`、`full_command`、`timeout`
  * 对于 MCP 工具：包括 `mcp_server_name`、`mcp_tool_name`
  * 对于 Skill 工具：包括 `skill_name`
  * 对于 Agent 工具或旧版 Task 工具：包括 `subagent_type`

<h4 id="permission-mode-changed-event">
  权限模式更改事件
</h4>

当权限模式更改时记录，例如从 `Shift+Tab` 循环、退出 Plan Mode 或自动模式门控检查。

**事件名称**：`claude_code.permission_mode_changed`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"permission_mode_changed"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `from_mode`：前一个权限模式，例如 `"default"`、`"plan"`、`"acceptEdits"`、`"auto"` 或 `"bypassPermissions"`
* `to_mode`：新权限模式
* `trigger`：导致更改的原因。`"shift_tab"`、`"exit_plan_mode"`、`"auto_gate_denied"` 或 `"auto_opt_in"` 之一。当转换来自 SDK 或桥接时不存在

<h4 id="auth-event">
  身份验证事件
</h4>

当 `/login` 或 `/logout` 完成时记录。

**事件名称**：`claude_code.auth`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"auth"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `action`：`"login"` 或 `"logout"`
* `success`：`"true"` 或 `"false"`
* `auth_method`：身份验证方法，例如 `"oauth"`
* `error_category`：操作失败时的分类错误类型。永远不包括原始错误消息
* `status_code`：操作因 HTTP 错误而失败时的 HTTP 状态代码（字符串形式）

<h4 id="mcp-server-connection-event">
  MCP 服务器连接事件
</h4>

当 MCP 服务器连接、断开连接或连接失败时记录。

**事件名称**：`claude_code.mcp_server_connection`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"mcp_server_connection"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `status`：`"connected"`、`"failed"` 或 `"disconnected"`
* `transport_type`：服务器传输，例如 `"stdio"`、`"sse"` 或 `"http"`
* `server_scope`：服务器配置的范围，例如 `"user"`、`"project"` 或 `"local"`
* `duration_ms`：连接尝试持续时间（毫秒）
* `error_code`：连接失败时的错误代码
* `is_plugin`：当服务器由插件提供时为 `true`，否则为 `false`
* `plugin_id_hash`（当 `is_plugin` 为 `true` 时）：插件名称和市场的稳定哈希，用于按插件分组事件而不暴露名称
* `plugin.name`（当 `is_plugin` 为 `true` 时）：提供服务器的插件的名称。对于第三方插件，除非 `OTEL_LOG_TOOL_DETAILS=1`，否则这是字面字符串 `"third-party"`；这可以保护第三方插件名称默认不出现在日志中。来自官方 Anthropic 来源的插件始终按名称标识。`plugin_id_hash` 和 `plugin.name` 属性流向您自己的监控后端，不会发送给 Anthropic
* `server_name`（当 `OTEL_LOG_TOOL_DETAILS=1` 时）：配置的服务器名称
* `error`（当 `OTEL_LOG_TOOL_DETAILS=1` 时）：连接失败时的完整错误消息

<h4 id="internal-error-event">
  内部错误事件
</h4>

当 Claude Code 捕获意外的内部错误时记录。仅记录错误类名和 errno 风格的代码。永远不包括错误消息和堆栈跟踪。在针对 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 运行或设置了 `DISABLE_ERROR_REPORTING` 时不会发出此事件。

**事件名称**：`claude_code.internal_error`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"internal_error"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `error_name`：错误类名，例如 `"TypeError"` 或 `"SyntaxError"`
* `error_code`：Node.js errno 代码，例如错误上存在时的 `"ENOENT"`

<h4 id="plugin-installed-event">
  插件已安装事件
</h4>

当插件完成安装时记录，来自 `claude plugin install` CLI 命令和交互式 `/plugin` UI。

**事件名称**：`claude_code.plugin_installed`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"plugin_installed"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `marketplace.is_official`：如果市场是官方 Anthropic 市场，则为 `"true"`，否则为 `"false"`
* `install.trigger`：`"cli"` 或 `"ui"`
* `plugin.name`：已安装插件的名称。对于第三方市场，仅当 `OTEL_LOG_TOOL_DETAILS=1` 时才包含
* `plugin.version`：在市场条目中声明时的插件版本。对于第三方市场，仅当 `OTEL_LOG_TOOL_DETAILS=1` 时才包含
* `marketplace.name`：插件安装来源的市场。对于第三方市场，仅当 `OTEL_LOG_TOOL_DETAILS=1` 时才包含

<h4 id="plugin-loaded-event">
  插件已加载事件
</h4>

在会话开始时为每个启用的插件记录一次。使用此事件来清点您的整个队伍中哪些插件处于活跃状态，作为记录安装操作本身的 `plugin_installed` 的补充。

**事件名称**：`claude_code.plugin_loaded`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"plugin_loaded"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `plugin.name`：插件的名称。对于官方市场外和内置捆绑的插件，除非 `OTEL_LOG_TOOL_DETAILS=1`，否则值为 `"third-party"`
* `marketplace.name`：插件安装来源的市场（已知时）。在与 `plugin.name` 相同的条件下编辑为 `"third-party"`
* `plugin.version`：来自插件清单的版本。仅当名称未被编辑且清单声明版本时才包含
* `plugin.scope`：插件的来源类别：`"official"`、`"org"`、`"user-local"` 或 `"default-bundle"`
* `enabled_via`：插件如何被启用的方式：`"default-enable"`、`"org-policy"`、`"seed-mount"` 或 `"user-install"`
* `plugin_id_hash`：插件名称和市场的确定性哈希，仅发送到您配置的导出器。让您计算整个队伍中加载了多少个不同的第三方插件，而无需记录其名称
* `has_hooks`：插件是否贡献 hooks
* `has_mcp`：插件是否贡献 MCP 服务器
* `host_owned_mcp`：当 SDK 主机管理此插件的 MCP 连接且 Claude Code 跳过读取插件的 MCP 服务器配置时为 `true`，否则为 `false`。需要 Claude Code v2.1.172 或更高版本
* `skill_path_count`：插件声明的技能目录数
* `command_path_count`：插件声明的命令目录数
* `agent_path_count`：插件声明的代理目录数
* `safe_mode`：当会话使用 [`--safe-mode`](/docs/zh-CN/cli-reference) 启动时为 `"true"`，否则为 `"false"`。在安全模式下，此事件仅报告配置的清单；插件的命令、技能、hooks 和 MCP 服务器不加载。需要 Claude Code v2.1.169 或更高版本

<h4 id="skill-activated-event">
  技能激活事件
</h4>

当调用技能时记录，无论 Claude 是通过 Skill 工具调用它还是您将其作为 `/` 命令运行。

**事件名称**：`claude_code.skill_activated`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"skill_activated"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `skill.name`：技能的名称。对于用户定义和第三方插件技能，除非 `OTEL_LOG_TOOL_DETAILS=1`，否则值为占位符 `"custom_skill"`
* `invocation_trigger`：技能的触发方式（`"user-slash"`、`"claude-proactive"` 或 `"nested-skill"`）
* `skill.source`：技能加载的位置（例如，`"bundled"`、`"userSettings"`、`"projectSettings"`、`"plugin"`）
* `skill.kind`：当技能是工作流技能时为 `"workflow"`。否则不存在
* `plugin.name`（当 `OTEL_LOG_TOOL_DETAILS=1` 或插件来自官方市场时）：当技能由插件提供时的拥有插件的名称
* `marketplace.name`（当 `OTEL_LOG_TOOL_DETAILS=1` 或插件来自官方市场时）：当技能由插件提供时，拥有插件安装来源的市场

<h4 id="at-mention-event">
  @提及事件
</h4>

当 Claude Code 在提示中解析 `@`-提及时记录。并非每个提及都会发出事件：早期退出路径（例如权限拒绝、超大文件、PDF 参考附件和目录列表失败）返回而不记录。

**事件名称**：`claude_code.at_mention`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"at_mention"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `mention_type`：提及的类型（`"file"`、`"directory"`、`"agent"`、`"mcp_resource"`）
* `success`：提及是否成功解析（`"true"` 或 `"false"`）

<h4 id="api-retries-exhausted-event">
  API 重试耗尽事件
</h4>

当 API 请求在多次尝试后失败时记录一次。与最终 `api_error` 事件一起发出。

**事件名称**：`claude_code.api_retries_exhausted`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"api_retries_exhausted"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `model`：使用的模型
* `error`：最终错误消息
* `status_code`：HTTP 状态代码（数字形式）。对于非 HTTP 错误不存在。
* `total_attempts`：进行的总尝试次数
* `total_retry_duration_ms`：所有尝试的总实际时钟时间
* `speed`：`"fast"` 或 `"normal"`

<h4 id="hook-registered-event">
  Hook 已注册事件
</h4>

在会话开始时为每个配置的 hook 记录一次。使用此事件来清点您的整个队伍中哪些 hooks 处于活跃状态，作为每次执行 `hook_execution_start` 和 `hook_execution_complete` 事件的补充。

**事件名称**：`claude_code.hook_registered`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"hook_registered"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `hook_event`：hook 事件类型，例如 `"PreToolUse"` 或 `"PostToolUse"`
* `hook_type`：hook 实现类型：`"command"`、`"prompt"`、`"mcp_tool"`、`"http"` 或 `"agent"`
* `hook_source`：hook 定义的位置：`"userSettings"`、`"projectSettings"`、`"localSettings"`、`"flagSettings"`、`"policySettings"` 或 `"pluginHook"`
* `safe_mode`：当会话使用 [`--safe-mode`](/docs/zh-CN/cli-reference) 启动时为 `"true"`，否则为 `"false"`。需要 Claude Code v2.1.169 或更高版本
* `hook_matcher`（当 `OTEL_LOG_TOOL_DETAILS=1` 时）：hook 配置中的匹配器字符串（设置时）
* `plugin.name`（当 `hook_source` 是 `"pluginHook"` 时）：贡献插件的名称。对于官方市场外和内置捆绑的插件，除非 `OTEL_LOG_TOOL_DETAILS=1`，否则值为 `"third-party"`
* `plugin_id_hash`（当 `hook_source` 是 `"pluginHook"` 时）：插件名称和市场的确定性哈希，仅发送到您配置的导出器。让您计算不同的贡献插件数而无需记录其名称

<h4 id="hook-execution-start-event">
  Hook 执行开始事件
</h4>

当一个或多个 hooks 开始为 hook 事件执行时记录。

**事件名称**：`claude_code.hook_execution_start`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"hook_execution_start"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `hook_event`：Hook 事件类型，例如 `"PreToolUse"` 或 `"PostToolUse"`
* `hook_name`：完整 hook 名称，包括匹配器，例如 `"PreToolUse:Write"`
* `num_hooks`：匹配 hook 命令的数量
* `managed_only`：当仅允许托管策略 hooks 时为 `"true"`
* `hook_source`：`"policySettings"` 或 `"merged"`
* `safe_mode`：当会话使用 [`--safe-mode`](/docs/zh-CN/cli-reference) 启动时为 `"true"`，否则为 `"false"`。需要 Claude Code v2.1.169 或更高版本
* `hook_definitions`：JSON 序列化的 hook 配置。仅当启用了详细的测试版跟踪和 `OTEL_LOG_TOOL_DETAILS=1` 时才包含

<h4 id="hook-execution-complete-event">
  Hook 执行完成事件
</h4>

当 hook 事件的所有 hooks 完成时记录。

**事件名称**：`claude_code.hook_execution_complete`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"hook_execution_complete"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `hook_event`：Hook 事件类型
* `hook_name`：完整 hook 名称，包括匹配器
* `num_hooks`：匹配 hook 命令的数量
* `num_success`：成功完成的计数
* `num_blocking`：返回阻止决策的计数
* `num_non_blocking_error`：失败但未阻止的计数
* `num_cancelled`：在完成前取消的计数
* `total_duration_ms`：所有匹配 hooks 的实际时钟持续时间
* `managed_only`：当仅允许托管策略 hooks 时为 `"true"`
* `hook_source`：`"policySettings"` 或 `"merged"`
* `safe_mode`：当会话使用 [`--safe-mode`](/docs/zh-CN/cli-reference) 启动时为 `"true"`，否则为 `"false"`。需要 Claude Code v2.1.169 或更高版本
* `hook_definitions`：JSON 序列化的 hook 配置。仅当启用了详细的测试版跟踪和 `OTEL_LOG_TOOL_DETAILS=1` 时才包含

<h4 id="hook-plugin-metrics-event">
  Hook 插件指标事件
</h4>

当官方市场插件 hook 发出每次调用指标时记录。仅从官方 Anthropic 市场安装的插件可以发出这些。第三方市场插件和用户配置的 hooks 不会发出到此事件。使用此事件从您自己的可观测性堆栈监控插件行为，例如查找率、成本和持续时间。

**事件名称**：`claude_code.hook_plugin_metrics`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"hook_plugin_metrics"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `plugin_id`：`<name>@<marketplace>` 形式的插件标识符
* `hook_event`：发出指标的 hook 事件类型
* 最多 20 个插件发出的指标键。名称匹配 `^[a-z][a-z0-9_]{0,39}$`。值为布尔值或数字。

<h4 id="compaction-event">
  压缩事件
</h4>

当对话压缩完成时记录。

**事件名称**：`claude_code.compaction`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"compaction"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `trigger`：`"auto"` 或 `"manual"`
* `success`：`"true"` 或 `"false"`
* `duration_ms`：压缩持续时间
* `pre_tokens`：压缩前的近似令牌计数
* `post_tokens`：压缩后的近似令牌计数
* `error`：压缩失败时的错误消息
* `precompute_reuse`：仅当 `trigger` 为 `"manual"` 时设置。自动压缩可以在上下文窗口填满之前在后台准备摘要，此属性记录 `/compact` 是否重用了该准备的摘要。`"hit"` 表示它被重用；`"miss_custom_instructions"`、`"miss_hook"` 和 `"miss_not_ready"` 给出了计算新摘要的原因。需要 Claude Code v2.1.153 或更高版本

<h4 id="feedback-survey-event">
  反馈调查事件
</h4>

当显示或回答会话质量调查时记录。请参阅 [会话质量调查](/docs/zh-CN/data-usage#session-quality-surveys) 了解调查收集的内容以及如何控制它们。

**事件名称**：`claude_code.feedback_survey`

**属性**：

* 所有 [标准属性](#standard-attributes)
* `event.name`：`"feedback_survey"`
* `event.timestamp`：ISO 8601 时间戳
* `event.sequence`：单调递增的计数器，用于在会话内排序事件
* `event_type`：调查生命周期事件，例如 `"appeared"`、`"responded"` 或 `"transcript_prompt_appeared"`
* `appearance_id`：唯一 ID，链接为一个调查实例发出的事件
* `survey_type`：哪个调查产生了事件。`"session"` 是"Claude 做得怎么样？"评分提示
* `response`：用户在 `responded` 事件上的选择
* `enabled_via_override`：当设置了 [`CLAUDE_CODE_ENABLE_FEEDBACK_SURVEY_FOR_OTEL`](/docs/zh-CN/env-vars) 时为 `true`。作为布尔值而不是字符串发出。在 `session` 调查事件上存在。过滤此属性以确认覆盖在整个队伍中应用

<h2 id="interpret-metrics-and-events-data">
  解释指标和事件数据
</h2>

导出的指标和事件支持一系列分析：

<h3 id="usage-monitoring">
  使用情况监控
</h3>

| 指标                                                            | 分析机会                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `claude_code.token.usage`                                     | 按 `type`（输入/输出）、用户、团队、模型、`skill.name`、`plugin.name` 或 `agent.name` 分解 |
| `claude_code.session.count`                                   | 跟踪随时间推移的采用和参与度                                                        |
| `claude_code.lines_of_code.count`                             | 通过跟踪代码添加和删除来衡量生产力，按模型分解                                               |
| `claude_code.commit.count` & `claude_code.pull_request.count` | 了解对开发工作流的影响                                                           |

<h3 id="cost-monitoring">
  成本监控
</h3>

`claude_code.cost.usage` 指标有助于：

* 跟踪团队或个人的使用趋势
* 识别高使用会话以进行优化
* 通过 `skill.name`、`plugin.name` 和 `agent.name` 属性将支出归属于特定技能、插件或子代理类型

<Note>
  成本指标是近似值。有关官方计费数据，请参阅您的 API 提供商（Claude 控制台、Amazon Bedrock 或 Google Cloud 的 Agent Platform）。
</Note>

<h3 id="alerting-and-segmentation">
  警报和分段
</h3>

要考虑的常见警报：

* 成本激增
* 异常的令牌消耗
* 来自特定用户的高会话量

所有指标都可以按[标准属性](#standard-attributes)进行分段。`model` 属性在 `claude_code.token.usage`、`claude_code.cost.usage` 上可用，以及从 v2.1.172 开始，`claude_code.lines_of_code.count` 上也可用。

按模型的提交分解只能通过在 `session.id` 上与令牌或成本指标进行联接来近似，因为一个会话可以跨越多个模型。筛选令牌或成本端的行，使 `query_source` 为 `"main"`，以便辅助和子代理请求不会将会话的提交归属于未进行这些提交的模型。

<h3 id="detect-retry-exhaustion">
  检测重试耗尽
</h3>

Claude Code 在内部重试失败的 API 请求，仅在放弃后才发出单个 `claude_code.api_error` 事件，因此事件本身是该请求的终端信号。中间重试尝试不会作为单独的事件记录。

事件上的 `attempt` 属性记录进行的总尝试次数。`CLAUDE_CODE_MAX_RETRIES` 默认为 10，上限为 15；从 v2.1.199 开始，`CLAUDE_CODE_RETRY_WATCHDOG` 提高了默认值并移除了上限。当请求在瞬时错误上耗尽所有重试时，`attempt` 等于该有效限制加一：默认为 11，除非设置了看门狗，否则永远不超过 16。较低的值表示不可重试的错误，例如 `400` 响应。

要区分从一个恢复的会话与停滞的会话，按 `session.id` 分组事件，并检查错误后是否存在更晚的 `api_request` 事件。

<h3 id="event-analysis">
  事件分析
</h3>

事件数据提供了对 Claude Code 交互的详细见解：

**工具使用模式**：分析工具结果事件以识别：

* 最常用的工具
* 工具成功率
* 平均工具执行时间
* 按工具类型的错误模式

**性能监控**：跟踪 API 请求持续时间和工具执行时间以识别性能瓶颈。

<h2 id="audit-security-events">
  审计安全事件
</h2>

OpenTelemetry 事件是 Claude Code 活动的审计数据源。每个事件都携带身份属性，将工具调用、MCP 活动和权限决策与触发它们的用户联系起来。OTLP 日志导出器可以将这些事件传递到任何具有 OTLP 接收器的安全信息和事件管理 (SIEM) 平台，或转发到您的 SIEM 的 OpenTelemetry Collector。

<h3 id="attribute-actions-to-users">
  将属性操作归属于用户
</h3>

每个事件上的 [标准属性](#standard-attributes) 包括已认证用户的身份：`user.email`、`user.account_uuid`、`user.account_id` 和 `organization.id`（使用 Claude 账户登录时），加上 `user.id` 和每会话的 `session.id`。`user.id` 是安装范围的标识符，除了在 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 会话上，其中它是来自网关颁发的令牌的 IdP 主体。

MCP 工具调用、Bash 命令和文件编辑因此归属于启动会话的开发人员。Claude Code 不在单独的服务账户下运行；每个事件上记录的身份是开发人员自己的 Claude 账户，或开发人员在 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 会话上的 IdP 身份。

当 Claude Code 使用直接 API 密钥进行身份验证，或针对 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 进行身份验证时，会话中没有 Claude 账户，仅填充 `user.id` 和 `session.id`。在这些部署中，使用 `OTEL_RESOURCE_ATTRIBUTES` 自己附加用户身份，通过 [托管设置](#administrator-configuration) 文件或启动包装器按用户设置。Claude apps gateway 会话不需要任何这些：CLI 自动标记 IdP 身份，如 [标准属性](#standard-attributes) 中所述。

```bash theme={null}
export OTEL_RESOURCE_ATTRIBUTES="enduser.id=jdoe@example.com,enduser.directory_id=S-1-5-21-..."
```

<h3 id="audit-mcp-activity">
  审计 MCP 活动
</h3>

要使用完整的调用详情捕获 MCP 服务器活动，启用日志导出器并设置 `OTEL_LOG_TOOL_DETAILS=1`。每个 MCP 操作然后产生结构化事件，携带服务器名称、工具名称和调用参数以及标准身份属性：

| 事件                      | 它为 MCP 记录的内容                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_server_connection` | 服务器连接、断开连接和连接失败，带有 `server_name`、`transport_type`、`server_scope` 和错误详情                                                                      |
| `tool_result`           | 每个 MCP 工具调用，带有 `tool_name` 和 `mcp_server_scope`，包含 `mcp_server_name` 和 `mcp_tool_name` 的 `tool_parameters` 有效负载，以及包含调用参数的 `tool_input` 有效负载 |
| `tool_decision`         | 调用是否被允许或拒绝，以及决策是来自配置、hook 还是用户，以及包含 `mcp_server_name` 和 `mcp_tool_name` 的 `tool_parameters` 有效负载                                            |

没有 `OTEL_LOG_TOOL_DETAILS`，这些事件会丢弃识别详情：

* `tool_result`：保留 `tool_name` 和 `mcp_server_scope`，省略 `mcp_server_name`、`mcp_tool_name` 和参数
* `tool_decision`：保留 `tool_name`，省略 `tool_parameters`
* `mcp_server_connection`：省略 `server_name` 和错误消息，但保留 `is_plugin`、`plugin_id_hash` 和 `plugin.name`，非 Anthropic 插件名称被编辑为字面值 `"third-party"`，因此插件提供的服务器在没有详细日志的情况下仍然可以区分

<h3 id="map-security-questions-to-events">
  将安全问题映射到事件
</h3>

构建检测规则时，查找您想要监控的信号并查询您的后端以获取相应的事件和属性：

| 信号                | 事件                                                                    | 关键属性                                                       |
| ----------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| 工具调用被允许或拒绝，以及通过什么 | `tool_decision`                                                       | `decision`、`source`、`tool_name`、`tool_parameters`          |
| 权限模式升级            | `permission_mode_changed`                                             | `from_mode`、`to_mode`、`trigger`                            |
| 策略 hook 阻止了操作     | `hook_execution_complete`                                             | `hook_event`、`num_blocking`                                |
| 登录、登出和身份验证失败      | `auth`                                                                | `action`、`success`、`error_category`                        |
| MCP 服务器连接或失败      | `mcp_server_connection`                                               | `status`、`server_name`、`is_plugin`、`error_code`            |
| 插件已安装及其来源         | `plugin_installed`                                                    | `plugin.name`、`marketplace.name`、`marketplace.is_official` |
| 运行的命令和触及的文件       | `tool_result`（已执行）或 `tool_decision`（已拒绝），带有 `OTEL_LOG_TOOL_DETAILS=1` | `tool_parameters`；`tool_input`（仅 `tool_result`）            |

Claude Code 仅发出原始事件流。异常检测、基线化、跨会话关联和警报是您的 SIEM 或可观测性后端的责任。

<h3 id="send-events-to-a-siem">
  将事件发送到 SIEM
</h3>

将 `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` 指向您的 SIEM 的 OTLP 接收器，或指向转发到您的 SIEM 的本机摄取 API 的 OpenTelemetry Collector。以下托管设置示例仅导出事件，启用了完整的工具详情用于 MCP 和 Bash 审计：

```json theme={null}
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_LOG_TOOL_DETAILS": "1",
    "OTEL_EXPORTER_OTLP_LOGS_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "https://siem.example.com:4318/v1/logs",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer your-siem-token"
  }
}
```

<h2 id="backend-considerations">
  后端考虑事项
</h2>

您选择的指标、日志和跟踪后端决定了您可以执行的分析类型：

<h3 id="for-metrics">
  对于指标
</h3>

* **时间序列数据库（例如，Prometheus）**：速率计算、聚合指标
* **列式存储（例如，ClickHouse）**：复杂查询、唯一用户分析
* **全功能可观测性平台（例如，Honeycomb、Datadog、Grafana Cloud）**：高级查询、可视化、警报

<h3 id="for-events/logs">
  对于事件/日志
</h3>

* **日志聚合系统（例如，Elasticsearch、Loki）**：全文搜索、日志分析
* **列式存储（例如，ClickHouse）**：结构化事件分析
* **全功能可观测性平台（例如，Honeycomb、Datadog、Grafana Cloud）**：指标和事件之间的关联

<h3 id="for-traces">
  对于跟踪
</h3>

选择支持分布式跟踪存储和 span 关联的后端：

* **分布式跟踪系统（例如，Jaeger、Zipkin、Grafana Tempo）**：Span 可视化、请求瀑布、延迟分析
* **全功能可观测性平台（例如，Honeycomb、Datadog、Grafana Cloud）**：跟踪搜索和与指标和日志的关联

对于需要日活跃用户/周活跃用户/月活跃用户 (DAU/WAU/MAU) 指标的组织，请考虑支持高效唯一值查询的后端。

<h2 id="service-information">
  服务信息
</h2>

所有指标和事件都使用以下资源属性导出：

* `service.name`：`claude-code`
* `service.version`：当前 Claude Code 版本
* `os.type`：操作系统类型（例如，`linux`、`darwin`、`windows`）
* `os.version`：操作系统版本字符串
* `host.arch`：主机架构（例如，`amd64`、`arm64`）
* `wsl.version`：WSL 版本号（仅在 Windows Subsystem for Linux 上运行时出现）
* 仪表名称：`com.anthropic.claude_code`

<h2 id="roi-measurement-resources">
  ROI 测量资源
</h2>

有关测量 Claude Code 投资回报率的综合指南，包括遥测设置、成本分析、生产力指标和自动化报告，请参阅 [Claude Code ROI 测量指南](https://github.com/anthropics/claude-code-monitoring-guide)。此存储库提供了现成的 Docker Compose 配置、Prometheus 和 OpenTelemetry 设置，以及用于生成与 Linear 等工具集成的生产力报告的模板。

<h2 id="security-and-privacy">
  安全和隐私
</h2>

* OpenTelemetry 导出到您的后端是可选的，需要显式配置。有关 Anthropic 的单独操作遥测以及如何禁用它，请参阅 [数据使用](/docs/zh-CN/data-usage#telemetry-services)
* 原始文件内容和代码片段不包含在指标或事件中。Trace spans 是一个单独的数据路径：请参阅下面的 `OTEL_LOG_TOOL_CONTENT` 项目符号
* 通过 OAuth 认证时，`user.email` 包含在遥测属性中。如果这对您的组织是一个问题，请与您的遥测后端合作以过滤或编辑此字段
* 默认情况下不收集用户提示内容。仅记录提示长度。要包含提示内容，请设置 `OTEL_LOG_USER_PROMPTS=1`
* 默认情况下不收集助手响应文本。仅记录响应长度。要包含响应文本，请设置 `OTEL_LOG_ASSISTANT_RESPONSES=1`。与来自 Claude Code 的所有 OpenTelemetry 数据一样，响应文本仅发送到您配置的 OTel 端点，永远不会发送到 Anthropic。当此变量未设置时，`OTEL_LOG_USER_PROMPTS` 用作后备，因此如果您想要提示内容而不要响应内容，请设置 `OTEL_LOG_ASSISTANT_RESPONSES=0`
* 默认情况下不记录工具输入参数和参数。要包含它们，请设置 `OTEL_LOG_TOOL_DETAILS=1`。此数据仅发送到您配置的 OTEL 端点，永远不会发送到 Anthropic。参数仍可能包含敏感值，因此请根据需要配置您的遥测后端以过滤或编辑这些属性。启用后：
  * `tool_result` 和 `tool_decision` 事件包含 `tool_parameters` 属性，其中包含 Bash 命令、MCP 服务器和工具名称以及技能名称。`full_command` 等字段以未截断的形式发出
  * `tool_result` 事件另外包含 `tool_input` 属性，其中包含文件路径、URL、搜索模式和其他参数。超过 512 个字符的单个值被截断，总数限制为约 4 K 字符
  * `user_prompt` 事件包含自定义、插件和 MCP 命令的逐字 `command_name`
  * Trace spans 包含相同的 `tool_input` 属性和输入派生属性（如 `file_path`），与 `tool_input` 的截断方式相同
* 默认情况下，trace spans 中不记录工具输入和输出内容。要包含它，请设置 `OTEL_LOG_TOOL_CONTENT=1`。启用后，span 事件包含完整的工具输入和输出内容，在每个 span 处截断为 60 KB。这可能包括 Read 工具结果中的原始文件内容和 Bash 命令输出。根据需要配置您的遥测后端以过滤或编辑这些属性
* 默认情况下不记录原始 Anthropic Messages API 请求和响应主体。要包含它们，请设置 `OTEL_LOG_RAW_API_BODIES`。使用 `=1` 时，每个 API 调用发出 `api_request_body` 和 `api_response_body` 日志事件，其 `body` 属性是 JSON 序列化的有效负载，在 60 KB 处截断。使用 `=file:<dir>` 时，未截断的主体写入该目录下的 `.request.json` 和 `.response.json` 文件，事件携带 `body_ref` 路径而不是内联主体。使用日志收集器或 sidecar 而不是通过遥测流传输目录。在两种模式下，主体包含完整的对话历史（系统提示、每个先前的用户和助手轮次、工具结果），因此启用此选项意味着同意其他 `OTEL_LOG_*` 内容标志会揭示的所有内容。Claude 的扩展思考内容始终从这些主体中编辑，无论其他设置如何

<h2 id="monitor-claude-code-on-amazon-bedrock">
  在 Amazon Bedrock 上监控 Claude Code
</h2>

有关 Amazon Bedrock 的 Claude Code 使用情况监控指南的详细信息，请参阅 [Claude Code 监控实现 (Amazon Bedrock)](https://github.com/aws-solutions-library-samples/guidance-for-claude-code-with-amazon-bedrock/blob/main/assets/docs/MONITORING.md)。
