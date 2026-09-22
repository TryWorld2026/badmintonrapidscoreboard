# 重构说明 — 羽毛球极速记分板 v2.0.0

分支：`refactor/ia-v4`（未合并、未推送）

本次重构在**完整保留全部功能与数据结构**的前提下，重做了信息架构、视觉系统和工程组织。
计分规则、分组算法、费用计算、成就判定等业务逻辑逐条对齐旧版，localStorage 的 10 个键名与
字段结构逐字不变，老用户数据零迁移直接可用。

---

## 1. 信息架构重构

旧版是 5 个平级「screen」，靠 `switchScreen()` 切换（该函数在旧代码里**从未定义**，
所以顶栏快捷操作一点就报错）。新版改成移动端惯用的「底部 Tab Bar + 二级页」两层结构。

| 旧结构（screen） | 新结构（Tab / 二级页） |
|---|---|
| `score` 记分板 | **Tab 1 记分**（比分板 + 底部 Dock + 结果弹层 + 分享卡） |
| `grouping` 智能分组 | **Tab 2 对战** › 智能分组 |
| `expense` 费用分摊 | **Tab 2 对战** › 费用分摊 |
| `stats` 数据统计 | **Tab 3 数据** › 历史 / 排行榜 / 能力分析 / 成就 |
| `settings` 设置 | **Tab 4 我的** › 设置 / 头像管理 / 数据备份 / 关于 |
| `history` 历史记录 | **Tab 3 数据** › 历史 |
| `achievements` 成就 | **Tab 3 数据** › 成就 |
| `about` 关于 | **Tab 4 我的** › 关于 |
| `avatars` 头像管理 | **Tab 4 我的** › 头像管理 |
| `backup` 数据备份 | **Tab 4 我的** › 数据备份 |

导航由 `js/nav.js` 统一管理：

- `nav.go(tab, sub)` 是唯一入口，维护 `App.state.route`；
- 支持深链接 `index.html#tab=match&sub=expense`，PWA 快捷方式直接落地到二级页；
- `data-act="ns:name"` + 单一 `document` 级事件委托取代全部 inline `onclick`。

---

## 2. 视觉系统（VOLT TRUCK）

### 2.1 为什么推倒重来

第一版做完后视觉上是「通用后台模板」：浅灰底 + 白卡 + 大红大蓝主色 + 215 个 emoji 当图标
+ 83 处 16–28px 圆角 + 61 处多层软阴影。这些正是「AI 生成前端」最典型的几处指纹，逐条对账：

| AI 味特征 | 原状 | 现状 |
|---|---|---|
| 主题做反 | `#F4F6F9` 浅灰 + 白卡，像 SaaS 后台 | `#0A0E13` 深色演播室，三层 surface 拉开层次 |
| emoji 当图标 | 215 个，html 42 / ui 52 / stats 30 … | **0 个 UI emoji**，51 枚线性 SVG（剩 3 个全是用户口径内容） |
| 圆角滥用 | 卡片 16–28px，像 Material Demo | 硬矩形 2–4px + 转播车速切角 |
| 软阴影堆叠 | 3–4 层 blur，浅色主题投影 | 压深黑影 + `inset 0 1px 0 rgba(255,255,255,.04)` 金属高光边 |
| 无几何语言 | 0 处 `clip-path` | `--cut` / `--cut-sm` / `--cut-xs` 切角体系 |
| 图标系统缺失 | SVG 图标 1 个，等于没有 | `js/icons.js` 51 枚 + 声明式水合 |
| 配色通用 | `#E5484D` / `#0090FF` 红蓝 | 玫红 `#FF2E63` / 电青 `#00E5FF` + VOLT `#D4FF3F` |

结论：问题不在「某个颜色不好看」，而在整套视觉是从通用组件库借来的，与「羽毛球转播计分板」
这个题材毫无关系。所以第二版不再调色，而是换了一套**题材内生的图形语言**。

### 2.2 VOLT TRUCK 图形包

参照对象是转播车的比分条（score bug / lower third）：深色底、硬边块、速切角、LED 数字、
发丝线分隔、高压电单色高亮。令牌层 `css/tokens.css`：

