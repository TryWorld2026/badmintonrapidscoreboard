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
- ~~完整无障碍（ARIA 焦点陷阱、屏幕阅读器语义）~~ → 已完成，见 10.8；
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


---

## 10. 对抗式审查

第 8 节的全量回归只证明了「正常路径能用」。这一节换思路：不按设计意图用，
专门喂脏数据、打空输入、连点、走极端值、劫持键盘和返回键，看它什么时候崩。

### 10.1 结论

六套脚本共 **约 600 次交互，0 ERR，运行期 0 pageerror / 0 console error**：

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `adv1b.js` | 脏 localStorage 轰炸（类型全错 / 超范围 / 脏字符串 / 坏 JSON / 数组当对象 / localStorage 抛异常）、`<img onerror>` 注入、空与边界输入 | 23/23 |
| `adv2.js` | 连点竞态、弹层栈与 Esc 链、深链、前进后退、系统返回键、键盘可达性、6 种视口 + 长文本溢出、分享卡三模板 | 35/35 |
| `verify3.js` | A–M 全量功能回归（第 8 节那套） | 约 100 项全 OK |
| `rendercheck2.js` | 令牌 / 深色底 / LED 比分 / 图标水合 / 横向溢出 / 弹层 / html2canvas 实导出 / 触摸目标 | 全绿 |
| `everybtn3.js` | **无差别点遍 11 个视图里每一个可见 `[data-act]`**，用强化签名判断每次点击是否真有反应（详见 10.6） | 440 次点击 / 0 死按钮 / 0 运行期错误 |
| `exports.js` | 四个导出入口是否真的落盘（而不是静默失败） | 4/4 出文件 |

### 10.2 抓到的 6 个真实缺陷

| # | 缺陷 | 根因 | 修法 |
|---|---|---|---|
| D1 | **得分流水整表变空白**：`scoreHistory` 里混进一条 `null`，`renderPointLog` 抛 `Cannot read properties of null`，整块流水死掉 | 历史数组读取侧零规整，全靠渲染层逐层判空，太容易漏 | `js/state.js` 新增 `objs()` 过滤器，`normalizeMatch.scoreHistory` 与三条历史 getter 全部走它，再做字段级规整 |
| D2 | **费用历史页直接白屏**：`expenseHistory` 含 `null` → `item.type` 抛 TypeError，`nav.go('match','expense')` 整条链路中断 | 同上 | `normExpenseItem`（`js/state.js`） |
| D3 | **少传 amount 产出 NaN 比分**：`updateScore(team)` 时 `oldScore + undefined = NaN`，NaN 灌进 `scoreA` / `scoreHistory`，局末判定、换边提示、得分流水全部失灵 | 公开 API 参数无兜底 | `js/match.js` 的 `updateScore` 对 `amount` 做 `Number()` + `isFinite`，缺省按 +1 |
| D4 | **统计/图表渗 NaN**：`duration: 'abc'` → `totalDuration += 'abc'` → 界面显示 `NaNh`；`date: 'garbage'` → `Invalid Date` | 比赛历史条目从不规整 | `normMatchItem`（`js/state.js`），比分/时长/日期统一转 number，非法日期给合法时间戳 |
| D5 | **路由与 URL 完全脱钩**：`nav.go()` 从不写 `location.hash`，也没有 `popstate`/`hashchange` 监听。后果是①在「数据 › 排行榜」刷新一下又被打回记分页，当前视图丢失；②手动改地址栏 hash / 点站内 hash 链接毫无反应；③安卓物理返回键直接退出应用，连打开中的弹层都关不掉 | 路由只改内存态 | `js/nav.js` 增加 `writeHash`/`readHash`/`applyHash`，`go()` 末尾同步 hash（首次 `replaceState`、后续 `pushState`），接管 `popstate` 与 `hashchange`；`popstate` 时有弹层先关弹层并把状态推回去，不消耗这次返回 |
| D6 | **快捷操作面板全程不可见**：双击顶栏或按 Enter，`#quick-actions` 的 computed `display` 始终是 `none`，功能 100% 失效 | `base.css` 有 `[hidden] { display: none !important }`，压过一切 class；而 `showQuickActions()` 只加 `.show` class，从不动 `hidden` 属性。它是全项目唯一一处这么写的 | `js/settings.js` 改走 `nav.openDialog()` / `nav.closeDialog()`，真的摘掉 `hidden`；顺带接进弹层栈，Esc 也能关（原来只能等 3 秒自动消失），并避免重复压栈导致 Esc 要按两次 |

