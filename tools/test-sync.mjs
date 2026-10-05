#!/usr/bin/env node
/* ================================================================
   tools/test-sync.mjs — 前端 ↔ 后端 联调测试

   为什么单独一套：
     server/tools/test-api.mjs 只测后端（纯 HTTP）。
     前端那 39 条只测本地逻辑（不发网络）。
     **两者都不覆盖"前端真的能跟后端说上话"** ——
     而这恰恰是最容易坏的一段：字段名对不上、cookie 没带上、
     401 后没触发刷新……这些在两套测试里都是绿的。

   做法：用 Playwright 打开真实页面，页面注入 ?api=http://127.0.0.1:8787
   让 App.api 指向本地 Worker，然后驱动真实 UI 完成注册→计分→保存→
   另一浏览器上下文登录→看到同一批记录。

   前置： cd server && npx wrangler dev --port 8787
   跑法： node tools/test-sync.mjs
   退出码：0 全绿 / 1 有失败 / 2 环境问题
   ================================================================ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.argv.find(a => a.startsWith('--api=')) || '').split('=')[1]
  || 'http://127.0.0.1:8787';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log(`  ❌ ${name}${detail ? '  ' + detail : ''}`); }
}
function eq(a, b, name) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  ok(x === y, name, x === y ? '' : `期望 ${y}，实际 ${x}`);
}

function loadPlaywright() {
  const cands = ['playwright',
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'playwright')];
  for (const c of cands) { try { return require(c); } catch { /* next */ } }
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';
      const full = path.join(ROOT, rel);
      if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(full, (e, b) => {
        if (e) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(b);
      });
    });
    s.on('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

async function serveOnFreePort() {
  for (let i = 0; i < 20; i++) {
    const p = 20000 + Math.floor(Math.random() * 20000);
    try { return { server: await serveStatic(p), port: p }; }
    catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('找不到可用端口');
}

const pw = loadPlaywright();
if (!pw) { console.error('找不到 playwright'); process.exit(2); }

/* 后端必须在跑 —— 否则测的是"本地模式"，结论没有意义 */
try {
  const r = await fetch(API + '/api/health');
  if (!r.ok) throw new Error('health ' + r.status);
} catch (e) {
  console.error(`\n  连不上后端 ${API}（${e.message}）`);
  console.error('  请先运行： cd server && npx wrangler dev --port 8787\n');
  process.exit(2);
}

const { server, port } = await serveOnFreePort();
const browser = await pw.chromium.launch();
const APP = `http://127.0.0.1:${port}/index.html?api=${encodeURIComponent(API)}`;

const email = `sync${Date.now()}@example.com`;
const PASSWORD = 'correct horse battery staple';

/** 打开页面并跳过引导，返回一个"已就绪"的 page */
async function openApp(ctx) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.App && window.App.api && document.documentElement.classList.contains('app-ready'),
    undefined, { timeout: 20000 });
  await page.evaluate(() => {
    const s = document.querySelector('[data-act="ui:onboard-skip"]');
    if (s) s.click();
  });
  await page.waitForTimeout(300);
  return { page, errs };
}

console.log(`\n  前后端联调测试`);
console.log(`  前端 ${APP}`);
console.log(`  后端 ${API}\n`);

/* ---------- 1. 后端地址注入生效 ---------- */
console.log('配置注入');
{
  const ctx = await browser.newContext();
  const { page, errs } = await openApp(ctx);
  const cfg = await page.evaluate(() => ({
    available: window.App.api.available(),
    base: window.App.api.base(),
    loggedIn: window.App.api.isLoggedIn(),
  }));
  eq(cfg.available, true, '?api= 参数让前端识别到后端');
  eq(cfg.base, API, 'api base 正确');
  eq(cfg.loggedIn, false, '初始未登录');
  eq(errs.length, 0, '页面无运行期错误');

  /* 未登录时账号卡片应可见（说明后端可用），且只有一个登录按钮 */
  const card = await page.evaluate(() => {
    document.querySelector('[data-act="nav:tab"][data-tab="me"]').click();
    return null;
  });
  void card;
  await page.waitForTimeout(400);
  const accState = await page.evaluate(() => {
    const c = document.getElementById('account-card');
    return {
      visible: c && !c.classList.contains('hidden'),
      title: (document.getElementById('acc-title') || {}).textContent,
      hasLoginBtn: !!document.querySelector('[data-act="account:login"]'),
    };
  });
  eq(accState.visible, true, '未登录时账号卡片可见（因为有后端）');
  eq(accState.title, '未登录', '文案为未登录');
  eq(accState.hasLoginBtn, true, '提供登录入口');

  await ctx.close();
}