| 语义 | 令牌 | 值 |
|---|---|---|
| 演播室底 | `--c-bg` | `#0A0E13`（不用纯黑，保留层次） |
| 三阶表面 | `--c-surface` / `-2` / `-3` | `#111721` / `#171F2B` / `#1F2937` |
| 发丝线 | `--c-line` / `--c-line-strong` | `#222C3A` / `#2E3A4A` |
| 文本 | `--c-text` / `-2` / `-3` | `#F0F4F8` / `#8A94A3` / `#5A6472` |
| **签名色** | `--c-brand` | `#D4FF3F`（VOLT 高压电，唯一高亮行动色） |
| 队伍 A | `--c-team-a` | `#FF2E63` 玫红 |
| 队伍 B | `--c-team-b` | `#00E5FF` 电青 |
| 语义 | success / danger / gold | `#2EE6A8` / `#FF4D4D` / `#FFB627` |
| 比分字 | `--font-display` | Impact 栈 + italic + `skewX(-7deg)`，模拟记分牌 LED |
| UI 字 | `--font-ui` | 刻意**不用** `-apple-system` 打头，避免通用系统味 |
| 切角 | `--chamfer` / `--cut` | 10px，切右上 + 左下 |

衍生手法：body 叠扫描线 + 球场 repeating-linear-gradient；比分 `text-shadow: 0 0 32px 队伍色`；
live 发球点双层 box-shadow 辉光；卡片 `inset 0 1px 0 rgba(255,255,255,.04)` 金属边；
小标签全大写 + `letter-spacing:.12em`。

### 2.3 切角：为什么不用 `clip-path`

`clip-path` 会把元素的 `outline` 焦点环**一起裁掉**，键盘用户按 Tab 时焦点框被切掉半截。
可访问性优先，所以填充块改用「角落双渐变」裁切：

```css
background-image:
    linear-gradient(225deg, transparent 50%, var(--fill) 50%) top right / (C*2) (C*2) no-repeat,
    linear-gradient(45deg,  transparent 50%, var(--fill) 50%) bottom left / (C*2) (C*2) no-repeat;
```

元素本身不被 clip，焦点环完整。每个填充组件只设局部 `--fill`，hover 改 `--fill` 即可，
两枚切角渐变自动跟随。`clip-path: var(--cut)` 只留给**没有焦点需求**的纯填充块
（桌面 sheet、胜利横幅、能力头像等）。

### 2.4 图标系统 `js/icons.js`

51 枚 24×24 viewBox、1.6px 描边、圆角线帽的线性 SVG，全部 `currentColor` 跟随，
`width:1em` 所以字号即图标号。两种基元：`S()` 描边型、`F()` 实心型。

markup 侧写声明式占位符，运行时水合成真 SVG：

```html
<span class="ic-box" data-icon="chart"></span>
```

水合入口 `App.icons.hydrate(root)` 由 `js/app.js` 在 `boot()` 第 0 步执行一次，并挂
MutationObserver 兜住 JS 后续动态插入的节点（分组删除按钮、成就卡、podium 奖牌等），
所以不需要在每个渲染函数里手动补调用。水合后占位移除 `data-icon`、改标 `data-icon-done`，
重复水合是幂等的。

### 2.5 文件拆分

```
css/tokens.css      令牌层（颜色 / 字号 / 间距 / 圆角 / 阴影 / 动效 / z-index / 切角）
css/base.css        reset + 应用外壳 + Tab Bar + 分段控件 + [hidden] 兜底
css/components.css  按钮 / 表单 / 开关 / chip / 选择卡 / 列表 / 空态 / 标签 / 弹层 / toast / 对话框 / 徽章
css/screens.css     4 个 Tab 的页面级排版 + 转播 score-bug 比分板
css/effects.css     彩带 / 烟花 / 胜利横幅 / 得分脉冲 / 骨架 / 震动
css/share-card.css  分享卡（全字面量，零 var(--*)）
```

`css/share-card.css` 刻意与令牌层隔离：html2canvas 无法解析自定义属性和现代颜色函数，
所以分享卡内部一律写字面量，且禁用 `oklch() / lab() / lch() / color-mix() / backdrop-filter`。

---

## 3. 工程组织

从单个 342 KB / 9607 行的 `index.html` 拆成：

```
index.html              ~45 KB   纯 markup，零 inline 事件
manifest.json                   PWA 清单（UTF-8）
sw.js                           离线缓存（UTF-8）
vendor/chart.umd.min.js         Chart.js 本地化
vendor/html2canvas.min.js       html2canvas 本地化
css/*.css                       6 个
js/icons.js                     51 枚线性 SVG 图标库 + 声明式水合
js/store.js                     localStorage 读写（try/catch + 内存降级）
js/state.js                     单一数据源 + normalize + 历史上限
js/effects.js                   彩带 / 烟花 / 音效 / 震动
js/ui.js                        对话框 / 徽章 / 剪贴板 / 下载 / 天气 / 新手引导
js/nav.js                       路由 / Tab Bar / 弹层栈 / 事件委托
js/avatars.js                   32 个 emoji 头像绑定
js/match.js                     计分逻辑
js/grouping.js                  三分组算法
js/expense.js                   三模式分摊
js/charts.js                    4 张图表
js/stats.js                     概览 / 历史 / 排行榜 / 能力分析
js/achievements.js              12 枚成就
js/share.js                     3 模板分享卡
js/settings.js                  设置 / 备份 / 关于 / 我的 / 快捷操作
js/app.js                       启动引导 + SW 注册
```

