> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 企业网络配置

> 为企业环境配置 Claude Code，支持代理服务器、自定义证书颁发机构 (CA) 和相互传输层安全 (mTLS) 身份验证。

Claude Code 通过环境变量支持各种企业网络和安全配置。这包括通过公司代理服务器路由流量、信任自定义证书颁发机构 (CA)，以及使用相互传输层安全 (mTLS) 证书进行身份验证以增强安全性。

<Note>
  本页面显示的所有环境变量也可以在 [`settings.json`](/docs/zh-CN/settings) 中配置。
</Note>

<h2 id="proxy-configuration">
  代理配置
</h2>

<h3 id="environment-variables">
  环境变量
</h3>

Claude Code 遵守标准代理环境变量：

```bash theme={null}
# HTTPS 代理（推荐）
export HTTPS_PROXY=https://proxy.example.com:8080

# HTTP 代理（如果 HTTPS 不可用）
export HTTP_PROXY=http://proxy.example.com:8080

# 绕过特定请求的代理 - 空格分隔格式
export NO_PROXY="localhost 192.168.1.1 example.com .example.com"
# 绕过特定请求的代理 - 逗号分隔格式
export NO_PROXY="localhost,192.168.1.1,example.com,.example.com"
# 绕过所有请求的代理
export NO_PROXY="*"
```

<Note>
  Claude Code 不支持 SOCKS 代理。
</Note>

<h3 id="basic-authentication">
  基本身份验证
</h3>

如果您的代理需要基本身份验证，请在代理 URL 中包含凭证：

```bash theme={null}
export HTTPS_PROXY=http://username:password@proxy.example.com:8080
```

<Warning>
  避免在脚本中硬编码密码。改用环境变量或安全凭证存储。
</Warning>

<Tip>
  对于需要高级身份验证（NTLM、Kerberos 等）的代理，请考虑使用支持您的身份验证方法的 LLM 网关服务。
</Tip>

<h2 id="ca-certificate-store">
  CA 证书存储
</h2>

默认情况下，Claude Code 信任其捆绑的 Mozilla CA 证书和您的操作系统的证书存储。读取操作系统存储需要具有 `tls.getCACertificates` 的运行时：本机安装程序始终具有它，npm 安装需要 Node 22.15 或更高版本。在较旧的 Node 版本上，仅捆绑的集合和 `NODE_EXTRA_CA_CERTS` 适用。企业 TLS 检查代理（如 CrowdStrike Falcon 和 Zscaler）在其根证书安装在操作系统信任存储中且运行时可以读取它时无需额外配置即可工作。

`CLAUDE_CODE_CERT_STORE` 接受逗号分隔的源列表。识别的值为 `bundled`（Claude Code 附带的 Mozilla CA 集）和 `system`（操作系统信任存储）。默认值为 `bundled,system`。

仅信任捆绑的 Mozilla CA 集：

```bash theme={null}
export CLAUDE_CODE_CERT_STORE=bundled
```

仅信任操作系统证书存储：

```bash theme={null}
export CLAUDE_CODE_CERT_STORE=system
```

<Note>
  `CLAUDE_CODE_CERT_STORE` 没有专用的 `settings.json` 架构密钥。通过 `~/.claude/settings.json` 中的 `env` 块或直接在进程环境中设置它。
</Note>

<h2 id="custom-ca-certificates">
  自定义 CA 证书
</h2>

如果您的企业环境使用自定义 CA，请配置 Claude Code 以直接信任它：

```bash theme={null}
export NODE_EXTRA_CA_CERTS=/path/to/ca-cert.pem
```

<h2 id="mtls-authentication">
  mTLS 身份验证
</h2>

对于需要客户端证书身份验证的企业环境：

```bash theme={null}
# 用于身份验证的客户端证书
export CLAUDE_CODE_CLIENT_CERT=/path/to/client-cert.pem

# 客户端私钥
export CLAUDE_CODE_CLIENT_KEY=/path/to/client-key.pem

# 可选：加密私钥的密码短语
export CLAUDE_CODE_CLIENT_KEY_PASSPHRASE="your-passphrase"
```

Claude Code 在启动时读取证书和密钥文件，并在每次应用设置时重新读取它们，包括在会话期间设置更改时。要轮换证书和密钥，请替换相同路径上的文件。

<h2 id="network-access-requirements">
  网络访问要求
</h2>

Claude Code 需要访问以下 URL。在您的代理配置和防火墙规则中将这些 URL 列入白名单，特别是在容器化或受限网络环境中。