D6 是最隐蔽的一个：`classList.add('show')` 让 `opacity` 变 1，肉眼扫代码看不出问题，
只有去读 computed style 才发现 `display: none`。前面第 8 节「快捷操作双击顶栏可唤出」之所以
通过，是因为断言写的是 `classList.contains('show')`——**测的是实现而不是效果**。

### 10.3 顺带加固

- `js/nav.go()` 增加 `sub` 合法性校验：不在该 Tab 的二级页清单里就回落到默认二级页。
  否则 `#tab=data&sub=typo` 会留下一个谁都匹配不上的半状态（`route.sub` 是脏值、
  分段控件无高亮、顶栏标题只剩 Tab 名、hash 里也带着垃圾）。
- `js/match.js` 的 `renderPointLog` 跳过坏条目（要求 `oldScore`/`newScore` 非 null 且有限），
  队名与比分走 `ui.escapeHtml`，空表降级为空态。
- `js/grouping.js` `renderHistory` 对 `g` / `p.name` 判空降级，`reuse` 记录损坏时给提示。
- `js/expense.js` / `js/stats.js` 注入 `fmtDate()`，历史日期一律经它格式化；`r-date` 走 `escapeHtml`。

### 10.4 测试脚本自己犯的错（都不是应用缺陷）

对抗脚本第一轮报了 8 个 ERR，逐条查下来**全是脚本写错了**，应用行为本来就对。
记在这里，避免下次再踩：

| 误报 | 真因 |
|---|---|
| 「暂停后连点加分被拦」失败 | 连点计时器 10 次是偶数次，`timerRunning` 回到 `true`，根本没真暂停。改成循环点到真暂停为止 |
| 「Esc 只关最上层」失败 | 互斥逻辑已提前关掉下层，`esc1_detail=false` 是预期。改成断言「只关当前可见的那一层」+ 弹层栈深度归零 |
| 「对话框 Esc 不影响底层 sheet」失败 | `.dialog` 选择器过宽，匹配到无关元素。收窄成 `#confirm-dialog` |
| 「深链落地」3 项失败 | `page.goto(URL + '#hash')` 仅 hash 变化属同文档导航，不触发重载。改成先 `goto('about:blank')` 强制完整加载 |
| 「前进后退与路由同步」失败 | 期望值写错：历史 `[score, data/history, me/settings]` 从末页连退两次停在 `score`，再前进只能到 `data/history` 而不是 `me/settings` |
| 「焦点环」失败 | 把 `style + width` 拼成一个字符串后 `parseFloat` → NaN。实际是 `solid 2px rgb(212,255,63)`，完全正确 |
| 「内容被 Dock 盖住」6 种视口全中 | `#content` 的 `overflow` 是 `visible`，真正的滚动容器是 **document**，`content.scrollTop=` 是无效操作。`contentPadBottom` 94px ≥ dock 62px，实际无遮挡 |
| 「三模板导出」失败 | 模板按钮真实属性是 `data-act="share:tpl"`，我写的 `share:template` 不存在 |
| `addColorStop non-finite` | 对**还没打开**的 `#share-card` 截图 → 尺寸 0 → NaN。可见状态下三模板均正常出图 |
| 「role=button 支持 Enter 唤出」先假阳性后暴露 D6 | 原选择器 `.sheet:not(.hidden)` 是恒真的——本项目的弹层用 `hidden` **属性**而非 `.hidden` **class**。改成 `isOpen()`（查属性 + class + computed style）后立刻照出了 D6 |
| 「运行期 0 error」从未被断言 | `log('errors=' + errs.length)` 是单参数调用，`label` 拿到 `undefined`，永远输出 `OK  undefined`。改成真正的布尔断言 |

