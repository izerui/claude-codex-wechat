> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Agent SDK 参考 - TypeScript

> TypeScript Agent SDK 的完整 API 参考，包括所有函数、类型和接口。

<script src="/docs/components/typescript-sdk-type-links.js" defer />

<h2 id="installation">
  安装
</h2>

```bash theme={null}
npm install @anthropic-ai/claude-agent-sdk
```

<Note>
  SDK 为您的平台捆绑了一个本地 Claude Code 二进制文件，作为可选依赖项，例如 `@anthropic-ai/claude-agent-sdk-darwin-arm64`。您无需单独安装 Claude Code。如果您的包管理器跳过可选依赖项，SDK 会抛出 `Native CLI binary for <platform> not found`；改为将 [`pathToClaudeCodeExecutable`](#options) 设置为单独安装的 `claude` 二进制文件。
</Note>

<h3 id="compile-to-a-single-executable">
  编译为单个可执行文件
</h3>

当您使用 `bun build --compile` 将应用程序编译为单文件可执行文件时，SDK 无法在运行时解析捆绑的 CLI 二进制文件。`require.resolve` 在编译后的可执行文件的 `$bunfs` 虚拟文件系统内不起作用，因此 SDK 会抛出 `Native CLI binary for <platform> not found`。

要解决此问题，请将平台二进制文件作为文件资产嵌入，在启动时使用 `extractFromBunfs()` 将其提取到真实路径，然后将该路径传递给 [`pathToClaudeCodeExecutable`](#options)。

`extractFromBunfs()` 辅助函数需要 `@anthropic-ai/claude-agent-sdk` v0.3.144 或更高版本。下面的示例为 Apple Silicon 上的 macOS 构建：

```typescript theme={null}
import binPath from "@anthropic-ai/claude-agent-sdk-darwin-arm64/claude" with { type: "file" };
import { extractFromBunfs } from "@anthropic-ai/claude-agent-sdk/extract";
import { query } from "@anthropic-ai/claude-agent-sdk";

const cliPath = extractFromBunfs(binPath);

for await (const message of query({
  prompt: "Hello",
  options: { pathToClaudeCodeExecutable: cliPath },
})) {
  console.log(message);
}
```

`extractFromBunfs()` 将嵌入的二进制文件从编译后的可执行文件的虚拟文件系统复制到每个用户的临时目录，并返回真实路径。在编译后的可执行文件之外，它返回输入路径不变，因此相同的代码在开发中无需修改即可运行。

每个编译后的可执行文件都嵌入了单个平台的二进制文件。将导入中的平台包与您的 `--target` 匹配：

* 要进行交叉编译，请安装不匹配的平台包，例如 `npm install @anthropic-ai/claude-agent-sdk-linux-x64 --force`。
* 在 Windows 上，二进制文件子路径是 `claude.exe`，例如 `@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe`。

<h2 id="functions">
  函数
</h2>

<h3 id="query">
  `query()`
</h3>

与 Claude Code 交互的主要函数。创建一个异步生成器，在消息到达时流式传输消息。

```typescript theme={null}
function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

<h4 id="parameters">
  参数
</h4>

| 参数        | 类型                                                               | 描述                          |
| :-------- | :--------------------------------------------------------------- | :-------------------------- |
| `prompt`  | `string \| AsyncIterable<`[`SDKUserMessage`](#sdkusermessage)`>` | 输入提示，可以是字符串或异步可迭代对象（用于流式模式） |
| `options` | [`Options`](#options)                                            | 可选配置对象（请参阅下面的 Options 类型）   |

<h4 id="returns">
  返回值
</h4>

返回一个 [`Query`](#query-object) 对象，该对象扩展 `AsyncGenerator<`[`SDKMessage`](#sdkmessage)`, void>`，并具有其他方法。

<h3 id="startup">
  `startup()`
</h3>

通过生成 CLI 子进程并在提示可用之前完成初始化握手来预热 CLI 子进程。返回的 [`WarmQuery`](#warmquery) 句柄稍后接受提示并将其写入已准备好的进程，因此第一个 `query()` 调用解析时无需支付子进程生成和初始化成本。

```typescript theme={null}
function startup(params?: {
  options?: Options;
  initializeTimeoutMs?: number;
}): Promise<WarmQuery>;
```

<h4 id="parameters-2">
  参数
</h4>

| 参数                    | 类型                    | 描述                                                            |
| :-------------------- | :-------------------- | :------------------------------------------------------------ |
| `options`             | [`Options`](#options) | 可选配置对象。与 `query()` 的 `options` 参数相同                           |
| `initializeTimeoutMs` | `number`              | 等待子进程初始化的最长时间（毫秒）。默认为 `60000`。如果初始化未在规定时间内完成，promise 将以超时错误拒绝 |

<h4 id="returns-2">
  返回值
</h4>

返回一个 `Promise<`[`WarmQuery`](#warmquery)`>`，在子进程生成并完成其初始化握手后解析。

<h4 id="example">
  示例
</h4>

早期调用 `startup()`，例如在应用程序启动时，然后在提示准备好后在返回的句柄上调用 `.query()`。这会将子进程生成和初始化移出关键路径。

```typescript theme={null}
import { startup } from "@anthropic-ai/claude-agent-sdk";

// 提前支付启动成本
const warm = await startup({ options: { maxTurns: 3 } });

// 稍后，当提示准备好时，这是立即的
for await (const message of warm.query("What files are here?")) {
  console.log(message);
}
```

<h3 id="tool">
  `tool()`
</h3>

为与 SDK MCP 服务器一起使用创建类型安全的 MCP 工具定义。

```typescript theme={null}
function tool<Schema extends AnyZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
  extras?: { annotations?: ToolAnnotations }
): SdkMcpToolDefinition<Schema>;
```

<h4 id="parameters-3">
  参数
</h4>

| 参数            | 类型                                                                | 描述                                 |
| :------------ | :---------------------------------------------------------------- | :--------------------------------- |
| `name`        | `string`                                                          | 工具的名称                              |
| `description` | `string`                                                          | 工具功能的描述                            |
| `inputSchema` | `Schema extends AnyZodRawShape`                                   | 定义工具输入参数的 Zod 架构（支持 Zod 3 和 Zod 4） |
| `handler`     | `(args, extra) => Promise<`[`CallToolResult`](#calltoolresult)`>` | 执行工具逻辑的异步函数                        |
| `extras`      | `{ annotations?: `[`ToolAnnotations`](#toolannotations)` }`       | 可选的 MCP 工具注释，为客户端提供行为提示            |

<h4 id="toolannotations">
  `ToolAnnotations`
</h4>

从 `@modelcontextprotocol/sdk/types.js` 重新导出。所有字段都是可选提示；客户端不应依赖它们做出安全决策。

| 字段                | 类型        | 默认值         | 描述                                                             |
| :---------------- | :-------- | :---------- | :------------------------------------------------------------- |
| `title`           | `string`  | `undefined` | 工具的人类可读标题                                                      |
| `readOnlyHint`    | `boolean` | `false`     | 如果为 `true`，工具不会修改其环境                                           |
| `destructiveHint` | `boolean` | `true`      | 如果为 `true`，工具可能执行破坏性更新（仅在 `readOnlyHint` 为 `false` 时有意义）       |
| `idempotentHint`  | `boolean` | `false`     | 如果为 `true`，使用相同参数的重复调用没有额外效果（仅在 `readOnlyHint` 为 `false` 时有意义） |
| `openWorldHint`   | `boolean` | `true`      | 如果为 `true`，工具与外部实体交互（例如，网络搜索）。如果为 `false`，工具的域是封闭的（例如，内存工具）    |

```typescript theme={null}
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const searchTool = tool(
  "search",
  "Search the web",
  { query: z.string() },
  async ({ query }) => {
    return { content: [{ type: "text", text: `Results for: ${query}` }] };
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);
```

<h3 id="createsdkmcpserver">
  `createSdkMcpServer()`
</h3>

创建在与应用程序相同的进程中运行的 MCP 服务器实例。

```typescript theme={null}
function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools?: Array<SdkMcpToolDefinition<any>>;
}): McpSdkServerConfigWithInstance;
```

<h4 id="parameters-4">
  参数
</h4>

| 参数                | 类型                            | 描述                             |
| :---------------- | :---------------------------- | :----------------------------- |
| `options.name`    | `string`                      | MCP 服务器的名称                     |
| `options.version` | `string`                      | 可选版本字符串                        |
| `options.tools`   | `Array<SdkMcpToolDefinition>` | 使用 [`tool()`](#tool) 创建的工具定义数组 |

<h3 id="listsessions">
  `listSessions()`
</h3>

发现并列出具有轻量级元数据的过去会话。按项目目录筛选或列出所有项目中的会话。

```typescript theme={null}
function listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;
```

<h4 id="parameters-5">
  参数
</h4>

| 参数                         | 类型        | 默认值         | 描述                                        |
| :------------------------- | :-------- | :---------- | :---------------------------------------- |
| `options.dir`              | `string`  | `undefined` | 列出会话的目录。省略时，返回所有项目中的会话                    |
| `options.limit`            | `number`  | `undefined` | 要返回的最大会话数                                 |
| `options.includeWorktrees` | `boolean` | `true`      | 当 `dir` 在 git 存储库内时，包括来自所有 worktree 路径的会话 |

<h4 id="return-type-sdksessioninfo">
  返回类型：`SDKSessionInfo`
</h4>

| 属性             | 类型                    | 描述                                           |
| :------------- | :-------------------- | :------------------------------------------- |
| `sessionId`    | `string`              | 唯一会话标识符 (UUID)                               |
| `summary`      | `string`              | 显示标题：自定义标题、自动生成的摘要或第一个提示                     |
| `lastModified` | `number`              | 上次修改时间（自纪元以来的毫秒数）                            |
| `fileSize`     | `number \| undefined` | 会话文件大小（字节）。仅对本地 JSONL 存储进行填充                 |
| `customTitle`  | `string \| undefined` | 用户设置的会话标题（通过 `/rename`）                      |
| `firstPrompt`  | `string \| undefined` | 会话中的第一个有意义的用户提示                              |
| `gitBranch`    | `string \| undefined` | 会话结束时的 git 分支                                |
| `cwd`          | `string \| undefined` | 会话的工作目录                                      |
| `tag`          | `string \| undefined` | 用户设置的会话标签（请参阅 [`tagSession()`](#tagsession)） |
| `createdAt`    | `number \| undefined` | 创建时间（自纪元以来的毫秒数），来自第一个条目的时间戳                  |

<h4 id="example-2">
  示例
</h4>

打印项目的 10 个最近会话。结果按 `lastModified` 降序排序，因此第一项是最新的。省略 `dir` 以搜索所有项目。

```typescript theme={null}
import { listSessions } from "@anthropic-ai/claude-agent-sdk";

const sessions = await listSessions({ dir: "/path/to/project", limit: 10 });

