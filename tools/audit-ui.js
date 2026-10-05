#!/usr/bin/env node
/* ================================================================
   tools/audit-ui.js — 界面质量审计

   检查四类「不报错但体验已经坏掉」的问题：
     1. 触摸目标 < 44×44 —— 球馆里一手汗一手拍，按不中就等于没这个按钮
     2. 横向 / 纵向溢出 —— 小屏上出现横向滚动条是最常见的移动端事故
     3. 遗留的旧配色 —— 视觉重构后最容易漏掉某处硬编码色值
     4. 场边模式可读性 —— 按标牌经验法则换算成「多少米外能看清」

   用法：
     node tools/audit-ui.js
     node tools/audit-ui.js --port=8899   # 复用已有服务器

   退出码：0 = 无阻断性问题；1 = 有（触摸目标 / 溢出 / 旧色）
   ================================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function arg(name, def) {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : def;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

function serve(port) {
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

async function serveOnFreePort(explicit) {
  const tries = [];
  if (explicit) { for (let p = explicit; p < explicit + 20; p++) tries.push(p); }
  else { for (let i = 0; i < 20; i++) tries.push(20000 + Math.floor(Math.random() * 20000)); }
  for (const p of tries) {
    try { return { server: await serve(p), port: p }; }
    catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('找不到可用端口');
}

function loadPlaywright() {
  const cands = ['playwright',
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'playwright')];
  for (const c of cands) { try { return require(c); } catch (e) { /* next */ } }
  return null;
}

/* 所有二级页，确保没有哪一页被漏掉 */
const VIEWS = [
  ['score', ''], ['match', 'grouping'], ['match', 'expense'],
  ['data', 'history'], ['data', 'leaderboard'], ['data', 'ability'],
  ['data', 'achievements'], ['me', 'settings'], ['me', 'avatars'],
  ['me', 'backup'], ['me', 'about'],
];

const TAP_MIN = 44;
const LEGACY_COLORS = /rgb\(212,\s*255,\s*63\)|rgb\(255,\s*46,\s*99\)|rgb\(0,\s*229,\s*255\)|rgb\(10,\s*14,\s*19\)/;

/* 可读距离：标牌经验法则「最小可读距离(mm) = 字高(mm) × 200」。
   1 CSS px ≈ 0.183 mm（按 iPhone 14：390 CSS px 屏宽 ≈ 71.5 mm）。
   舒适阅读取最小距离的 1/2.5。 */
const PX_TO_MM = 0.183;

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.error('找不到 playwright'); process.exit(2); }

  const explicit = arg('port', null);
  const { server, port } = await serveOnFreePort(explicit ? parseInt(explicit, 10) : null);
  const browser = await pw.chromium.launch();

  let blocking = 0;
  const rows = [];

  /* ---------- 1~3：全部视图 ---------- */
  for (const [tab, sub] of VIEWS) {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/index.html#tab=${tab}${sub ? '&sub=' + sub : ''}`,
      { waitUntil: 'networkidle' });
    await page.waitForTimeout(650);

    const m = await page.evaluate((opts) => {
      const tapMin = opts.tapMin;
      const legacyRe = new RegExp(opts.legacySrc);
      const small = [];
      for (const el of document.querySelectorAll('button,[data-act]')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.width < tapMin || r.height < tapMin)) {
          small.push({
            size: Math.round(r.width) + 'x' + Math.round(r.height),
            cls: (el.className || '').toString().slice(0, 40),
            txt: (el.textContent || '').trim().slice(0, 14),
          });
        }
      }
      let legacy = false;
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (legacyRe.test(cs.color + cs.backgroundColor + cs.borderColor)) { legacy = true; break; }
      }
      return {
        small,
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        legacy,
      };
    }, { tapMin: TAP_MIN, legacySrc: LEGACY_COLORS.source });

    const name = `${tab}${sub ? '/' + sub : ''}`;
    const problems = [];
    if (m.small.length) {
      problems.push(`${m.small.length} 个触摸目标 <${TAP_MIN}px: ` +
        m.small.map(s => `${s.size} ${s.cls || s.txt}`).join('; '));
    }
    if (m.overflowX) problems.push('横向溢出');
    if (m.legacy) problems.push('存在旧配色');
    if (errs.length) problems.push('运行期错误: ' + errs[0]);

    rows.push({ name, problems });
    if (problems.length) blocking++;
    await page.close();
  }

  /* ---------- 4：场边模式可读性 ---------- */
  const csCases = [
    ['横屏 iPhone 14', 844, 390], ['横屏 小屏', 667, 375],
    ['横屏 极矮', 740, 360], ['竖屏', 420, 900], ['竖屏 小屏', 360, 640],
  ];
  const csRows = [];
  for (const [name, w, h] of csCases) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(650);
    await page.evaluate(() => { const s = document.querySelector('[data-act="ui:onboard-skip"]'); if (s) s.click(); });
    await page.click('[data-act="courtside:open"]');
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const el = document.getElementById('cs-score-a');
      const side = document.getElementById('cs-side-a');
      const sideB = document.getElementById('cs-side-b');
      return {
        font: Math.round(parseFloat(getComputedStyle(el).fontSize)),
        h: el.getBoundingClientRect().height,
        sideW: Math.round(side.getBoundingClientRect().width),
        sideBW: Math.round(sideB.getBoundingClientRect().width),
        boardW: Math.round(document.querySelector('.cs-board').getBoundingClientRect().width),
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        overflowY: document.documentElement.scrollHeight > window.innerHeight + 2,
      };
    });
    const mm = r.h * PX_TO_MM;
    const comfy = (mm * 200 / 1000) / 2.5;
    const problems = [];
    if (r.overflowX) problems.push('横向溢出');
    if (r.overflowY) problems.push('纵向溢出');
    /* 两半屏都应接近一半宽度：防「网格列数多于子元素」把乙队挤成细条 */
    if (r.sideW < r.boardW * 0.4 || r.sideBW < r.boardW * 0.4) {
      problems.push(`半屏宽度异常 (${r.sideW}/${r.sideBW} of ${r.boardW})`);
    }
    csRows.push({ name, font: r.font, h: Math.round(r.h), comfy: comfy.toFixed(1), problems });
    if (problems.length) blocking++;
    await page.close();
  }

  await browser.close();
  server.close();

  /* ---------- 输出 ---------- */
  console.log('');
  console.log('  界面审计（' + VIEWS.length + ' 个视图 + ' + csCases.length + ' 个场边视口）');
  console.log('');
  for (const r of rows) {
    console.log('  ' + (r.problems.length ? '✗' : '✓') + ' ' + r.name.padEnd(18) +
      (r.problems.length ? r.problems.join(' | ') : ''));
  }
  console.log('');
  console.log('  场边模式可读性（横屏为主形态）');
  console.log('    ' + '视口'.padEnd(14) + '比分'.padEnd(9) + '字高'.padEnd(8) + '舒适可读');
  for (const c of csRows) {
    console.log('    ' + c.name.padEnd(14) + (c.font + 'px').padEnd(9) +
      (c.h + 'px').padEnd(8) + (c.comfy + ' m') +
      (c.problems.length ? '   ✗ ' + c.problems.join(' | ') : ''));
  }
  console.log('');
  console.log(blocking === 0
    ? '  ✅ 全部通过'
    : `  ❌ ${blocking} 项未通过`);
  console.log('');
  process.exit(blocking === 0 ? 0 : 1);
})().catch(e => { console.error('审计异常：' + e.message); process.exit(2); });