最后一条值得单独说：**一个恒真的断言比没有断言更糟**，它会给人「测过了」的错觉。
D6 能活到对抗审查才被发现， partly 就是因为这个。

### 10.5 证据留存

- 脏数据轰炸：11 个页面全部无 `NaN` / `undefined` / `Invalid Date` / `[object Object]`，
  核心动作（加分/撤销/重置/计时/渲染/统计刷新/分组渲染）零抛错，4 张图表仍渲染；
- XSS：队名/玩家名/分组名全程未触发 `<img onerror>`；得分流水与分享卡均已转义，
  `<b>粗体</b><img src=x oner>` 在界面上原样显示为文本；
- 空/边界输入：分组 8 组（空名单、1 人、空白行、3 人、超长名、同名、特殊字符、4 人正常）全过；
  费用 8 组（0 元、空人、超大、小数、负数、份数 0、时长全 0）全过，`|| 1` 已防除零；
- 连点竞态：+1 二十次精确得 20；撤销连点 25 次不穿透负数；暂停后连点全拦；
- 深链：合法深链（排行榜/费用分摊/关于）正确落地，`#tab=bogus` 回退记分，
  只有 `tab` 的深链落默认二级页，空 hash 自写 `#tab=score`；
- 同文档改 hash（手改地址栏 / 点站内链接）被路由接住；
- 返回键：弹层打开时先关弹层，路由不跳、不退出；
- 6 种视口（320×568 / 390×844 / 430×932 / 768×1024 / 1280×800 / 844×390）
  × 11 个二级页全部无横向溢出、无越界元素、无 Dock 遮挡、无异常文案；
- 分享卡三模板均 360 宽、`scale:2` 出 `720×948`，超长队名 + 4 条高光无异常文案；
- `file://` 通道下 hash / history 降级路径正常（`try/catch` 回退 `location.hash`），
  4 Tab 渲染正常、0 error。

### 10.6 点遍每一个按钮

第 10.2 节的 D6 是「功能存在但完全不可用」。这类缺陷靠功能回归是抓不到的——
回归只走设计意图那条路。所以又做了一遍**无差别点击**：把 11 个视图里所有可见的
`[data-act]` 元素逐个点掉，每次点击前后比对一份强化签名（路由 + 弹层栈 +
panel innerHTML 校验和 + 所有 input/select 的值 + `.active`/`.won` 状态校验和 +
完整 localStorage 内容 + toast/dialog/sheet 状态），只要签名一动就算「有反应」。

**结果：440 次点击，0 运行期错误，0 个死按钮。**

第一轮报了 20 个「点了什么都没发生」，逐条查下来全部有合理解释，没有一个是缺陷：

| 现象 | 真相 |
|---|---|
| 17 个导出按钮「无效果」 | 导出走的是文件下载，不改 DOM 也不改 localStorage，签名当然不动。单独写脚本验证过：四个导出入口全部真的落盘——`stats:export` 308B json、`expense:export` 142B txt、`grouping:export` 156B txt、`backup:export` 1854B json |
| `grouping:generate` / `grouping:reuse`「无效果」 | 幂等操作：同一批人 + 同一个模式重新生成，结果当然一样；复用一条已经在展示的历史分组也不会变 |
| `nav:tab` / `nav:sub`「无效果」 | 点到当前已激活的 Tab / 二级页，正确无操作 |
| `match:team-name`「无效果」 | 那是 `<input>`，单击只会上焦点 |
| `grouping:mode` / `expense:mode`「无效果」 | 点到已激活的模式 |

顺带做了两次静态对账，也都干净：

