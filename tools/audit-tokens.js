/* 令牌一致性审计
   找出「被 var(--x) 使用、但在任何地方都没有定义」的令牌。
   这类问题不会报错，只会让属性静默失效（颜色/字重变成继承值），
   视觉重构时最容易漏。

   用法：node tools/audit-tokens.js
   退出码：0 = 全部有定义；1 = 存在未定义令牌。 */
const fs = require('fs');
const path = require('path');

/* 动态扫描：新增 CSS/HTML/JS 文件不必回来改这个清单。
   第一版把文件写死在一个数组里，加了 courtside.css 之后它没被扫到，
   审计照样报"全部有定义"——一个漏扫的审计比没有审计更危险。 */
const SCAN_DIRS = ['css', 'js'];
const SCAN_FILES = ['index.html'];
const EXTS = ['.css', '.js', '.html'];

function collect(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p));
    else if (EXTS.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}

const glob = [
  ...SCAN_FILES.filter(f => fs.existsSync(f)),
  ...SCAN_DIRS.flatMap(collect),
];

const defined = new Set();
const used = new Map();   // token -> Set(文件)

function scanDefs(src) {
  // 任何 `--x:` 形式的定义（含 CSS 规则内、inline style、style.setProperty 的字符串参数）
  for (const m of src.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
  for (const m of src.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9-]+)['"]/g)) defined.add(m[1]);
}

function scanUses(src, file) {
  for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(file);
  }
}

for (const f of glob) {
  const s = fs.readFileSync(f, 'utf8');
  scanDefs(s);
  scanUses(s, f);
}

console.log('扫描文件: ' + glob.length + ' 个');
const missing = [...used.keys()].filter(k => !defined.has(k)).sort();
console.log('已定义令牌: ' + defined.size);
console.log('被使用令牌: ' + used.size);
if (missing.length) {
  console.log('\n❌ 未定义但被使用（会导致属性静默失效）:');
  for (const k of missing) console.log('  ' + k + '   <- ' + [...used.get(k)].join(', '));
  process.exitCode = 1;
} else {
  console.log('\n✅ 所有 var() 引用都有定义');
}

// 反向：定义了但从未使用（仅提示，不算错）
const unused = [...defined].filter(k => !used.has(k)).sort();
if (unused.length) {
  console.log('\nℹ️  定义但未使用（' + unused.length + ' 个，仅提示）:');
  console.log('  ' + unused.join(', '));
}