仍然使用经典 `<script>` 标签 + 单一 `App` 命名空间，**不用 ES modules**，
保证 `file://` 双击直接打开也能跑。

加载顺序（`icons.js` 必须在 `nav.js` 之前，因为 nav 渲染 Tab Bar 时就要取图标；
`nav.js` 必须在 `effects.js` / `ui.js` 之前，后两者在 IIFE 顶部就捕获 `App.nav`）：

```
vendor → icons → store → state → nav → effects → ui → avatars → match → grouping
→ expense → charts → stats → achievements → share → settings → app
```

---

## 4. 修复的 bug

| # | 严重度 | 问题 | 修复 |
|---|---|---|---|
| B1 | 高 | `switchScreen()` 从未定义，顶栏快捷操作点击即报错 | 由 `nav.go()` 取代，快捷操作改走 `match.quickAction()` |
| B2 | 高 | `loadMatchState()` 往不存在的 `games-score` 写入 → TypeError | 改 `games-count-a/b`，读取侧宽松 normalize |
| B3 | 中 | 对 `<input>` 元素设 `.textContent`，队名刷新后丢失 | 改 `team-a-name.value` |
| B4 | 中 | 4 个死 markup id（引用了不存在的元素） | 随 markup 重写消解 |
| B5 | 中 | 81 处 inline `onclick`，其中 31 处在非 button 元素上，键盘无法触及 | 全部改 `data-act` + 委托；非 button 元素补 `role="button"` + `tabindex="0"` + Enter/Space 激活 |
| B6 | 中 | `manifest.json` / `sw.js` 是 GBK 乱码 | 重写为 UTF-8 无 BOM |
| B7 | 中 | SW 预缓存了不存在的图标文件 → `install` 失败，整个 SW 注册无效 | 补齐 4 个图标文件；缓存清单只列真实文件；逐条 `add` 单条失败不影响 install |
| B8 | 低 | manifest 的 `theme_color` 还是旧浅色 | 改 `#0A0E13`，与令牌层一致 |
| B9 | 低 | 天气 API Key 硬编码在前端 | 改为读 `settings.weatherKey`，未配置时不发请求、卡片静默隐藏 |
| B10 | — | 132 个重复冲突的 CSS 选择器 | 重写后自然消解 |
| B11 | 高 | 排行榜口径切换（胜场/场次/胜率/时长）被 `buildSegmented()` 清空 → 4 个按钮消失，口径永远锁在「胜场」 | `buildSegmented()` 只重建 `data-for` 指向某个 Tab 的分段控件，静态 markup（排行榜自己的）保留原样 |
| B12 | 高 | 两个 sheet 同时打开会互相叠住：从比赛详情进分享后，下层 `match-detail-sheet` 挡住分享页所有控件，且 Esc 只能关最上层、永远关不掉下层 | `openSheet()` 增加同层互斥，开新 sheet 前关闭其他可见 sheet；`.sheet-backdrop` 补 `pointer-events` 门控 |
| B13 | 中 | `state.js` 导出的是 `state` 属性的快照副本，赋值后 `save*()` 读到的仍是闭包旧值 | 改为导出 `state` 对象本身，方法挂到同一对象上 |
| B14 | 高 | `fx.beep is not a function`：`endGame()` 在 `currentGame++` 之前抛异常 → 局数卡住、比分不清零 | 补导出 `beep`；`currentGame++` 移到副作用之前并用 `safe()` 包裹 |
| B15 | 高 | `initCharts()` 在同一 canvas 上重复 `new Chart()` → `Canvas is already in use` | 初始化前先 `destroy()` |
| B16 | 中 | 能力标签三元表达式：数组分支 `.map()`、空列表分支返回字符串，对字符串调 `.join` | 两条分支都返回数组 |
| B17 | 中 | 分组历史永远为空：`generate()` 只存 `lastGroups`，从不 `pushGroupingHistory()` | 补上 push，并调 `renderHistory()` 刷新列表 |

### 重构过程中新发现并修掉的接线问题

