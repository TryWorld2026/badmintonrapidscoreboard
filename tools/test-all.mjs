#!/usr/bin/env node
/* ================================================================
   tools/test-all.mjs — 一键跑完全部验证

   五套检查依次执行，最后汇总。任何一套失败都会让整体退出码非 0，
   方便直接接进 CI 或 pre-commit。

   为什么要有它：
     单跑某几套容易漏（比如改后端时忘了跑联调）。
     一条命令给出"能不能提交"的确定答案，比记住五条命令可靠。

   用法：
     node tools/test-all.mjs
     node tools/test-all.mjs --skip-backend   # 没起后端时跳过依赖它的两套

   退出码：0 全绿 / 1 有失败 / 2 环境问题
   ================================================================ */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_BACKEND = process.argv.includes('--skip-backend');
const API = (process.argv.find(a => a.startsWith('--api=')) || '').split('=')[1]
  || 'http://127.0.0.1:8787';

/* 后端在跑吗？决定要不要跑依赖它的两套 */
async function backendAlive() {
  try {
    const r = await fetch(API + '/api/health', { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

const SUITES = [
  {
    name: '前端本地逻辑',
    cwd: ROOT,
    cmd: 'node', args: ['tools/run-tests.js'],
    needsBackend: false,
  },
  {
    name: '令牌一致性',
    cwd: ROOT,
    cmd: 'node', args: ['tools/audit-tokens.js'],
    needsBackend: false,
  },
  {
    name: '界面质量审计',
    cwd: ROOT,
    cmd: 'node', args: ['tools/audit-ui.js'],
    needsBackend: false,
  },
  {
    name: '后端类型检查',
    cwd: path.join(ROOT, 'server'),
    cmd: 'npx', args: ['tsc', '--noEmit'],
    needsBackend: false,
    /* Windows 上 npx 是 .cmd，spawnSync 需要 shell */
    shell: true,
  },
  {
    name: '后端接口',
    cwd: path.join(ROOT, 'server'),
    cmd: 'node', args: ['tools/test-api.mjs', `--base=${API}`],
    needsBackend: true,
  },
  {
    name: '前后端联调',
    cwd: ROOT,
    cmd: 'node', args: ['tools/test-sync.mjs', `--api=${API}`],
    needsBackend: true,
  },
];

const alive = SKIP_BACKEND ? false : await backendAlive();

console.log('\n  ══════════════════════════════════════════');
console.log('   羽毛球计分板 · 全量验证');
console.log('  ══════════════════════════════════════════');
if (!alive) {
  console.log('   ℹ️  后端未运行，将跳过「后端接口」「前后端联调」');
  console.log(`      （起后端： cd server && npx wrangler dev --port 8787）`);
}
console.log('');

const results = [];

for (const s of SUITES) {
  if (s.needsBackend && !alive) {
    results.push({ name: s.name, status: 'skipped' });
    console.log(`  ⏭  ${s.name}（后端未运行）`);
    continue;
  }

  process.stdout.write(`  ▶  ${s.name} … `);
  const r = spawnSync(s.cmd, s.args, {
    cwd: s.cwd,
    encoding: 'utf8',
    shell: s.shell || false,
    env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '' },
  });

  const out = (r.stdout || '') + (r.stderr || '');
  /* 从输出里挑一行摘要 —— 各套的摘要格式不同，能挑到就显示，挑不到就显示退出码 */
  const summary =
    (out.match(/回归测试：\s*\d+ 通过 \/ \d+ 失败 \/ 共 \d+/) || [])[0] ||
    (out.match(/通过 \d+ \/ 失败 \d+/) || [])[0] ||
    (out.match(/✅ 全部通过/) || [])[0] ||
    (out.match(/✅ 所有 var\(\) 引用都有定义/) || [])[0] ||
    (r.status === 0 ? '通过' : `退出码 ${r.status}`);

  const okFlag = r.status === 0;
  results.push({ name: s.name, status: okFlag ? 'pass' : 'fail', out });

  console.log(okFlag ? '✅ ' : '❌ ');
  console.log(`       ${summary.trim()}`);

  /* 失败时把细节打出来，否则用户还得自己重跑一遍 */
  if (!okFlag) {
    const fails = (out.match(/✗[^\n]*/g) || []).slice(0, 5);
    fails.forEach(f => console.log(`       ${f.trim().slice(0, 180)}`));
    if (!fails.length) {
      console.log('       （无 ✗ 行，原始输出末尾）');
      out.trim().split('\n').slice(-6).forEach(l => console.log('       ' + l.slice(0, 180)));
    }
  }
  console.log('');
}

const passed = results.filter(r => r.status === 'pass').length;
const failed = results.filter(r => r.status === 'fail').length;
const skipped = results.filter(r => r.status === 'skipped').length;

console.log('  ──────────────────────────────────────────');
console.log(`  通过 ${passed} / 失败 ${failed}` + (skipped ? ` / 跳过 ${skipped}` : ''));
console.log('');

if (failed) {
  console.log('  未通过的项目：');
  results.filter(r => r.status === 'fail').forEach(r => console.log('    ✗ ' + r.name));
  console.log('');
}

/* 跳过后端相关的两套时不算失败，但要提醒 —— 
   否则会给人"全绿"的错觉，而联调那两套恰恰是最容易坏的。 */
if (skipped) {
  console.log('  ⚠️  有项目被跳过，结论不完整。要完整验证请先启动后端。\n');
}

process.exit(failed ? 1 : 0);
