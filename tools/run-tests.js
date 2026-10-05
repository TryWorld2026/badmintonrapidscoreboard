#!/usr/bin/env node
/* ================================================================
   tools/run-tests.js — 无头回归测试运行器

   为什么需要它：
     项目自带的 test.html 是给人看的（在浏览器里打开、肉眼看结果），
     但 CI 与本地改动验证需要「一条命令、退出码说话」。
     这个脚本用 Playwright 打开真实的 test.html，等它跑完，
     把结果打到 stdout，并用退出码表达成败。

   用法：
     node tools/run-tests.js              # 自动起静态服务器
     node tools/run-tests.js --port=8899  # 指定端口
     node tools/run-tests.js --headed     # 显示浏览器（调试用）

   退出码：0 = 全部通过；1 = 有失败或运行期错误；2 = 环境问题
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
const PORT = parseInt(arg('port', '8899'), 10);
const HEADED = process.argv.includes('--headed');
/* 用例里带 sleep，全套约 60–90s；给足余量，避免"跑一半就报数"
   （第一版用 90s，加了场边模式用例后偶发只读到 20 条）。 */
const DONE_TIMEOUT_MS = parseInt(arg('timeout', '240000'), 10);

/* ---------- 极简静态服务器：只服务仓库内文件 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

function serve(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';
      const full = path.join(ROOT, rel);
      /* 防目录穿越：解析后必须仍在仓库内 */
      if (!full.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(full, (err, buf) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
          /* 测试必须拿到最新代码：禁用缓存，避免 SW / HTTP 缓存把旧文件喂进来 */
          'Cache-Control': 'no-store',
        });
        res.end(buf);
      });
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/* 端口被占用就自动往后找一个可用的。
   本地常常已经开着一个 python -m http.server，硬绑定会让 CI 直接失败。

   ⚠️ 默认还刻意避开固定端口（--port 未显式给出时用随机高位端口），
   原因是 Service Worker 按 **origin** 隔离，而 origin 含端口号：
   同一端口上跑过一轮测试后，那个 origin 就留下了 SW 与 Cache Storage，
   下一轮即使响应头写了 no-store，请求仍会被 SW 用缓存优先拦下
   ——拿到的是上一轮的旧 js/css。
   实测后果：测试卡在某一组跑不完，摘要只报 "8 通过"，且不报任何错误，
   极难定位。换端口 = 换 origin = 干净环境。
   需要固定端口时显式传 --port=N，并自行承担上述缓存风险。 */
async function serveOnFreePort(startPort) {
  const tries = [];
  if (process.argv.some(a => a.startsWith('--port='))) {
    for (let p = startPort; p < startPort + 20; p++) tries.push(p);
  } else {
    /* 随机起点，避开本机常见的 8000/8080/8899 等易撞端口 */
    for (let i = 0; i < 20; i++) tries.push(20000 + Math.floor(Math.random() * 20000));
  }
  for (const p of tries) {
    try {
      const s = await serve(p);
      return { server: s, port: p };
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }
  throw new Error('找不到可用端口');
}

/* ---------- 找 Playwright ---------- */
function loadPlaywright() {
  const candidates = [
    'playwright',
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'playwright'),
    path.join(process.env.HOME || '', '.npm-global', 'lib', 'node_modules', 'playwright'),
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 试下一个 */ }
  }
  return null;
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) {
    console.error('找不到 playwright。请先安装：npm i -D playwright 或 npm i -g playwright');
    process.exit(2);
  }

  let server, port;
  try {
    const r = await serveOnFreePort(PORT);
    server = r.server;
    port = r.port;
    console.log(`  测试服务: http://127.0.0.1:${port}`);
  } catch (e) {
    console.error(`静态服务器起不来：${e.message}`);
    process.exit(2);
  }

  const browser = await pw.chromium.launch({ headless: !HEADED });
  /* 独立 context，每个 context 都是全新的存储分区。
     ⚠️ 不能 block service worker：套件里有一条 PWA 用例专门验证
     SW 注册与离线缓存，禁掉它会让那条用例必然失败。
     干净环境靠「换端口 = 换 origin」拿到，见 serveOnFreePort 的注释。 */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();

  const runtimeErrors = [];
  page.on('pageerror', e => runtimeErrors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') runtimeErrors.push('CONSOLE: ' + m.text()); });

  const url = `http://127.0.0.1:${port}/test.html`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  let finished = true;
  let waitError = '';
  try {
    /* ⚠️ waitForFunction 的签名是 (pageFunction, arg, options)。
       第二参是传给页面函数的 arg，不是 options —— 把 options 写在第二参
       会被当成 arg 静默丢弃，于是 timeout 退回默认的 30s。
       套件要跑约 35s，于是偶发"只读到 27~30 条但报未跑完"，
       而且摘要看起来是全绿，极难定位。options 必须放第三参。 */
    await page.waitForFunction(() => window.__testDone === true, undefined, {
      timeout: DONE_TIMEOUT_MS,
      /* 默认轮询是 raf；套件跑起来后主线程很忙，raf 可能长时间不被调度。
         改成固定间隔轮询，避免"看起来卡住"的假象。 */
      polling: 500,
    });
  } catch (e) {
    finished = false;
    waitError = e && e.message ? e.message.split('\n')[0] : String(e);
  }

  const summary = await page.$eval('#summary', el => el.textContent.trim()).catch(() => '(读不到摘要)');
  const fails = await page.$$eval('#results li.fail', els => els.map(el => el.textContent.trim())).catch(() => []);
  const okCount = await page.$$eval('#results li.ok', els => els.length).catch(() => 0);

  await browser.close();
  server.close();

  console.log('');
  console.log('  回归测试：' + summary);
  if (!finished) {
    console.log('  ⚠️  未跑完：' + waitError);
  }
  if (fails.length) {
    console.log('\n  失败用例：');
    fails.forEach(f => console.log('    ✗ ' + f.replace(/\s+/g, ' ').slice(0, 240)));
  }
  if (runtimeErrors.length) {
    console.log('\n  运行期错误：');
    [...new Set(runtimeErrors)].slice(0, 10).forEach(e => console.log('    ! ' + e.slice(0, 240)));
  }
  console.log('');

  const failed = fails.length > 0 || runtimeErrors.length > 0 || !finished || okCount === 0;
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('运行器异常：' + e.message);
  process.exit(2);
});
