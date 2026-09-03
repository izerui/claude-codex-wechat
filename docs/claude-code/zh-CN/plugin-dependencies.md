> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 约束插件依赖版本

> 在插件依赖上声明版本约束，并将精选插件集合捆绑在一个安装后面。

插件可以通过在 `plugin.json` 或其 marketplace 条目中列出其他插件来依赖它们。默认情况下，依赖会跟踪最新可用版本，因此上游发布可能会在没有警告的情况下更改你的插件下的依赖。版本约束让你可以将依赖保持在经过测试的版本范围内，直到你选择升级。

当你安装声明了依赖的插件时，Claude Code 会自动解析并安装它们，并在安装输出的末尾列出添加了哪些依赖。如果依赖后来丢失，`/reload-plugins` 和后台插件自动更新会重新安装它，前提是其 marketplace 已在你配置的 marketplace 中。重新运行 `claude plugin install` 在依赖插件上，或使用 `claude plugin marketplace add` 添加 marketplace，也会解析任何未解决的缺失依赖。来自你尚未添加的 marketplace 的依赖将保持未解析状态。

本指南适用于在 `plugin.json` 中声明依赖的插件作者和标记发布的 marketplace 维护者。要安装具有依赖的插件，请参阅[发现和安装插件](/docs/zh-CN/discover-plugins)。有关完整的 manifest 架构，请参阅[插件参考](/docs/zh-CN/plugins-reference)。

<h2 id="why-constrain-dependency-versions">
  为什么要约束依赖版本
</h2>

考虑一个内部 marketplace，其中两个团队发布插件。平台团队维护 `secrets-vault`，这是一个包装 secrets 后端的 MCP 服务器。部署团队维护 `deploy-kit`，它在部署期间调用 `secrets-vault` 来获取凭证。

`deploy-kit` 针对 `secrets-vault` v2.1.0 进行了测试。没有版本约束的情况下，下次平台团队标记一个重命名 MCP 工具的发布时，自动更新会将每个工程师的 `secrets-vault` 移动到新版本，`deploy-kit` 就会中断。

有了版本约束，`deploy-kit` 声明它需要 `secrets-vault` 在 `~2.1.0` 范围内。安装了 `deploy-kit` 的工程师会停留在最高匹配的 `2.1.x` 补丁版本上。部署团队通过发布具有更宽松约束的新 `deploy-kit` 版本，按照自己的时间表进行升级。

<h2 id="declare-a-dependency-with-a-version-constraint">
  声明具有版本约束的依赖
</h2>

在插件的 `.claude-plugin/plugin.json` 的 `dependencies` 数组中列出依赖。每个条目要么是插件名称，要么是具有版本约束的对象。

以下 manifest 声明了一个无版本依赖和一个受约束的依赖：

```json .claude-plugin/plugin.json theme={null}
{
  "name": "deploy-kit",
  "version": "3.1.0",
  "dependencies": [
    "audit-logger",
    { "name": "secrets-vault", "version": "~2.1.0" }
  ]
}
```

条目可以是仅包含插件名称的裸字符串，如上例中的 `"audit-logger"`，它依赖于该插件的 marketplace 提供的任何版本。为了获得更多控制，请使用具有以下字段的对象：