| URL                            | 用途                                                                                                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.anthropic.com`            | Claude API 请求                                                                                                                                                                                                                                                  |
| `claude.ai`                    | claude.ai 账户身份验证                                                                                                                                                                                                                                               |
| `platform.claude.com`          | Anthropic 控制台账户身份验证                                                                                                                                                                                                                                            |
| `mcp-proxy.anthropic.com`      | [来自 claude.ai 的 MCP 连接器](/docs/zh-CN/mcp#use-mcp-servers-from-claude-ai)，包括组织管理员配置的连接器。连接器流量通过此代理路由；对于 claude.ai 认证用户，连接器默认启用。要禁用，请设置 [`ENABLE_CLAUDEAI_MCP_SERVERS=false`](/docs/zh-CN/env-vars) 或 [`disableClaudeAiConnectors`](/docs/zh-CN/settings#available-settings) 设置 |
| `downloads.claude.ai`          | 插件可执行文件下载；原生安装程序和原生自动更新程序                                                                                                                                                                                                                                      |
| `storage.googleapis.com`       | `/plugin` 中显示的安装计数和插件元数据。已签名的 [artifact](/docs/zh-CN/artifacts) 上传首先尝试此主机；当 `api.anthropic.com` 被阻止时，发布会回退到它                                                                                                                                                        |
| `storage.googleapis.com`       | 2.1.116 版本之前的原生安装程序和原生自动更新程序                                                                                                                                                                                                                                   |
| `bridge.claudeusercontent.com` | [Chrome 中的 Claude](/docs/zh-CN/chrome) 扩展 WebSocket 桥接                                                                                                                                                                                                              |
| `*.claudeusercontent.com`      | 在 claude.ai 上查看[artifacts](/docs/zh-CN/artifacts)。查看器从此源的沙箱子域加载每个 artifact 的内容。查看器的浏览器中需要此项，CLI 本身不需要                                                                                                                                                               |
| `raw.githubusercontent.com`    | [`/release-notes`](/docs/zh-CN/commands) 的更新日志源和更新后显示的发布说明                                                                                                                                                                                                          |

如果您通过 npm 安装 Claude Code 或管理自己的二进制分发，最终用户不需要原生安装程序，自动更新程序不需要使用 `downloads.claude.ai`。表中的其他用途无论安装方法如何都适用。

Claude Code 默认还会发送可选的操作遥测数据，您可以使用环境变量禁用它。请参阅 [遥测服务](/docs/zh-CN/data-usage#telemetry-services) 了解如何在最终确定您的白名单之前禁用它。

使用 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud 的 Agent Platform](/docs/zh-CN/google-vertex-ai)、[Microsoft Foundry](/docs/zh-CN/microsoft-foundry) 或已登录的 [Claude apps gateway](/docs/zh-CN/claude-apps-gateway) 会话时，模型流量和身份验证会转到您的提供商或网关，而不是 `api.anthropic.com`、`claude.ai` 或 `platform.claude.com`。WebFetch 工具仍会调用 `api.anthropic.com` 进行其 [域名安全检查](/docs/zh-CN/data-usage#webfetch-domain-safety-check)，除非您在 [settings](/docs/zh-CN/settings) 中设置 `skipWebFetchPreflight: true`。

[Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 和 [Code Review](/docs/zh-CN/code-review) 从 Anthropic 管理的基础设施连接到您的存储库。如果您的 GitHub Enterprise Cloud 组织按 IP 地址限制访问，请启用 [已安装 GitHub Apps 的 IP 允许列表继承](https://docs.github.com/en/enterprise-cloud@latest/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/managing-allowed-ip-addresses-for-your-organization#allowing-access-by-github-apps)。Claude GitHub App 注册了其 IP 范围，因此启用此设置允许访问而无需手动配置。要 [手动将范围添加到您的允许列表](https://docs.github.com/en/enterprise-cloud@latest/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/managing-allowed-ip-addresses-for-your-organization#adding-an-allowed-ip-address)，或配置其他防火墙，请参阅 [Anthropic API IP 地址](https://platform.claude.com/docs/en/api/ip-addresses)。

对于防火墙后的自托管 [GitHub Enterprise Server](/docs/zh-CN/github-enterprise-server) 实例，请将相同的 [Anthropic API IP 地址](https://platform.claude.com/docs/en/api/ip-addresses) 列入白名单，以便 Anthropic 基础设施可以访问您的 GHES 主机来克隆存储库和发布审查评论。

<h3 id="desktop-and-claude-ai">
  Desktop 和 claude.ai
</h3>

前面的表格主要涵盖独立 CLI。Claude Desktop 应用和浏览器中的 claude.ai 从其他 Anthropic CDN 主机加载其应用代码，包括 `assets-proxy.anthropic.com`。允许 `claude.ai` 而阻止这些主机会产生空白页面而不是错误。请参阅 Desktop 页面上的 [网络访问要求](/docs/zh-CN/desktop#network-access-requirements)。

<h2 id="additional-resources">
  其他资源
</h2>

* [Claude Code 设置](/docs/zh-CN/settings)
* [环境变量参考](/docs/zh-CN/env-vars)
* [故障排除指南](/docs/zh-CN/troubleshooting)
