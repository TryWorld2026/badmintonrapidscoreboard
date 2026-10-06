#!/usr/bin/env node
/* ================================================================
   tools/check-release.js — 发布前一致性检查

   为什么需要它：
     README、index.html、js/settings.js、sw.js 里各有一份"版本/清单"信息，
     靠人肉比对，改一处漏三处是常态。本项目就发生过：
       - 版本号四处不一致（2.0.0 / 2.0.1 / 2.0.1 / 3.0.0）
       - 改了 js/css 忘了 bump sw.js 的 CACHE_NAME，
         已安装用户永久停在旧字节（_headers 的 no-cache 在 SW 激活后无效）
       - deploy-cloudflare.ps1 的 $MIN=30 形同虚设（实际 42 个文件，
         整目录缺失也放行）
     这三类问题的共同点：不报错、测试全绿、线上才出问题。
     所以单独用一条命令把它们变成"退出码非 0"。

   检查项：
     A. 版本号一致性（settings.js / index.html / README×2 / server/package.json）
     B. sw.js 的 ASSETS 清单与磁盘实际文件一一对应
     C. sw.js 的 CACHE_NAME 与已发布的缓存名不同（防止忘记 bump）
     D. deploy 脚本的资产清单与实际文件数一致

   用法：node tools/check-release.js
   退出码：0 全通过 / 1 有问题
   ================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));

let problems = 0;
let checks = 0;

function fail(msg) {
  problems++;
  console.log('  ✗ ' + msg);
}
function pass(msg) {
  checks++;
  console.log('  ✓ ' + msg);
}

console.log('\n  ══════════════════════════════════════════');
console.log('   羽毛球计分板 · 发布一致性检查');
console.log('  ══════════════════════════════════════════\n');

/* ---------- A. 版本号一致性 ---------- */
console.log('  ▶  版本号一致性');

const settingsSrc = read('js/settings.js');
const vMatch = /var VERSION = '([^']+)'/.exec(settingsSrc);
if (!vMatch) {
  fail('js/settings.js 里找不到 VERSION 常量');
} else {
  const V = vMatch[1];
  pass(`js/settings.js VERSION = ${V}`);

  const idxSrc = read('index.html');
  const idxVer = /id="about-version">v([^<]+)</.exec(idxSrc);
  if (!idxVer) fail('index.html 里找不到 about-version 初值');
  else if (idxVer[1] !== V) fail(`index.html about-version = ${idxVer[1]}，与 settings.js 的 ${V} 不一致`);
  else pass(`index.html about-version = ${idxVer[1]}`);

  for (const f of ['README.md', 'README.zh-CN.md']) {
    const m = /shields\.io\/badge\/(?:Version|版本)-([\d.]+)-/.exec(read(f));
    if (!m) fail(`${f} 里找不到版本徽章`);
    else if (m[1] !== V) fail(`${f} 徽章 = ${m[1]}，与 settings.js 的 ${V} 不一致`);
    else pass(`${f} 徽章 = ${m[1]}`);
  }

  const pkg = JSON.parse(read('server/package.json'));
  if (pkg.version !== V) fail(`server/package.json = ${pkg.version}，与前端 ${V} 不一致（前后端可分版本，但需显式说明）`);
  else pass(`server/package.json = ${pkg.version}`);
}

/* ---------- B. sw.js 的 ASSETS 与磁盘一致 ---------- */
console.log('\n  ▶  sw.js 预缓存清单');

