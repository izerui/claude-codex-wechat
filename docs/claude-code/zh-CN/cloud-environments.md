> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 配置云环境

> 为 Claude Code 云会话配置云环境：网络访问级别、环境变量、设置脚本和环境缓存。

<Note>
  云环境需要 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)，该功能目前处于研究预览阶段，适用于 Pro、Max 和 Team 用户，以及具有 [premium seats 或 Chat + Claude Code seats](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan) 的 Enterprise 用户。
</Note>

每个[云会话](/docs/zh-CN/claude-code-on-the-web)都在云环境中运行。您可以配置环境以允许或拒绝[网络访问](#access-levels)、为会话设置环境变量，以及在 Claude 开始工作前运行[设置脚本](#setup-scripts)。

相同的环境适用于您启动云会话的任何地方：[Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)、终端搭配 [`claude --cloud`](/docs/zh-CN/claude-code-on-the-web#from-terminal-to-web)、[Claude Tag](https://claude.com/docs/claude-tag/overview)、[例程](/docs/zh-CN/routines)、[Claude 移动应用](/docs/zh-CN/mobile)和 [Desktop 应用](/docs/zh-CN/desktop)。

<Info>
  [Remote Control](/docs/zh-CN/remote-control) 会话将网页和移动界面连接到您自己机器上的会话，该会话使用您机器的网络和文件，而不是云环境。Claude Tag 频道会话仅使用[共享环境](#organization-shared-environments)。
</Info>

<h2 id="the-default-environment">
  Default 环境
</h2>

无论您通过[网页](/docs/en/web-quickstart#connect-github)还是 CLI 流程（例如 `/web-setup`）连接，引导设置都会为您设置 **Default**（默认）环境；如果网页引导显示环境表单而不是创建环境，请保持表单的默认值以获得相同的 **Default** 环境。**Default** 本身不带有任何配置：

* [**Trusted** 网络访问](#access-levels)：会话可以访问包注册表和其他[允许列表中的域](#default-allowed-domains)，但无法通过会话的网络访问其他任何内容。
* 无其他配置：**Default** 不定义任何环境变量或设置脚本，因此会话只以[预安装的工具](#installed-tools)开始。

只有 **Default** 可用时，每个会话都在其中运行。当您有多个环境时，会话会按界面选择一个：

* 在网页、Desktop 应用和移动应用上，会话使用[选择器](#configure-your-environment)中显示的环境。当您尚未选择时，管理员设置的[组织默认值](#organization-shared-environments)会填入选择。
* 从 CLI，会话使用您的 [`/remote-env` 选择](#select-an-environment-from-the-cli)，或回退到您第一个可用的云环境。

当默认环境不够用时，请配置环境：当 Claude 需要访问[默认允许列表](#default-allowed-domains)之外的域、需要为其会话设置环境变量，或需要在开始工作前安装依赖项时。

<h2 id="configure-your-environment">
  配置您的环境
</h2>

从 [claude.ai/code](https://claude.ai/code) 的环境选择器创建、编辑和归档环境，您可以在[网页引导](/docs/zh-CN/web-quickstart)后到达该选择器。您创建的环境是您账户的个人环境；您的管理员创建的[共享环境](#organization-shared-environments)会出现在相同的选择器中。请参阅[已安装的工具](#installed-tools)以了解在没有任何配置的情况下可用的内容。

<Steps>
  <Step title="打开环境选择器">
    在 [claude.ai/code](https://claude.ai/code) 上，选择显示当前环境名称的云图标，位于消息框上方的栏中。选择器没有设置页面或直接 URL。

    <Frame>
      <img src="https://mintcdn.com/claude-code/ZFId6l95856c5LSw/images/cloud-environment-selector.png?fit=max&auto=format&n=ZFId6l95856c5LSw&q=85&s=cc2813a5664519eaf5a89d793ce5af26" alt="环境选择器在 claude.ai/code 的消息框上方打开。显示环境名称 Default 的云按钮位于消息框上方的栏中。打开的菜单列出一个 Local 行，其中包含 Download 和 Desktop only 标签、一个 Cloud 部分，其中 Default 环境被选中并显示勾号，悬停时显示设置齿轮图标、一个 Add cloud environment 选项，以及一个 Remote Control 部分，其中包含设置说明。" width="1672" height="682" data-path="images/cloud-environment-selector.png" />
    </Frame>
  </Step>

  <Step title="添加或编辑环境">
    选择 **Add cloud environment**，或悬停在现有环境上并选择右侧出现的设置图标。对话框包括名称、网络访问级别、环境变量和设置脚本。

    <Frame>
      <img src="https://mintcdn.com/claude-code/ZFId6l95856c5LSw/images/cloud-environment-dialog.png?fit=max&auto=format&n=ZFId6l95856c5LSw&q=85&s=30d4478b31d1f879f7ee287ddab32505" alt="New cloud environment 对话框。一个 Name 字段，占位符为 Default，一个 Network access 选择器设置为 Trusted，并链接到网络策略和访问级别、一个 Environment variables 框，显示 .env 格式占位符文本，并附注值对使用环境的任何人都可见、一个 Setup script 框，描述为在新会话启动时运行的 Bash 脚本，在 Claude Code 启动前，以及 Cancel 和 Create environment 按钮。" width="874" height="1372" data-path="images/cloud-environment-dialog.png" />
    </Frame>
  </Step>
</Steps>

<h3 id="set-environment-variables">
  设置环境变量
</h3>

环境变量使用 `.env` 格式，每行一个 `KEY=value` 对。普通值不需要引号，如果您用匹配的一对引号将值括起来，引号不会成为值的一部分。对跨多行或包含 `#` 的值加引号：在未加引号的值中，`#` 开始注释，该行的其余部分被丢弃。

以下示例定义三个变量。

```text theme={null}
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgres://localhost:5432/myapp
```

每个会话在启动时将环境的值复制一次到普通环境变量中，Claude 运行的任何命令都可以读取。因为运行中的会话不会重新读取配置，编辑或添加变量会影响您之后启动的会话；已在运行的会话保留它们启动时的值。

任何使用环境的人都可以读取值，云环境没有专用的密钥存储，因此不要添加 API 密钥或其他凭证。如果会话仍然需要凭证，请参阅[您的设置中会保留的内容](#what-carries-over-from-your-setup)。

<h3 id="select-an-environment-from-the-cli">
  从 CLI 选择环境
</h3>

在您的终端中运行 `/remote-env`，为您从 CLI 创建的云会话（例如 [`claude --cloud`](/docs/zh-CN/claude-code-on-the-web#from-terminal-to-web)）选择默认环境。该命令打开您现有环境的选择器，并将您的选择保存到[用户设置](/docs/zh-CN/settings#settings-files)中的 `remote.defaultEnvironmentId` 键，因此它适用于您机器上的每个项目，直到您更改它，除非在更高优先级的[设置层](/docs/zh-CN/settings#settings-precedence)（例如存储库的项目设置）中设置了相同的键。

`/remote-env` 只设置默认值：它不启动会话，也不能添加或编辑环境。在 [claude.ai/code](https://claude.ai/code) 管理它们。

<h3 id="archive-an-environment">
  归档环境
</h3>

要归档环境，请打开它进行编辑并选择 **Archive**。您无法删除环境，只能归档它。

归档影响新会话，而不是运行中的会话：

* 已在该环境中运行的会话会继续工作。
* 环境从选择器和 `/remote-env` 中消失，因此您无法为新会话选择它。
* 任何界面上都无法在已归档的环境中启动新会话。如果该环境是您保存的 [CLI 默认值](#select-an-environment-from-the-cli)，CLI 云会话会回退到您第一个可用的云环境。任何显式使用该环境配置的内容，例如[例程](/docs/zh-CN/routines#environments-and-network-access)，无法在其中启动新会话；请将其指向另一个环境。

<h3 id="organization-shared-environments">
  组织共享环境
</h3>

Team 和 Enterprise 计划上的所有者和管理员可以创建与组织的每个成员共享的云环境。共享环境会出现在每个成员的环境选择器中，与他们的个人环境并列，因此团队可以标准化一个配置，而不是每个成员重新创建它。

从 [admin settings](https://claude.ai/admin-settings) 中的 **Cloud environments** 页面创建、编辑和归档共享环境。每个共享环境都有一个名称、一个[网络访问级别](#access-levels)、`.env` 格式的[环境变量](#set-environment-variables)和一个[设置脚本](#setup-scripts)。所有者和管理员在 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code) 单独选择组织的[默认环境](#the-default-environment)。

共享环境中的值会到达该环境中每个成员的会话。与个人环境一样，共享环境没有专用的密钥存储，因此不要包含密钥。

在 [Claude Tag](https://claude.com/docs/claude-tag/overview) 频道中，Claude 以您组织的共享身份工作，而不是任何成员的身份，因此频道会话仅使用共享环境。您可以通过两种方式设置频道使用的环境：

* 在 [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code) 将共享环境设置为组织的[默认环境](#the-default-environment)。
* 在 Claude Tag 管理员设置中[将一个固定到频道](https://claude.com/docs/claude-tag/admins/troubleshooting#channel-sessions-use-the-wrong-environment-or-can%E2%80%99t-find-one)。

共享环境会添加到成员的选择器中，而不是取代它们。

<h2 id="network-access">
  网络访问
</h2>

每个环境都设置一个网络访问级别，控制其会话可以进行的出站连接。默认级别 **Trusted** 允许包注册表和其他[允许列表中的域](#default-allowed-domains)；**Custom** 采用您自己的域列表。

要更改环境的网络访问，[打开它进行编辑](#configure-your-environment)并在对话框中使用 **Network access** 选择器。打开选择器的云图标出现在[Default 环境](#the-default-environment)下列出的应用界面上，以及[例程编辑器](/docs/zh-CN/routines#environments-and-network-access)中；个人环境在您的 claude.ai 账户设置中没有单独的页面。

<Note>
  您在会话或例程上启用的 MCP 连接器无需将其主机添加到 **Allowed domains**，因为连接器流量通过 Anthropic 的服务器而不是会话的网络传输。您可以按会话或按例程配置连接器；移除任何您不需要的连接器，以限制 Claude 可以访问的工具。这依赖于[安全性和隔离](/docs/zh-CN/claude-code-on-the-web#security-and-isolation)下提到的同一条通往 Anthropic 的通道。
</Note>

<h3 id="access-levels">
  访问级别
</h3>

[环境对话框](#configure-your-environment)中的 **Network access** 字段采用以下四个级别之一：

| 级别          | 出站连接                                                    |
| :---------- | :------------------------------------------------------ |
| **None**    | 通过会话的网络没有出站网络访问                                         |
| **Trusted** | 仅限[允许列表中的域](#default-allowed-domains)：包注册表、GitHub、云 SDK |
| **Full**    | 任何域                                                     |
| **Custom**  | 您自己的允许列表，可选择包含默认值                                       |

GitHub 操作使用[单独的代理](#github-proxy)，独立于此设置，Claude Code 与 Anthropic API 的连接在 **None** 下仍然有效，如[安全性和隔离](/docs/zh-CN/claude-code-on-the-web#security-and-isolation)下所述。

<h3 id="allow-specific-domains">
  允许特定域
</h3>

要允许不在 Trusted 列表中的域，请在环境的网络访问设置中选择 **Custom**，然后在 **Allowed domains** 字段中每行列出一个域。此示例允许内部项目可能需要的三个主机。

```text theme={null}
api.example.com
*.internal.example.com
registry.example.com
```

此环境中的会话现在可以访问 `api.example.com`、`internal.example.com` 的任何子域和 `registry.example.com`，但无法通过会话的网络访问其他域；[GitHub 流量](#github-proxy)和 [MCP 连接器流量](#network-access)不经过此允许列表。前导 `*.` 匹配每个子域。要同时保留 [Trusted 域](#default-allowed-domains)，请勾选 **Also include default list of common package managers**；不勾选则只允许您列出的内容。

每个环境都有自己的允许域列表；没有组织级别的允许列表可供管理员推送到每个成员的环境。[服务器管理的设置](/docs/zh-CN/server-managed-settings)在云会话内仍然适用，但其中没有任何设置会将域添加到环境的网络允许列表。

<h3 id="github-proxy">
  GitHub 代理
</h3>

所有 GitHub 操作都经过专用代理，使您的真实 GitHub 凭证保留在会话的 VM 之外，独立于环境的[访问级别](#access-levels)：

* **Git 凭证**：VM 内的 git 客户端使用范围受限的凭证，代理验证并将其交换为您的实际 GitHub 令牌。
* **API 请求**：来自内置 GitHub 工具的请求，以及来自 [`proxy-injected` 占位符](#work-with-github-issues-and-pull-requests)下的 `gh` 的请求，会在替换为您的真实凭证后发出。
* **推送保护**：`git push` 仅适用于会话的当前工作分支；克隆、获取和 PR 操作正常工作。
* **存储库范围**：GitHub API 和发布资产请求仅能到达附加到会话的存储库，因此从未附加的存储库下载发布资产的设置脚本会收到 403。

来自公开存储库的已提交文件通过 `raw.githubusercontent.com` 到达，改由[安全代理](#security-proxy)处理。该域在默认 [Trusted 列表](#default-allowed-domains)中，因此除非环境的[访问级别](#access-levels)排除它，否则这些文件保持可访问。

<h3 id="security-proxy">
  安全代理
</h3>

云会话在 HTTP/HTTPS 网络代理后面运行，用于安全和滥用防范目的。所有出站互联网流量都经过此代理，它提供：

* 防范恶意请求
* 速率限制和滥用防范
* 增强安全性的内容过滤
* 所请求主机名的 DNS 级审计踪迹

<h2 id="what’s-available-in-cloud-sessions">
  云会话中可用的内容
</h2>

每个会话都会获得一台运行 Ubuntu 24.04 的全新虚拟机 (VM)，无论您自己的操作系统是什么，您的存储库已克隆，常见的工具链已预安装。本节涵盖这些默认值、内置 GitHub 工具、如何[运行测试和服务](#run-tests-start-services-and-add-packages)，以及每台 VM 获得的[资源限制](#resource-limits)。

<h3 id="what-carries-over-from-your-setup">
  您的设置中会保留的内容
</h3>

云会话从您存储库的全新克隆开始。您提交到存储库的任何内容都可用。您只在自己机器上安装或配置的任何内容在会话中都不可用。您组织的策略通过[服务器管理的设置](/docs/zh-CN/server-managed-settings)单独到达。

|                                                                                                                                   | 在云会话中可用 | 原因                                                                                                                                                                           |
| :-------------------------------------------------------------------------------------------------------------------------------- | :------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 您的存储库的 `CLAUDE.md`                                                                                                                | 是       | 克隆的一部分                                                                                                                                                                       |
| 您的存储库的 `.claude/settings.json` hooks                                                                                              | 是       | 克隆的一部分                                                                                                                                                                       |
| 您的存储库的 `.mcp.json` MCP 服务器                                                                                                        | 是       | 克隆的一部分                                                                                                                                                                       |
| 您的存储库的 `.claude/rules/`                                                                                                           | 是       | 克隆的一部分                                                                                                                                                                       |
| 您的存储库的 `.claude/skills/`、`.claude/agents/`、`.claude/commands/`                                                                    | 是       | 克隆的一部分                                                                                                                                                                       |
| 在 `.claude/settings.json` 中声明的 Plugins                                                                                            | 是       | 在会话启动时从您声明的 [marketplace](/docs/zh-CN/plugin-marketplaces) 安装。需要网络访问以到达 marketplace 来源                                                                                            |
| 您组织的[服务器管理的设置](/docs/zh-CN/server-managed-settings)                                                                                    | 是       | 在会话启动时从 Anthropic 的服务器获取。请参阅 [Surface coverage](/docs/zh-CN/model-config#surface-coverage) 了解 `availableModels` 在云会话中如何强制执行。通过 MDM 或管理配置文件部署到您设备的设置不适用，因为会话在 Anthropic 管理的 VM 上运行 |
| 您的用户 `~/.claude/CLAUDE.md`                                                                                                        | 否       | 位于您的机器上，不在存储库中                                                                                                                                                               |
| 您的用户 `~/.claude/skills/`、`~/.claude/agents/`、`~/.claude/commands/`                                                                | 否       | 位于您的机器上，不在存储库中。请改为将它们提交到存储库的 `.claude/` 目录。云会话会自动加载您在 claude.ai 上启用的技能                                                                                                       |
| 仅在您的用户设置中启用的 Plugins                                                                                                              | 否       | 用户范围的 `enabledPlugins` 位于 `~/.claude/settings.json`。请改为在存储库的 `.claude/settings.json` 中声明它们                                                                                   |
| 您使用 `claude mcp add` 在默认本地范围或用户范围添加的 MCP 服务器                                                                                      | 否       | 这些写入您机器上的 `~/.claude.json`，而不是存储库。请使用 `claude mcp add --scope project` 添加服务器，它会写入存储库的 [`.mcp.json`](/docs/zh-CN/mcp#project-scope)，并提交该文件                                         |
| 您的存储库的 `.claude/settings.json` `env` 块中的传输变量，例如 `NODE_EXTRA_CA_CERTS` 和 [mTLS 客户端证书变量](/docs/zh-CN/network-config#mtls-authentication) | 否       | 托管环境管理会话的 API 连接，因此 Claude Code 忽略这些键，并在会话的调试日志中记录每个被忽略的键                                                                                                                    |
| 静态 API 令牌和凭证                                                                                                                      | 否       | 尚不存在专用的密钥存储。请参阅下文                                                                                                                                                            |
| 交互式身份验证，例如 AWS SSO                                                                                                                | 否       | 不支持。SSO 需要基于浏览器的登录，无法在云会话中执行                                                                                                                                                 |

要在云会话中提供您自己的配置，请将其提交到存储库。

尚不提供专用的密钥存储，对话框会警告不要添加密钥或凭证：环境变量和设置脚本位于环境配置中，使用环境的任何人都可以读取它们。如果会话仍然需要凭证，请在考虑该可见性的前提下添加它。

<h3 id="installed-tools">
  已安装的工具
</h3>

云会话预安装了常见的语言运行时、构建工具和数据库。下表按类别总结了包含的内容。

| 类别            | 包含                                                                   |
| :------------ | :------------------------------------------------------------------- |
| **Python**    | Python 3.x，搭配 pip、poetry、uv、black、mypy、pytest、ruff                   |
| **Node.js**   | 20、21 和 22，通过 nvm，搭配 npm、yarn、pnpm、bun¹、eslint、prettier、chromedriver |
| **Ruby**      | 3.1、3.2、3.3，搭配 gem、bundler、rbenv                                     |
| **PHP**       | 8.4，搭配 Composer                                                      |
| **Java**      | OpenJDK 21，搭配 Maven 和 Gradle                                         |
| **Go**        | 最新稳定版，搭配模块支持                                                         |
| **Rust**      | rustc 和 cargo                                                        |
| **C/C++**     | GCC、Clang、cmake、ninja、conan                                          |
| **Docker**    | docker、dockerd、docker compose                                        |
| **Databases** | PostgreSQL 16、Redis 7.0                                              |
| **Utilities** | git、jq、yq、ripgrep、tmux、vim、nano                                      |

¹ Bun 已安装，但在包获取时存在已知的[代理兼容性问题](#install-dependencies-with-a-sessionstart-hook)。

如需确切版本，请让 Claude 在云会话中运行 `check-tools`。它是安装在会话 VM 上的 shell 命令，不是斜杠命令；您让 Claude 运行是因为 [Claude 为您运行所有 VM 命令](#run-tests-start-services-and-add-packages)。

此列表之外的工具链，例如 .NET SDK，即使其包注册表在[默认允许列表](#default-allowed-domains)上也不会预安装。请使用[设置脚本](#setup-scripts)安装它们。

<h3 id="work-with-github-issues-and-pull-requests">
  使用 GitHub 问题和拉取请求
</h3>

云会话包括内置 GitHub 工具，让 Claude 无需任何设置即可读取问题、列出拉取请求、获取差异和发布评论。这些工具通过 [GitHub 代理](#github-proxy)，使用您在 [GitHub 身份验证选项](/docs/zh-CN/claude-code-on-the-web#github-authentication-options)下设置的任何方法进行身份验证，因此您的令牌永远不会进入容器。

您可以在[环境配置](#set-environment-variables)中自己设置 `GH_TOKEN` 或 `GITHUB_TOKEN`，或者两者都不设置，让 [GitHub 代理](#github-proxy)为您进行身份验证：

* 如果您设置了令牌，它会原封不动地传递到容器中，因此您的脚本和 GitHub 的 [`gh` CLI](https://cli.github.com)（如果您安装它）会直接使用它。
* 如果您都不设置，则由 [GitHub 代理](#github-proxy)为您的会话处理身份验证，这两个变量在 Claude 运行的命令中读取为占位符字符串 `proxy-injected`，代理在出站 GitHub 请求上替换为您的真实凭证。`gh` 无需您自己的令牌即可工作，但直接读取 `GITHUB_TOKEN` 的脚本会得到占位符，而不是可用的令牌。

您设置的令牌是普通环境变量，因此使用环境的任何人都可以读取它；代理路径将凭证保留在环境配置和会话 VM 之外。

要检查哪种情况适用于您的会话，请让 Claude 运行 `echo $GH_TOKEN`。

GitHub 的 [`gh` CLI](https://cli.github.com) 未预安装。如果您需要内置工具未涵盖的 `gh` 命令，例如 `gh release` 或 `gh workflow run`，请自行安装并验证它：

<Steps>
  <Step title="在您的设置脚本中安装 gh">
    将 `apt update && apt install -y gh` 添加到您的[设置脚本](#setup-scripts)。
  </Step>

  <Step title="如果代理未处理身份验证，请提供令牌">
    如果 `echo $GH_TOKEN` 打印 `proxy-injected`，则 [GitHub 代理](#github-proxy)为您验证 `gh`，此步骤不必要。否则，请将 `GH_TOKEN` 环境变量添加到您的[环境配置](#set-environment-variables)中，搭配 GitHub 个人访问令牌；与任何环境变量一样，使用环境的任何人都可以读取它，因此请严格限定令牌范围。`gh` 会自动读取 `GH_TOKEN`，因此您不需要运行 `gh auth login`。
  </Step>
</Steps>

<h3 id="link-output-back-to-the-session">
  将输出链接回会话
</h3>

每个云会话在 claude.ai 上都有一个转录 URL，会话可以从 `CLAUDE_CODE_REMOTE_SESSION_ID` 环境变量读取自己的 ID。使用它在 PR 正文、提交消息、Slack 帖子或生成的报告中放置可追溯的链接，以便审阅者可以打开生成它们的运行。

Claude 在云会话中创建的提交包括 `Claude-Session: <url>` git 尾注，PR 正文在单独一行包括会话 URL。这需要 v2.1.179 或更新版本。要省略尾注和 PR 正文链接，请将 [`attribution.sessionUrl`](/docs/zh-CN/settings#attribution-settings) 设置为 `false`。此设置需要 v2.1.182 或更新版本。

要在提交或 PR 以外的内容中包含会话链接，例如 Claude 发布的 Slack 消息或它编写的报告文件，请让 Claude 运行以下命令并使用其输出。该命令将环境变量值中的 `cse_` 前缀转换为转录 URL 预期的 `session_` 前缀：

```bash theme={null}
echo "https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}"
```

<h3 id="run-tests-start-services-and-add-packages">
  运行测试、启动服务和添加包
</h3>

您无法进入会话 VM 的 shell。Claude 为您运行每个命令，因此请将本节中的工作表述为您提示中的请求。

<h4 id="run-tests">
  运行测试
</h4>

Claude 在处理工作的过程中运行测试。在您的提示中提出要求，例如"修复 `tests/` 中的失败测试"或"在每次更改后运行 pytest"。随[预安装的工具链](#installed-tools)提供的测试运行器（例如 pytest 和 cargo test）无需额外设置即可工作。您的项目声明为依赖项的运行器（例如 jest）会随您的依赖项一起安装。

<h4 id="start-services">
  启动服务
</h4>

PostgreSQL 和 Redis 已预安装但默认不运行。让 Claude 启动您需要的任何一个；它运行的命令是：

```bash theme={null}
service postgresql start
```

```bash theme={null}
service redis-server start
```

Docker 可用于运行容器化服务。让 Claude 运行 `docker compose up` 以启动您项目的服务。拉取镜像的网络访问遵循您环境的[访问级别](#access-levels)，[Trusted 默认值](#default-allowed-domains)包括 Docker Hub 和其他常见注册表。

如果您的镜像很大或拉取速度很慢，请将 `docker compose pull` 或 `docker compose build` 添加到您的[设置脚本](#setup-scripts)。[环境缓存](#environment-caching)保留拉取的镜像，因此每个新会话的磁盘上都有它们。缓存仅保存文件，不保存运行中的进程，因此 Claude 仍然在每个会话中启动容器。

<h4 id="add-packages">
  添加包
</h4>

要添加未预安装的包，请使用[设置脚本](#setup-scripts)。[环境缓存](#environment-caching)保留脚本安装的内容，因此您在那里安装的包在每个会话开始时都可用，无需每次重新安装。您也可以让 Claude 在会话中途安装包，但这些安装不会带到其他会话。

<h3 id="resource-limits">
  资源限制
</h3>

云会话运行时具有可能随时间变化的近似资源上限：

* 4 vCPU
* 16 GB RAM
* 30 GB 磁盘

VM 可能会停止需要明显更多内存的工作，例如大型构建工作或内存密集型测试。对于超出这些限制的工作负载，请使用 [Remote Control](/docs/zh-CN/remote-control) 在您自己的硬件上运行 Claude Code。

<h2 id="setup-scripts">
  设置脚本
</h2>

设置脚本是一个 Bash 脚本，在新的云会话启动时运行，在 Claude Code 启动之前运行。使用设置脚本来安装依赖项、配置工具，或获取会话需要但未预安装的任何内容。

脚本以 root 身份在 Ubuntu 24.04 上运行，因此 `apt install` 和大多数语言包管理器都能工作。

要添加设置脚本，请打开环境配置对话框，并在 **Setup script** 字段中输入您的脚本。

此示例安装 GitHub 的 [`gh` CLI](https://cli.github.com)，它不是预安装的。

```bash theme={null}
#!/bin/bash
apt update && apt install -y gh
```

<h3 id="script-requirements">
  脚本要求
</h3>

设置脚本有三个需要考虑的约束：

* **以零退出**：如果脚本以非零状态结束，会话将无法启动。在非关键命令后附加 `|| true`，以便间歇性安装失败不会阻止会话。
* **在五分钟内完成**：将脚本的总运行时间保持在大约五分钟以内，以便[环境缓存](#environment-caching)可以建立。使用 `&` 和 `wait` 并行运行独立的安装，并将任何无法容纳的单个下载移至 [SessionStart hook](#setup-scripts-vs-sessionstart-hooks)，在后台启动它。
* **安装需要网络访问**：包安装需要连接到注册表。默认的 **Trusted** 级别涵盖[常见包注册表](#default-allowed-domains)，包括 npm、PyPI、RubyGems 和 crates.io；使用 **None** 网络访问时，安装会失败。

<h3 id="environment-caching">
  环境缓存
</h3>

设置脚本在您第一次在环境中启动会话时运行。完成后，Anthropic 会对文件系统进行快照，并将该快照重用作后续会话的起点。新会话以您的依赖项、工具和 Docker 镜像已在磁盘上的状态开始，并跳过设置脚本步骤。即使脚本安装大型工具链或拉取容器镜像，这也能保持启动速度快。

缓存是文件系统快照，因此它会保留设置脚本写入磁盘的内容，并丢失任何仅在运行中的内容。您安装的包、您拉取的 Docker 镜像和您写入的文件都会保留。脚本启动的数据库、`docker compose up` 堆栈或任何其他后台进程不会保留；请通过询问 Claude 或使用 [SessionStart hook](#setup-scripts-vs-sessionstart-hooks) 在每个会话中启动这些。

当您更改环境的设置脚本或允许的网络主机时，以及当缓存在大约七天后到期时，设置脚本会再次运行以重建缓存。恢复现有会话永远不会重新运行设置脚本。

您不需要自己启用缓存或管理快照。

<h3 id="setup-scripts-vs-sessionstart-hooks">
  设置脚本与 SessionStart hooks
</h3>

使用设置脚本来配备 VM 本身：未[预安装](#installed-tools)的工具链和 CLI 工具。使用 [SessionStart hook](/docs/zh-CN/hooks#sessionstart) 进行应在各处运行的项目设置，包括云端和本地，例如 `npm install`。

当云会话启动时，设置脚本和 SessionStart hooks 按固定顺序运行：

1. 设置脚本首先运行，在 Claude Code 启动之前，且仅当不存在[缓存环境](#environment-caching)时。
2. Claude Code 启动并运行您的 SessionStart hooks，就像在每个会话（本地或云端）开始时一样。

|              | 设置脚本                                                  | SessionStart hooks                                                                                                                        |
| ------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **您在哪里设置它们** | [claude.ai/code](https://claude.ai/code) 的环境对话框       | [设置文件](/docs/zh-CN/settings#settings-files)，例如您的存储库的 `.claude/settings.json`；请参阅[您的设置中会保留的内容](#what-carries-over-from-your-setup)，了解哪些文件会到达云会话 |
| **它们何时运行**   | 在 Claude Code 启动之前，当存在[缓存环境](#environment-caching)时跳过 | 在 Claude Code 启动后，在每个会话（包括已恢复的会话）上                                                                                                        |
| **它们在哪里运行**  | 仅限云会话                                                 | 本地和云会话                                                                                                                                    |

如果您在用户级 `~/.claude/settings.json` 中有 SessionStart hooks，不要期望它们在云端生效：用户级设置保留在您的机器上。在云会话中，Claude Code 运行来自存储库和您组织的[服务器管理的设置](/docs/zh-CN/server-managed-settings)的 hooks。

<h3 id="install-dependencies-with-a-sessionstart-hook">
  使用 SessionStart hook 安装依赖项
</h3>

要仅在云会话中安装依赖项，请将 SessionStart hook 与检查其运行位置的脚本配对。

首先，将 SessionStart hook 添加到您的存储库的 `.claude/settings.json`。此配置告诉 Claude Code 在会话启动或恢复时运行存储库中的 `scripts/install_pkgs.sh`：

```json theme={null}
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/scripts/install_pkgs.sh"
          }
        ]
      }
    ]
  }
}
```

`matcher` 将 hook 限制为 `startup` 和 `resume` 事件，`$CLAUDE_PROJECT_DIR` 解析为存储库根目录，因此无论会话的工作目录是什么，hook 都能找到脚本。

接下来，在 `scripts/install_pkgs.sh` 创建脚本。它在云端之外立即退出，否则安装您的依赖项：

```bash theme={null}
#!/bin/bash

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

npm install
pip install -r requirements.txt
exit 0
```

`CLAUDE_CODE_REMOTE` 检查是将安装限制在云会话的关键：会话 VM 的环境将该变量设置为 `true`，在本地永远不会是 `true`，因此在您的笔记本电脑上，脚本会在安装任何内容之前退出。

这两个文件一起使每个云会话在启动时获得全新的 `npm install` 和 `pip install`，同时保持本地会话不受影响。

<h4 id="limitations-in-cloud-sessions">
  云会话中的限制
</h4>

SessionStart hooks 在云端的行为与本地相同，但有以下注意事项：

* **没有仅云端的范围**：hooks 在本地和云会话中都运行。要跳过本地运行，请检查 `CLAUDE_CODE_REMOTE` 环境变量，如上所示。
* **需要网络访问**：安装命令需要连接到包注册表。如果您的环境使用 **None** 网络访问，这些 hooks 会失败。**Trusted** 下的[默认允许列表](#default-allowed-domains)涵盖 npm、PyPI、RubyGems 和 crates.io。
* **代理兼容性**：所有出站流量都经过[安全代理](#security-proxy)。某些包管理器无法与此代理正确配合工作。Bun 是一个已知的例子。
* **增加启动延迟**：hooks 在每次会话启动或恢复时运行，不同于受益于[环境缓存](#environment-caching)的设置脚本。请通过在重新安装之前检查依赖项是否已存在来保持安装脚本快速。

要为后续 Bash 命令保留环境变量，请写入 `$CLAUDE_ENV_FILE` 指向的文件。请参阅 [SessionStart hooks](/docs/zh-CN/hooks#sessionstart) 了解详细信息。

要自定义基础镜像，请使用设置脚本在[提供的镜像](#installed-tools)上安装您需要的内容，或使用 `docker compose` 将您自己的镜像作为 Claude 旁边的容器运行。目前不支持完全替换基础镜像。

<h2 id="default-allowed-domains">
  默认允许的域
</h2>

使用 **Trusted** 网络访问，会话默认可以访问以下域。标记为 `*` 的域表示通配符子域匹配，因此 `*.gcr.io` 允许 `gcr.io` 的任何子域。

<AccordionGroup>
  <Accordion title="Anthropic 服务">
    * api.anthropic.com
    * statsig.anthropic.com
    * docs.claude.com
    * platform.claude.com
    * code.claude.com
    * claude.ai
  </Accordion>

  <Accordion title="版本控制">
    * github.com
    * [www.github.com](http://www.github.com)
    * api.github.com
    * npm.pkg.github.com
    * raw\.githubusercontent.com
    * pkg-npm.githubusercontent.com
    * objects.githubusercontent.com
    * release-assets.githubusercontent.com
    * codeload.github.com
    * avatars.githubusercontent.com
    * camo.githubusercontent.com
    * gist.github.com
    * gitlab.com
    * [www.gitlab.com](http://www.gitlab.com)
    * registry.gitlab.com
    * bitbucket.org
    * [www.bitbucket.org](http://www.bitbucket.org)
    * api.bitbucket.org
  </Accordion>

  <Accordion title="容器注册表">
    * registry-1.docker.io
    * auth.docker.io
    * index.docker.io
    * hub.docker.com
    * [www.docker.com](http://www.docker.com)
    * production.cloudflare.docker.com
    * download.docker.com
    * gcr.io
    * \*.gcr.io
    * ghcr.io
    * mcr.microsoft.com
    * \*.data.mcr.microsoft.com
    * public.ecr.aws
  </Accordion>

  <Accordion title="云平台">
    * cloud.google.com
    * accounts.google.com
    * gcloud.google.com
    * \*.googleapis.com
    * storage.googleapis.com
    * compute.googleapis.com
    * container.googleapis.com
    * azure.com
    * portal.azure.com
    * microsoft.com
    * [www.microsoft.com](http://www.microsoft.com)
    * \*.microsoftonline.com
    * packages.microsoft.com
    * dotnet.microsoft.com
    * dot.net
    * visualstudio.com
    * dev.azure.com
    * \*.amazonaws.com
    * \*.api.aws
    * oracle.com
    * [www.oracle.com](http://www.oracle.com)
    * java.com
    * [www.java.com](http://www.java.com)
    * java.net
    * [www.java.net](http://www.java.net)
    * download.oracle.com
    * yum.oracle.com
  </Accordion>

  <Accordion title="JavaScript 和 Node 包管理器">
    * registry.npmjs.org
    * [www.npmjs.com](http://www.npmjs.com)
    * [www.npmjs.org](http://www.npmjs.org)
    * npmjs.com
    * npmjs.org
    * yarnpkg.com
    * registry.yarnpkg.com
  </Accordion>

  <Accordion title="Python 包管理器">
    * pypi.org
    * [www.pypi.org](http://www.pypi.org)
    * files.pythonhosted.org
    * pythonhosted.org
    * test.pypi.org
    * pypi.python.org
    * pypa.io
    * [www.pypa.io](http://www.pypa.io)
  </Accordion>

  <Accordion title="Ruby 包管理器">
    * rubygems.org
    * [www.rubygems.org](http://www.rubygems.org)
    * api.rubygems.org
    * index.rubygems.org
    * ruby-lang.org
    * [www.ruby-lang.org](http://www.ruby-lang.org)
    * rubyforge.org
    * [www.rubyforge.org](http://www.rubyforge.org)
    * rubyonrails.org
    * [www.rubyonrails.org](http://www.rubyonrails.org)
    * rvm.io
    * get.rvm.io
  </Accordion>

  <Accordion title="Rust 包管理器">
    * crates.io
    * [www.crates.io](http://www.crates.io)
    * index.crates.io
    * static.crates.io
    * rustup.rs
    * static.rust-lang.org
    * [www.rust-lang.org](http://www.rust-lang.org)
  </Accordion>

  <Accordion title="Go 包管理器">
    * proxy.golang.org
    * sum.golang.org
    * index.golang.org
    * golang.org
    * [www.golang.org](http://www.golang.org)
    * goproxy.io
    * pkg.go.dev
  </Accordion>

  <Accordion title="JVM 包管理器">
    * maven.org
    * repo.maven.org
    * central.maven.org
    * repo1.maven.org
    * repo.maven.apache.org
    * jcenter.bintray.com
    * gradle.org
    * [www.gradle.org](http://www.gradle.org)
    * services.gradle.org
    * plugins.gradle.org
    * kotlinlang.org
    * [www.kotlinlang.org](http://www.kotlinlang.org)
    * spring.io
    * repo.spring.io
  </Accordion>

  <Accordion title="其他包管理器">
    * packagist.org (PHP Composer)
    * [www.packagist.org](http://www.packagist.org)
    * repo.packagist.org
    * nuget.org (.NET NuGet)
    * [www.nuget.org](http://www.nuget.org)
    * api.nuget.org
    * pub.dev (Dart/Flutter)
    * api.pub.dev
    * hex.pm (Elixir/Erlang)
    * [www.hex.pm](http://www.hex.pm)
    * cpan.org (Perl CPAN)
    * [www.cpan.org](http://www.cpan.org)
    * metacpan.org
    * [www.metacpan.org](http://www.metacpan.org)
    * api.metacpan.org
    * cocoapods.org (iOS/macOS)
    * [www.cocoapods.org](http://www.cocoapods.org)
    * cdn.cocoapods.org
    * haskell.org
    * [www.haskell.org](http://www.haskell.org)
    * hackage.haskell.org
    * swift.org
    * [www.swift.org](http://www.swift.org)
  </Accordion>

  <Accordion title="Linux 发行版">
    * archive.ubuntu.com
    * security.ubuntu.com
    * ubuntu.com
    * [www.ubuntu.com](http://www.ubuntu.com)
    * \*.ubuntu.com
    * ppa.launchpad.net
    * launchpad.net
    * [www.launchpad.net](http://www.launchpad.net)
    * \*.nixos.org
  </Accordion>

  <Accordion title="开发工具和平台">
    * dl.k8s.io (Kubernetes)
    * pkgs.k8s.io
    * k8s.io
    * [www.k8s.io](http://www.k8s.io)
    * releases.hashicorp.com (HashiCorp)
    * apt.releases.hashicorp.com
    * rpm.releases.hashicorp.com
    * archive.releases.hashicorp.com
    * hashicorp.com
    * [www.hashicorp.com](http://www.hashicorp.com)
    * repo.anaconda.com (Anaconda/Conda)
    * conda.anaconda.org
    * anaconda.org
    * [www.anaconda.com](http://www.anaconda.com)
    * anaconda.com
    * continuum.io
    * apache.org (Apache)
    * [www.apache.org](http://www.apache.org)
    * archive.apache.org
    * downloads.apache.org
    * eclipse.org (Eclipse)
    * [www.eclipse.org](http://www.eclipse.org)
    * download.eclipse.org
    * nodejs.org (Node.js)
    * [www.nodejs.org](http://www.nodejs.org)
    * developer.apple.com
    * developer.android.com
    * pkg.stainless.com
    * binaries.prisma.sh
  </Accordion>

  <Accordion title="云服务和监控">
    * statsig.com
    * [www.statsig.com](http://www.statsig.com)
    * api.statsig.com
    * sentry.io
    * \*.sentry.io
    * downloads.sentry-cdn.com
    * http-intake.logs.datadoghq.com
    * browser-intake-us5-datadoghq.com
    * \*.datadoghq.com
    * \*.datadoghq.eu
    * api.honeycomb.io
  </Accordion>

  <Accordion title="内容分发和镜像">
    * sourceforge.net
    * \*.sourceforge.net
    * packagecloud.io
    * \*.packagecloud.io
    * fonts.googleapis.com
    * fonts.gstatic.com
  </Accordion>

  <Accordion title="架构和配置">
    * json-schema.org
    * [www.json-schema.org](http://www.json-schema.org)
    * json.schemastore.org
    * [www.schemastore.org](http://www.schemastore.org)
  </Accordion>

  <Accordion title="Model Context Protocol">
    * \*.modelcontextprotocol.io
  </Accordion>
</AccordionGroup>

<h2 id="related-resources">
  相关资源
</h2>

* [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)：启动、管理和共享云会话
* [Web quickstart](/docs/zh-CN/web-quickstart)：连接 GitHub 并启动您的第一个云会话
* [Claude Tag](https://claude.com/docs/claude-tag/overview)：Claude 从 Slack 启动的会话在相同的环境中运行
* [Routines](/docs/zh-CN/routines)：计划运行使用相同的环境和网络访问级别
* [Remote Control](/docs/zh-CN/remote-control)：改为在您自己的机器的网络和文件上运行会话
* [SessionStart hooks](/docs/zh-CN/hooks#sessionstart)：存储库提交的设置，在本地和云会话中运行
* [Server-managed settings](/docs/zh-CN/server-managed-settings)：到达云会话的组织策略
