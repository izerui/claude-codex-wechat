# UI / UX 设计规范

本工程 Web 控制面板的视觉与交互规范。设计方向提炼自参考工程 `maas-api/front-web`（Tailwind v4 + shadcn），并**适配到本工程实际技术栈**：React + Vite + Bootstrap 5 + `src/web/styles.css` 自定义 CSS 变量。

> 参考工程用 Tailwind 工具类 + shadcn 组件承载视觉；本工程用 **Bootstrap 基础类 + `styles.css` 覆盖层** 承载。规则等价，落地方式不同。所有颜色、圆角、阴影、过渡的“单一事实来源”是 `src/web/styles.css` 的 `:root` 变量与覆盖类。

---

## 1. 设计方向

暖色调、克制、专业。以暖橙（terracotta，hue ~52）为品牌色，暖灰为中性面，追求「安静但有品牌感」的 SaaS 仪表盘体验。

应当让人感觉：**冷静、高级、可信、操作感强、略带暖意**。

参照气质：Stripe 的仪表盘纪律 + Vercel 的留白克制 + Linear 的交互利落，但品牌色调更暖。

不要漂移成：Apple 蓝、紫色创业渐变、通用冷灰企业后台。

---

## 2. 核心原则

1. **Token 驱动** — 颜色/圆角/阴影全部走 `styles.css` 的 CSS 变量，禁止在 TSX 里硬编码 `#xxx` / `rgba()`（阴影内联 rgba 例外）。
2. **覆盖层收口** — 视觉规则沉到 `styles.css` 的 `.soft-card` / `.btn-accent` / `.badge-soft-*` / `.nav-accent` 等类；TSX 页面只做组合与间距微调，不逐处内联样式重写视觉。
3. **克制装饰** — 极轻阴影 + 暖色细边框，避免「边框 + 厚阴影 + 渐变」同时出现；深度来自边框分隔、柔和阴影、暖中性分层、间距节奏。
4. **交互有反馈** — 所有可交互元素 150ms 过渡（`cubic-bezier(0.4, 0, 0.2, 1)`）。

---

## 3. 色板

品牌色 hue ~52（暖橙），整套色板 hue 统一在 **38~75 暖色区间**。新增/修改颜色必须保持在此区间。

三级表面层级（从深到浅）：`muted(0.928)` → `background(0.952)` → `card(0.995)`，每级亮度差 ≥0.024，肉眼可辨。

`src/web/styles.css :root` 中的 token（oklch）：

```css
--primary:            oklch(0.62 0.14 52)    品牌暖橙：主按钮/激活态/状态点/链接
--primary-hover:      oklch(0.58 0.14 52)    主按钮 hover
--primary-foreground: oklch(1 0 0)           主色上的白色文字
--background:         oklch(0.952 0.005 70)  页面画布，暖灰（.app-bg）
--card:              oklch(0.995 0.001 75)   卡片，近白暖面
--foreground:        oklch(0.22 0.006 55)    主文字，深暖灰
--muted/-secondary:  oklch(0.928 0.01 65)    次级面 / neutral 徽章底
--muted-foreground:  oklch(0.52 0.015 55)    次级文字（.text-muted-soft）
--accent:            oklch(0.95 0.02 52)     极浅暖橙高亮面
--border:            oklch(0.85 0.008 65)    边框
--input:             oklch(0.875 0.008 65)   输入框边框（比 border 稍浅）
--ring:              oklch(0.62 0.14 52)     焦点环，同 primary
--destructive:       oklch(0.577 0.245 27)   危险/错误
```

**软状态色**（成功/警告/错误），暖色调内取色，用于徽章背景：

```css
--soft-success-*  bg oklch(0.97 0.015 45) / border 0.88 0.025 45 / fg 0.52 0.16 45
--soft-warning-*  bg oklch(0.97 0.025 52) / border 0.86 0.035 52 / fg 0.58 0.16 52
--soft-error-*    bg oklch(0.96 0.025 30) / border 0.82 0.04 30  / fg 0.56 0.22 30
```

规则：
- 警告/高亮用暖橙系，**禁止** Bootstrap 默认的 `text-bg-warning`（黄）/`text-bg-primary`（蓝）。
- 状态语义色仅在语义必要时出现（连接状态、Token 状态、会话状态）。
- 不引入第二套品牌主色，不引入冷色（蓝/紫/冷灰）。

---

## 4. 字体

| 属性 | 值 |
| --- | --- |
| 字体族 | 系统栈 `-apple-system, Inter, "PingFang SC", Segoe UI, system-ui`（参考工程用 Geist，本工程用系统栈近似 + CJK 用 PingFang SC） |
| 正文 | 14px，字重 **450**，字间距 **-0.015em**，抗锯齿 |
| 标题 | 字重 **650**，字间距 **-0.03em** |
| 字号层级 | 小字 12~13px → 正文 14px → 卡片标题 16~18px → 页面标题 28px |
| 等宽 | 技术串（IP、命令、ID）用 `.font-monospace` |

正文应紧凑、克制、略密；标题简洁、高确定性、不装饰。避免超大花字与圆润创业体。

---

## 5. 间距与圆角

| 属性 | 值 |
| --- | --- |
| 全局圆角 `--radius` | 12px（按钮、输入框、下拉） |
| 卡片圆角 | 16px（`.soft-card`） |
| 徽章圆角 | 药丸形（`border-radius: 999px`），左右内边距充裕（`3px 11px`） |
| 内容区宽度 | `max-width: 1200px` 居中 |
| 卡片内边距 | header `14px 18px`，body `18px`，list-item `11px 18px` |
| 区块间距 | 卡片间 `mb-3`（16px），栅格 `gap` 14px |