- `nav.go()` 调 `App.me.onEnter`，但模块实际叫 `App.settings` → 改对；
- `.segmented[data-for="leaderboard"]`（排行榜自己的口径切换）会被 `nav.go` 误加 `hidden` → 只处理 `data-for` 指向某个 Tab 的分段控件；
- `buildSegmented()` 会把静态 markup 的 segmented 一并清空 → 与上条同源，已按同样口径修掉；
- `renderBackupStats()` 只填 `backup-stats`，「数据备份」子页的容器是 `backup-stats-sub` → 两个都填；
- `about-storage-2` 从未被赋值 → `renderAbout()` 补上；
- `result-hl-count` 在 markup 里存在但 JS 从不赋值 → 补上；
- `match-detail-sheet` 里的 `md-share-btn` 硬编码 `data-index="0" 且 hidden` → 删除该按钮；**后又发现 `share:from-history` 成了死链路**，改为在 `showMatchDetail()` 里动态设 `data-index` 后把按钮放回；
- 输入对话框按 Enter 不确认 → 补 `keydown` 处理，Esc 仍走 nav 的关层逻辑；
- click 委托对 `<select>` 会重复派发（click + change 各一次）→ click 分支跳过 `SELECT`；
- `.highlight-badge.show` 从未应用 `highlightIn` 动画 → 补 `.show` / `.hide` 两条规则并同步 JS 类名；
- `settings.js` 用了未定义的 `set()` → 补本地助手函数；
- `effects.js` / `ui.js` 在 IIFE 顶部捕获 `App.nav`，但脚本顺序排在 `nav.js` 后面 → 调整加载顺序；
- `[hidden]` 被组件层的 `display:flex/block` 覆盖 → `base.css` 加 `[hidden]{display:none!important}` 兜底；
- `#appbar-title` 是纯 `<h1>`，快捷操作只能鼠标双击 → 补 `role="button"` + `tabindex="0"` + Enter/Space 唤出 + `:focus-visible` 焦点环。

---

## 5. 数据兼容

10 个 localStorage 键，键名与结构逐字保留：

| 键 | 内容 | 上限 |
|---|---|---|
| `matchState` | 当前比赛状态 | 1 |
| `matchHistory` | 比赛历史 | 不限 |
| `groupingHistory` | 分组历史 | 10 |
| `expenseHistory` | 费用历史 | 20 |
| `settings` | 偏好设置 | 1 |
| `achievementStats` | 成就进度 | 1 |
| `unlockedAchievements` | 已解锁成就 | 1 |
| `playerAvatars` | 头像绑定 | 1 |
| `hasSeenOnboarding` | 引导标记 | 1 |
| `lastGroups` | 上次分组 | 1 |

读取侧全部走宽松 normalize，旧数据的缺字段/错类型不会抛错，只回退默认值。
上限只在写入时裁剪，不会改动已有条目的内容。

---

## 6. 逐条对齐的业务规则

以下规则从旧源码逐行核对后照搬，**未做任何「优化」**：

- `updateScore` / `undoScore` 要求 `timerRunning`，否则 toast「请先点击开始比赛」；
- 换边：21 分制 11 分、15 分制 8 分、11 分制 6 分、自定义 `floor(target/2)+1`；
- 局末判定：开 deuce 时 `>=30` 直接封顶，或 `>=target` 且分差 `>=2`；关 deuce 时同规则，
  双达标额外提示平局；
- `endGame`：`bestOfThree` 恒为 `true`，`gamesWon >= 2` 出结果，否则 `currentGame++` 并重置本局；
- 高光：deuce 需双方 `>=20`（每局一次）、matchpoint 需 `>=target-1`（每局一次）、
  comeback 需领先反转且反转前分差 `>5`；
- 高光汇总：deuce / comeback / 一方为 0 判零封胜利；
- 成就进度 `updateMatchAchievements(won, perfectWin, hadDeuce)`，
  `perfectWin = 一方 0 且另一方 >0`，`hadDeuce = 双方 >=20`；
- 分组：`random` 洗牌后两两切分（奇数并入上一组）、`balanced` 排序后最强配最弱、
  `rotation` 全组合；
- 费用：`equal` 人均、`custom` 按份数比例、`time` 按 `hourlyRate = total/(totalTime/60)` 折算；
- 统计：`splitPlayers` 用 `/[\/、]/` 拆分；排行榜排序权重 `[1, 0, 2]`；
  `generateRealTags` 9 条阈值不变；
- 成就 12 枚的 id / icon / title / desc / type / value 逐字一致；
- 头像 32 个 emoji 列表逐字一致。

---

## 7. PWA

- `manifest.json`：UTF-8、`theme_color: #0A0E13`、`background_color: #0A0E13`、
  `display: standalone`、`orientation: portrait`、3 个 shortcuts 深链、
  `192` + `512 maskable` 图标；