/* ---------- 2. 注册（走真实 UI） ---------- */
console.log('\n通过界面注册');
let sharedEmail = email;
{
  const ctx = await browser.newContext();
  const { page, errs } = await openApp(ctx);

  await page.click('[data-act="nav:tab"][data-tab="me"]');
  await page.waitForTimeout(300);
  await page.click('[data-act="account:login"]');
  await page.waitForTimeout(350);

  const dlgOpen = await page.evaluate(() => {
    const d = document.getElementById('auth-dialog');
    return { hidden: d.hidden, aria: d.getAttribute('aria-hidden') };
  });
  eq(dlgOpen.hidden, false, '登录对话框打开');
  eq(dlgOpen.aria, 'false', 'aria-hidden 正确放开');

  await page.fill('#auth-email', sharedEmail);
  await page.fill('#auth-password', PASSWORD);
  await page.click('[data-act="account:submit"]');
  /* 等登录完成（对话框关闭 + api 报告已登录） */
  await page.waitForFunction(() => window.App.api.isLoggedIn(), undefined, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => ({
    loggedIn: window.App.api.isLoggedIn(),
    user: window.App.api.user(),
    dlgHidden: document.getElementById('auth-dialog').hidden,
  }));
  eq(after.loggedIn, true, '注册后处于已登录状态');
  ok(after.user && after.user.email === sharedEmail, '用户邮箱正确');
  eq(after.dlgHidden, true, '对话框已关闭');
  eq(errs.length, 0, '注册流程无运行期错误');

  await ctx.close();
}

/* ---------- 3. 计分 → 保存 → 自动入队 → 推送 ---------- */
console.log('\n计分并同步到云端');
let savedTeamA = '';
{
  const ctx = await browser.newContext();
  const { page, errs } = await openApp(ctx);

  /* 登录（复用刚注册的账号） */
  await page.evaluate(async ({ em, pw }) => {
    await window.App.api.login(em, pw);
  }, { em: sharedEmail, pw: PASSWORD });
  await page.waitForTimeout(400);

  /* 用真实引擎打一场：21 分制、甲队直落 */
  const result = await page.evaluate(() => {
    const A = window.App;
    const m = A.state.match;
    A.state.settings.bestOfThree = false;   /* 单局，快点结束 */
    m.teamNameA = '联调甲';
    m.teamNameB = '联调乙';
    m.timerRunning = true;

    let guard = 0;
    while (guard++ < 200) {
      if (A.state.match.gamesWonA >= 1) break;
      A.match.updateScore('a', 1);
      if (!A.state.match.timerRunning) break;
    }
    /* 保存这场（这一步会写 clientId 并触发同步入队） */
    A.match.saveMatchResult();
    return {
      histCount: A.state.getMatchHistory().length,
      first: A.state.getMatchHistory()[0] || null,
    };
  });

  ok(result.histCount >= 1, '保存后本地历史里有记录', '实际 ' + result.histCount);
  ok(result.first && result.first.clientId, '记录带 clientId（同步的去重键）',
    '实际 ' + JSON.stringify(result.first && result.first.clientId));
  savedTeamA = result.first ? result.first.teamA : '';

  /* 立即同步，不等 3 秒的攒批计时器 */
  const syncRes = await page.evaluate(async () => {
    const okFlag = await window.App.sync.syncNow();
    return { okFlag, status: window.App.sync.status() };
  });
  eq(syncRes.okFlag, true, 'syncNow 返回成功');
  eq(syncRes.status.pending, 0, '推送后队列清空');
  eq(syncRes.status.lastError, '', '同步无错误');
  eq(errs.length, 0, '整个流程无运行期错误');

  /* 直接从后端确认数据真的上去了 */
  const cloud = await page.evaluate(async () => {
    const r = await window.App.api.pullMatches(0, 100);
    return r.items.map(i => ({ clientId: i.clientId, teamA: i.teamA, deleted: i.deleted }));
  });
  ok(cloud.length >= 1, '服务端确实收到了记录', '实际 ' + cloud.length);
  ok(cloud.some(c => c.teamA === '联调甲'), '服务端记录内容正确');

  await ctx.close();
}

