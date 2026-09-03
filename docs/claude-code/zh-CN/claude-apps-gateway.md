> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Amazon Bedrock、Claude Platform on AWS、Google Cloud 和 Microsoft Foundry 的 Claude 应用网关

> 通过自托管网关在 Amazon Bedrock、Claude Platform on AWS、Google Cloud 或 Microsoft Foundry 上运行 Claude Code，支持 SSO 登录、按组模型访问和 OTLP 遥测。

<Note>
  Claude 应用网关专为必须或倾向于通过自己的云提供商路由推理的组织设计，例如满足[数据驻留](/docs/zh-CN/claude-apps-gateway-deploy#compliance-posture)要求。如果您没有此要求，并且想要访问其他功能，例如 SCIM 配置或 Claude Code 网页和移动版本，Claude Enterprise 可能更适合。请参阅[功能可用性](/docs/zh-CN/feature-availability)页面，了解所有部署方法的完整比较。
</Note>

Claude 应用网关是一个自托管服务，位于开发人员的 Claude Code 客户端和模型提供商之间。开发人员使用您的企业身份提供商 (IdP) 登录，而不是持有 API 密钥或云凭证。网关持有上游凭证，按 IdP 组强制执行模型访问和[托管设置](/docs/zh-CN/permissions#managed-settings)，并将使用情况遥测转发到您自己的可观测性堆栈。

它包含在 `claude` 二进制文件中，因此在笔记本电脑上运行 Claude Code 的同一可执行文件可以使用 `claude gateway --config gateway.yaml` 运行网关服务器。

本页涵盖：

* [为什么使用 Claude 应用网关](#why-claude-apps-gateway)，它相比自己运行的优势，以及何时其他解决方案更合适
* 一个[快速入门](#quickstart)，包含[前置条件](#prerequisites)，可将网关从零配置到已登录的开发人员
* [连接开发人员](#connect-developers)，包括通过托管设置设置网关 URL
* [可用性和限制](#availability-and-limitations)，涵盖哪些 Claude Code 功能可通过网关工作以及服务器支持什么

配套页面深入讲解。[配置参考](/docs/zh-CN/claude-apps-gateway-config)涵盖快速入门编写的 YAML 文件中的每个选项，[部署指南](/docs/zh-CN/claude-apps-gateway-deploy)涵盖每个 IdP 的设置、Kubernetes 和 Cloud Run 部署以及操作。

<h2 id="why-claude-apps-gateway">
  为什么使用 Claude apps gateway
</h2>

[网关概述](/docs/zh-CN/gateways)涵盖网关的功能以及为什么要运行它。Claude apps gateway 是 Anthropic 自己的网关，内置于 `claude` 二进制文件中，并与每个 Claude Code 版本一起测试，因此它转发 Claude Code 发送的标头和请求字段，无需操作员维护单独的允许列表。部署后，它为您提供：

* **凭证**：上游 API 密钥或云凭证仅存在于您的基础设施中。开发人员使用公司 SSO 进行身份验证并接收短期的持有者令牌，因此离职发生在您的 IdP 中。取消配置用户，其网关访问权限在会话生命周期内过期，默认为一小时。
* **访问控制**：您的 IdP 组映射到模型允许列表和[托管设置](/docs/zh-CN/permissions#managed-settings)策略。网关在服务器端强制执行模型访问，拒绝非授予模型的请求，并选择每个组的托管设置策略，CLI 在[托管设置层](/docs/zh-CN/settings#settings-precedence)应用该策略。不同的团队获得不同的模型、工具和权限，开发人员无法覆盖其策略锁定的内容。
* **设置交付**：网关本身将托管设置交付给已登录的客户端，取代来自 claude.ai 管理员控制台的[服务器管理设置](/docs/zh-CN/server-managed-settings)。
* **遥测**：每个配置的目标（如 Datadog、Splunk 或 ClickHouse）接收[OpenTelemetry Protocol (OTLP) 指标](/docs/zh-CN/monitoring-usage)，默认包含令牌计数、模型、用户身份和延迟，日志和跟踪作为按目标的选择加入。
* **上游路由**：客户端向网关发送 Anthropic Messages API，网关为每个上游进行转换，无论是 Amazon Bedrock、[AWS 上的 Claude Platform](/docs/zh-CN/claude-platform-on-aws)、Google Cloud 的 Agent Platform、Microsoft Foundry 还是 Anthropic API，并在它们之间进行故障转移。您可以更改区域、提供商或故障转移顺序，而开发人员无需注意或重新配置。

<Frame>
  <img src="https://mintcdn.com/claude-code/VbyXug8hBU9UK6oT/images/claude-gateway-architecture.svg?fit=max&auto=format&n=VbyXug8hBU9UK6oT&q=85&s=9e4f1190fc56718144190a3db61c63af" alt="显示 Claude Code 客户端通过 HTTPS 和持有者令牌连接到基础设施内自托管的 Claude apps gateway 的图表，网关针对您的 IdP 对用户进行签名，在 PostgreSQL 中存储身份验证状态，将遥测转发到您的 OTLP 收集器，并将推理转发到 Amazon Bedrock、AWS 上的 Claude Platform、Google Cloud、Microsoft Foundry 或 Anthropic API" width="760" height="320" data-path="images/claude-gateway-architecture.svg" />
</Frame>

<Note>
  网关自己的数据平面不会向 Anthropic 基础设施发送任何内容，除非 Anthropic API 是配置的上游。您控制遥测、审计日志、托管设置和开发人员的 IdP 身份的去向，网关不会将它们中的任何一个发送给 Anthropic。对于其余流量，CLI 进程可以发送什么以及如何关闭它，请参阅[合规态势](/docs/zh-CN/claude-apps-gateway-deploy#compliance-posture)。
</Note>

有关哪些 Claude Code 功能通过网关工作以及服务器本身支持什么，请参阅下面的[可用性和限制](#availability-and-limitations)。有关成本、绕过、运行多个网关和无服务器平台等决策，请参阅[部署指南](/docs/zh-CN/claude-apps-gateway-deploy#deployment)。

<h3 id="other-gateway-implementations">
  其他网关实现
</h3>

如果您已经运行满足您需求的 LLM 网关或 API 网关，请继续使用它；[其他 LLM 网关](/docs/zh-CN/llm-gateway)涵盖针对它配置 Claude Code。

[网关协议参考](/docs/zh-CN/llm-gateway-protocol)记录了 Claude Code 期望从任何网关获得的合同：它调用的端点、要转发的标头和正文字段，以及删除它们时停止工作的内容。运行中的 Claude apps gateway 在 `GET /protocol` 处提供该合同的超集，添加 Claude apps gateway 特定的端点用于 SSO 登录、托管设置交付和遥测。使用 `curl https://claude-gateway.internal.example.com/protocol` 从任何已部署的网关（例如下面[快速入门](#quickstart)生成的网关）获取它。协议的重大更改会提前宣布，但不保证无限期的向后兼容性。

<h2 id="quickstart">
  快速入门
</h2>

本快速入门演示最小路径：在您的 IdP 中注册 OAuth 客户端，编写 `gateway.yaml`，使用 Docker Compose 运行网关和 Postgres，并端到端验证登录。它使用 Amazon Bedrock 上游；Claude Platform on AWS、Google Cloud 的 Agent Platform、Microsoft Foundry 和 Anthropic API 同样受支持，只需交换[配置参考](/docs/zh-CN/claude-apps-gateway-config#upstreams)中所示的 `upstreams` 块。最后，您有一个开发人员可以 `/login` 的网关。

<Note>
  **在您的私有网络上部署。** Claude Code 仅连接到地址为私有的网关。这是一个安全防护，因为受信任的网关可以推送在开发人员机器上运行命令的设置。将网关放在内部负载均衡器或 VPN 后面，并给它一个仅解析为私有 IP 的主机名。

  Anthropic 运营的公共网关端点是例外：`/login` 通过 `https://` 接受它们。这些是 Anthropic 本身运营的一小组固定网关；它们不是您可以选择或配置的部署选项。该列表被编译到 Claude Code 中，因此没有配置可以向其添加主机名，您托管的任何网关都不符合豁免条件。在 v2.1.206 之前，`/login` 像拒绝任何其他公共地址一样拒绝这些端点。
</Note>

<h3 id="prerequisites">
  前置条件
</h3>

在开始之前，请准备好以下内容：

| 您需要                         | 详情                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code v2.1.195 或更高版本  | `claude gateway` 子命令和网关登录流在 v2.1.195 中发布。早期的公开版本不包含它们。运行网关服务器的机器和每个开发人员的机器都必须是 v2.1.195 或更高版本；运行 `claude update` 获取最新版本。 [Claude Platform on AWS 上游](/docs/zh-CN/claude-apps-gateway-config#claude-platform-on-aws)在网关服务器上需要 Claude Code v2.1.198 或更高版本。                                                                                                                                             |
| OpenID Connect (OIDC) 身份提供商 | Okta、Microsoft Entra ID、Google Workspace、Keycloak 或 Dex，或任何其他符合 OIDC 的 IdP，如 PingFederate。网关针对它运行标准 OIDC 发现和授权代码流。不支持 SAML 和 LDAP。                                                                                                                                                                                                                                                              |
| PostgreSQL 14 或更高版本         | 支持设备登录流，其中浏览器回调写入，轮询 CLI 读取，加上速率限制计数器。任何托管 Postgres 都可以，包括最小层级。在没有配置支出限制的情况下，网关存储几 KB 的短期身份验证状态；使用[支出限制](/docs/zh-CN/claude-apps-gateway-spend-limits)，它还保存应备份的持久支出、审计和身份表。建议通过 `?sslmode=require` 使用 TLS。                                                                                                                                                                                           |
| 模型上游                        | Amazon Bedrock 凭证、Claude Platform on AWS 凭证、Google Cloud 凭证、Microsoft Foundry 资源或 Anthropic API 密钥。支持多个上游和故障转移。                                                                                                                                                                                                                                                                                 |
| HTTPS                       | 网关必须可从开发人员笔记本电脑和用于登录的任何浏览器通过 `https://` 访问；网关在同一侦听器上提供设备验证页面。通过 `listen.tls` 提供 TLS 证书，或在 TLS 终止入口后运行并设置 `listen.public_url`。纯 `http://` 源仅在本地开发的环回上接受。                                                                                                                                                                                                                                         |
| 私有网络地址                      | 在 `/login` 处，Claude Code 要求网关的主机名或 IP 地址仅解析为私有地址：RFC 1918、CGNAT `100.64.0.0/10`、IPv6 ULA `fc00::/7` 或本地开发的环回。检查在每个解析的 IP 上运行，因此如果名称解析到的任何地址是公共的，`/login` 会拒绝该 URL。如果开发人员机器通过公司代理路由 HTTPS，登录还要求代理主机解析为私有地址；如果不是，将网关主机添加到 `NO_PROXY`，以便 CLI 直接连接。Anthropic 运营的公共网关端点豁免于私有地址和代理检查：`/login` 通过精确主机名匹配接受它们通过 `https://`，因此私有网络要求仅适用于您自己托管的网关。在 v2.1.206 之前，`/login` 像拒绝任何其他公共地址一样拒绝 Anthropic 运营的端点。 |
| Linux 运行时                   | 网关服务器仅在本机 Linux 二进制文件上运行。macOS 适用于本地开发。Windows 不支持作为服务器平台。                                                                                                                                                                                                                                                                                                                                      |

网关服务器需要本机 `claude` 二进制文件；如[安装 Claude Code](/docs/zh-CN/setup) 中所述下载固定版本。服务器使用在 Claude Code 在 Node 下运行时不可用的运行时功能。如果您在启动时看到 `requires the native binary`，请切换到其中一种独立安装方法。

<h3 id="steps">
  步骤
</h3>

<Steps>
  <Step title="在您的 IdP 中注册 OAuth 客户端">
    首先决定网关的主机名，因为重定向 URI 必须与其匹配。创建新的 OIDC Web 应用程序并将重定向 URI 设置为 `https://claude-gateway.<your-domain>/oauth/callback`，其中主机是您在步骤 3 中设置为 [`listen.public_url`](/docs/zh-CN/claude-apps-gateway-config#listen) 的相同值。记下 `client_id` 和 `client_secret`。每个 IdP 的说明在[身份提供商设置](/docs/zh-CN/claude-apps-gateway-deploy#identity-provider-setup)中。
  </Step>

  <Step title="配置 PostgreSQL 数据库">
    任何 Postgres 14 或更高版本都可以，包括最小的托管层级。网关在启动时运行自己的架构迁移，因此数据库用户需要 `CREATE TABLE` 权限。如果您的安全策略禁止应用程序角色的 DDL，请改为预先创建架构；请参阅 [`store`](/docs/zh-CN/claude-apps-gateway-config#store)。
  </Step>

  <Step title="编写 gateway.yaml">
    通过 `${ENV_VAR}` 扩展读取机密，因此文件本身可以存在于版本控制中。使用在您的网络上解析为私有 IP 的 `public_url` 主机名，因为 `/login` 拒绝公共地址。最小配置有五个部分，其他所有字段都有默认值：

    ```yaml gateway.yaml theme={null}
    listen:
      host: 0.0.0.0
      port: 8080
      # 在任何 TLS 终止代理后需要。用于 IdP
      # redirect_uri 和发现文档。
      public_url: https://claude-gateway.internal.example.com

    oidc:
      issuer: https://login.example.com        # 必须提供 /.well-known/openid-configuration
      client_id: 0oa1example2
      client_secret: ${OIDC_CLIENT_SECRET}
      allowed_email_domains: [example.com]        # 拒绝组织外的 id_tokens
      userinfo_fallback: true                  # 对于 id_token 省略 email/groups 的 IdP；否则无害

    session:
      jwt_secret: ${GATEWAY_JWT_SECRET}        # openssl rand -base64 32
      ttl_hours: 1                             # 也限制 IdP 取消配置时的撤销延迟

    store:
      postgres_url: ${GATEWAY_POSTGRES_URL}    # 为托管 Postgres 添加 ?sslmode=require

    upstreams:
      - provider: bedrock
        region: us-east-1
        auth: {} # 空：AWS 默认凭证链
    # (IRSA, EC2/ECS task role, env vars, ~/.aws)

    # 模型会自动按上游转换。内置目录
    # 将 claude-opus-4-8 映射到 us.anthropic.claude-opus-4-8 等，
    # 对于每个 Bedrock 支持的 Claude 模型。设置为 false 并添加 `models:` 列表以
    # 仅公开特定模型。
    auto_include_builtin_models: true
    ```

    此配置足以使用默认 Amazon Bedrock 模型目录进行工作登录循环。运行后，通过 [`managed.policies`](/docs/zh-CN/claude-apps-gateway-config#managed) 添加按组 RBAC 和托管设置，通过 [`telemetry`](/docs/zh-CN/claude-apps-gateway-config#telemetry) 添加遥测扇出，以及通过 [`models`](/docs/zh-CN/claude-apps-gateway-config#models) 添加多上游故障转移、预配置吞吐量 ARN 或非美国地区。

    <Note>
      Bedrock 上游需要一个 AWS 主体，具有对 `inference-profile/us.anthropic.*` ARN 和底层 `foundation-model/anthropic.*` ARN 的 `bedrock:InvokeModel` 和 `bedrock:InvokeModelWithResponseStream`，以及在 Bedrock 控制台中为您想要的 Claude 模型启用的模型访问。使用 EKS 上的 IRSA、ECS 任务角色或 EC2 实例配置文件提供凭证，而不是静态密钥。[`upstreams` 参考](/docs/zh-CN/claude-apps-gateway-config#upstreams)具有完整的 IAM 详情、跨云凭证矩阵以及其他提供商的 `auth` 块。
    </Note>
  </Step>

  <Step title="运行它">
    围绕满足[镜像要求](/docs/zh-CN/claude-apps-gateway-deploy#container-image)的 `claude` 二进制文件构建容器镜像，然后将其与 Postgres 一起运行：

    ```yaml docker-compose.yaml theme={null}
    services:
      gateway:
        image: <your-registry>/claude-gateway:<version>
        ports: ["8080:8080"]
        volumes: ["./gateway.yaml:/etc/claude/gateway.yaml:ro"]
        environment:
          OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET}
          GATEWAY_JWT_SECRET: ${GATEWAY_JWT_SECRET}
          GATEWAY_POSTGRES_URL: postgres://gw:pw@postgres/gateway
          # AWS 凭证：在生产中，省略这些并使用实例
          # 角色。对于本地 Compose 测试，传递您自己的：
          AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
          AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
          AWS_SESSION_TOKEN: ${AWS_SESSION_TOKEN}
        depends_on:
          postgres:
            condition: service_healthy
      postgres:
        image: postgres:16-alpine
        environment: { POSTGRES_USER: gw, POSTGRES_PASSWORD: pw, POSTGRES_DB: gateway }
        healthcheck:
          test: ["CMD-SHELL", "pg_isready -U gw"]
          interval: 5s
        volumes: ["pgdata:/var/lib/postgresql/data"]
    volumes: { pgdata: }
    ```

    网关是一个单一的 Linux 二进制文件，读取配置，针对您的 IdP 运行 OIDC 发现，应用其 Postgres 架构迁移，构建上游客户端，并开始侦听。启动对配置、Postgres 连接（5 秒超时）、OIDC 发现和上游客户端构造是失败关闭的。如果其中任何一个无法访问或配置错误，网关会以错误退出，而不是以降级状态提供流量。

    成功启动不会验证推理路径，因为 Bedrock 和 Google Cloud 的 Agent Platform 实例凭证在第一个请求时解析，而不是在启动时。

    监视 stderr 以获取启动序列。日志行使用格式 `[gateway] <timestamp> <level> <message>`，审计事件是带有 `evt` 字段的单行 JSON，启动横幅（下面省略）在迁移和侦听行之间打印。您应该按顺序看到：

    ```text theme={null}
    {"ts":"2026-06-10T17:03:21.114Z","evt":"config.load","path":"/etc/claude/gateway.yaml","sha256":"…"}
    [gateway] 2026-06-10T17:03:21.408Z info migration 1 applied
    [gateway] 2026-06-10T17:03:21.512Z info claude gateway listening on http://0.0.0.0:8080
    ```

    如果启动在 `claude gateway listening on` 行之前退出，stderr 的最后一行命名问题：

    * 无法访问的 Postgres
    * 没有 DDL 权限的 Postgres 角色
    * 无法访问或无效的 OIDC 发现文档
    * 配置架构违规，带有违规字段路径

    修复它并重新启动。

    如果您已经有 TLS 终止入口，请跳过 Compose 并直接使用 `claude gateway --config gateway.yaml` 运行二进制文件。将 `public_url` 设置为入口源，并将 `listen` 绑定到环回或集群内部地址。
  </Step>

  <Step title="验证身份验证表面">
    三个检查确认网关可以在将其交给开发人员之前对真实用户进行身份验证。

    示例使用网关的公共 URL；对于没有入口的本地 Compose 设置，在前两个检查中替换 `http://localhost:8080`。第三个检查打开 `verification_uri_complete`，它从 `public_url` 构建，因此对于本地 Compose，在 `gateway.yaml` 中设置 `public_url: http://localhost:8080`，并在步骤 1 的 OAuth 客户端上添加 `http://localhost:8080/oauth/callback` 作为第二个重定向 URI，因为网关从 `public_url` 构建 IdP `redirect_uri`。验证链接然后在您的本地浏览器中打开。

    在 Windows PowerShell 中，运行 `curl.exe`；裸 `curl` 是 `Invoke-WebRequest` 的别名，拒绝这些标志。

    首先，获取发现文档，确认网关已启动，配置有效，所有启动检查都通过：

    ```bash theme={null}
    curl -s https://claude-gateway.internal.example.com/.well-known/oauth-authorization-server | jq
    ```

    ```json theme={null}
    {
      "issuer": "https://claude-gateway.internal.example.com",
      "device_authorization_endpoint": "…/oauth/device_authorization",
      "token_endpoint": "…/oauth/token",
      "grant_types_supported": ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]
    }
    ```

    响应包括其他字段，如 `response_types_supported` 和 `scopes_supported`。

    其次，请求设备授权，确认设备登录流工作且 Postgres 可访问且可写：

    ```bash theme={null}
    curl -s -X POST https://claude-gateway.internal.example.com/oauth/device_authorization | jq
    ```

    ```json theme={null}
    {
      "device_code": "…",
      "user_code": "WDJB-MJHT",
      "verification_uri": "https://claude-gateway.internal.example.com/device",
      "verification_uri_complete": "https://claude-gateway.internal.example.com/device?user_code=WDJB-MJHT",
      "expires_in": 600,
      "interval": 5
    }
    ```

    第三，通过在浏览器中打开 `verification_uri_complete` 并确认代码来测试浏览器部分。您应该被重定向到您的 IdP 的登录页面，登录后，返回网关并显示已登录确认。

    使用第一个失败的检查来定位问题：

    * **第一个检查失败**：启动未完成；检查 stderr
    * **第二个检查失败**：Postgres 无法从网关访问或角色无法写入；检查连接字符串和授予
    * **第三个检查未到达 IdP**：检查 IdP 的重定向 URI 是否与 `https://<gateway>/oauth/callback` 完全匹配
    * **第三个检查到达 IdP 但以错误反弹**：读取网关的审计日志，它记录每个身份验证拒绝及其原因，例如 `email domain not allowed`
  </Step>

  <Step title="登录开发人员">
    最后一步发生在开发人员机器上，而不是服务器上。在该机器的[托管设置文件](/docs/zh-CN/settings#settings-files)中将 `forceLoginMethod` 设置为 `"gateway"` 并将 `forceLoginGatewayUrl` 设置为您的网关的 `public_url`，然后运行 `/login`，在**Cloud gateway** 屏幕上按 Enter，并完成浏览器登录。下面的[设置网关 URL](#set-the-gateway-url)涵盖大规模分发两个密钥。
  </Step>
</Steps>

<h2 id="connect-developers">
  连接开发人员
</h2>

开发人员从自己的笔记本电脑使用一次浏览器登录进行连接，使用他们的公司工作账户。他们不需要 claude.ai 账户、API 密钥或订阅，因为对模型的请求通过网关使用组织的上游凭证。连接由您通过 MDM 推送的[客户端托管设置](/docs/zh-CN/claude-apps-gateway-config#client-side-managed-settings)驱动，因此开发人员端没有手动设置；本部分涵盖管理员配置的内容。

CLI 在首次连接时对网关的 TLS 叶证书进行指纹识别，并按主机名固定它。发布预期的 SHA-256 指纹以及网关 URL，以便开发人员有东西可以比较。使用 `openssl x509 -noout -fingerprint -sha256 -in cert.pem` 从证书文件获取指纹；`/login` 提示显示摘要的前 16 个字符作为小写十六进制，无分隔符。

当证书轮换时，每个开发人员都会再次看到信任提示，因此将轮换视为计划事件并重新发布指纹。

登录后，[模型选择器](/docs/zh-CN/model-config)显示开发人员 `availableModels` 允许列表中的模型，托管设置在启动时应用并每小时刷新一次，遥测路由到您的收集器。会话在 `ttl_hours` 过期前静默刷新，IdP 取消配置后的失败刷新会提示重新登录。

<h3 id="set-the-gateway-url">
  设置网关 URL
</h3>

在您通过 MDM 或直接在磁盘上部署的每个操作系统[托管设置文件](/docs/zh-CN/settings#settings-files)中设置两个密钥，`/login` 直接在**Cloud gateway** 屏幕上打开，URL 已填入：

```json theme={null}
{
  "forceLoginMethod": "gateway",
  "forceLoginGatewayUrl": "https://claude-gateway.internal.example.com"
}
```

开发人员按 Enter 连接。首次连接 TLS 指纹提示仍然出现。

登录选择器中没有网关选项供开发人员手动选择，`forceLoginGatewayUrl` 在开发人员自己的设置文件中被忽略。单独的 `forceLoginMethod`，没有 URL，将开发人员留在"联系您的 IT 管理员"消息处。两个密钥都属于您推送到机器的文件中，而不是网关的 `managed.policies[].cli` 块中，该块仅到达已连接的客户端。

<h3 id="ci-pipelines-and-remote-machines">
  CI 管道和远程机器
</h3>

没有用于无人值守管道的服务令牌流。网关登录始终运行浏览器设备流，因此没有开发人员批准登录的 CI 作业无法进行身份验证；针对您的提供商直接配置这些。开发人员登录后，该机器上的每个 Claude Code 调用都使用网关会话，包括非交互式 `claude -p` 运行和由 Agent SDK 启动的会话，[网关策略适用于所有这些](/docs/zh-CN/claude-apps-gateway-config#managed)。

设备流将轮询 CLI 与批准浏览器分开，因此没有显示的远程开发框仍然有效：开发人员通过 SSH 在远程机器上运行 `/login`，并在笔记本电脑上的浏览器中打开验证链接。

<h3 id="what’s-enforced-on-developers">
  对开发人员强制执行的内容
</h3>

这些保证适用于每个已登录的网关会话。

* **模型访问**：对策略未授予的模型的请求返回 400，`/model` 选择器被过滤到策略的 `availableModels` 允许列表。在策略中设置 [`enforceAvailableModels: true`](/docs/zh-CN/model-config#default-model-behavior)，以便 Default 选项解析为 `availableModels` 内的模型，而不是 Claude Code 的内置默认值；没有它，Default 保持可选，如果该模型未被授予，则在请求时被拒绝。
* **遥测目标**：当[遥测转发](/docs/zh-CN/claude-apps-gateway-config#telemetry)配置时，OTLP 导出端点被固定到网关，网关推送的配置覆盖本地设置的 `OTEL_*` 变量。
* **凭证**：网关令牌是会话的唯一凭证。`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`apiKeyHelper` 和任何早期的 claude.ai 登录在登录时被忽略，因此开发人员不需要首先从 claude.ai 注销。
* **托管设置**：锁定的密钥无法在本地覆盖。CLI 在启动时和每个小时轮询时应用策略。
* **启动**：当网关无法访问时，已登录的会话在启动时约 10 秒后以错误退出，而不是在没有其设置的情况下启动。
* **取消配置**：用户在 IdP 中被禁用的会话在下一次刷新失败时在 `ttl_hours` 内过期。

<h3 id="what-the-organization-can-see">
  组织可以看到什么
</h3>

使用情况遥测携带开发人员的身份、令牌计数、模型和延迟到组织的收集器。网关不记录或存储提示或完成内容。是否收集更丰富的遥测（如日志和跟踪），可能包括命令和文件路径，是组织的[按目标选择](/docs/zh-CN/claude-apps-gateway-config#telemetry)。

<h2 id="availability-and-limitations">
  可用性和限制
</h2>

该表涵盖当开发人员通过网关连接时哪些 Claude Code 功能有效，以及网关服务器本身支持什么。如果不支持某些内容，Notes 列给出替代方案。

网关交付 CLI 发送给每个上游的 [`anthropic-beta`](https://platform.claude.com/docs/en/api/beta-headers) 值，因此操作员不维护 beta 允许列表。对于忽略标头的 Amazon Bedrock，网关将值移到请求正文的 `anthropic_beta` 字段中；其他上游按发送的方式接收标头。CLI 的网关会话 beta 集省略仅第一方 beta 和扩展缓存 TTL beta，这就是为什么下面这些行显示为不可用。

| 功能                                                                                                     | 状态  | 注释                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 推理转发 (Amazon Bedrock、Claude Platform on AWS、Google Cloud 的 Agent Platform、Microsoft Foundry、Anthropic) | 可用  | 具有按上游模型转换和故障转移。Amazon Bedrock 上游使用 `bedrock-runtime` 端点和 AWS 默认凭证链；Amazon Bedrock [Mantle 端点](/docs/zh-CN/amazon-bedrock#use-the-mantle-endpoint)不是支持的上游。[Claude Platform on AWS 上游](/docs/zh-CN/claude-apps-gateway-config#claude-platform-on-aws)需要网关服务器上的 Claude Code v2.1.198 或更高版本。 |
| 按 IdP 组的模型访问和托管设置                                                                                      | 可用  | 模型访问在服务器端强制执行；托管设置按 IdP 组交付，由 CLI 在[托管设置层](/docs/zh-CN/settings#settings-precedence)应用                                                                                                                                                                                              |
| 遥测扇出 (OTLP/HTTP)                                                                                       | 可用  | 按导出标识戳；protobuf 和 JSON 编码                                                                                                                                                                                                                                                      |
| OIDC 身份提供商                                                                                             | 可用  | 任何符合 OIDC 的 IdP；网关运行标准 OIDC 发现和授权代码流。请参阅[身份提供商设置](/docs/zh-CN/claude-apps-gateway-deploy#identity-provider-setup)了解每个 IdP 的配置                                                                                                                                                       |
| 按用户和按组支出限制                                                                                             | 可用  | 请参阅[支出限制](/docs/zh-CN/claude-apps-gateway-spend-limits)                                                                                                                                                                                                                             |
| 服务器端网络搜索                                                                                               | 不可用 | CLI 无法看到网关路由到哪个上游提供商，因此无法验证网络搜索支持并在网关会话上禁用 WebSearch                                                                                                                                                                                                                           |
| 标准提示缓存                                                                                                 | 可用  | `cache_control` 断点被转发到每个上游                                                                                                                                                                                                                                                     |
| 1 小时缓存 TTL                                                                                             | 不可用 | CLI 在网关会话上省略扩展缓存 TTL beta，因为并非网关可以路由到的每个上游都支持 1 小时 TTL，因此通过网关的提示缓存使用 5 分钟 TTL；请参阅上面的 beta 标头注释                                                                                                                                                                                 |
| Auto 模式                                                                                                | 可用  | 遵循[第三方提供商规则](/docs/zh-CN/permission-modes#enable-auto-mode-on-bedrock-agent-platform-or-foundry)：仅第三方提供商上符合条件的模型可以使用它。在 v2.1.207 之前，网关会话上的 auto 模式需要设置 `CLAUDE_CODE_ENABLE_AUTO_MODE=1`，可通过托管策略 `env` 块交付                                                                           |
| 仅第一方优化，如全局缓存范围和令牌高效工具                                                                                  | 不可用 | CLI 在网关会话上不启用它们；请参阅上面的 beta 标头注释                                                                                                                                                                                                                                               |
| OTLP/gRPC                                                                                              | 不支持 | 仅 OTLP over HTTP                                                                                                                                                                                                                                                               |
| SAML、LDAP 和其他非 OIDC 身份验证                                                                               | 不支持 | 仅 OIDC。如果需要，使用 OIDC 桥前置                                                                                                                                                                                                                                                        |
| 多租户（多个 OIDC 发行者）                                                                                       | 不支持 | 每个网关一个发行者。运行单独的实例                                                                                                                                                                                                                                                              |
| Windows 服务器                                                                                            | 不支持 | 在 Linux 上部署。仅本地开发的 macOS                                                                                                                                                                                                                                                       |
| Helm 图表                                                                                                | 不可用 | 网关作为标准无状态 Deployment 运行；请参阅[部署指南](/docs/zh-CN/claude-apps-gateway-deploy#kubernetes)                                                                                                                                                                                                |
| 管理员 UI                                                                                                 | 不可用 | 配置是 YAML 文件；重新部署以更改它                                                                                                                                                                                                                                                           |

<h2 id="next-steps">
  后续步骤
</h2>

快速入门让您在 Docker Compose 下运行最小配置。要进一步进行：

* 扩展 `gateway.yaml` 超越最小配置，例如添加按组 RBAC、多上游故障转移或遥测目标。[配置参考](/docs/zh-CN/claude-apps-gateway-config)涵盖每个选项。
* 从 Compose 迁移到 Kubernetes 或 Cloud Run 上的生产部署，正确设置您的 IdP，并审查安全模型。[部署和操作指南](/docs/zh-CN/claude-apps-gateway-deploy)涵盖每个 IdP 的设置、容器镜像要求、健康探针和故障排除。
* 对个别开发人员或组设置支出上限，以便失控的工作负载无法消耗您的整个承诺。[支出限制](/docs/zh-CN/claude-apps-gateway-spend-limits)涵盖管理 API 以及强制执行如何工作。
* 有关 Google Cloud 的完整工作示例，包括 Cloud Run、Cloud SQL 和 Secret Manager，请参阅[在 Google Cloud 上部署](/docs/zh-CN/claude-apps-gateway-on-gcp)。
