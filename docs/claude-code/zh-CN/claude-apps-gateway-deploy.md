> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Claude 应用网关部署和运维

> 向身份提供商注册网关，构建容器，在 Kubernetes 或 Cloud Run 上部署，并运维它：健康检查、密钥轮换、升级和安全。

本页面涵盖运行 [Claude 应用网关](/docs/zh-CN/claude-apps-gateway) 的运维方面：在身份提供商 (IdP) 中注册 OAuth 客户端、将网关部署为容器，以及日常运行。关于网关在启动时读取的 `gateway.yaml` 文件中的每个选项，请参阅 [配置参考](/docs/zh-CN/claude-apps-gateway-config)。

生产部署按顺序遵循四个步骤，下面的部分与之相对应。前两个是您做出选择的地方；后两个是在运行后参考的材料。

1. [设置身份提供商](#identity-provider-setup)：注册 OAuth 客户端并查看 Okta、Entra 和 Google 的特定 IdP 说明
2. [部署网关](#deployment)：构建固定版本的容器镜像并在 Kubernetes、Cloud Run 或您自己的平台上运行它。本部分还涵盖成本、绕过、多网关和无服务器决策
3. [设置运维](#operations)：日志、健康探针、中断行为、密钥轮换和升级。当您连接监控和运行手册时参考的材料
4. [审查安全态势](#security)：数据流向何处、威胁模型和合规性答案。用于安全审查的参考

如果在此过程中登录或启动失败，请直接转到 [故障排除](#troubleshooting)，该部分按您看到的错误进行索引。

<Note>
  **在您的私有网络上部署。** Claude Code 仅连接到地址为私有的网关。这是一个安全防护，因为受信任的网关可以推送在开发者机器上运行命令的设置。将网关放在内部负载均衡器或 VPN 后面，并为其分配一个仅解析为私有 IP 的主机名。

  Anthropic 运营的公共网关端点是例外：`/login` 通过 `https://` 接受它们。这是一小组固定的由 Anthropic 本身运营的网关；它们不是您可以选择或配置的部署选项。该列表被编译到 Claude Code 中，因此没有配置可以向其添加主机名，您托管的任何网关都不符合豁免条件。在 v2.1.206 之前，`/login` 像拒绝任何其他公共地址一样拒绝这些端点。
</Note>

<h2 id="identity-provider-setup">
  身份提供商设置
</h2>

向身份提供商注册一个机密 OAuth/OpenID Connect (OIDC) Web 应用程序，使用单个重定向 URI `https://<gateway>/oauth/callback`，并将其分配给应该有网关访问权限的用户或组。

任何符合 OIDC 的 IdP 都可以工作：Okta、Microsoft Entra ID、Google Workspace、Keycloak、Dex、PingFederate 等。IdP 必须满足三个要求：

* 在生产环境中通过 HTTPS 提供 `/.well-known/openid-configuration`；网关接受 [`http://` 发行者](/docs/zh-CN/claude-apps-gateway-config#oidc)，本地环回发行者另外需要 `CLAUDE_GATEWAY_ALLOW_LOOPBACK=1`
* 支持授权代码流。PKCE（代码交换证明密钥）默认启用；对于不支持它的 IdP，使用 `oidc.use_pkce: false` 禁用它
* 在 id\_token 中返回 `email` 和可选的 `groups`，或使用 `oidc.userinfo_fallback: true` 从 userinfo 端点提供它们

对于私有 PKI，设置 `oidc.ca_cert_pem`。

一些提供商处理电子邮件和组声明的方式不同：

* **Okta**：位于 `https://example.okta.com` 的组织授权服务器返回一个省略 `email` 和 `groups` 的简化 id\_token，因此当您将其用作 `issuer` 时设置 `oidc.userinfo_fallback: true`。包含 id\_token 中 `email` 和可选 `groups` 的自定义授权服务器（如 `https://example.okta.com/oauth2/default`）直接发出它们，不需要回退。Okta 仅在 `oidc.scopes` 中请求 `groups` 作用域且应用的组声明过滤器允许时才发出 `groups`；`userinfo_fallback` 无法填充 IdP 未被要求的声明。
* **Microsoft Entra ID**：`issuer` = `https://login.microsoftonline.com/<tenant-id>/v2.0`。Entra 发出组对象 ID 而不是名称，因此在 `managed.policies.match.groups` 中使用 GUID，或使用应用角色获得人类可读的名称。如果您的租户在 `roles` 而不是 `groups` 下发出角色，设置 `oidc.groups_claim: roles`。
* **Google Workspace**：`issuer` = `https://accounts.google.com`。Google 的 id\_token 不包含组。要在 Google 作为 IdP 时使用基于组的 `allowed_groups` 或 `managed.policies`，配置 [`oidc.google_groups`](/docs/zh-CN/claude-apps-gateway-config#oidc)，它使用具有域范围委派的服务账户通过 Admin SDK Directory API 查找每个用户的组。没有它，使用 `oidc.allowed_email_domains` 进行成员资格门控，使用 `managed.policies.match.email_domain` 进行策略分配。Google 也忽略标准 `offline_access` 作用域。对于刷新令牌，设置 `oidc.scopes: [openid, profile, email]` 和 `oidc.extra_auth_params: { access_type: offline, prompt: consent }`。

有关不在上述范围内的身份提供商的支持，请参阅[故障排除](#troubleshooting)。

<Warning>
  刷新令牌让网关可以在不将开发者发送回浏览器的情况下无声地续订开发者的会话。它们也驱动取消配置，因为当 IdP 禁用用户时，下一次刷新失败，会话在 `ttl_hours` 内结束。网关默认请求 `offline_access` 以获取刷新令牌。如果您的 IdP 需要明确同意离线访问，配置 OAuth 客户端以允许它。

  如果您的 IdP 根本无法发出刷新令牌，网关仍然可以工作，但没有无声续订，因此开发者在会话过期时重新运行浏览器登录。为了防止每小时都发生这种情况，将 [`session.ttl_hours`](/docs/zh-CN/claude-apps-gateway-config#session) 提高到 `8` 或 `12`。权衡是取消配置延迟，因为没有刷新令牌，禁用的用户在更长的 TTL 过期之前保持访问权限。
</Warning>

<h2 id="deployment">
  部署
</h2>

网关是一个单一的 Linux 二进制文件。它水平扩展，因为副本是无状态的，Postgres 是共享协调层。按照您在环境中运行无状态服务的方式运行它。本部分的其余部分说明镜像需要什么，并为 Kubernetes 和 Cloud Run 提供简短说明。

网关设计为在您的网络内运行，因为它持有您的上游凭证并充当推理的单一出口点。它可以在您的开发者和您的 IdP 可以通过 HTTPS 到达的任何地方运行；将其视为任何其他持有生产凭证的服务。

除了运行位置外，还有一些决策塑造部署：

* **成本**：网关没有单独的许可证或按座位费用；它是 `claude` 二进制文件的一部分。您通过现有的云或 Anthropic 承诺为推理付费，加上容器的计算和您的遥测收集器。
* **绕过**：网关不强制执行通过它的唯一模型路由。具有自己凭证的开发者仍然可以直接调用提供商，因此关闭该路径是网络策略决策，例如阻止到 `api.anthropic.com` 的出口，除了来自网关的。阻止该出口也会破坏 [WebFetch 域安全检查](/docs/zh-CN/data-usage#webfetch-domain-safety-check)，它从每个开发者的机器调用 `api.anthropic.com`；在托管策略中设置 `skipWebFetchPreflight: true` 以禁用它。
* **多个网关**：每个网关是一个单独的部署，有自己的配置。CLI 按网关主机名存储其信任指纹和凭证，因此不同的团队可以连接到不同的网关而不会冲突。要提供多个 OIDC 发行者，运行单独的实例。
* **无服务器**：Cloud Run 可以工作；设置 `min-instances: 1` 以避免冷 OIDC 发现。Lambda 和 Cloud Functions 不行，因为网关是一个长时间运行的 HTTP 服务器。

这里的每个生产拓扑都在普通 HTTP 副本前面放置一个 L7 代理，如 Ingress、Cloud Run 的前端或 ALB。设置 [`listen.trusted_proxies`](/docs/zh-CN/claude-apps-gateway-config#listen) 为代理的源范围，以便网关从 `X-Forwarded-For` 读取客户端 IP。网关仅在 TCP 对等体受信任时才遵守该标头；[Google Cloud 工作示例](/docs/zh-CN/claude-apps-gateway-on-gcp) 为每个拓扑提供具体值。没有受信任的代理，每个请求似乎都来自代理的 IP，这会将按 IP 速率限制折叠为一个共享桶，并在审计事件中记录代理的 IP。

<h3 id="container-image">
  容器镜像
</h3>

围绕标准 Claude Code 版本中的本机 `claude` 二进制文件构建您自己的镜像：

1. 从固定版本下载您的镜像架构的 Linux 构建；请参阅 [安装特定版本](/docs/zh-CN/setup#install-a-specific-version) 了解下载 URL。
2. 根据版本的 GPG 签名 `manifest.json` 验证它，如 [二进制完整性和代码签名](/docs/zh-CN/setup#binary-integrity-and-code-signing) 中所述。
3. 将其复制到构建上下文中。

如果您的构建无法到达版本主机，请将版本镜像到您的内部注册表中，并固定您的舰队运行的版本。

除了二进制文件外，镜像还需要：

* **基于 glibc 的镜像**：glibc 构建的唯一动态依赖项是 glibc 库。基于 Musl 的镜像需要 `linux-x64-musl` 或 `linux-arm64-musl` 构建加上额外的包；请参阅 [Alpine Linux 设置](/docs/zh-CN/setup#alpine-linux-and-musl-based-distributions)。
* **可写状态目录**：网关以任何用户身份运行，但最小镜像没有可写的主目录。将 `CLAUDE_CONFIG_DIR` 设置为可写路径，如 `/tmp/.claude`。
* **容器命令**：`claude gateway --config /etc/claude/gateway.yaml`，配置文件以只读方式挂载，密钥作为环境变量提供；网关在 `listen.port` 上监听，默认为 `8080`。

<h3 id="kubernetes">
  Kubernetes
</h3>

将网关作为 Deployment 运行，就像任何无状态服务一样：

* 从 ConfigMap 挂载配置，从 Secret 挂载密钥；通过 `${file:/path/to/secret}` 或作为环境变量在 YAML 中引用密钥
* 在 Ingress 处终止 TLS 并将 `listen.public_url` 设置为 Ingress 主机名
* 将就绪探针指向 `GET /readyz`，将活跃探针指向 `GET /healthz`

<Note>
  **工作负载身份**

  优先使用平台的工作负载身份而不是静态密钥：EKS 上的 IRSA 用于 Bedrock 和 AWS 上的 Claude Platform，GKE 上的工作负载身份用于 Agent Platform，AKS 上的工作负载身份用于 Foundry。在上游块中设置 `auth: {}`，或对 Foundry 设置 `use_azure_ad: true`，网关通过该提供商的默认凭证链获取 pod 的身份。对于跨云配对，如 GKE 上的 Bedrock 上游，在上游的 `auth` 块中设置显式凭证。[`upstreams` 参考](/docs/zh-CN/claude-apps-gateway-config#upstreams) 有每个平台的设置详情。
</Note>

<h3 id="cloud-run">
  Cloud Run
</h3>

按如下方式配置服务：

* 将 `listen.port` 保留在其默认值 `8080`，这与 Cloud Run 的默认 `PORT` 匹配，或设置 `port: ${PORT}`
* 将 `public_url` 设置为外部可达的源。对于生产，这通常是内部负载均衡器的主机名，因为 `/login` [拒绝公共地址](/docs/zh-CN/claude-apps-gateway#prerequisites)，而 `*.run.app` URL 解析为一个，所以单独的 Cloud Run URL 仅适用于 `curl` 或浏览器烟雾测试。例外是一个网络，其中 `*.run.app` 通过 Private Service Connect 和 Cloud DNS 私有区域私下解析；在该拓扑中，Cloud Run URL 是有效的 `public_url`。[Google Cloud 工作示例](/docs/zh-CN/claude-apps-gateway-on-gcp#deploy-the-gateway) 涵盖两者。
* 将配置作为密钥卷挂载
* 设置 `min-instances: 1` 以避免首次请求时的冷 OIDC 发现

<Note>
  有关 Google Cloud 上的完整工作示例，涵盖 Cloud Run 或 GKE、Cloud SQL 和 Secret Manager，请参阅 [在 Google Cloud 上部署](/docs/zh-CN/claude-apps-gateway-on-gcp)。
</Note>

<h3 id="push-the-gateway-url-to-developer-machines">
  将网关 URL 推送到开发者机器
</h3>

一旦网关开始提供服务，通过托管设置、MDM 或直接写入每个操作系统的 `managed-settings.json` 将 `forceLoginMethod` 和 `forceLoginGatewayUrl` 推送到每个开发者的机器。没有这个，`/login` 显示标准账户选择器，没有网关选项。请参阅 [客户端托管设置](/docs/zh-CN/claude-apps-gateway-config#client-side-managed-settings) 了解文件路径。

<h2 id="operations">
  运维
</h2>

一旦网关开始提供流量，日常运维就是读取其日志、探测其健康状况，以及按您的计划轮换其密钥。下面的小节涵盖每一个，加上 Postgres 持有的内容以及升级和回滚的行为。

<h3 id="logs">
  日志
</h3>

网关向 stderr 写入两个流，都是 JSON 友好的：

* **审计事件**：每个安全相关事件一行 JSON。将 stderr 管道传输到您的日志聚合器。发出的事件包括 `config.load`、`session.mint`、`session.refresh`、`device.authorize`、`device.verify`、`auth.denied`、`access.denied`、`inference`、`managed.serve`、`spend.blocked` 和 `admin.denied`。字段因事件而异：
  * 成功的 mint 和 refresh 事件携带 `sub`、`email`、`client_ip` 和结果
  * 拒绝事件携带原因、路径和客户端 IP，因为拒绝时不存在身份
  * `inference` 记录哪个上游提供了请求以及响应状态
  * `admin.denied` 记录被拒绝的管理员 API 身份验证尝试，包括原因（`invalid_key` 或 `no_credentials`）、客户端 IP、方法和路径，不包括呈现的密钥材料
* **运维日志**：人类可读的 `[gateway]` 前缀行，用于启动、警告和上游错误。`CLAUDE_GATEWAY_LOG_LEVEL` 环境变量控制详细程度，接受 `info`、`warn` 或 `error`，默认为 `info`。它不影响审计事件，这些事件总是被发出。

<h3 id="health">
  健康
</h3>

网关提供 `GET /healthz` 作为活跃探针，`GET /readyz` 作为就绪探针；`/readyz` 验证存储是否可达。两者都免除 `access_control.allow_cidrs`，因此探针在锁定的监听器上继续工作。

`/.well-known/oauth-authorization-server` 处的 OAuth 发现文档也仅在配置加载、OIDC 发现、上游客户端构造和 Postgres 迁移全部成功后才返回 `200`，因此它也充当端到端启动检查。

运行中的网关还在 `<public_url>/protocol` 提供它接受的路径和请求形状的描述，与您运行的版本相匹配。内容在版本之间不稳定。

<h3 id="outage-behavior">
  中断行为
</h3>

如果 Postgres 宕机，网关本身继续为已登录的开发者提供服务，新登录失败。开发者是否真的继续工作取决于您的编排器如何处理就绪：

* **现有会话**：持有者令牌使用 JWT 密钥在本地验证，会话刷新不接触存储，网关进程仍然可以提供推理
* **新登录**：失败直到 Postgres 恢复，因为设备流及其速率限制计数器存在于 Postgres 中
* **[支出限制执行](/docs/zh-CN/claude-apps-gateway-spend-limits#postgres-availability)**：在中断期间默认失败开放，因此推理仍然流动；如果您宁愿阻止而不是无计量运行，将其翻转为失败关闭
* **就绪**：`/readyz` 在中断期间报告未就绪，因此在就绪上门控流量的编排器一次从轮换中移除每个副本。在该拓扑中，所有流量，包括网关仍然可以提供的推理，在负载均衡器处失败，直到 Postgres 恢复。`/healthz` 上的活跃探针继续通过，因此副本不会重新启动。如果您宁愿已登录的开发者在存储中断期间继续工作，将就绪探针指向 `/healthz`；成本是新登录失败，反对仍然报告就绪的副本。

如果您的 IdP 宕机，现有会话工作直到 `ttl_hours`，新登录和刷新失败。如果您的 IdP 有频繁的维护窗口，设置更长的 `ttl_hours`。

<h3 id="jwt-secret-rotation">
  JWT 密钥轮换
</h3>

通过三个步骤轮换签名密钥，以便现有会话保持有效：

1. 生成一个新密钥。将其前置到 `session.jwt_secret` 数组。
2. 滚动部署。新令牌使用新密钥签名；旧令牌仍然验证。
3. 在 `ttl_hours` 加上一个边距之后，移除旧密钥并再次滚动。

轮换也是在过期前强制会话退出的唯一方式：持有者令牌针对 JWT 密钥在本地验证，因此没有按会话撤销。直接替换密钥，不在数组中保留旧密钥，一次使每个未完成的会话失效。对于个人离职，在您的 IdP 中取消配置用户；他们的会话在 `ttl_hours` 内结束。

<h3 id="postgres">
  Postgres
</h3>

网关持有五个表，全部由其启动时迁移创建：

| 表                  | 内容                                 | 保留                                            |
| ------------------ | ---------------------------------- | --------------------------------------------- |
| `kv`               | 设备授权（10 分钟 TTL）和速率限制计数器            | 每行 TTL                                        |
| `spend`            | 每个主体期间至今支出计数器，以美分计                 | `admin.spend_retention_months`，默认 13          |
| `spend_limits`     | 配置的支出上限                            | 直到通过 API 删除                                   |
| `admin_audit`      | 管理员 API 变更跟踪                       | `admin.audit_retention_days`，默认 365           |
| `principal_emails` | 每个主体的最后看到的电子邮件、显示名称和 IdP 组。包含 PII。 | `admin.identity_retention_days` 自上次活动以来，默认 90 |

一个 30 秒的循环过期 `kv` 行超过其 TTL，一个每小时的扫描在支出表上强制保留窗口，因此没有什么无限增长。没有 [支出限制](/docs/zh-CN/claude-apps-gateway-spend-limits) 配置，只有 `kv` 被写入。如果您的安全策略禁止应用角色的 DDL，预先创建这些表和 `_migrations`，使用管理员角色，并授予应用角色 `SELECT, INSERT, UPDATE, DELETE` 在每个上。

使用支出限制，丢失的数据库意味着丢失支出跟踪和上限，不仅仅是开发者重新登录，因此运行定期备份。要立即删除一个离职的开发者而不是等待保留，直接运行 `DELETE FROM principal_emails WHERE principal = '<sub>'`；这移除了唯一持有其电子邮件、名称和组的表。`spend` 和 `admin_audit` 行仅引用伪匿名 OIDC `sub`。

<h3 id="upgrades">
  升级
</h3>

副本是无状态的，因此滚动重启在任何时间都是安全的。网关在启动时运行架构迁移，这意味着部署新二进制文件会自动迁移数据库。如果数据库角色无法运行 DDL，预先创建架构，包括 `_migrations` 表，种子为当前版本；否则启动失败，尝试 `CREATE TABLE`。

迁移是仅追加的，因此回滚到知道较少迁移的先前二进制文件是安全的；它忽略额外的行。回滚也重新验证 YAML 针对较旧二进制文件的架构，因此采用由较新版本引入的密钥的配置在较旧版本上启动失败。在回滚前移除新密钥。

因为您在自己的镜像中固定网关的版本，新 Claude Code 版本中的修复，包括安全修复，仅在您更新固定并重新部署时才到达您的部署。在您用于持有生产凭证的其他服务的相同修补周期中包括网关。

<h2 id="security">
  安全
</h2>

本部分回答安全审查提出的问题：什么数据流经网关以及它去哪里，设计防御哪些攻击，以及哪些答案属于合规性问卷。

<h3 id="data-flow">
  数据流
</h3>

| 数据                                                                      | 路径                                     | 由网关发送给 Anthropic         |
| ----------------------------------------------------------------------- | -------------------------------------- | ------------------------ |
| 推理（提示、完成）                                                               | CLI → 网关 → 您的上游                        | 仅当 Anthropic API 是配置的上游时 |
| 遥测（OTLP 指标，加上 [选择加入日志和跟踪](/docs/zh-CN/claude-apps-gateway-config#telemetry)） | CLI → 网关 → 您的收集器                       | 从不                       |
| 身份（电子邮件、组、sub）                                                          | IdP → 网关 → JWT → CLI；CLI 在 OTLP 导出上标记它 | 从不                       |
| 托管设置                                                                    | 您的网关 YAML → CLI                        | 从不                       |
| 审计日志                                                                    | 网关 stderr → 您的聚合器                      | 从不                       |

<h3 id="threat-model-summary">
  威胁模型摘要
</h3>

网关位于您的网络周边内，但个别开发者笔记本电脑不被视为受信任。设计通过三种方式考虑这一点：

* 开发者持有短期 JWT 而不是原始上游密钥。CLI 到网关的腿使用 RFC 8628 设备授权，网关与 IdP 的授权代码交换在默认配置中运行 PKCE，因此拦截的 IdP 授权代码是无用的。
* 设备验证页面强制执行同源 POST 和每个 RFC 8628 §5.1 的每 IP 速率限制。请参阅 [用户代码暴力破解抵抗](#user-code-brute-force-resistance)。
* 出站请求通过服务器端请求伪造 (SSRF) 防护，解析 DNS，阻止链接本地和云元数据地址加上默认的本地环回，并将连接固定到解析的 IP，因此操作员影响的 URL（如 IdP 和 OTLP 目的地）无法重定向到云元数据端点。RFC 1918 私有范围被故意允许，因为 IdP 和 OTLP 收集器通常存在于私有 IP 上。对于针对本地环回 IdP 或收集器的本地开发，在网关的环境中设置 `CLAUDE_GATEWAY_ALLOW_LOOPBACK=1`；在生产中保持未设置。

如果您添加自己的出口控制，网关必须在使用实例元数据凭证（如工作负载身份）时到达元数据服务器。

两个威胁超出范围，因为它们是您的基础设施来保护：

* **受损的网关主机**：主机既持有上游凭证，又向每个连接的开发者分发 [托管设置](/docs/zh-CN/claude-apps-gateway-config#managed)，因此对网关配置的控制与对您的 MDM 的控制相当。CLI 的一次性批准对话框用于 shell 能力设置限制无声更改，但不替代主机安全。
* **恶意 OIDC 提供商**：提供商签署网关信任的 id\_tokens，因此它可以声称任何身份。审查和保护您的 IdP 是您的责任。

<h3 id="user-code-brute-force-resistance">
  用户代码暴力破解抵抗
</h3>

开发者在 `/device` 验证页面中输入的 `user_code` 是从 20 字符字母表中抽取的 8 个字符，产生 20⁸ 或约 2.56×10¹⁰ 个组合，在 10 分钟后过期。

网关在设备授权端点上应用按 IP 速率限制，可通过 [`rate_limits`](/docs/zh-CN/claude-apps-gateway-config#http-tuning) 配置。如果许多开发者从单个共享公司 NAT 地址登录，提高限制。限制仅适用于登录流，不适用于推理。

<h3 id="compliance-posture">
  合规性态势
</h3>

* **数据驻留**：网关自己的数据平面除非 Anthropic API 是配置的上游，否则不向 Anthropic 发送任何内容；当它是时，您现有的数据处理协议适用于推理路径。遥测、审计、身份和设置仅去往您配置的目的地。
* **主机进程流量**：主机进程是 Claude Code CLI，它可以向 Anthropic 发送启动分析和更新检查。对于严格出口部署，在网关的容器环境中设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`。
* **客户端分析**：CLI 在登录到网关时禁用自己的使用分析，错误报告在第三方 API 表面上默认关闭。
* **客户端机器**：开发者的 CLI 仍然向 Anthropic 发送 WebFetch 主机名检查和版本检查，除非设置了 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 和 `skipWebFetchPreflight: true`。请参阅 [数据使用](/docs/zh-CN/data-usage)。
* **调查评分**：网关凭证禁用 Anthropic 绑定的评分接收器，因此评分不发送给 Anthropic。
* **成绩单共享**：在调查的成绩单共享提示上选择"是"会在 `~/.claude/feedback-bundles/` 下写入本地文件，而不是上传到 Anthropic。
* **客户端更新**：更新检查与网关流量分开。通过您自己的分发固定版本，如果笔记本电脑不得获取版本，设置 `DISABLE_UPDATES`。`DISABLE_AUTOUPDATER` 仅停止后台更新，而 `claude update` 仍然有效。
* **TLS**：在生产中通过 HTTPS 提供 `public_url`，要么从网关自己的监听器通过 `listen.tls`，要么从 TLS 终止入口在普通 HTTP 副本前面，设置 `listen.public_url`。网关不拒绝普通 HTTP。IdP 必须在生产中提供 HTTPS，Postgres 支持 `?sslmode=require`。在您的入口处设置 `Strict-Transport-Security`。
* **漏洞披露**：遵循 [报告安全问题](/docs/zh-CN/security#reporting-security-issues)

<h2 id="troubleshooting">
  故障排除
</h2>

有关问题和反馈，使用 [Claude Code 支持](https://support.claude.com/en/collections/14445694-claude-code)，或在 [Claude Code GitHub 存储库](https://github.com/anthropics/claude-code/issues) 上打开问题。报告问题时，包括：

* **网关问题**：相关窗口的网关 stderr、您的 `gateway.yaml`（密钥已编辑），网关版本，显示在 `/` 处的登陆页面和 `/managed/settings` 上的 `x-cc-gateway-version` 响应标头中，以及最近更改的内容
* **登录问题**：开发者运行 `claude --debug-file ./claude-debug.txt`，重现，并发送该文件加上相同窗口的网关审计日志
* **推理问题**：请求的模型、配置的上游和请求的网关审计日志，记录哪个上游提供了它和响应状态

网关的 stderr 包含审计事件流，审计日志记录开发者身份，调试文件记录来自开发者机器的 hook 和 MCP 服务器输出。在发布到公开问题前，请审查并隐去这些信息。

| 症状                                                                                                                                        | 原因                                                                                                                                                                                                            | 修复                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开发者的 `/login` 显示标准账户选择器而不是 **Cloud gateway** 屏幕                                                                                           | `forceLoginMethod` 或 `forceLoginGatewayUrl` 未在该机器的托管设置中设置                                                                                                                                                     | 将 [托管设置文件](/docs/zh-CN/claude-apps-gateway#set-the-gateway-url) 部署到设备；`/login` 从那里读取网关 URL                                                                                                                                                               |
| 启动显示 `Gateway login is configured in managed settings, but this Claude Code build does not include Cloud gateway support.`                | 安装的 Claude Code 构建早于网关支持                                                                                                                                                                                      | 让开发者更新 Claude Code 到包括 Cloud gateway 支持的版本                                                                                                                                                                                                          |
| CLI `/login`：`Gateway hosts must be on your organization's private network; <host> resolves to the public (or unrecognized) address <ip>` | 网关主机名解析为至少一个公共 IP 地址。Claude Code 检查每个解析的地址，需要每一个都是私有的。常见原因是一个双栈名称，其中一个族解析为公共地址，包括 AWS 内部双栈负载均衡器，它们返回公共范围 AAAA 地址。Anthropic 运营的公共网关端点免于检查，`/login` 通过 `https://` 接受它们。在 v2.1.206 之前，`/login` 拒绝它们，就像任何其他公共地址一样 | 让网关名称在开发者机器上仅解析为私有地址。对于双栈名称，删除公共范围记录或提供单独的仅内部 DNS 名称。请参阅 [私有网络先决条件](/docs/zh-CN/claude-apps-gateway#prerequisites)。                                                                                                                                      |
| CLI `/login`：`Gateway login requires a direct connection and does not support connecting through an HTTP proxy`                           | `HTTPS_PROXY` 或 `HTTP_PROXY` 适用于网关主机，代理的主机名解析为公共地址。代理的主机解析为仅私有地址是允许的，不会触发此错误                                                                                                                                  | 在开发者的机器上将网关主机添加到 `NO_PROXY`，以便连接是直接的，或使用主机名解析为私有地址的代理                                                                                                                                                                                               |
| CLI `/login`：`Could not resolve gateway host <host>`                                                                                      | 机器无法解析网关的内部 DNS 名称，通常是因为它不在公司网络上                                                                                                                                                                              | 让开发者连接到您的网络或 VPN，然后重试 `/login`                                                                                                                                                                                                                      |
| 启动退出，配置验证错误命名 `store.postgres_url`                                                                                                        | 未配置 Postgres；网关需要 Postgres                                                                                                                                                                                    | 设置 `store.postgres_url`。对于本地开发，使用一次性容器：`docker run --rm -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres`。                                                                                                                                  |
| 启动退出：`requires the native binary`                                                                                                         | 在 Node 下运行而不是本机二进制文件                                                                                                                                                                                          | 使用 [独立安装方法](/docs/zh-CN/setup) 之一安装 Claude Code                                                                                                                                                                                                          |
| 启动退出，OIDC 发现错误在 `config.load` 之后                                                                                                          | `oidc.issuer` 无法到达，或 TLS 链不受信任                                                                                                                                                                                | 检查发行者是否可从 pod 到达并提供 `/.well-known/openid-configuration`。为私有 PKI 设置 `ca_cert_pem`。                                                                                                                                                                   |
| 启动退出，Postgres 权限错误                                                                                                                        | 应用角色缺少 `CREATE TABLE`                                                                                                                                                                                         | 使用管理员角色预先创建架构，并授予应用角色 DML，或临时授予 DDL 用于应用新迁移的启动                                                                                                                                                                                                      |
| `/oauth/callback` 显示"Sign-in could not be completed"                                                                                      | 电子邮件域被拒绝，id\_token 验证失败，或 `email_verified` 明确为 `false`，网关总是拒绝，没有覆盖                                                                                                                                            | 检查 `allowed_email_domains` 和 IdP 返回验证的 `email` 声明。对于 `email_verified: false`，修复 IdP 端验证。如果您的 IdP 在不同的声明名称下发出电子邮件，设置 `oidc.email_claim`。                                                                                                             |
| 日志：`token exchange failed: id_token missing email claim`                                                                                  | IdP 默认不在 id\_token 中包含 `email`。此拒绝仅在设置 `allowed_email_domains` 时触发；没有它，缺失的电子邮件铸造没有电子邮件的会话                                                                                                                     | 配置 IdP 在 id\_token 中发出 `email`。Okta：将 `email` 添加到自定义授权服务器的 ID 令牌声明。Entra：在应用注册上将 `email` 添加为可选声明。PingFederate：启用发出 `email` 的 OpenID Connect 策略。如果 IdP 从 userinfo 端点提供 `email` 但不会在 id\_token 中包含它，如 Okta 组织授权服务器，设置 `oidc.userinfo_fallback: true`。 |
| 每个 Amazon Bedrock 请求返回 502；日志显示 `Could not load credentials from any providers`                                                           | 在 EC2 上，IMDSv2 的默认跳数限制为 1 阻止来自容器内的实例元数据请求。启动和 `/readyz` 通过，因为 AWS SDK 在第一个请求时解析实例凭证，而不是在客户端构造时                                                                                                                | 使用 `aws ec2 modify-instance-metadata-options --instance-id <id> --http-put-response-hop-limit 2` 提高跳数限制，或在启动模板中设置它。更改适用于实例上的每个容器。在可用的地方优先使用 ECS 任务角色，它从 ECS 容器凭证端点读取凭证，完全避免更改，或在专用网关实例上应用更改以限制暴露。                                                   |
| IdP 错误：unknown or unsupported scope                                                                                                       | IdP 拒绝它不识别的作用域                                                                                                                                                                                                | 将 `oidc.scopes` 设置为您的 IdP 接受的确切列表；它必须包括 `openid`。默认值为 `openid profile email offline_access`。                                                                                                                                                        |
| 设置 `oidc.scopes` 后会话不无声续订                                                                                                                 | `offline_access` 从覆盖中删除                                                                                                                                                                                       | 如果您的 IdP 支持，添加 `offline_access` 回来。没有刷新令牌，开发者每 `session.ttl_hours` 重新运行浏览器登录。                                                                                                                                                                       |
| 浏览器显示"This request came from another site and was blocked"                                                                                | 跨站点表单 POST，作为 CSRF 保护被阻止。对于嵌入或代理页面是预期的                                                                                                                                                                        | 直接打开验证链接                                                                                                                                                                                                                                            |
| Chrome 用"Refused to send form data … violates … Content Security Policy directive: form-action"阻止"批准"按钮，但相同页面在 Safari 或 Firefox 中工作       | Chrome 对整个重定向链强制执行 `form-action`。您的 IdP 重定向到第二个主机，该主机未被列入白名单。                                                                                                                                                 | 在 `oidc.form_action_origins` 中添加重定向链中的每个额外源。在"批准"页面上打开 Chrome DevTools → 控制台以查看哪个源被阻止。                                                                                                                                                              |
| 登录在 IdP 处完成，但回调失败，Chrome 中出现 CSP 错误或 Safari 中出现"this sign-in link has expired"                                                            | IdP 通过 `response_mode=form_post` 返回代码，它通过 POST 自动提交到 `/oauth/callback`。Chrome 在严格 CSP 下阻止它；Safari 允许提交，但回调仅读取查询字符串。                                                                                           | 确保您的 IdP 遵守 `response_mode=query`，网关明确请求它，以便回调是普通重定向                                                                                                                                                                                                |
| 登录在本地工作，但在 ALB 后面失败                                                                                                                       | `public_url` 未设置，因此 IdP 获取内部 `http://` 源作为 `redirect_uri`                                                                                                                                                     | 将 `listen.public_url` 设置为外部 `https://` 源                                                                                                                                                                                                            |
| 开发者重复看到信任提示                                                                                                                               | TLS 证书每个副本或每个请求轮换                                                                                                                                                                                             | 在入口处使用稳定的证书，或终止 TLS 一次并在内部通过普通 HTTP 运行副本                                                                                                                                                                                                            |
| CLI `/login`：`"Could not verify the gateway's TLS certificate"` 或 `SELF_SIGNED_CERT_IN_CHAIN`                                             | 网关的 TLS 链由 CLI 主机的信任存储中不存在的私有 CA 签署                                                                                                                                                                           | Claude Code 默认在本机二进制文件上读取 OS 信任存储，在 Node 22.15 或更高版本上；[`CLAUDE_CODE_CERT_STORE`](/docs/zh-CN/network-config#ca-certificate-store) 控制此行为。如果 CA 安装在 OS 信任存储中，确保开发者在当前运行时上。否则在启动前将 `NODE_EXTRA_CA_CERTS` 设置为 CA 证书 PEM。首次连接指纹提示仍然适用。                        |

<h2 id="related">
  相关
</h2>

* [Claude 应用网关概述](/docs/zh-CN/claude-apps-gateway)：快速入门和开发者连接
* [配置参考](/docs/zh-CN/claude-apps-gateway-config)：每个 `gateway.yaml` 选项