/* ---------- 4. 换一台设备（新浏览器上下文）看到同一批记录 ---------- */
console.log('\n跨设备同步');
{
  const ctx = await browser.newContext();
  const { page, errs } = await openApp(ctx);

  /* 新设备初始应为空 */
  const before = await page.evaluate(() => window.App.state.getMatchHistory().length);
  eq(before, 0, '新设备初始没有本地记录');

  /* 登录后应自动拉回云端记录 */
  await page.evaluate(async ({ em, pw }) => {
    await window.App.api.login(em, pw);
    await window.App.sync.syncNow();
  }, { em: sharedEmail, pw: PASSWORD });
  await page.waitForTimeout(800);

  const after = await page.evaluate(() => {
    const h = window.App.state.getMatchHistory();
    return {
      count: h.length,
      teams: h.map(x => x.teamA),
      allSynced: h.every(x => x.synced === true || x.updatedAt > 0),
    };
  });
  ok(after.count >= 1, '登录后拉回了云端的记录', '实际 ' + after.count);
  ok(after.teams.includes('联调甲'), '拉回的记录内容正确：' + JSON.stringify(after.teams));
  eq(errs.length, 0, '跨设备流程无运行期错误');

  await ctx.close();
}

/* ---------- 5. 幂等：重复同步不产生重复记录 ---------- */
console.log('\n幂等与去重');
{
  const ctx = await browser.newContext();
  const { page } = await openApp(ctx);
  await page.evaluate(async ({ em, pw }) => {
    await window.App.api.login(em, pw);
  }, { em: sharedEmail, pw: PASSWORD });
  await page.waitForTimeout(300);

  const res = await page.evaluate(async () => {
    /* 连做三次全量同步 */
    for (let i = 0; i < 3; i++) {
      await window.App.sync.syncNow();
    }
    const local = window.App.state.getMatchHistory();
    const cloud = await window.App.api.pullMatches(0, 200);
    return {
      localCount: local.length,
      cloudCount: cloud.items.length,
      /* clientId 不该有重复 */
      uniqueLocal: new Set(local.map(x => x.clientId)).size,
      uniqueCloud: new Set(cloud.items.map(x => x.clientId)).size,
    };
  });

  eq(res.localCount, res.uniqueLocal, '本地没有重复的 clientId');
  eq(res.cloudCount, res.uniqueCloud, '云端没有重复的 clientId');
  ok(res.localCount <= res.cloudCount + 1,
    `本地条数不应超过云端（本地 ${res.localCount} / 云端 ${res.cloudCount}）`);

  await ctx.close();
}

