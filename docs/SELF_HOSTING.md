# 自部署指南

两种部署形态，按需选择：

| 形态 | 需要什么 | 得到什么 | 适合谁 |
|---|---|---|---|
| **A. 纯静态** | 任意静态托管 | 计分 / 分组 / 费用 / 统计 / 场边模式 | 只想自己用，不要账号 |
| **B. 静态 + 后端** | Cloudflare 账号 | 上面全部 + 账号 / 云同步 / 俱乐部 / 球局 | 想多设备同步、和球友共用 |

**形态 A 一行命令就能跑**，而且功能完整 —— 这是刻意的：
不联网、不注册也必须能计分。

---

## 形态 A：纯静态

```bash
git clone https://github.com/TryWorld2026/badmintonrapidscoreboard.git
cd badmintonrapidscoreboard
python -m http.server 8000
```

打开 <http://127.0.0.1:8000> 即可。

数据全部存在浏览器 localStorage。`index.html` 里的
`<meta name="api-base">` 留空即代表"纯本地模式"，账号卡片会自动隐藏。

部署到任意静态托管（GitHub Pages / Netlify / Vercel / 对象存储）都可以，
把仓库根目录直接传上去即可 —— **前端零构建**。

---

## 形态 B：静态 + Cloudflare 后端

### 前置

- Cloudflare 账号（免费额度足够个人/小团队使用）
- Node.js 18+
- `npx wrangler` 可用（或用你本地的 wrangler）

### 1. 建数据库

```bash
cd server
npx wrangler d1 create badminton
```

把返回的 `database_id` 填进 `server/wrangler.toml`。

> ⚠️ `wrangler.toml` 里的 `database_id` 是占位符。
> 不填的话 `wrangler deploy` 会直接报错 —— 这是刻意的：
> 宁可部署失败，也不要静默连到一个不存在的库。

### 2. 建表

```bash
npx wrangler d1 execute badminton --remote --file=./migrations/0001_init.sql
```

### 3.（可选但建议）建 KV 用于限流

```bash
npx wrangler kv namespace create RATE_LIMIT
```

把返回的 id 填进 `wrangler.toml` 的 `[[kv_namespaces]]`。

> 不配也能跑：`middleware/auth.ts` 里有限流降级逻辑。
> 但没有限流意味着 `/api/auth/login` 可以被暴力破解，
> **生产环境强烈建议配上**。

### 4. 设置密钥

```bash
# 生成一个随机密钥（至少 32 字符）
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 写入生产环境的 secret
npx wrangler secret put JWT_SECRET
```

> 密钥太短会在启动时被拒绝（见 `server/src/lib/tokens.ts`）。
> 这不是刁难 —— 短密钥等于没有签名，任何人都能伪造登录令牌。

### 5. 部署后端

```bash
npx wrangler deploy
```

记下输出的 Worker 地址，例如
`https://badminton-score-api.你的子域.workers.dev`。

### 6. 让前端指向后端

编辑 `index.html`：

```html
<meta name="api-base" content="https://badminton-score-api.你的子域.workers.dev">
```

提交并部署你的静态站点。

> 也可以不改文件：用 `?api=https://...` 临时覆盖，
> 适合先验证再固化。

### 7. 配置 CORS 白名单

在 `server/wrangler.toml` 里改 `CORS_ORIGINS`，填入你实际的站点地址：

```toml
CORS_ORIGINS = "https://你的域名,https://你的用户名.github.io"
```

然后重新 `npx wrangler deploy`。

> 不要写 `*`：带 cookie 的刷新请求在 `*` 下会被浏览器直接拒绝，
> 而且 `*` 意味着任何网站都能调用你的 API。

### 8. 验证

```bash
# 后端存活与依赖检查
curl https://你的-worker地址/api/ready
# 期望：{"status":"ok","checks":{"database":"ok","auth":"ok"}}
```

然后打开前端站点 → 我的 → 登录/注册 → 打一场 → 换设备登录看是否同步。

---

## 本地开发

### 起后端

```bash
cd server
npm install

# 本地 D1 建表（只需一次）
npx wrangler d1 execute badminton --local --file=./migrations/0001_init.sql

# 本地密钥（.dev.vars 已在 .gitignore 里，不会提交）
cp .env.example .dev.vars
# 编辑 .dev.vars，把 JWT_SECRET 换成真实随机串

npx wrangler dev --port 8787
```

### 起前端

```bash
# 仓库根目录
python -m http.server 8000
```

打开 <http://127.0.0.1:8000/?api=http://127.0.0.1:8787> —— `?api=` 让前端
指向本地后端，不用改文件。

### 跑测试

```bash
# 仓库根目录：一条命令跑完全部六套检查
node tools/test-all.mjs
```

退出码 `0` 表示全部通过。没起后端时会自动跳过依赖它的两套，
并明确提示「结论不完整」——不会给你一个假的"全绿"。

也可以单独跑某一套：

```bash
node tools/run-tests.js        # 前端本地逻辑（40 条）
node tools/audit-tokens.js     # 令牌一致性（抓静默失效的 var()）
node tools/audit-ui.js         # 界面质量（触摸目标/溢出/可读距离）
cd server
node tools/test-api.mjs        # 后端接口（95 条），需后端在跑
cd ..
node tools/test-sync.mjs       # 前后端联调（37 条），需后端在跑
```

**五套加起来 172 条断言。** 联调那套是最关键的一套 ——
它用 Playwright 打开真实页面、真的注册、真的计分、真的同步，
再从「另一台设备」登录确认能看到同一批记录。
前端测试和后端测试各自全绿，仍然可能"接不上"，只有这套能发现。

---

## 常见问题

**登录后历史记录没同步上来**
先看「我的」页的账号卡片状态点：
- 灰点 = 未登录
- 绿点 = 已同步
- 琥珀点 = 有待同步（离线时会一直亮着，联网后自动消失）
- 红点 = 同步失败，副标题里会写明原因

**换设备登录后看到重复记录**
不应该发生 —— 同步按 `(owner_id, clientId)` 幂等去重。
如果真出现，请带 `request_id` 提 issue（错误响应里带这个字段）。

**部署后登录 401，日志说 JWT_SECRET 未配置**
`wrangler secret put JWT_SECRET` 之后需要重新 `wrangler deploy` 才生效。

**想把已有数据搬过去**
「我的」→ 数据备份 → 导出 JSON，在新设备导入，再登录即可上传。
备份文件包含全部本地数据，导入后会走正常的同步流程。