for (const session of sessions) {
  console.log(`${session.summary} (${session.sessionId})`);
}
```

<h3 id="getsessionmessages">
  `getSessionMessages()`
</h3>

从过去的会话记录中读取用户和助手消息。

```typescript theme={null}
function getSessionMessages(
  sessionId: string,
  options?: GetSessionMessagesOptions
): Promise<SessionMessage[]>;
```

<h4 id="parameters-6">
  参数
</h4>

| 参数               | 类型       | 默认值         | 描述                                |
| :--------------- | :------- | :---------- | :-------------------------------- |
| `sessionId`      | `string` | 必需          | 要读取的会话 UUID（请参阅 `listSessions()`） |
| `options.dir`    | `string` | `undefined` | 查找会话的项目目录。省略时，搜索所有项目              |
| `options.limit`  | `number` | `undefined` | 要返回的最大消息数                         |
| `options.offset` | `number` | `undefined` | 从开始跳过的消息数                         |

<h4 id="return-type-sessionmessage">
  返回类型：`SessionMessage`
</h4>

| 属性                   | 类型                      | 描述                                                                                                                                           |
| :------------------- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`               | `"user" \| "assistant"` | 消息角色                                                                                                                                         |
| `uuid`               | `string`                | 唯一消息标识符                                                                                                                                      |
| `session_id`         | `string`                | 此消息所属的会话                                                                                                                                     |
| `message`            | `unknown`               | 来自记录的原始消息有效负载                                                                                                                                |
| `parent_tool_use_id` | `string \| null`        | 对于子代理消息，生成 `Agent` 工具调用的 `tool_use_id`。对于主会话消息和较旧的会话为 `null`                                                                                 |
| `parent_agent_id`    | `string \| null`        | 对于来自[嵌套子代理](/docs/zh-CN/sub-agents#spawn-nested-subagents)的消息，生成该消息的子代理的 `agentId`。对于主会话消息、来自顶级子代理的消息和较旧的会话为 `null`。需要 Claude Code v2.1.202 或更高版本 |

<h4 id="example-3">
  示例
</h4>

```typescript theme={null}
import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

const [latest] = await listSessions({ dir: "/path/to/project", limit: 1 });

if (latest) {
  const messages = await getSessionMessages(latest.sessionId, {
    dir: "/path/to/project",
    limit: 20
  });

  for (const msg of messages) {
    console.log(`[${msg.type}] ${msg.uuid}`);
  }
}
```

<h3 id="getsessioninfo">
  `getSessionInfo()`
</h3>

按 ID 读取单个会话的元数据，无需扫描完整项目目录。

```typescript theme={null}
function getSessionInfo(
  sessionId: string,
  options?: GetSessionInfoOptions
): Promise<SDKSessionInfo | undefined>;
```

<h4 id="parameters-7">
  参数
</h4>

| 参数            | 类型       | 默认值         | 描述                  |
| :------------ | :------- | :---------- | :------------------ |
| `sessionId`   | `string` | 必需          | 要查找的会话 UUID         |
| `options.dir` | `string` | `undefined` | 项目目录路径。省略时，搜索所有项目目录 |

返回 [`SDKSessionInfo`](#return-type-sdksessioninfo)，如果找不到会话，则返回 `undefined`。

<h3 id="renamesession">
  `renameSession()`
</h3>

通过附加自定义标题条目来重命名会话。重复调用是安全的；最新的标题获胜。

```typescript theme={null}
function renameSession(
  sessionId: string,
  title: string,
  options?: SessionMutationOptions
): Promise<void>;
```

<h4 id="parameters-8">
  参数
</h4>

| 参数            | 类型       | 默认值         | 描述                  |
| :------------ | :------- | :---------- | :------------------ |
| `sessionId`   | `string` | 必需          | 要重命名的会话 UUID        |
| `title`       | `string` | 必需          | 新标题。修剪空格后必须非空       |
| `options.dir` | `string` | `undefined` | 项目目录路径。省略时，搜索所有项目目录 |

<h3 id="tagsession">
  `tagSession()`
</h3>

标记会话。传递 `null` 以清除标签。重复调用是安全的；最新的标签获胜。

```typescript theme={null}
function tagSession(
  sessionId: string,
  tag: string | null,
  options?: SessionMutationOptions
): Promise<void>;
```

<h4 id="parameters-9">
  参数
</h4>

| 参数            | 类型               | 默认值         | 描述                  |
| :------------ | :--------------- | :---------- | :------------------ |
| `sessionId`   | `string`         | 必需          | 要标记的会话 UUID         |
| `tag`         | `string \| null` | 必需          | 标签字符串，或 `null` 以清除  |
| `options.dir` | `string`         | `undefined` | 项目目录路径。省略时，搜索所有项目目录 |

<h3 id="resolvesettings">
  `resolveSettings()`
</h3>

使用与 CLI 相同的合并引擎为给定目录解析有效的 Claude Code 设置，无需生成 Claude CLI。在调用 `query()` 之前使用它来检查 `query()` 调用将看到的配置。

<Note>
  此函数处于 alpha 阶段，其 API 在稳定之前可能会更改。它读取 MDM 源，包括 macOS plist 和 Windows HKLM/HKCU，以与 CLI 启动保持一致，但不执行管理员配置的 `policyHelper` 子进程。`permissions.defaultMode` 字段从所有层级（包括项目设置）按原样返回。CLI 在遵守升级权限模式之前应用的信任过滤器不被应用。
</Note>

```typescript theme={null}
function resolveSettings(
  options?: ResolveSettingsOptions
): Promise<ResolvedSettings>;
```

<h4 id="parameters-10">
  参数
</h4>

`resolveSettings()` 接受单个选项对象。所有字段都是可选的。

| 参数                              | 类型                                    | 默认值             | 描述                                                                                                                                                                 |
| :------------------------------ | :------------------------------------ | :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options.cwd`                   | `string`                              | `process.cwd()` | 用于解析项目和本地设置的相对目录                                                                                                                                                   |
| `options.settingSources`        | [`SettingSource`](#settingsource)`[]` | 所有源             | 要加载的文件系统源。传递 `[]` 以跳过用户、项目和本地设置。[端点管理的策略](/docs/zh-CN/settings#settings-files)在所有情况下都会加载。服务器管理的设置取自主机传递的 `serverManagedSettings`，或从 CLI 的磁盘缓存中读取；快照不会从网络获取它们            |
| `options.managedSettings`       | `Settings`                            | `undefined`     | 由嵌入主机提供的限制性策略层设置。当存在管理员部署的托管层时被删除；当 [`parentSettingsBehavior`](/docs/zh-CN/settings#available-settings) 为 `"merge"` 时在该层下合并。非限制性密钥（如 `model`）会被静默删除，以便此选项可以加强托管策略但不能放松它 |
| `options.serverManagedSettings` | `Settings`                            | `undefined`     | 来自 `/api/claude_code/settings` 的服务器托管设置有效负载。非限制性密钥不经过滤地通过                                                                                                          |

<h4 id="return-type-resolvedsettings">
  返回类型：`ResolvedSettings`
</h4>

`resolveSettings()` 返回一个对象，描述合并的设置和为每个密钥提供的源。

| 属性           | 类型                                                  | 描述                               |
| :----------- | :-------------------------------------------------- | :------------------------------- |
| `effective`  | `Settings`                                          | 在按优先级顺序应用所有启用的源后合并的设置            |
| `provenance` | `Partial<Record<keyof Settings, ProvenanceEntry>>`  | 对于 `effective` 中的每个顶级密钥，哪个源提供了该值 |
| `sources`    | `Array<{ source, settings, path?, policyOrigin? }>` | 每个源的原始设置，按从最低到最高优先级排序            |

<h4 id="example-4">
  示例
</h4>

下面的示例为项目目录解析设置，并打印控制清理周期的源。

```typescript theme={null}
import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";

const { effective, provenance } = await resolveSettings({
  cwd: "/path/to/project",
  settingSources: ["user", "project", "local"],
});

console.log(`Cleanup period: ${effective.cleanupPeriodDays} days`);
console.log(`Set by: ${provenance.cleanupPeriodDays?.source}`);
```

<h2 id="types">
  类型
</h2>

<h3 id="options">
  `Options`
</h3>

`query()` 函数的配置对象。

| 属性                                | 类型                                                                                                       | 默认值                           | 描述                                                                                                                                                                                                                                                                                                                                                                                                              |
| :-------------------------------- | :------------------------------------------------------------------------------------------------------- | :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abortController`                 | `AbortController`                                                                                        | `new AbortController()`       | 用于取消操作的控制器                                                                                                                                                                                                                                                                                                                                                                                                      |
| `additionalDirectories`           | `string[]`                                                                                               | `[]`                          | Claude 可以访问的其他目录                                                                                                                                                                                                                                                                                                                                                                                                |
| `agent`                           | `string`                                                                                                 | `undefined`                   | 主线程的代理名称。代理必须在 `agents` 选项或设置中定义                                                                                                                                                                                                                                                                                                                                                                                |
| `agents`                          | `Record<string, [`AgentDefinition`](#agentdefinition)>`                                                  | `undefined`                   | 以编程方式定义子代理                                                                                                                                                                                                                                                                                                                                                                                                      |
| `agentProgressSummaries`          | `boolean`                                                                                                | `false`                       | 当为 `true` 时，为子代理生成单行进度摘要，并通过 `summary` 字段在 [`task_progress`](#sdktaskprogressmessage) 事件上转发它们。适用于前台和后台子代理                                                                                                                                                                                                                                                                                                       |
| `allowDangerouslySkipPermissions` | `boolean`                                                                                                | `false`                       | 启用绕过权限。使用 `permissionMode: 'bypassPermissions'` 时需要                                                                                                                                                                                                                                                                                                                                                             |
| `allowedTools`                    | `string[]`                                                                                               | `[]`                          | 无需提示即可自动批准的工具。这不会将 Claude 限制为仅这些工具；未列出的工具会通过 `permissionMode` 和 `canUseTool` 进行处理。使用 `disallowedTools` 阻止工具。请参阅[权限](/docs/zh-CN/agent-sdk/permissions#allow-and-deny-rules)                                                                                                                                                                                                                                          |
| `betas`                           | [`SdkBeta`](#sdkbeta)`[]`                                                                                | `[]`                          | 启用测试功能                                                                                                                                                                                                                                                                                                                                                                                                          |
| `canUseTool`                      | [`CanUseTool`](#canusetool)                                                                              | `undefined`                   | 自定义权限函数，仅在[权限流](/docs/zh-CN/agent-sdk/permissions#how-permissions-are-evaluated)落到提示时调用。不会为 `allowedTools`、allow 规则或 `permissionMode` 自动批准的调用调用。`AskUserQuestion`、connector 工具[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools)和标记为 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具即使您已允许它们也会到达它；在 `dontAsk` 模式下这些会被拒绝。请参阅 [`CanUseTool`](#canusetool) 了解详情 |
| `continue`                        | `boolean`                                                                                                | `false`                       | 继续最近的对话                                                                                                                                                                                                                                                                                                                                                                                                         |
| `cwd`                             | `string`                                                                                                 | `process.cwd()`               | 当前工作目录                                                                                                                                                                                                                                                                                                                                                                                                          |
| `debug`                           | `boolean`                                                                                                | `false`                       | 为 Claude Code 进程启用调试模式                                                                                                                                                                                                                                                                                                                                                                                          |
| `debugFile`                       | `string`                                                                                                 | `undefined`                   | 将调试日志写入特定文件路径。隐式启用调试模式                                                                                                                                                                                                                                                                                                                                                                                          |
| `disallowedTools`                 | `string[]`                                                                                               | `[]`                          | 要拒绝的工具。裸名称如 `"Bash"` 会从 Claude 的上下文中移除该工具。作用域规则如 `"Bash(rm *)"` 会保留该工具可用，并在每个权限模式（包括 `bypassPermissions`）中拒绝匹配的调用。请参阅[权限](/docs/zh-CN/agent-sdk/permissions#allow-and-deny-rules)                                                                                                                                                                                                                                    |
| `effort`                          | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'`                                                        | 模型默认值                         | 控制 Claude 在其响应中投入的努力程度。与自适应思考一起工作以指导思考深度。请参阅[调整努力级别](/docs/zh-CN/model-config#adjust-effort-level)                                                                                                                                                                                                                                                                                                                   |
| `enableFileCheckpointing`         | `boolean`                                                                                                | `false`                       | 启用文件更改跟踪以进行回滚。请参阅[文件 checkpointing](/docs/zh-CN/agent-sdk/file-checkpointing)                                                                                                                                                                                                                                                                                                                                        |
| `env`                             | `Record<string, string \| undefined>`                                                                    | `process.env`                 | 环境变量。设置此选项时，这会替换子进程环境而不是与 `process.env` 合并，因此请传递 `{ ...process.env, YOUR_VAR: 'value' }` 以保留继承的变量如 `PATH`。请参阅[处理缓慢或停滞的 API 响应](#handle-slow-or-stalled-api-responses)了解此模式的示例，以及[环境变量](/docs/zh-CN/env-vars)了解底层 CLI 读取的变量。设置 `CLAUDE_AGENT_SDK_CLIENT_APP` 以在 User-Agent 标头中标识您的应用                                                                                                                                  |
| `executable`                      | `'bun' \| 'deno' \| 'node'`                                                                              | 自动检测                          | 要使用的 JavaScript 运行时                                                                                                                                                                                                                                                                                                                                                                                             |
| `executableArgs`                  | `string[]`                                                                                               | `[]`                          | 传递给可执行文件的参数                                                                                                                                                                                                                                                                                                                                                                                                     |
| `extraArgs`                       | `Record<string, string \| null>`                                                                         | `{}`                          | 其他参数                                                                                                                                                                                                                                                                                                                                                                                                            |
| `fallbackModel`                   | `string`                                                                                                 | `undefined`                   | 主模型失败时使用的模型                                                                                                                                                                                                                                                                                                                                                                                                     |
| `forkSession`                     | `boolean`                                                                                                | `false`                       | 使用 `resume` 恢复时，分叉到新会话 ID 而不是继续原始会话                                                                                                                                                                                                                                                                                                                                                                             |
| `forwardSubagentText`             | `boolean`                                                                                                | `false`                       | 转发子代理文本和思考块作为助手和用户消息，并设置 `parent_tool_use_id`，以便消费者可以呈现嵌套记录。默认情况下，仅从子代理发出 `tool_use` 和 `tool_result` 块                                                                                                                                                                                                                                                                                                          |
| `hooks`                           | `Partial<Record<`[`HookEvent`](#hookevent)`, `[`HookCallbackMatcher`](#hookcallbackmatcher)`[]>>`        | `{}`                          | 事件的 Hook 回调                                                                                                                                                                                                                                                                                                                                                                                                     |
| `includeHookEvents`               | `boolean`                                                                                                | `false`                       | 在消息流中包括 hook 生命周期事件，作为 [`SDKHookStartedMessage`](#sdkhookstartedmessage)、[`SDKHookProgressMessage`](#sdkhookprogressmessage) 和 [`SDKHookResponseMessage`](#sdkhookresponsemessage)。`SessionStart` 和 `Setup` hooks 的生命周期事件始终包括在内，不需要此选项                                                                                                                                                                          |
| `includePartialMessages`          | `boolean`                                                                                                | `false`                       | 包括部分消息事件                                                                                                                                                                                                                                                                                                                                                                                                        |
| `loadTimeoutMs`                   | `number`                                                                                                 | `60000`                       | *Alpha.* 每个 `sessionStore.load()` 和 `sessionStore.listSubkeys()` 调用在恢复物化期间的超时时间（以毫秒为单位）。如果适配器未在此窗口内解决，查询将失败而不是挂起。未设置 `sessionStore` 时忽略                                                                                                                                                                                                                                                                         |
| `managedSettings`                 | `Settings`                                                                                               | `undefined`                   | 由生成的父进程提供的策略层设置。当机器上已存在 IT 控制的托管设置层时删除，除非该管理员选择使用 `parentSettingsBehavior: 'merge'`。无论如何都会过滤为仅限制性键                                                                                                                                                                                                                                                                                                              |
| `maxBudgetUsd`                    | `number`                                                                                                 | `undefined`                   | 当客户端成本估计达到此 USD 值时停止查询。与 `total_cost_usd` 的相同估计进行比较；请参阅[跟踪成本和使用情况](/docs/zh-CN/agent-sdk/cost-tracking)了解准确性注意事项                                                                                                                                                                                                                                                                                                     |
| `maxThinkingTokens`               | `number`                                                                                                 | `undefined`                   | *已弃用：* 改用 `thinking`。思考过程的最大令牌数                                                                                                                                                                                                                                                                                                                                                                                 |
| `maxTurns`                        | `number`                                                                                                 | `undefined`                   | 最大代理轮次（工具使用往返）                                                                                                                                                                                                                                                                                                                                                                                                  |
| `mcpServers`                      | `Record<string, [`McpServerConfig`](#mcpserverconfig)>`                                                  | `{}`                          | MCP 服务器配置                                                                                                                                                                                                                                                                                                                                                                                                       |
| `model`                           | `string`                                                                                                 | CLI 的默认值                      | Claude 模型别名或完整模型名称。请参阅[接受的值和特定于提供商的 ID](/docs/zh-CN/model-config#available-models)                                                                                                                                                                                                                                                                                                                                   |
| `onElicitation`                   | `(request: ElicitationRequest, options: { signal: AbortSignal }) => Promise<ElicitationResult>`          | `undefined`                   | 用于处理 MCP 引出请求的回调。当 MCP 服务器请求用户输入且没有 hook 首先处理它时调用。未提供时，未处理的引出请求会自动被拒绝                                                                                                                                                                                                                                                                                                                                           |
| `outputFormat`                    | `{ type: 'json_schema', schema: JSONSchema }`                                                            | `undefined`                   | 为代理结果定义输出格式。请参阅[结构化输出](/docs/zh-CN/agent-sdk/structured-outputs)了解详情                                                                                                                                                                                                                                                                                                                                                 |
| `outputStyle`                     | `string`                                                                                                 | `undefined`                   | 不是 `Options` 字段。改为在内联 [`settings`](/docs/zh-CN/settings) 对象或设置文件中设置 `outputStyle`。请参阅[激活输出样式](/docs/zh-CN/agent-sdk/modifying-system-prompts#activate-an-output-style)                                                                                                                                                                                                                                                    |
| `pathToClaudeCodeExecutable`      | `string`                                                                                                 | 从捆绑的本地二进制文件自动解析               | Claude Code 可执行文件的路径。仅在安装期间跳过可选依赖项或您的平台不在支持的集合中时需要                                                                                                                                                                                                                                                                                                                                                              |
| `permissionMode`                  | [`PermissionMode`](#permissionmode)                                                                      | `'default'`                   | 会话的权限模式                                                                                                                                                                                                                                                                                                                                                                                                         |
| `permissionPromptToolName`        | `string`                                                                                                 | `undefined`                   | 权限提示的 MCP 工具名称                                                                                                                                                                                                                                                                                                                                                                                                  |
| `persistSession`                  | `boolean`                                                                                                | `true`                        | 当为 `false` 时，禁用会话持久化到磁盘。会话之后无法恢复                                                                                                                                                                                                                                                                                                                                                                                |
| `planModeInstructions`            | `string`                                                                                                 | `undefined`                   | Plan Mode 的自定义工作流说明。当 `permissionMode` 为 `'plan'` 时，此字符串替换默认 Plan Mode 工作流正文。CLI 仍然使用只读强制前导和 ExitPlanMode 协议页脚包装它                                                                                                                                                                                                                                                                                               |
| `plugins`                         | [`SdkPluginConfig`](#sdkpluginconfig)`[]`                                                                | `[]`                          | 从本地路径加载自定义 plugins。请参阅[Plugins](/docs/zh-CN/agent-sdk/plugins)了解详情                                                                                                                                                                                                                                                                                                                                                   |
| `promptSuggestions`               | `boolean`                                                                                                | `false`                       | 启用提示建议。在每个轮次后发出 `prompt_suggestion` 消息，包含预测的下一个用户提示                                                                                                                                                                                                                                                                                                                                                             |
| `resume`                          | `string`                                                                                                 | `undefined`                   | 要恢复的会话 ID                                                                                                                                                                                                                                                                                                                                                                                                       |
| `resumeSessionAt`                 | `string`                                                                                                 | `undefined`                   | 在特定消息 UUID 处恢复会话                                                                                                                                                                                                                                                                                                                                                                                                |
| `sandbox`                         | [`SandboxSettings`](#sandboxsettings)                                                                    | `undefined`                   | 以编程方式配置 sandbox 行为。请参阅[Sandbox 设置](#sandboxsettings)了解详情                                                                                                                                                                                                                                                                                                                                                        |
| `sessionId`                       | `string`                                                                                                 | 自动生成                          | 为会话使用特定的 UUID 而不是自动生成一个                                                                                                                                                                                                                                                                                                                                                                                         |
| `sessionStore`                    | [`SessionStore`](/docs/zh-CN/agent-sdk/session-storage#the-sessionstore-interface)                            | `undefined`                   | 将会话记录镜像到外部后端，以便任何主机都可以恢复它们。请参阅[将会话持久化到外部存储](/docs/zh-CN/agent-sdk/session-storage)                                                                                                                                                                                                                                                                                                                                   |
| `sessionStoreFlush`               | `'batched' \| 'eager'`                                                                                   | `'batched'`                   | *Alpha.* `sessionStore` 的刷新模式。未设置 `sessionStore` 时忽略                                                                                                                                                                                                                                                                                                                                                            |
| `settings`                        | `string \| Settings`                                                                                     | `undefined`                   | 内联[设置](/docs/zh-CN/settings)对象或设置文件的路径。填充[优先级顺序](/docs/zh-CN/settings#settings-precedence)中的标志设置层。使用 [`applyFlagSettings()`](#applyflagsettings) 在运行时更改                                                                                                                                                                                                                                                                   |
| `settingSources`                  | [`SettingSource`](#settingsource)`[]`                                                                    | CLI 默认值（所有源）                  | 控制加载哪些文件系统设置。传递 `[]` 以禁用用户、项目和本地设置。[端点管理的策略](/docs/zh-CN/settings#settings-files)无论如何都会加载；当会话使用组织凭证在[符合条件的配置](/docs/zh-CN/server-managed-settings#platform-availability)上进行身份验证时，会获取服务器管理的设置。请参阅[使用 Claude Code 功能](/docs/zh-CN/agent-sdk/claude-code-features#what-settingsources-does-not-control)                                                                                                                           |
| `skills`                          | `string[] \| 'all'`                                                                                      | `undefined`                   | 会话可用的 skills。传递 `'all'` 以启用每个发现的 skill，或传递 skill 名称列表。设置后，SDK 会自动将 Skill 工具添加到 `allowedTools`。如果您也传递 `tools`，请在该列表中包含 `'Skill'`。请参阅[Skills](/docs/zh-CN/agent-sdk/skills)                                                                                                                                                                                                                                            |
| `spawnClaudeCodeProcess`          | `(options: SpawnOptions) => SpawnedProcess`                                                              | `undefined`                   | 用于生成 Claude Code 进程的自定义函数。用于在 VM、容器或远程环境中运行 Claude Code                                                                                                                                                                                                                                                                                                                                                         |
| `stderr`                          | `(data: string) => void`                                                                                 | `undefined`                   | stderr 输出的回调                                                                                                                                                                                                                                                                                                                                                                                                    |
| `strictMcpConfig`                 | `boolean`                                                                                                | `false`                       | 仅使用在 `mcpServers` 中传递的服务器，并忽略项目 `.mcp.json`、用户设置、plugin 提供的 MCP 服务器和[claude.ai connectors](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai)                                                                                                                                                                                                                                                                           |
| `systemPrompt`                    | `string \| { type: 'preset'; preset: 'claude_code'; append?: string; excludeDynamicSections?: boolean }` | `undefined`（最小提示）             | 系统提示配置。传递字符串以获取自定义提示，或 `{ type: 'preset', preset: 'claude_code' }` 以使用 Claude Code 的系统提示。使用预设对象形式时，添加 `append` 以使用其他说明扩展它，并设置 `excludeDynamicSections: true` 以将每个会话上下文移到第一条用户消息中，以便[更好地跨机器重用提示缓存](/docs/zh-CN/agent-sdk/modifying-system-prompts#improve-prompt-caching-across-users-and-machines)                                                                                                                   |
| `taskBudget`                      | `{ total: number }`                                                                                      | `undefined`                   | *Alpha.* API 端任务预算（以令牌为单位）。设置后，模型会被告知其剩余令牌预算，以便它可以调整工具使用速度并在达到限制前完成                                                                                                                                                                                                                                                                                                                                             |
| `thinking`                        | [`ThinkingConfig`](#thinkingconfig)                                                                      | 支持的模型为 `{ type: 'adaptive' }` | 控制 Claude 的思考/推理行为。请参阅 [`ThinkingConfig`](#thinkingconfig) 了解选项                                                                                                                                                                                                                                                                                                                                                 |
| `title`                           | `string`                                                                                                 | `undefined`                   | 会话的显示标题。通过 `resume` 或 `continue` 恢复时，恢复的会话的持久化标题优先；使用 [`renameSession()`](#renamesession) 重新标题现有会话                                                                                                                                                                                                                                                                                                              |
| `toolAliases`                     | `Record<string, string>`                                                                                 | `undefined`                   | 将内置工具名称映射到 MCP 工具名称，以便 Claude 调用您的 MCP 实现而不是内置工具。例如，`{ Bash: 'mcp__workspace__bash' }`                                                                                                                                                                                                                                                                                                                          |
| `toolConfig`                      | [`ToolConfig`](#toolconfig)                                                                              | `undefined`                   | 内置工具行为的配置。请参阅 [`ToolConfig`](#toolconfig) 了解详情                                                                                                                                                                                                                                                                                                                                                                  |
| `tools`                           | `string[] \| { type: 'preset'; preset: 'claude_code' }`                                                  | `undefined`                   | 工具配置。传递工具名称数组或使用预设获取 Claude Code 的默认工具                                                                                                                                                                                                                                                                                                                                                                          |

<h4 id="handle-slow-or-stalled-api-responses">
  处理缓慢或停滞的 API 响应
</h4>

CLI 子进程读取多个环境变量，这些变量控制 API 超时和停滞检测。通过 `env` 选项传递它们：

```typescript theme={null}
const result = query({
  prompt: "Analyze this code",
  options: {
    env: {
      ...process.env,
      API_TIMEOUT_MS: "120000",
      CLAUDE_CODE_MAX_RETRIES: "2",
      CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: "120000",
    },
  },
});
```

* `API_TIMEOUT_MS`：Anthropic 客户端上的每个请求超时，以毫秒为单位。默认 `600000`。适用于主循环和所有子代理。
* `CLAUDE_CODE_MAX_RETRIES`：最大 API 重试次数。默认 `10`，上限为 `15`。每次重试都有自己的 `API_TIMEOUT_MS` 窗口，因此最坏情况下的实际时间大约是 `API_TIMEOUT_MS × (CLAUDE_CODE_MAX_RETRIES + 1)` 加上退避。对于需要等待更长时间中断的无人值守运行，设置 `CLAUDE_CODE_RETRY_WATCHDOG=1`：它无限期重试容量错误，从 Claude Code v2.1.199 开始，为其他瞬时错误提高默认值至 `300` 并移除此变量的上限。
* `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`：使用 `run_in_background` 启动的子代理的停滞监视程序。默认 `600000`。在每个流事件上重置；在停滞时中止子代理，将任务标记为失败，并将错误与任何部分结果一起呈现给父级。不适用于同步子代理。
* `CLAUDE_ENABLE_STREAM_WATCHDOG` 与 `CLAUDE_STREAM_IDLE_TIMEOUT_MS`：当标头已到达但响应正文停止流式传输时中止请求。监视程序对所有提供商默认启用；设置 `CLAUDE_ENABLE_STREAM_WATCHDOG=0` 以禁用它。`CLAUDE_STREAM_IDLE_TIMEOUT_MS` 默认为 `300000` 并被限制为该最小值。中止的请求通过正常重试路径进行。

<h3 id="query-object">
  `Query` 对象
</h3>

由 `query()` 函数返回的接口。

```typescript theme={null}
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<SDKControlInterruptResponse | undefined>;
  rewindFiles(
    userMessageId: string,
    options?: { dryRun?: boolean }
  ): Promise<RewindFilesResult>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;
  applyFlagSettings(settings: { [K in keyof Settings]?: Settings[K] | null }): Promise<void>;
  initializationResult(): Promise<SDKControlInitializeResponse>;
  reinitialize(): Promise<SDKControlInitializeResponse>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  supportedAgents(): Promise<AgentInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;
  reconnectMcpServer(serverName: string): Promise<void>;
  toggleMcpServer(serverName: string, enabled: boolean): Promise<void>;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
  stopTask(taskId: string): Promise<void>;
  close(): void;
}
```

<h4 id="methods">
  方法
</h4>

| 方法                                     | 描述                                                                                                                                                                                                                                 |
| :------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interrupt()`                          | 中断查询。仅在流式输入模式下可用。当 CLI 在 [`SDKSystemMessage.capabilities`](#sdksystemmessage) 中通告 `interrupt_receipt_v1` 功能时，使用列出存活中断的排队消息的 [`SDKControlInterruptResponse`](#sdkcontrolinterruptresponse) 进行解决。在 v2.1.205 之前的 CLI 上解决为 `undefined` |
| `rewindFiles(userMessageId, options?)` | 将文件恢复到指定用户消息时的状态。传递 `{ dryRun: true }` 以预览更改。需要 `enableFileCheckpointing: true`。请参阅[文件 checkpointing](/docs/zh-CN/agent-sdk/file-checkpointing)                                                                                         |
| `setPermissionMode()`                  | 更改权限模式（仅在流式输入模式下可用）                                                                                                                                                                                                                |
| `setModel()`                           | 更改模型（仅在流式输入模式下可用）                                                                                                                                                                                                                  |
| `setMaxThinkingTokens()`               | *已弃用：* 改用 `thinking` 选项。更改最大思考令牌数。传递 `null` 会将思考重置为会话默认值：清除中期覆盖，对于禁用思考的会话思考保持关闭                                                                                                                                                    |
| `applyFlagSettings(settings)`          | 在运行时将设置合并到会话的标志设置层中（仅在流式输入模式下可用）。请参阅 [`applyFlagSettings()`](#applyflagsettings)                                                                                                                                                   |
| `initializationResult()`               | 返回完整的初始化结果，包括支持的命令、模型、帐户信息和输出样式配置                                                                                                                                                                                                  |
| `reinitialize()`                       | 重新发送 `initialize` 控制请求到运行的 CLI，并返回新的结果而不是缓存的首次连接结果。在传输间隙后使用它，例如在断开连接后重新连接到会话，以便待处理的权限请求再次到达您的 `canUseTool` 回调。使回调对每个请求 ID 幂等，因为响应丢失的请求会再次分派。需要 Claude Code v2.1.195 或更高版本                                                          |
| `supportedCommands()`                  | 返回可用的 slash commands                                                                                                                                                                                                               |
| `supportedModels()`                    | 返回具有显示信息的可用模型                                                                                                                                                                                                                      |
| `supportedAgents()`                    | 返回可用的子代理作为 [`AgentInfo`](#agentinfo)`[]`                                                                                                                                                                                           |
| `mcpServerStatus()`                    | 返回连接的 MCP 服务器的状态                                                                                                                                                                                                                   |
| `accountInfo()`                        | 返回帐户信息                                                                                                                                                                                                                             |
| `reconnectMcpServer(serverName)`       | 按名称重新连接 MCP 服务器                                                                                                                                                                                                                    |
| `toggleMcpServer(serverName, enabled)` | 按名称启用或禁用 MCP 服务器                                                                                                                                                                                                                   |
| `setMcpServers(servers)`               | 动态替换此会话的 MCP 服务器集。返回有关添加、删除的服务器和任何错误的信息                                                                                                                                                                                            |
| `streamInput(stream)`                  | 将输入消息流式传输到查询以进行多轮对话                                                                                                                                                                                                                |
| `stopTask(taskId)`                     | 按 ID 停止运行的后台任务                                                                                                                                                                                                                     |
| `close()`                              | 关闭查询并终止底层进程。强制结束查询并清理所有资源                                                                                                                                                                                                          |

<h4 id="applyflagsettings">
  `applyFlagSettings()`
</h4>

在运行的会话上更改任何[设置](/docs/zh-CN/settings)而无需重新启动查询。当没有专用设置器的设置需要在会话中期更改时使用它，例如在代理读取不受信任的输入后收紧 `permissions`。`setModel()` 和 `setPermissionMode()` 是这两个键的专用设置器；`applyFlagSettings()` 是接受任何设置键子集的通用形式，在此处传递 `model` 的行为与 `setModel()` 相同。

仅某些键在会话中期生效：

* **在下一个轮次应用**：`model`、`effortLevel`、`ultracode`、`permissions`、`hooks`、`skillOverrides`、`fastMode`、`agent`。切换 `agent` 也会在下一个轮次应用该代理的模型覆盖、hooks 和系统提示。
* **会话中期无效**：系统提示选项。这些在启动时解决一次，因此运行的会话保持原始值，即使调用成功。要更改它们，请启动新会话。

`effortLevel` 接受一个[努力级别](/docs/zh-CN/model-config#adjust-effort-level)名称。它也接受 `"ultracode"`，它以 `xhigh` 努力运行会话并打开[ultracode](/docs/zh-CN/workflows#let-claude-decide-with-ultracode)。`Settings` 类型声明 `effortLevel` 不包含该值，因此在 TypeScript 中传递等效的 `{ ultracode: true }`。`ultracode` 值需要 Claude Code v2.1.203 或更高版本，仅由 `applyFlagSettings()` 接受，不由设置文件中的 `effortLevel` 键接受。

这些值被写入标志设置层，这是内联 `query()` 的 `settings` 选项在启动时填充的同一层。标志设置位于[设置优先级顺序](/docs/zh-CN/settings#settings-precedence)的顶部附近：它们覆盖用户、项目和本地设置，只有托管策略设置可以覆盖它们。这与[优先级部分](#settings-precedence)称为编程选项的层相同。

连续调用浅合并顶级键。第二次调用 `{ permissions: {...} }` 会替换先前调用中的整个 `permissions` 对象，而不是深度合并到其中。要从标志层清除键并回退到较低优先级源，请为该键传递 `null`。传递 `undefined` 无效，因为 JSON 序列化会将其删除。

仅在流式输入模式下可用，与 `setModel()` 和 `setPermissionMode()` 的约束相同。

下面的示例在会话中期切换活动模型，然后清除覆盖，以便模型回退到用户或项目设置指定的任何内容。

```typescript theme={null}
const q = query({ prompt: messageStream });

// 覆盖会话其余部分的模型
await q.applyFlagSettings({ model: "claude-opus-4-6" });

// 稍后：清除覆盖并回退到较低优先级设置
await q.applyFlagSettings({ model: null });
```

<Note>
  `applyFlagSettings()` 仅适用于 TypeScript。Python SDK 不公开等效方法。
</Note>

<h3 id="warmquery">
  `WarmQuery`
</h3>

由 [`startup()`](#startup) 返回的句柄。子进程已生成并初始化，因此在此句柄上调用 `query()` 会直接将提示写入准备好的进程，无需启动延迟。

```typescript theme={null}
interface WarmQuery extends AsyncDisposable {
  query(prompt: string | AsyncIterable<SDKUserMessage>): Query;
  close(): void;
}
```

<h4 id="methods-2">
  方法
</h4>

| 方法              | 描述                                                            |
| :-------------- | :------------------------------------------------------------ |
| `query(prompt)` | 向预热的子进程发送提示并返回 [`Query`](#query-object)。每个 `WarmQuery` 只能调用一次 |
| `close()`       | 关闭子进程而不发送提示。使用此方法丢弃不再需要的预热查询                                  |

`WarmQuery` 实现 `AsyncDisposable`，因此可以与 `await using` 一起使用以进行自动清理。

<h3 id="sdkcontrolinitializeresponse">
  `SDKControlInitializeResponse`
</h3>

`initializationResult()` 的返回类型。包含会话初始化数据。

```typescript theme={null}
type SDKControlInitializeResponse = {
  commands: SlashCommand[];
  agents: AgentInfo[];
  output_style: string;
  available_output_styles: string[];
  models: ModelInfo[];
  account: AccountInfo;
  fast_mode_state?: "off" | "cooldown" | "on";
};
```

当客户端向已运行的会话发送 `initialize` 时，控制响应包装器也会携带一个可选的 `pending_permission_requests` 数组。该字段位于响应包装器本身，而不是上面的 `SDKControlInitializeResponse` 有效负载中。每个条目都是一个完整的 `control_request` 消息，具有与会话在运行时为权限请求流式传输的相同 `{ type: "control_request", request_id, request }` 形状。

这些是在客户端连接之前发出的请求，仍在等待回复。SDK 为您读取数组并将每个条目分派到您的 [`canUseTool`](#canusetool) 回调，这与 [`reinitialize()`](#query-object) 在传输间隙后触发的相同重新发送。使用重复的请求 ID 幂等地处理，因为条目可以重复回调已在连接断开前收到的请求。

<h3 id="sdkcontrolinterruptresponse">
  `SDKControlInterruptResponse`
</h3>

中断收据：[`interrupt()`](#query-object) 在通告 [`SDKSystemMessage.capabilities`](#sdksystemmessage) 中的 `interrupt_receipt_v1` 功能的 CLI 上解决的值。需要 Claude Code v2.1.205 或更高版本。较早的 CLI 使用空成功有效负载回答中断，因此 `interrupt()` 解决为 `undefined`。

```typescript theme={null}
type SDKControlInterruptResponse = {
  still_queued: string[];
};
```

`still_queued` 列出存活中断的用户消息的 UUID：仍在队列中的消息，加上已为下一个轮次出队但尚未被中止到达的任何批次。除非您首先取消它，否则每个都作为其自己的轮次在中断后运行。使用收据来决定是否重新发送任何内容；重新发送已列出的消息会产生重复的轮次。

使用这些注意事项解释列表：

* 仅出现已使用 UUID 入队的消息。空数组并不意味着没有其他内容会运行。
* 仅列出主线程消息。寻址到子代理的消息超出范围。
* 列表可以包括您的客户端从未发送的 UUID，例如[计划任务](/docs/zh-CN/scheduled-tasks)触发器。忽略您不识别的 UUID，而不是将其视为错误。

收据是在处理中断时拍摄的快照，在干净中断时，它在中断轮次的 [`SDKResultMessage`](#sdkresultmessage) 之前到达。在该结果之后读取收据而不是检查队列：循环立即启动下一个排队的轮次，因此您在结果后检查的队列已经改变。

<h3 id="agentdefinition">
  `AgentDefinition`
</h3>

以编程方式定义的子代理的配置。

```typescript theme={null}
type AgentDefinition = {
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  model?: string;
  mcpServers?: AgentMcpServerSpec[];
  skills?: string[];
  initialPrompt?: string;
  maxTurns?: number;
  background?: boolean;
  memory?: "user" | "project" | "local";
  effort?: "low" | "medium" | "high" | "xhigh" | "max" | number;
  permissionMode?: PermissionMode;
  criticalSystemReminder_EXPERIMENTAL?: string;
};
```

| 字段                                    | 必需 | 描述                                                                                                        |
| :------------------------------------ | :- | :-------------------------------------------------------------------------------------------------------- |
| `description`                         | 是  | 何时使用此代理的自然语言描述                                                                                            |
| `tools`                               | 否  | 允许的工具名称数组。如果省略，继承父级的所有工具。要将 Skills 预加载到代理的上下文中，请使用 `skills` 字段而不是在此处列出 `'Skill'`                          |
| `disallowedTools`                     | 否  | 要为此代理明确禁止的工具名称数组。也接受 MCP 服务器级别的模式：`mcp__server` 或 `mcp__server__*` 移除该服务器的每个工具，`mcp__*` 移除任何服务器的每个 MCP 工具 |
| `prompt`                              | 是  | 代理的系统提示                                                                                                   |
| `model`                               | 否  | 此代理的模型覆盖。接受别名，如 `'fable'`、`'opus'`、`'sonnet'`、`'haiku'`、`'inherit'`，或完整的模型 ID。如果省略或 `'inherit'`，使用主模型     |
| `mcpServers`                          | 否  | 此代理的 MCP 服务器规范                                                                                            |
| `skills`                              | 否  | 要预加载到代理上下文中的 skill 名称数组                                                                                   |
| `initialPrompt`                       | 否  | 当此代理作为主线程代理运行时，自动提交为第一个用户轮次                                                                               |
| `maxTurns`                            | 否  | 停止前的最大代理轮次数（API 往返）                                                                                       |
| `background`                          | 否  | 调用时将此代理作为非阻塞后台任务运行                                                                                        |
| `memory`                              | 否  | 此代理的内存源：`'user'`、`'project'` 或 `'local'`                                                                  |
| `effort`                              | 否  | 此代理的推理努力级别。接受命名级别或整数                                                                                      |
| `permissionMode`                      | 否  | 此代理内工具执行的权限模式。请参阅 [`PermissionMode`](#permissionmode)                                                     |
| `criticalSystemReminder_EXPERIMENTAL` | 否  | 实验性：添加到系统提示的关键提醒                                                                                          |

<h3 id="agentmcpserverspec">
  `AgentMcpServerSpec`
</h3>

指定子代理可用的 MCP 服务器。可以是服务器名称（字符串，引用父级 `mcpServers` 配置中的服务器）或内联服务器配置记录，将服务器名称映射到配置。

```typescript theme={null}
type AgentMcpServerSpec = string | Record<string, McpServerConfigForProcessTransport>;
```

其中 `McpServerConfigForProcessTransport` 是 `McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfig`。

<h3 id="settingsource">
  `SettingSource`
</h3>

控制 SDK 从哪些基于文件系统的配置源加载设置。

```typescript theme={null}
type SettingSource = "user" | "project" | "local";
```

| 值           | 描述            | 位置                            |
| :---------- | :------------ | :---------------------------- |
| `'user'`    | 全局用户设置        | `~/.claude/settings.json`     |
| `'project'` | 共享项目设置（版本控制）  | `.claude/settings.json`       |
| `'local'`   | 本地项目设置（不版本控制） | `.claude/settings.local.json` |

<h4 id="default-behavior">
  默认行为
</h4>

当 `settingSources` 被省略或 `undefined` 时，`query()` 加载与 Claude Code CLI 相同的文件系统设置：用户、项目和本地。在所有情况下都会加载[端点管理的策略](/docs/zh-CN/settings#settings-files)；当会话使用组织凭证在[符合条件的配置](/docs/zh-CN/server-managed-settings#platform-availability)上进行身份验证时，会获取服务器管理的设置。请参阅[settingSources 不控制的内容](/docs/zh-CN/agent-sdk/claude-code-features#what-settingsources-does-not-control)了解无论此选项如何都会读取的输入，以及如何禁用它们。

<h4 id="why-use-settingsources">
  为什么使用 settingSources
</h4>

**禁用文件系统设置：**

```typescript theme={null}
// 不从磁盘加载用户、项目或本地设置
const result = query({
  prompt: "Analyze this code",
  options: { settingSources: [] }
});
```

**显式加载所有文件系统设置：**

```typescript theme={null}
const result = query({
  prompt: "Analyze this code",
  options: {
    settingSources: ["user", "project", "local"] // 加载所有设置
  }
});
```

**仅加载特定设置源：**

```typescript theme={null}
// 仅加载项目设置，忽略用户和本地
const result = query({
  prompt: "Run CI checks",
  options: {
    settingSources: ["project"] // 仅 .claude/settings.json
  }
});
```

**测试和 CI 环境：**

```typescript theme={null}
// 通过排除本地设置确保 CI 中的一致行为
const result = query({
  prompt: "Run tests",
  options: {
    settingSources: ["project"], // 仅团队共享设置
    permissionMode: "bypassPermissions"
  }
});
```

**仅 SDK 应用程序：**

```typescript theme={null}
// 以编程方式定义所有内容。
// 传递 [] 以选择退出文件系统设置源。
const result = query({
  prompt: "Review this PR",
  options: {
    settingSources: [],
    agents: {
      /* ... */
    },
    mcpServers: {
      /* ... */
    },
    allowedTools: ["Read", "Grep", "Glob"]
  }
});
```

**加载 CLAUDE.md 项目说明：**

```typescript theme={null}
// 加载项目设置以包括 CLAUDE.md 文件
const result = query({
  prompt: "Add a new feature following project conventions",
  options: {
    systemPrompt: {
      type: "preset",
      preset: "claude_code" // 使用 Claude Code 的系统提示
    },
    settingSources: ["project"], // 从项目目录加载 CLAUDE.md
    allowedTools: ["Read", "Write", "Edit"]
  }
});
```

<h4 id="settings-precedence">
  设置优先级
</h4>

加载多个源时，设置按此优先级合并（从高到低）：

1. 本地设置（`.claude/settings.local.json`）
2. 项目设置（`.claude/settings.json`）
3. 用户设置（`~/.claude/settings.json`）

编程选项（如 `agents`、`allowedTools` 和 `settings`）覆盖用户、项目和本地文件系统设置。托管策略设置优先于编程选项。

<h3 id="permissionmode">
  `PermissionMode`
</h3>

```typescript theme={null}
type PermissionMode =
  | "default" // 标准权限行为
  | "acceptEdits" // 自动接受文件编辑
  | "bypassPermissions" // 绕过权限检查；显式询问规则仍然提示
  | "plan" // Plan Mode - 仅读取工具
  | "dontAsk" // 不提示权限，如果未预先批准则拒绝
  | "auto"; // 使用模型分类器批准或拒绝每个工具调用
```

<h3 id="canusetool">
  `CanUseTool`
</h3>

用于控制工具使用的自定义权限函数类型。

该函数是 SDK 替代交互式权限提示：仅当[权限评估流](/docs/zh-CN/agent-sdk/permissions#how-permissions-are-evaluated)解决为提示时才调用它。已由 `allowedTools` 条目、设置 allow 规则或权限模式（如 `acceptEdits` 或 `bypassPermissions`）批准的工具调用永远不会调用它。要限制每个工具调用，请改用 [`PreToolUse` hook](/docs/zh-CN/agent-sdk/hooks)。

`AskUserQuestion`、标记为 [`requiresUserInteraction`](/docs/zh-CN/mcp#require-approval-for-a-specific-tool) 的 MCP 工具和[您的组织设置为 `ask`](/docs/zh-CN/mcp#organization-controls-on-connector-tools) 的 connector 工具即使 allow 规则匹配也会到达该函数。在 `dontAsk` 模式下这些调用会被拒绝，不调用它。

```typescript theme={null}
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
    requestId: string;
  }
) => Promise<PermissionResult | null>;
```

| 选项               | 类型                                          | 描述                                                                                                                                                                       |
| :--------------- | :------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal`         | `AbortSignal`                               | 如果应中止操作，则发出信号                                                                                                                                                            |
| `suggestions`    | [`PermissionUpdate`](#permissionupdate)`[]` | 建议的权限更新，以便用户不会再次被提示此工具。Bash 提示包括一个建议，其中包含 `localSettings` [目标](#permissionupdatedestination)，因此在 `updatedPermissions` 中返回它会将规则写入 `.claude/settings.local.json` 并在会话中持久化。 |
| `blockedPath`    | `string`                                    | 触发权限请求的文件路径（如果适用）                                                                                                                                                        |
| `decisionReason` | `string`                                    | 解释为什么触发此权限请求                                                                                                                                                             |
| `toolUseID`      | `string`                                    | 此特定工具调用在助手消息中的唯一标识符                                                                                                                                                      |
| `agentID`        | `string`                                    | 如果在子代理中运行，子代理的 ID                                                                                                                                                        |
| `requestId`      | `string`                                    | `control_request` 信封的 `request_id`。您的应用程序在其自己的通道上发送的 `control_response`（例如签名的 HTTP POST）必须回显此值，以便 Claude Code 进程可以将回复与请求匹配                                               |

回调通常通过返回 [`PermissionResult`](#permissionresult) 来解决请求，SDK 将其写回其传输作为 `control_response`。仅当您的应用程序已通过其自己的通道为此请求发送 `control_response`（回显 `requestId`）时才返回 `null`；SDK 然后跳过将响应写入其传输。在任何其他情况下返回 `null` 会使工具调用无限期被阻止，因为永远不会发送 `control_response` 且权限提示不会超时。

`requestId` 选项和 `null` 返回值需要 Claude Code v2.1.199 或更高版本。

<h3 id="permissionresult">
  `PermissionResult`
</h3>

权限检查的结果。

```typescript theme={null}
type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };
```

<h3 id="toolconfig">
  `ToolConfig`
</h3>

内置工具行为的配置。

```typescript theme={null}
type ToolConfig = {
  askUserQuestion?: {
    previewFormat?: "markdown" | "html";
  };
};
```

| 字段                              | 类型                     | 描述                                                                                                                |
| :------------------------------ | :--------------------- | :---------------------------------------------------------------------------------------------------------------- |
| `askUserQuestion.previewFormat` | `'markdown' \| 'html'` | 选择加入 [`AskUserQuestion`](/docs/zh-CN/agent-sdk/user-input#question-format) 选项上的 `preview` 字段并设置其内容格式。未设置时，Claude 不发出预览 |

<h3 id="mcpserverconfig">
  `McpServerConfig`
</h3>

MCP 服务器的配置。

```typescript theme={null}
type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
  | McpSdkServerConfigWithInstance;
```

<h4 id="mcpstdioserverconfig">
  `McpStdioServerConfig`
</h4>

```typescript theme={null}
type McpStdioServerConfig = {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};
```

<h4 id="mcpsseserverconfig">
  `McpSSEServerConfig`
</h4>

```typescript theme={null}
type McpSSEServerConfig = {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
};
```

<h4 id="mcphttpserverconfig">
  `McpHttpServerConfig`
</h4>

```typescript theme={null}
type McpHttpServerConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};
```

<h4 id="mcpsdkserverconfigwithinstance">
  `McpSdkServerConfigWithInstance`
</h4>

```typescript theme={null}
type McpSdkServerConfigWithInstance = {
  type: "sdk";
  name: string;
  instance: McpServer;
};
```

<h4 id="mcpclaudeaiproxyserverconfig">
  `McpClaudeAIProxyServerConfig`
</h4>

```typescript theme={null}
type McpClaudeAIProxyServerConfig = {
  type: "claudeai-proxy";
  url: string;
  id: string;
};
```

<h3 id="sdkpluginconfig">
  `SdkPluginConfig`
</h3>

SDK 中加载 plugins 的配置。

```typescript theme={null}
type SdkPluginConfig = {
  type: "local";
  path: string;
  skipMcpDiscovery?: boolean;
};
```

| 字段                 | 类型        | 描述                                                                                                                                     |
| :----------------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| `type`             | `'local'` | 必须为 `'local'`（目前仅支持本地 plugins）                                                                                                         |
| `path`             | `string`  | 插件目录的绝对或相对路径                                                                                                                           |
| `skipMcpDiscovery` | `boolean` | 当为 `true` 时，SDK 从此 plugin 加载 skills、hooks、agents 和 commands，但不读取其 `.mcp.json` 或 manifest `mcpServers`。当您的应用程序拥有 plugin 的 MCP 连接时设置此选项。 |

**示例：**

```typescript theme={null}
plugins: [
  { type: "local", path: "./my-plugin" },
  { type: "local", path: "/absolute/path/to/plugin" }
];
```

有关创建和使用 plugins 的完整信息，请参阅[Plugins](/docs/zh-CN/agent-sdk/plugins)。

<h2 id="message-types">
  消息类型
</h2>

<h3 id="sdkmessage">
  `SDKMessage`
</h3>

查询返回的所有可能消息的联合类型。

```typescript theme={null}
type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKLocalCommandOutputMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKPluginInstallMessage
  | SDKToolProgressMessage
  | SDKAuthStatusMessage
  | SDKTaskNotificationMessage
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKTaskUpdatedMessage
  | SDKBackgroundTasksChangedMessage
  | SDKThinkingTokensMessage
  | SDKSessionStateChangedMessage
  | SDKWorkerShuttingDownMessage
  | SDKCommandsChangedMessage
  | SDKNotificationMessage
  | SDKFilesPersistedEvent
  | SDKToolUseSummaryMessage
  | SDKMemoryRecallMessage
  | SDKRateLimitEvent
  | SDKElicitationCompleteMessage
  | SDKPermissionDeniedMessage
  | SDKPromptSuggestionMessage
  | SDKAPIRetryMessage
  | SDKMirrorErrorMessage
  | SDKInformationalMessage
  | SDKConversationResetMessage;
```

<h3 id="sdkassistantmessage">
  `SDKAssistantMessage`
</h3>

助手响应消息。

```typescript theme={null}
type SDKAssistantMessage = {
  type: "assistant";
  uuid: UUID;
  session_id: string;
  message: BetaMessage; // 来自 Anthropic SDK
  parent_tool_use_id: string | null;
  error?: SDKAssistantMessageError;
};
```

`message` 字段是来自 Anthropic SDK 的 [`BetaMessage`](https://platform.claude.com/docs/zh-CN/api/messages/create)。它包括 `id`、`content`、`model`、`stop_reason` 和 `usage` 等字段。

`SDKAssistantMessageError` 是以下之一：`'authentication_failed'`、`'oauth_org_not_allowed'`、`'billing_error'`、`'rate_limit'`、`'overloaded'`、`'invalid_request'`、`'model_not_found'`、`'server_error'`、`'max_output_tokens'` 或 `'unknown'`。`'model_not_found'` 表示所选模型不存在或对您的账户或部署不可用。`'overloaded'` 表示 API 返回了 529 错误，因为服务器处于容量限制，与 `'rate_limit'` 相对，后者是针对您的配额的 429 错误。

<h3 id="sdkusermessage">
  `SDKUserMessage`
</h3>

用户输入消息。

```typescript theme={null}
type SDKUserMessage = {
  type: "user";
  uuid?: UUID;
  session_id?: string;
  message: MessageParam; // 来自 Anthropic SDK
  parent_tool_use_id: string | null;
  isSynthetic?: boolean;
  shouldQuery?: boolean;
  tool_use_result?: unknown;
  origin?: SDKMessageOrigin;
};
```

将 `shouldQuery` 设置为 `false` 以将消息附加到记录中而不触发助手轮次。消息被保留并合并到下一个触发轮次的用户消息中。使用此方法注入上下文，例如您在带外运行的命令的输出，而无需在其上花费模型调用。

在携带 `tool_result` 块的消息上，`tool_use_result` 是工具的结构化输出对象，而不是发送给模型的文本。其形状取决于匹配的 `tool_use` 块命名的工具，因此该字段被类型化为 `unknown`；内置形状列在[工具输出类型](#tool-output-types)下。

对于 `Agent` 工具，`tool_use_result` 是 [`AgentOutput`](#agent-2)。在 `completed` 结果上，`content` 保存子代理的报告，不包含 Claude Code 附加到 `tool_result` 文本的代理 ID 和使用情况预告片，因此从 `tool_use_result` 呈现而不是解析该文本。

<h3 id="sdkusermessagereplay">
  `SDKUserMessageReplay`
</h3>

具有必需 UUID 的重放用户消息。

```typescript theme={null}
type SDKUserMessageReplay = {
  type: "user";
  uuid: UUID;
  session_id: string;
  message: MessageParam;
  parent_tool_use_id: string | null;
  isSynthetic?: boolean;
  tool_use_result?: unknown;
  origin?: SDKMessageOrigin;
  isReplay: true;
};
```

从会话外部注入的用户轮次，其 [`origin`](#sdkmessageorigin) 类型为 `peer` 或 `channel`，无论是在活跃轮次期间交付还是在会话空闲时启动新轮次，都会作为重放到达流。在 v2.1.207 之前，在会话空闲时交付的注入轮次在流上不产生任何消息，仅在您重新读取记录时出现。

<h3 id="sdkresultmessage">
  `SDKResultMessage`
</h3>

最终结果消息。

```typescript theme={null}
type SDKResultMessage =
  | {
      type: "result";
      subtype: "success";
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      api_error_status?: number | null;
      num_turns: number;
      result: string;
      stop_reason: string | null;
      ttft_ms?: number;
      ttft_stream_ms?: number;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      structured_output?: unknown;
      deferred_tool_use?: { id: string; name: string; input: Record<string, unknown> };
      terminal_reason?: TerminalReason;
      fast_mode_state?: FastModeState;
      origin?: SDKMessageOrigin;
    }
  | {
      type: "result";
      subtype:
        | "error_max_turns"
        | "error_during_execution"
        | "error_max_budget_usd"
        | "error_max_structured_output_retries";
      uuid: UUID;
      session_id: string;
      duration_ms: number;
      duration_api_ms: number;
      is_error: boolean;
      num_turns: number;
      stop_reason: string | null;
      total_cost_usd: number;
      usage: NonNullableUsage;
      modelUsage: { [modelName: string]: ModelUsage };
      permission_denials: SDKPermissionDenial[];
      errors: string[];
      terminal_reason?: TerminalReason;
      fast_mode_state?: FastModeState;
      origin?: SDKMessageOrigin;
    };
```

结果上的多个字段除了 `subtype` 之外还提供诊断详情：

* `api_error_status`：终止对话的 API 错误的 HTTP 状态码。当轮次在没有 API 错误的情况下结束时，该字段不存在或为 `null`。
* `ttft_ms`：首个令牌的时间（毫秒），在第一个完整的助手消息到达时测量。仅在成功分支上显示。
* `ttft_stream_ms`：直到第一个 `message_start` 流事件的时间（毫秒），当响应流打开时。低于 `ttft_ms`；两者之间的差距是流式传输第一条消息所花费的时间。仅在成功分支上显示。
* `terminal_reason`：循环结束的原因。为 `"completed"`、`"max_turns"`、`"tool_deferred"`、`"aborted_streaming"`、`"aborted_tools"`、`"hook_stopped"`、`"stop_hook_prevented"`、`"background_requested"`、`"blocking_limit"`、`"rapid_refill_breaker"`、`"prompt_too_long"`、`"image_error"`、`"model_error"`、`"api_error"`、`"malformed_tool_use_exhausted"`、`"budget_exhausted"`、`"structured_output_retry_exhausted"`、`"tool_deferred_unavailable"` 或 `"turn_setup_failed"` 之一。
* `fast_mode_state`：为 `"on"`、`"off"` 或 `"cooldown"` 之一。

`origin` 字段转发触发此结果的用户消息的 [`SDKMessageOrigin`](#sdkmessageorigin)。当后台任务完成且 SDK 注入合成后续轮次时，生成的 `SDKResultMessage` 携带 `origin: { kind: "task-notification" }`。检查此字段以区分回答您的提示的结果与为后台任务后续操作发出的结果，以便您可以路由或抑制后者。对于在任何用户轮次之前发出的结果（例如启动错误），该字段不存在。

当 `PreToolUse` hook 返回 `permissionDecision: "defer"` 时，结果具有 `stop_reason: "tool_deferred"` 和 `deferred_tool_use` 携带待处理工具的 `id`、`name` 和 `input`。读取此字段以在您自己的 UI 中显示请求，然后使用相同的 `session_id` 恢复以继续。有关完整的往返过程，请参阅[稍后延迟工具调用](/docs/zh-CN/hooks#defer-a-tool-call-for-later)。

<h3 id="sdksystemmessage">
  `SDKSystemMessage`
</h3>

系统初始化消息。

```typescript theme={null}
type SDKSystemMessage = {
  type: "system";
  subtype: "init";
  uuid: UUID;
  session_id: string;
  agents?: string[];
  apiKeySource: ApiKeySource;
  betas?: string[];
  claude_code_version: string;
  cwd: string;
  tools: string[];
  mcp_servers: {
    name: string;
    status: string;
  }[];
  model: string;
  permissionMode: PermissionMode;
  slash_commands: string[];
  output_style: string;
  skills: string[];
  plugins: { name: string; path: string }[];
  capabilities?: string[];
};
```

`capabilities` 数组命名此 CLI 实现的协议行为，因此您可以进行功能检测而不是比较 `claude_code_version` 字符串。这是一个开放集合：忽略您不认识的值，并检查您依赖其行为的特定功能。该字段需要 Claude Code v2.1.205 或更高版本，在较早的 CLI 上不存在。

| 功能                     | 含义                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `interrupt_receipt_v1` | [`interrupt()`](#query-object) 使用命名存活中断的排队消息的 [`SDKControlInterruptResponse`](#sdkcontrolinterruptresponse) 收据进行解析 |

<h3 id="sdkpartialassistantmessage">
  `SDKPartialAssistantMessage`
</h3>

流式部分消息（仅当 `includePartialMessages` 为 true 时）。`parent_tool_use_id` 字段始终为 `null`：流事件仅针对主会话发出。对于子代理归属，使用携带 `parent_tool_use_id` 的完整消息，或启用 [`forwardSubagentText`](#options) 以接收子代理文本和思考作为完整消息。

```typescript theme={null}
type SDKPartialAssistantMessage = {
  type: "stream_event";
  event: BetaRawMessageStreamEvent; // 来自 Anthropic SDK
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
  ttft_ms?: number; // 首个令牌的时间（毫秒），仅在 message_start 事件上显示
};
```

<h3 id="sdkcompactboundarymessage">
  `SDKCompactBoundaryMessage`
</h3>

指示对话压缩边界的消息。

```typescript theme={null}
type SDKCompactBoundaryMessage = {
  type: "system";
  subtype: "compact_boundary";
  uuid: UUID;
  session_id: string;
  compact_metadata: {
    trigger: "manual" | "auto";
    pre_tokens: number;
  };
};
```

<h3 id="sdkinformationalmessage">
  `SDKInformationalMessage`
</h3>

由循环发出的通用文本横幅。携带非错误状态行、hook 反馈（例如 `UserPromptSubmit` hook 的阻止原因）和命令输出。将 `content` 呈现为给定 `level` 的纯文本。

```typescript theme={null}
type SDKInformationalMessage = {
  type: "system";
  subtype: "informational";
  content: string;
  level: "info" | "notice" | "suggestion" | "warning";
  tool_use_id?: string;
  prevent_continuation?: boolean;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkworkershuttingdownmessage">
  `SDKWorkerShuttingDownMessage`
</h3>

在优雅的 worker 拆卸时发出，以便远程客户端可以显示 worker 消失的原因，而不是等待心跳超时。`reason` 是由主机 CLI 设置的短 snake\_case 字符串，例如 `"host_exit"` 或 `"remote_control_disabled"`。仅在实时流式传输时对此采取行动。恢复的会话会重放此消息的过去实例，因此在这种情况下忽略它们。

```typescript theme={null}
type SDKWorkerShuttingDownMessage = {
  type: "system";
  subtype: "worker_shutting_down";
  reason: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkplugininstallmessage">
  `SDKPluginInstallMessage`
</h3>

插件安装进度事件。当设置 [`CLAUDE_CODE_SYNC_PLUGIN_INSTALL`](/docs/zh-CN/env-vars) 时发出，以便您的 Agent SDK 应用程序可以在第一个轮次之前跟踪市场插件安装。`started` 和 `completed` 状态括起整体安装。`installed` 和 `failed` 状态报告单个市场并包括 `name`。

```typescript theme={null}
type SDKPluginInstallMessage = {
  type: "system";
  subtype: "plugin_install";
  status: "started" | "installed" | "failed" | "completed";
  name?: string;
  error?: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkpermissiondeniedmessage">
  `SDKPermissionDeniedMessage`
</h3>

当权限系统自动拒绝工具调用而不显示交互式提示时发出的流事件。使用它在发生时在您的 UI 中呈现拒绝，而不仅仅观察随后的 `is_error` 工具结果。交互式询问路径通过 [`canUseTool`](#canusetool) 回调单独到达您的应用程序。由 `PreToolUse` hook 发出的拒绝不会通过此事件报告。

此事件需要 Claude Code v2.1.136 或更高版本。

```typescript theme={null}
type SDKPermissionDeniedMessage = {
  type: "system";
  subtype: "permission_denied";
  tool_name: string;
  tool_use_id: string;
  agent_id?: string;
  decision_reason_type?: string;
  decision_reason?: string;
  message: string;
  uuid: UUID;
  session_id: string;
};
```

| 字段                     | 类型       | 描述                                                            |
| ---------------------- | -------- | ------------------------------------------------------------- |
| `tool_name`            | `string` | 被拒绝的工具的名称                                                     |
| `tool_use_id`          | `string` | 此拒绝回答的 `tool_use` 块的 ID                                       |
| `agent_id`             | `string` | 当拒绝的调用源自子代理内部时的子代理 ID。镜像 `can_use_tool` 上的字段以进行主机端路由          |
| `decision_reason_type` | `string` | 决定组件的鉴别器，例如 `"rule"`、`"mode"`、`"classifier"` 或 `"asyncAgent"` |
| `decision_reason`      | `string` | 来自决定组件的人类可读原因（如果可用）                                           |
| `message`              | `string` | 在 `tool_result` 中返回给模型的拒绝消息                                   |

<h3 id="sdkpermissiondenial">
  `SDKPermissionDenial`
</h3>

有关被拒绝的工具使用的信息。

```typescript theme={null}
type SDKPermissionDenial = {
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
};
```

<h3 id="sdkmessageorigin">
  `SDKMessageOrigin`
</h3>

用户角色消息的来源。这在 [`SDKUserMessage`](#sdkusermessage) 上显示为 `origin`，并转发到相应的 [`SDKResultMessage`](#sdkresultmessage)，以便您可以判断给定轮次的触发因素。

```typescript theme={null}
type SDKMessageOrigin =
  | { kind: "human" }
  | { kind: "channel"; server: string }
  | {
      kind: "peer";
      from: string;
      name?: string;
      senderTaskId?: string;
      body?: string;
    }
  | { kind: "task-notification" }
  | { kind: "coordinator" }
  | { kind: "auto-continuation" };
```

| `kind`              | 含义                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `human`             | 来自最终用户的直接输入。在用户消息上，缺少的 `origin` 也表示人工输入。                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `channel`           | 消息到达[频道](/docs/zh-CN/channels)。`server` 是源 MCP 服务器名称。                                                                                                                                                                                                                                                                                                                                                                                                              |
| `peer`              | 来自另一个代理的消息。对于通过 `SendMessage` 发送到 `main` 的进程内[队友](/docs/zh-CN/agent-teams)，`from` 是队友的名称，`senderTaskId` 是其任务 ID。对于跨会话对等体（例如另一个本地 Claude Code 进程），`from` 是发送者地址，`senderTaskId` 不存在。}`name` 和 `body` 需要 Claude Code v2.1.205 或更高版本。`name` 是发送者的显示名称，由 Claude Code 规范化：它删除 Unicode 控制、格式、代理和行或段落分隔符代码点，然后修剪结果并将其限制为 64 个代码点，并带有省略号。`body` 是解码的消息正文，去除对等信封，与模型看到的字节完全相同。对于队友消息，`body` 始终存在；对于跨会话对等体，仅当轮次恰好是由 Claude Code 形成的一个对等信封时才存在。呈现 `name` 和 `body` 而不是重新解析消息文本。 |
| `task-notification` | 后台任务完成后注入的合成轮次。请参阅 [`SDKTaskNotificationMessage`](#sdktasknotificationmessage)。                                                                                                                                                                                                                                                                                                                                                                               |
| `coordinator`       | 来自[代理团队](/docs/zh-CN/agent-teams)中的团队协调员的消息。                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `auto-continuation` | 当会话在没有新用户输入的情况下继续时注入的合成轮次，例如触发后续提示的命令结果。                                                                                                                                                                                                                                                                                                                                                                                                                      |

<h2 id="hook-types">
  Hook 类型
</h2>

有关使用 hooks 的综合指南，包括示例和常见模式，请参阅 [Hooks 指南](/docs/zh-CN/agent-sdk/hooks)。

<h3 id="hookevent">
  `HookEvent`
</h3>

可用的 hook 事件。

```typescript theme={null}
type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PostToolBatch"
  | "Notification"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "Stop"
  | "SubagentStart"
  | "SubagentStop"
  | "PreCompact"
  | "PermissionRequest"
  | "Setup"
  | "TeammateIdle"
  | "TaskCompleted"
  | "ConfigChange"
  | "WorktreeCreate"
  | "WorktreeRemove"
  | "MessageDisplay";
```

<h3 id="hookcallback">
  `HookCallback`
</h3>

Hook 回调函数类型。

```typescript theme={null}
type HookCallback = (
  input: HookInput, // 所有 hook 输入类型的联合
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

<h3 id="hookcallbackmatcher">
  `HookCallbackMatcher`
</h3>

带有可选匹配器的 Hook 配置。

```typescript theme={null}
interface HookCallbackMatcher {
  matcher?: string;
  hooks: HookCallback[];
  timeout?: number; // 此匹配器中所有 hooks 的超时时间（秒）
}
```

<h3 id="hookinput">
  `HookInput`
</h3>

所有 hook 输入类型的联合类型。

```typescript theme={null}
type HookInput =
  | PreToolUseHookInput
  | PostToolUseHookInput
  | PostToolUseFailureHookInput
  | PostToolBatchHookInput
  | NotificationHookInput
  | UserPromptSubmitHookInput
  | SessionStartHookInput
  | SessionEndHookInput
  | StopHookInput
  | SubagentStartHookInput
  | SubagentStopHookInput
  | PreCompactHookInput
  | PermissionRequestHookInput
  | SetupHookInput
  | TeammateIdleHookInput
  | TaskCompletedHookInput
  | ConfigChangeHookInput
  | WorktreeCreateHookInput
  | WorktreeRemoveHookInput
  | MessageDisplayHookInput;
```

<h3 id="basehookinput">
  `BaseHookInput`
</h3>

所有 hook 输入类型扩展的基本接口。

```typescript theme={null}
type BaseHookInput = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  prompt_id?: string;
  permission_mode?: string;
  effort?: { level: string };
  agent_id?: string;
  agent_type?: string;
};
```

`prompt_id` 字段是一个 UUID，用于标识当前正在处理的用户提示。它与 [OpenTelemetry 事件上的 `prompt.id` 属性](/docs/zh-CN/monitoring-usage#event-correlation-attributes)匹配，在第一个用户输入之前不存在。需要 Claude Code v2.1.196 或更高版本。

<h4 id="pretoolusehookinput">
  `PreToolUseHookInput`
</h4>

```typescript theme={null}
type PreToolUseHookInput = BaseHookInput & {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
};
```

<h4 id="posttoolusehookinput">
  `PostToolUseHookInput`
</h4>

```typescript theme={null}
type PostToolUseHookInput = BaseHookInput & {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;
  tool_use_id: string;
  duration_ms?: number;
};
```

<h4 id="posttoolusefailurehookinput">
  `PostToolUseFailureHookInput`
</h4>

```typescript theme={null}
type PostToolUseFailureHookInput = BaseHookInput & {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
  error: string;
  is_interrupt?: boolean;
  duration_ms?: number;
};
```

<h4 id="posttoolbatchhookinput">
  `PostToolBatchHookInput`
</h4>

在批处理中的每个工具调用都已解决后触发一次，在下一个模型请求之前。`tool_response` 携带序列化的 `tool_result` 内容，模型会看到该内容；其形状与 `PostToolUseHookInput` 的结构化 `Output` 对象不同。

```typescript theme={null}
type PostToolBatchHookInput = BaseHookInput & {
  hook_event_name: "PostToolBatch";
  tool_calls: PostToolBatchToolCall[];
};

type PostToolBatchToolCall = {
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
  tool_response?: unknown;
};
```

<h4 id="notificationhookinput">
  `NotificationHookInput`
</h4>

```typescript theme={null}
type NotificationHookInput = BaseHookInput & {
  hook_event_name: "Notification";
  message: string;
  title?: string;
  notification_type: string;
};
```

<h4 id="userpromptsubmithookinput">
  `UserPromptSubmitHookInput`
</h4>

```typescript theme={null}
type UserPromptSubmitHookInput = BaseHookInput & {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
};
```

<h4 id="sessionstarthookinput">
  `SessionStartHookInput`
</h4>

```typescript theme={null}
type SessionStartHookInput = BaseHookInput & {
  hook_event_name: "SessionStart";
  source: "startup" | "resume" | "clear" | "compact";
  agent_type?: string;
  model?: string;
};
```

<h4 id="sessionendhookinput">
  `SessionEndHookInput`
</h4>

```typescript theme={null}
type SessionEndHookInput = BaseHookInput & {
  hook_event_name: "SessionEnd";
  reason: ExitReason; // EXIT_REASONS 数组中的字符串
};
```

<h4 id="stophookinput">
  `StopHookInput`
</h4>

```typescript theme={null}
type StopHookInput = BaseHookInput & {
  hook_event_name: "Stop";
  stop_hook_active: boolean;
  last_assistant_message?: string;
  background_tasks?: BackgroundTaskSummary[];
  session_crons?: SessionCronSummary[];
};
```

<h4 id="subagentstarthookinput">
  `SubagentStartHookInput`
</h4>

```typescript theme={null}
type SubagentStartHookInput = BaseHookInput & {
  hook_event_name: "SubagentStart";
  agent_id: string;
  agent_type: string;
};
```

<h4 id="subagentstophookinput">
  `SubagentStopHookInput`
</h4>

```typescript theme={null}
type SubagentStopHookInput = BaseHookInput & {
  hook_event_name: "SubagentStop";
  stop_hook_active: boolean;
  agent_id: string;
  agent_transcript_path: string;
  agent_type: string;
  last_assistant_message?: string;
  background_tasks?: BackgroundTaskSummary[];
  session_crons?: SessionCronSummary[];
};

type BackgroundTaskSummary = {
  id: string;
  type: string;
  status: string;
  description: string;
  command?: string;
  agent_type?: string;
  server?: string;
  tool?: string;
  name?: string;
};

type SessionCronSummary = {
  id: string;
  schedule: string;
  recurring: boolean;
  prompt: string;
};
```

<h4 id="precompacthookinput">
  `PreCompactHookInput`
</h4>

```typescript theme={null}
type PreCompactHookInput = BaseHookInput & {
  hook_event_name: "PreCompact";
  trigger: "manual" | "auto";
  custom_instructions: string | null;
};
```

<h4 id="permissionrequesthookinput">
  `PermissionRequestHookInput`
</h4>

```typescript theme={null}
type PermissionRequestHookInput = BaseHookInput & {
  hook_event_name: "PermissionRequest";
  tool_name: string;
  tool_input: unknown;
  permission_suggestions?: PermissionUpdate[];
};
```

<h4 id="setuphookinput">
  `SetupHookInput`
</h4>

```typescript theme={null}
type SetupHookInput = BaseHookInput & {
  hook_event_name: "Setup";
  trigger: "init" | "maintenance";
};
```

<h4 id="teammateidlehookinput">
  `TeammateIdleHookInput`
</h4>

```typescript theme={null}
type TeammateIdleHookInput = BaseHookInput & {
  hook_event_name: "TeammateIdle";
  teammate_name: string;
  /** @deprecated 自 v2.1.178 起已弃用。携带会话派生的团队名称；将被移除。 */
  team_name: string;
};
```

<h4 id="taskcompletedhookinput">
  `TaskCompletedHookInput`
</h4>

```typescript theme={null}
type TaskCompletedHookInput = BaseHookInput & {
  hook_event_name: "TaskCompleted";
  task_id: string;
  task_subject: string;
  task_description?: string;
  teammate_name?: string;
  /** @deprecated 自 v2.1.178 起已弃用。携带会话派生的团队名称；将被移除。 */
  team_name?: string;
};
```

<h4 id="configchangehookinput">
  `ConfigChangeHookInput`
</h4>

```typescript theme={null}
type ConfigChangeHookInput = BaseHookInput & {
  hook_event_name: "ConfigChange";
  source:
    | "user_settings"
    | "project_settings"
    | "local_settings"
    | "policy_settings"
    | "skills";
  file_path?: string;
};
```

<h4 id="worktreecreatehookinput">
  `WorktreeCreateHookInput`
</h4>

```typescript theme={null}
type WorktreeCreateHookInput = BaseHookInput & {
  hook_event_name: "WorktreeCreate";
  name: string;
};
```

<h4 id="worktreeremovehookinput">
  `WorktreeRemoveHookInput`
</h4>

```typescript theme={null}
type WorktreeRemoveHookInput = BaseHookInput & {
  hook_event_name: "WorktreeRemove";
  worktree_path: string;
};
```

<h4 id="messagedisplayhookinput">
  `MessageDisplayHookInput`
</h4>

```typescript theme={null}
type MessageDisplayHookInput = BaseHookInput & {
  hook_event_name: "MessageDisplay";
  turn_id: string;
  message_id: string;
  index: number;
  final: boolean;
  delta: string;
};
```

<h3 id="hookjsonoutput">
  `HookJSONOutput`
</h3>

Hook 返回值。

```typescript theme={null}
type HookJSONOutput = AsyncHookJSONOutput | SyncHookJSONOutput;
```

<h4 id="asynchookjsonoutput">
  `AsyncHookJSONOutput`
</h4>

```typescript theme={null}
type AsyncHookJSONOutput = {
  async: true;
  asyncTimeout?: number;
};
```

<h4 id="synchookjsonoutput">
  `SyncHookJSONOutput`
</h4>

```typescript theme={null}
type SyncHookJSONOutput = {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: "approve" | "block";
  systemMessage?: string;
  reason?: string;
  hookSpecificOutput?:
    | {
        hookEventName: "PreToolUse";
        permissionDecision?: "allow" | "deny" | "ask" | "defer";
        permissionDecisionReason?: string;
        updatedInput?: Record<string, unknown>;
        additionalContext?: string;
      }
    | {
        hookEventName: "UserPromptSubmit";
        additionalContext?: string;
      }
    | {
        hookEventName: "SessionStart";
        additionalContext?: string;
      }
    | {
        hookEventName: "Setup";
        additionalContext?: string;
      }
    | {
        hookEventName: "SubagentStart";
        additionalContext?: string;
      }
    | {
        hookEventName: "PostToolUse";
        additionalContext?: string;
        updatedToolOutput?: unknown;
        /** @deprecated 使用 `updatedToolOutput`，它适用于所有工具。 */
        updatedMCPToolOutput?: unknown;
      }
    | {
        hookEventName: "PostToolUseFailure";
        additionalContext?: string;
      }
    | {
        hookEventName: "PostToolBatch";
        additionalContext?: string;
      }
    | {
        hookEventName: "Notification";
        additionalContext?: string;
      }
    | {
        hookEventName: "PermissionRequest";
        decision:
          | {
              behavior: "allow";
              updatedInput?: Record<string, unknown>;
              updatedPermissions?: PermissionUpdate[];
            }
          | {
              behavior: "deny";
              message?: string;
              interrupt?: boolean;
            };
      };
};
```

<h2 id="tool-input-types">
  工具输入类型
</h2>

所有内置 Claude Code 工具的输入架构文档。这些类型从 `@anthropic-ai/claude-agent-sdk` 导出，可用于类型安全的工具交互。

<h3 id="toolinputschemas">
  `ToolInputSchemas`
</h3>

所有工具输入类型的联合，从 `@anthropic-ai/claude-agent-sdk` 导出。

```typescript theme={null}
type ToolInputSchemas =
  | AgentInput
  | AskUserQuestionInput
  | BashInput
  | TaskOutputInput
  | EnterWorktreeInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | ListMcpResourcesInput
  | McpInput
  | MonitorInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | SubscribeMcpResourceInput
  | SubscribePollingInput
  | TaskCreateInput
  | TaskGetInput
  | TaskListInput
  | TaskStopInput
  | TaskUpdateInput
  | TodoWriteInput
  | UnsubscribeMcpResourceInput
  | UnsubscribePollingInput
  | WebFetchInput
  | WebSearchInput
  | WorkflowInput;
```

<h3 id="agent">
  Agent
</h3>

**工具名称：** `Agent`（之前为 `Task`，仍然接受作为别名）

```typescript theme={null}
type AgentInput = {
  description: string;
  prompt: string;
  subagent_type?: string;
  model?: "sonnet" | "opus" | "haiku" | "fable";
  run_in_background?: boolean;
  name?: string;
  mode?: "acceptEdits" | "auto" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  isolation?: "worktree";
};
```

启动新代理以自主处理复杂的多步骤任务。

<h3 id="askuserquestion">
  AskUserQuestion
</h3>

**工具名称：** `AskUserQuestion`

```typescript theme={null}
type AskUserQuestionInput = {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string; preview?: string }>;
    multiSelect: boolean;
  }>;
};
```

在执行期间向用户提出澄清问题。请参阅[处理批准和用户输入](/docs/zh-CN/agent-sdk/user-input#handle-clarifying-questions)了解使用详情。

<h3 id="bash">
  Bash
</h3>

**工具名称：** `Bash`

```typescript theme={null}
type BashInput = {
  command: string;
  timeout?: number; // 毫秒，最大 600000；更高的值会被限制为最大值
  description?: string;
  run_in_background?: boolean;
  dangerouslyDisableSandbox?: boolean;
};
```

在持久 shell 会话中执行 bash 命令，支持可选超时和后台执行。

<h3 id="monitor">
  Monitor
</h3>

**工具名称：** `Monitor`

```typescript theme={null}
type MonitorInput = {
  command?: string;
  ws?: {
    url: string;
    protocols?: string[];
  };
  description: string;
  timeout_ms?: number;
  persistent?: boolean;
};
```

运行后台源并将每个事件传递给 Claude，以便它可以做出反应而无需轮询：`command` 运行脚本并为每个 stdout 行发出一个事件，`ws` 打开 WebSocket 并为每个文本帧发出一个事件。恰好提供 `command` 或 `ws` 之一。`ws` 源需要 Claude Code v2.1.195 或更高版本。

为会话长度的监视（如日志尾部）设置 `persistent: true`。当 Monitor 运行命令时，它遵循与 Bash 相同的权限规则；WebSocket 监视会单独提示批准。请参阅 [Monitor 工具参考](/docs/zh-CN/tools-reference#monitor-tool)了解行为和提供商可用性。

<h3 id="taskoutput">
  TaskOutput
</h3>

**工具名称：** `TaskOutput`

```typescript theme={null}
type TaskOutputInput = {
  task_id: string;
  block: boolean;
  timeout: number;
};
```

从运行中或已完成的后台任务检索输出。

<h3 id="edit">
  Edit
</h3>

**工具名称：** `Edit`

```typescript theme={null}
type FileEditInput = {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};
```

在文件中执行精确字符串替换。

<h3 id="read">
  Read
</h3>

**工具名称：** `Read`

```typescript theme={null}
type FileReadInput = {
  file_path: string;
  offset?: number;
  limit?: number;
  pages?: string;
};
```

从本地文件系统读取文件，包括文本、图像、PDF 和 Jupyter 笔记本。对 PDF 页面范围使用 `pages`（例如，`"1-5"`）。

<h3 id="write">
  Write
</h3>

**工具名称：** `Write`

```typescript theme={null}
type FileWriteInput = {
  file_path: string;
  content: string;
};
```

将文件写入本地文件系统，如果存在则覆盖。

<h3 id="glob">
  Glob
</h3>

**工具名称：** `Glob`

```typescript theme={null}
type GlobInput = {
  pattern: string;
  path?: string;
};
```

快速文件模式匹配，适用于任何代码库大小。

<h3 id="grep">
  Grep
</h3>

**工具名称：** `Grep`

```typescript theme={null}
type GrepInput = {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  output_mode?: "content" | "files_with_matches" | "count";
  "-i"?: boolean;
  "-n"?: boolean;
  "-B"?: number;
  "-A"?: number;
  "-C"?: number;
  context?: number;
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
};
```

基于 ripgrep 的强大搜索工具，支持正则表达式。

<h3 id="taskstop">
  TaskStop
</h3>

**工具名称：** `TaskStop`

```typescript theme={null}
type TaskStopInput = {
  task_id?: string;
  shell_id?: string; // 已弃用：使用 task_id
};
```

按 ID 停止运行的后台任务或 shell。自 v2.1.198 起，`task_id` 也接受代理团队队友或按代理 ID 或名称的命名后台代理。

<h3 id="notebookedit">
  NotebookEdit
</h3>

**工具名称：** `NotebookEdit`

```typescript theme={null}
type NotebookEditInput = {
  notebook_path: string;
  cell_id?: string;
  new_source: string;
  cell_type?: "code" | "markdown";
  edit_mode?: "replace" | "insert" | "delete";
};
```

编辑 Jupyter 笔记本文件中的单元格。

<h3 id="webfetch">
  WebFetch
</h3>

**工具名称：** `WebFetch`

```typescript theme={null}
type WebFetchInput = {
  url: string;
  prompt: string;
};
```

从 URL 获取内容并使用 AI 模型处理它。

<h3 id="websearch">
  WebSearch
</h3>

**工具名称：** `WebSearch`

```typescript theme={null}
type WebSearchInput = {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
};
```

搜索网络并返回格式化的结果。

<h3 id="workflow">
  Workflow
</h3>

**工具名称：** `Workflow`

```typescript theme={null}
type WorkflowInput = {
  script?: string;
  name?: string;
  scriptPath?: string;
  args?: unknown;
  resumeFromRunId?: string;
};
```

运行[动态工作流](/docs/zh-CN/workflows)：一个脚本，在后台协调许多子代理并返回一个统一的结果。Workflow 工具在 Agent SDK v0.3.149 及更高版本中可用。至少需要 `script`、`name` 或 `scriptPath` 之一。

| 字段                | 类型        | 描述                                                                                                                                                                  |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script`          | `string`  | 内联工作流脚本。必须以 `export const meta = { name, description }` 作为字面量开头，后跟使用 `agent()`、`parallel()`、`pipeline()` 和 `phase()` 的脚本主体。`meta` 中的可选 `phases` 数组在进度视图中将代理分组到命名阶段下 |
| `name`            | `string`  | 内置工作流的名称或保存在 `.claude/workflows/` 中的工作流名称。解析为脚本                                                                                                                     |
| `scriptPath`      | `string`  | 磁盘上工作流脚本文件的路径。优先于 `script` 和 `name`。每次调用都会持久化其脚本并在结果中返回路径，因此您可以编辑该文件并使用相同的 `scriptPath` 重新调用以进行迭代                                                                   |
| `args`            | `unknown` | 输入值，作为全局 `args` 暴露给脚本，用于参数化的命名工作流，例如研究问题或文件路径列表。将数组和对象作为实际 JSON 值传递，而不是作为 JSON 编码的字符串                                                                               |
| `resumeFromRunId` | `string`  | 要恢复的先前 `Workflow` 调用的运行 ID。具有未更改输入的已完成 `agent()` 调用返回缓存的结果；只有更改或新的调用才会实时运行。仅限同一会话                                                                                   |

<h3 id="todowrite">
  TodoWrite
</h3>

**工具名称：** `TodoWrite`

```typescript theme={null}
type TodoWriteInput = {
  todos: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm: string;
  }>;
};
```

创建和管理结构化任务列表以跟踪进度。

<Note>
  自 TypeScript Agent SDK 0.3.142 起，`TodoWrite` 默认被禁用。改用 `TaskCreate`、`TaskGet`、`TaskUpdate` 和 `TaskList`。请参阅[迁移到 Task 工具](/docs/zh-CN/agent-sdk/todo-tracking#migrate-to-task-tools)以更新您的监视代码，或设置 `CLAUDE_CODE_ENABLE_TASKS=0` 以恢复为 `TodoWrite`。
</Note>

<h3 id="taskcreate">
  TaskCreate
</h3>

**工具名称：** `TaskCreate`

```typescript theme={null}
type TaskCreateInput = {
  subject: string;
  description: string;
  activeForm?: string;
  metadata?: Record<string, unknown>;
};
```

创建单个任务并返回其分配的 ID。

<h3 id="taskupdate">
  TaskUpdate
</h3>

**工具名称：** `TaskUpdate`

```typescript theme={null}
type TaskUpdateInput = {
  taskId: string;
  status?: "pending" | "in_progress" | "completed" | "deleted";
  subject?: string;
  description?: string;
  activeForm?: string;
  addBlocks?: string[];
  addBlockedBy?: string[];
  owner?: string;
  metadata?: Record<string, unknown>;
};
```

按 ID 修补一个任务。将 `status` 设置为 `"deleted"` 以删除它。

<h3 id="taskget">
  TaskGet
</h3>

**工具名称：** `TaskGet`

```typescript theme={null}
type TaskGetInput = {
  taskId: string;
};
```

返回一个任务的完整详情，或在找不到 ID 时返回 `null`。

<h3 id="tasklist">
  TaskList
</h3>

**工具名称：** `TaskList`

```typescript theme={null}
type TaskListInput = {};
```

返回当前列表中所有任务的快照。

<h3 id="exitplanmode">
  ExitPlanMode
</h3>

**工具名称：** `ExitPlanMode`

```typescript theme={null}
type ExitPlanModeInput = {
  /** 已弃用：不再使用。 */
  allowedPrompts?: Array<{
    tool: "Bash";
    prompt: string;
  }>;
};
```

退出规划模式。`allowedPrompts` 字段已弃用且被忽略；Claude Code 仍然接受它，以便现有调用者和记录验证。在 v2.1.205 之前，它请求基于提示的 Bash 权限以实现计划。

<h3 id="listmcpresources">
  ListMcpResources
</h3>

**工具名称：** `ListMcpResourcesTool`

```typescript theme={null}
type ListMcpResourcesInput = {
  server?: string;
};
```

列出来自连接服务器的可用 MCP 资源。

<h3 id="readmcpresource">
  ReadMcpResource
</h3>

**工具名称：** `ReadMcpResourceTool`

```typescript theme={null}
type ReadMcpResourceInput = {
  server: string;
  uri: string;
};
```

从服务器读取特定的 MCP 资源。

<h3 id="enterworktree">
  EnterWorktree
</h3>

**工具名称：** `EnterWorktree`

```typescript theme={null}
type EnterWorktreeInput = {
  name?: string;
  path?: string;
};
```

创建并进入临时 git worktree 以进行隔离工作。传递 `path` 以切换到现有 worktree 而不是创建新的。在首次进入时，目标必须是当前存储库的已注册 worktree，或在多存储库工作区中，必须是嵌套在其中的存储库的已注册 worktree；从 worktree 会话内进入时，必须在会话存储库的 `.claude/worktrees/` 下。`name` 和 `path` 互斥。

<h2 id="tool-output-types">
  工具输出类型
</h2>

所有内置 Claude Code 工具的输出架构文档。这些类型从 `@anthropic-ai/claude-agent-sdk` 导出，代表每个工具返回的实际响应数据。

<h3 id="tooloutputschemas">
  `ToolOutputSchemas`
</h3>

所有工具输出类型的联合。

```typescript theme={null}
type ToolOutputSchemas =
  | AgentOutput
  | AskUserQuestionOutput
  | BashOutput
  | EnterWorktreeOutput
  | ExitPlanModeOutput
  | FileEditOutput
  | FileReadOutput
  | FileWriteOutput
  | GlobOutput
  | GrepOutput
  | ListMcpResourcesOutput
  | MonitorOutput
  | NotebookEditOutput
  | ReadMcpResourceOutput
  | TaskCreateOutput
  | TaskGetOutput
  | TaskListOutput
  | TaskStopOutput
  | TaskUpdateOutput
  | TodoWriteOutput
  | WebFetchOutput
  | WebSearchOutput
  | WorkflowOutput;
```

<h3 id="agent-2">
  Agent
</h3>

**工具名称：** `Agent`（之前为 `Task`，仍然接受作为别名）

```typescript theme={null}
type AgentOutput =
  | {
      status: "completed";
      agentId: string;
      agentType?: string;
      content: Array<{ type: "text"; text: string; citations?: unknown[] | null }>;
      resolvedModel?: string;
      totalToolUseCount: number;
      totalDurationMs: number;
      totalTokens: number;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens: number | null;
        cache_read_input_tokens: number | null;
        server_tool_use: {
          web_search_requests: number;
          web_fetch_requests: number;
        } | null;
        service_tier: string | null;
        cache_creation: {
          ephemeral_1h_input_tokens: number;
          ephemeral_5m_input_tokens: number;
        } | null;
        inference_geo?: string | null;
        speed?: string | null;
        iterations?: unknown;
      };
      toolStats?: {
        readCount: number;
        searchCount: number;
        bashCount: number;
        editFileCount: number;
        linesAdded: number;
        linesRemoved: number;
        otherToolCount: number;
        frameCount?: number;
      };
      prompt: string;
      worktreePath?: string;
      worktreeBranch?: string;
    }
  | {
      status: "async_launched";
      isAsync?: true;
      agentId: string;
      description: string;
      resolvedModel?: string;
      prompt: string;
      outputFile: string;
      canReadOutputFile?: boolean;
    }
  | {
      status: "remote_launched";
      taskId: string;
      sessionUrl: string;
      description: string;
      prompt: string;
      outputFile: string;
    };
```

返回来自子代理的结果。在 `status` 字段上进行区分：`"completed"` 表示已完成的任务，`"async_launched"` 表示后台任务，`"remote_launched"` 表示 Claude Code 分派到远程云会话的任务，其中 `sessionUrl` 链接到该会话，`taskId` 标识它。

`completed` 和 `async_launched` 变体上的 `resolvedModel` 字段命名子代理实际运行的模型，当应用 [`availableModels`](/docs/zh-CN/model-config#restrict-model-selection) 或其他覆盖时，该模型可能与请求的 `model` 输入不同。此字段需要 Claude Code v2.1.174 或更高版本。

在 `completed` 变体上，当子代理在隔离的 git worktree 中运行时，`worktreePath` 被设置，`worktreeBranch` 在 Claude Code 创建该 worktree 时命名其分支。`usage.service_tier` 携带 API 为子代理的请求报告的服务层字符串。

在 v2.1.207 之前，发布的类型更窄。它省略了 `worktreePath`、`worktreeBranch`、`citations`、`toolStats.frameCount` 和 `inference_geo`、`speed` 和 `iterations` 使用字段，并将 `service_tier` 类型化为 `"standard" | "priority" | "batch"`。类型标记为可选的字段可能在早期版本记录的结果中不存在。

<h3 id="askuserquestion-2">
  AskUserQuestion
</h3>

**工具名称：** `AskUserQuestion`

```typescript theme={null}
type AskUserQuestionOutput = {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string; preview?: string }>;
    multiSelect: boolean;
  }>;
  answers: Record<string, string>;
  response?: string;
};
```

返回提出的问题和用户的答案。当用户输入自由形式的回复而不是回答结构化问题时，`response` 被设置；当存在时，Claude 会收到"用户回复：…"而不是每个问题的答案列表。

<h3 id="bash-2">
  Bash
</h3>

**工具名称：** `Bash`

```typescript theme={null}
type BashOutput = {
  stdout: string;
  stderr: string;
  rawOutputPath?: string;
  interrupted: boolean;
  isImage?: boolean;
  backgroundTaskId?: string;
  backgroundedByUser?: boolean;
  dangerouslyDisableSandbox?: boolean;
  returnCodeInterpretation?: string;
  structuredContent?: unknown[];
  persistedOutputPath?: string;
  persistedOutputSize?: number;
};
```

返回命令输出，stdout/stderr 分开。后台命令包括 `backgroundTaskId`。

<h3 id="monitor-2">
  Monitor
</h3>

**工具名称：** `Monitor`

```typescript theme={null}
type MonitorOutput = {
  taskId: string;
  timeoutMs: number;
  persistent?: boolean;
};
```

返回运行监视器的后台任务 ID。使用此 ID 与 `TaskStop` 一起提前取消监视。

<h3 id="edit-2">
  Edit
</h3>

**工具名称：** `Edit`

```typescript theme={null}
type FileEditOutput = {
  filePath: string;
  oldString: string;
  newString: string;
  originalFile: string;
  structuredPatch: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
  userModified: boolean;
  replaceAll: boolean;
  gitDiff?: {
    filename: string;
    status: "modified" | "added";
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
  };
};
```

返回编辑操作的结构化差异。

<h3 id="read-2">
  Read
</h3>

**工具名称：** `Read`

```typescript theme={null}
type FileReadOutput =
  | {
      type: "text";
      file: {
        filePath: string;
        content: string;
        numLines: number;
        startLine: number;
        totalLines: number;
      };
    }
  | {
      type: "image";
      file: {
        base64: string;
        type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        originalSize: number;
        dimensions?: {
          originalWidth?: number;
          originalHeight?: number;
          displayWidth?: number;
          displayHeight?: number;
        };
      };
    }
  | {
      type: "notebook";
      file: {
        filePath: string;
        cells: unknown[];
      };
    }
  | {
      type: "pdf";
      file: {
        filePath: string;
        base64: string;
        originalSize: number;
      };
    }
  | {
      type: "parts";
      file: {
        filePath: string;
        originalSize: number;
        count: number;
        outputDir: string;
      };
    };
```

返回适合文件类型的格式的文件内容。在 `type` 字段上进行区分。

<h3 id="write-2">
  Write
</h3>

**工具名称：** `Write`

```typescript theme={null}
type FileWriteOutput = {
  type: "create" | "update";
  filePath: string;
  content: string;
  structuredPatch: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
  originalFile: string | null;
  gitDiff?: {
    filename: string;
    status: "modified" | "added";
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
  };
};
```

返回写入结果，包含结构化差异信息。

<h3 id="glob-2">
  Glob
</h3>

**工具名称：** `Glob`

```typescript theme={null}
type GlobOutput = {
  durationMs: number;
  numFiles: number;
  filenames: string[];
  truncated: boolean;
};
```

返回与 glob 模式匹配的文件路径，按修改时间排序。

<h3 id="grep-2">
  Grep
</h3>

**工具名称：** `Grep`

```typescript theme={null}
type GrepOutput = {
  mode?: "content" | "files_with_matches" | "count";
  numFiles: number;
  filenames: string[];
  content?: string;
  numLines?: number;
  numMatches?: number;
  appliedLimit?: number;
  appliedOffset?: number;
};
```

返回搜索结果。形状因 `mode` 而异：文件列表、带匹配的内容或匹配计数。

<h3 id="taskstop-2">
  TaskStop
</h3>

**工具名称：** `TaskStop`

```typescript theme={null}
type TaskStopOutput = {
  message: string;
  task_id: string;
  task_type: string;
  command?: string;
};
```

停止后台任务后返回确认。

<h3 id="notebookedit-2">
  NotebookEdit
</h3>

**工具名称：** `NotebookEdit`

```typescript theme={null}
type NotebookEditOutput = {
  new_source: string;
  cell_id?: string;
  cell_type: "code" | "markdown";
  language: string;
  edit_mode: string;
  error?: string;
  notebook_path: string;
  original_file: string;
  updated_file: string;
};
```

返回笔记本编辑的结果，包含原始和更新的文件内容。

<h3 id="webfetch-2">
  WebFetch
</h3>

**工具名称：** `WebFetch`

```typescript theme={null}
type WebFetchOutput = {
  bytes: number;
  code: number;
  codeText: string;
  result: string;
  durationMs: number;
  url: string;
};
```

返回获取的内容，包含 HTTP 状态和元数据。

<h3 id="websearch-2">
  WebSearch
</h3>

**工具名称：** `WebSearch`

```typescript theme={null}
type WebSearchOutput = {
  query: string;
  results: Array<
    | {
        tool_use_id: string;
        content: Array<{ title: string; url: string }>;
      }
    | string
  >;
  durationSeconds: number;
};
```

返回来自网络的搜索结果。

<h3 id="workflow-2">
  Workflow
</h3>

**工具名称：** `Workflow`

```typescript theme={null}
type WorkflowOutput = {
  status: "async_launched";
  taskId: string;
  runId?: string;
  summary?: string;
  transcriptDir?: string;
  scriptPath?: string;
  error?: string;
};
```

在工具接受调用后立即返回。最终结果稍后作为任务完成到达。在将运行视为已启动之前检查 `error`：脚本如果语法检查失败，会返回 `status: "async_launched"` 并设置 `error`，且永远不会运行。

| 字段              | 类型                 | 描述                                                   |
| --------------- | ------------------ | ---------------------------------------------------- |
| `status`        | `"async_launched"` | 工具接受了调用。这是该字段唯一的值                                    |
| `taskId`        | `string`           | 运行的后台任务标识符                                           |
| `runId`         | `string`           | 工作流运行标识符，用于在后续调用中作为 `resumeFromRunId` 传递             |
| `summary`       | `string`           | 工作流功能的单行描述                                           |
| `transcriptDir` | `string`           | 执行期间写入子代理转录的目录                                       |
| `scriptPath`    | `string`           | 此运行的持久化工作流脚本的路径。编辑它并作为 `scriptPath` 传回以重新运行而无需重新发送脚本 |
| `error`         | `string`           | 当脚本语法检查失败时设置。存在时，尽管 `async_launched` 状态，运行未启动        |

<h3 id="todowrite-2">
  TodoWrite
</h3>

**工具名称：** `TodoWrite`

```typescript theme={null}
type TodoWriteOutput = {
  oldTodos: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm: string;
  }>;
  newTodos: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm: string;
  }>;
};
```

返回之前和更新的任务列表。

<Note>
  自 TypeScript Agent SDK 0.3.142 起，`TodoWrite` 默认被禁用。改用 `TaskCreate`、`TaskGet`、`TaskUpdate` 和 `TaskList`。请参阅[迁移到 Task 工具](/docs/zh-CN/agent-sdk/todo-tracking#migrate-to-task-tools)更新您的监视代码，或设置 `CLAUDE_CODE_ENABLE_TASKS=0` 以恢复为 `TodoWrite`。
</Note>

<h3 id="taskcreate-2">
  TaskCreate
</h3>

**工具名称：** `TaskCreate`

```typescript theme={null}
type TaskCreateOutput = {
  task: {
    id: string;
    subject: string;
  };
};
```

返回创建的任务及其分配的 ID。

<h3 id="taskupdate-2">
  TaskUpdate
</h3>

**工具名称：** `TaskUpdate`

```typescript theme={null}
type TaskUpdateOutput = {
  success: boolean;
  taskId: string;
  updatedFields: string[];
  error?: string;
  statusChange?: {
    from: string;
    to: string;
  };
};
```

返回更新结果，包括哪些字段已更改。

<h3 id="taskget-2">
  TaskGet
</h3>

**工具名称：** `TaskGet`

```typescript theme={null}
type TaskGetOutput = {
  task: {
    id: string;
    subject: string;
    description: string;
    status: "pending" | "in_progress" | "completed";
    blocks: string[];
    blockedBy: string[];
  } | null;
};
```

返回完整的任务记录，或在找不到 ID 时返回 `null`。

<h3 id="tasklist-2">
  TaskList
</h3>

**工具名称：** `TaskList`

```typescript theme={null}
type TaskListOutput = {
  tasks: Array<{
    id: string;
    subject: string;
    status: "pending" | "in_progress" | "completed";
    owner?: string;
    blockedBy: string[];
  }>;
};
```

返回当前列表中所有任务的快照。

<h3 id="exitplanmode-2">
  ExitPlanMode
</h3>

**工具名称：** `ExitPlanMode`

```typescript theme={null}
type ExitPlanModeOutput = {
  plan: string | null;
  isAgent: boolean;
  filePath?: string;
  hasTaskTool?: boolean;
  awaitingLeaderApproval?: boolean;
  requestId?: string;
};
```

返回退出规划模式后的计划状态。

<h3 id="listmcpresources-2">
  ListMcpResources
</h3>

**工具名称：** `ListMcpResourcesTool`

```typescript theme={null}
type ListMcpResourcesOutput = Array<{
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
  server: string;
}>;
```

返回可用 MCP 资源的数组。

<h3 id="readmcpresource-2">
  ReadMcpResource
</h3>

**工具名称：** `ReadMcpResourceTool`

```typescript theme={null}
type ReadMcpResourceOutput = {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
  }>;
};
```

返回请求的 MCP 资源的内容。

<h3 id="enterworktree-2">
  EnterWorktree
</h3>

**工具名称：** `EnterWorktree`

```typescript theme={null}
type EnterWorktreeOutput = {
  worktreePath: string;
  worktreeBranch?: string;
  message: string;
};
```

返回有关 git worktree 的信息。

<h2 id="permission-types">
  权限类型
</h2>

<h3 id="permissionupdate">
  `PermissionUpdate`
</h3>

用于更新权限的操作。

```typescript theme={null}
type PermissionUpdate =
  | {
      type: "addRules";
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "replaceRules";
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "removeRules";
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "setMode";
      mode: PermissionMode;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "addDirectories";
      directories: string[];
      destination: PermissionUpdateDestination;
    }
  | {
      type: "removeDirectories";
      directories: string[];
      destination: PermissionUpdateDestination;
    };
```

<h3 id="permissionbehavior">
  `PermissionBehavior`
</h3>

```typescript theme={null}
type PermissionBehavior = "allow" | "deny" | "ask";
```

<h3 id="permissionupdatedestination">
  `PermissionUpdateDestination`
</h3>

```typescript theme={null}
type PermissionUpdateDestination =
  | "userSettings" // 全局用户设置
  | "projectSettings" // 每个目录的项目设置
  | "localSettings" // 本地项目设置
  | "session" // 仅当前会话
  | "cliArg"; // CLI 参数
```

<h3 id="permissionrulevalue">
  `PermissionRuleValue`
</h3>

```typescript theme={null}
type PermissionRuleValue = {
  toolName: string;
  ruleContent?: string;
};
```

<h2 id="other-types">
  其他类型
</h2>

<h3 id="apikeysource">
  `ApiKeySource`
</h3>

```typescript theme={null}
type ApiKeySource = "user" | "project" | "org" | "temporary" | "oauth";
```

<h3 id="sdkbeta">
  `SdkBeta`
</h3>

可通过 `betas` 选项启用的可用测试功能。请参阅 [Beta 标头](https://platform.claude.com/docs/zh-CN/api/beta-headers)了解更多信息。

```typescript theme={null}
type SdkBeta = "context-1m-2025-08-07";
```

<Warning>
  `context-1m-2025-08-07` beta 自 2026 年 4 月 30 日起已停用。使用 Claude Sonnet 4.5 或 Sonnet 4 传递此值无效，超过标准 200k 令牌上下文窗口的请求返回错误。要使用 1M 令牌上下文窗口，请迁移到 [Claude Sonnet 5、Claude Sonnet 4.6、Claude Opus 4.6、Claude Opus 4.7 或 Claude Opus 4.8](https://platform.claude.com/docs/zh-CN/about-claude/models/overview)，它们以标准定价包括 1M 上下文，无需 beta 标头。
</Warning>

<h3 id="slashcommand">
  `SlashCommand`
</h3>

有关可用 slash command 的信息。

```typescript theme={null}
type SlashCommand = {
  name: string;
  description: string;
  argumentHint: string;
  aliases?: string[];
};
```

<h3 id="modelinfo">
  `ModelInfo`
</h3>

有关可用模型的信息。

```typescript theme={null}
type ModelInfo = {
  value: string;
  resolvedModel?: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: ("low" | "medium" | "high" | "xhigh" | "max")[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
  supportsAutoMode?: boolean;
};
```

| 字段                         | 类型                                                                 | 描述                                                                                                                                      |
| :------------------------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| `value`                    | `string`                                                           | 在 API 调用中传递的模型标识符                                                                                                                       |
| `resolvedModel`            | `string \| undefined`                                              | 此条目的 `value` 解析到的规范线路模型 ID。别名条目（如 `sonnet`）解析为显式模型 ID（如 `claude-sonnet-5`），因此主机可以将存储的显式模型 ID 与覆盖它的别名条目匹配。需要 Claude Code v2.1.197 或更高版本。 |
| `displayName`              | `string`                                                           | 人类可读的显示名称                                                                                                                               |
| `description`              | `string`                                                           | 模型功能的描述                                                                                                                                 |
| `supportsEffort`           | `boolean \| undefined`                                             | 此模型是否支持工作量级别                                                                                                                            |
| `supportedEffortLevels`    | `("low" \| "medium" \| "high" \| "xhigh" \| "max")[] \| undefined` | 此模型接受的工作量级别                                                                                                                             |
| `supportsAdaptiveThinking` | `boolean \| undefined`                                             | 此模型是否支持自适应思考，其中 Claude 决定何时以及多少思考                                                                                                       |
| `supportsFastMode`         | `boolean \| undefined`                                             | 此模型是否支持快速模式                                                                                                                             |
| `supportsAutoMode`         | `boolean \| undefined`                                             | 此模型是否支持自动模式                                                                                                                             |

<h3 id="agentinfo">
  `AgentInfo`
</h3>

有关可通过 Agent 工具调用的可用子代理的信息。

```typescript theme={null}
type AgentInfo = {
  name: string;
  description: string;
  model?: string;
};
```

| 字段            | 类型                    | 描述                                          |
| :------------ | :-------------------- | :------------------------------------------ |
| `name`        | `string`              | 代理类型标识符（例如，`"Explore"`、`"general-purpose"`） |
| `description` | `string`              | 何时使用此代理的描述                                  |
| `model`       | `string \| undefined` | 此代理使用的模型别名。如果省略，继承父级的模型                     |

<h3 id="mcpserverstatus">
  `McpServerStatus`
</h3>

连接的 MCP 服务器的状态。

```typescript theme={null}
type McpServerStatus = {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  serverInfo?: {
    name: string;
    version: string;
  };
  error?: string;
  config?: McpServerStatusConfig;
  scope?: string;
  tools?: {
    name: string;
    description?: string;
    annotations?: {
      readOnly?: boolean;
      destructive?: boolean;
      openWorld?: boolean;
    };
  }[];
};
```

<h3 id="mcpserverstatusconfig">
  `McpServerStatusConfig`
</h3>

由 `mcpServerStatus()` 报告的 MCP 服务器的配置。这是所有 MCP 服务器传输类型的联合。

```typescript theme={null}
type McpServerStatusConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
  | McpSdkServerConfig
  | McpClaudeAIProxyServerConfig;
```

请参阅 [`McpServerConfig`](#mcpserverconfig)了解每种传输类型的详情。

<h3 id="accountinfo">
  `AccountInfo`
</h3>

经过身份验证的用户的帐户信息。

```typescript theme={null}
type AccountInfo = {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
};
```

<h3 id="modelusage">
  `ModelUsage`
</h3>

结果消息中返回的每个模型使用统计。`costUSD` 值是客户端估计。请参阅[跟踪成本和使用情况](/docs/zh-CN/agent-sdk/cost-tracking)了解计费注意事项。

```typescript theme={null}
type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
  maxOutputTokens: number;
};
```

<h3 id="configscope">
  `ConfigScope`
</h3>

```typescript theme={null}
type ConfigScope = "local" | "user" | "project";
```

<h3 id="nonnullableusage">
  `NonNullableUsage`
</h3>

[`Usage`](#usage) 的版本，所有可空字段都变为非可空。

```typescript theme={null}
type NonNullableUsage = {
  [K in keyof Usage]: NonNullable<Usage[K]>;
};
```

<h3 id="usage">
  `Usage`
</h3>

令牌使用统计。这是来自 `@anthropic-ai/sdk` 的 `BetaUsage` 类型。

```typescript theme={null}
type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  } | null;
  server_tool_use: BetaServerToolUsage | null;
  service_tier: "standard" | "priority" | "batch" | null;
  speed: "standard" | "fast" | null;
  inference_geo: string | null;
  iterations: BetaIterationsUsage | null;
};
```

`BetaServerToolUsage` 和 `BetaIterationsUsage` 在 `@anthropic-ai/sdk` 中定义。

<h3 id="calltoolresult">
  `CallToolResult`
</h3>

MCP 工具结果类型（来自 `@modelcontextprotocol/sdk/types.js`）。`structuredContent` 是一个 JSON 对象，可以与 `content` 一起返回，包括图像块。请参阅[返回结构化数据](/docs/zh-CN/agent-sdk/custom-tools#return-structured-data)。

```typescript theme={null}
type CallToolResult = {
  content: Array<{
    type: "text" | "image" | "audio" | "resource" | "resource_link";
    // 其他字段因类型而异
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
```

<h3 id="thinkingconfig">
  `ThinkingConfig`
</h3>

控制 Claude 的思考/推理行为。优先于已弃用的 `maxThinkingTokens`。

```typescript theme={null}
type ThinkingDisplay = "summarized" | "omitted";

type ThinkingConfig =
  | { type: "adaptive"; display?: ThinkingDisplay } // 模型确定何时以及多少推理（Opus 4.6+）
  | { type: "enabled"; budgetTokens?: number; display?: ThinkingDisplay } // 固定思考令牌预算
  | { type: "disabled" }; // 无扩展思考
```

可选的 `display` 字段控制思考文本是否以 `"summarized"` 或 `"omitted"` 形式返回。在 Claude Opus 4.7 及更高版本上，API 默认值为 `"omitted"`，因此设置 `"summarized"` 以在 `thinking` 块中接收思考内容。

<h3 id="spawnedprocess">
  `SpawnedProcess`
</h3>

自定义进程生成的接口（与 `spawnClaudeCodeProcess` 选项一起使用）。`ChildProcess` 已满足此接口。

```typescript theme={null}
interface SpawnedProcess {
  stdin: Writable;
  stdout: Readable;
  readonly killed: boolean;
  readonly exitCode: number | null;
  kill(signal: NodeJS.Signals): boolean;
  on(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): void;
  on(event: "error", listener: (error: Error) => void): void;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): void;
  once(event: "error", listener: (error: Error) => void): void;
  off(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): void;
  off(event: "error", listener: (error: Error) => void): void;
}
```

<h3 id="spawnoptions">
  `SpawnOptions`
</h3>

传递给自定义生成函数的选项。

```typescript theme={null}
interface SpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
}
```

<Note>
  `signal` 字段告诉您的生成函数何时拆除进程。将其作为 `signal` 选项传递给 Node 的 `spawn()`，或将其传递给您的 VM 或容器拆除处理程序。

  此信号不会在 [`Options.abortController`](#options) 中止的瞬间触发。SDK 首先关闭进程的 stdin 并等待约两秒钟，以便 CLI 可以干净地关闭，然后中止此信号。要在调用者中止时立即做出反应，请侦听您自己的 `Options.abortController.signal`，您的生成函数可以从其封闭范围引用。
</Note>

<h3 id="mcpsetserversresult">
  `McpSetServersResult`
</h3>

`setMcpServers()` 操作的结果。

```typescript theme={null}
type McpSetServersResult = {
  added: string[];
  removed: string[];
  errors: Record<string, string>;
};
```

<h3 id="rewindfilesresult">
  `RewindFilesResult`
</h3>

`rewindFiles()` 操作的结果。

```typescript theme={null}
type RewindFilesResult = {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
};
```

<h3 id="sdkstatusmessage">
  `SDKStatusMessage`
</h3>

状态更新消息（例如，压缩）。

```typescript theme={null}
type SDKStatusMessage = {
  type: "system";
  subtype: "status";
  status: "compacting" | null;
  permissionMode?: PermissionMode;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdktasknotificationmessage">
  `SDKTaskNotificationMessage`
</h3>

后台任务完成、失败或停止时的通知。后台任务包括 `run_in_background` Bash 命令、[Monitor](#monitor) 监视和后台子代理。

```typescript theme={null}
type SDKTaskNotificationMessage = {
  type: "system";
  subtype: "task_notification";
  task_id: string;
  tool_use_id?: string;
  status: "completed" | "failed" | "stopped";
  output_file: string;
  summary: string;
  usage?: {
    total_tokens: number;
    tool_uses: number;
    duration_ms: number;
  };
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdktoolusesummarymessage">
  `SDKToolUseSummaryMessage`
</h3>

对话中工具使用的摘要。

```typescript theme={null}
type SDKToolUseSummaryMessage = {
  type: "tool_use_summary";
  summary: string;
  preceding_tool_use_ids: string[];
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkhookstartedmessage">
  `SDKHookStartedMessage`
</h3>

当 hook 开始执行时发出。

Claude Code 将此消息、[`SDKHookProgressMessage`](#sdkhookprogressmessage) 和 [`SDKHookResponseMessage`](#sdkhookresponsemessage) 立即传递到消息流，包括在会话启动期间 `SessionStart` 或 `Setup` hook 仍在运行时。Claude Code v2.1.169 至 v2.1.203 在 `SessionStart` 或 `Setup` hook 完成后以一个批次传递这些消息；v2.1.204 恢复了实时传递。

```typescript theme={null}
type SDKHookStartedMessage = {
  type: "system";
  subtype: "hook_started";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkhookprogressmessage">
  `SDKHookProgressMessage`
</h3>

在 hook 运行时发出，包含 stdout/stderr 输出。

```typescript theme={null}
type SDKHookProgressMessage = {
  type: "system";
  subtype: "hook_progress";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  stdout: string;
  stderr: string;
  output: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkhookresponsemessage">
  `SDKHookResponseMessage`
</h3>

当 hook 完成执行时发出。

```typescript theme={null}
type SDKHookResponseMessage = {
  type: "system";
  subtype: "hook_response";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  output: string;
  stdout: string;
  stderr: string;
  exit_code?: number;
  outcome: "success" | "error" | "cancelled";
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdktoolprogressmessage">
  `SDKToolProgressMessage`
</h3>

在工具执行时定期发出，以指示进度。

```typescript theme={null}
type SDKToolProgressMessage = {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  parent_tool_use_id: string | null;
  elapsed_time_seconds: number;
  task_id?: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkauthstatusmessage">
  `SDKAuthStatusMessage`
</h3>

在身份验证流程中发出。

```typescript theme={null}
type SDKAuthStatusMessage = {
  type: "auth_status";
  isAuthenticating: boolean;
  output: string[];
  error?: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdktaskstartedmessage">
  `SDKTaskStartedMessage`
</h3>

当后台任务开始时发出。`task_type` 字段对于后台 Bash 命令和 [Monitor](#monitor) 监视为 `"local_bash"`，对于子代理为 `"local_agent"`，或 `"remote_agent"`。

```typescript theme={null}
type SDKTaskStartedMessage = {
  type: "system";
  subtype: "task_started";
  task_id: string;
  tool_use_id?: string;
  description: string;
  task_type?: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdktaskprogressmessage">
  `SDKTaskProgressMessage`
</h3>

在子代理或后台任务运行时定期发出。仅当启用 [`agentProgressSummaries`](#options) 时，`summary` 字段才会被填充。

```typescript theme={null}
type SDKTaskProgressMessage = {
  type: "system";
  subtype: "task_progress";
  task_id: string;
  tool_use_id?: string;
  description: string;
  subagent_type?: string;
  usage: {
    total_tokens: number;
    tool_uses: number;
    duration_ms: number;
  };
  last_tool_name?: string;
  summary?: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdktaskupdatedmessage">
  `SDKTaskUpdatedMessage`
</h3>

当后台任务的状态发生变化时发出，例如当它从 `running` 转换为 `completed` 时。将 `patch` 合并到按 `task_id` 键入的本地任务映射中。`end_time` 字段是 Unix 纪元时间戳（以毫秒为单位），可与 `Date.now()` 比较。

```typescript theme={null}
type SDKTaskUpdatedMessage = {
  type: "system";
  subtype: "task_updated";
  task_id: string;
  patch: {
    status?: "pending" | "running" | "completed" | "failed" | "killed";
    description?: string;
    end_time?: number;
    total_paused_ms?: number;
    error?: string;
    is_backgrounded?: boolean;
  };
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkbackgroundtaskschangedmessage">
  `SDKBackgroundTasksChangedMessage`
</h3>

每当实时后台任务集发生变化时发出：任务启动、完成、被杀死，或前台代理被后台化。`tasks` 数组是完整的实时集。用每个有效负载替换任何缓存的集，而不是配对 `task_started` 和 `task_notification` 事件，以便下一个成员资格变化纠正您错过的任何事件。

相对于这些每个任务事件的顺序是未指定的，因此不要关联这两个流。

启动时不发出任何内容。每当会话的 CLI 进程启动或重新启动时重置为空集，并让下一个成员资格变化重新填充它。

需要 Claude Code v2.1.203 或更高版本。

```typescript theme={null}
type SDKBackgroundTasksChangedMessage = {
  type: "system";
  subtype: "background_tasks_changed";
  tasks: {
    task_id: string;
    task_type: string;
    description: string;
  }[];
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkthinkingtokensmessage">
  `SDKThinkingTokensMessage`
</h3>

在 Claude 生成思考块（包括编辑过的块）时发出，携带迄今为止生成的思考令牌的运行估计。`estimated_tokens` 是当前思考块的运行总计，`estimated_tokens_delta` 是此帧携带的增量。将其用于进度显示。顶级代理循环的最终计数是结果消息的 `usage.output_tokens`，它[不包括子代理令牌](/docs/zh-CN/agent-sdk/cost-tracking#get-the-total-cost-of-a-query)；使用 [`modelUsage`](#modelusage) 进行整树会计。

需要 Claude Code v2.1.153 或更高版本。

```typescript theme={null}
type SDKThinkingTokensMessage = {
  type: "system";
  subtype: "thinking_tokens";
  estimated_tokens: number;
  estimated_tokens_delta: number;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkfilespersistedevent">
  `SDKFilesPersistedEvent`
</h3>

当文件检查点持久化到磁盘时发出。

```typescript theme={null}
type SDKFilesPersistedEvent = {
  type: "system";
  subtype: "files_persisted";
  files: { filename: string; file_id: string }[];
  failed: { filename: string; error: string }[];
  processed_at: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkratelimitevent">
  `SDKRateLimitEvent`
</h3>

当会话遇到速率限制时发出。

```typescript theme={null}
type SDKRateLimitEvent = {
  type: "rate_limit_event";
  rate_limit_info: {
    status: "allowed" | "allowed_warning" | "rejected";
    resetsAt?: number;
    utilization?: number;
    errorCode?: "credits_required";
    canUserPurchaseCredits?: boolean;
    hasChargeableSavedPaymentMethod?: boolean;
  };
  uuid: UUID;
  session_id: string;
};
```

当 `errorCode` 为 `"credits_required"` 时，拒绝来自 claude.ai 订阅，其包含的使用量已耗尽，会话在用户购买使用额度之前无法继续。`canUserPurchaseCredits` 指示经过身份验证的用户是否可以为帐户购买额度，`hasChargeableSavedPaymentMethod` 指示是否有保存的付款方式。所有三个字段在非信用额度必需拒绝的速率限制事件中不存在。需要 Claude Code v2.1.181 或更高版本。

<h3 id="sdklocalcommandoutputmessage">
  `SDKLocalCommandOutputMessage`
</h3>

来自本地 slash command 的输出（例如，`/voice` 或 `/usage`）。在记录中显示为助手样式的文本。

```typescript theme={null}
type SDKLocalCommandOutputMessage = {
  type: "system";
  subtype: "local_command_output";
  content: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkcommandschangedmessage">
  `SDKCommandsChangedMessage`
</h3>

当可用命令集在会话中期发生变化时发出，例如当代理进入子目录时发现技能。`commands` 数组是完整的更新列表，因此用此有效负载替换任何缓存的命令列表。再次调用 `supportedCommands()` 不等同：该方法返回在初始化时捕获的快照，不反映会话中期的变化。

```typescript theme={null}
type SDKCommandsChangedMessage = {
  type: "system";
  subtype: "commands_changed";
  commands: SlashCommand[];
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkpromptsuggestionmessage">
  `SDKPromptSuggestionMessage`
</h3>

当启用 `promptSuggestions` 时在每个轮次后发出。包含预测的下一个用户提示。

```typescript theme={null}
type SDKPromptSuggestionMessage = {
  type: "prompt_suggestion";
  suggestion: string;
  uuid: UUID;
  session_id: string;
};
```

<h3 id="sdkconversationresetmessage">
  `SDKConversationResetMessage`
</h3>

当会话的对话被替换而不结束会话时发出，例如在 `/clear` 之后、在计划模式退出时或当新对话启动时。在 `new_conversation_id` 下挂载空记录，并丢弃任何缓存的会话标题。

```typescript theme={null}
type SDKConversationResetMessage = {
  type: "conversation_reset";
  new_conversation_id: UUID;
  uuid: UUID;
  session_id: string;
};
```

SDK 的已发布类型在 Claude Code v2.1.203 及更高版本中声明 `SDKConversationResetMessage`。在 v2.1.203 之前，`SDKMessage` 引用该类型而不声明它，因此当 `skipLibCheck` 被禁用时，在 `type === "conversation_reset"` 上缩小范围失败类型检查。

<h3 id="aborterror">
  `AbortError`
</h3>

用于中止操作的自定义错误类。

```typescript theme={null}
class AbortError extends Error {}
```

<h2 id="sandbox-configuration">
  沙箱配置
</h2>

<h3 id="sandboxsettings">
  `SandboxSettings`
</h3>

沙箱行为的配置。使用此选项以编程方式启用命令沙箱和配置网络限制。

```typescript theme={null}
type SandboxSettings = {
  enabled?: boolean;
  failIfUnavailable?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  excludedCommands?: string[];
  allowUnsandboxedCommands?: boolean;
  network?: SandboxNetworkConfig;
  filesystem?: SandboxFilesystemConfig;
  ignoreViolations?: Record<string, string[]>;
  enableWeakerNestedSandbox?: boolean;
  ripgrep?: { command: string; args?: string[] };
};
```

| 属性                          | 类型                                                    | 默认值         | 描述                                                                                                                              |
| :-------------------------- | :---------------------------------------------------- | :---------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`                   | `boolean`                                             | `false`     | 为命令执行启用沙箱模式                                                                                                                     |
| `failIfUnavailable`         | `boolean`                                             | `true`      | 如果 `enabled` 为 `true` 但沙箱无法启动，则在启动时停止。设置为 `false` 以回退到沙箱外执行，并在 stderr 上显示警告                                                     |
| `autoAllowBashIfSandboxed`  | `boolean`                                             | `true`      | 启用沙箱时自动批准 bash 命令                                                                                                               |
| `excludedCommands`          | `string[]`                                            | `[]`        | 始终绕过沙箱限制的命令（例如，`['docker']`）。这些自动运行在沙箱外，无需模型参与                                                                                  |
| `allowUnsandboxedCommands`  | `boolean`                                             | `true`      | 允许模型请求在沙箱外运行命令。当为 `true` 时，模型可以在工具输入中设置 `dangerouslyDisableSandbox`，这会回退到[权限系统](#permissions-fallback-for-unsandboxed-commands) |
| `network`                   | [`SandboxNetworkConfig`](#sandboxnetworkconfig)       | `undefined` | 网络特定的沙箱配置                                                                                                                       |
| `filesystem`                | [`SandboxFilesystemConfig`](#sandboxfilesystemconfig) | `undefined` | 用于读/写限制的文件系统特定沙箱配置                                                                                                              |
| `ignoreViolations`          | `Record<string, string[]>`                            | `undefined` | 违规类别到要忽略的模式的映射（例如，`{ file: ['/tmp/*'], network: ['localhost'] }`）                                                               |
| `enableWeakerNestedSandbox` | `boolean`                                             | `false`     | 为兼容性启用较弱的嵌套沙箱                                                                                                                   |
| `ripgrep`                   | `{ command: string; args?: string[] }`                | `undefined` | 沙箱环境中的自定义 ripgrep 二进制配置                                                                                                         |

<Note>
  沙箱取决于平台支持，在 Linux 上，还需要 `bubblewrap` 和 `socat` 等工具。当 `enabled` 为 `true` 且沙箱无法启动时，`query()` 报告一条 `result` 消息，其中 `subtype: "error_during_execution"`，原因在 `errors` 中。对于单个消息 `query()` 调用，SDK 在生成该错误结果后抛出异常，因此将循环包装在 try 块中以继续通过它。有关错误合约，请参阅[处理结果](/docs/zh-CN/agent-sdk/agent-loop#handle-the-result)。

  要改为运行沙箱外的命令，请设置 `failIfUnavailable: false`。
</Note>

<h4 id="example-usage">
  示例用法
</h4>

```typescript theme={null}
import { query } from "@anthropic-ai/claude-agent-sdk";

try {
  for await (const message of query({
    prompt: "Build and test my project",
    options: {
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
        network: {
          allowLocalBinding: true
        }
      }
    }
  })) {
    if ("result" in message) console.log(message.result);
  }
} catch (error) {
  // 单个 query() 调用在生成错误结果后抛出异常，
  // 例如当沙箱无法启动时（failIfUnavailable 默认为 true）。
  console.log(`Session ended with an error: ${error}`);
}
```

<Warning>
  **Unix socket 安全性：** `allowUnixSockets` 选项可以授予对强大系统服务的访问权限。例如，允许 `/var/run/docker.sock` 实际上通过 Docker API 授予对主机系统的完全访问权限，绕过沙箱隔离。仅允许严格必要的 Unix sockets 并了解每个的安全含义。
</Warning>

<h3 id="sandboxnetworkconfig">
  `SandboxNetworkConfig`
</h3>

沙箱模式的网络特定配置。这些设置适用于当父级 [`SandboxSettings`](#sandboxsettings) 中的 `enabled` 为 `true` 时的沙箱化 Bash 命令。它们不限制 WebFetch 工具，该工具改用[权限规则](/docs/zh-CN/permissions#webfetch)。

```typescript theme={null}
type SandboxNetworkConfig = {
  allowedDomains?: string[];
  deniedDomains?: string[];
  allowManagedDomainsOnly?: boolean;
  allowLocalBinding?: boolean;
  allowUnixSockets?: string[];
  allowAllUnixSockets?: boolean;
  httpProxyPort?: number;
  socksProxyPort?: number;
};
```

| 属性                        | 类型         | 默认值         | 描述                                                                                                                       |
| :------------------------ | :--------- | :---------- | :----------------------------------------------------------------------------------------------------------------------- |
| `allowedDomains`          | `string[]` | `[]`        | 沙箱进程可以访问的域名                                                                                                              |
| `deniedDomains`           | `string[]` | `[]`        | 沙箱进程无法访问的域名。优先于 `allowedDomains`                                                                                         |
| `allowManagedDomainsOnly` | `boolean`  | `false`     | 仅限管理设置。在[管理设置](/docs/zh-CN/permissions#managed-settings)中设置时，仅遵守来自管理设置的 `allowedDomains` 条目，来自用户、项目或本地设置的条目被忽略。通过 SDK 选项设置时无效 |
| `allowLocalBinding`       | `boolean`  | `false`     | 允许进程绑定到本地端口（例如，用于开发服务器）                                                                                                  |
| `allowUnixSockets`        | `string[]` | `[]`        | 进程可以访问的 Unix socket 路径（例如，Docker socket）                                                                                 |
| `allowAllUnixSockets`     | `boolean`  | `false`     | 允许访问所有 Unix sockets                                                                                                      |
| `httpProxyPort`           | `number`   | `undefined` | 网络请求的 HTTP 代理端口                                                                                                          |
| `socksProxyPort`          | `number`   | `undefined` | 网络请求的 SOCKS 代理端口                                                                                                         |

<Note>
  内置沙箱代理基于请求的主机名强制执行 `allowedDomains`，不会终止或检查 TLS 流量，因此[域前置](https://en.wikipedia.org/wiki/Domain_fronting)等技术可能会绕过它。有关详细信息，请参阅[沙箱安全限制](/docs/zh-CN/sandboxing#security-limitations)，以及[安全部署](/docs/zh-CN/agent-sdk/secure-deployment#traffic-forwarding)以配置 TLS 终止代理。
</Note>

<h3 id="sandboxfilesystemconfig">
  `SandboxFilesystemConfig`
</h3>

沙箱模式的文件系统特定配置。

```typescript theme={null}
type SandboxFilesystemConfig = {
  allowWrite?: string[];
  denyWrite?: string[];
  denyRead?: string[];
};
```

| 属性           | 类型         | 默认值  | 描述            |
| :----------- | :--------- | :--- | :------------ |
| `allowWrite` | `string[]` | `[]` | 允许写入访问的文件路径模式 |
| `denyWrite`  | `string[]` | `[]` | 拒绝写入访问的文件路径模式 |
| `denyRead`   | `string[]` | `[]` | 拒绝读取访问的文件路径模式 |

<h3 id="permissions-fallback-for-unsandboxed-commands">
  沙箱外命令的权限回退
</h3>

启用 `allowUnsandboxedCommands` 时，模型可以通过在工具输入中设置 `dangerouslyDisableSandbox: true` 来请求在沙箱外运行命令。这些请求回退到现有权限系统，意味着您的 `canUseTool` 处理程序被调用，允许您实现自定义授权逻辑。在下面的示例中，`isCommandAuthorized` 代表您定义的授权检查。

<Note>
  **`excludedCommands` vs `allowUnsandboxedCommands`：**

  * `excludedCommands`：始终自动绕过沙箱的命令的静态列表（例如，`['docker']`）。模型对此无法控制。
  * `allowUnsandboxedCommands`：让模型在运行时通过在工具输入中设置 `dangerouslyDisableSandbox: true` 来决定是否请求沙箱外执行。
</Note>

```typescript theme={null}
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Deploy my application",
  options: {
    sandbox: {
      enabled: true,
      allowUnsandboxedCommands: true // 模型可以请求沙箱外执行
    },
    permissionMode: "default",
    canUseTool: async (tool, input) => {
      // 检查模型是否请求绕过沙箱
      if (tool === "Bash" && input.dangerouslyDisableSandbox) {
        // 模型请求在沙箱外运行此命令
        console.log(`Unsandboxed command requested: ${input.command}`);

        if (isCommandAuthorized(input.command)) {
          return { behavior: "allow" as const, updatedInput: input };
        }
        return {
          behavior: "deny" as const,
          message: "Command not authorized for unsandboxed execution"
        };
      }
      return { behavior: "allow" as const, updatedInput: input };
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

此模式使您能够：

* **审计模型请求：** 记录模型何时请求沙箱外执行
* **实现允许列表：** 仅允许特定命令在沙箱外运行
* **添加批准工作流：** 需要对特权操作进行明确授权

<Warning>
  使用 `dangerouslyDisableSandbox: true` 运行的命令具有完整的系统访问权限。确保您的 `canUseTool` 处理程序仔细验证这些请求。

  如果 `permissionMode` 设置为 `bypassPermissions` 且 `allowUnsandboxedCommands` 启用，模型可以自主执行沙箱外的命令，无需任何批准提示（显式的 [`ask` 规则](/docs/zh-CN/agent-sdk/permissions#how-permissions-are-evaluated)仍会强制执行一个）。此组合实际上允许模型以静默方式逃离沙箱隔离。
</Warning>

<h2 id="see-also">
  另请参阅
</h2>

* [SDK 概述](/docs/zh-CN/agent-sdk/overview) - 常规 SDK 概念
* [Python SDK 参考](/docs/zh-CN/agent-sdk/python) - Python SDK 文档
* [CLI 参考](/docs/zh-CN/cli-reference) - 命令行界面
* [常见工作流](/docs/zh-CN/common-workflows) - 分步指南
