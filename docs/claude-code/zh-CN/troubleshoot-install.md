> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 排查安装和登录问题

> 修复安装或登录 Claude Code 时出现的命令未找到、PATH、权限、网络和身份验证错误。

如果安装失败或无法登录，请在下面找到您的错误。有关 Claude Code 正常工作后的运行时问题，请参阅 [Troubleshooting](/docs/zh-CN/troubleshooting)。有关配置问题（例如设置未应用或 hooks 未触发），请参阅 [Debug your configuration](/docs/zh-CN/debug-your-config)。

<h2 id="find-your-error">
  查找您的错误
</h2>

将您看到的错误消息或症状与解决方案相匹配：

| 您看到的内容                                                                                     | 解决方案                                                                                                                              |
| :----------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| `command not found: claude` 或 `'claude' is not recognized`                                 | [修复您的 PATH](#command-not-found-claude-after-installation)                                                                         |
| `syntax error near unexpected token '<'`                                                   | [安装脚本返回 HTML](#install-script-returns-html-instead-of-a-shell-script)                                                             |
| `curl: (22) The requested URL returned error: 403`                                         | [安装脚本返回 403](#install-script-returns-html-instead-of-a-shell-script)                                                              |
| `curl: (23)` 或 `curl: (56) Failure writing output to destination`                          | [检查连接或使用替代安装程序](#curl-56-failure-writing-output-to-destination)                                                                   |
| Linux 上安装期间 `Killed`，或 `Installation was killed before it could finish (exit code 137)`    | [释放内存或添加交换空间](#install-killed-on-low-memory-linux-servers)                                                                        |
| `TLS connect error` 或 `SSL/TLS secure channel`                                             | [更新 CA 证书](#tls-or-ssl-connection-errors)                                                                                         |
| `Failed to fetch version` 或无法访问下载服务器                                                       | [检查网络和代理设置](#check-network-connectivity)                                                                                          |
| `irm is not recognized` 或 `&& is not valid`                                                | [对您的 shell 使用正确的命令](#wrong-install-command-on-windows)                                                                            |
| `Cask 'claude-code' is unavailable: No Cask with this name exists`                         | [更新 Homebrew](#homebrew-cask-unavailable-or-outdated)                                                                             |
| `'bash' is not recognized as the name of a cmdlet`                                         | [使用 Windows 安装程序命令](#wrong-install-command-on-windows)                                                                            |
| `A parameter cannot be found that matches parameter name 'fsSL'`                           | [使用 Windows 安装程序命令](#wrong-install-command-on-windows)                                                                            |
| `Claude Code on Windows requires either Git for Windows (for bash) or PowerShell`          | [安装 shell](#claude-code-on-windows-requires-either-git-for-windows-for-bash-or-powershell)                                        |
| `Claude Code does not support 32-bit Windows`                                              | [打开 Windows PowerShell，而不是 x86 条目](#claude-code-does-not-support-32-bit-windows)                                                  |
| `The process cannot access the file ... because it is being used by another process`       | [清除下载文件夹并重试](#the-process-cannot-access-the-file-during-windows-install)                                                          |
| `Error loading shared library`                                                             | [您的系统的二进制变体错误](#linux-musl-or-glibc-binary-mismatch)                                                                              |
| `Illegal instruction`                                                                      | [架构或 CPU 指令集不匹配](#illegal-instruction)                                                                                            |
| WSL 中 `cannot execute binary file: Exec format error`                                      | [WSL1 上的 Exec 格式错误](#exec-format-error-on-wsl1)                                                                                   |
| PowerShell 安装程序完成但 `claude` 未找到或显示旧版本                                                      | [将安装目录添加到您的 PATH](#verify-your-path)，然后打开新终端                                                                                      |
| macOS 上 `dyld: cannot load`、`dyld: Symbol not found` 或 `Abort trap`                        | [二进制不兼容](#dyld-cannot-load-on-macos)                                                                                              |
| `Invoke-Expression: Missing argument in parameter list`                                    | [安装脚本返回 HTML](#install-script-returns-html-instead-of-a-shell-script)                                                             |
| `App unavailable in region`                                                                | Claude Code 在您的国家/地区不可用。请参阅[支持的国家/地区](https://www.anthropic.com/supported-countries)。                                             |
| `unable to get local issuer certificate`                                                   | [配置企业 CA 证书](#tls-or-ssl-connection-errors)                                                                                       |
| `OAuth error` 或 `403 Forbidden`                                                            | [修复身份验证](#login-and-authentication)                                                                                               |
| `Could not load the default credentials` 或 `Could not load credentials from any providers` | [Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 凭证](#bedrock-agent-platform-or-foundry-credentials-not-loading) |
| `ChainedTokenCredential authentication failed` 或 `CredentialUnavailableError`              | [Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 凭证](#bedrock-agent-platform-or-foundry-credentials-not-loading) |
| `API Error: 500`、`529 Overloaded`、`429` 或上面未列出的其他 4xx 和 5xx 错误                             | 请参阅[错误参考](/docs/zh-CN/errors)                                                                                                          |

如果您的问题未列出，请按照下面的诊断检查来缩小原因范围。

<Tip>
  如果您宁愿完全跳过终端，[Claude Code Desktop 应用](/docs/zh-CN/desktop-quickstart)可让您通过图形界面安装和使用 Claude Code。为 [macOS](https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect?utm_source=claude_code\&utm_medium=docs) 或 [Windows](https://claude.com/download?utm_source=claude_code\&utm_medium=docs) 下载它，无需任何命令行设置即可开始编码。在 Linux 上，按照 [Linux 安装说明](/docs/zh-CN/desktop-linux)使用 apt 安装应用。
</Tip>

<h2 id="run-diagnostic-checks">
  运行诊断检查
</h2>

<h3 id="check-network-connectivity">
  检查网络连接
</h3>

安装程序从 `downloads.claude.ai` 下载。验证您可以访问它：

```bash theme={null}
curl -sI https://downloads.claude.ai/claude-code-releases/latest
```

在 PowerShell 中，改为运行 `curl.exe -sI`。PowerShell 将 `curl` 别名为 `Invoke-WebRequest`，它拒绝 `-sI` 标志。

`HTTP/2 200` 行表示您已到达服务器。如果您看不到任何输出、`Could not resolve host` 或连接超时，您的网络正在阻止连接。常见原因：

* 企业防火墙或代理阻止 `downloads.claude.ai`
* 区域网络限制：尝试 VPN 或替代网络
* TLS/SSL 问题：更新您系统的 CA 证书，或检查是否配置了 `HTTPS_PROXY`

如果您在企业代理后面，在安装前设置 `HTTPS_PROXY` 和 `HTTP_PROXY` 为您的代理地址。如果您不知道代理 URL，请向您的 IT 团队询问，或检查您的浏览器代理设置。

此示例设置两个代理变量，然后通过您的代理运行安装程序：

<Tabs>
  <Tab title="macOS/Linux">
    ```bash theme={null}
    export HTTP_PROXY=http://proxy.example.com:8080
    export HTTPS_PROXY=http://proxy.example.com:8080
    curl -fsSL https://claude.ai/install.sh | bash
    ```
  </Tab>

  <Tab title="Windows PowerShell">
    ```powershell theme={null}
    $env:HTTP_PROXY = 'http://proxy.example.com:8080'
    $env:HTTPS_PROXY = 'http://proxy.example.com:8080'
    irm https://claude.ai/install.ps1 | iex
    ```
  </Tab>
</Tabs>

<h3 id="verify-your-path">
  验证您的 PATH
</h3>

如果安装成功但运行 `claude` 时出现 `command not found` 或 `not recognized` 错误，安装目录不在您的 PATH 中。您的 shell 在 PATH 中列出的目录中搜索程序，安装程序在 macOS/Linux 上将 `claude` 放在 `~/.local/bin/claude`，或在 Windows 上放在 `%USERPROFILE%\.local\bin\claude.exe`。

<Note>
  [VS Code 扩展](/docs/zh-CN/vs-code)不会将 `claude` 放在此位置。它在扩展目录内捆绑了一个私有的 CLI 副本，用于其自己的聊天面板，不会将其添加到 PATH。如果您仅安装了扩展，`~/.local/bin/claude` 将不存在。运行[独立安装](/docs/zh-CN/setup)以从终端使用 `claude`，然后继续下面的步骤。
</Note>

通过列出您的 PATH 条目并过滤 `local/bin` 来检查安装目录是否在您的 PATH 中：

<Tabs>
  <Tab title="macOS/Linux">
    ```bash theme={null}
    echo $PATH | tr ':' '\n' | grep -Fx "$HOME/.local/bin"
    ```

    如果这打印 `/Users/you/.local/bin` 或 `/home/you/.local/bin`，该目录在您的 PATH 中，您可以跳到[检查冲突的安装](#check-for-conflicting-installations)。如果没有输出，请将其添加到您的 shell 配置。

    对于 Zsh（macOS 上的默认值）：

    ```bash theme={null}
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
    source ~/.zshrc
    ```

    对于 Bash（大多数 Linux 发行版上的默认值）：

    ```bash theme={null}
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    source ~/.bashrc
    ```

    或者，关闭并重新打开您的终端。

    对于其他 shell（如 fish 或 Nushell），使用您的 shell 自己的配置语法将 `~/.local/bin` 添加到您的 PATH，然后重启您的终端。

    验证修复是否有效：

    ```bash theme={null}
    claude --version
    ```
  </Tab>

  <Tab title="Windows PowerShell">
    ```powershell theme={null}
    $env:PATH -split ';' | Select-String '\.local\\bin'
    ```

    如果没有输出，请将安装目录添加到您的用户 PATH：

    ```powershell theme={null}
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    [Environment]::SetEnvironmentVariable('PATH', "$currentPath;$env:USERPROFILE\.local\bin", 'User')
    ```

    重启您的终端以使更改生效。

    验证修复是否有效：

    ```powershell theme={null}
    claude --version
    ```
  </Tab>

  <Tab title="Windows CMD">
    ```batch theme={null}
    echo %PATH% | findstr /i "local\bin"
    ```

    如果没有输出，打开系统设置，转到环境变量，并将 `%USERPROFILE%\.local\bin` 添加到您的用户 PATH 变量。重启您的终端。

    验证修复是否有效：

    ```batch theme={null}
    claude --version
    ```
  </Tab>
</Tabs>

<h3 id="check-for-conflicting-installations">
  检查冲突的安装
</h3>

多个 Claude Code 安装可能导致版本不匹配或意外行为。检查已安装的内容：

<Tabs>
  <Tab title="macOS/Linux">
    列出在您的 PATH 中找到的所有 `claude` 二进制文件：

    ```bash theme={null}
    which -a claude
    ```

    如果这不打印任何内容，您的 PATH 上还没有 `claude`。返回到[验证您的 PATH](#verify-your-path)。

    检查 `claude` 二进制文件可以来自的三个位置。`~/.local/bin/claude` 是本机安装程序，`~/.claude/local/` 是由较旧版本的 Claude Code 创建的旧版本本地 npm 安装，npm 全局列表显示 `-g` 安装：

    ```bash theme={null}
    ls -la ~/.local/bin/claude
    ```

    一个本机安装显示一个指向 `~/.local/share/claude/versions/` 的符号链接。您在此路径创建的脚本或符号链接是自定义启动程序，[自动更新会将其保留在原位](/docs/zh-CN/setup#auto-updates)。

    如果任一 `ls` 命令打印 `No such file or directory`，这不是错误。这意味着该位置没有安装任何内容，因此继续进行下一个检查。

    ```bash theme={null}
    ls -la ~/.claude/local/
    ```

    ```bash theme={null}
    npm -g ls @anthropic-ai/claude-code 2>/dev/null
    ```
  </Tab>

  <Tab title="Windows PowerShell">
    列出在您的 PATH 中找到的所有 `claude` 二进制文件：

    ```powershell theme={null}
    where.exe claude
    ```

    检查本机安装程序是否放置了二进制文件：

    ```powershell theme={null}
    Test-Path "$env:USERPROFILE\.local\bin\claude.exe"
    ```
  </Tab>
</Tabs>

如果您找到多个安装，只保留一个。macOS/Linux 上 `~/.local/bin/claude` 或 Windows 上 `%USERPROFILE%\.local\bin\claude.exe` 的本机安装是推荐的。删除额外的：

卸载 npm 全局安装：

```bash theme={null}
npm uninstall -g @anthropic-ai/claude-code
```

删除旧版本本地 npm 安装：

```bash theme={null}
rm -rf ~/.claude/local
```

在 Windows 上，使用 PowerShell：

```powershell theme={null}
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\local"
```

在 macOS 上删除 Homebrew 安装。如果您安装了 `claude-code@latest` cask，请替换该名称：

```bash theme={null}
brew uninstall --cask claude-code
```

在 Windows 上删除 WinGet 安装：

```powershell theme={null}
winget uninstall Anthropic.ClaudeCode
```

<h3 id="check-directory-permissions">
  检查目录权限
</h3>

安装程序需要对 macOS 和 Linux 上的 `~/.local/bin/` 和 `~/.claude/` 有写入权限。在 Windows 上，安装位置在 `%USERPROFILE%` 下，默认情况下您的用户可以写入，因此此部分很少适用于那里。

检查目录是否可写：

```bash theme={null}
test -w ~/.local/bin && echo "writable" || echo "not writable"
test -w ~/.claude && echo "writable" || echo "not writable"
```

如果任一目录不可写，请创建安装目录并将您的用户设置为所有者：

```bash theme={null}
sudo mkdir -p ~/.local/bin
sudo chown -R $(whoami) ~/.local
```

<h3 id="verify-the-binary-works">
  验证二进制文件是否有效
</h3>

如果 `claude --version` 打印版本但 `claude` 在启动时崩溃或挂起，请运行这些检查来缩小原因范围。如果 `claude --version` 说命令未找到，请先转到[验证您的 PATH](#verify-your-path)；下面的命令假设 `claude` 在您的 PATH 上。

确认二进制文件存在且可执行：

```bash theme={null}
ls -la "$(command -v claude)"
```

在 Windows 上，使用 PowerShell：

```powershell theme={null}
Get-Command claude | Select-Object Source
```

在 Linux 上，检查缺失的共享库。如果 `ldd` 显示缺失的库，您可能需要安装系统包。在 Alpine Linux 和其他基于 musl 的发行版上，请参阅 [Alpine Linux setup](/docs/zh-CN/setup#alpine-linux-and-musl-based-distributions)。

```bash theme={null}
ldd "$(command -v claude)" | grep "not found"
```

确认二进制文件可以执行：

```bash theme={null}
claude --version
```

<h2 id="common-installation-issues">
  常见安装问题
</h2>

这些是最常见的安装问题及其解决方案。

<h3 id="install-script-returns-html-instead-of-a-shell-script">
  安装脚本返回 HTML 而不是 shell 脚本
</h3>

运行安装命令时，您可能会看到以下错误之一：

```text theme={null}
bash: line 1: syntax error near unexpected token `<'
bash: line 1: `<!DOCTYPE html>'
```

在 PowerShell 上，同样的问题显示为：

```text theme={null}
Invoke-Expression: Missing argument in parameter list.
```

根据请求的路由方式，您可能会看到 403 错误且没有 HTML 正文：

```text theme={null}
curl: (22) The requested URL returned error: 403
```

这些都意味着安装 URL 返回了 HTML 页面或错误状态而不是安装脚本。如果 HTML 页面显示"App unavailable in region"，Claude Code 在您的国家/地区不可用。请参阅 [supported countries](https://www.anthropic.com/supported-countries)。

没有正文的 403 错误通常有相同的原因，但也可能来自企业代理或防火墙阻止下载。如果您在受支持的国家/地区但仍然看到 403，在尝试下面的替代安装程序之前，请先完成 [Check network connectivity](#check-network-connectivity)，因为这些安装程序访问相同的主机。

否则，这可能由于网络问题、区域路由或临时服务中断而发生。

**解决方案：**

1. **使用替代安装方法**：

   在 macOS 上，通过 Homebrew 安装：

   ```bash theme={null}
   brew install --cask claude-code
   ```

   在 Windows 上，通过 WinGet 安装：

   ```powershell theme={null}
   winget install Anthropic.ClaudeCode
   ```

2. **几分钟后重试**：问题通常是暂时的。等待并再次尝试原始命令。

<h3 id="command-not-found-claude-after-installation">
  安装后 `command not found: claude`
</h3>

安装完成但 `claude` 不起作用。确切的错误因平台而异：

| 平台          | 错误消息                                                                   |
| :---------- | :--------------------------------------------------------------------- |
| macOS       | `zsh: command not found: claude`                                       |
| Linux       | `bash: claude: command not found`                                      |
| Windows CMD | `'claude' is not recognized as an internal or external command`        |
| PowerShell  | `claude : The term 'claude' is not recognized as the name of a cmdlet` |

这意味着安装目录不在您的 shell 搜索路径中。请参阅 [Verify your PATH](#verify-your-path) 以获取每个平台上的修复。

<h3 id="curl-56-failure-writing-output-to-destination">
  `curl: (56) Failure writing output to destination`
</h3>

`curl ... | bash` 命令下载脚本并将其传送到 Bash 以执行。此错误以及相关的 `curl: (23) Failure writing output to destination` 意味着 Bash 没有收到完整的脚本。退出代码 56 表示下载本身被中断，退出代码 23 表示 curl 无法将其接收的内容写入管道，通常是因为 Bash 提前退出。

**解决方案：**

1. **检查网络稳定性**：Claude Code 二进制文件托管在 `downloads.claude.ai`。测试您是否可以访问它：
   ```bash theme={null}
   curl -sI https://downloads.claude.ai/claude-code-releases/latest
   ```
   `HTTP/2 200` 行表示您已到达服务器，原始故障可能是间歇性的；重试安装命令。如果您看到 `Could not resolve host` 或连接超时，您的网络正在阻止下载。

2. **尝试替代安装方法**：

   在 macOS 上：

   ```bash theme={null}
   brew install --cask claude-code
   ```

   在 Windows 上：

   ```powershell theme={null}
   winget install Anthropic.ClaudeCode
   ```

<h3 id="homebrew-cask-unavailable-or-outdated">
  Homebrew cask 不可用或过时
</h3>

Homebrew 报告 `Error: Cask 'claude-code' is unavailable: No Cask with this name exists` 当您的 Homebrew cask 索引本地副本早于 cask 的发布时间。刷新索引并重试：

```bash theme={null}
brew update
brew install --cask claude-code
```

如果 Homebrew 安装的 Claude Code 版本比您预期的要旧，通常是相同的过时索引导致的。`claude-code` cask 跟踪稳定频道，通常比最新版本晚约一周；对于最新版本，请改为运行 `brew install --cask claude-code@latest`。请参阅 [Configure release channel](/docs/zh-CN/setup#configure-release-channel) 了解两个 cask 之间的区别。

<h3 id="tls-or-ssl-connection-errors">
  TLS 或 SSL 连接错误
</h3>

诸如 `curl: (35) TLS connect error`、`schannel: next InitializeSecurityContext failed` 或 PowerShell 的 `Could not establish trust relationship for the SSL/TLS secure channel` 之类的错误表示 TLS 握手失败。

**解决方案：**

1. **更新您的系统 CA 证书**：

   在 Ubuntu/Debian 上：

   ```bash theme={null}
   sudo apt-get update && sudo apt-get install ca-certificates
   ```

   在 macOS 上，系统 curl 使用 Keychain 信任存储；更新 macOS 本身会更新根证书。

2. **在 Windows 上，在运行安装程序前在 PowerShell 中启用 TLS 1.2**：
   ```powershell theme={null}
   [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
   irm https://claude.ai/install.ps1 | iex
   ```

3. **检查代理或防火墙干扰**：执行 TLS 检查的企业代理可能导致这些错误，包括 `unable to get local issuer certificate` 和 `SELF_SIGNED_CERT_IN_CHAIN`。对于安装步骤，使用 `--cacert` 将 curl 指向您的企业 CA 包：
   ```bash theme={null}
   curl --cacert /path/to/corporate-ca.pem -fsSL https://claude.ai/install.sh | bash
   ```
   对于安装后的 Claude Code 本身，设置 `NODE_EXTRA_CA_CERTS` 以便 API 请求信任相同的包：
   ```bash theme={null}
   export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem
   ```
   如果您没有证书文件，请向您的 IT 团队询问。您也可以尝试直接连接以确认代理是原因。

4. **在 Windows 上，如果您的网络阻止撤销检查，请切换安装程序**。错误 `CRYPT_E_NO_REVOCATION_CHECK (0x80092012)` 和 `CRYPT_E_REVOCATION_OFFLINE (0x80092013)` 意味着 curl 到达了服务器，但您的网络阻止了证书撤销查询，这在企业防火墙后很常见。添加 curl 的 `--ssl-revoke-best-effort` 标志不会修复此问题：该标志仅适用于下载 `install.cmd` 本身，脚本自己的下载在没有它的情况下运行，因此安装失败并出现相同的错误。改用容许被阻止查询的安装方法。打开 PowerShell 并运行 PowerShell 安装程序，它通过 .NET 下载，当撤销服务器无法访问时不会失败：
   ```powershell theme={null}
   irm https://claude.ai/install.ps1 | iex
   ```
   您也可以使用 `winget install Anthropic.ClaudeCode` 安装，这完全避免了 curl。

<h3 id="failed-to-fetch-version-from-downloads-claude-ai">
  `Failed to fetch version from downloads.claude.ai`
</h3>

安装程序无法访问下载服务器。这通常意味着 `downloads.claude.ai` 在您的网络上被阻止。

**解决方案：**

1. **直接测试连接**：
   ```bash theme={null}
   curl -sI https://downloads.claude.ai/claude-code-releases/latest
   ```

2. **如果在代理后面**，设置 `HTTPS_PROXY` 以便安装程序可以通过它路由。有关详细信息，请参阅 [proxy configuration](/docs/zh-CN/network-config#proxy-configuration)。
   ```bash theme={null}
   export HTTPS_PROXY=http://proxy.example.com:8080
   curl -fsSL https://claude.ai/install.sh | bash
   ```

3. **如果在受限网络上**，尝试不同的网络或 VPN，或使用替代安装方法：

   在 macOS 上：

   ```bash theme={null}
   brew install --cask claude-code
   ```

   在 Windows 上：

   ```powershell theme={null}
   winget install Anthropic.ClaudeCode
   ```

<h3 id="wrong-install-command-on-windows">
  Windows 上的错误安装命令
</h3>

如果您看到 `'irm' is not recognized`、`The token '&&' is not valid`、`A parameter cannot be found that matches parameter name 'fsSL'` 或 `'bash' is not recognized as the name of a cmdlet`，您复制了不同 shell 或操作系统的安装命令。

* **`irm` 未识别**：您在 CMD 中，而不是 PowerShell。您有两个选项：

  通过在开始菜单中搜索"PowerShell"打开 PowerShell，然后运行原始安装命令：

  ```powershell theme={null}
  irm https://claude.ai/install.ps1 | iex
  ```

  或留在 CMD 中并改用 CMD 安装程序：

  ```batch theme={null}
  curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
  ```

* **`&&` 无效**：您在 PowerShell 中但运行了 CMD 安装程序命令。使用 PowerShell 安装程序：
  ```powershell theme={null}
  irm https://claude.ai/install.ps1 | iex
  ```

* **`A parameter cannot be found that matches parameter name 'fsSL'`**：您在 Windows PowerShell 中运行了 macOS/Linux `curl -fsSL ... | bash` 安装程序，其中 `curl` 是 `Invoke-WebRequest` 的别名并拒绝 `-fsSL` 标志。改用 PowerShell 安装程序：
  ```powershell theme={null}
  irm https://claude.ai/install.ps1 | iex
  ```

* **`bash` 未识别**：您在 Windows 上运行了 macOS/Linux 安装程序。改用 PowerShell 安装程序：
  ```powershell theme={null}
  irm https://claude.ai/install.ps1 | iex
  ```

<h3 id="the-process-cannot-access-the-file-during-windows-install">
  `The process cannot access the file` 在 Windows 安装期间
</h3>

如果 PowerShell 安装程序失败并显示 `Failed to download binary: The process cannot access the file ... because it is being used by another process`，安装程序无法写入 `%USERPROFILE%\.claude\downloads`。这通常意味着之前的安装尝试仍在运行，或防病毒软件正在扫描该文件夹中部分下载的二进制文件。

关闭任何其他运行安装程序的 PowerShell 窗口，并等待防病毒扫描释放该文件。然后删除下载文件夹并再次运行安装程序：

```powershell theme={null}
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\downloads"
irm https://claude.ai/install.ps1 | iex
```

<h3 id="install-killed-on-low-memory-linux-servers">
  低内存 Linux 服务器上安装被杀死
</h3>

在安装期间看到 `Killed` 消息通常意味着 Linux 内存不足 (OOM) 杀手终止了 `claude install` 步骤，因为系统内存不足。这在小型 VPS 和云实例上很常见。安装脚本报告原因并以代码 137 退出：

```text theme={null}
Setting up Claude Code...
bash: line 142: 34803 Killed    "$binary_path" install ${TARGET:+"$TARGET"}
Installation was killed before it could finish (exit code 137). This usually means the system ran out of memory.
Claude Code needs roughly 512MB of free memory to install. Free up memory, then run this script again.
```

在 v2.1.200 之前，脚本仅以 shell 的裸 `Killed` 行退出，没有解释。

安装需要大约 512 MB 的可用内存，运行 Claude Code 需要更多。请参阅 [system requirements](/docs/zh-CN/setup#system-requirements)。

**解决方案：**

1. **如果您的服务器 RAM 有限，请添加交换空间**。交换使用磁盘空间作为溢出内存，让安装即使在低物理 RAM 的情况下也能完成。

   创建 2 GB 交换文件并启用它：

   ```bash theme={null}
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

   然后重试安装：

   ```bash theme={null}
   curl -fsSL https://claude.ai/install.sh | bash
   ```

2. **关闭其他进程**以在安装前释放内存。

3. **如果可能，使用更大的实例**。Claude Code 需要至少 4 GB 的 RAM。

<h3 id="install-hangs-in-docker">
  Docker 中安装挂起
</h3>

在 Docker 容器中安装 Claude Code 时，以 root 身份安装到 `/` 可能导致挂起。

**解决方案：**

1. **在运行安装程序前设置工作目录**。从 `/` 运行时，安装程序扫描整个文件系统，这导致过度的内存使用。设置 `WORKDIR` 将扫描限制在小目录：
   ```dockerfile theme={null}
   WORKDIR /tmp
   RUN curl -fsSL https://claude.ai/install.sh | bash
   ```

2. **增加 Docker 内存限制**（如果使用 Docker Desktop）：
   ```bash theme={null}
   docker build --memory=4g .
   ```

<h3 id="claude-desktop-overrides-the-claude-command-on-windows">
  Claude Desktop 在 Windows 上覆盖 `claude` 命令
</h3>

如果您安装了较旧版本的 Claude Desktop，它可能在 `WindowsApps` 目录中注册 `Claude.exe`，其 PATH 优先级高于 Claude Code CLI。运行 `claude` 会打开 Desktop 应用而不是 CLI。

更新 Claude Desktop 到最新版本以修复此问题。

<h3 id="claude-code-on-windows-requires-either-git-for-windows-for-bash-or-powershell">
  Windows 上的 Claude Code 需要 Git for Windows（用于 bash）或 PowerShell
</h3>

Git for Windows 是可选的。Claude Code 在缺少 Git Bash 时使用 [PowerShell tool](/docs/zh-CN/tools-reference#powershell-tool)，因此此错误意味着两个 shell 都未找到。

**如果 PowerShell 从您的 PATH 中缺失**，其默认位置是 `C:\Windows\System32\WindowsPowerShell\v1.0\`。将该目录添加到您的 `PATH`，或安装 [PowerShell 7](https://aka.ms/powershell)，它提供 `pwsh`。

**要改为安装 Git for Windows**，从 [git-scm.com/downloads/win](https://git-scm.com/downloads/win) 下载它。在设置期间，选择"Add to PATH"。安装后重启您的终端。安装它启用了 Bash 工具，在使用基于 Bash 的脚本和工具时很有用。

**如果 Git 已安装**但 Claude Code 找不到它，请在您的 [settings.json file](/docs/zh-CN/settings) 中设置路径：

```json theme={null}
{
  "env": {
    "CLAUDE_CODE_GIT_BASH_PATH": "C:\\Program Files\\Git\\bin\\bash.exe"
  }
}
```

如果您的 Git 安装在其他地方，通过在 PowerShell 中运行 `where.exe git` 找到路径，并使用该目录中的 `bin\bash.exe` 路径。

**如果路径正确且文件存在**但 Claude Code 仍然报告找不到它，端点安全软件（如 AppLocker、Group Policy 软件限制策略或 EDR 代理）可能会干扰。在 v2.1.116 之前的版本中，Claude Code 生成了一个子进程 (`cmd.exe`) 来验证路径，这些策略可能会阻止 — 一个常见的信号是 `cmd.exe /c dir "C:\Program Files\Git\bin\bash.exe"` 在您直接在 PowerShell 中运行时有效，但在由 `claude.exe` 启动时无声地失败。

Claude Code v2.1.116 及更高版本直接检查文件系统，因此请先更新。如果错误在当前版本上仍然存在，请要求您的 IT 团队在您的端点保护策略中将 `claude.exe` 及其生成的进程（包括 `cmd.exe` 和 `bash.exe`）列入白名单。

<h3 id="claude-code-does-not-support-32-bit-windows">
  Claude Code 不支持 32 位 Windows
</h3>

Windows 在开始菜单中包含两个 PowerShell 条目：`Windows PowerShell` 和 `Windows PowerShell (x86)`。x86 条目以 32 位进程运行，即使在 64 位机器上也会触发此错误。要检查您处于哪种情况，请在产生错误的同一窗口中运行此命令：

```powershell theme={null}
[Environment]::Is64BitOperatingSystem
```

如果这打印 `True`，您的操作系统没问题。关闭窗口，打开不带 x86 后缀的 `Windows PowerShell`，然后再次运行安装命令。

如果这打印 `False`，您在 32 位版本的 Windows 上。Claude Code 需要 64 位操作系统。请参阅 [system requirements](/docs/zh-CN/setup#system-requirements)。

<h3 id="linux-musl-or-glibc-binary-mismatch">
  Linux musl 或 glibc 二进制文件不匹配
</h3>

如果在安装后看到关于缺失共享库（如 `libstdc++.so.6` 或 `libgcc_s.so.1`）的错误，安装程序可能为您的系统下载了错误的二进制变体。

```text theme={null}
Error loading shared library libstdc++.so.6: No such file or directory
```

这可能发生在安装了 musl 交叉编译包的基于 glibc 的系统上，导致安装程序将系统误检测为 musl。

**解决方案：**

1. **检查您的系统使用哪个 libc**：
   ```bash theme={null}
   ldd --version 2>&1 | head -1
   ```
   提及 `GNU libc` 或 `GLIBC` 的输出表示 glibc。提及 `musl` 的输出表示 musl。

2. **如果您在 glibc 上但获得了 musl 二进制文件**，删除安装并重新安装。您也可以使用 `https://downloads.claude.ai/claude-code-releases/{VERSION}/manifest.json` 处的清单手动下载正确的二进制文件。使用 `ldd --version` 和 `ls /lib/libc.musl*` 的输出提交 [GitHub issue](https://github.com/anthropics/claude-code/issues)。

3. **如果您实际上在 musl 上**，例如 Alpine Linux，请安装所需的包：
   ```bash theme={null}
   apk add libgcc libstdc++ ripgrep
   ```

<h3 id="illegal-instruction">
  `Illegal instruction`
</h3>

如果运行 `claude` 或安装程序打印 `Illegal instruction`，本机二进制文件使用您的处理器不支持的 CPU 指令。有两个不同的原因。

**架构不匹配。** 安装程序下载了错误的二进制文件，例如在 ARM 服务器上的 x86。在 macOS 或 Linux 上使用 `uname -m` 检查，或在 PowerShell 中使用 `$env:PROCESSOR_ARCHITECTURE`。如果结果与您收到的二进制文件不匹配，请 [file a GitHub issue](https://github.com/anthropics/claude-code/issues) 并提供输出。

**缺失 AVX 指令集。** 如果您的架构正确但仍然看到 `Illegal instruction`，您的 CPU 可能缺少二进制文件需要的 AVX 或其他指令。这影响大约 2013 年之前的英特尔和 AMD 处理器，以及虚拟机（其中虚拟机管理程序不将 AVX 传递给客户机）。

在 VPS 或 VM 上，运行 `grep -m1 -ow avx /proc/cpuinfo`；空结果意味着 AVX 对客户机不可用。

没有本机二进制文件解决方法；跟踪 [issue #50384](https://github.com/anthropics/claude-code/issues/50384) 以获取状态，并在报告时包括您的 CPU 型号（来自 Linux 上的 `grep -m1 "model name" /proc/cpuinfo` 或 macOS 上的 `sysctl -n machdep.cpu.brand_string`）。

替代安装方法下载相同的本机二进制文件，不会解决任一原因。

<h3 id="dyld-cannot-load-on-macos">
  macOS 上的 `dyld: cannot load`
</h3>

如果在安装期间看到 `dyld: cannot load`、`dyld: Symbol not found` 或 `Abort trap: 6`，二进制文件与您的 macOS 版本或硬件不兼容。

```text theme={null}
dyld: cannot load 'claude-2.1.42-darwin-x64' (load command 0x80000034 is unknown)
Abort trap: 6
```

引用 `libicucore` 的 `Symbol not found` 错误也表示您的 macOS 版本比二进制文件支持的版本更旧：

```text theme={null}
dyld: Symbol not found: _ubrk_clone
  Referenced from: claude-darwin-x64 (which was built for Mac OS X 13.0)
  Expected in: /usr/lib/libicucore.A.dylib
```

**解决方案：**

1. **检查您的 macOS 版本**：Claude Code 需要 macOS 13.0 或更高版本。打开 Apple 菜单并选择"About This Mac"以检查您的版本。

2. **更新 macOS**（如果您在较旧版本上）。二进制文件使用较旧 macOS 版本不支持的加载命令和系统库。Homebrew 等替代安装方法下载相同的二进制文件，不会解决此错误。

<h3 id="exec-format-error-on-wsl1">
  WSL1 上的 `Exec format error`
</h3>

如果在 WSL 中运行 `claude` 打印 `cannot execute binary file: Exec format error`，您在 WSL1 上并遇到了在 [issue #38788](https://github.com/anthropics/claude-code/issues/38788) 中跟踪的已知本机二进制文件回归。二进制文件的程序头以 WSL1 的加载程序无法处理的方式改变。

最干净的修复是从 PowerShell 将您的发行版转换为 WSL2：

```powershell theme={null}
wsl --set-version <DistroName> 2
```

如果您需要留在 WSL1 上，通过动态链接器调用二进制文件。将此函数添加到 WSL 内的 `~/.bashrc`，如果您的主目录不同，请替换路径：

```bash theme={null}
claude() {
  /lib64/ld-linux-x86-64.so.2 "$(readlink -f "$HOME/.local/bin/claude")" "$@"
}
```

然后运行 `source ~/.bashrc` 并重试 `claude`。

<h3 id="npm-install-errors-in-wsl">
  WSL 中的 npm 安装错误
</h3>

如果您在 WSL 内使用 `npm install -g` 安装了 Claude Code，这些问题适用。如果您使用了 [native installer](/docs/zh-CN/setup)，请跳过此部分。

**OS 或平台检测问题。** 如果 npm 在安装期间报告平台不匹配，WSL 可能正在选择 Windows `npm`。首先运行 `npm config set os linux`，然后使用 `npm install -g @anthropic-ai/claude-code --force` 安装。不要使用 `sudo`。

**运行 `claude` 时 `exec: node: not found`。** 您的 WSL 环境可能使用 Node.js 的 Windows 安装。使用 `which npm` 和 `which node` 确认：以 `/mnt/c/` 开头的路径是 Windows 二进制文件，而 Linux 路径以 `/usr/` 开头。要修复此问题，通过您的 Linux 发行版的包管理器或通过 [`nvm`](https://github.com/nvm-sh/nvm) 安装 Node。

**nvm 版本冲突。** 如果您在 WSL 和 Windows 中都安装了 nvm，在 WSL 中切换 Node 版本可能会中断，因为 WSL 默认导入 Windows PATH，Windows nvm 优先。最常见的原因是 nvm 未在您的 shell 中加载。将 nvm 加载程序添加到 `~/.bashrc` 或 `~/.zshrc`：

```bash theme={null}
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

或在您的当前会话中加载它：

```bash theme={null}
source ~/.nvm/nvm.sh
```

如果 nvm 已加载但 Windows 路径仍然优先，显式预置您的 Linux Node 路径：

```bash theme={null}
export PATH="$HOME/.nvm/versions/node/$(node -v)/bin:$PATH"
```

<Warning>
  避免通过 `appendWindowsPath = false` 禁用 Windows PATH 导入，因为这会破坏从 WSL 调用 Windows 可执行文件的能力。同样，如果您为 Windows 开发使用 Node.js，请避免从 Windows 卸载它。
</Warning>

<h3 id="permission-errors-during-installation">
  安装期间的权限错误
</h3>

如果本机安装程序因权限错误而失败，目标目录可能不可写。请参阅 [Check directory permissions](#check-directory-permissions)。

如果您之前使用 npm 安装并遇到 npm 特定的权限错误，请切换到本机安装程序：

```bash theme={null}
curl -fsSL https://claude.ai/install.sh | bash
```

<h3 id="native-binary-not-found-after-npm-install">
  npm 安装后未找到本机二进制文件
</h3>

`@anthropic-ai/claude-code` npm 包通过每个平台的可选依赖项（如 `@anthropic-ai/claude-code-darwin-arm64`）拉入本机二进制文件。如果在安装后运行 `claude` 打印 `Could not find native binary package "@anthropic-ai/claude-code-<platform>"`，请检查以下原因：

* **可选依赖项被禁用。** 从您的 npm 安装命令中删除 `--omit=optional`，从 pnpm 中删除 `--no-optional`，或从 yarn 中删除 `--ignore-optional`，并检查 `.npmrc` 是否未设置 `optional=false`。然后重新安装。本机二进制文件仅作为可选依赖项提供，因此如果跳过它，就没有 JavaScript 回退。
* **不支持的平台。** 预构建的二进制文件为 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`linux-x64-musl`、`linux-arm64-musl`、`win32-x64` 和 `win32-arm64` 发布。Claude Code 不为其他平台提供二进制文件；请参阅 [system requirements](/docs/zh-CN/setup#system-requirements)。在 FreeBSD 上，安装程序报告平台不受支持。在 v2.1.205 之前，它将 FreeBSD 视为 Linux 并下载了无法运行的二进制文件。
* **企业 npm 镜像缺少平台包。** 确保您的注册表除了元包外还镜像所有八个 `@anthropic-ai/claude-code-*` 平台包。

使用 `--ignore-scripts` 安装不会触发此错误。跳过链接二进制文件到位的 postinstall 步骤，因此 Claude Code 回退到在每次启动时定位和生成平台二进制文件的包装器。这有效但启动速度较慢；使用启用的脚本重新安装以进行直接执行。

<h2 id="login-and-authentication">
  登录和身份验证
</h2>

这些部分解决登录失败、OAuth 错误和令牌问题。

<h3 id="reset-your-login">
  重置您的登录
</h3>

当登录失败且原因不明显时，干净的重新身份验证可以解决大多数情况：

1. 运行 `/logout` 完全注销
2. 关闭 Claude Code
3. 使用 `claude` 重启并再次完成身份验证过程

如果浏览器在登录期间不会自动打开，按 `c` 将 OAuth URL 复制到您的剪贴板，然后手动将其粘贴到浏览器中。当 URL 在狭窄或 SSH 终端中跨行换行且无法直接点击时，这也有效。

<h3 id="oauth-error-invalid-code">
  OAuth 错误：无效代码
</h3>

如果您看到 `OAuth error: Invalid code. Please make sure the full code was copied`，登录代码已过期或在复制粘贴期间被截断。

**解决方案：**

* 按 Enter 重试，并在浏览器打开后快速完成登录
* 如果浏览器不会自动打开，输入 `c` 复制完整 URL
* 如果使用远程/SSH 会话，浏览器可能在错误的机器上打开。复制终端中显示的 URL 并在您的本地浏览器中打开它。

<h3 id="403-forbidden-after-login">
  登录后 403 Forbidden
</h3>

如果登录后看到 `API Error: 403 {"error":{"type":"forbidden","message":"Request not allowed"}}`：

* **Claude Pro/Max 用户**：在 [claude.ai/settings](https://claude.ai/settings) 验证您的订阅是否有效
* **Anthropic Console 用户**：确认您的账户具有"Claude Code"或"Developer"角色。管理员在 Anthropic Console 的"Settings → Members"中分配此角色。
* **在代理后面**：企业代理可能干扰 API 请求。有关代理设置，请参阅 [network configuration](/docs/zh-CN/network-config)。

<h3 id="this-organization-has-been-disabled-with-an-active-subscription">
  此组织已被禁用，但有活跃订阅
</h3>

如果您看到 `API Error: 400 ... "This organization has been disabled"`，尽管有活跃的 Claude 订阅，`ANTHROPIC_API_KEY` 环境变量正在覆盖您的订阅。这通常发生在来自前一个雇主或项目的旧 API 密钥仍在您的 shell 配置文件中设置时。

当 `ANTHROPIC_API_KEY` 存在且您已批准它时，Claude Code 使用该密钥而不是您的订阅的 OAuth 凭证。在使用 `-p` 标志的非交互模式下，当存在时始终使用该密钥。有关完整的解决顺序，请参阅 [authentication precedence](/docs/zh-CN/authentication#authentication-precedence)。

要改用您的订阅，请取消设置环境变量并从您的 shell 配置文件中删除它：

```bash theme={null}
unset ANTHROPIC_API_KEY
claude
```

检查 `~/.zshrc`、`~/.bashrc` 或 `~/.profile` 中的 `export ANTHROPIC_API_KEY=...` 行并删除它们以使更改永久生效。在 Windows 上，检查您的 PowerShell 配置文件（位于 `$PROFILE`）和您的用户环境变量中的 `ANTHROPIC_API_KEY`。在 Claude Code 内运行 `/status` 以确认哪种身份验证方法处于活跃状态。

<h3 id="oauth-login-fails-in-wsl2-ssh-or-containers">
  OAuth 登录在 WSL2、SSH 或容器中失败
</h3>

当 Claude Code 在 WSL2 中运行、通过 SSH 在远程机器上运行或在容器内运行时，浏览器通常在不同的主机上打开，其重定向无法到达 Claude Code 的本地回调服务器。登录后，浏览器显示登录代码而不是自动重定向回来。将该代码粘贴到终端的 `Paste code here if prompted` 提示处以完成登录。

如果浏览器根本不从 WSL2 打开，请将 `BROWSER` 环境变量设置为您的 Windows 浏览器路径：

```bash theme={null}
export BROWSER="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
claude
```

或者，在交互式登录提示处按 `c` 复制 OAuth URL，或复制 `claude auth login` 打印的 URL，并在您的本地机器上的浏览器中打开它。

如果将代码粘贴到交互式提示中没有任何反应，您的终端的粘贴绑定可能无法到达输入字段。尝试您的终端的替代粘贴快捷键，通常在 Windows Terminal 中是右键单击或 Shift+Insert，或改用 `claude auth login`，它从标准输入读取粘贴的代码：

```bash theme={null}
claude auth login
```

此回退也适用于本机 Windows 或任何将粘贴到交互式提示中失败的终端。

<h3 id="not-logged-in-or-token-expired">
  未登录或令牌已过期
</h3>

如果 Claude Code 在会话后提示您再次登录，您的 OAuth 令牌可能已过期。

运行 `/login` 重新身份验证。如果这经常发生，检查您的系统时钟是否准确，因为令牌验证取决于正确的时间戳。

在 macOS 上，当 Keychain 被锁定或其密码与您的账户密码不同步时，登录也可能失败，这会阻止 Claude Code 保存凭证。运行 `claude doctor` 检查 Keychain 访问。要手动解锁 Keychain，请运行 `security unlock-keychain ~/Library/Keychains/login.keychain-db`。如果解锁无法帮助，打开 Keychain Access，选择 `login` keychain，并选择"Edit > Change Password for Keychain "login""以将其与您的账户密码重新同步。

<h3 id="bedrock-agent-platform-or-foundry-credentials-not-loading">
  Bedrock、Agent Platform 或 Foundry 凭证未加载
</h3>

如果您配置了 Claude Code 以使用云提供商，并在 Amazon Bedrock 上看到 `Could not load credentials from any providers`、在 Google Cloud 的 Agent Platform 上看到 `Could not load the default credentials` 或在 Microsoft Foundry 上看到 `ChainedTokenCredential authentication failed`，您的云提供商 CLI 可能在当前 shell 中未进行身份验证。

对于 Amazon Bedrock，确认您的 AWS 凭证有效：

```bash theme={null}
aws sts get-caller-identity
```

对于 Google Cloud 的 Agent Platform，确认 `ANTHROPIC_VERTEX_PROJECT_ID` 和 `CLOUD_ML_REGION` 在您的 shell 中设置，然后设置应用默认凭证：

```bash theme={null}
gcloud auth application-default login
```

对于 Microsoft Foundry，确认 `ANTHROPIC_FOUNDRY_API_KEY` 已设置，或使用 Azure CLI 登录以便默认凭证链可以找到您的账户：

```bash theme={null}
az login
```

如果凭证在您的终端中有效但在 VS Code 或 JetBrains 扩展中无效，IDE 进程可能未继承您的 shell 环境。在 IDE 自己的设置中设置提供商环境变量，或从已导出它们的终端启动 IDE。

有关完整的提供商设置，请参阅 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud 的 Agent Platform](/docs/zh-CN/google-vertex-ai) 或 [Microsoft Foundry](/docs/zh-CN/microsoft-foundry)。

<h2 id="still-stuck">
  仍然卡住
</h2>

如果上述任何方法都无法解决您的问题：

1. 检查 [GitHub repository](https://github.com/anthropics/claude-code/issues) 以了解已知问题，或使用您的操作系统、您运行的安装命令和完整错误输出打开新问题
2. 如果 `claude --version` 有效但其他内容有问题，运行 `claude doctor` 以获取自动诊断报告
3. 如果您可以启动会话，在 Claude Code 内使用 `/feedback` 报告问题