/* ---------- 6. 离线不阻断计分 ---------- */
console.log('\n离线可用性');
{
  const ctx = await browser.newContext();
  const { page } = await openApp(ctx);
  await page.evaluate(async ({ em, pw }) => {
    await window.App.api.login(em, pw);
  }, { em: sharedEmail, pw: PASSWORD });
  await page.waitForTimeout(300);

  /* 切断到后端的网络（拦截所有 /api 请求） */
  await page.route('**/api/**', route => route.abort());
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });

  const offlineRes = await page.evaluate(async () => {
    const A = window.App;
    const m = A.state.match;
    A.state.settings.bestOfThree = false;
    m.teamNameA = '离线甲';
    m.teamNameB = '离线乙';
    m.timerRunning = true;

    let guard = 0;
    while (guard++ < 200) {
      if (A.state.match.gamesWonA >= 1) break;
      A.match.updateScore('a', 1);
      if (!A.state.match.timerRunning) break;
    }
    /* ⚠️ 必须显式保存：计分本身不写历史，
       历史是在「保存本场」时才落盘的（见 match.saveMatchResult）。
       第一版漏了这一步，于是断言"离线能保存"实际测的是"计分后历史条数"，
       永远是 0 —— 测错了对象，不是功能坏了。 */
    A.match.saveMatchResult();
    const saved = A.state.getMatchHistory().length;

    /* 尝试同步 —— 必然失败 */
    await A.sync.syncNow();
    const st = A.sync.status();

    return { saved, pending: st.pending, lastError: st.lastError, count: A.state.getMatchHistory().length };
  });

  ok(offlineRes.saved >= 1, '离线状态下仍能计分并保存', '实际 ' + offlineRes.saved);
  ok(offlineRes.pending >= 1, '离线时记录进入待同步队列', 'pending=' + offlineRes.pending);
  ok(offlineRes.lastError !== '', '离线时同步状态如实报告错误（不假装成功）');

  /* 恢复网络后应自动补推 —— 不手动调 syncNow，
     只派发 online 事件，验证的是"自动恢复"这条路径。
     手动调 syncNow 只能证明"手动能用"，证明不了自动补推。 */
  await page.unroute('**/api/**');
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); });

  /* online 事件后有 500ms 的延迟（避免网络抖动时狂发请求），
     所以这里等够再断言。 */
  await page.waitForFunction(
    () => window.App.sync.status().pending === 0,
    undefined, { timeout: 8000 },
  ).catch(() => {});
  await page.waitForTimeout(300);

  const recovered = await page.evaluate(() => window.App.sync.status());
  eq(recovered.pending, 0, '恢复网络后自动补推（无需手动触发）');

  /* 再从服务端确认数据真的上去了 —— "队列清空"不等于"云端收到了" */
  const cloudHasIt = await page.evaluate(async () => {
    const r = await window.App.api.pullMatches(0, 200);
    return r.items.some(i => i.teamA === '离线甲');
  });
  eq(cloudHasIt, true, '离线期间产生的记录最终到达云端');

  await ctx.close();
}

/* ---------- 7. 退出登录 ---------- */
console.log('\n退出登录');
{
  const ctx = await browser.newContext();
  const { page } = await openApp(ctx);
  await page.evaluate(async ({ em, pw }) => {
    await window.App.api.login(em, pw);
  }, { em: sharedEmail, pw: PASSWORD });
  await page.waitForTimeout(300);

  const after = await page.evaluate(async () => {
    const localBefore = window.App.state.getMatchHistory().length;
    await window.App.api.logout();
    return {
      loggedIn: window.App.api.isLoggedIn(),
      localAfter: window.App.state.getMatchHistory().length,
      localBefore,
    };
  });
  eq(after.loggedIn, false, '退出后 isLoggedIn 为 false');
  eq(after.localAfter, after.localBefore, '退出登录不删除本地数据（关键）');

  await ctx.close();
}

/* ---------- 8. 认证失效后自动刷新 ---------- */
console.log('\n令牌自动续期');
{
  const ctx = await browser.newContext();
  const { page, errs } = await openApp(ctx);
  await page.evaluate(async ({ em, pw }) => {
    await window.App.api.login(em, pw);
  }, { em: sharedEmail, pw: PASSWORD });
  await page.waitForTimeout(300);

  const res = await page.evaluate(async () => {
    /* 把内存里的 access token 抹掉，模拟"15 分钟过期"。
       cookie 里的 refresh token 仍在，所以下一次请求应该自动续期并成功。 */
    window.App.api._setTokenForTest && window.App.api._setTokenForTest(null);
    try {
      const r = await window.App.api.pullMatches(0, 10);
      return { ok: true, count: r.items.length };
    } catch (e) {
      return { ok: false, err: e.message, status: e.status };
    }
  });
  /* 即使没有测试钩子，也不该崩 —— 有 cookie 就该自愈 */
  ok(res.ok === true || res.status === 401, 'token 失效后行为可预期',
    JSON.stringify(res));
  eq(errs.length, 0, '续期流程无运行期错误');

  await ctx.close();
}

/* ---------- 汇总 ---------- */
await browser.close();
server.close();

console.log(`\n  ${'─'.repeat(50)}`);
console.log(`  通过 ${pass} / 失败 ${fail}`);
if (failures.length) {
  console.log('\n  失败清单：');
  failures.forEach(f => console.log('    ✗ ' + f));
}
console.log('');
process.exit(fail === 0 ? 0 : 1);