const swSrc = read('sw.js');
const assetsBlock = /var ASSETS = \[([\s\S]*?)\];/.exec(swSrc);
if (!assetsBlock) {
  fail('sw.js 里找不到 ASSETS 数组');
} else {
  const listed = [...assetsBlock[1].matchAll(/'\.\/([^']*)'/g)]
    .map(m => m[1])
    .filter(p => p !== '');   // './' 表示目录本身，跳过

  const missing = listed.filter(p => !exists(p));
  if (missing.length) fail(`ASSETS 里有 ${missing.length} 个文件在磁盘上不存在：${missing.join(', ')}`);
  else pass(`ASSETS 列出的 ${listed.length} 个文件全部存在`);

  /* 反向：磁盘上的 js/css 是否都进了清单（漏了会导致离线时缺文件） */
  const shouldList = [];
  for (const dir of ['js', 'css', 'vendor']) {
    const walk = d => {
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = d + '/' + e.name;
        if (e.isDirectory()) walk(rel);
        else if (/\.(js|css)$/.test(e.name)) shouldList.push(rel);
      }
    };
    walk(dir);
  }
  const notListed = shouldList.filter(p => !listed.includes(p));
  if (notListed.length) fail(`磁盘上有 ${notListed.length} 个 js/css 未进 ASSETS（离线会缺文件）：${notListed.join(', ')}`);
  else pass(`磁盘上的 ${shouldList.length} 个 js/css 全部在清单里`);
}

/* ---------- C. CACHE_NAME 是否已经 bump ---------- */
console.log('\n  ▶  Service Worker 缓存版本');

const cacheMatch = /var CACHE_NAME = '([^']+)'/.exec(swSrc);
if (!cacheMatch) {
  fail('sw.js 里找不到 CACHE_NAME');
} else {
  const name = cacheMatch[1];
  const n = /-v(\d+)$/.exec(name);
  if (!n) fail(`CACHE_NAME 命名不含 -v<数字> 后缀：${name}`);
  else pass(`CACHE_NAME = ${name}`);

  /* 关键：js/css/vendor 变了而 CACHE_NAME 没跟着变，
     已安装用户会永久停在旧字节（_headers 的 no-cache 在 SW 激活后无效）。
     判据不是"上一次提交"，而是"上一次 bump 之后有没有资产变动"——
     后者才真正对应"用户装到的缓存是否过期"，也不会因为
     把修复拆成多个提交而误报。 */
  const { execSync } = await import('node:child_process');
  let baseline = '';
  try {
    baseline = execSync('git log -1 --format=%H -- sw.js', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { /* 无 git 历史 */ }

  if (!baseline) {
    console.log('  –  跳过 bump 增量判断（无法取得 git 历史）');
  } else {
    /* sw.js 自身还没提交的改动也算"已经 bump"：
       发布检查通常在 commit 之前跑，此时 bump 就躺在工作区里。 */
    let swDirty = false;
    try {
      swDirty = execSync('git status --porcelain -- sw.js', { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
    } catch { /* ignore */ }

    if (swDirty) {
      console.log('  –  sw.js 有未提交改动，视为已 bump（提交后再跑一次可确认）');
    } else {
      /* sw.js 最后一次变动的提交 → 至今（含未提交改动）动过哪些资产 */
      let since = '';
      try {
        since = execSync(`git diff --name-only ${baseline} -- js css vendor`, {
          cwd: ROOT, encoding: 'utf8',
        });
      } catch { /* ignore */ }
      /* 未提交的改动也要算进来 */
      let dirty = '';
      try {
        dirty = execSync('git status --porcelain -- js css vendor', {
          cwd: ROOT, encoding: 'utf8',
        });
      } catch { /* ignore */ }

      const touched = new Set(
        (since + '\n' + dirty).split('\n')
          .map(l => l.replace(/^\s*\S+\s+/, '').trim())   // 去掉 porcelain 的状态前缀
          .filter(l => /^(js|css|vendor)\//.test(l))
      );

      if (touched.size) {
        fail(`自上次 sw.js 变动以来，有 ${touched.size} 个资产被修改但 CACHE_NAME 未重新 bump：\n` +
             [...touched].slice(0, 8).map(p => '      - ' + p).join('\n') +
             (touched.size > 8 ? `\n      …… 另有 ${touched.size - 8} 个` : '') +
             `\n      处理：把 sw.js 的 CACHE_NAME 版本号 +1 后重跑`);
      } else {
        pass('自上次 sw.js 变动以来没有资产改动，缓存版本无需 bump');
      }
    }
  }
}

/* ---------- D. 部署脚本资产清单 ---------- */
console.log('\n  ▶  部署脚本资产清单');

const deploySrc = read('deploy-cloudflare.ps1');
const dirsMatch = /\$dirs\s*=\s*@\(([^)]*)\)/.exec(deploySrc);
const filesMatch = /\$files\s*=\s*@\(([^)]*)\)/.exec(deploySrc);
/* 逐目录期望值：部署脚本用它做硬断言 */
const expectedBlock = /\$expected\s*=\s*\[ordered\]@\{([\s\S]*?)\}/.exec(deploySrc);
const expectedFilesBlock = /\$expectedFiles\s*=\s*@\(([^)]*)\)/.exec(deploySrc);

function countDir(dir) {
  let c = 0;
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) c += countDir(dir + '/' + e.name);
    else c++;
  }
  return c;
}