边框优先于重投影。统一用 `--border` token，保持克制，避免高对比深边框与粗描边。

---

## 6. 阴影

两档，保持克制。**禁止** `shadow-lg` 等重阴影、大面积浮玻璃、强渐变 + 边框 + 重影叠加。

| 档位 | 值 | 用途 |
| --- | --- | --- |
| 卡片影 | `0 1px 2px rgba(20,16,12,.04), 0 1px 3px rgba(20,16,12,.05)`（`--card-shadow`） | `.soft-card` 默认 |
| 按钮轻影 | `0 1px 2px rgba(0,0,0,.05)` → hover `0 2px 4px rgba(0,0,0,.1)` | `.btn-accent` |

阴影是唯一允许内联 rgba 的地方。

---

## 7. 过渡与交互

所有可交互元素统一 **150ms** 过渡，缓动 `cubic-bezier(0.4, 0, 0.2, 1)`，覆盖 color / background / border-color / box-shadow / transform。

| 元素 | 方式 |
| --- | --- |
| 主按钮 `.btn-accent` | hover 背景加深 + 阴影抬升；`active:scale(0.98)` 按压反馈 |
| 输入框 | focus 平滑出现 primary 焦点环（3px `ring/20`） |
| Tabs `.nav-accent` | 激活态 primary 2px 下划线，文字 60% → 100% 前景色，150ms |

动效应「快、柔、有用」；避免装饰性动画、视差、夸张延迟交错。

---

## 8. 组件规范（本工程落地）

### 卡片 `.soft-card`
- 暖白底 + 1px `--border` 细边框 + `--card-shadow` 柔和阴影 + 16px 圆角。
- header：透明底 + 底部细分隔线 + 字重 600。
- 信息密集型内容用 `.list-group-flush`：每行 `label 左(.text-muted-soft) / value 右`。

### 按钮
- 主操作（扫码登录、保存、接入会话）：`.btn-accent`（暖橙实心）。
- 危险操作（断开连接）：`.btn-outline-danger`（红色描边，圆角对齐 12px）。
- 不在页面里手写按钮底色/圆角，统一走类。

### 徽章 `.badge-soft-*` / `.badge-solid-*`
- 药丸形（`border-radius: 999px`）+ 12px，左右内边距充裕。
- **状态类徽章用实心填充突出**（对齐 front-web 的 错误=实心红 / 耗时=实心橙）：
  - `badge-solid-success`（绿底白字）：在线 / 已连接 / 已配置 / 运行中
  - `badge-solid-error`（红底白字）：会话超时 / 轮询异常 / 错误 / 失败
  - `badge-solid-warning`（橙底白字）：需高亮的警告态
- **中性/非状态信息用软色**：`badge-soft-neutral`（idle/未连接）/ `badge-soft-accent`（待确认等弱提示）/ `badge-soft-success`。

### Tabs `.nav-accent`
- line 风格：底部细线 + 激活项 primary 2px 下划线。
- 定位为「分段切换」，非一级导航替代。

### 表单
- `.form-control` / `.form-select`：`--input` 暖边框 + 12px 圆角 + primary 聚焦环。
- `.form-label`：`--muted-foreground` + 13px + 字重 500。

### 状态点 `.status-dot`
- 9px 圆点：success（暖绿 fg）/ warning（primary 橙）/ neutral（muted）。

---

## 9. 硬性规则

1. **禁止硬编码颜色** — `#xxx` / `rgb()` / `rgba()` 仅允许出现在阴影里，其余必须用 `styles.css` token。
2. **视觉收口到 styles.css** — 按钮/卡片/徽章/输入框样式来自覆盖类，TSX 只做组合与间距。
3. **交互必须有过渡** — 可点击/hover 元素必须有 150ms 过渡。
4. **徽章用药丸形** — `border-radius: 999px` + 软色背景；状态色走 `badge-soft-*`，禁止 `text-bg-*`。
5. **新增颜色 hue 在 38~75** — 与品牌暖橙 hue 52 协调，禁止冷色（蓝/紫/冷灰）。
6. **不引入第二套主色**，不引入页面级平行视觉系统。
7. **深度靠边框 + 柔和阴影** — 禁止重阴影、强渐变、装饰性 chrome。
8. **不为单页好看破坏全局统一** — 改动以 `styles.css` 覆盖层收口为主。

---

## 10. 落地目标

一个新页面/调整若成功，应当让人感觉：**同一个产品、同一个团队、同一套组件语言、同样的暖色品牌**。系统在变得更一致的同时，不应变得更平、更冷，而应更连贯地保持暖色 SaaS 身份。

---

## 附：与参考工程的映射

| 参考工程（Tailwind/shadcn） | 本工程（Bootstrap + styles.css） |
| --- | --- |
| `bg-card` / shadcn `Card` | `.soft-card` |
| `Button variant=default` | `.btn-accent` |
| `Button variant=destructive/outline` | `.btn-outline-danger` |
| shadcn `Badge` + 软状态 | `.badge-soft-success/accent/error/neutral` |
| `Tabs variant=line` + orange underline | `.nav-accent .nav-link.active::after` |
| `text-muted-foreground` | `.text-muted-soft` |
| `transition-interactive`（150ms） | `styles.css` 内各类的 `transition` 声明 |
| Tailwind oklch token（`globals.css`） | `styles.css :root` oklch 变量 |
