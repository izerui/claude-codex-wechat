> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 为您的组织推荐插件

> 向marketplace插件条目添加relevance块，以便当用户的工作与之匹配时，Claude Code会建议他们安装。

如果您为组织运营插件marketplace，您可以根据用户正在处理的内容让Claude Code向用户建议特定的插件。向`marketplace.json`中的插件条目添加`relevance`块，然后在托管设置中将marketplace加入允许列表。当用户的会话与声明的信号之一匹配时，Claude Code会显示该插件的安装建议。

Marketplace声明的建议通过[托管设置](/docs/zh-CN/settings#settings-files)按marketplace选择加入。在管理员将任何marketplace添加到允许列表之前，没有marketplace的`relevance`声明会产生建议，包括官方Anthropic marketplace。Claude Code还包括一个独立于此允许列表的内置建议；当[`spinnerTipsEnabled`](/docs/zh-CN/settings#available-settings)设置为`false`时，该提示和所有marketplace声明的提示都会被禁用。

此功能需要Claude Code v2.1.152或更高版本。较旧的客户端会忽略`relevance`字段。

此页面适用于marketplace运营商和企业管理员。如果您想要安装插件，请参阅[发现和安装插件](/docs/zh-CN/discover-plugins)。

<h2 id="how-it-works">
  工作原理
</h2>

`marketplace.json`中的每个插件条目都可以包含一个`relevance`对象。该对象命名一个主题和一个或多个信号。信号是Claude Code针对当前会话测试的模式，例如工作目录或Claude已读取的文件。

信号匹配在用户的机器上本地进行。匹配不会增加网络流量，也不会向Anthropic或marketplace运营商报告哪些信号匹配或其值。

当信号匹配且插件尚未安装时，Claude Code会在三个位置显示该插件：

* **Spinner提示**：当Claude正在响应时，spinner下方会显示"使用\_topic\_？安装\_plugin\_插件"消息，附带`/plugin install`命令。
* **会话启动建议**：如果`cwd`信号与工作目录匹配，在第一轮之前会显示一行`plugin suggestion: <name>@<marketplace> · /plugin`通知。此表面需要Claude Code v2.1.153或更高版本。
* **`/plugin` Discover标签页**：插件被固定在Discover列表的顶部，带有"为此目录建议"或"为stripe命令建议"之类的注释。此表面需要Claude Code v2.1.154或更高版本。

Spinner提示和会话启动通知是spinner提示系统的一部分。当用户或项目将`spinnerTipsEnabled`设置为`false`，或当配置了带有`excludeDefault`的自定义`spinnerTipsOverride`时，两者都会被禁用。Discover标签页的固定独立于提示设置。

Claude Code永远不会自动安装插件。用户始终需要确认。

<h2 id="add-relevance-to-a-plugin-entry">
  向插件条目添加relevance
</h2>

向您的`marketplace.json`中的插件条目添加`relevance`对象。以下示例声明当Claude读取`.tf`文件或运行`terraform`时，`terraform-helpers`插件是相关的：

```json theme={null}
{
  "name": "acme-corp-plugins",
  "owner": { "name": "Acme Platform Team" },
  "plugins": [
    {
      "name": "terraform-helpers",
      "source": "./plugins/terraform-helpers",
      "description": "Acme conventions and helpers for Terraform",
      "relevance": {
        "topic": "Terraform",
        "signals": {
          "cli": ["terraform"],
          "filesRead": ["**/*.tf"]
        }
      }
    }
  ]
}
```

具有`relevance`块但没有匹配信号的插件的行为与任何其他marketplace条目相同。它在Discover列表中以其正常位置出现，永远不会显示为spinner提示。

<h2 id="field-reference">
  字段参考
</h2>

<h3 id="relevance">
  `relevance`
</h3>

| 字段        | 类型     | 描述                                                                                                                            |
| :-------- | :----- | :---------------------------------------------------------------------------------------------------------------------------- |
| `topic`   | string | 可选。在spinner提示中填充"使用\_topic\_？"的短语。通常是产品名称，例如`Stripe`。当插件名称不能自然地作为主题读取时，使用域名如`design`。默认为插件名称，每个连字符段首字母大写。会话启动通知不使用此值。最多64个字符。 |
| `signals` | object | 确定插件何时相关的匹配器。至少需要一个信号才能使插件可被建议。请参阅下表。                                                                                         |

<h3 id="relevance-signals">
  `relevance.signals`
</h3>

| 字段             | 类型               | 描述                                                                                                                                                                                                                                                                                                                                             |
| :------------- | :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`          | array of strings | 与会话工作目录匹配的Glob模式。作为绝对路径匹配，当在git存储库内时，作为相对于存储库根目录的路径匹配。正斜杠规范化且不区分大小写。每个模式都匹配目录本身及其下的所有内容，因此`infra`、`infra/`和`infra/**`的行为相同。这是唯一可以在会话启动时（第一轮之前）匹配的信号。最多10个模式，每个256个字符。                                                                                                                                                                          |
| `cli`          | array of strings | Claude在此会话中运行的shell命令中的命令名称，例如`["stripe"]`。适用于每个平台：在Windows上通过PowerShell或Git Bash运行的命令以相同方式记录。Claude Code每个shell工具调用记录一个命令名称：任何前导环境变量赋值和`sudo`之后的第一个令牌。复合命令仅贡献其前导命令，因此`cd infra && terraform plan`记录`cd`，而不是`terraform`。精确匹配。最多10个条目，每个64个字符。                                                                                                  |
| `hosts`        | array of strings | 此会话中Bash命令中`http://`或`https://` URL中看到的主机名，例如`["api.stripe.com"]`。仅限裸小写主机名：无方案、端口或路径。精确不区分大小写匹配。最多20个条目，每个128个字符。                                                                                                                                                                                                                              |
| `filesRead`    | array of strings | 与Claude在此会话中读取的文件路径匹配的Glob模式，例如`["**/*.tf"]`。正斜杠规范化且不区分大小写。最多10个模式，每个256个字符。                                                                                                                                                                                                                                                                   |
| `manifestDeps` | array of objects | Claude在此会话中读取的包清单中声明的依赖项。每个条目是`{ "file": "...", "pattern": "..." }`，其中`file`是与清单文件路径匹配的正则表达式（如会话状态中记录的，通常是绝对路径），`pattern`是与该文件内容匹配的正则表达式。在末尾锚定`file`，例如JSON转义形式中的`[/\\\\]package\\.json$`，因为起始锚定的模式永远不会匹配绝对路径。路径对于此信号不进行分隔符规范化，因此Windows路径使用反斜杠。大于512 KB的清单文件会被跳过。两个值都是最多256个字符的JavaScript `RegExp`源字符串。`file`不区分大小写匹配。`pattern`区分大小写。最多10个条目。 |

`cli`、`hosts`、`filesRead`和`manifestDeps`信号需要会话历史记录，因此它们只能在spinner提示和Discover标签页上匹配。只有`cwd`可以在会话启动时匹配。`filesRead`和`manifestDeps`信号测试会话的记录文件状态，其中还包括Claude已写入或编辑的文件以及自动加载的`CLAUDE.md`内存文件。

以下示例使用`manifestDeps`在Claude读取了依赖于`stripe`的`package.json`后建议Stripe插件。`file`模式使用`[/\\\\]`以匹配正斜杠和反斜杠路径分隔符，使用`\\.`以使点为字面。在JSON中，正则表达式中的每个反斜杠都写两次。

```json theme={null}
{
  "name": "stripe-helpers",
  "source": "./plugins/stripe-helpers",
  "relevance": {
    "topic": "Stripe",
    "signals": {
      "manifestDeps": [
        {
          "file": "[/\\\\]package\\.json$",
          "pattern": "\"stripe\"\\s*:"
        }
      ]
    }
  }
}
```

<Note>
  `relevance`和`relevance.signals`下的未知字段在加载时被忽略，因此较旧的Claude Code客户端继续加载您的marketplace。运行`claude plugin validate`以将它们显示为警告。
</Note>

<h2 id="enable-suggestions-in-managed-settings">
  在托管设置中启用建议
</h2>

在`marketplace.json`中声明`relevance`本身是不够的。管理员必须在[托管设置](/docs/zh-CN/settings#settings-files)中将marketplace加入允许列表，其建议才会显示给用户。

将marketplace名称添加到`pluginSuggestionMarketplaces`。对于官方Anthropic marketplace以外的任何marketplace，还要在同一托管设置中声明marketplace源，要么作为该名称在`extraKnownMarketplaces`中的条目，要么作为`strictKnownMarketplaces`中的条目。如果在机器上注册的marketplace来自不同的源，则忽略允许列表中的名称。这可以防止无关的源以允许列表中的名称注册，以便在您的组织中建议其插件。

以下`managed-settings.json`从GitHub存储库注册一个组织marketplace并启用其建议：

```json theme={null}
{
  "extraKnownMarketplaces": {
    "acme-corp-plugins": {
      "source": {
        "source": "github",
        "repo": "acme-corp/claude-plugins"
      }
    }
  },
  "pluginSuggestionMarketplaces": ["acme-corp-plugins"]
}
```

官方marketplace免除源声明要求，因为其名称只能从官方Anthropic源注册。仅允许列表中的名称就足够了：

```json theme={null}
{
  "pluginSuggestionMarketplaces": ["claude-plugins-official"]
}
```

有关`pluginSuggestionMarketplaces`和[`extraKnownMarketplaces`](/docs/zh-CN/settings#extraknownmarketplaces)的完整配置详情，请参阅[设置参考](/docs/zh-CN/settings)。

<h2 id="what-the-user-sees">
  用户看到的内容
</h2>

当会话期间信号匹配时，spinner提示读取：

```text theme={null}
Working with Terraform? Install the terraform-helpers plugin:
/plugin install terraform-helpers@acme-corp-plugins
```

在会话启动时，匹配的`cwd`信号会显示一行通知：

```text theme={null}
plugin suggestion: terraform-helpers@acme-corp-plugins · /plugin
```

给定插件的建议在spinner提示和会话启动通知的组合中最多每三个会话出现一次，一旦插件被安装，两者都不会重复。会话启动通知在建议显示两次后还会停止出现。

在`/plugin` Discover标签页中，插件被固定在其他结果上方，带有命名匹配信号的注释，例如`suggested for this directory`或`suggested for terraform commands`。Discover标签页固定给定插件一次；后续访问以正常顺序列出它。Discover标签页固定需要Claude Code v2.1.154或更高版本。在v2.1.152上仅显示spinner提示；会话启动通知在v2.1.153中添加。

<h2 id="validate-your-marketplace">
  验证您的marketplace
</h2>

针对您的marketplace目录运行`claude plugin validate`以在发布前检查`relevance`块：

```
claude plugin validate ./my-marketplace
```

验证器将`relevance`和`relevance.signals`下的未知键报告为警告，标记不是对象的`relevance`值，并拒绝包含方案、端口或路径的`signals.hosts`条目。

<h2 id="see-also">
  另请参阅
</h2>

* [创建和分发插件marketplace](/docs/zh-CN/plugin-marketplaces)：构建托管您的插件的marketplace
* [从您的CLI推荐您的插件](/docs/zh-CN/plugin-hints)：从您自己的CLI而不是Claude Code的会话信号提示用户
* [设置](/docs/zh-CN/settings)：`pluginSuggestionMarketplaces`和`extraKnownMarketplaces`的完整参考
