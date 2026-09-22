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

## 2. 视觉系统（Court Light）

旧版是深色 + 霓虹辉光 + 132 个互相冲突的重复 CSS 选择器。新版换成一套明亮球场风：

- 令牌层 `css/tokens.css` 是**唯一**允许裸 `#hex` / `rgb()` 的位置；
- 组件层只写 `var(--*)`，全站 0 悬空变量引用；
- 主色 `#1B4DFF`（球场蓝），甲队红 / 乙队蓝是全应用唯一两组高饱和对比色；
- 阴影用浅色主题的柔和分层，不再用霓虹 `box-shadow` 堆叠；
- 动效收敛到 3 档时长 + 3 条缓动，全部走令牌。

### 文件拆分

```
css/tokens.css      令牌层（颜色 / 字号 / 间距 / 圆角 / 阴影 / 动效 / z-index）
css/base.css        reset + 应用外壳 + Tab Bar + 分段控件 + [hidden] 兜底
css/components.css  按钮 / 表单 / 开关 / chip / 选择卡 / 列表 / 空态 / 标签 / 弹层 / toast / 对话框 / 徽章
css/screens.css     4 个 Tab 的页面级排版
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

加载顺序（`nav.js` 必须在 `effects.js` / `ui.js` 之前，后两者在 IIFE 顶部就捕获 `App.nav`）：

```
vendor → store → state → nav → effects → ui → avatars → match → grouping
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
| B8 | 低 | manifest 的 `theme_color` 还是旧浅色 | 改 `#1B4DFF`，与令牌层一致 |
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

- `manifest.json`：UTF-8、`theme_color: #1B4DFF`、`display: standalone`、
  `orientation: portrait`、3 个 shortcuts 深链、`192` + `512 maskable` 图标；
- `sw.js`：`CACHE_NAME = badminton-score-v3`，预缓存 30 个真实文件，
  页面导航走网络优先 + 回退缓存 `index.html`，静态资源走缓存优先 + 后台更新，
  只处理同源 GET；
- 图标：`images/icon-192.png` / `icon-512.png` / `apple-touch-icon.png` / `favicon.svg`，
  由脚本以 4× 超采样光栅化生成，边缘抗锯齿；
- `file://` 打开时自动跳过 SW 注册，不影响本地双击使用。

---

## 8. 验收状态

静态审计全部通过：0 悬空 `var(--*)`（`--dx/--dy` 由 JS 动态注入，非悬空）、0 个 `9xxx` z-index、
CSS `{` 与 `}` 全部配平、分享卡 0 处 `var(--*)`、0 处 `backdrop-filter / oklch / lab / lch / color-mix`
（仅注释里提及）、0 处 inline `onclick`、全部文件 UTF-8 无 BOM、`node --check` 16 个 JS 全过。

浏览器实测（Chrome headless，`http://` 与 `file://` 双通道）：

- 完整比赛流：开始计时 → 得分 → 撤销 → 暂停拦截 → 局末 → 第二局 → 结果弹层 → 保存；
- 存档恢复：刷新后队名、当前分、局分全部还原；恢复后再得分能落盘（B13 快照 bug 回归通过）；
- 三种分组模式、费用三种分摊模式均出结果并入历史；分组历史上限 10 条、可复用、刷新后仍在；
- 快捷操作双击顶栏可唤出（B1 回归通过），并新增 Enter / Space 键盘唤出；
- 排行榜四种口径均可切换，podium 正常出冠亚季军；
- 分享链路：历史行 → 比赛详情 → 「分享这场」→ 分享卡三模板切换 + html2canvas 出图 + 复制文本；
- 设置切换、头像绑定、备份导出均正常；
- 天气卡在未配置 Key 时静默隐藏，0 条外网请求；
- SW 注册成功并进入 `active`，缓存 30 条；
- `file://` 双击打开 4 个 Tab 正常渲染，控制台 0 error、0 请求失败。

### 延后项

- Playwright 视觉回归截图对比；
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