- `sw.js`：`CACHE_NAME = badminton-score-v4`，预缓存 31 个真实文件（含新增的 `js/icons.js`），
  页面导航走网络优先 + 回退缓存 `index.html`，静态资源走缓存优先 + 后台更新，
  只处理同源 GET；
- 图标：`images/icon-192.png` / `icon-512.png` / `apple-touch-icon.png` / `favicon.svg`
  已按 VOLT 深色版重做（Playwright + Chrome 光栅化）；
- `file://` 打开时自动跳过 SW 注册，不影响本地双击使用。

---

## 8. 验收状态

### 静态审计

- `node --check`：16 个 JS + `sw.js` 全部通过；
- `manifest.json` JSON 合法，全文件 UTF-8 无 BOM；
- CSS 引用的未定义 token 23 处，逐条核对后**全部为误报**：
  `--fill`（组件局部自定义属性）、`--dx/--rot/--fdur/--dy`（JS inline 注入）、
  `--r-xs` / `--dock-h` 已改带回落值 `var(--x, fallback)`；
- 图标名引用 0 处错误：html 40 个 `data-icon` + 全部 `App.icons.icon()` 调用都命中注册表；
- 39 个必须保留的 DOM id 全部存在；
- `share-card.css` 的 `var()` / `oklch` / `lab` / `color-mix` / `backdrop-filter` / `clip-path` /
  `gap` / `grid` 命中 5 处，**全在注释说明文字里**，实际规则 0 违规。

### 渲染指标（Chrome headless，420×900）

- 令牌全部解析：`--c-bg = #0A0E13`、`--c-brand = #D4FF3F`、`--cut` 正常展开；
- `body` 背景 `rgb(10,14,19)` + 扫描线 repeating-linear-gradient；
- `.score-num` 84px、Impact 斜体、`text-shadow: rgba(255,46,99,.55) 0 0 32px`；
- `.btn-primary` 伏特填充 `rgb(212,255,63)` + 深墨字 + `--glow-brand`，圆角 2px；
- `.scoreboard-vs` / `.score-team-tag` 的 `clip-path` 切角正常生效；
- Tab Bar 激活项 `rgb(212,255,63)`，非激活 `rgb(90,100,114)`；
- 图标水合：51 枚注册，首屏注入 49 个 `svg`，**残留 `data-icon` 占位 0 个**；
- 4 个 Tab 均无横向溢出（`scrollWidth == clientWidth`），无 < 32×28 的触摸目标；
- html2canvas 实导出 `720×808`，非透明采样 582，深色渐变模板正确。

### 浏览器实测（`http://` 与 `file://` 双通道）

- 完整比赛流：开始计时 → 得分 → 撤销 → 暂停拦截 → 局末 → 第二局 → 结果弹层 → 保存；
- 存档恢复：刷新后队名、当前分、局分全部还原；恢复后再得分能落盘（B13 快照 bug 回归通过）；
- 三种分组模式、费用三种分摊模式均出结果并入历史；分组历史上限 10 条、可复用、刷新后仍在；
- 快捷操作双击顶栏可唤出（B1 回归通过），并新增 Enter / Space 键盘唤出；
- 排行榜四种口径均可切换，podium 正常出冠亚季军；
- 分享链路：历史行 → 比赛详情 → 「分享这场」→ 分享卡三模板切换 + html2canvas 出图 + 复制文本；
- 设置切换、头像绑定、备份导出均正常；
- 天气卡在未配置 Key 时静默隐藏，0 条外网请求；
- SW 注册成功并进入 `active`，缓存 31 条；
- `file://` 双击打开 4 个 Tab 正常渲染，控制台 0 error、0 请求失败；
- 全量回归脚本（A–M 共 13 组、约 90 项断言）**0 ERR**。

### 延后项

- Playwright 视觉回归截图对比（当前用文字化渲染指标替代）；
- 完整无障碍（ARIA 焦点陷阱、屏幕阅读器语义）；
- 天气 API Key 改后端代理。

---

## 9. 工程红线（本次重构全程遵守）

1. 令牌层是唯一允许裸 `#hex` / `rgb()` 的位置；
2. 分享卡 / html2canvas 路径只用字面量，禁 `oklch() / lab() / color-mix() / backdrop-filter`；
3. 经典 `<script>` + 单一 `App` 命名空间，不用 ES modules（保 `file://`）；
4. 不改计分 / 分组 / 费用 / 成就的业务规则；
5. 不改 localStorage 键名与数据结构；
6. 不加新功能、不做后端；
7. 不 push、不合并 `main`。
