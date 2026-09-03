> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Linux 上的 Claude Desktop（测试版）

> 在 Ubuntu 和 Debian 上安装和更新 Claude 桌面应用

<Note>
  Claude 桌面应用的 Linux 支持处于测试版阶段。Chat、Cowork 和 Code 选项卡都可用。
</Note>

Linux 上的桌面应用提供与 macOS 和 Windows 相同的 Chat、Cowork 和 Claude Code 体验：并行会话、可视化差异审查、集成终端和编辑器以及实时应用预览。有关完整的功能参考，请参阅[使用 Claude Code Desktop](/docs/zh-CN/desktop)。

<h2 id="requirements">
  要求
</h2>

* Ubuntu 22.04 或更高版本，或 Debian 12 或更高版本
* x86\_64 或 arm64

其他满足这些要求的基于 Debian 的发行版可能可以工作，但未经过官方测试。

<h2 id="install">
  安装
</h2>

从 Anthropic 的 apt 存储库安装，以便更新通过系统的常规包更新到达。打开终端并运行每个步骤中的命令。

<Steps>
  <Step title="添加 Anthropic 的 apt 存储库">
    此步骤使用 `curl` 下载签名密钥，新的 Debian 和 Ubuntu 安装可能不包含此工具。如果下载命令失败并显示 `sudo: curl: command not found`，请先安装 curl：

    ```bash theme={null}
    sudo apt install curl
    ```

    下载 Anthropic 的签名密钥：

    ```bash theme={null}
    sudo curl -fsSLo /usr/share/keyrings/claude-desktop-archive-keyring.asc https://downloads.claude.ai/claude-desktop/key.asc
    ```

    注册存储库：

    ```bash theme={null}
    echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/claude-desktop-archive-keyring.asc] https://downloads.claude.ai/claude-desktop/apt/stable stable main" | sudo tee /etc/apt/sources.list.d/claude-desktop.list
    ```
  </Step>

  <Step title="安装软件包">
    ```bash theme={null}
    sudo apt update && sudo apt install claude-desktop
    ```
  </Step>

  <Step title="启动并登录">
    从应用启动器启动 **Claude**，或从终端运行 `claude-desktop`，然后使用您的 Anthropic 账户登录。

    Linux 应用的登录方式与 macOS 和 Windows 上相同：使用 claude.ai 订阅或通过您组织的 SSO。Desktop 不直接接受 Claude Console API 密钥；请使用 [CLI](/docs/zh-CN/quickstart) 进行 API 密钥身份验证。对于路由 Desktop 到 Google Cloud 的 Agent Platform 或 LLM 网关的企业部署，请参阅 [Claude Desktop on 3P](https://claude.com/docs/third-party/claude-desktop/overview) 和 [网络配置](/docs/zh-CN/network-config)。
  </Step>
</Steps>

<Accordion title="验证签名密钥">
  您可以确认下载的签名密钥属于 Anthropic：

  ```bash theme={null}
  gpg --show-keys /usr/share/keyrings/claude-desktop-archive-keyring.asc
  ```

  指纹应该是 `31DD DE24 DDFA B679 F42D 7BD2 BAA9 29FF 1A7E CACE`。
</Accordion>

<h3 id="install-from-a-downloaded-file">
  从下载的文件安装
</h3>

如果您无法通过 apt 存储库安装，请直接从存储库的软件包池下载 `.deb` 软件包。此命令在存储库索引中查找您的架构的最新软件包，然后将其下载到当前目录：

```bash theme={null}
curl -fLO "https://downloads.claude.ai/claude-desktop/apt/stable/$(curl -s "https://downloads.claude.ai/claude-desktop/apt/stable/dists/stable/main/binary-$(dpkg --print-architecture)/Packages" | grep '^Filename: pool/main/c/claude-desktop/claude-desktop_' | sort -V | tail -n 1 | cut -d' ' -f2)"
```

如果命令失败并显示 `Remote file name has no length`，则查找未返回软件包路径。这可能意味着无法获取存储库索引，例如当您的网络阻止 `downloads.claude.ai` 时，或者您的架构不存在软件包。确认您的网络可以访问 `downloads.claude.ai`，并且 `dpkg --print-architecture` 输出 `amd64` 或 `arm64`；存储库不为其他架构发布软件包。

然后使用软件安装程序（如 GNOME Software）打开下载的文件，或从包含下载文件的目录使用 apt 安装它：

```bash theme={null}
sudo apt install ./claude-desktop_*.deb
```

如果 apt 报告 `E: Unsupported file ./claude-desktop_*.deb given on commandline`，则该模式与当前目录中的 `.deb` 文件不匹配。确认下载已完成，然后从包含该文件的目录再次运行该命令。

以这种方式安装的 `.deb` 不会接收更新。要通过 apt 获取更新，请从 [添加 Anthropic 的 apt 存储库](#install) 步骤注册存储库。该软件包还会向 `/etc/apt/sources.list.d/claude-desktop.list` 写入一个注释掉的存储库条目；取消注释其 `deb` 行等同于注册存储库。

<h2 id="update">
  更新
</h2>

桌面应用在 Linux 上不会自动更新。更新通过系统的常规包更新到达：

```bash theme={null}
sudo apt update && sudo apt upgrade
```

您的发行版的图形软件更新程序也会获取新版本。

<h2 id="uninstall">
  卸载
</h2>

```bash theme={null}
sudo apt remove claude-desktop
```

这会删除签名密钥以及应用，因此如果您在安装期间添加了存储库条目，也要删除它：

```bash theme={null}
sudo rm /etc/apt/sources.list.d/claude-desktop.list
```

<h2 id="troubleshoot">
  故障排除
</h2>

<h3 id="unable-to-locate-package-claude-desktop">
  无法定位软件包 claude-desktop
</h3>

如果 `sudo apt install claude-desktop` 失败并显示 `E: Unable to locate package claude-desktop`，说明 apt 没有找到您添加的存储库。请检查以下内容：

* 确认存储库条目已写入。`cat /etc/apt/sources.list.d/claude-desktop.list` 应该显示来自[添加 Anthropic 的 apt 存储库](#install)步骤的 `deb` 行。如果文件为空或缺失，请再次运行该步骤。
* 确认您的架构受支持。`dpkg --print-architecture` 应该打印 `amd64` 或 `arm64`。该存储库不为其他架构发布软件包。
* 再次运行 `sudo apt update` 并检查其输出中是否有与 `downloads.claude.ai` 相关的错误。那里的网络或密钥错误意味着存储库已添加但无法访问或验证。

如果存储库已就位且可访问，但仍然找不到该软件包，请改为[从下载的文件安装](#install-from-a-downloaded-file)。

<h2 id="what’s-not-in-the-linux-beta-yet">
  Linux 测试版中尚未包含的内容
</h2>

* **Computer Use**：[应用和屏幕控制](/docs/zh-CN/desktop#let-claude-use-your-computer)在 Linux 上不可用。
* **Dictation**：语音输入在 Linux 桌面应用中不可用。请改用 CLI 中的[语音听写](/docs/zh-CN/voice-dictation)。
* **Quick Entry 全局热键**：在 X11 上有效。在原生 Wayland 上，它需要您的桌面环境的 GlobalShortcuts 门户。
* **Fedora 和 RHEL**：目前仅支持基于 Debian 的发行版。对其他发行版的支持将在未来推出。

对于桌面应用中尚未提供的任何功能，[CLI](/docs/zh-CN/quickstart) 运行相同的 Claude Code 引擎并支持更广泛的 Linux 发行版范围；请参阅[系统要求](/docs/zh-CN/setup#system-requirements)。