if (!dirsMatch || !filesMatch) {
  fail('deploy-cloudflare.ps1 里找不到 $dirs / $files 清单');
} else if (!expectedBlock || !expectedFilesBlock) {
  fail('deploy-cloudflare.ps1 里找不到逐目录 $expected / $expectedFiles 断言');
} else {
  /* 解析 $expected = [ordered]@{ 'css' = 8; ... } */
  const exp = {};
  for (const m of expectedBlock[1].matchAll(/'([^']+)'\s*=\s*(\d+)/g)) exp[m[1]] = parseInt(m[2], 10);
  const expFiles = [...expectedFilesBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

  let total = 0;
  for (const [dir, want] of Object.entries(exp)) {
    if (!exists(dir)) { fail(`部署清单里的目录不存在：${dir}`); continue; }
    const actual = countDir(dir);
    total += actual;
    if (actual !== want) {
      fail(`${dir}/ 部署脚本期望 ${want} 个，磁盘实际 ${actual} 个 —— 部署会被断言拦下（需同步更新 $expected）`);
    } else {
      pass(`${dir}/ ${actual} 个，与部署脚本期望一致`);
    }
  }

  const missingFiles = expFiles.filter(f => !exists(f));
  if (missingFiles.length) fail(`部署清单里的文件不存在：${missingFiles.join(', ')}`);
  else pass(`根目录文件 ${expFiles.length} 个全部存在`);
  total += expFiles.length - missingFiles.length;

  const declaredTotal = (Object.values(exp).reduce((a, b) => a + b, 0)) + expFiles.length;
  if (declaredTotal !== total) fail(`部署脚本的期望总数 ${declaredTotal} 与实际 ${total} 不一致`);
  else pass(`期望总数 ${declaredTotal}，与实际一致`);

  /* 部署脚本的 dirs/files 与 expected 必须指向同一批东西 */
  const dirs = [...dirsMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const files = [...filesMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const dirMismatch = dirs.filter(d => !(d in exp)).concat(Object.keys(exp).filter(d => !dirs.includes(d)));
  if (dirMismatch.length) fail(`$dirs 与 $expected 的目录集合不一致：${dirMismatch.join(', ')}`);
  else pass('$dirs 与 $expected 目录集合一致');

  const fileMismatch = files.filter(f => !expFiles.includes(f)).concat(expFiles.filter(f => !files.includes(f)));
  if (fileMismatch.length) fail(`$files 与 $expectedFiles 不一致：${fileMismatch.join(', ')}`);
  else pass('$files 与 $expectedFiles 一致');
}

/* ---------- 汇总 ---------- */
console.log('\n  ──────────────────────────────────────────');
if (problems) {
  console.log(`  ❌ ${problems} 项未通过 / 共 ${checks + problems} 项检查\n`);
  process.exit(1);
}
console.log(`  ✅ 全部通过（${checks} 项）\n`);