| 字段            | 类型     | 描述                                                                                                                                                                                                     |
| :------------ | :----- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string | 插件名称。在与声明插件相同的 marketplace 中解析。必需。                                                                                                                                                                     |
| `version`     | string | 一个 [semver 范围](https://github.com/npm/node-semver#ranges)，例如 `~2.1.0`、`^2.0`、`>=1.4` 或 `=2.1.0`。依赖会在满足此范围的最高标记版本处获取。                                                                                   |
| `marketplace` | string | 一个不同的 marketplace 来在其中解析 `name`。跨 marketplace 依赖被阻止，除非目标 marketplace 在根 marketplace 的 `marketplace.json` 中的 [`allowCrossMarketplaceDependenciesOn`](#depend-on-a-plugin-from-another-marketplace) 中列出。 |

`version` 字段接受 Node 的 `semver` 包支持的任何表达式，包括 caret、tilde、hyphen 和 comparator 范围。预发布版本（如 `2.0.0-beta.1`）被排除，除非你的范围使用预发布后缀（如 `^2.0.0-0`）选择加入。

<h2 id="bundle-plugins-for-a-team">
  为团队捆绑 plugins
</h2>

除了必需的 `name` 之外，plugin manifest 可以仅包含一个 `dependencies` 数组。安装它会拉取每个依赖项，这使其成为在一个安装后面打包精选 plugin 集的一种方式。

例如，平台团队可以在内部 marketplace 中发布特定角色的捆绑包，这样工程师只需运行一次 `claude plugin install`，而不是分别安装每个工具：

```json .claude-plugin/plugin.json theme={null}
{
  "name": "backend-standard",
  "version": "1.0.0",
  "description": "Standard plugin set for backend engineers",
  "dependencies": [
    "secrets-vault",
    "deploy-kit",
    { "name": "db-migrate", "version": "^3.0" },
    "oncall-runbook"
  ]
}
```

安装 `backend-standard` 会解析并安装所有四个依赖项。

要稍后向标准集添加工具，请发布新的 `backend-standard` 版本并添加额外的依赖项。对于非 Anthropic marketplace，自动更新默认处于关闭状态，因此工程师可以通过以下两种方式之一获取新版本：

* 在 `/plugin` 中为 marketplace 启用自动更新。下一次自动更新会将捆绑包移至新版本并安装它添加的任何依赖项。
* 运行 `claude plugin update backend-standard`，然后运行 `/reload-plugins` 以安装新添加的依赖项。

要在整个组织中推出捆绑包，请将捆绑 plugin 添加到[托管设置](/docs/zh-CN/settings#enabledplugins)中的 `enabledPlugins`。

<h2 id="depend-on-a-plugin-from-another-marketplace">
  依赖来自另一个 marketplace 的插件
</h2>

默认情况下，Claude Code 拒绝自动安装位于与声明它的插件不同的 marketplace 中的依赖。这可以防止一个 marketplace 无声地从你未审查的来源拉入插件。

要允许这样做，根 marketplace 的维护者将目标 marketplace 名称添加到 `marketplace.json` 中的 `allowCrossMarketplaceDependenciesOn`。根 marketplace 是托管用户正在安装的插件的那个；只有其允许列表被查询，因此信任不会通过中间 marketplace 链接。

以下 `marketplace.json` 允许 `deploy-kit` 依赖来自 `acme-shared` 的插件：

```json .claude-plugin/marketplace.json theme={null}
{
  "name": "acme-tools",
  "owner": { "name": "Acme" },
  "allowCrossMarketplaceDependenciesOn": ["acme-shared"],
  "plugins": [
    {
      "name": "deploy-kit",
      "source": "./deploy-kit",
      "dependencies": [
        { "name": "audit-logger", "marketplace": "acme-shared" }
      ]
    }
  ]
}
```

如果字段缺失或不包含目标 marketplace，安装会失败并显示 `cross-marketplace` 错误，命名要设置的字段。用户仍然可以手动先安装依赖，这会满足约束而无需更改允许列表。

<h2 id="tag-plugin-releases-for-version-resolution">
  标记插件发布以进行版本解析
</h2>

版本约束针对 marketplace 存储库上的 git 标签进行解析。为了让 Claude Code 找到依赖的可用版本，上游插件的发布必须使用特定的命名约定进行标记。

将每个发布标记为 `{plugin-name}--v{version}`，其中 `{version}` 与该提交的 `plugin.json` 中的 `version` 字段匹配。从插件目录中，运行：

```bash theme={null}
claude plugin tag --push
```

`claude plugin tag` 命令从插件的清单和封闭的 marketplace 条目派生标签名称。在创建标签之前，它验证插件内容，检查 `plugin.json` 和 marketplace 条目是否在版本上一致，要求插件目录下的工作树干净，如果标签已存在则拒绝。添加 `--dry-run` 以查看将被标记的内容而不创建它。如果你自己保持 `plugin.json` 和 marketplace 条目同步，直接运行 `git tag secrets-vault--v2.1.0` 是等效的。

插件名称前缀让一个 marketplace 存储库可以托管多个具有独立版本线的插件。`--v` 分隔符被解析为完整插件名称上的前缀匹配，因此包含连字符的插件名称会被正确处理。

当你安装声明了 `{ "name": "secrets-vault", "version": "~2.1.0" }` 的插件时，Claude Code 会列出 marketplace 的标签，过滤到以 `secrets-vault--v` 开头的标签，并获取满足 `~2.1.0` 的最高版本。如果不存在匹配的标签，依赖插件会被禁用并显示错误，列出可用的版本。

作为本地文件夹路径添加的 marketplace 在该文件夹是 git 存储库时以相同的方式解析标签。这需要 Claude Code v2.1.196 或更高版本。在两种情况下，Claude Code 从文件夹的当前内容安装依赖：

* 早期版本不从本地文件夹 marketplace 读取标签，因此受约束的依赖仅在该副本满足范围时才加载。
* 不是 git 存储库的本地文件夹没有标签，无论版本如何。

已解析标签的 semver 与 `plugin.json` 的 `version` 分开记录，因此约束检查使用实际获取的标签，即使该提交处的 `plugin.json` 有过时的值。标签解析安装的缓存目录名称包含 12 字符的 commit-SHA 后缀，因此如果维护者强制将标签移动到不同的提交，下次安装会获得一个新的缓存目录，而不是重用过时的内容。

<Note>
  对于 `npm` marketplace 源，约束不控制获取哪个版本，因为基于标签的解析仅适用于 git 支持的源。约束仍在加载时被检查，如果安装的版本不满足它，依赖插件会被禁用并显示 `dependency-version-unsatisfied`。
</Note>

<h2 id="how-constraints-interact">
  约束如何相互作用
</h2>

当多个已安装的插件约束同一依赖时，Claude Code 会交集它们的范围，并将依赖解析为满足所有范围的最高版本。下表显示了常见组合如何解析。

| 插件 A 需要  | 插件 B 需要 | 结果                                              |
| :------- | :------ | :---------------------------------------------- |
| `^2.0`   | `>=2.1` | 在最高 `2.x` 标签处进行一次安装，该标签在 `2.1.0` 或更高版本。两个插件都加载。 |
| `~2.1`   | `~3.0`  | 插件 B 的安装失败，显示 `range-conflict`。插件 A 和依赖保持原样。    |
| `=2.1.0` | 无       | 依赖保持在 `2.1.0`。在安装了插件 A 时，自动更新会跳过较新版本。           |

自动更新在满足每个已安装插件范围的最高 git 标签处获取受约束的依赖，而不是在 marketplace 的最新版本处，因此依赖继续在其允许的范围内接收更新。如果没有标签满足所有范围，自动更新会跳过该依赖，并在 `/plugin` 错误选项卡中列出跳过情况，命名约束插件。

当你卸载最后一个约束依赖的插件时，该依赖不再被保持，并在下次更新时恢复跟踪其 marketplace 条目。

<h2 id="enable-or-disable-a-plugin-with-dependencies">
  启用或禁用具有依赖的插件
</h2>

启用插件也会启用它依赖的插件，禁用插件会被阻止，如果另一个已启用的插件仍然需要它。这两种行为都需要 Claude Code v2.1.143 或更高版本。早期版本仅启用或禁用命名的插件，并在下次加载时显示 `dependency-unsatisfied` 错误。

当你启用插件时，Claude Code 也会在同一范围内启用其依赖。如果依赖有自己的依赖，Claude Code 也会启用那些。成功消息会列出与你命名的插件一起启用的其他内容。如果依赖无法启用，命令会拒绝并告诉你什么在阻止以及如何修复：

| 条件                          | 结果                                          |
| :-------------------------- | :------------------------------------------ |
| 依赖未安装                       | 启用失败并为每个缺失的依赖打印 `claude plugin install` 命令。 |
| 依赖被你的组织的插件策略阻止              | 启用失败并命名被阻止的依赖。                              |
| 依赖在优先级高于目标范围的范围内设置为 `false` | 启用失败。在该范围内启用依赖，或传递 `--scope` 来在那里写入。        |
| 所有依赖都已安装且被允许                | 启用成功并为插件和每个在目标范围内尚未启用的依赖写入 `true`。          |

即使依赖在其清单中设置了 [`defaultEnabled: false`](/docs/zh-CN/plugins-reference#default-enablement)，这也成立，因为 Claude Code 为其写入显式 `true`。同样适用于安装：为满足活跃插件而引入的依赖会以 `true` 安装，无论其自身默认值如何。

当你禁用插件时，Claude Code 会拒绝，如果另一个已启用的插件仍然依赖它。错误会命名依赖它的插件，并给你一个链式命令，以正确的顺序禁用它们，以你要求的那个结尾。

例如，如果 `deploy-kit` 依赖 `secrets-vault`，单独禁用 `secrets-vault` 会失败，输出类似于以下内容：

```text theme={null}
secrets-vault is still required by deploy-kit. Disable that plugin first, or
disable everything together: claude plugin disable deploy-kit@acme-tools && claude plugin disable secrets-vault@acme-tools
```

从错误中复制链式命令以一步禁用完整集合。

<h2 id="remove-orphaned-auto-installed-dependencies">
  删除孤立的自动安装依赖
</h2>

自动安装的依赖在安装它们的插件被卸载后仍会保留在磁盘上，以防你重新安装依赖插件或想继续直接使用该依赖。要清理它们，运行 `claude plugin prune` 来列出不再有任何已安装插件需要的自动安装依赖，并在确认提示后删除它们。这需要 Claude Code v2.1.121 或更高版本。

```bash theme={null}
claude plugin prune
```

默认情况下，prune 在用户范围内运行。使用 `--scope project` 或 `--scope local` 来针对不同的范围。传递 `--dry-run` 来列出将被删除的内容而不进行任何更改。传递 `-y` 来跳过确认提示。当 stdin 或 stdout 不是终端时，prune 会列出孤立项并退出，除非传递了 `-y`。

要在卸载过程中进行 prune，请将 `--prune` 传递给 `claude plugin uninstall`。删除命名的插件后，Claude Code 会扫描并删除现在孤立的任何自动安装依赖。你自己安装的插件永远不会被 prune，只有通过另一个插件的 `dependencies` 数组自动安装的插件才会被 prune。

例如，要卸载 `deploy-kit` 并清理它留下的依赖：

```bash theme={null}
claude plugin uninstall deploy-kit --prune
```

<h2 id="resolve-dependency-errors">
  解决依赖错误
</h2>

依赖问题会在 `claude plugin list` 和 `/plugin` 界面中显示。Claude Code 会禁用受影响的插件，直到你解决错误。下表列出了最常见的错误及其解决方法。

| 错误                               | 含义                                                               | 如何解决                                                                                                                                  |
| :------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `dependency-unsatisfied`         | 声明的依赖未安装，或已安装但被禁用。                                               | 运行错误消息中显示的 `claude plugin install` 命令。如果依赖的 marketplace 尚未配置，使用 `claude plugin marketplace add` 添加它，Claude Code 会自动解析依赖。如果依赖被禁用，请启用它。 |
| `range-conflict`                 | 依赖的版本要求无法组合。错误消息命名原因：没有版本满足所有范围，范围不是有效的 semver 语法，或组合范围太复杂而无法交集。 | 卸载或更新其中一个冲突的插件，修复任何无效的 `version` 字符串，简化长 `\|\|` 链，或要求上游作者扩大其约束。                                                                       |
| `dependency-version-unsatisfied` | 已安装的依赖版本在此插件的声明范围之外。                                             | 运行 `claude plugin install <dependency>@<marketplace>` 以根据所有当前约束重新解析依赖。                                                                |
| `no-matching-tag`                | 依赖的存储库没有满足范围的 `{name}--v*` 标签。                                   | 检查上游是否使用上述约定标记了发布，或放宽你的范围。                                                                                                            |

要以编程方式检查这些错误，请运行 `claude plugin list --json` 并读取每个插件上的 `errors` 字段。

<h2 id="see-also">
  另请参阅
</h2>

* [创建插件](/docs/zh-CN/plugins)：使用 skills、agents 和 hooks 构建插件
* [创建和分发插件 marketplace](/docs/zh-CN/plugin-marketplaces)：为你的团队托管插件
* [插件参考](/docs/zh-CN/plugins-reference#plugin-manifest-schema)：完整的 `plugin.json` 架构
* [版本管理](/docs/zh-CN/plugins-reference#version-management)：插件自身版本如何被解析并用作缓存键
