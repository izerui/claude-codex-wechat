> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Claude 应用网关配置

> 每个 gateway.yaml 选项的参考：监听器和 TLS、OIDC、会话、Postgres 存储、Amazon Bedrock、Claude Platform on AWS、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上游、模型路由、托管策略和遥测。

Claude 应用网关部署由一个 YAML 文件配置，按惯例命名为 `gateway.yaml`。该文件定义网关所做的一切：它在哪里监听、开发者如何登录、推理去往何处，以及应用哪些策略和遥测。本页是该文件中每个选项的参考。

要编写你的第一个配置，请从[快速入门](/docs/zh-CN/claude-apps-gateway#quickstart)开始，它构建一个最小的工作配置并运行它。一旦你有了满意的配置，[部署指南](/docs/zh-CN/claude-apps-gateway-deploy)涵盖了在 Kubernetes、Cloud Run 或你自己的平台上容器化和托管它。

网关在启动时使用 `claude gateway --config /path/to/gateway.yaml` 读取该文件一次。每个选项都在启动时根据模式进行验证，因此格式错误的配置在启动时失败并显示字段级错误，而不是在首次使用时失败。

本页末尾的[完整示例](#complete-example)演示了每个部分。

<h2 id="file-structure">
  文件结构
</h2>

五个部分是[必需的](#required-sections)。所有其他部分都是[可选的](#optional-sections)，省略的部分采用其默认值。未知的键会导致启动失败，因此拼写错误会显示为命名错误，而不是被静默忽略的设置。

**必需部分：**

* [`listen`](#listen)：绑定地址、公共 URL、TLS 终止
* [`oidc`](#oidc)：你的身份提供者 (IdP)，包括发行者、客户端、声明映射和谁可以登录
* [`session`](#session)：网关铸造的持有者令牌，包括密钥和生命周期
* [`store`](#store)：PostgreSQL，用于设备授权和速率限制计数器
* [`upstreams`](#upstreams)：推理去往何处，无论是 Anthropic、Amazon Bedrock、Claude Platform on AWS、Google Cloud 的 Agent Platform 还是 Microsoft Foundry

**可选部分：**

* [`admin`](#admin)：Admin API 身份验证和支出限制的保留
* [`enforcement`](#enforcement)：支出限制故障开放或故障关闭行为
* [`models`](#models) 和 `auto_include_builtin_models`：管理员策划的模型列表和每个上游的 ID
* [`managed`](#managed)：按 IdP 组的托管设置策略
* [`telemetry`](#telemetry)：OTLP 转发到你的可观测性堆栈
* [`access_control`、`limits`、`timeouts`、`rate_limits`](#http-tuning)：IP 允许/拒绝、请求大小上限、上游首字节时间和每 IP 登录限制

<h2 id="secret-expansion">
  密钥扩展
</h2>

不要直接在 `gateway.yaml` 中写入密钥，如 `client_secret`、`jwt_secret` 或 `postgres_url`。使用下面的一种形式引用它们，网关在启动时从环境变量或文件解析该值：

| 形式              | 解析为                    | 用于                                     |
| --------------- | ---------------------- | -------------------------------------- |
| `${VAR}`        | 环境变量 `VAR`。如果未定义，启动失败。 | 容器环境变量、通过环境注入的 AWS Secrets Manager     |
| `${file:/path}` | 文件内容，已修剪               | Kubernetes Secret 卷挂载、Vault Agent、SOPS |

<h2 id="required-sections">
  必需部分
</h2>

<h3 id="listen">
  `listen`
</h3>

`listen` 块控制网关服务的位置：绑定地址和端口、外部可见的源和可选的 TLS 终止。

| 字段                     | 必需    | 描述                                                                                                                                                                                                                                     |
| ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`                 | 否     | 绑定地址。默认 `0.0.0.0`。                                                                                                                                                                                                                     |
| `port`                 | 否     | 绑定端口。默认 `8080`。                                                                                                                                                                                                                        |
| `public_url`           | 在代理后面 | 外部可见的 `https://` 源，用于构建 IdP `redirect_uri` 和发现元数据。在任何 TLS 终止代理（如 ALB、Ingress 或 Cloud Run）后面是必需的，因为网关在构建自己的源时不信任 `X-Forwarded-*` 头；它们是客户端可欺骗的。下面的 `trusted_proxies` 仅控制客户端 IP 解析。启用[遥测](#telemetry)也是必需的，因为网关从此 URL 构建它推送给客户端的 OTLP 端点。 |
| `tls.cert` / `tls.key` | 否     | 如果网关自己终止 TLS，则为 PEM 路径                                                                                                                                                                                                                 |
| `trusted_proxies`      | 否     | 网关前面的负载均衡器的 CIDR 或 IP。设置时，网关仅从这些对等体信任 `X-Forwarded-For`，并记录真实客户端 IP 用于每 IP 速率限制和审计。等同于 nginx `set_real_ip_from`。                                                                                                                       |

<h3 id="oidc">
  `oidc`
</h3>

`oidc` 块将网关连接到你的身份提供者，并决定谁可以登录。它命名发行者和 OAuth 客户端，映射携带电子邮件和组的声明，并按电子邮件域或组限制登录。

OpenID Connect (OIDC) 是网关与你的身份提供者一起使用的 SSO 协议；有关在 IdP 端注册的内容，请参阅[身份提供者设置](/docs/zh-CN/claude-apps-gateway-deploy#identity-provider-setup)。

| 字段                              | 必需 | 描述                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer`                        | 是  | OIDC 发现基础。必须在 `/.well-known/openid-configuration` 提供发现。在生产中使用 HTTPS；网关接受 `http://` 发行者。环回发行者（如 `http://localhost:8081`）被[SSRF 防护](/docs/zh-CN/claude-apps-gateway-deploy#threat-model-summary)拒绝，除非在网关的环境中设置了 `CLAUDE_GATEWAY_ALLOW_LOOPBACK=1`。                                                                                                                      |
| `client_id` / `client_secret`   | 是  | 来自你的 OAuth 客户端注册                                                                                                                                                                                                                                                                                                                                                 |
| `allowed_email_domains`         | 否  | 拒绝其 `email` 声明不在这些域之一中的 id\_token，不区分大小写。针对多租户 IdP 配置错误的纵深防御。独立于此设置，其 `email_verified` 声明明确为 `false` 的 id\_token 总是被拒绝。                                                                                                                                                                                                                                          |
| `allowed_groups`                | 否  | 限制登录到这些 IdP 组的成员，与 `groups_claim` 匹配。允许的电子邮件域中但不在这些组中的用户被拒绝。需要 IdP 发出组声明。                                                                                                                                                                                                                                                                                        |
| `groups_claim`                  | 否  | 哪个 id\_token 声明携带组成员身份。默认 `groups`。Microsoft Entra 在 `roles` 下发出应用角色。接受平面键或 RFC 6901 JSON 指针，如 `/resource_access/gateway/roles` 用于嵌套声明。                                                                                                                                                                                                                          |
| `google_groups`                 | 否  | 通过 Google Workspace Admin SDK Directory API 查找已登录用户的组，因为 Google 的 id\_token 不携带组声明。将 `service_account_json_path` 设置为具有 `https://www.googleapis.com/auth/admin.directory.group.readonly` 范围的域范围委派的服务帐户密钥文件，并将 `admin_email` 设置为服务帐户模拟的 Workspace 管理员；Directory API 需要真实的管理员主体。每个用户的组电子邮件地址成为他们的组声明，因此 `allowed_groups` 和 `managed.policies.match.groups` 匹配组电子邮件。 |
| `email_claim`                   | 否  | 哪个 id\_token 声明携带用户的电子邮件。默认 `email`。某些 IdP（如 ADFS 和 Entra B2C）改为发出 `upn` 或 `preferred_username`。接受平面键、JSON 指针或回退键列表，其中使用第一个存在的键。                                                                                                                                                                                                                                 |
| `scopes`                        | 否  | 网关请求的 OIDC 范围的完全覆盖。默认 `[openid, profile, email, offline_access]`。当你的 IdP 拒绝它不识别的范围或需要自定义范围来发出组或电子邮件时设置。必须包括 `openid`。删除 `offline_access` 会禁用刷新令牌，因此开发者每 `session.ttl_hours` 重新运行浏览器登录。有关每个 IdP 范围配方（如 Google 的刷新令牌流），请参阅[身份提供者设置](/docs/zh-CN/claude-apps-gateway-deploy#identity-provider-setup)。                                                                    |
| `extra_auth_params`             | 否  | 附加到 IdP 授权请求的额外查询参数，逐字。这是 IdP 特定行为的覆盖机制，如 Google 刷新令牌的 `access_type: offline`、某些 Entra 租户的 `domain_hint` 或分步流的 `acr_values`。不能覆盖网关管理的协议参数：`state`、`nonce`、`redirect_uri`、PKCE、`scope`、`response_type`、`response_mode` 和 `client_id`。                                                                                                                             |
| `userinfo_fallback`             | 否  | 当 id\_token 省略电子邮件或组时，从 `/userinfo` 获取它们。Keycloak 轻量级访问令牌、Okta 组织服务器和 ADFS 最小令牌需要。id\_token 保持权威；userinfo 仅填补空白。默认 `false`。                                                                                                                                                                                                                                      |
| `use_pkce`                      | 否  | 在授权请求上发送 PKCE (S256) 质询。默认 `true`。仅当你的 IdP 为此机密客户端拒绝 PKCE 时设置 `false`。                                                                                                                                                                                                                                                                                           |
| `clock_skew_seconds`            | 否  | 验证 id\_token 时间声明时容忍时钟漂移。默认 `0`，这是严格的。如果由于主机/IdP 时钟偏差在登录后立即看到"令牌过期/尚未有效"错误，请提高。                                                                                                                                                                                                                                                                                  |
| `token_endpoint_auth_method`    | 否  | 覆盖令牌端点身份验证方法。接受 `client_secret_basic` 或 `client_secret_post`。默认自动协商。                                                                                                                                                                                                                                                                                             |
| `id_token_signed_response_alg`  | 否  | 预期的 id\_token 签名算法。默认 `RS256`。为使用 ES256、PS256 或 EdDSA 签名的 IdP 设置。                                                                                                                                                                                                                                                                                                |
| `additional_authorized_parties` | 否  | 除 `client_id` 外要接受的额外 `azp` 值，用于 Keycloak 代理和令牌交换流                                                                                                                                                                                                                                                                                                               |
| `discovery_url`                 | 否  | 从此 URL 而不是从 `issuer` 派生发现文档，用于代理后面重写发行者主机的 IdP。路径必须包含 `/.well-known/`。                                                                                                                                                                                                                                                                                           |
| `form_action_origins`           | 否  | `/device` 页面的 `Content-Security-Policy: form-action` 指令的其他源。网关已允许 `'self'` 和发现的 `authorization_endpoint` 源，但 Chrome 对整个重定向链强制执行 `form-action`。如果你的 IdP 通过第二个主机重定向，如 Azure AD 联合到 ADFS、中心辐射 Okta 或公司 SSO 拦截器，列出授权请求可能重定向通过的每个源。                                                                                                                                   |
| `ca_cert_pem`                   | 否  | PEM CA 证书，替换 IdP 请求的系统信任存储。用于公司 PKI 后面的 Keycloak 或 Dex。                                                                                                                                                                                                                                                                                                          |

<h3 id="session">
  `session`
</h3>

`session` 块塑造网关在登录后铸造的持有者令牌：签署它们的密钥和它们的生命周期。

| 字段           | 必需 | 描述                                                                                                                                                                   |
| ------------ | -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jwt_secret` | 是  | 至少 32 字节的熵，例如来自 `openssl rand -base64 32`。签署网关的 HS256 持有者令牌。接受单个字符串或用于轮换的数组：索引 0 签署，所有条目验证。要轮换，前置新密钥，等待 `ttl_hours`，然后删除旧密钥。                                         |
| `ttl_hours`  | 否  | 网关持有者令牌生命周期。默认 `1`。当 IdP 发出刷新令牌时，CLI 在过期前静默刷新。较短的生命周期更快地取消配置；较长的生命周期减少 IdP 往返。如果你的 IdP 因为 `offline_access` 不可用而无法发出刷新令牌，则没有静默刷新，因此提高到 `8` 或 `12` 以避免每小时将开发者发送回浏览器登录。 |

<h3 id="store">
  `store`
</h3>

`store` 块指向网关的 PostgreSQL 数据库，该数据库保存设备授权和速率限制计数器。

| 字段                | 必需 | 描述                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres_url`    | 是  | `postgres://` 或 `postgresql://` URL。必需：设备授权会合点，浏览器回调写入，轮询 CLI 读取，需要跨副本状态。网关在启动时运行自己的模式迁移，因此角色需要在目标模式上具有 `CREATE TABLE` 权限。如果你的安全策略禁止应用角色的 DDL，使用管理员角色运行迁移，最初和每当新版本发布迁移时，并授予应用角色对网关表的 `SELECT, INSERT, UPDATE, DELETE` 权限。请参阅[升级](/docs/zh-CN/claude-apps-gateway-deploy#upgrades)和 [Postgres](/docs/zh-CN/claude-apps-gateway-deploy#postgres)。 |
| `username`        | 否  | 覆盖 `postgres_url` 中的用户                                                                                                                                                                                                                                                                                                                |
| `password`        | 否  | 数据库凭证。在此处设置而不是在 `postgres_url` 中，以便凭证保持在 URL 之外。接受任何字符并优先于 URL 凭证。                                                                                                                                                                                                                                                                    |
| `max_connections` | 否  | 每个副本的 Postgres 连接池大小。默认 `5`，这是保守的，对共享数据库友好。启用[支出限制](#admin)后，热路径在每个推理请求中执行几个操作，因此在负载下为专用数据库提高它，并保持副本 × 这个值低于数据库的 `max_connections`。                                                                                                                                                                                                   |

对于本地开发，将 `postgres_url` 指向一个一次性 Postgres 容器，例如 `docker run --rm -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres`。

<h3 id="upstreams">
  `upstreams`
</h3>

`upstreams` 是一个有序列表。网关将推理转发到解析请求的模型的第一个上游。在 `5xx`、`429`、`401`、`403`、`404` 或超时时，它故障转移到下一个；其他 `4xx` 不会，因为这些错误归因于请求而不是上游。`401` 或 `403` 意味着网关自己的凭证对该上游失败，`404` 意味着该上游不服务请求的模型，因此列表中的后续上游仍然可以。

在 `404` 上故障转移需要网关 v2.1.198 或更高版本。早期版本即使列表中的后续上游服务该模型，也会将第一个 `404` 返回给客户端。

Amazon Bedrock、Claude Platform on AWS、Google Cloud 的 Agent Platform 和 Microsoft Foundry 客户端在启动时构建一次，它们的 SDK 在内部刷新凭证，因此轮换云凭证不需要重启。静态 Anthropic API 密钥和持有者在启动时读取；请参阅 [Anthropic API](#anthropic-api)。

<h4 id="anthropic-api">
  Anthropic API
</h4>

最小的 Anthropic 上游是来自 [Claude 控制台](https://platform.claude.com) 的 API 密钥：

```yaml theme={null}
upstreams:
  - provider: anthropic
    auth:
      api_key: ${ANTHROPIC_API_KEY}
    # 或 OAuth 持有者（例如工作负载身份联合交换的令牌）：
    #   oauth_token: ${file:/var/run/secrets/anthropic-oauth-token}
    # base_url: https://api.anthropic.com   # 默认；为转发代理覆盖
```

两种凭证形式在它们发送的头中有所不同：

* **`api_key`**：发送 `x-api-key`。在 Claude 控制台中轮换它并更新环境变量。
* **`oauth_token`**：发送 `Authorization: Bearer`。当你的组织发出短期令牌而不是长期 API 密钥时使用持有者形式。持有者在启动时读取一次，因此通过重新挂载密钥和重启来刷新。

代替静态密钥或持有者，你可以使用工作负载身份联合。按照[工作负载身份联合指南](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation)创建联合规则，然后将你的工作负载的 OIDC JWT 挂载为文件，如 Kubernetes 投影服务帐户令牌或 CI 平台的 id-token。网关将 JWT 交换为短期持有者并自动刷新它。令牌文件在每次交换时重新读取，因此轮换的投影令牌被拾取而无需重启。

```yaml theme={null}
upstreams:
  - provider: anthropic
    auth:
      federation_rule_id: ${ANTHROPIC_FEDERATION_RULE_ID}
      organization_id: ${ANTHROPIC_ORGANIZATION_ID}
      identity_token_file: /var/run/secrets/anthropic/id-token
      # workspace_id: wrkspc_...       # 如果规则覆盖 >1 个工作区，则必需
      # service_account_id: svac_...   # 可选的预期目标检查
```

<h4 id="amazon-bedrock">
  Amazon Bedrock
</h4>

对于网关替换或前置的客户端 Bedrock 部署，请参阅 [Amazon Bedrock 上的 Claude Code](/docs/zh-CN/amazon-bedrock)。网关端上游：

```yaml theme={null}
upstreams:
  - provider: bedrock
    region: us-east-1
    auth: {}                           # 首选：AWS 默认凭证链
    # 或显式凭证：
    # auth:
    #   aws_access_key_id: ${AWS_AKID}
    #   aws_secret_access_key: ${AWS_SK}
    #   aws_session_token: ${AWS_ST}
    # 或 Bedrock API 持有者令牌：
    # auth:
    #   aws_bearer_token: ${AWS_BEARER_TOKEN}
    # 为 FIPS 或 VPC 端点部署覆盖 bedrock-runtime 端点：
    # base_url: https://bedrock-runtime-fips.us-east-1.amazonaws.com
```

空的 `auth` 块使用 AWS SDK 的默认凭证链：环境变量、`~/.aws/credentials`、ECS 任务角色、EC2 实例元数据或 EKS 上的 IRSA。在生产中，给网关 pod 一个 IAM 角色，而不是在容器镜像中嵌入静态密钥。

显式凭证必须完整：当 `aws_access_key_id` 和 `aws_secret_access_key` 未一起设置时，或当 `aws_session_token` 在没有它们的情况下设置时，网关在启动时失败。在 v2.1.207 之前，部分 `auth:` 块通过验证。

| 设置         | 如何                                                                                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM 权限     | 授予网关的主体 `bedrock:InvokeModel` 和 `bedrock:InvokeModelWithResponseStream` 在推理配置文件 ARN 和底层基础模型 ARN 上。对于美国地区的内置目录：`arn:aws:bedrock:<region>:<account>:inference-profile/us.anthropic.*` 和 `arn:aws:bedrock:*::foundation-model/anthropic.*`。 |
| 模型访问       | 在 Bedrock 控制台中，按地区，请求并启用你想要的 Claude 模型的模型访问。跨地区推理配置文件（`us.anthropic.*`）需要在配置文件跨越的每个地区中进行模型访问。                                                                                                                                            |
| EKS (IRSA) | 创建一个具有上述策略的 IAM 角色和针对你的集群的 OIDC 提供者的信任策略，范围限定为网关的服务帐户。使用 `eks.amazonaws.com/role-arn: arn:aws:iam::<acct>:role/claude-gateway` 注释服务帐户。`auth: {}` 拾取它。                                                                                    |
| ECS / EC2  | 将 IAM 角色附加到任务定义或实例配置文件。`auth: {}` 拾取它。                                                                                                                                                                                                   |
| 其他任何地方     | 通过 `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY` 和 `AWS_SESSION_TOKEN` 环境变量传递凭证，或在 `auth:` 中使用 `${VAR}` 扩展显式设置它们                                                                                                                           |
| 地区         | `region:` 是 API 端点地区。跨地区推理配置文件跨地理位置（美国、欧盟、亚太）路由，无论你选择哪一个。对于非美国地区或预配吞吐量 ARN，添加一个[`models:`](#models)块，其中包含正确的每上游 ID。                                                                                                                      |

<h4 id="claude-platform-on-aws">
  Claude Platform on AWS
</h4>

Claude Platform on AWS 在 `aws-external-anthropic.<region>.api.aws` 上的 AWS 基础设施上服务第一方 Anthropic API。它使用第一方模型 ID，按发送方式尊重 `anthropic-beta` 头，并服务 `count_tokens`，因此 Bedrock 特定的翻译都不适用。`anthropicAws` 提供者需要 Claude Code v2.1.198 或更高版本；早期网关版本在启动时拒绝它。

对于同一平台的客户端部署，请参阅 [Claude Platform on AWS 上的 Claude Code](/docs/zh-CN/claude-platform-on-aws)。网关端上游：

```yaml theme={null}
upstreams:
  - provider: anthropicAws
    region: us-east-1
    workspace_id: wrkspc_...
    auth:
      api_key: ${ANTHROPIC_AWS_API_KEY}   # 作为 x-api-key 发送
    # 或通过 AWS 默认凭证链的 SigV4：
    # auth: {}
    # 或显式 SigV4 凭证：
    # auth:
    #   aws_access_key_id: ${AWS_ACCESS_KEY_ID}
    #   aws_secret_access_key: ${AWS_SECRET_ACCESS_KEY}
    # 覆盖派生的端点：
    # base_url: https://aws-external-anthropic.us-east-1.api.aws
```

该平台在与 Amazon Bedrock 不同的 AWS 账户中运行，并为其自己的服务名称 `aws-external-anthropic` 签署 SigV4 请求，因此 Bedrock 范围的 IAM 角色不授权它。`auth.api_key` 中的 API 密钥在同时设置 SigV4 凭证时优先。空的 `auth` 块使用 AWS SDK 的默认凭证链，与 [Amazon Bedrock](#amazon-bedrock) 上游使用的链相同。

| 字段                                                      | 必需 | 描述                                                                              |
| ------------------------------------------------------- | -- | ------------------------------------------------------------------------------- |
| `region`                                                | 是  | AWS 地区，小写字母、数字和连字符。网关从它派生端点为 `https://aws-external-anthropic.<region>.api.aws`。 |
| `workspace_id`                                          | 是  | 在每个请求上作为头发送；平台需要它                                                               |
| `auth.api_key`                                          | 否  | 平台的 API 密钥，作为 `x-api-key` 发送。不是持有者令牌：两种身份验证模式是 API 密钥或 SigV4。                   |
| `auth.aws_access_key_id` / `auth.aws_secret_access_key` | 否  | 显式 SigV4 凭证。设置其中一个而不设置另一个在启动时失败。`auth.aws_session_token` 与它们一起被接受。              |
| `base_url`                                              | 否  | 覆盖派生的端点                                                                         |

因为平台解析第一方模型 ID，内置目录路由到它，无需 [`models:`](#models) 块。当你策划 `models:` 列表时，使用第一方 ID 键入 `anthropicAws:` 条目。

<h4 id="google-cloud-agent-platform">
  Google Cloud Agent Platform
</h4>

对于等效的客户端设置，请参阅 [Google Cloud 上的 Claude Code](/docs/zh-CN/google-vertex-ai)。网关端上游：

```yaml theme={null}
upstreams:
  - provider: vertex
    region: us-east5
    project_id: example-prod
    auth: {}                           # 首选：应用默认凭证
    # 或服务帐户密钥文件：
    # auth: { service_account_json: /secrets/sa.json }
    # 为私有服务连接覆盖 aiplatform 端点：
    # base_url: https://us-east5-aiplatform.p.googleapis.com
```

空的 `auth` 块使用应用默认凭证：`GOOGLE_APPLICATION_CREDENTIALS`、GCE 元数据或 GKE 工作负载身份。支持服务帐户 JSON 密钥文件但不推荐；使用工作负载身份或将服务帐户附加到 GCE 或 Cloud Run 实例。

设置 `region: global` 以使用 [Agent Platform 的全局端点](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)而不是区域端点。Google 然后将每个请求路由到可用地区，因此你不跟踪每地区模型可用性。设置特定地区会将每个请求固定到它。

| 设置              | 如何                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM 权限          | 授予网关的服务帐户项目上的 `roles/aiplatform.user`，或具有 `aiplatform.endpoints.predict` 的自定义角色。启用 Agent Platform API (`aiplatform.googleapis.com`)。        |
| 模型访问            | 在 Model Garden 中，为你的项目启用 Claude 模型。它们发布到特定地区；检查模型卡以了解支持的地区。                                                                                 |
| GKE (工作负载身份)    | 将 GCP 服务帐户绑定到网关的 Kubernetes 服务帐户，并使用 `iam.gke.io/gcp-service-account: claude-gateway@<proj>.iam.gserviceaccount.com` 注释 KSA。`auth: {}` 拾取它。 |
| Cloud Run / GCE | 将服务的服务帐户设置为具有 `roles/aiplatform.user` 的服务帐户。`auth: {}` 拾取它。                                                                                 |
| 其他任何地方          | `auth: { service_account_json: /secrets/sa.json }`，JSON 密钥文件的路径，挂载为密钥。该字段采用文件路径，而不是密钥内容，因此不涉及 `${file:…}` 扩展。                               |

<h4 id="microsoft-foundry">
  Microsoft Foundry
</h4>

对于客户端 Foundry 部署，请参阅 [Microsoft Foundry 上的 Claude Code](/docs/zh-CN/microsoft-foundry)。网关端上游：

```yaml theme={null}
upstreams:
  - provider: foundry
    resource: example-foundry              # https://example-foundry.services.ai.azure.com
    auth: { use_azure_ad: true }        # 首选：DefaultAzureCredential / 托管身份
    # 或 API 密钥：
    # auth:
    #   api_key: ${FOUNDRY_API_KEY}
```

`use_azure_ad: true` 通过 `DefaultAzureCredential` 解析：AKS、ACI 或 App Service 上的托管身份；Azure CLI；或环境凭证。API 密钥有效但是项目范围的，不会自动轮换。Foundry 的端点从 `resource:` 派生；设置可选的 `base_url` 以为主权云（如 Azure Government）覆盖它。

| 设置                | 如何                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| RBAC              | 授予网关的身份 Foundry 资源上的 `Azure AI User` 或 `Cognitive Services User`                                  |
| 部署                | Foundry 使用管理员选择的部署名称，而不是规范模型 ID。添加一个[`models:`](#models)块，将每个规范 ID 映射到你的部署名称。                     |
| AKS (工作负载身份)      | 将用户分配的托管身份与集群的 OIDC 发行者联合，并将其绑定到网关的服务帐户。`use_azure_ad: true` 通过 `WorkloadIdentityCredential` 拾取它。 |
| ACI / App Service | 在资源上启用系统分配或用户分配的托管身份。`use_azure_ad: true` 拾取它。                                                    |
| 其他任何地方            | `auth: { api_key: "${FOUNDRY_API_KEY}" }`。在 `{ }` 内引用 `${…}`。                                     |

<h4 id="multiple-upstreams">
  多个上游
</h4>

同一提供者可以出现多次，具有不同的 `name:`。这涵盖不同的地区、通过不同凭证链的不同帐户、预配吞吐量与按需以及跨提供者故障转移。

网关按顺序尝试上游。`5xx`、`429`、`401`、`403`、`404`、超时和缺失端点（`501`）故障转移；其他 `4xx` 不会。

`429` 是每上游容量，因此预配吞吐量 (PT) 耗尽故障转移到按需。`404` 是每上游模型可用性，因此未启用模型的上游不会阻止服务它的后续上游。无法解析请求的模型的上游被跳过，无需网络往返。

此示例首先路由预配吞吐量 Bedrock 分配，溢出到按需和第二个帐户，最后回退到 Anthropic API：

```yaml theme={null}
upstreams:
  # 主要：你的主地区的预配吞吐量。
  - name: bedrock-pt
    provider: bedrock
    region: us-east-1
    auth: {}
  # 溢出：按需跨地区。
  - name: bedrock-od
    provider: bedrock
    region: us-west-2
    auth: {}
  # 不同帐户：通过假定角色凭证的单独 Bedrock 分配。
  - name: bedrock-acct2
    provider: bedrock
    region: us-east-1
    auth:
      aws_access_key_id: ${ACCT2_AKID}
      aws_secret_access_key: ${ACCT2_SK}
  # 最后的手段：直接 Anthropic API。
  - name: anthropic-fallback
    provider: anthropic
    auth:
      api_key: ${ANTHROPIC_API_KEY}

# 每上游模型 ID 由上游的 `name:` 键入；没有 `name:` 的上游默认为其提供者字符串（例如 `bedrock`）。任何未为模型列出的上游都被跳过，这是你如何将模型路由到预配吞吐量，同时其他所有内容保持按需的方式。
models:
  - id: claude-opus-4-8
    label: Claude Opus 4.8
    upstream_model:
      bedrock-pt: arn:aws:bedrock:us-east-1:111111111111:provisioned-model/abcdef
      bedrock-od: us.anthropic.claude-opus-4-8
      bedrock-acct2: us.anthropic.claude-opus-4-8
      anthropic-fallback: claude-opus-4-8
```

| 杠杆            | 如何                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 不同地区          | 每个地区一个 Bedrock 上游，每个都有自己的 `region:`。使用 [`auto_include_builtin_models: true`](#models)，跨地区推理配置文件自动路由；对于地区固定部署，使用 `models:` 块。 |
| 不同帐户          | 每个帐户一个 Bedrock 上游，每个在 `auth:` 中都有自己的凭证。默认链 (`auth: {}`) 使用 pod 的身份；对于第二个帐户，设置显式凭证或持有者令牌。                                     |
| 预配吞吐量         | 在该上游名称的 `models:` 中将模型映射到预配吞吐量 ARN。其他上游保持按需 ID，因此 PT 容量在故障转移前耗尽。                                                             |
| VPC / FIPS 端点 | 在上游上设置 `base_url:` 到你的 VPC 端点或 FIPS 端点 URL                                                                                   |
| 模型范围路由        | 从模型的 `upstream_model:` 映射中省略上游，该上游对该模型被跳过。例如，将 Opus 路由到预配吞吐量，将 Sonnet 和 Haiku 路由到按需。                                         |

在云提供者之间或直接 Anthropic API 之间故障转移会改变哪个协议、地理位置和其他条款管理请求。

CLI 对网关应用相同的功能门控，无论哪个上游服务给定请求，因此故障转移不会发送上游会拒绝的正文字段。

<h2 id="optional-sections">
  可选部分
</h2>

<h3 id="admin">
  `admin`
</h3>

可选。启用 `/v1/organizations/spend_limits`，它镜像 Anthropic 的公共 Admin API，以及 `/v1/messages` 上的每开发者支出强制。有关如何设置和强制执行上限的信息，请参阅[支出限制](/docs/zh-CN/claude-apps-gateway-spend-limits)；本部分涵盖打开该功能和调整它的 `gateway.yaml` 键。

```yaml theme={null}
admin:
  # 管理员端点的命名静态 API 密钥，作为 x-api-key 发送。
  # id 在审计日志中显示为 admin-key:<id>，因此每个密钥都是
  # 可归因的。用于轮换的数组：添加新密钥，滚动客户端，
  # 删除旧密钥。
  write_keys:
    - { id: terraform, key: "${GATEWAY_ADMIN_WRITE_KEY_TF}" }
    - { id: ci,        key: "${GATEWAY_ADMIN_WRITE_KEY_CI}" }
  read_keys:
    - { id: reporting, key: "${GATEWAY_ADMIN_READ_KEY}" }
  # 通过普通网关 JWT（无 API 密钥）授予完全管理员的 IdP 组。
  admin_groups: [platform-finops]
  blocked_message: request an increase at https://go.example.com/claude-limits
```

| 字段                        | 必需 | 描述                                                                                                                                                                                        |
| ------------------------- | -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write_keys`              | 否  | `{id, key}` 的数组。与这些之一匹配的 `x-api-key` 可以列出、设置和删除支出限制。密钥值必须至少 32 个字符；`id` 必须在 `read_keys` 和 `write_keys` 中唯一。                                                                               |
| `read_keys`               | 否  | `{id, key}` 的数组。只读：每个 `GET` 端点，包括列出上限、按 ID 获取一个，以及读取 [`/effective`](/docs/zh-CN/claude-apps-gateway-spend-limits#%2Feffective) 和 [`/audit`](/docs/zh-CN/claude-apps-gateway-spend-limits#%2Faudit)。 |
| `admin_groups`            | 否  | IdP 组名称。其 `groups` 声明包括其中之一的网关 JWT 具有完全管理员访问权限，读和写，并审计为 `oidc:<sub>`。用于人类管理员；为机器使用 API 密钥。                                                                                                |
| `blocked_message`         | 否  | 逐字附加到被阻止的开发者看到的 `429 billing_error`。写出整个指令，如 URL 或 Slack 频道。未设置，错误是 `spend limit reached`。                                                                                                |
| `audit_retention_days`    | 否  | 默认 `365`。较旧的 `admin_audit` 行被清除。                                                                                                                                                          |
| `spend_retention_months`  | 否  | 默认 `13`。`spend` 计数器行早于此被清除。默认值保留完整年份加当前部分月份用于年度比较报告。                                                                                                                                      |
| `identity_retention_days` | 否  | 默认 `90`。`principal_emails` 行的最后看到 TTL，其中保存每个开发者的电子邮件、显示名称和组 (PII)。故意比支出保留更短，因此取消配置的身份在其匿名支出计数器保留时老化。                                                                                      |
| `group_limit_mode`        | 否  | `min`（默认）或 `max`。当开发者在具有上限的多个组中时，`min` 强制执行最严格的，`max` 强制执行最宽松的。由强制执行和 `/effective` 使用。                                                                                                    |

<h3 id="enforcement">
  `enforcement`
</h3>

`enforcement` 块控制当存储不可用时支出限制检查的行为。

| 字段                     | 必需 | 描述                                                                                                               |
| ---------------------- | -- | ---------------------------------------------------------------------------------------------------------------- |
| `fail_closed_on_error` | 否  | 默认 `false`。支出强制在 Postgres 中断时故障开放，因此推理保持运行。设置 `true` 以故障关闭：超额开发者被阻止，但如果存储无法访问，每个人都被阻止。没有 [`admin:`](#admin) 块无效。 |

<h3 id="models">
  `models`
</h3>

`models` 块是可选的管理员策划的模型列表，在 `/v1/models` 提供，用于按上游翻译模型 ID。对于非美国 Amazon Bedrock 地区、Amazon Bedrock 预配吞吐量 ARN 和 Microsoft Foundry 部署名称是必需的。

```yaml theme={null}
auto_include_builtin_models: true   # false：仅公开下面的列表
models:
  - id: claude-opus-4-8
    label: Claude Opus 4.8
    # description: 可选文本显示在表面它的客户端中
    upstream_model:
      anthropic: claude-opus-4-8
      bedrock: us.anthropic.claude-opus-4-8   # 或推理配置文件 ARN
      foundry: your-opus-deployment-name
```

<h3 id="managed">
  `managed`
</h3>

`managed` 块定义基于 IdP 组或电子邮件域键入的基于角色的访问策略。策略按顺序评估；第一个匹配被选择，然后合并到下面描述的 `match: {}` 捕获所有基础。它们按用户在 `GET /managed/settings` 提供，具有 ETag/304 缓存。

```yaml theme={null}
managed:
  policies:
    # 特定组首先。
    - match: { groups: [eng-contractors] }
      cli:
        availableModels: [claude-sonnet-4-6]
        permissions: { deny: ["WebFetch", "WebSearch"] }
    # 默认捕获所有最后：匹配每个已认证的用户。
    - match: {}
      cli:
        availableModels: [claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5]
```

`match: {}` 捕获所有，按惯例列在最后，被视为基础层。每个其他策略从捕获所有继承它不设置的任何键，因此每角色条目只需列出与组织默认不同的内容。合并规则取决于键类型：

* **允许列表**：`availableModels` 和 `permissions.allow`。特定策略的列表完全替换基础的。
* **拒绝列表和钩子数组**：`permissions.deny`、`permissions.ask`、`disabledMcpjsonServers`、`deniedMcpServers`、`blockedMarketplaces` 和每个 `hooks` 事件类型数组。这些取基础和策略的并集，因此组织范围的拒绝或审计钩子不能被每角色覆盖意外删除。
* **记录类型的键**：`env`、`modelOverrides` 和 `skillOverrides`。这些浅合并，因此每角色 `env` 块覆盖它设置的键并从基础继承其余的。

`availableModels` 也在 `/v1/messages` 服务器端强制执行，因此被拒绝的模型返回 `400`，无论客户端发送什么。

| 匹配器                                                 | 行为                                                        |
| --------------------------------------------------- | --------------------------------------------------------- |
| `match: {}`                                         | 匹配每个已认证的用户。从其中一个开始，稍后添加组范围的策略。                            |
| `match: { groups: [a, b] }`                         | 如果 JWT 的 `groups` 声明包含任何列出的组，则匹配。区分大小写：组必须与 IdP 的确切大小写匹配。 |
| `match: { email_domain: example.com }`              | 匹配 JWT 的 `email` 声明中最后 `@` 后的部分，不区分大小写。每个策略接受一个域。         |
| `match: { groups: [a], email_domain: example.com }` | 两个条件都必须匹配                                                 |

与任何策略不匹配的已认证用户获得网关的默认值，这意味着目录中的每个模型和没有托管设置。如果你想要保证的默认策略，最后添加 `match: {}` 捕获所有。

<Note>
  网关保持自己的用户目录。它从用户的 IdP 令牌授权每个请求，从令牌的 `groups` 声明读取组成员身份，并根据它评估策略。没有要枚举的名册，没有要预创建的帐户，因此没有 SCIM 端点，因为没有东西可供 SCIM 同步到。

  在真实来源处运行用户和组生命周期管理，这是你的 IdP 的本地 SCIM 配置或专用身份治理平台。那里管理的成员身份和取消配置通过令牌自动流入网关。如果你想要 Claude 帐户本身的 SCIM 配置，这是一个 [Claude for Enterprise](/docs/zh-CN/admin-setup) 功能。

  两个传播时钟适用：

  * **策略内容**：编辑策略并重新部署到连接的客户端在其下一个托管设置轮询，在一小时内
  * **组成员身份**：更改用户的组成员身份改变哪个策略匹配他们。这在下一个会话重新铸造时生效，意味着下一个静默刷新，由 `session.ttl_hours` 限制。
</Note>

<h4 id="what-goes-in-cli">
  `cli` 中的内容
</h4>

每个 `cli` 值是完整的 Claude Code `managed-settings.json` 文档，与你通过 MDM 或 `/etc/claude-code/managed-settings.json` 部署的相同模式，在此表示为 YAML。CLI 在托管层应用交付的文档，在用户和项目设置之上。

网关在启动时根据 CLI 的设置模式验证每个文档，因此无法识别的顶级键或具有格式错误值的识别键在启动时失败，并显示命名每个违规键的错误。模式的故意开放部分仍然接受任意值，因为较新的客户端可能识别网关的模式不识别的条目。这些开放键是 `env`、`pluginConfigs` 和 `permissions` 下嵌套的键。

因为验证使用与网关的已安装版本捆绑的模式，将较新 Claude Code 版本引入的顶级设置键放入托管配置需要首先升级网关。在一个客户端上烟雾测试新策略，然后再推出。

完整的键参考在 [Claude Code 设置](/docs/zh-CN/settings#available-settings) 中。操作员首先到达的最常见的键：

```yaml theme={null}
managed:
  policies:
    - match: {}
      cli:
        # 模型访问（也在 /v1/messages 服务器端强制执行）
        availableModels: [claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5]

        # 权限策略
        permissions:
          deny:
            - "WebFetch"
            - "Read(./.env)"
            - "Read(./secrets/**)"
          disableBypassPermissionsMode: disable   # 阻止 --dangerously-skip-permissions
        allowManagedPermissionRulesOnly: true     # 忽略用户/项目权限规则

        # 推送到 CLI 进程的环境。DISABLE_UPDATES 阻止
        # 后台和手动更新；DISABLE_AUTOUPDATER 仅停止
        # 后台更新。
        env:
          DISABLE_UPDATES: "1"                    # 通过你自己的分发固定版本

        # 组织范围的钩子。钩子命令在开发者机器上运行，而不是
        # 网关，因此路径必须存在于策略中每个客户端 OS 上。
        hooks:
          PostToolUse:
            - matcher: "Edit|Write"
              hooks:
                - { type: command, command: /usr/local/bin/audit-edit.sh }
```

| 键                                          | 由以下强制执行  | 效果                                                                                                                                                                |
| ------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `availableModels`                          | 网关 + CLI | 模型允许列表。也在 `/v1/messages` 检查，因此修补的客户端无法绕过它。                                                                                                                        |
| `permissions.allow` / `.deny`              | CLI      | 工具和命令规则。请参阅[权限](/docs/zh-CN/permissions)。                                                                                                                              |
| `permissions.disableBypassPermissionsMode` | CLI      | 设置为 `disable` 以阻止 [`bypassPermissions`](/docs/zh-CN/permission-modes#skip-all-checks-with-bypasspermissions-mode)，自动批准每个工具调用的模式，以及 `--dangerously-skip-permissions` 标志 |
| `allowManagedPermissionRulesOnly`          | CLI      | 当 `true` 时，用户和项目权限规则被忽略；仅此文档中的规则适用                                                                                                                                |
| `env`                                      | CLI      | 合并到 CLI 进程的环境变量。用于遥测、自动更新和模型名称覆盖。                                                                                                                                 |
| `hooks`                                    | CLI      | 组织范围的[钩子](/docs/zh-CN/hooks)                                                                                                                                           |

因为这些设置通过网络到达，CLI 在应用任何可以运行 shell 命令或改变流量去往何处的内容之前向每个开发者显示一次性安全批准对话。对话涵盖：

* `hooks`
* `env` 变量不在 CLI 的内置安全列表上
* shell 执行设置，如 `apiKeyHelper` 和 `statusLine`
* 托管 CLAUDE.md 内容

安全列表确定哪些 `env` 变量在没有批准的情况下应用：

* **在安全列表上**：自动更新和模型名称变量
* **不在安全列表上**：代理变量、基础 URL 变量和 `OTEL_EXPORTER_OTLP_ENDPOINT`

网关的[遥测](#telemetry)配置推送 `OTEL_EXPORTER_OTLP_ENDPOINT`，因此设置 `telemetry.forward_to` 在每个交互式客户端上触发对话。对话保护开发者的机器免受受损或敌对网关，而不是组织免受开发者。

使用 `-p` 标志的非交互式运行无法显示对话。它仅为该运行应用推送的设置，不将其记录为已批准，因此开发者的下一个交互式会话仍然显示对话。在 v2.1.207 之前，非交互式运行将设置保存为已批准，之后没有交互式会话为它们显示对话。

如果开发者拒绝，Claude Code 退出而不是应用策略。将新钩子或非安全环境变量推送到广泛策略因此意味着每个匹配开发者下一次启动时的批准提示。

`cli` 键在早期版本中被命名为 `settings`。该拼写仍然被接受为别名，但新部署应使用 `cli`。

<h4 id="precedence-with-other-managed-sources">
  与其他托管来源的优先级
</h4>

如果设备也有本地 `managed-settings.json` 或 MDM 交付的策略，托管来源不合并。最高优先级来源提供所有策略设置，按此顺序排列，最高优先级优先：

1. [策略助手](/docs/zh-CN/settings#compute-managed-settings-with-a-policy-helper)
2. 网关交付的设置
3. MDM，通过 Windows 上的 HKLM 注册表或 macOS 上的 plist
4. `managed-settings.json` 文件
5. HKCU 注册表，仅在 Windows 上

嵌入主机可以通过 SDK `managedSettings` 选项提供策略。默认情况下它被忽略，仅当托管来源使用 [`parentSettingsBehavior: "merge"`](/docs/zh-CN/settings#available-settings) 选择加入时应用，过滤以便它可以收紧策略但不能放松它。

例外是一小组跨来源键，当任何管理来源设置它们时被尊重；用户可写的 HKCU 层被排除：

* `sandbox.network.allowManagedDomainsOnly` 和 `sandbox.filesystem.allowManagedReadPathsOnly`：当锁定时，对应的允许列表跨来源联合
* [`allowAllClaudeAiMcps`](/docs/zh-CN/settings#available-settings)：claude.ai MCP 服务器允许列表的仅允许覆盖
* `sandbox.bwrapPath` 和 `sandbox.socatPath`：[沙箱](/docs/zh-CN/sandboxing)助手二进制文件的文件系统路径
* [`forceRemoteSettingsRefresh`](/docs/zh-CN/server-managed-settings)：阻止启动直到远程托管设置被新鲜获取，因此 MDM 或文件策略设置它被尊重，即使缺少该键的缓存远程有效负载是最高优先级来源

每个其他键，包括 `allowManagedPermissionRulesOnly` 和 `disableBypassPermissionsMode`，来自最高优先级来源。请参阅[设置优先级](/docs/zh-CN/settings#settings-precedence)了解设置页面上的相同规则。

网关策略适用于机器上的每个 Claude Code 调用，包括非交互式 `claude -p` 运行和由 Agent SDK 生成的会话。如果网关在启动时无法访问，已登录的会话以错误退出，而不是在没有其策略的情况下运行。

<Warning>
  策略的 `cli` 块内的 `mcpServers` 在网关启动时被拒绝。不提供每组 MCP 分发；通过文件基础 `managed-mcp.json` 在每个设备上部署 MCP 服务器或让开发者在本地添加它们。
</Warning>

<h3 id="telemetry">
  `telemetry`
</h3>

CLI 通过 HTTP 指标、日志和（启用时）跟踪将 OpenTelemetry Protocol (OTLP) 发送到网关，网关逐字中继到每个配置的目标。有关 CLI 发出的指标和事件，请参阅[监控使用](/docs/zh-CN/monitoring-usage)。

CLI 使用从网关发出的 JWT 读取的已认证用户的身份戳记每个导出：`user.id`、`user.email` 和 `user.groups` 属性。每开发者成本和使用归因因此在没有开发者端配置的情况下工作。

```yaml theme={null}
telemetry:
  forward_to:
    - url: https://otel-collector.internal.example.com
      headers:
        Authorization: ${OTLP_TOKEN}
      # 每信号选择加入。默认：仅指标。
      metrics: true
      logs: false
      traces: false
    - url: https://api.datadoghq.com/api/v2/otlp
      headers:
        DD-API-KEY: ${DD_API_KEY}
```

<Warning>
  每个目标独立选择加入 `metrics`、`logs` 和 `traces`，默认值仅为指标。信号在敏感性上有所不同：

  * **指标**：聚合计数器，如令牌计数、请求计数和延迟
  * **日志和跟踪**：可以携带完整的 bash 命令、工具输入和文件路径，涵盖 Claude Code 在开发者机器上所做的任何事情

  仅在具有该数据保证的访问控制和保留策略的目标上启用日志和跟踪。
</Warning>

遥测在 CLI 中默认关闭。将 `telemetry.forward_to` 与 `listen.public_url` 一起配置会打开它。网关通过 `/managed/settings` 推送五个环境变量到每个连接的客户端：

* `CLAUDE_CODE_ENABLE_TELEMETRY=1`
* `OTEL_METRICS_EXPORTER=otlp`
* `OTEL_LOGS_EXPORTER=otlp`
* `OTEL_TRACES_EXPORTER=otlp`
* `OTEL_EXPORTER_OTLP_ENDPOINT=<public_url>`

推送的端点从公共 URL 构建，因此指标和日志不需要来自开发者或策略的 OTEL 配置。推送的配置在托管层应用，覆盖开发者在本地设置的 `OTEL_*` 变量。

[跟踪](/docs/zh-CN/monitoring-usage#traces-beta)另外需要每个客户端上的 `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`。网关不推送该变量，因此通过托管策略的 `env` 块设置它。它不在 CLI 的安全列表上，因此通过策略交付它由推送的 OTLP 端点已经触发的相同[安全批准对话](#managed)覆盖。

protobuf 和 JSON OTLP 编码都被中继，任何 OpenTelemetry 兼容的后端都可以作为目标。

<h3 id="http-tuning">
  HTTP 调整
</h3>

四个可选的顶级块，`access_control`、`limits`、`timeouts` 和 `rate_limits`，调整 HTTP 表面。默认值适合大多数部署。

| 块                | 键                                              | 默认       | 描述                                                                                                                                                                        |
| ---------------- | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_control` | `allow_cidrs` / `deny_cidrs`                   | 空        | 按客户端地址的入站 IP 允许/拒绝，在 `trusted_proxies` 解析后。`deny_cidrs` 首先检查；与它匹配的客户端被拒绝，即使 `allow_cidrs` 也匹配。如果 `allow_cidrs` 非空，网关是默认拒绝。`/healthz` 和 `/readyz` 免除 `allow_cidrs`。        |
| `limits`         | `max_request_bytes`                            | 32 MiB   | 最大入站请求正文；超大请求在缓冲正文前获得 `413`。为大文件或图像请求提高。                                                                                                                                  |
| `limits`         | `max_request_header_bytes`                     | 未设置      | 设置时，超大头返回 `431`                                                                                                                                                           |
| `limits`         | `max_url_length`                               | 未设置      | 设置时，过长 URL 返回 `414`                                                                                                                                                       |
| `timeouts`       | `upstream_ttfb_ms`                             | 120000   | 等待上游响应头的最大时间（首字节时间）。响应正文然后流式传输，没有墙钟上限。适用于直接 Anthropic 上游路径；每个其他提供者由其提供者 SDK 自己的超时限制。                                                                                      |
| `rate_limits`    | `device_authorization.max` / `.window_seconds` | 30 / 600 | 未认证设备授权端点上的每 IP 速率限制。为共享出口 IP 或 NAT 后面的大型组织提高。这些限制仅适用于设备授权登录流，不适用于 `/v1/messages` 推理。请参阅[用户代码暴力破解抵抗](/docs/zh-CN/claude-apps-gateway-deploy#user-code-brute-force-resistance)。 |
| `rate_limits`    | `device_verify.max` / `.window_seconds`        | 10 / 600 | `/device` 上 `user_code` 提交的每 IP 速率限制                                                                                                                                      |

<h2 id="complete-example">
  完整示例
</h2>

此完整参考配置演示了每个核心部分；[HTTP 调整块](#http-tuning)保持其默认值。复制它，删除你不需要的，并填入你的值。[快速入门](/docs/zh-CN/claude-apps-gateway#quickstart)中的配置是此的最小版本。

```yaml gateway.yaml theme={null}
# 运行方式：
#   claude gateway --config gateway.yaml
#
# 操作日志详细程度由 CLAUDE_GATEWAY_LOG_LEVEL
# 环境变量控制（info | warn | error；默认 info）。它不
# 影响审计事件，总是发出。

listen:
  host: 0.0.0.0
  port: 8080
  public_url: https://claude-gateway.internal.example.com
  # 在 TLS 终止入口后面运行时省略 tls 块。
  # tls:
  #   cert: /certs/gateway.crt
  #   key: /certs/gateway.key
  # trusted_proxies:
  #   - 10.0.0.0/8

oidc:
  issuer: https://example.okta.com
  client_id: 0oa1example2
  client_secret: ${OIDC_CLIENT_SECRET}
  allowed_email_domains:
    - example.com
  # 当发行者是 Okta 组织服务器时需要，其 id_token
  # 可以省略电子邮件和组；网关从 /userinfo 填充它们。
  userinfo_fallback: true
  # allowed_groups: [claude-code-users]
  # Okta 仅在请求 `groups` 范围且
  # 应用的组声明过滤允许它们时发出组。下面的承包商策略
  # 匹配组，因此范围在此处请求。
  scopes: [openid, profile, email, offline_access, groups]
  # extra_auth_params: { access_type: offline, prompt: consent }  # Google
  # groups_claim: groups          # Entra 应用角色：使用 `roles`
  # email_claim: email

session:
  jwt_secret: ${GATEWAY_JWT_SECRET}   # openssl rand -base64 32
  # ttl_hours: 1

store:
  postgres_url: ${GATEWAY_POSTGRES_URL}
  # max_connections: 5

# 启用 /v1/organizations/spend_limits（镜像 Anthropic Admin API）
# 和 /v1/messages 上的每开发者支出强制。省略以禁用。
# 上限本身通过 admin API 设置，而不是此处。
# admin:
#   write_keys:
#     - { id: terraform, key: "${GATEWAY_ADMIN_WRITE_KEY_TF}" }
#   read_keys:
#     - { id: reporting, key: "${GATEWAY_ADMIN_READ_KEY}" }
#   admin_groups: [platform-finops]
#   blocked_message: request an increase at https://go.example.com/claude-limits
#   # audit_retention_days: 365
#   # spend_retention_months: 13
#   # identity_retention_days: 90
#   # group_limit_mode: min

# enforcement:
#   fail_closed_on_error: false

upstreams:
  - provider: anthropic
    auth:
      api_key: ${ANTHROPIC_API_KEY}

  # - provider: bedrock
  #   region: us-east-1
  #   auth: {}

  # - provider: anthropicAws
  #   region: us-east-1
  #   workspace_id: wrkspc_...
  #   auth:
  #     api_key: ${ANTHROPIC_AWS_API_KEY}

  # - provider: vertex
  #   region: us-east5
  #   project_id: example-prod
  #   auth: {}

  # - provider: foundry
  #   resource: example-foundry
  #   auth: { use_azure_ad: true }

auto_include_builtin_models: true
models:
  - id: claude-opus-4-8
    label: Claude Opus 4.8
    upstream_model:
      anthropic: claude-opus-4-8
      # bedrock: us.anthropic.claude-opus-4-8
      # anthropicAws: claude-opus-4-8
      # vertex: claude-opus-4-8
      # foundry: <your-opus-deployment-name>
  - id: claude-sonnet-4-6
    label: Claude Sonnet 4.6
    upstream_model:
      anthropic: claude-sonnet-4-6
  - id: claude-haiku-4-5
    label: Claude Haiku 4.5
    upstream_model:
      anthropic: claude-haiku-4-5

managed:
  policies:
    - match: { groups: [contractors] }
      cli:
        availableModels: [claude-haiku-4-5]
        # 将默认选择器选项限制为 availableModels 而不是
        # 层默认，因此承包商不会在默认上获得 400。
        enforceAvailableModels: true
        # allow 自动批准这些工具；它不阻止其余的。
        # 添加拒绝规则以限制工具。
        permissions: { allow: [Read, Grep] }
    - match: {}
      cli:
        availableModels: [claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5]
        permissions:
          allow: [Read, Grep, Bash, Edit]
          deny: ["WebFetch"]
        env: { HTTP_PROXY: http://proxy.example.com:8080 }

telemetry:
  forward_to:
    - url: https://otel.internal.example.com:4318
      headers:
        Authorization: Bearer ${OTEL_TOKEN}
```

<h2 id="client-side-managed-settings">
  客户端托管设置
</h2>

上面的所有内容配置网关服务器。将开发者机器指向它是在每个设备上单独配置的，通过 Claude Code 的[托管设置](/docs/zh-CN/settings#settings-files)。网关无法自己推送这些键，因为它们是告诉客户端网关在哪里的内容。

对于 CLI，在每个 OS `managed-settings.json` 中设置两个键：

```json theme={null}
{
  "forceLoginMethod": "gateway",
  "forceLoginGatewayUrl": "https://claude-gateway.internal.example.com"
}
```

将该文件部署到每个设备，通常通过你的 MDM 平台。文件路径因平台而异：

| 平台          | 路径                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------- |
| macOS       | `/Library/Application Support/ClaudeCode/managed-settings.json`，或 `com.anthropic.claudecode` 托管首选项域 |
| Linux 和 WSL | `/etc/claude-code/managed-settings.json`                                                            |
| Windows     | `C:\Program Files\ClaudeCode\managed-settings.json`，或通过 HKLM 注册表的组策略                                |

`forceLoginGatewayUrl` 和 `forceLoginMethod` 的 `"gateway"` 值仅从管理员控制的托管层被尊重。开发者在自己的 `~/.claude/settings.json` 中设置它们无效。

<h2 id="related">
  相关
</h2>

* [Claude 应用网关概述](/docs/zh-CN/claude-apps-gateway)：快速入门和开发者连接
* [部署指南](/docs/zh-CN/claude-apps-gateway-deploy)：IdP 设置、容器镜像、Kubernetes 和 Cloud Run，以及操作
* [支出限制](/docs/zh-CN/claude-apps-gateway-spend-limits)：每开发者上限和 Admin API
