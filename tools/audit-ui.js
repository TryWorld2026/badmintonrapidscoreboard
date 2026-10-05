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

      /* ---- 对比度（WCAG AA）----
         为什么必须工具化：--fg-3 曾经是 #6C757E，对 --void/--plate/--plate-2
         分别是 4.03 / 3.76 / 3.49:1，**三处全部低于** 4.5:1，
         而它是 .micro / .field-label / .list-item-sub 这些小字的颜色。
         代码里没有任何报错、测试全绿，只有真去算对比度才看得出来。
         （v2.0.2 用 Lighthouse 手工查过一次，但那是"跑一次"，
          不是"每次提交都跑"，于是很快就回退了。） */
      const lum = (hex) => {
        const c = hex.replace('#', '');
        if (c.length !== 6) return null;
        const v = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
          .map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const ratio = (a, b) => {
        const l1 = lum(a), l2 = lum(b);
        if (l1 === null || l2 === null) return null;
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const toHex = (rgb) => {
        const m2 = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
        if (!m2) return null;
        return '#' + [1, 2, 3].map(i => parseInt(m2[i], 10).toString(16).padStart(2, '0')).join('');
      };
      /* 找出文字实际压在上面的背景色。

         规则：先看**自身**背景；自身不透明就用它（比如 .btn-primary
         的 --fill 琥珀底 + 深色墨水字）；自身透明或半透明则往上找
         （比如 .tag-brand 的 rgba(...,0.16) 底，字其实压在卡片的
         --plate-3 上）。

         两个方向都踩过坑：
           - 只看自身  -> .tag-brand 的 background 与 color 同系，
                          算出 1.00:1 假阳性；
           - 只看父级  -> 按钮的琥珀底被跳过，深色字压深色底，
                          又算出 1.00:1 假阳性。 */
      const bgOf = (el) => {
        let n = el;
        while (n && n.nodeType === 1) {
          const cs = getComputedStyle(n);
          const a = cs.backgroundColor;
          const m3 = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(a || '');
          if (m3) {
            const alpha = m3[4] === undefined ? 1 : parseFloat(m3[4]);
            if (alpha >= 0.98) return toHex(a);
            /* 半透明：近似按"叠加在主色板上"处理，继续往上找 */
          }
          n = n.parentElement;
        }
        const rootBg = getComputedStyle(document.documentElement).backgroundColor;
        return toHex(rootBg) || '#101113';
      };

      const lowContrast = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('body *')) {
        /* 只看真正承载文字的元素 */
        const txt = Array.from(el.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent.trim())
          .join('');
        if (!txt) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;

        const fg = toHex(cs.color);
        const bg = bgOf(el);
        if (!fg || !bg) continue;
        const cr = ratio(fg, bg);
        if (cr === null) continue;

        /* AA 正文 4.5:1；≥18.66px 或 ≥14px 且粗体 可放宽到 3:1 */
        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        if (cr < need) {
          const key = fg + '|' + bg + '|' + Math.round(size) + '|' + txt.slice(0, 10);
          if (seen.has(key)) continue;
          seen.add(key);
          lowContrast.push({
            ratio: cr.toFixed(2),
            need: need,
            fg, bg,
            size: Math.round(size),
            cls: (el.className || '').toString().slice(0, 30),
            txt: txt.slice(0, 14),
          });
        }
      }

      /* ---- 滚到底之后是否被 Dock / tabbar 永久遮挡 ----
         这条是补盲区：审计工具原来从不 scrollTo 底部，于是
         「.app.dock-on .content」这个永不命中的选择器一直没被发现 ——
         padding-bottom 停在 90px 而需要 139px，记分页滚到底时
         约 49px 内容永久压在 Dock 下面。不报错、不白屏，只是点不到。

         判据要用「文档总高度 - 滚动位置」换算，不能直接看
         getBoundingClientRect().bottom —— 页面本身不滚动时
         （.app 是 min-height:100dvh 的 flex 列，滚动发生在 window 上）
         rect 会包含未进入视口的部分，导致把"还没滚到的内容"
         误报成"被遮挡"。 */
      let occlusion = null;
      const scroller = document.scrollingElement || document.documentElement;
      const contentEl = document.querySelector('.content') || document.body;

      if (scroller) {
        const maxScroll = scroller.scrollHeight - window.innerHeight;
        scroller.scrollTop = maxScroll;          /* 滚到底 */
        void scroller.offsetHeight;              /* 同步读一次布局 */

        const bars = ['dock', 'tabbar']
          .map(id => document.getElementById(id))
          .filter(el => el && !el.hidden)
          .map(el => ({ id: el.id, top: el.getBoundingClientRect().top }))
          .filter(b => b.top < window.innerHeight && b.top > 0);

        if (bars.length && maxScroll > 0) {
          /* 底线 = 内容容器在滚动到底时的底边（用文档坐标算） */
          const contentRect = contentEl.getBoundingClientRect();
          const contentBottomInViewport = contentRect.bottom;
          const topMostBar = Math.min(...bars.map(b => b.top));
          /* 只有内容真的越过固定条顶边才算遮挡 */
          const covered = Math.round(contentBottomInViewport - topMostBar);
          const pad = parseFloat(getComputedStyle(contentEl).paddingBottom) || 0;
          /* 留 2px 容差；padding 已经够时 contentRect.bottom 会正好落在条上方 */
          if (covered > 2 && pad < covered + 2) {
            occlusion = {
              covered,
              bar: bars.map(b => b.id).join('+'),
              paddingBottom: pad,
            };
          }
        }
        scroller.scrollTop = 0;
      }

      return {
        small,
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        legacy,
        lowContrast,
        occlusion,
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
    if (m.lowContrast.length) {
      problems.push(`${m.lowContrast.length} 处对比度不足 AA: ` +
        m.lowContrast.map(c =>
          `${c.fg} on ${c.bg} = ${c.ratio}:1 (需 ${c.need}, ${c.size}px "${c.txt}")`).join('; '));
    }
    if (m.occlusion) {
      problems.push(`滚到底被 ${m.occlusion.bar} 遮挡 ${m.occlusion.covered}px` +
        `（padding-bottom=${m.occlusion.paddingBottom}，最低元素 .${m.occlusion.cls}）`);
    }
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