- **data-act ↔ handler**：56 个触发点、60 个 handler，没有「有按钮没 handler」的死按钮；
  5 个 handler 静态找不到触发点（`backup:file` / `match:quick-action` / `me:back` /
  `settings:save` / `ui:copy`），逐个确认是**冗余注册**——功能走的是
  `addEventListener` 直连或另一个 `data-act`，行为正常，只是注册表里留了一条
  永远走不到的线。
- **DOM id 对账**：JS 引用的 126 个 id，3 个在 index.html 和 JS 自建里都找不到——
  `scroller` 有 `|| window` 兜底（有意为之），`games-count-a/b` 是
  `renderGamesWon()` 里两行**带判空保护的死代码**（局分实际渲染进
  `games-won-a/b` 的圆点），不报错也不显示，属于无害残留。

### 10.7 收尾时清掉的一处重复绑定

`js/settings.js` 的 `init()` 里 `bindQuickTrigger()` 被调用了两次（第 292 行和第 304 行），
顶栏标题上因此挂了两份 click / keydown 监听。实测当前行为是对的——单击不弹、
双击才弹、Enter 也弹——因为 D6 修好后 `showQuickActions()` 有「已开着就只续期」
的幂等兜底。但这是白挂一倍的监听，以后往 handler 里加任何非幂等动作就会翻车，
所以把重复的那次调用删掉了。删前删后各跑一遍验证，行为完全一致。

---

### 10.8 补齐无障碍：4 个真缺陷 + 焦点陷阱 / 焦点还原 / 读屏播报

第 8 节「延后项」里唯一与「体验完整」直接相关的就是无障碍。做完发现它不只是「没做优化」，
而是藏着 4 个实打实的缺陷——其中两个让最常用的对话框对读屏用户**完全不存在**。

#### 抓到的 4 个真缺陷

| # | 缺陷 | 后果 |
|---|---|---|
| A1 | `#input-dialog` 的 `aria-labelledby="id-title"` 指向一个**不存在的 id**（真实 id 是 `input-dialog-title`） | 输入对话框没有可访问名称，读屏只报「对话框」 |
| A2 | `#confirm-dialog` 的 `aria-labelledby="cd-title"` 同样断链（真实 id 是 `confirm-title`） | 同上。**每一次「确认清空数据？」都是无名的** |
| A3 | `openDialog()` 从不清 `aria-hidden`，`closeDialog()` 也不恢复 | markup 里写死 `aria-hidden="true"`，于是这两个对话框开着的状态下读屏依然视为不存在。sheet 侧本来是对称的（`openSheet` 置 `false` / `closeSheet` 置 `true`），**dialog 侧整段漏了** |
| A4 | `#quick-actions` 的 `.dialog` 没有 `role` / `aria-modal` / `aria-labelledby` | 快捷操作面板不具备对话框语义 |

A3 是最典型的一类 bug：**不是没写，而是写了一半**。`openSheet` / `closeSheet` 四行代码里三行都在管 `aria-hidden`，
`openDialog` / `closeDialog` 是三行空。这种半成品比全不做更难发现，因为看起来「已经有 aria 了」。

#### 补上的三件事

1. **Tab 焦点陷阱**（`js/nav.js`）
   `aria-modal="true"` 的弹层打开时，Tab 不能跑到背后的页面上。
   实现上取弹层栈顶元素，用 `getClientRects().length > 0` 过滤出真正可见的可聚焦项，
   在首/末元素处 `preventDefault()` 并绕回对面一端。
   没有这一条，键盘用户按几下 Tab 就「穿模」到被遮罩盖住的按钮堆里，
   而鼠标用户永远发现不了。

   > **第一版陷阱自己是漏的**，而且漏得很隐蔽。`if (!top.contains(ev.target)) return;`
   > 让陷阱只在「焦点本来就在弹层内」时才生效。可 `openDialog()` 原先只在有
   > `input/textarea` 时才聚焦——`confirm-dialog` 和 `quick-actions` 都没有输入框，
   > 焦点一直留在背景的触发按钮上。两者一叠加，弹层开着、Tab 照样走进背景，
   > `diag9.js` 实测 6/6 全逃逸。
   > 而 `a11y.js` 第一版却报 22/22 全过——因为那个用例的开场动作恰好把焦点留在了弹层内，
   > **测中了唯一一条走得通的路径**。补了两个洞才对齐：
   > ① `openDialog()` 无输入框时兜底聚焦第一个可见可聚焦项（确认框里那是「取消」，
   > 破坏性操作不当默认焦点，正是想要的）；
   > ② 焦点不在栈顶弹层内时直接 `preventDefault()` 并抓回弹层，不再提前 return。
   > 复测三种开场（焦点在 body / 在背景按钮 / 在弹层内）全部 0 逃逸。

