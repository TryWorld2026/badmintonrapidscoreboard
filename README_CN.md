<div align="center">

<!-- 语言切换 -->
<p>
  <a href="README.md">
    <img src="https://img.shields.io/badge/Language-English-blue?style=for-the-badge&logo=google-translate&logoColor=white" alt="English">
  </a>
  <a href="README_CN.md">
    <img src="https://img.shields.io/badge/Language-中文-red?style=for-the-badge&logo=google-translate&logoColor=white" alt="中文">
  </a>
</p>

<!-- 动态标题 -->
<img src="https://readme-typing-svg.herokuapp.com?font=Noto+Sans+SC&weight=600&size=45&duration=3000&pause=1000&color=6839E8&center=true&vCenter=true&width=800&lines=🏸+羽毛球极速计分板;专业+%C2%B7+高级+%C2%B7+极速+%C2%B7+免费" alt="Typing SVG" />

<h3>🚀 为羽毛球爱好者打造的殿堂级计分与管理系统</h3>

<p align="center">
  <img src="https://img.shields.io/badge/版本-3.0.0-6839E8?style=for-the-badge&logo=semver&logoColor=white" alt="Version">
  <img src="https://img.shields.io/badge/许可证-MIT-27F05C?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License">
  <img src="https://img.shields.io/badge/适配-全平台-00D9FF?style=for-the-badge&logo=skype&logoColor=white" alt="Platform">
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/TryWorld2026/badmintonrapidscoreboard?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/TryWorld2026/badmintonrapidscoreboard?style=social" alt="Forks">
  <img src="https://img.shields.io/github/last-commit/TryWorld2026/badmintonrapidscoreboard?color=00CEC9" alt="Last Commit">
</p>

---

