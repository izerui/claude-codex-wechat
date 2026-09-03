> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 高级设置

> Claude Code 的系统要求、特定平台安装、版本管理和卸载。

本页面涵盖系统要求、特定平台安装详情、更新和卸载。有关首次会话的引导式演练，请参阅[快速入门](/docs/zh-CN/quickstart)。如果您从未使用过终端，请参阅[终端指南](/docs/zh-CN/terminal-guide)。

<h2 id="system-requirements">
  系统要求
</h2>

Claude Code 在以下平台和配置上运行：

* **操作系统**：
  * macOS 13.0+
  * Windows 10 1809+ 或 Windows Server 2019+
  * Ubuntu 20.04+
  * Debian 10+
  * Alpine Linux 3.19+
* **硬件**：4 GB+ RAM、x64 或 ARM64 处理器
* **网络**：需要互联网连接。请参阅[网络配置](/docs/zh-CN/network-config#network-access-requirements)。
* **Shell**：Bash、Zsh、PowerShell 或 CMD。
* **位置**：[Anthropic 支持的国家/地区](https://www.anthropic.com/supported-countries)

<h3 id="additional-dependencies">
  其他依赖项
</h3>

* **ripgrep**：通常包含在 Claude Code 中。如果搜索失败，请参阅[搜索故障排除](/docs/zh-CN/troubleshooting#search-and-discovery-issues)。

<h2 id="install-claude-code">
  安装 Claude Code
</h2>

<Tip>
  更喜欢图形界面？[桌面应用](/docs/zh-CN/desktop-quickstart)让您无需使用终端即可使用 Claude Code。下载适用于 [macOS](https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect?utm_source=claude_code\&utm_medium=docs)、[Windows](https://claude.com/download?utm_source=claude_code\&utm_medium=docs) 或 [Linux](/docs/zh-CN/desktop-linux) 的版本。

  初次使用终端？请参阅[终端指南](/docs/zh-CN/terminal-guide)获取分步说明。
</Tip>

To install Claude Code, use one of the following methods:

<Tabs>
  <Tab title="Native Install (Recommended)">
    **macOS, Linux, WSL:**

    ```bash theme={null}
    curl -fsSL https://claude.ai/install.sh | bash
    ```

    **Windows PowerShell:**

    ```powershell theme={null}
    irm https://claude.ai/install.ps1 | iex
    ```

    **Windows CMD:**

    ```batch theme={null}
    curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
    ```

    If you see `The token '&&' is not a valid statement separator`, you're in PowerShell, not CMD. If you see `'irm' is not recognized as an internal or external command`, you're in CMD, not PowerShell. Your prompt shows `PS C:\` when you're in PowerShell and `C:\` without the `PS` when you're in CMD.

    If the install command fails with `syntax error near unexpected token '<'`, a `403`, or another curl error, see [Troubleshoot installation](/docs/en/troubleshoot-install#find-your-error) to match the error to a fix and for alternative install methods.

    [Git for Windows](https://git-scm.com/downloads/win) is recommended on native Windows so Claude Code can use the Bash tool. If Git for Windows is not installed, Claude Code uses PowerShell as the shell tool instead. WSL setups do not need Git for Windows.

    <Info>
      Native installations automatically update in the background to keep you on the latest version.
    </Info>
  </Tab>

  <Tab title="Homebrew">
    ```bash theme={null}
    brew install --cask claude-code
    ```

    Homebrew offers two casks. `claude-code` tracks the stable release channel, which is typically about a week behind and skips releases with major regressions. `claude-code@latest` tracks the latest channel and receives new versions as soon as they ship.

    <Info>
      Homebrew installations do not auto-update. Run `brew upgrade claude-code` or `brew upgrade claude-code@latest`, depending on which cask you installed, to get the latest features and security fixes.
    </Info>
  </Tab>

  <Tab title="WinGet">
    ```powershell theme={null}
    winget install Anthropic.ClaudeCode
    ```

    <Info>
      WinGet installations do not auto-update. Run `winget upgrade Anthropic.ClaudeCode` periodically to get the latest features and security fixes.
    </Info>
  </Tab>
</Tabs>

You can also install with [apt, dnf, or apk](/docs/en/setup#install-with-linux-package-managers) on Debian, Fedora, RHEL, and Alpine.

安装完成后，在您要使用的项目中打开终端并启动 Claude Code：

```bash theme={null}
claude
```

如果在安装过程中遇到任何问题，请参阅[故障排除安装和登录](/docs/zh-CN/troubleshoot-install)。

<h3 id="set-up-on-windows">
  在 Windows 上设置
</h3>

您可以在 Windows 上原生运行 Claude Code，也可以在 WSL 中运行。根据您的项目位置和所需的功能进行选择：

| 选项         | 需要                                                          | [沙箱](/docs/zh-CN/sandboxing) | 何时使用             |
| ---------- | ----------------------------------------------------------- | ----------------------- | ---------------- |
| 原生 Windows | 无；[Git for Windows](https://git-scm.com/downloads/win) 是可选的 | 不支持                     | Windows 原生项目和工具  |
| WSL 2      | WSL 2 已启用                                                   | 支持                      | Linux 工具链或沙箱命令执行 |
| WSL 1      | WSL 1 已启用                                                   | 不支持                     | 如果 WSL 2 不可用     |

**选项 1：原生 Windows**

从 PowerShell 或 CMD 运行安装命令。您无需以管理员身份运行。安装 [Git for Windows](https://git-scm.com/downloads/win) 是可选的。它通过提供 Git Bash 来启用 [Bash 工具](/docs/zh-CN/tools-reference#bash-tool-behavior)。

无论您从 PowerShell 还是 CMD 安装，只会影响您运行的安装命令。您的提示在 PowerShell 中显示为 `PS C:\Users\YourName>`，在 CMD 中显示为 `C:\Users\YourName>`（不带 `PS`）。如果您是终端新手，[终端指南](/docs/zh-CN/terminal-guide#windows)会逐步讲解每个步骤。

安装后，从任何终端启动 `claude`。

* **不使用 Git for Windows**，Claude Code 通过 [PowerShell 工具](/docs/zh-CN/tools-reference#powershell-tool)运行 shell 命令。
* **使用 Git for Windows**，Claude Code 为 [Bash 工具](/docs/zh-CN/tools-reference#bash-tool-behavior)使用 Git Bash。如果 Claude Code 找不到 Git Bash，请在您的 [settings.json 文件](/docs/zh-CN/settings)中设置路径：

  ```json theme={null}
  {
    "env": {
      "CLAUDE_CODE_GIT_BASH_PATH": "C:\\Program Files\\Git\\bin\\bash.exe"
    }
  }
  ```

安装 Git for Windows 后，PowerShell 工具正在逐步推出作为 Bash 的额外选项。设置 `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` 以选择加入或 `0` 以选择退出。有关设置和限制，请参阅 [PowerShell 工具](/docs/zh-CN/tools-reference#powershell-tool)。

**选项 2：WSL**

打开您的 WSL 发行版并从上面的[安装说明](#install-claude-code)中运行 Linux 安装程序。您在 WSL 终端内安装和启动 `claude`，而不是从 PowerShell 或 CMD。

<h3 id="alpine-linux-and-musl-based-distributions">
  Alpine Linux 和基于 musl 的发行版
</h3>

原生安装程序在 Alpine 和其他基于 musl/uClibc 的发行版上需要 `libgcc`、`libstdc++` 和 `ripgrep`。使用您的发行版的包管理器安装这些，然后设置 `USE_BUILTIN_RIPGREP=0`。

此示例在 Alpine 上安装所需的包：

```bash theme={null}
apk add libgcc libstdc++ ripgrep
```

然后在您的 [`settings.json`](/docs/zh-CN/settings#available-settings) 文件中将 `USE_BUILTIN_RIPGREP` 设置为 `0`：

```json theme={null}
{
  "env": {
    "USE_BUILTIN_RIPGREP": "0"
  }
}
```

<h2 id="verify-your-installation">
  验证您的安装
</h2>

安装后，确认 Claude Code 正常工作：

```bash theme={null}
claude --version
```

如果此命令失败并显示 `command not found` 或其他错误，请参阅[排查安装和登录问题](/docs/zh-CN/troubleshoot-install)。

要更详细地检查您的安装和配置，请运行 [`claude doctor`](/docs/zh-CN/troubleshooting#get-more-help)：

```bash theme={null}
claude doctor
```

<h2 id="authenticate">
  身份验证
</h2>

Claude Code 需要 Pro、Max、Team、Enterprise 或 Console 账户。免费的 Claude.ai 计划不包括 Claude Code 访问权限。您也可以通过第三方 API 提供商（如 [Amazon Bedrock](/docs/zh-CN/amazon-bedrock)、[Google Cloud's Agent Platform](/docs/zh-CN/google-vertex-ai) 或 [Microsoft Foundry](/docs/zh-CN/microsoft-foundry)）使用 Claude Code。

安装后，通过运行 `claude` 并按照浏览器提示登录。有关所有账户类型和团队设置选项，请参阅[身份验证](/docs/zh-CN/authentication)。

<h2 id="update-claude-code">
  更新 Claude Code
</h2>

原生安装会在后台自动更新。您可以[配置发布渠道](#configure-release-channel)来控制您是立即接收更新还是按延迟的稳定计划接收更新，或者[完全禁用自动更新](#disable-auto-updates)。Homebrew、WinGet 和[Linux 包管理器](#install-with-linux-package-managers)安装默认需要手动更新。

<h3 id="auto-updates">
  自动更新
</h3>

Claude Code 在启动时和运行时定期检查更新。更新在后台下载和安装，然后在您下次启动 Claude Code 时生效。

运行 `claude doctor` 以查看最近一次更新尝试的结果。

在 macOS 和 Linux 上，原生安装程序将启动器作为 `~/.local/bin/claude` 处的符号链接管理到 `~/.local/share/claude/versions/`。如果您将该启动器替换为您自己的脚本或符号链接，自动更新和 `claude update` 会将其保留在原位：新版本仍然安装在 `versions/` 目录下，您的启动器决定运行哪个版本。在 v2.1.207 之前，自动更新程序在每次更新时都会将该路径处的自定义启动器替换为其自己的符号链接。

使用自定义启动器，Claude Code 也会在磁盘上保留每个已安装的版本，因为它无法判断启动器需要哪个版本。`claude doctor` 报告原生安装程序未创建的启动器。

要让 Claude Code 再次管理启动器，请删除 `~/.local/bin/claude` 并运行 `claude update`。

如果 npm 全局安装因为 npm 全局目录不可写而无法自动更新，Claude Code 会在启动时显示一次性通知，`claude doctor` 会列出可用的修复。有关详细信息，请参阅[安装期间的权限错误](/docs/zh-CN/troubleshoot-install#permission-errors-during-installation)。

<Note>
  Homebrew、WinGet、apt、dnf 和 apk 安装默认不会自动更新；请参阅下文以选择加入 Homebrew 和 WinGet。要手动升级 Homebrew，请运行 `brew upgrade claude-code` 或 `brew upgrade claude-code@latest`，具体取决于您安装的 cask。对于 WinGet，请运行 `winget upgrade Anthropic.ClaudeCode`。对于 Linux 包管理器，请参阅[使用 Linux 包管理器安装](#install-with-linux-package-managers)中的升级命令。

  要让 Claude Code 在 Homebrew 或 WinGet 上为您运行升级命令，请将 [`CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE`](/docs/zh-CN/env-vars) 设置为 `1`。Claude Code 随后会在新版本可用时在后台运行升级，并在成功时显示重启提示。升级仅针对 Claude Code 包，不会影响您已安装的其他软件。

  在 WinGet 上，当 Claude Code 运行时升级可能会失败，因为 Windows 会锁定可执行文件。在这种情况下，Claude Code 会改为显示手动命令。apt、dnf 和 apk 继续需要手动升级，因为这些命令需要提升的权限。

  **已知问题**：Claude Code 可能会在新版本在这些包管理器中可用之前通知您有更新。如果升级失败，请稍候后重试。

  Homebrew 在升级后会在磁盘上保留旧版本。定期运行 `brew cleanup` 以回收磁盘空间。
</Note>

<h3 id="configure-release-channel">
  配置发布渠道
</h3>

使用 `autoUpdatesChannel` 设置控制 Claude Code 为自动更新和 `claude update` 遵循的发布渠道：

* `"latest"`，默认值：在新功能发布后立即接收
* `"stable"`：使用通常约一周前的版本，跳过有重大回归的发布

通过 `/config` → **自动更新渠道**配置此项，或将其添加到您的 [settings.json 文件](/docs/zh-CN/settings)：

```json theme={null}
{
  "autoUpdatesChannel": "stable"
}
```

对于企业部署，您可以使用[托管设置](/docs/zh-CN/permissions#managed-settings)在整个组织中强制执行一致的发布渠道。

Homebrew 安装通过 cask 名称而不是此设置来选择渠道：`claude-code` 跟踪稳定版，`claude-code@latest` 跟踪最新版。

<h3 id="pin-a-minimum-version">
  固定最低版本
</h3>

`minimumVersion` 设置建立了一个下限。后台自动更新和 `claude update` 拒绝安装低于此值的任何版本，因此如果您已经在较新的 `"latest"` 构建上，切换到 `"stable"` 渠道不会降级您。

通过 `/config` 从 `"latest"` 切换到 `"stable"` 会提示您选择保留当前版本或允许降级。选择保留会将 `minimumVersion` 设置为该版本。切换回 `"latest"` 会清除它。

将其添加到您的 [settings.json 文件](/docs/zh-CN/settings)以显式固定下限：

```json theme={null}
{
  "autoUpdatesChannel": "stable",
  "minimumVersion": "2.1.100"
}
```

在[托管设置](/docs/zh-CN/permissions#managed-settings)中，这会强制执行用户和项目设置无法覆盖的组织范围最低版本。

`minimumVersion` 固定仅约束更新。要使 Claude Code 拒绝在版本范围外启动，请改为使用托管设置 `requiredMinimumVersion` 和 `requiredMaximumVersion`。更新也会遵守 `requiredMaximumVersion` 上限。请参阅[可用设置](/docs/zh-CN/settings#available-settings)。

<h3 id="disable-auto-updates">
  禁用自动更新
</h3>

在您的 [`settings.json`](/docs/zh-CN/settings#available-settings) 文件的 `env` 键中将 `DISABLE_AUTOUPDATER` 设置为 `"1"`：

```json theme={null}
{
  "env": {
    "DISABLE_AUTOUPDATER": "1"
  }
}
```

`DISABLE_AUTOUPDATER` 仅停止后台检查；`claude update` 和 `claude install` 仍然有效。要阻止所有更新路径（包括手动更新），请改为设置 [`DISABLE_UPDATES`](/docs/zh-CN/env-vars)。当您通过自己的渠道分发 Claude Code 并需要用户保持在您提供的版本上时，请使用此选项。

<h3 id="update-manually">
  手动更新
</h3>

要立即应用更新而不等待下一次后台检查，请运行：

```bash theme={null}
claude update
```

<h2 id="advanced-installation-options">
  高级安装选项
</h2>

这些选项用于版本固定、Linux 包管理器、npm 和验证二进制完整性。

<h3 id="install-a-specific-version">
  安装特定版本
</h3>

原生安装程序接受特定版本号或发布渠道（`latest` 或 `stable`）。您在安装时选择的渠道将成为自动更新的默认值。有关更多信息，请参阅[配置发布渠道](#configure-release-channel)。

要安装最新版本（默认）：

<Tabs>
  <Tab title="macOS、Linux、WSL">
    ```bash theme={null}
    curl -fsSL https://claude.ai/install.sh | bash
    ```
  </Tab>

  <Tab title="Windows PowerShell">
    ```powershell theme={null}
    irm https://claude.ai/install.ps1 | iex
    ```
  </Tab>

  <Tab title="Windows CMD">
    ```batch theme={null}
    curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
    ```
  </Tab>
</Tabs>

要安装稳定版本：

<Tabs>
  <Tab title="macOS、Linux、WSL">
    ```bash theme={null}
    curl -fsSL https://claude.ai/install.sh | bash -s stable
    ```
  </Tab>

  <Tab title="Windows PowerShell">
    ```powershell theme={null}
    & ([scriptblock]::Create((irm https://claude.ai/install.ps1))) stable
    ```
  </Tab>

  <Tab title="Windows CMD">
    ```batch theme={null}
    curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd stable && del install.cmd
    ```
  </Tab>
</Tabs>

要安装特定版本号：

<Tabs>
  <Tab title="macOS、Linux、WSL">
    ```bash theme={null}
    curl -fsSL https://claude.ai/install.sh | bash -s 2.1.89
    ```
  </Tab>

  <Tab title="Windows PowerShell">
    ```powershell theme={null}
    & ([scriptblock]::Create((irm https://claude.ai/install.ps1))) 2.1.89
    ```
  </Tab>

  <Tab title="Windows CMD">
    ```batch theme={null}
    curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd 2.1.89 && del install.cmd
    ```
  </Tab>
</Tabs>

<h3 id="install-with-linux-package-managers">
  使用 Linux 包管理器安装
</h3>

Claude Code 发布已签名的 apt、dnf 和 apk 存储库。每个存储库提供两个渠道：`stable` 提供通常约一周前的版本，跳过有重大回归的发布，`latest` 在每个发布发布时立即提供。以下命令配置 `stable` 渠道，适合大多数用户；每个选项卡还显示 `latest` 存储库 URL。包管理器安装不会通过 Claude Code 自动更新；更新通过您的正常系统升级工作流程进行。

所有存储库都使用 [Claude Code 发布签名密钥](#binary-integrity-and-code-signing)进行签名。在信任密钥之前，请按照每个选项卡中的说明验证它。

<Tabs>
  <Tab title="apt">
    适用于 Debian 和 Ubuntu。以下安装命令使用 `curl` 下载签名密钥，新安装的 Debian 和 Ubuntu 可能不包含此命令。如果下载失败并显示 `sudo: curl: command not found`，请先安装 curl：

    ```bash theme={null}
    sudo apt install curl
    ```

    以下命令配置 `stable` 渠道：

    ```bash theme={null}
    sudo install -d -m 0755 /etc/apt/keyrings
    sudo curl -fsSL https://downloads.claude.ai/keys/claude-code.asc \
      -o /etc/apt/keyrings/claude-code.asc
    echo "deb [signed-by=/etc/apt/keyrings/claude-code.asc] https://downloads.claude.ai/claude-code/apt/stable stable main" \
      | sudo tee /etc/apt/sources.list.d/claude-code.list
    sudo apt update
    sudo apt install claude-code
    ```

    要改用 `latest` 渠道，URL 路径和套件名称都会改变。使用此 `deb` 行：

    ```bash theme={null}
    echo "deb [signed-by=/etc/apt/keyrings/claude-code.asc] https://downloads.claude.ai/claude-code/apt/latest latest main" \
      | sudo tee /etc/apt/sources.list.d/claude-code.list
    ```

    在信任之前验证 GPG 密钥指纹：`gpg --show-keys /etc/apt/keyrings/claude-code.asc` 应该报告 `31DD DE24 DDFA B679 F42D 7BD2 BAA9 29FF 1A7E CACE`。

    要稍后升级，请运行 `sudo apt update && sudo apt upgrade claude-code`。
  </Tab>

  <Tab title="dnf">
    适用于 Fedora 和 RHEL。以下命令配置 `stable` 渠道：

    ```bash theme={null}
    sudo tee /etc/yum.repos.d/claude-code.repo <<'EOF'
    [claude-code]
    name=Claude Code
    baseurl=https://downloads.claude.ai/claude-code/rpm/stable
    enabled=1
    gpgcheck=1
    gpgkey=https://downloads.claude.ai/keys/claude-code.asc
    EOF
    sudo dnf install claude-code
    ```

    要改用 `latest` 渠道，将 `baseurl` 设置为 `latest` 存储库：

    ```ini theme={null}
    baseurl=https://downloads.claude.ai/claude-code/rpm/latest
    ```

    dnf 在首次安装时下载密钥并提示您确认指纹。在接受之前验证它与 `31DD DE24 DDFA B679 F42D 7BD2 BAA9 29FF 1A7E CACE` 匹配。

    要稍后升级，请运行 `sudo dnf upgrade claude-code`。
  </Tab>

  <Tab title="apk">
    适用于 Alpine Linux。以下命令配置 `stable` 渠道：

    ```sh theme={null}
    wget -O /etc/apk/keys/claude-code.rsa.pub \
      https://downloads.claude.ai/keys/claude-code.rsa.pub
    echo "https://downloads.claude.ai/claude-code/apk/stable" >> /etc/apk/repositories
    apk add claude-code
    ```

    要切换到 `latest` 渠道，删除 `stable` 存储库行并添加 `latest` 存储库：

    ```sh theme={null}
    sed -i '\|downloads.claude.ai/claude-code/apk/stable|d' /etc/apk/repositories
    echo "https://downloads.claude.ai/claude-code/apk/latest" >> /etc/apk/repositories
    ```

    使用 `sha256sum /etc/apk/keys/claude-code.rsa.pub` 验证下载的密钥，应该报告 `395759c1f7449ef4cdef305a42e820f3c766d6090d142634ebdb049f113168b6`。

    要稍后升级，请运行 `apk update && apk upgrade claude-code`。
  </Tab>
</Tabs>

<h3 id="install-with-npm">
  使用 npm 安装
</h3>

您也可以将 Claude Code 安装为全局 npm 包。从 v2.1.198 开始，npm 包需要 [Node.js 22 或更高版本](https://nodejs.org/en/download)。在较旧的 Node.js 版本上，npm 在安装期间打印 `EBADENGINE` 警告而不是失败；安装完成，`claude` 仍然运行，因为该包下载了在运行时不使用您的 Node.js 的原生二进制文件。

```bash theme={null}
npm install -g @anthropic-ai/claude-code
```

npm 包安装与独立安装程序相同的原生二进制文件。npm 通过每个平台的可选依赖项（如 `@anthropic-ai/claude-code-darwin-arm64`）拉取二进制文件，并通过 postinstall 步骤将其链接到位。已安装的 `claude` 二进制文件本身不调用 Node。

支持的 npm 安装平台是 `darwin-arm64`、`darwin-x64`、`linux-x64`、`linux-arm64`、`linux-x64-musl`、`linux-arm64-musl`、`win32-x64` 和 `win32-arm64`。您的包管理器必须允许可选依赖项。如果安装后二进制文件丢失，请参阅[故障排除](/docs/zh-CN/troubleshoot-install#native-binary-not-found-after-npm-install)。

要升级 npm 安装，请运行 `npm install -g @anthropic-ai/claude-code@latest`。避免使用 `npm update -g`，因为它遵循原始安装的 semver 范围，可能不会将您移动到最新版本。

<Warning>
  不要使用 `sudo npm install -g`，因为这可能导致权限问题和安全风险。如果遇到权限错误，请参阅[故障排除权限错误](/docs/zh-CN/troubleshoot-install#permission-errors-during-installation)。
</Warning>

<h3 id="binary-integrity-and-code-signing">
  二进制完整性和代码签名
</h3>

每个发布都发布一个 `manifest.json`，其中包含每个平台二进制文件的 SHA256 校验和。清单使用 Anthropic GPG 密钥签名，因此验证清单上的签名可以传递地验证它列出的每个二进制文件。

<h4 id="verify-the-manifest-signature">
  验证清单签名
</h4>

步骤 1-3 需要带有 `gpg` 和 `curl` 的 POSIX shell。在 Windows 上，在 Git Bash 或 WSL 中运行它们。步骤 4 包括 PowerShell 选项。

<Steps>
  <Step title="下载并导入公钥">
    发布签名密钥发布在固定 URL。

    ```bash theme={null}
    curl -fsSL https://downloads.claude.ai/keys/claude-code.asc | gpg --import
    ```

    显示导入的密钥的指纹。

    ```bash theme={null}
    gpg --fingerprint security@anthropic.com
    ```

    确认输出包含此指纹：

    ```text theme={null}
    31DD DE24 DDFA B679 F42D  7BD2 BAA9 29FF 1A7E CACE
    ```
  </Step>

  <Step title="下载清单和签名">
    将 `VERSION` 设置为您要验证的发布。

    ```bash theme={null}
    REPO=https://downloads.claude.ai/claude-code-releases
    VERSION=2.1.89
    curl -fsSLO "$REPO/$VERSION/manifest.json"
    curl -fsSLO "$REPO/$VERSION/manifest.json.sig"
    ```
  </Step>

  <Step title="验证签名">
    针对清单验证分离的签名。

    ```bash theme={null}
    gpg --verify manifest.json.sig manifest.json
    ```

    有效的结果报告 `Good signature from "Anthropic Claude Code Release Signing <security@anthropic.com>"`。

    `gpg` 也会为任何新导入的密钥打印 `WARNING: This key is not certified with a trusted signature!`。这是预期的。`Good signature` 行确认密码学检查通过。第 1 步中的指纹比较确认密钥本身是真实的。
  </Step>

  <Step title="根据清单检查二进制文件">
    将二进制文件的 SHA256 校验和与 `manifest.json` 中 `platforms.<platform>.checksum` 下列出的值进行比较。以下命令假设当前目录中有 `claude` 二进制文件。要验证已安装的原生二进制文件，请针对 `~/.local/share/claude/versions/VERSION` 运行命令，将 VERSION 替换为您在第 2 步中设置的发布。

    <Tabs>
      <Tab title="Linux">
        ```bash theme={null}
        sha256sum claude
        ```
      </Tab>

      <Tab title="macOS">
        ```bash theme={null}
        shasum -a 256 claude
        ```
      </Tab>

      <Tab title="Windows PowerShell">
        ```powershell theme={null}
        (Get-FileHash claude.exe -Algorithm SHA256).Hash.ToLower()
        ```
      </Tab>
    </Tabs>
  </Step>
</Steps>

<Note>
  清单签名可用于 `2.1.89` 及以后的发布。较早的发布在 `manifest.json` 中发布校验和，但没有分离的签名。
</Note>

<h4 id="platform-code-signatures">
  平台代码签名
</h4>

除了签名的清单外，各个二进制文件在支持的地方还带有平台原生代码签名。

* **macOS**：由"Anthropic PBC"签名并由 Apple 公证。使用 `codesign --verify --verbose ./claude` 验证。
* **Windows**：由"Anthropic, PBC"签名。使用 `Get-AuthenticodeSignature .\claude.exe` 验证。
* **Linux**：二进制文件不单独进行代码签名。如果您直接从 `claude-code-releases` 存储桶下载或使用原生安装程序，请使用上面的清单签名验证完整性。如果您使用 [apt、dnf 或 apk](#install-with-linux-package-managers) 安装，您的包管理器会使用存储库签名密钥自动验证签名。

<h2 id="uninstall-claude-code">
  卸载 Claude Code
</h2>

要删除 Claude Code，请按照您的安装方法的说明进行操作。如果之后 `claude` 仍然运行，您可能有第二个安装或来自较旧安装程序的遗留 shell 别名。请参阅[检查冲突的安装](/docs/zh-CN/troubleshoot-install#check-for-conflicting-installations)以查找并删除它。

<h3 id="native-installation">
  原生安装
</h3>

删除 Claude Code 二进制文件和版本文件：

<Tabs>
  <Tab title="macOS、Linux、WSL">
    ```bash theme={null}
    rm -f ~/.local/bin/claude
    rm -rf ~/.local/share/claude
    ```
  </Tab>

  <Tab title="Windows PowerShell">
    ```powershell theme={null}
    Remove-Item -Path "$env:USERPROFILE\.local\bin\claude.exe" -Force
    Remove-Item -Path "$env:USERPROFILE\.local\share\claude" -Recurse -Force
    ```
  </Tab>
</Tabs>

<h3 id="homebrew-installation">
  Homebrew 安装
</h3>

删除您安装的 Homebrew cask。如果您安装了稳定版 cask：

```bash theme={null}
brew uninstall --cask claude-code
```

如果您安装了最新版 cask：

```bash theme={null}
brew uninstall --cask claude-code@latest
```

<h3 id="winget-installation">
  WinGet 安装
</h3>

删除 WinGet 包：

```powershell theme={null}
winget uninstall Anthropic.ClaudeCode
```

<h3 id="apt-/-dnf-/-apk">
  apt / dnf / apk
</h3>

删除包和存储库配置：

<Tabs>
  <Tab title="apt">
    ```bash theme={null}
    sudo apt remove claude-code
    sudo rm /etc/apt/sources.list.d/claude-code.list /etc/apt/keyrings/claude-code.asc
    ```
  </Tab>

  <Tab title="dnf">
    ```bash theme={null}
    sudo dnf remove claude-code
    sudo rm /etc/yum.repos.d/claude-code.repo
    ```
  </Tab>

  <Tab title="apk">
    ```sh theme={null}
    apk del claude-code
    sed -i '\|downloads.claude.ai/claude-code/apk|d' /etc/apk/repositories
    rm /etc/apk/keys/claude-code.rsa.pub
    ```
  </Tab>
</Tabs>

<h3 id="npm">
  npm
</h3>

删除全局 npm 包：

```bash theme={null}
npm uninstall -g @anthropic-ai/claude-code
```

<h3 id="remove-configuration-files">
  删除配置文件
</h3>

<Warning>
  删除配置文件将删除您的所有设置、允许的工具、MCP 服务器配置和会话历史记录。
</Warning>

VS Code 扩展、JetBrains 插件和桌面应用也会写入 `~/.claude/`。如果其中任何一个仍然安装，下次运行时目录会被重新创建。要完全删除 Claude Code，请在删除这些文件之前卸载 [VS Code 扩展](/docs/zh-CN/vs-code#uninstall-the-extension)、JetBrains 插件和桌面应用。

要删除 Claude Code 设置和缓存数据：

<Tabs>
  <Tab title="macOS、Linux、WSL">
    ```bash theme={null}
    # 删除用户设置和状态
    rm -rf ~/.claude
    rm ~/.claude.json

    # 删除特定于项目的设置（从您的项目目录运行）
    rm -rf .claude
    rm -f .mcp.json
    ```
  </Tab>

  <Tab title="Windows PowerShell">
    ```powershell theme={null}
    # 删除用户设置和状态
    Remove-Item -Path "$env:USERPROFILE\.claude" -Recurse -Force
    Remove-Item -Path "$env:USERPROFILE\.claude.json" -Force

    # 删除特定于项目的设置（从您的项目目录运行）
    Remove-Item -Path ".claude" -Recurse -Force
    Remove-Item -Path ".mcp.json" -Force
    ```
  </Tab>
</Tabs>
