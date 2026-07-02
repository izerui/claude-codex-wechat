# 客户端版本更新提示（自动检测）设计

日期：2026-07-02
状态：已批准，待实现

## 目标

让 `claude-codex-wechat` 客户端能自动发现自己有新版本，并**提示**用户去更新（更新动作仍由用户手动执行安装命令 + `restart`）。只做“提示”，不做一键/全自动更新。

## 背景与约束

- 分发方式：全局 npm 包。更新 = 重新执行安装命令 `npm install -g claude-codex-wechat@latest --registry=https://registry.npmmirror.com/`，装完 `claude-codex-wechat restart` 让服务加载新代码。
- 现状：CLI 有 start/stop/restart/status/logs/doctor/uninstall 等，**无** `update`/`--version`，**无**任何版本检测/registry 查询逻辑。
- daemon（常驻进程）承载 HTTP 服务（`127.0.0.1:8787`）与管理页；CLI 的 `status`/`doctor` 是本地读取、不连 daemon。

## 核心决策

1. **只做提示**（不一键、不全自动）。
2. **daemon 是唯一查网口**：启动时查一次，之后**每 1 小时**查一次。
3. **结果持久化写进 config 文件**（不是纯内存）：重启不丢，也没有“内存里还没查到”的空窗。config 是单一数据源，管理页与 CLI 都只读它。

## 数据模型

在 config 文件里新增 `update` 块（与 `wechat`/`bridge`/`tunnel` 平级）：

```json
"update": {
  "currentVersion": "0.1.19",
  "latestVersion": "0.1.23",
  "updateAvailable": true,
  "lastCheckedAt": 1782970000000
}
```

## 组件

### 1. 检测模块 `src/daemon/updateChecker.ts`
- 纯逻辑，可注入 `fetchImpl` / registry URL / 间隔 / 当前版本，便于测试。
- 对外：`start()`（启动时查一次 + 起每小时定时器，`unref`）、`stop()`。
- 每次查到结果后调用持久化函数写 config。

### 2. 持久化 `persistUpdateStatusToConfigFile()`（加到 `src/daemon/configPersistence.ts`）
- 仿现有 `persistBridgeDefaultsToConfigFile`：读 → 合并 `update` 块 → 写。**只动 `update` 块，不覆盖其它字段**。

### 3. 版本读取
- 读打包进包的 `package.json.version`（用 `createRequire`/相对入口路径，和现有定位 `webRoot` 一致的套路）作为 `currentVersion`。

### 4. 管理页横幅
- 扩展现有 `GET /api/status` 响应，带上从 config 读到的 `update` 块（不新增接口）。
- Cockpit 已在轮询 `fetchStatus`；`update.updateAvailable` 为真时顶部显示**可关闭**横幅：`发现新版 vX.Y.Z（当前 vA.B.C）` + 安装命令（带复制）+ “更新后 `claude-codex-wechat restart` 生效”。

### 5. CLI 提示
- `cmdStatus` / `cmdDoctor` 读 config 的 `update` 块；`updateAvailable` 为真就多打印一行提示（含安装命令 + restart）。config 无该块则不打印。CLI 不查网。

## 检测与版本比较细节

- registry：默认 `https://registry.npmmirror.com/claude-codex-wechat/latest`，取返回体 `version`；超时约 5s；registry 可用环境变量覆盖（测试/自建镜像）。
- 比较：语义化版本按 `major.minor.patch` 数值比，`latest > current` 才算有更新。预发布标签从简处理（忽略预发布，只认正式版）。
- 写入语义：`latest > current` → 写 `updateAvailable:true`；已是最新 → 写 `false` 并刷新 `lastCheckedAt`；查失败 → **不写**、保留上次值、不打扰。

## 错误处理与不打扰原则

- 网络/解析/超时失败：静默忽略，保留上次结果，绝不报错、绝不打扰，下个整点再试。
- 只有“确实检测到更高版本”才显示提示；查不到/查失败/已最新 → 什么都不显示。

## 测试

- `updateChecker` 单测（注入 fetch + 临时 config）：新版 → 写 `updateAvailable:true`；同版/旧版 → `false`；fetch 失败 → 不覆盖旧值；超时不崩。
- `persistUpdateStatusToConfigFile` 合并测试：只动 `update` 块，不覆盖 `wechat`/`bridge` 等其它字段。
- `/api/status` 返回体含 `update` 块的测试。
- 版本比较函数单测：更高/相等/更低/预发布若干用例。

## 明确不做（YAGNI）

- 一键更新按钮、全自动后台更新。
- 微信推送更新提示。
- 版本回滚 / 更新失败恢复。