[🌐 在线演示](https://tryworld2026.github.io/badmintonrapidscoreboard/) | [✨ 功能特性](#-功能特性) | [🚀 快速开始](#-快速开始) | [❓ 常见问题](#-常见问题)

</div>

## 🌟 为什么它与众不同？

本项目不只是一个简单的计分板，它是一个完整的羽毛球活动生态管理系统。

<p align="center">
  <img src="docs/screenshots/scoreboard.png" width="300" alt="记分界面">
  <img src="docs/screenshots/courtside-landscape.png" width="480" alt="场边模式">
</p>

<table>
<tr>
<td width="33%">

### 💎 极致美学
**仪表读数器**  
中性石墨底 + 精密刻度环，全屏彩色只用于队伍识别。数字用等宽体，读数不跳动。

</td>
<td width="33%">

### 📱 场边模式
**手机架场边，2 米外可读**  
比分放大到 179px，左右半屏轻点加分、长按撤回，自动防息屏。打球时双手持拍，这个模式才是真正在用的那个。

</td>
<td width="33%">

### 📊 深度洞察
**数据驱动分析**  
集成 Chart.js，累计胜率趋势、胜负分布、每月场数与时长分布一目了然，不止记录比分。

</td>
</tr>
<tr>
<td width="33%">

### 👥 智能调度
**公平分组算法**  
支持随机、实力平衡、轮换等多种模式，告别“固定搭档”的尴尬。

</td>
<td width="33%">

### 💰 账单大师
**一键费用分摊**  
内置 AA 制计算器，支持场地、球费、饮水等分类计算，生成美观账单分享。

</td>
<td width="33%">

### 🔐 零风险隐私
**100% 离线可用**  
数据默认只存储在您的浏览器 LocalStorage 中，不登录也不影响使用。

</td>
</tr>
</table>

---

## ✨ 核心功能

### 🏸 专业计分系统
- **实时计时**：精确记录每一场比赛的耗时。
- **撤销机制**：沿得分流水逐步回退，防止比分误触。
- **自动判定**：自动处理加分赛（Deuce）至30分封顶，符合国际羽联规则。
- **胜利动效**：华丽的胜利全屏特效与成就解锁提示。

### 📺 场边模式（v3 新增）
- **超大字报**：横屏比分 179px，按标准标牌算法约 2.2 米舒适可读。
- **半屏即按钮**：左右各占一半宽度、整块可点，闭眼也能按中。
- **手势**：轻点加分，长按（>520ms）撤回上一分。
- **防息屏**：Screen Wake Lock，切后台回来会自动重新申请。
- **降级安全**：全屏 / 锁方向 / 防息屏任一不可用都不影响计分。

### ☁️ 账号与云同步（v3 新增，可选）
- **本地优先**：不登录也完全可用，计分永不等网络 —— 球馆信号差是常态。
- **离线队列**：离线期间的比赛存在本地队列，恢复网络后**自动补推**，无需手动操作。
- **幂等去重**：按 `(owner_id, clientId)` 唯一索引去重，弱网重试不会产生重复记录。
- **多设备**：换设备登录即拉回全部战绩。
- **安全**：密码 PBKDF2（60 万次迭代）；access token 只存内存（XSS 拿不到）；
  refresh token 走 httpOnly cookie，库里只存哈希，且每次刷新轮换 ——
  检测到已撤销令牌被复用会立刻撤销该用户全部令牌。
- **纯本地也完整**：不配后端时账号入口自动隐藏，其余功能一律照常。
- **当前部署状态**：线上只发前端（未配 `api-base`），因此账号入口是隐藏的 ——
  这是预期行为。后端代码在 `server/` 里完整可用，想启用云同步照
  [自部署指南](docs/SELF_HOSTING.md) 起一个 Worker 即可。
- **已实现但尚未接入 UI**：后端的 `clubs` / `sessions` / `rotation`
  共 12 个端点（球局报名、候补递补、公平轮换排程）已实现并通过测试，
  但前端还没有对应界面。保留作为「球局组织」能力的地基。

### 👥 智能分组与费用管理
- **多种模式**：随机分组、实力均衡（强弱搭配）、循环赛制。
- **费用计算**：支持设置总额、人头分摊、自定义比例，一键复制结果。

### 📊 个人能力画像
- **选手档案**：核心数据、四项排名、最近 5 场走势与自动生成的选手标签。
- **排行榜**：基于胜率、场次、时长的多维度实时排名。
- **成就系统**：12个精心设计的勋章，记录你从“初次登场”到“羽坛王者”的进阶。

---

## 🎨 视觉设计

只做了一套针对球馆环境调校的深色界面，没有主题切换功能。

**设计前提**：手机架在场边、人站在 2 米外、一手汗一手拍。这套界面的每一条规则都由它推导。

- 🌑 **中性石墨**：`#101113` 底色 + 三阶表面。不用纯黑（保留层次），不用荧光（球馆灯下刺眼）。
- 🎯 **队伍识别**：信号红 `#E1554A` 对仪表蓝 `#3E8FD9`——全应用**仅此两组饱和色**，只出现在队伍相关处。
- ⭕ **刻度环签名**：比分外圈 40 格精密刻度（纯 CSS `conic-gradient` + `mask`）。领先方刻度转亮，落后方整体降调——**用刻度表达状态，而不是发光**。
- 🔢 **数字优先**：比分与计时用等宽字体 + `tabular-nums`，逐帧变化不跳动。
- ♿ **可访问性**：全部触摸目标 ≥ 44×44（实测 11 个视图 0 例外），对比度过 WCAG AA
  （由 `tools/audit-ui.js` 逐视图逐元素核算，含大字号放宽规则），焦点陷阱与读屏播报齐备，
  iOS 刘海安全区（`safe-area-inset-top`）已接进顶栏与全屏覆盖层。

### 刻意不做的事

旧版（v2）用的是「转播车」语言：`#D4FF3F` 高压电荧光、切角 `clip-path`、扫描线、Impact 斜体数字、辉光描边。这些在 v3 中被**逐条移除**——荧光色是廉价感的头号来源，装饰叠加不等于质感。

---

## 🚀 快速开始

### 方案 A：即开即用（推荐）⭐
点击 [在线演示](https://tryworld2026.github.io/badmintonrapidscoreboard/) 链接，直接在浏览器中开始你的第一场比赛。

Cloudflare Pages 镜像（同一份代码，HTTPS + 边缘缓存）：

| 地址 | 说明 |
|---|---|
| https://badminton.tryworld.com.cn/ | 自定义域名，挂在 `tryworld.com.cn` zone 下，已代理 |
| https://badminton-score.pages.dev/ | 默认 `*.pages.dev` 域名 |

### 方案 B：本地部署
```bash
# 克隆项目
git clone https://github.com/TryWorld2026/badmintonrapidscoreboard.git

# 进入目录
cd badmintonrapidscoreboard

# 使用 Python 启动（推荐，可获得最佳 PWA 体验）
python -m http.server 8000
```

---

## 🛠️ 技术底座

本项目坚持 **"Vanilla First"** 原则，以最轻量的体积实现最强大的功能：

- **前端**：HTML5, CSS3 (Modern Flex & Grid), ES6+ JavaScript —— **零构建**，`file://` 双击即可运行
- **图表**：[Chart.js](https://www.chartjs.org/) - 强大的数据可视化
- **渲染**：[html2canvas](https://html2canvas.hertzen.com/) - 生成精美的分享卡片
- **存储**：LocalStorage（本机），可选云同步到 Cloudflare
- **后端（可选）**：Cloudflare Workers + D1（SQLite）+ KV，零依赖手写路由
- **部署**：前端纯静态可放任意托管；后端一条 `wrangler deploy`

详细步骤见 [自部署指南](docs/SELF_HOSTING.md)。

---

## 🧪 回归测试

项目自带一套零依赖的回归测试：开一个 iframe 加载**真实的** `index.html`，断言全部打在发布物本身（同一个 `App` 命名空间、同一份 DOM），而不是 DOM 替身——替身只能证明替身是对的。

### 方式 A：命令行（推荐，CI 用这个）

```bash
node tools/test-all.mjs
```

一条命令跑完六套检查（前端逻辑 / 令牌一致性 / 界面质量 / 后端类型 / 后端接口 / 前后端联调），
用**退出码**表达成败：`0` = 全绿，`1` = 有失败。

没启动后端时会自动跳过依赖它的两套，并明确提示「结论不完整」——不会给假的全绿。

发布前另跑一条 `node tools/check-release.js`：校验版本号五处一致、
`sw.js` 预缓存清单与磁盘双向对应、`CACHE_NAME` 是否漏 bump、
部署脚本的逐目录期望值与实际一致。这四类问题都「不报错、测试全绿、线上才出事」。

也可以单独跑：`node tools/run-tests.js`（前端 61 条）、`node tools/audit-tokens.js`、
`node tools/audit-ui.js`、`cd server && node tools/test-api.mjs`（后端 95 条）、
`node tools/test-sync.mjs`（联调 37 条）。

### 方式 B：浏览器里看

```bash
# 测试必须走 http 通道（file:// 下 iframe 跨域取不到 App，Service Worker 也不注册）
python -m http.server 8899

# 浏览器打开
# http://127.0.0.1:8899/test.html
```

用例覆盖计分规则、存档规整、费用分摊、智能分组、统计与图表、弹层、视觉令牌、
场边模式、事件总线、存档迁移、布局约束与 PWA，每条都对应一处**真实修复过的缺陷**。

当前 **前端 61 / 后端 95 / 联调 37**，合计 **193 条断言全绿**。每条用例都做过
**双向变异验证**——故意把对应缺陷改回去，确认用例真的会红。这不是形式主义：
开发过程中就有 4 条用例第一版**测不出对应的 bug**（合成 `click` 碰不到 `pointerdown` 路径；
令牌审计漏扫新加的 CSS 文件；变异脚本锚点用了 LF 而目标是 CRLF；测试自己漏调保存函数），
变异验证把它们当场抓了出来。

`tools/audit-ui.js` 逐视图校验**触摸目标、溢出、旧配色、WCAG AA 对比度、
滚到底是否被底部栏遮挡**。后两项是 v3.0.0 补的：原来没有对比度检查，
于是 `--fg-3` 对四个底色面全部低于 4.5:1 也没人发现；原来也从不滚到底部，
于是「Dock 永久遮住 49px 内容」的选择器笔误一直没被抓到。

### 令牌一致性审计

```bash
node tools/audit-tokens.js
```

扫描全部 CSS / JS / HTML，找出「被 `var(--x)` 引用但没有定义」的令牌。这类问题不会报错，只会让属性静默失效（颜色退回继承值），视觉重构时最容易漏——本次重构就靠它抓出 3 个（`--fw-black` / `--dock-h` / `--z-highlight`）。

### 界面质量审计

```bash
node tools/audit-ui.js
```

逐页检查 11 个视图 + 5 个场边视口，报四类「不报错但体验已经坏掉」的问题：

| 检查项 | 为什么重要 |
|---|---|
| 触摸目标 < 44×44 | 球馆里一手汗一手拍，按不中就等于没这个按钮 |
| 横向 / 纵向溢出 | 小屏出现横向滚动条是最常见的移动端事故 |
| 遗留旧配色 | 视觉重构后最容易漏掉某处硬编码色值 |
| 场边可读距离 | 按标牌经验法则换算成「多少米外能看清」 |

当前结果：**11 个视图全部通过**（0 个过小触摸目标、0 处溢出、0 处旧色），场边模式横屏舒适可读 **2.0–2.2 米**。

无障碍方面另有 Lighthouse 实测背书：`accessibility` / `best-practices` / `SEO` 三项均为 **1.00**（对比度全部过 WCAG AA，`robots.txt` 已就位）。

---

## 🤝 参与贡献

我们非常欢迎开发者参与到项目中来！

1. **Fork** 本仓库
2. **Create** 你的功能分支 (`git checkout -b feature/AmazingFeature`)
3. **Commit** 你的修改 (`git commit -m 'Add some AmazingFeature'`)
4. **Push** 分支 (`git push origin feature/AmazingFeature`)
5. **Open** 一个 Pull Request

---

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE) 授权。您可以自由使用、修改和分发。

---

<div align="center">

### 👨‍💻 作者
**TryWorld**  
热爱编程，热爱羽毛球 🏸

[![GitHub](https://img.shields.io/badge/GitHub-TryWorld2026-181717?style=for-the-badge&logo=github)](https://github.com/TryWorld2026)

**如果这个项目对你有帮助，请点一个 ⭐ Star 支持一下！**

<img src="https://api.star-history.com/svg?repos=TryWorld2026/badmintonrapidscoreboard&type=Date" alt="Star History Chart" width="600">

</div>