2. **焦点还原**（`js/nav.js`）
   打开第一层弹层时记下 `document.activeElement`，弹层栈清空后把焦点还回去。
   原先关掉「取消」焦点直接掉到 `<body>`，键盘用户得从页首重新 Tab 一遍。
   注意只在**栈空**时还原：互斥关闭、连续开两层都不会误触发。

3. **读屏播报**（`#sr-announce` + `nav.announce()`）
   高光徽章（赛点 / 加分赛 / 大逆转）、成就徽章、胜利横幅三个元素都是 `display:none` 的纯视觉提示，
   读屏用户完全感知不到——而它们恰恰是这款应用**最关键的反馈时刻**。
   做法是加一个常驻无障碍树的 live region，视觉上用 `clip-path: inset(50%)` 藏掉。
   **不能用 `display:none`**：那样元素不在无障碍树里，`aria-live` 根本不会播报——
   这是 live region 最常见的踩坑点。
   `announce()` 对同一句话重复出现时会先清空再延迟 60ms 写入，保证连续两次也能重新播报。
   三个徽章本身保留 `aria-hidden="true"`，避免视觉提示和播报**双重播报**。

#### 验证（`a11y.js`，22/22 OK，0 运行期错误）

- 所有 `role="dialog"` 都有可访问名称（7/7）；文档内 `aria-labelledby` 无断链；
- 三个对话框打开时 `aria-hidden=false`、关闭后 `=true`，且弹层栈关闭后配平为 0；
- 弹层内连按 6 次 / 12 次 Tab，`activeElement` 始终在弹层内；`Shift+Tab` 从首元素回绕到末元素；
- 关弹层后焦点还原到触发它的 Tab 按钮；连续开两层再全关同样还原；
- `#sr-announce` 计算样式 `display=block / clip-path=inset(50%) / 1x1`（在无障碍树里且不可见）；
- 高光 / 成就 / 胜利横幅三类播报内容正确，重复播报走「清空 → 重写」。

#### 顺带确认「无效果」的 20 次点击不是死按钮

`everybtn3.js` 第三轮把 20 次点击标成「无效果且可疑」，逐个查完全部有解：

- **17 个导出按钮**（`expense:export` ×10、`stats:export` ×5、`grouping:export` ×2）
  走 `<a download>` 落盘，不改 DOM，所以签名不动。单独验证三个入口都真的写出文件：
  `分组结果_*.txt` 159B、`费用分摊记录_*.txt` 132B、`羽毛球比赛记录_*.json` 266B。
  注意前两个在各自二级页里，必须先 `nav.go()` 切页再点，否则点到的是 `hidden` 元素；
  `expense:export` 在无费用记录时只弹「还没有费用记录」，是正确空态，不是缺陷。
- **`grouping:generate` ×2**：`diag8.js` 连续生成 12 次拿到 12 种不同结果，确实在重新洗牌；
  「无效果」是因为签名比对的是文本，随机结果偶尔撞车。
- **`grouping:reuse` ×1**：复用上一次分组，渲染结果与当前显示一致时签名不变，属幂等操作。

#### 回归

改动后重跑全部既有套件，无回归：`verify3.js` 96/96、`adv1b.js` 22/22、`adv2.js` 35/35、
`everybtn3.js`（440 次无差别点击）、`rendercheck2.js` 全绿，`file://` 通道同样通过。
