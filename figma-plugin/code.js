/* ================================================================
   figma-plugin/code.js — 把「夜场 NIGHT COURT」写进 Figma

   为什么是插件而不是 MCP：
     Figma MCP 的读工具受计划额度限制（Starter + View 席位 = 每月 20 次），
     而建一个完整设计系统需要几百次调用。本地插件走同一套 Plugin API，
     不受额度限制，而且可以反复重跑 —— 改一行再跑一次就行。

   产出（5 个页面）：
     封面 Cover          方向说明 / 五条铁律 / 色板
     基础 Foundations    全部令牌：色 / 字 / 间距 / 圆角 / 光
     组件 Components     按钮 / 芯片 / 选择卡 / 输入 / 开关 / 标签 / 列表 / 时间轴
     界面 Screens        12 个真实界面（390×844）
     场边与分享          场边横屏 / 场边竖屏 / 分享卡

   真值来源：css/tokens.css、css/screens.css、css/components.css、index.html。
   本文件里的色值/尺寸必须与它们同源；tokens.css 改了这里也要改。
   ================================================================ */
'use strict';

/* ---------------- 0 · 令牌真值 ---------------- */

const C = {
  void: '#0A0D0C', plate: '#101513', plate2: '#161C1A', plate3: '#1E2523', board: '#0B0F0E',
  fg: '#F4F1EA', fg2: '#A9B2AD', fg3: '#8A948E',
  a: '#FF5A47', b: '#4FA8E8',
  live: '#F2C14E', ok: '#4FC08A', danger: '#FF5A4F',
  gold: '#D8B26A', silver: '#A9B2BC', bronze: '#B8814F',
  onLight: '#0A0D0C', white: '#FFFFFF',
};

/* 令牌名 → [值, 作用域, CSS 变量名]

   基色一律作用域留空（= 在选择器里隐藏）。
   这是设计系统的标准做法：基色是「原料」，不该出现在任何属性面板里；
   能用的是语义层（color/team/a、color/text/primary…）。
   顺带避开一个坑：语义层是基色的别名，若基色只声明了
   FRAME_FILL 而语义层要用于 TEXT_FILL，Figma 会在别名处报作用域冲突。 */
const PRIMITIVES = [
  ['ink/void',    C.void,   '[]', '--void'],
  ['ink/plate',   C.plate,  '[]', '--plate'],
  ['ink/plate-2', C.plate2, '[]', '--plate-2'],
  ['ink/plate-3', C.plate3, '[]', '--plate-3'],
  ['ink/board',   C.board,  '[]', '--board'],
  ['ink/fg',      C.fg,     '[]', '--fg'],
  ['ink/fg-2',    C.fg2,    '[]', '--fg-2'],
  ['ink/fg-3',    C.fg3,    '[]', '--fg-3'],
  ['ink/on-light',C.onLight,'[]', '--on-light'],
  ['hue/a',       C.a,      '[]', '--a'],
  ['hue/b',       C.b,      '[]', '--b'],
  ['hue/live',    C.live,   '[]', '--live'],
  ['hue/ok',      C.ok,     '[]', '--ok'],
  ['hue/danger',  C.danger, '[]', '--danger'],
  ['hue/gold',    C.gold,   '[]', '--gold'],
  ['hue/silver',  C.silver, '[]', '--silver'],
  ['hue/bronze',  C.bronze, '[]', '--bronze'],
  ['ink/white',   C.white,  '[]', '--white'],
];

/* 语义层：全部别名到基色，不重复写字面量 */
const SEMANTIC = [
  ['color/bg/canvas',      'ink/void',    1,    'FRAME_FILL,SHAPE_FILL', '--void'],
  ['color/bg/board',       'ink/board',   1,    'FRAME_FILL,SHAPE_FILL', '--board'],
  ['color/bg/panel',       'ink/plate',   1,    'FRAME_FILL,SHAPE_FILL', '--plate'],
  ['color/bg/panel-2',     'ink/plate-2', 1,    'FRAME_FILL,SHAPE_FILL', '--plate-2'],
  ['color/bg/panel-3',     'ink/plate-3', 1,    'FRAME_FILL,SHAPE_FILL', '--plate-3'],
  ['color/text/primary',   'ink/fg',      1,    'TEXT_FILL', '--fg'],
  ['color/text/secondary', 'ink/fg-2',    1,    'TEXT_FILL', '--fg-2'],
  ['color/text/tertiary',  'ink/fg-3',    1,    'TEXT_FILL', '--fg-3'],
  ['color/text/on-light',  'ink/on-light',1,    'TEXT_FILL', '--on-light'],
  ['color/text/trailing',  'ink/fg',      0.62, 'TEXT_FILL', '--fg-dim'],
  ['color/border/hairline','ink/fg',      0.08, 'STROKE_COLOR', '--edge'],
  ['color/border/default', 'ink/fg',      0.14, 'STROKE_COLOR', '--edge-2'],
  ['color/border/strong',  'ink/fg',      0.24, 'STROKE_COLOR', '--edge-3'],
  ['color/border/focus',   'ink/fg',      0.38, 'STROKE_COLOR', '--edge-4'],
  ['color/team/a',         'hue/a',       1,    'FRAME_FILL,SHAPE_FILL,TEXT_FILL,STROKE_COLOR', '--a'],
  ['color/team/b',         'hue/b',       1,    'FRAME_FILL,SHAPE_FILL,TEXT_FILL,STROKE_COLOR', '--b'],
  ['color/status/live',    'hue/live',    1,    'FRAME_FILL,SHAPE_FILL,TEXT_FILL', '--live'],
  ['color/status/ok',      'hue/ok',      1,    'FRAME_FILL,SHAPE_FILL,TEXT_FILL', '--ok'],
  ['color/status/danger',  'hue/danger',  1,    'FRAME_FILL,SHAPE_FILL,TEXT_FILL', '--danger'],
  ['color/status/gold',    'hue/gold',    1,    'FRAME_FILL,SHAPE_FILL,TEXT_FILL', '--gold'],
];

/* 尺度层：间距 / 圆角 / 字号 / 布局 / 动效 */
const SCALE = [
  ['space/1', 4,  'GAP,WIDTH_HEIGHT', '--sp-1'],
  ['space/2', 8,  'GAP,WIDTH_HEIGHT', '--sp-2'],
  ['space/3', 12, 'GAP,WIDTH_HEIGHT', '--sp-3'],
  ['space/4', 16, 'GAP,WIDTH_HEIGHT', '--sp-4'],
  ['space/5', 20, 'GAP,WIDTH_HEIGHT', '--sp-5'],
  ['space/6', 24, 'GAP,WIDTH_HEIGHT', '--sp-6'],
  ['space/7', 32, 'GAP,WIDTH_HEIGHT', '--sp-7'],
  ['space/8', 40, 'GAP,WIDTH_HEIGHT', '--sp-8'],
  ['radius/xs', 3,    'CORNER_RADIUS', '--r-xs'],
  ['radius/panel', 0, 'CORNER_RADIUS', '--r-sm'],
  ['radius/sheet', 14,'CORNER_RADIUS', '--r-sheet'],
  ['radius/full', 999,'CORNER_RADIUS', '--r-full'],
  ['font/3xs', 9.5,   'FONT_SIZE', '--fs-3xs'],
  ['font/2xs', 11,    'FONT_SIZE', '--fs-2xs'],
  ['font/xs', 11,     'FONT_SIZE', '--fs-xs'],
  ['font/sm', 13.5,   'FONT_SIZE', '--fs-sm'],
  ['font/md', 13.5,   'FONT_SIZE', '--fs-md'],
  ['font/lg', 15,     'FONT_SIZE', '--fs-lg'],
  ['font/xl', 17,     'FONT_SIZE', '--fs-xl'],
  ['font/2xl', 19,    'FONT_SIZE', '--fs-2xl'],
  ['font/3xl', 26,    'FONT_SIZE', '--fs-3xl'],
  ['font/score', 140, 'FONT_SIZE', '--fs-score'],
  ['font/score-cs', 205, 'FONT_SIZE', '--fs-score-cs'],
  ['layout/appbar', 50, 'WIDTH_HEIGHT', '--appbar-h'],
  ['layout/tabbar', 62, 'WIDTH_HEIGHT', '--tabbar-h'],
  ['layout/content-max', 440, 'WIDTH_HEIGHT', '--content-max'],
  ['layout/gutter', 16, 'GAP,WIDTH_HEIGHT', '--gutter'],
  ['layout/tap-min', 44, 'WIDTH_HEIGHT', '--tap-min'],
  ['layout/dock', 104, 'WIDTH_HEIGHT', '--dock-h'],
  ['motion/1', 90,  '[]', '--dur-1'],
  ['motion/2', 120, '[]', '--dur-2'],
  ['motion/3', 220, '[]', '--dur-3'],
  ['motion/4', 320, '[]', '--dur-4'],
];

/* 字体族：产品自带 Barlow Semi Condensed（OFL），中文回落系统黑体。
   按可用性依次尝试 —— 目标机器上没装就往下走，绝不写死一个不存在的族。 */
const DISPLAY_STACK = ['Barlow Semi Condensed', 'Barlow', 'Oswald', 'Roboto Condensed', 'Inter'];
const CJK_STACK = ['Noto Sans SC', 'Source Han Sans SC', 'Alibaba PuHuiTi 3.0', 'HarmonyOS Sans SC',
  'Microsoft YaHei', 'PingFang SC', 'Inter'];

/* ---------------- 1 · 工具 ---------------- */

const V = {};      // 令牌名 → Variable
const F = {};      // 'display:700' → fontName
const WARN = [];
const CREATED = [];
const BOUND = { colors: 0, scales: 0, fills: 0 };

/* FILL 只能设在「已经是 auto-layout 子节点」的节点上。
   而本文件里绝大多数节点是先建、设属性、最后才被 appendChild 的 ——
   在那个时刻设 FILL 会直接抛错。
   所以这里只登记意图，等整棵树挂完（settleFills）再统一应用：
   那时候每个节点的父级都已经是 auto-layout 了。 */
const PENDING_FILL = [];

function wantFillH(node) { PENDING_FILL.push([node, 'layoutSizingHorizontal']); return node; }
function wantFillV(node) { PENDING_FILL.push([node, 'layoutSizingVertical']); return node; }

/* 按登记顺序（父级先于子级）应用：父级先定尺寸，子级的 FILL 才有参照。
   单个节点失败不影响其余（例如被 absolute 定位或被裁切的容器）。 */
function settleFills() {
  let ok = 0;
  for (let i = 0; i < PENDING_FILL.length; i++) {
    const node = PENDING_FILL[i][0];
    const prop = PENDING_FILL[i][1];
    try { node[prop] = 'FILL'; ok++; } catch (e) { /* 该节点不适用 */ }
  }
  PENDING_FILL.length = 0;
  return ok;
}

/* ---------------- 0b · 颜色 → 令牌 ---------------- */

/* 建完之后把「长得像某个令牌」的实色填充真正绑到变量上。
   这一步让 Figma 文件是令牌驱动的，而不是一堆散落的硬编码色值：
   改一个变量，整个文件跟着变。

   文本和背景分开查表 —— 变量的作用域是分开的（TEXT_FILL vs FRAME_FILL），
   拿背景变量去绑文字会被 Figma 拒绝。 */
const TEXT_TOKEN = {
  '#F4F1EA': 'color/text/primary',
  '#A9B2AD': 'color/text/secondary',
  '#8A948E': 'color/text/tertiary',
  '#0A0D0C': 'color/text/on-light',
  '#FF5A47': 'color/team/a',
  '#4FA8E8': 'color/team/b',
  '#F2C14E': 'color/status/live',
  '#4FC08A': 'color/status/ok',
  '#FF5A4F': 'color/status/danger',
  '#D8B26A': 'color/status/gold',
};

const FILL_TOKEN = {
  '#0A0D0C': 'color/bg/canvas',
  '#0B0F0E': 'color/bg/board',
  '#101513': 'color/bg/panel',
  '#161C1A': 'color/bg/panel-2',
  '#1E2523': 'color/bg/panel-3',
  '#F4F1EA': 'color/text/primary',
  '#FF5A47': 'color/team/a',
  '#4FA8E8': 'color/team/b',
  '#F2C14E': 'color/status/live',
  '#4FC08A': 'color/status/ok',
  '#FF5A4F': 'color/status/danger',
  '#D8B26A': 'color/status/gold',
};

function rgbKey(c) {
  const to = function (v) {
    const n = Math.round(v * 255).toString(16).toUpperCase();
    return n.length === 1 ? '0' + n : n;
  };
  return '#' + to(c.r) + to(c.g) + to(c.b);
}

function bindColorTokens(root) {
  let bound = 0;
  const nodes = root.findAll(function () { return true; });
  for (const node of nodes) {
    /* 填充：跳过渐变与图片 —— 只有实色能直接换绑。 */
    if (Array.isArray(node.fills) && node.fills.length === 1) {
      const p = node.fills[0];
      if (p.type === 'SOLID' && p.visible !== false) {
        const isText = node.type === 'TEXT';
        const token = (isText ? TEXT_TOKEN : FILL_TOKEN)[rgbKey(p.color)];
        const v = token ? V[token] : null;
        if (v) {
          try {
            const next = figma.variables.setBoundVariableForPaint(p, 'color', v);
            if (p.opacity !== undefined && p.opacity !== 1) next.opacity = p.opacity;
            node.fills = [next];
            bound++;
          } catch (e) { /* 该节点不接受绑定 */ }
        }
      }
    }
    /* 描边：同样只处理单条实色。 */
    if (Array.isArray(node.strokes) && node.strokes.length === 1) {
      const s = node.strokes[0];
      if (s.type === 'SOLID' && s.visible !== false) {
        const token = FILL_TOKEN[rgbKey(s.color)];
        const v = token ? V[token] : null;
        if (v) {
          try {
            const next = figma.variables.setBoundVariableForPaint(s, 'color', v);
            if (s.opacity !== undefined && s.opacity !== 1) next.opacity = s.opacity;
            node.strokes = [next];
            bound++;
          } catch (e) { /* 该节点不接受绑定 */ }
        }
      }
    }
  }
  return bound;
}

/* 间距 / 圆角也绑到尺度令牌上。
   只在「值正好等于某个令牌」时绑定 —— 不为了凑令牌而改设计。 */
const GAP_TOKEN = { 4: 'space/1', 8: 'space/2', 12: 'space/3', 16: 'space/4',
  20: 'space/5', 24: 'space/6', 32: 'space/7', 40: 'space/8' };
const RADIUS_TOKEN = { 3: 'radius/xs', 0: 'radius/panel', 14: 'radius/sheet', 999: 'radius/full' };

function bindScaleTokens(root) {
  let bound = 0;
  const nodes = root.findAll(function () { return true; });
  for (const node of nodes) {
    if (typeof node.itemSpacing === 'number') {
      const t = GAP_TOKEN[Math.round(node.itemSpacing)];
      if (t && V[t]) { try { node.setBoundVariable('itemSpacing', V[t]); bound++; } catch (e) { /* 不适用 */ } }
    }
    if (typeof node.cornerRadius === 'number' && node.cornerRadius !== figma.mixed) {
      const t = RADIUS_TOKEN[Math.round(node.cornerRadius)];
      if (t && V[t]) { try { node.setBoundVariable('cornerRadius', V[t]); bound++; } catch (e) { /* 不适用 */ } }
    }
  }
  return bound;
}

/* 每页收尾：结算该页的 FILL 意图，再把颜色/间距绑到令牌。

   ⚠️ 必须逐页做，不能在最后统一遍历 figma.root.children。
   Figma 只加载「当前页」的子节点：非当前页的 page.children 是空的，
   最后统一遍历会静默跳过前面所有页面（除最后一页外全部没绑上）。
   这里在每页仍是 currentPage 时就地处理，是唯一可靠的时机。 */
function finishPage(page) {
  const filled = settleFills();
  let colors = 0, scales = 0;
  for (const root of page.children) {
    colors += bindColorTokens(root);
    scales += bindScaleTokens(root);
  }
  BOUND.colors += colors;
  BOUND.scales += scales;
  BOUND.fills += filled;
  return { filled: filled, colors: colors, scales: scales };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function solid(hex, opacity) {
  const p = { type: 'SOLID', color: hexToRgb(hex) };
  if (opacity !== undefined && opacity !== 1) p.opacity = opacity;
  return p;
}

/* 面：两段渐变。v4 的层次来自这个 + 顶光，不来自 1px 灰边。 */
function face(top, bottom) {
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[0, 1, 0], [-1, 0, 1]],
    gradientStops: [
      { position: 0, color: Object.assign(hexToRgb(top), { a: 1 }) },
      { position: 1, color: Object.assign(hexToRgb(bottom), { a: 1 }) },
    ],
  };
}

const FACE_1 = () => face('#171D1B', '#121716');
const FACE_2 = () => face('#1E2523', '#171D1B');
const FACE_3 = () => face('#262E2B', '#1E2523');

/* 顶光：暗色 UI 的层次全靠这一条。 */
function lift(strength) {
  return {
    type: 'INNER_SHADOW',
    color: { r: 1, g: 1, b: 1, a: strength === 2 ? 0.10 : 0.065 },
    offset: { x: 0, y: 1 }, radius: 0, spread: 0,
    visible: true, blendMode: 'NORMAL',
  };
}

function plateShadow() {
  return {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.45 },
    offset: { x: 0, y: 1 }, radius: 0, spread: 0,
    visible: true, blendMode: 'NORMAL',
  };
}

function popShadow() {
  return {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.55 },
    offset: { x: 0, y: 14 }, radius: 34, spread: 0,
    visible: true, blendMode: 'NORMAL',
  };
}

function sinkShadow() {
  return {
    type: 'INNER_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.55 },
    offset: { x: 0, y: 1 }, radius: 2, spread: 0,
    visible: true, blendMode: 'NORMAL',
  };
}

/* 绑定令牌到数值属性。属性不存在就跳过 —— 不同节点类型可用属性不同。 */
function bind(node, prop, tokenName) {
  const v = V[tokenName];
  if (!v) return false;
  try { node.setBoundVariable(prop, v); return true; }
  catch (e) { return false; }
}

/* 绑定令牌到填充色。setBoundVariableForPaint 返回新 paint，必须重新赋值。 */
function bindFill(node, tokenName, fallbackHex) {
  const v = V[tokenName];
  if (!v) { node.fills = [solid(fallbackHex || C.plate)]; return false; }
  try {
    node.fills = [figma.variables.setBoundVariableForPaint(solid(fallbackHex || C.plate), 'color', v)];
    return true;
  } catch (e) { node.fills = [solid(fallbackHex || C.plate)]; return false; }
}

/* ---------------- 2 · 字体 ---------------- */

let AVAIL = null;
/* 加载失败的字重/字族。pickFont 会跳过它们 —— 否则 mkText 里
   给文本节点赋 fontName 会直接抛错，而那时已经没法回头补救。 */
const FONT_FAILED = {};
const FONT_OK = {};

function weightAliases(weight) {
  if (weight <= 400) return ['Regular', 'Book', 'Normal', 'Roman'];
  if (weight <= 500) return ['Medium', 'Regular', 'Book'];
  if (weight <= 600) return ['Semi Bold', 'SemiBold', 'Demi Bold', 'DemiBold', 'Medium', 'Bold'];
  if (weight <= 700) return ['Bold', 'Semi Bold', 'SemiBold', 'Black'];
  return ['Extra Bold', 'ExtraBold', 'Black', 'Heavy', 'Bold'];
}

function familyStyles(family) {
  return AVAIL.filter(f => f.fontName.family === family).map(f => f.fontName.style);
}

/* 在候选族里挑第一个「真的有这个字重」的族；都没有就退回该族最接近的字重。 */
function pickFont(stack, weight) {
  const aliases = weightAliases(weight);
  for (const family of stack) {
    const styles = familyStyles(family);
    if (!styles.length) continue;
    for (const a of aliases) {
      if (styles.indexOf(a) !== -1 && !FONT_FAILED[family + '|' + a]) {
        return { family: family, style: a };
      }
    }
  }
  for (const family of stack) {
    const styles = familyStyles(family);
    if (!styles.length) continue;
    for (const a of ['Regular', 'Medium', 'Bold']) {
      if (styles.indexOf(a) !== -1 && !FONT_FAILED[family + '|' + a]) {
        return { family: family, style: a };
      }
    }
    for (const st of styles) {
      if (!FONT_FAILED[family + '|' + st]) return { family: family, style: st };
    }
  }
  return { family: 'Inter', style: 'Regular' };
}

const CJK_RE = /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uFF00-\uFFEF\u2018\u2019\u201C\u201D\u2026]/;

function hasCJK(s) { return CJK_RE.test(String(s)); }

/* 含中文 → 中文族；纯数字/拉丁 → 读数族。 */
function fontFor(str, weight) {
  const isCJK = hasCJK(str);
  const key = (isCJK ? 'cjk' : 'display') + ':' + weight;
  if (!F[key]) F[key] = pickFont(isCJK ? CJK_STACK : DISPLAY_STACK, weight);
  return F[key];
}

async function loadFontsFor(strings, weights) {
  const seen = {};
  const jobs = [];
  for (const s of strings) {
    for (const w of weights) {
      const fn = fontFor(s, w);
      const k = fn.family + '|' + fn.style;
      if (seen[k]) continue;
      seen[k] = 1;
      jobs.push(figma.loadFontAsync(fn).then(function () {
        FONT_OK[k] = 1;
      }).catch(function () {
        FONT_FAILED[k] = 1;
        WARN.push('字体加载失败：' + k);
      }));
    }
  }
  await Promise.all(jobs);

  /* 丢掉缓存里指向失败字体的条目，让后续 fontFor 重新选一个可用的。
     没有这一步，同一个 key 会一直返回那个加载不上的字体。 */
  for (const key of Object.keys(F)) {
    const fn = F[key];
    if (FONT_FAILED[fn.family + '|' + fn.style]) delete F[key];
  }
}

/* 加载单个字体并记账。返回 true 表示可以安全地赋给节点。 */
async function ensureFont(fn) {
  const k = fn.family + '|' + fn.style;
  if (FONT_OK[k]) return true;
  if (FONT_FAILED[k]) return false;
  try {
    await figma.loadFontAsync(fn);
    FONT_OK[k] = 1;
    return true;
  } catch (e) {
    FONT_FAILED[k] = 1;
    WARN.push('字体加载失败：' + k);
    return false;
  }
}

/* 挑一个「已经确认能加载」的字体；找不到就现场试，全失败则回落到 Inter。 */
async function resolveFont(stack, weight) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const fn = pickFont(stack, weight);
    if (await ensureFont(fn)) return fn;
  }
  const fallback = { family: 'Inter', style: 'Regular' };
  await ensureFont(fallback);
  return fallback;
}

/* ---------------- 3 · 基础构件 ---------------- */

function mkFrame(name, dir, opts) {
  opts = opts || {};
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = dir;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = opts.gap === undefined ? 0 : opts.gap;
  f.paddingLeft = opts.pl === undefined ? 0 : opts.pl;
  f.paddingRight = opts.pr === undefined ? 0 : opts.pr;
  f.paddingTop = opts.pt === undefined ? 0 : opts.pt;
  f.paddingBottom = opts.pb === undefined ? 0 : opts.pb;
  f.fills = [];
  f.clipsContent = !!opts.clip;
  if (opts.w) f.resize(opts.w, opts.h || 100);
  if (opts.radius !== undefined) f.cornerRadius = opts.radius;
  if (opts.effects) f.effects = opts.effects;
  CREATED.push(f.id);
  return f;
}

/* 文本。默认宽高随内容；给了 w 就按宽度换行。 */
function mkText(str, opts) {
  opts = opts || {};
  const t = figma.createText();
  const w = opts.weight === undefined ? 400 : opts.weight;
  t.fontName = readyFont(str, w);
  t.characters = String(str);
  t.fontSize = opts.size === undefined ? 13.5 : opts.size;
  t.lineHeight = { unit: 'PERCENT', value: (opts.lh === undefined ? 1.4 : opts.lh) * 100 };
  if (opts.ls !== undefined) t.letterSpacing = { unit: 'PERCENT', value: opts.ls * 100 };
  t.fills = [solid(opts.color || C.fg)];
  if (opts.opacity !== undefined) t.opacity = opts.opacity;
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  if (opts.w) { t.textAutoResize = 'HEIGHT'; t.resize(opts.w, t.height); }
  if (opts.align) t.textAlignHorizontal = opts.align;
  if (opts.upper) t.textCase = 'UPPER';
  t.name = opts.name || String(str).slice(0, 24);
  CREATED.push(t.id);
  return t;
}

/* 取一个「确定已经加载成功」的字体。
   理论上前面的 loadFontsFor 已经覆盖了全部会出现的字符串，
   但漏网的字重一旦赋给文本节点就是硬抛错。这里做最后一次兜底：
   没加载过就同步挑一个已知可用的，绝不把未加载的字体交给文本节点。 */
function readyFont(str, weight) {
  const fn = fontFor(str, weight);
  if (FONT_OK[fn.family + '|' + fn.style]) return fn;

  const isCJK = hasCJK(str);
  const stack = isCJK ? CJK_STACK : DISPLAY_STACK;
  for (const family of stack) {
    for (const style of familyStyles(family)) {
      if (FONT_OK[family + '|' + style]) return { family: family, style: style };
    }
  }
  /* 一个都没加载过（理论上不会发生）：回落到 Inter Regular，
     它是 Figma 环境里唯一保证存在的字体。 */
  return { family: 'Inter', style: 'Regular' };
}

/* 仪器标签：全大写 + 加宽字距，这是「仪表」的语言。 */
function mkLabel(str, color) {
  return mkText(str, { size: 9.5, weight: 700, ls: 0.20, color: color || C.fg3, upper: true, lh: 1.2 });
}

function rect(name, w, h, hex, opacity) {
  const r = figma.createRectangle();
  r.name = name;
  r.resize(w, h);
  r.fills = [solid(hex, opacity)];
  CREATED.push(r.id);
  return r;
}

function spacer(name) {
  const s = mkFrame(name || '占位', 'HORIZONTAL');
  wantFillH(s);
  return s;
}

/* 面板：锐角 + 两段渐变 + 顶光。 */
function mkPanel(name, opts) {
  opts = opts || {};
  const pad = opts.p === undefined ? 16 : opts.p;
  const f = mkFrame(name, 'VERTICAL', {
    gap: opts.gap === undefined ? 12 : opts.gap,
    pl: pad, pr: pad, pt: pad, pb: pad,
    radius: 0,
    effects: [lift(opts.liftStrength || 1), plateShadow()],
  });
  f.fills = [opts.grad ? opts.grad() : FACE_1()];
  wantFillH(f);
  return f;
}

function cardTitle(str, extra) {
  const row = mkFrame('标题行', 'HORIZONTAL', { gap: 8 });
  row.counterAxisAlignItems = 'CENTER';
  row.appendChild(mkText(str, { size: 15, weight: 700, color: C.fg, lh: 1.2 }));
  if (extra) {
    row.appendChild(spacer());
    row.appendChild(mkText(extra, { size: 11, weight: 400, color: C.fg3, lh: 1.2 }));
  }
  return row;
}

/* 按钮。variant: primary / outline / ghost / danger / dark */
function mkBtn(label, variant, opts) {
  opts = opts || {};
  const b = mkFrame('按钮 / ' + label, 'HORIZONTAL', {
    gap: 8,
    pl: opts.icon ? 0 : 20, pr: opts.icon ? 0 : 20,
    pt: 12, pb: 12,
    radius: 999,
  });
  b.counterAxisAlignItems = 'CENTER';
  b.primaryAxisAlignItems = 'CENTER';
  b.minHeight = 44;

  if (variant === 'primary') {
    b.fills = [face('#FFFFFF', '#E8E4DA')];
    b.effects = [
      { type: 'INNER_SHADOW', color: { r: 1, g: 1, b: 1, a: 0.5 }, offset: { x: 0, y: 1 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' },
      plateShadow(),
    ];
  } else if (variant === 'outline') {
    b.fills = [];
    b.strokes = [solid(C.fg, 0.14)];
    b.strokeWeight = 1;
    b.strokeAlign = 'INSIDE';
  } else if (variant === 'ghost') {
    b.fills = [];
  } else if (variant === 'danger') {
    bindFill(b, 'color/status/danger', C.danger);
  } else {
    b.fills = [FACE_2()];
    b.effects = [lift(1), plateShadow()];
  }

  if (opts.icon) {
    b.paddingLeft = 0; b.paddingRight = 0;
    b.resize(44, 44);
    b.primaryAxisSizingMode = 'FIXED';
    b.counterAxisSizingMode = 'FIXED';
  }
  const color = (variant === 'primary' || variant === 'danger') ? C.onLight
    : (variant === 'outline' || variant === 'ghost') ? C.fg2 : C.fg;
  b.appendChild(mkText(label, { size: opts.size || 13.5, weight: 600, color: color, lh: 1 }));
  if (opts.block) {
    wantFillH(b);
    b.primaryAxisSizingMode = 'FIXED';
  }
  return b;
}

function mkChip(label, active, withIcon) {
  const c = mkFrame('芯片 / ' + label, 'HORIZONTAL', { gap: 4, pl: 16, pr: 16, pt: 8, pb: 8, radius: 999 });
  c.counterAxisAlignItems = 'CENTER';
  c.minHeight = 44;
  if (active) {
    c.fills = [FACE_3()];
    c.effects = [lift(2)];
    c.strokes = [solid(C.fg, 0.24)];
  } else {
    c.fills = [FACE_1()];
    c.effects = [lift(1)];
    c.strokes = [solid(C.fg, 0.08)];
  }
  c.strokeWeight = 1;
  c.strokeAlign = 'INSIDE';
  if (withIcon) c.appendChild(mkText('+', { size: 13.5, weight: 500, color: active ? C.fg : C.fg2, lh: 1 }));
  c.appendChild(mkText(label, { size: 13.5, weight: 500, color: active ? C.fg : C.fg2, lh: 1 }));
  return c;
}

/* 选择卡。选中态用象牙白顶线 —— 不是琥珀（琥珀只表示「进行中」）。 */
function mkPickCard(name, desc, active, iconGlyph) {
  const p = mkFrame('选择卡 / ' + name, 'VERTICAL', { gap: 4, pl: 8, pr: 8, pt: 12, pb: 12, radius: 0 });
  p.counterAxisAlignItems = 'CENTER';
  p.primaryAxisAlignItems = 'CENTER';
  p.minHeight = 76;
  p.fills = [active ? FACE_2() : FACE_1()];
  p.effects = [lift(active ? 2 : 1), plateShadow()];
  wantFillH(p);
  if (active) {
    const top = rect('选中线', 10, 3, C.fg);
    p.appendChild(top);
    wantFillH(top);
    top.layoutSizingVertical = 'FIXED';
  }
  if (iconGlyph) p.appendChild(mkText(iconGlyph, { size: 19, weight: 400, color: active ? C.fg : C.fg2, lh: 1 }));
  p.appendChild(mkText(name, { size: 13.5, weight: 600, color: C.fg, lh: 1.4 }));
  if (desc) p.appendChild(mkText(desc, { size: 9.5, weight: 400, color: C.fg3, lh: 1.4 }));
  return p;
}

function mkSegmented(items, activeIndex) {
  const s = mkFrame('分段控件', 'HORIZONTAL', { gap: 2, pl: 3, pr: 3, pt: 3, pb: 3, radius: 999 });
  s.fills = [solid(C.void)];
  s.effects = [sinkShadow()];
  wantFillH(s);
  s.primaryAxisSizingMode = 'FIXED';
  items.forEach(function (it, i) {
    const cell = mkFrame('段 / ' + it, 'HORIZONTAL', { pl: 12, pr: 12, pt: 10, pb: 10, radius: 999 });
    cell.primaryAxisAlignItems = 'CENTER';
    cell.counterAxisAlignItems = 'CENTER';
    cell.minHeight = 38;
    wantFillH(cell);
    cell.fills = i === activeIndex ? [FACE_2()] : [];
    if (i === activeIndex) cell.effects = [lift(2)];
    cell.appendChild(mkText(it, { size: 13.5, weight: 600, color: i === activeIndex ? C.fg : C.fg3, lh: 1 }));
    s.appendChild(cell);
  });
  return s;
}

function mkToggle(on) {
  const t = mkFrame('开关', 'HORIZONTAL', { radius: 999 });
  t.resize(48, 28);
  t.primaryAxisSizingMode = 'FIXED';
  t.counterAxisSizingMode = 'FIXED';
  t.primaryAxisAlignItems = 'MAX';
  t.counterAxisAlignItems = 'CENTER';
  t.paddingRight = 3;
  t.fills = [solid(on ? C.ok : C.plate3)];
  if (!on) t.effects = [sinkShadow()];
  const knob = figma.createEllipse();
  knob.name = '滑块';
  knob.resize(22, 22);
  knob.fills = [solid(on ? C.onLight : C.fg2)];
  knob.effects = [plateShadow()];
  t.appendChild(knob);
  CREATED.push(knob.id);
  return t;
}

function switchRow(label, desc, on) {
  const r = mkFrame('开关行 / ' + label, 'HORIZONTAL', { gap: 12, pt: 12, pb: 12 });
  r.counterAxisAlignItems = 'CENTER';
  wantFillH(r);
  const info = mkFrame('说明', 'VERTICAL', { gap: 2 });
  wantFillH(info);
  info.appendChild(mkText(label, { size: 13.5, weight: 600, color: C.fg, lh: 1.4 }));
  info.appendChild(mkText(desc, { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
  r.appendChild(info);
  r.appendChild(mkToggle(on));
  return r;
}

function mkTag(label, kind) {
  const map = { win: C.ok, lose: C.danger, gold: C.gold, brand: C.fg, neutral: C.fg2 };
  const c = map[kind] || C.fg2;
  const t = mkFrame('标签 / ' + label, 'HORIZONTAL', { pl: 8, pr: 8, pt: 3, pb: 3, radius: 3 });
  t.fills = [solid(c, 0.16)];
  t.appendChild(mkText(label, { size: 9.5, weight: 700, ls: 0.08, color: c, upper: kind === 'neutral', lh: 1.4 }));
  return t;
}

function mkListItem(title, sub, end, iconGlyph) {
  const it = mkFrame('列表项 / ' + title, 'HORIZONTAL', { gap: 12, pl: 16, pr: 16, pt: 12, pb: 12, radius: 0 });
  it.counterAxisAlignItems = 'CENTER';
  wantFillH(it);
  it.fills = [FACE_1()];
  it.effects = [lift(1)];
  if (iconGlyph) {
    const box = mkFrame('图标位', 'HORIZONTAL');
    box.resize(24, 24);
    box.primaryAxisSizingMode = 'FIXED';
    box.counterAxisSizingMode = 'FIXED';
    box.primaryAxisAlignItems = 'CENTER';
    box.counterAxisAlignItems = 'CENTER';
    box.fills = [];
    box.appendChild(mkText(iconGlyph, { size: 17, color: C.fg2, lh: 1 }));
    it.appendChild(box);
  }
  const main = mkFrame('主体', 'VERTICAL', { gap: 2 });
  wantFillH(main);
  main.appendChild(mkText(title, { size: 13.5, weight: 600, color: C.fg, lh: 1.4 }));
  if (sub) main.appendChild(mkText(sub, { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
  it.appendChild(main);
  if (end) it.appendChild(mkText(end, { size: 13.5, weight: 700, color: C.fg, lh: 1 }));
  return it;
}

function mkStatCard(value, key) {
  const s = mkFrame('统计卡 / ' + key, 'VERTICAL', { gap: 2, pl: 12, pr: 12, pt: 12, pb: 12, radius: 0 });
  s.fills = [FACE_1()];
  s.effects = [lift(1), plateShadow()];
  wantFillH(s);
  s.appendChild(mkText(value, { size: 19, weight: 700, color: C.fg, lh: 1.15 }));
  s.appendChild(mkLabel(key, C.fg3));
  return s;
}

function mkSectionTitle(str) {
  const row = mkFrame('分区标题', 'HORIZONTAL', { gap: 8 });
  row.counterAxisAlignItems = 'CENTER';
  row.appendChild(rect('竖标', 2, 14, C.fg));
  row.appendChild(mkText(str, { size: 13.5, weight: 700, color: C.fg, lh: 1.2 }));
  return row;
}

/* 场边/记分共用的「两半场」：中线是网，外沿是边线。 */
function mkHalfCourt(teamKey, teamColor, name, score, leading, opts) {
  opts = opts || {};
  const half = mkFrame('半场 / ' + teamKey, 'VERTICAL', {
    gap: 8,
    pl: 16, pr: 16,
    pt: opts.padTop === undefined ? 20 : opts.padTop,
    pb: 16,
  });
  half.counterAxisAlignItems = 'CENTER';
  half.primaryAxisAlignItems = 'CENTER';
  wantFillH(half);
  wantFillV(half);
  half.clipsContent = true;
  const tint = leading ? teamColor : '#FFFFFF';
  const alpha = leading ? 0.22 : 0.055;
  half.fills = [{
    type: 'GRADIENT_RADIAL',
    gradientTransform: [[1, 0, 0], [0, 1.6, -0.1]],
    gradientStops: [
      { position: 0, color: Object.assign(hexToRgb(tint), { a: alpha }) },
      { position: 1, color: Object.assign(hexToRgb(tint), { a: 0 }) },
    ],
  }];

  if (opts.head !== false) {
    const head = mkFrame('队头', 'HORIZONTAL', { gap: 8 });
    head.counterAxisAlignItems = 'CENTER';
    head.appendChild(mkTag(teamKey.toUpperCase(), 'brand'));
    const av = mkFrame('头像位', 'HORIZONTAL', { radius: 999 });
    av.resize(28, 28);
    av.primaryAxisSizingMode = 'FIXED';
    av.counterAxisSizingMode = 'FIXED';
    av.primaryAxisAlignItems = 'CENTER';
    av.counterAxisAlignItems = 'CENTER';
    av.fills = [solid(C.plate3)];
    av.appendChild(mkText('🏸', { size: 14, color: teamColor, lh: 1 }));
    head.appendChild(av);
    half.appendChild(head);
  }

  half.appendChild(mkText(name, {
    size: opts.nameSize || 17, weight: 700,
    color: leading ? C.fg : C.fg2, lh: 1.15,
  }));

  const num = mkText(String(score), {
    size: opts.scoreSize || 140,
    weight: opts.scoreWeight || 700,
    color: leading ? teamColor : C.fg,
    lh: 0.92,
  });
  if (!leading) num.opacity = 0.62;
  half.appendChild(num);

  if (opts.prog !== false) {
    const w = opts.progW || 150;
    const prog = mkFrame('进度线', 'HORIZONTAL', { radius: 999 });
    prog.resize(w, 3);
    prog.primaryAxisSizingMode = 'FIXED';
    prog.counterAxisSizingMode = 'FIXED';
    prog.primaryAxisAlignItems = 'MIN';
    prog.fills = [solid(C.fg, 0.14)];
    const pct = opts.progPct === undefined ? 0.71 : opts.progPct;
    const fill = rect('已得', Math.max(2, Math.round(w * pct)), 3, teamColor);
    prog.appendChild(fill);
    if (!leading) fill.opacity = 0.5;
    half.appendChild(prog);
  }

  if (opts.meta !== false) {
    const meta = mkFrame('队尾', 'HORIZONTAL', { gap: 8 });
    meta.counterAxisAlignItems = 'CENTER';
    const dot = figma.createEllipse();
    dot.name = '发球点';
    dot.resize(7, 7);
    if (teamKey === 'a') {
      dot.fills = [solid(teamColor)];
      dot.effects = [{
        type: 'DROP_SHADOW',
        color: Object.assign(hexToRgb(teamColor), { a: 0.35 }),
        offset: { x: 0, y: 0 }, radius: 0, spread: 3,
        visible: true, blendMode: 'NORMAL',
      }];
      meta.appendChild(dot);
      meta.appendChild(mkText(opts.metaLabel || '甲队', { size: 11, weight: 400, color: C.fg3, lh: 1 }));
    } else {
      meta.appendChild(mkText(opts.metaLabel || '乙队', { size: 11, weight: 400, color: C.fg3, lh: 1 }));
      dot.fills = [solid(C.fg, 0.2)];
      meta.appendChild(dot);
    }
    half.appendChild(meta);
  }
  return half;
}

/* 局分点：三局两胜，赢下的局亮队色。 */
function mkGameDots(games, color) {
  const g = mkFrame('局分', 'HORIZONTAL', { gap: 4 });
  for (let i = 0; i < 3; i++) {
    const d = figma.createRectangle();
    d.name = '局点';
    d.resize(9, 3);
    d.fills = [i < games ? solid(color) : solid(C.fg, 0.18)];
    g.appendChild(d);
  }
  return g;
}

/* 回合时间轴：柱高 = 该回合比分，颜色 = 谁得分，竖线 = 换边点。 */
function mkTimeline(rounds, switchAt, width) {
  const W = width || 326;
  const card = mkPanel('回合时间轴', { gap: 12 });
  card.appendChild(cardTitle('本局回合时间轴', rounds.length + ' 回合 · 最长连得 3'));

  const legend = mkFrame('图例', 'HORIZONTAL', { gap: 12 });
  legend.counterAxisAlignItems = 'CENTER';
  wantFillH(legend);
  [['a', '队伍 A', C.a], ['b', '队伍 B', C.b]].forEach(function (p) {
    const k = mkFrame('图例项', 'HORIZONTAL', { gap: 4 });
    k.counterAxisAlignItems = 'CENTER';
    k.appendChild(rect('色块', 10, 10, p[2]));
    k.appendChild(mkText(p[1], { size: 11, weight: 400, color: C.fg3, lh: 1 }));
    legend.appendChild(k);
  });
  legend.appendChild(spacer());
  legend.appendChild(mkText('每格 1 回合', { size: 11, weight: 400, color: C.fg3, lh: 1 }));
  card.appendChild(legend);

  const plot = mkFrame('柱区', 'HORIZONTAL', { gap: 3 });
  plot.counterAxisAlignItems = 'MAX';
  plot.primaryAxisSizingMode = 'FIXED';
  plot.counterAxisSizingMode = 'FIXED';
  plot.resize(W, 96);
  plot.primaryAxisSizingMode = 'FIXED';
  plot.counterAxisSizingMode = 'FIXED';
  rounds.forEach(function (r) {
    const bar = figma.createRectangle();
    bar.name = '回合 ' + r.i;
    bar.resize(9, r.h);
    bar.cornerRadius = 3;
    bar.fills = [solid(r.team === 'a' ? C.a : C.b)];
    if (r.last) {
      bar.effects = [{
        type: 'DROP_SHADOW',
        color: Object.assign(hexToRgb(r.team === 'a' ? C.a : C.b), { a: 0.45 }),
        offset: { x: 0, y: 0 }, radius: 12, spread: 0,
        visible: true, blendMode: 'NORMAL',
      }];
    }
    plot.appendChild(bar);
  });
  card.appendChild(plot);

  const axis = mkFrame('轴', 'HORIZONTAL', { pt: 4, pb: 4 });
  axis.primaryAxisSizingMode = 'FIXED';
  axis.counterAxisSizingMode = 'FIXED';
  axis.resize(W, 20);
  axis.primaryAxisSizingMode = 'FIXED';
  axis.counterAxisSizingMode = 'FIXED';
  axis.counterAxisAlignItems = 'CENTER';
  axis.appendChild(mkText('1', { size: 11, weight: 400, color: C.fg3, lh: 1 }));
  axis.appendChild(spacer());
  axis.appendChild(mkText(switchAt + ' 分换边', { size: 11, weight: 400, color: C.fg3, lh: 1 }));
  axis.appendChild(spacer());
  axis.appendChild(mkText(String(rounds.length), { size: 11, weight: 400, color: C.fg3, lh: 1 }));
  card.appendChild(axis);
  return card;
}

function sampleRounds() {
  const out = [];
  const seq = ['a', 'a', 'b', 'a', 'b', 'b', 'a', 'a', 'a', 'b', 'a', 'b', 'a',
    'a', 'b', 'a', 'a', 'b', 'b', 'a', 'a', 'b', 'a', 'a', 'b'];
  let sa = 0, sb = 0;
  seq.forEach(function (t, i) {
    if (t === 'a') sa++; else sb++;
    const v = t === 'a' ? sa : sb;
    out.push({ i: i + 1, team: t, h: Math.max(10, Math.round(v * 4.6)), last: i === seq.length - 1 });
  });
  return out;
}

/* 底部 Dock：全应用唯一允许占这么大面积的东西（一手汗一手拍）。 */
function mkDock() {
  const d = mkFrame('底部 Dock', 'HORIZONTAL', { gap: 8, pl: 8, pr: 8, pt: 8, pb: 8 });
  d.primaryAxisSizingMode = 'FIXED';
  d.counterAxisSizingMode = 'FIXED';
  d.resize(390, 104);
  d.primaryAxisSizingMode = 'FIXED';
  d.counterAxisSizingMode = 'FIXED';
  d.fills = [solid(C.plate)];
  d.effects = [lift(1)];
  [['a', '甲队得分'], ['b', '乙队得分']].forEach(function (p) {
    const c = p[0] === 'a' ? C.a : C.b;
    const b = mkFrame('计分键 / ' + p[1], 'VERTICAL', { gap: 2 });
    wantFillH(b);
    wantFillV(b);
    b.primaryAxisAlignItems = 'CENTER';
    b.counterAxisAlignItems = 'CENTER';
    b.fills = [{
      type: 'GRADIENT_RADIAL',
      gradientTransform: [[1, 0, 0], [0, 2, -0.2]],
      gradientStops: [
        { position: 0, color: Object.assign(hexToRgb(c), { a: 0.20 }) },
        { position: 1, color: Object.assign(hexToRgb(c), { a: 0.12 }) },
      ],
    }];
    b.strokes = [solid(c, 0.42)];
    b.strokeWeight = 1;
    b.strokeAlign = 'INSIDE';
    b.appendChild(mkText('+', { size: 19, weight: 400, color: c, lh: 1 }));
    b.appendChild(mkText(p[1], { size: 15, weight: 700, color: C.fg, lh: 1.15 }));
    d.appendChild(b);
  });
  return d;
}

function mkTabbar(activeIndex) {
  const items = [['记分', '✎'], ['对战', '⚔'], ['数据', '▥'], ['我的', '☺']];
  const t = mkFrame('底部 Tab Bar', 'HORIZONTAL');
  t.primaryAxisSizingMode = 'FIXED';
  t.counterAxisSizingMode = 'FIXED';
  t.resize(390, 62);
  t.primaryAxisSizingMode = 'FIXED';
  t.counterAxisSizingMode = 'FIXED';
  t.fills = [solid(C.plate)];
  t.effects = [lift(1)];
  items.forEach(function (it, i) {
    const on = i === activeIndex;
    const cell = mkFrame('Tab / ' + it[0], 'VERTICAL', { gap: 4, pt: 6, pb: 6 });
    wantFillH(cell);
    wantFillV(cell);
    cell.primaryAxisAlignItems = 'CENTER';
    cell.counterAxisAlignItems = 'CENTER';
    cell.fills = [];
    cell.appendChild(mkText(it[1], { size: 17, color: on ? C.fg : C.fg3, lh: 1 }));
    cell.appendChild(mkText(it[0], { size: 9.5, weight: on ? 700 : 500, ls: 0.06, color: on ? C.fg : C.fg3, lh: 1 }));
    t.appendChild(cell);
  });
  return t;
}

function mkAppbar(title, icons) {
  const b = mkFrame('顶栏', 'HORIZONTAL', { gap: 12, pl: 16, pr: 16 });
  b.primaryAxisSizingMode = 'FIXED';
  b.counterAxisSizingMode = 'FIXED';
  b.resize(390, 50);
  b.primaryAxisSizingMode = 'FIXED';
  b.counterAxisSizingMode = 'FIXED';
  b.counterAxisAlignItems = 'CENTER';
  b.fills = [solid(C.plate)];
  b.effects = [lift(1)];
  b.appendChild(mkText(title, { size: 17, weight: 700, color: C.fg, lh: 1 }));
  b.appendChild(spacer());
  (icons || ['◉', '▥', '↥']).forEach(function (g) {
    b.appendChild(mkText(g, { size: 17, color: C.fg2, lh: 1 }));
  });
  return b;
}

/* 手机外壳：390×844，内容裁切。 */
function mkPhone(name) {
  const p = mkFrame(name, 'VERTICAL', {});
  p.resize(390, 844);
  p.primaryAxisSizingMode = 'FIXED';
  p.counterAxisSizingMode = 'FIXED';
  p.clipsContent = true;
  p.fills = [solid(C.void)];
  return p;
}

function mkScroll(name, gap) {
  const s = mkFrame(name, 'VERTICAL', { gap: gap === undefined ? 16 : gap, pl: 16, pr: 16, pt: 16, pb: 16 });
  wantFillH(s);
  wantFillV(s);
  s.clipsContent = true;
  s.fills = [];
  return s;
}

/* 比分板：两半场 + 状态条。记分页与场边共用这套语言。 */
function scoreboardBlock(sa, sb, gameLabel, gamesA, gamesB, leading) {
  const wrap = mkFrame('比分板', 'VERTICAL', {});
  wantFillH(wrap);
  wrap.clipsContent = true;
  wrap.fills = [solid(C.board)];
  const grid = mkFrame('两半场', 'HORIZONTAL', {});
  grid.primaryAxisSizingMode = 'FIXED';
  grid.counterAxisSizingMode = 'FIXED';
  grid.resize(390, 396);
  grid.primaryAxisSizingMode = 'FIXED';
  grid.counterAxisSizingMode = 'FIXED';
  grid.appendChild(mkHalfCourt('a', C.a, '队伍 A', sa, leading === 'a', { progPct: 0.71, progW: 130, scoreSize: 128, padTop: 22 }));
  grid.appendChild(mkHalfCourt('b', C.b, '队伍 B', sb, leading === 'b', { progPct: 0.48, progW: 130, scoreSize: 128, padTop: 22 }));
  wrap.appendChild(grid);

  const bar = mkFrame('状态条', 'VERTICAL', { gap: 12, pl: 16, pr: 16, pt: 12, pb: 12 });
  wantFillH(bar);
  bar.fills = [solid(C.plate)];
  bar.effects = [lift(1)];

  const top = mkFrame('局分行', 'HORIZONTAL', { gap: 12 });
  wantFillH(top);
  top.counterAxisAlignItems = 'CENTER';
  const gw = mkFrame('局分', 'HORIZONTAL', { gap: 8 });
  gw.counterAxisAlignItems = 'CENTER';
  gw.appendChild(mkGameDots(gamesA, C.a));
  gw.appendChild(mkGameDots(gamesB, C.b));
  gw.appendChild(mkLabel('局分', C.fg3));
  top.appendChild(gw);
  top.appendChild(spacer());
  top.appendChild(mkText(gameLabel, { size: 13.5, weight: 700, color: C.fg, lh: 1 }));
  bar.appendChild(top);

  const bot = mkFrame('计时行', 'HORIZONTAL', { gap: 12 });
  wantFillH(bot);
  bot.counterAxisAlignItems = 'CENTER';
  bot.appendChild(mkText('00:01', { size: 19, weight: 700, color: C.fg, lh: 1 }));
  bot.appendChild(spacer());
  bot.appendChild(mkBtn('暂停', 'outline', { size: 11 }));
  bot.appendChild(mkBtn('↶', 'ghost', { icon: true }));
  bar.appendChild(bot);
  wrap.appendChild(bar);
  return wrap;
}

/* ---------------- 4 · 页面骨架 ---------------- */

async function ensurePage(name) {
  let page = figma.root.children.find(function (p) { return p.name === name; });
  if (!page) page = figma.createPage();
  page.name = name;
  await figma.setCurrentPageAsync(page);
  if (typeof page.loadAsync === 'function') await page.loadAsync();
  return page;
}

function clearPage(page) {
  page.children.slice().forEach(function (k) { k.remove(); });
}

const PAGE_NAMES = ['封面 Cover', '基础 Foundations', '组件 Components', '界面 Screens', '场边与分享'];

/* 重跑前先把 5 个目标页清空，并删掉 Figma 新建文件自带的空页。

   顺序很重要：必须在建变量之前清页面。
   否则旧节点还引用着旧变量，collection.remove() 会被拒绝（有绑定），
   于是变量越堆越多、旧节点留着悬空引用。 */
async function preparePages() {
  for (const name of PAGE_NAMES) {
    const page = figma.root.children.find(function (p) { return p.name === name; });
    if (page) {
      await figma.setCurrentPageAsync(page);
      clearPage(page);
    }
  }

  /* 删掉「不是我们的、而且确实空的」页（典型情况：新建文件自带的 Page 1）。

     ⚠️ 必须先 setCurrentPageAsync 再读 children。
     Figma 是「按需加载页」的：非当前页的 page.children 恒为空数组。
     若先读后切，每个非当前页都会被误判成空页 —— 包括用户自己的草稿页。
     这不是理论风险，是会真的删掉用户内容的 bug。 */
  const others = figma.root.children.filter(function (p) {
    return PAGE_NAMES.indexOf(p.name) === -1;
  });
  for (const page of others) {
    await figma.setCurrentPageAsync(page);
    /* manifest 声明 documentAccess: "dynamic-page" 时，切页不保证内容已就绪，
       显式 loadAsync 一次再读 children —— 判定「这页到底空不空」必须绝对可靠。 */
    if (typeof page.loadAsync === 'function') await page.loadAsync();
    if (page.children.length !== 0) continue;      /* 有内容 → 绝不碰 */
    if (figma.root.children.length <= 1) continue; /* Figma 不允许删掉最后一页 */
    try { page.remove(); } catch (e) { /* 仍被占用则保留 */ }
  }
}

function sectionHead(title, sub, width) {
  const wrap = mkFrame('分区 / ' + title, 'VERTICAL', { gap: 6 });
  wrap.appendChild(mkText(title, { size: 26, weight: 700, color: C.fg, lh: 1.15 }));
  if (sub) wrap.appendChild(mkText(sub, { size: 13.5, weight: 400, color: C.fg3, lh: 1.6, w: width || 760 }));
  return wrap;
}

function caption(text, sub, w) {
  const wrap = mkFrame('说明 / ' + text, 'VERTICAL', { gap: 6 });
  wrap.appendChild(mkText(text, { size: 17, weight: 700, color: C.fg, lh: 1.2 }));
  if (sub) wrap.appendChild(mkText(sub, { size: 11, weight: 400, color: C.fg3, lh: 1.6, w: w || 360 }));
  return wrap;
}

/* ---------------- 5 · 封面 ---------------- */

async function buildCover() {
  const page = await ensurePage('封面 Cover');
  clearPage(page);
  const root = mkFrame('封面', 'VERTICAL', { gap: 32, pl: 80, pr: 80, pt: 80, pb: 80 });
  root.fills = [solid(C.void)];
  root.resize(1000, 100);
  root.counterAxisSizingMode = 'FIXED';

  root.appendChild(mkText('Redesign · v4 · 2026', { size: 11, weight: 700, ls: 0.20, color: C.fg3, upper: true, lh: 1.2 }));
  root.appendChild(mkText('夜场', { size: 96, weight: 700, color: C.fg, lh: 0.98 }));
  root.appendChild(mkText('NIGHT COURT', { size: 26, weight: 700, ls: 0.20, color: C.fg3, lh: 1.2 }));

  root.appendChild(mkText(
    '把这块记分板当成一件球场器械重做。删掉所有 1px 灰边、切角、扫描线和「转播车」装饰，' +
    '改用顶光做层次、用一条时间轴讲一场球、用两米外能读的数字做主角。' +
    '深色不是风格选择，是球馆的默认光线。',
    { size: 15, weight: 400, color: C.fg2, lh: 1.6, w: 620 }
  ));

  const rules = [
    ['01', '光不是边框', '层次来自顶光与投影，不来自 1px 灰边。'],
    ['02', '一个主角', '比分是唯一的巨型元素，标签一律 ≤11px 且加宽字距。'],
    ['03', '两条线定义一场球', '中线是网、外沿是边线；队色只出现在线、数字、光池里。'],
    ['04', '一场比赛有一条形状', '得分流水升级为回合时间轴，一屏读出势头。'],
    ['05', '动效只服务得分', '其余 ≤120ms 或不做。'],
  ];
  const ruleWrap = mkFrame('五条铁律', 'VERTICAL', { gap: 12 });
  wantFillH(ruleWrap);
  rules.forEach(function (r) {
    const row = mkFrame('铁律 ' + r[0], 'HORIZONTAL', { gap: 20, pl: 20, pr: 20, pt: 16, pb: 16 });
    wantFillH(row);
    row.counterAxisAlignItems = 'MIN';
    row.fills = [FACE_1()];
    row.effects = [lift(1), plateShadow()];
    const idx = mkText(r[0], { size: 19, weight: 700, color: C.fg3, lh: 1 });
    idx.resize(56, idx.height);
    idx.textAutoResize = 'HEIGHT';
    row.appendChild(idx);
    const body = mkFrame('内容', 'VERTICAL', { gap: 4 });
    wantFillH(body);
    body.appendChild(mkText(r[1], { size: 17, weight: 700, color: C.fg, lh: 1.15 }));
    body.appendChild(mkText(r[2], { size: 13.5, weight: 400, color: C.fg3, lh: 1.6 }));
    row.appendChild(body);
    ruleWrap.appendChild(row);
  });
  root.appendChild(ruleWrap);

  const meta = mkFrame('元信息', 'HORIZONTAL', { gap: 8 });
  meta.layoutWrap = 'WRAP';
  meta.layoutSizingHorizontal = 'FIXED';
  meta.resize(840, 40);
  meta.primaryAxisSizingMode = 'FIXED';
  meta.counterAxisSizingMode = 'FIXED';
  ['390 × 844 主形态', '844 × 390 场边形态', '1 档巨型 + 3 档小字', '唯二饱和色', 'WCAG AA', '零图片依赖']
    .forEach(function (m) { meta.appendChild(mkTag(m, 'brand')); });
  root.appendChild(meta);

  page.appendChild(root);
  root.x = 0;
  root.y = 0;
  finishPage(page);
  return { page: page.name, rootId: root.id };
}

/* ---------------- 8 · 界面 ---------------- */

/* 通用：一张手机屏 = 顶栏 + 可滚内容 + 可选 Dock + Tab Bar */
function phoneScreen(name, appbarTitle, opts) {
  opts = opts || {};
  const p = mkPhone(name);
  if (appbarTitle) p.appendChild(mkAppbar(appbarTitle, opts.icons));
  const c = mkScroll('内容', opts.gap === undefined ? 16 : opts.gap);
  c.paddingTop = 0;
  p.appendChild(c);
  return { phone: p, content: c };
}

function finishPhone(phone, content, tabIndex, withDock) {
  if (withDock) phone.appendChild(mkDock());
  if (tabIndex !== null && tabIndex !== undefined) phone.appendChild(mkTabbar(tabIndex));
  return phone;
}

async function buildScreens() {
  const page = await ensurePage('界面 Screens');
  clearPage(page);
  const screens = [];

  /* ---- 01 记分 ---- */
  {
    const s = phoneScreen('01 记分', '记分', { icons: ['◉', '▥', '↥'] });
    s.content.appendChild(scoreboardBlock(15, 10, '第 1 局', 0, 0, 'a'));
    s.content.appendChild(mkTimeline(sampleRounds(), 11, 326));
    const modes = mkPanel('快速切换赛制', { gap: 12 });
    modes.appendChild(cardTitle('快速切换赛制'));
    const mr = mkFrame('选择卡组', 'HORIZONTAL', { gap: 8 });
    wantFillH(mr);
    [['21 分', '标准单局', true, '◎'], ['15 分', '快速局', false, '⚡'],
     ['11 分', '短局', false, '▲'], ['自定义', '任意目标分', false, '✎']]
      .forEach(function (q) { mr.appendChild(mkPickCard(q[0], q[1], q[2], q[3])); });
    modes.appendChild(mr);
    s.content.appendChild(modes);
    screens.push(['01 · 记分', finishPhone(s.phone, s.content, 0, true),
      '主场形态：比分是唯一的主角，下面一条时间轴讲完整场球。']);
  }

  /* ---- 02 智能分组 ---- */
  {
    const s = phoneScreen('02 智能分组', '对战');
    s.content.appendChild(mkSegmented(['智能分组', '费用分摊'], 0));
    const head = mkFrame('面板头', 'VERTICAL', { gap: 2 });
    head.appendChild(mkText('智能分组', { size: 19, weight: 700, color: C.fg, lh: 1.15 }));
    head.appendChild(mkText('输入名单，一键生成对阵', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
    s.content.appendChild(head);

    const modeCard = mkPanel('分组方式', { gap: 12 });
    modeCard.appendChild(cardTitle('分组方式'));
    const mr = mkFrame('选择卡组', 'HORIZONTAL', { gap: 8 });
    wantFillH(mr);
    [['随机分组', '完全随机', true, '🎲'], ['实力平衡', '强弱搭配', false, '⚖'],
     ['轮换赛制', '公平轮休', false, '↻']]
      .forEach(function (q) { mr.appendChild(mkPickCard(q[0], q[1], q[2], q[3])); });
    modeCard.appendChild(mr);
    s.content.appendChild(modeCard);

    const listCard = mkPanel('参赛名单', { gap: 12 });
    listCard.appendChild(cardTitle('参赛名单', '8 人'));
    const ta = mkFrame('名单输入', 'VERTICAL', { gap: 0, pl: 12, pr: 12, pt: 12, pb: 12, radius: 3 });
    ta.primaryAxisSizingMode = 'FIXED';
    ta.counterAxisSizingMode = 'FIXED';
    ta.resize(326, 132);
    ta.primaryAxisSizingMode = 'FIXED';
    ta.counterAxisSizingMode = 'FIXED';
    ta.fills = [solid(C.void)];
    ta.effects = [sinkShadow()];
    ['张三', '李四', '王五', '赵六'].forEach(function (n) {
      ta.appendChild(mkText(n, { size: 13.5, weight: 400, color: C.fg, lh: 1.6 }));
    });
    listCard.appendChild(ta);
    listCard.appendChild(mkText('至少 4 人才能分组；实力平衡模式会读取下方实力等级。',
      { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
    const chips = mkFrame('快捷添加', 'HORIZONTAL', { gap: 8 });
    chips.layoutWrap = 'WRAP';
    chips.primaryAxisSizingMode = 'FIXED';
    chips.counterAxisSizingMode = 'FIXED';
    chips.resize(326, 96);
    chips.primaryAxisSizingMode = 'FIXED';
    chips.counterAxisSizingMode = 'FIXED';
    ['张三', '李四', '王五', '赵六'].forEach(function (n) { chips.appendChild(mkChip(n, false, true)); });
    listCard.appendChild(chips);
    s.content.appendChild(listCard);

    const acts = mkFrame('操作行', 'HORIZONTAL', { gap: 8 });
    wantFillH(acts);
    acts.appendChild(mkBtn('生成分组', 'primary', { size: 15, block: true }));
    acts.appendChild(mkBtn('清空', 'outline', { size: 15, block: true }));
    s.content.appendChild(acts);
    screens.push(['02 · 智能分组', finishPhone(s.phone, s.content, 1, false),
      '三种分组方式用选择卡，选中态是象牙白顶线。']);
  }

  /* ---- 03 费用分摊 ---- */
  {
    const s = phoneScreen('03 费用分摊', '对战');
    s.content.appendChild(mkSegmented(['智能分组', '费用分摊'], 1));
    const head = mkFrame('面板头', 'VERTICAL', { gap: 2 });
    head.appendChild(mkText('费用分摊', { size: 19, weight: 700, color: C.fg, lh: 1.15 }));
    head.appendChild(mkText('场地费、球费一键算清', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
    s.content.appendChild(head);

    const hero = mkPanel('结果', { gap: 4, p: 24, liftStrength: 2 });
    hero.appendChild(mkLabel('总金额', C.fg3));
    hero.appendChild(mkText('¥120.00', { size: 40, weight: 700, color: C.fg, lh: 1.05 }));
    hero.appendChild(mkText('8 人 · 平均每人 ¥15.00', { size: 13.5, weight: 400, color: C.fg2, lh: 1.4 }));
    s.content.appendChild(hero);

    const card = mkPanel('分摊明细', { gap: 8 });
    card.appendChild(cardTitle('分摊明细', '平均分摊'));
    [['张三', '¥15.00'], ['李四', '¥15.00'], ['王五', '¥15.00'], ['赵六', '¥15.00']]
      .forEach(function (r) {
        const row = mkFrame('明细行', 'HORIZONTAL', { gap: 12, pt: 8, pb: 8 });
        wantFillH(row);
        row.counterAxisAlignItems = 'CENTER';
        const nm = mkText(r[0], { size: 13.5, weight: 600, color: C.fg, lh: 1.4 });
        wantFillH(nm);
        row.appendChild(nm);
        row.appendChild(mkText(r[1], { size: 13.5, weight: 700, color: C.fg, lh: 1 }));
        card.appendChild(row);
      });
    const cb = mkFrame('复制行', 'HORIZONTAL', { pt: 8 });
    wantFillH(cb);
    cb.appendChild(mkBtn('复制结果', 'outline', { size: 11, block: true }));
    card.appendChild(cb);
    s.content.appendChild(card);
    screens.push(['03 · 费用分摊', finishPhone(s.phone, s.content, 1, false),
      '金额用「总金额 → 明细」两级，最大的一处读数就是结论。']);
  }

  /* ---- 04 比赛历史 ---- */
  {
    const s = phoneScreen('04 比赛历史', '数据');
    s.content.appendChild(mkSegmented(['历史', '排行榜', '能力', '成就'], 0));
    const sg = mkFrame('统计网格', 'HORIZONTAL', { gap: 8 });
    sg.layoutWrap = 'WRAP';
    wantFillH(sg);
    [['12', '总场次'], ['7', '胜场'], ['5', '负场'], ['58%', '胜率'], ['4h 20m', '总时长']]
      .forEach(function (x) { sg.appendChild(mkStatCard(x[0], x[1])); });
    s.content.appendChild(sg);

    const hist = mkFrame('历史列表', 'VERTICAL', { gap: 8 });
    wantFillH(hist);
    [['李大力 / 王小明', '21-15 · 21-18', '2-0', 'win'],
     ['张三 / 李四', '18-21 · 21-19 · 19-21', '1-2', 'lose'],
     ['赵六 / 孙七', '21-12 · 21-9', '2-0', 'win']].forEach(function (m) {
      const item = mkFrame('历史项', 'VERTICAL', { gap: 8, pl: 16, pr: 16, pt: 12, pb: 12, radius: 0 });
      wantFillH(item);
      item.fills = [FACE_1()];
      item.effects = [lift(1), plateShadow()];
      const r1 = mkFrame('第一行', 'HORIZONTAL', { gap: 8 });
      wantFillH(r1);
      r1.counterAxisAlignItems = 'CENTER';
      const nm = mkText(m[0], { size: 13.5, weight: 700, color: C.fg, lh: 1.4 });
      wantFillH(nm);
      r1.appendChild(nm);
      r1.appendChild(mkTag(m[2], m[3]));
      item.appendChild(r1);
      const r2 = mkFrame('第二行', 'HORIZONTAL', { gap: 8 });
      wantFillH(r2);
      const sc = mkText(m[1], { size: 11, weight: 400, color: C.fg3, lh: 1.4 });
      wantFillH(sc);
      r2.appendChild(sc);
      r2.appendChild(mkText('32 分钟', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
      item.appendChild(r2);
      hist.appendChild(item);
    });
    s.content.appendChild(hist);

    s.content.appendChild(mkSectionTitle('数据图表'));
    ['每月比赛场数', '胜负分布', '累计胜率趋势'].forEach(function (t, gi) {
      const ch = mkPanel('图表卡 / ' + t, { gap: 8 });
      const tr = mkFrame('图表标题', 'HORIZONTAL', { gap: 8 });
      tr.counterAxisAlignItems = 'CENTER';
      tr.appendChild(mkText('▥', { size: 17, color: C.fg2, lh: 1 }));
      tr.appendChild(mkText(t, { size: 13.5, weight: 600, color: C.fg, lh: 1.4 }));
      ch.appendChild(tr);
      const box = mkFrame('图区', 'HORIZONTAL', { gap: 8 });
      box.primaryAxisSizingMode = 'FIXED';
      box.counterAxisSizingMode = 'FIXED';
      box.resize(326, 120);
      box.primaryAxisSizingMode = 'FIXED';
      box.counterAxisSizingMode = 'FIXED';
      box.primaryAxisAlignItems = 'CENTER';
      box.counterAxisAlignItems = 'MAX';
      box.fills = [];
      [0.35, 0.62, 0.45, 0.8, 0.55, 1, 0.7].forEach(function (v, i) {
        const bar = figma.createRectangle();
        bar.name = '柱 ' + (i + 1);
        bar.resize(26, Math.max(6, Math.round(96 * v)));
        bar.fills = [solid(gi === 1 ? C.b : C.a, 0.45 + v * 0.5)];
        box.appendChild(bar);
      });
      ch.appendChild(box);
      s.content.appendChild(ch);
    });
    screens.push(['04 · 比赛历史', finishPhone(s.phone, s.content, 2, false),
      '胜 / 负用状态色标签，不用彩色卡片 —— 列表要能一眼扫过。']);
  }

  /* ---- 05 排行榜 ---- */
  {
    const s = phoneScreen('05 排行榜', '数据');
    s.content.appendChild(mkSegmented(['历史', '排行榜', '能力', '成就'], 1));
    s.content.appendChild(mkSegmented(['胜场', '场次', '胜率', '时长'], 0));

    const podium = mkFrame('领奖台', 'HORIZONTAL', { gap: 8 });
    podium.primaryAxisSizingMode = 'FIXED';
    podium.counterAxisSizingMode = 'FIXED';
    podium.resize(326, 208);
    podium.primaryAxisSizingMode = 'FIXED';
    podium.counterAxisSizingMode = 'FIXED';
    podium.primaryAxisAlignItems = 'CENTER';
    podium.counterAxisAlignItems = 'MAX';
    [[2, '李四', 9, 118], [1, '李大力', 12, 150], [3, '王五', 7, 98]].forEach(function (o) {
      const col = mkFrame('名次 ' + o[0], 'VERTICAL', { gap: 6 });
      wantFillH(col);
      wantFillV(col);
      col.primaryAxisAlignItems = 'MAX';
      col.counterAxisAlignItems = 'CENTER';
      col.fills = [];
      col.appendChild(mkText('🏸', { size: 26, color: o[0] === 1 ? C.gold : C.fg3, lh: 1 }));
      col.appendChild(mkText(o[1], { size: 13.5, weight: 700, color: C.fg, lh: 1.2 }));
      const bar = mkFrame('台 ' + o[0], 'VERTICAL', { gap: 2, pt: 12, pb: 12 });
      bar.primaryAxisSizingMode = 'FIXED';
      bar.counterAxisSizingMode = 'FIXED';
      bar.resize(100, o[3]);
      bar.primaryAxisSizingMode = 'FIXED';
      bar.counterAxisSizingMode = 'FIXED';
      bar.primaryAxisAlignItems = 'MIN';
      bar.counterAxisAlignItems = 'CENTER';
      bar.fills = [FACE_2()];
      bar.effects = [lift(o[0] === 1 ? 2 : 1)];
      if (o[0] === 1) {
        bar.strokes = [solid(C.gold, 0.5)];
        bar.strokeWeight = 1;
        bar.strokeAlign = 'INSIDE';
      }
      bar.appendChild(mkText(String(o[0]), { size: 19, weight: 700, color: o[0] === 1 ? C.gold : C.fg3, lh: 1 }));
      bar.appendChild(mkText(o[2] + ' 胜', { size: 11, weight: 400, color: C.fg3, lh: 1 }));
      col.appendChild(bar);
      podium.appendChild(col);
    });
    s.content.appendChild(podium);

    s.content.appendChild(mkSectionTitle('4 名以后'));
    const rest = mkFrame('其余名次', 'VERTICAL', { gap: 8 });
    wantFillH(rest);
    [['赵六', '6 场 · 胜率 50%'], ['孙七', '5 场 · 胜率 40%'], ['周八', '4 场 · 胜率 25%']]
      .forEach(function (r) { rest.appendChild(mkListItem(r[0], r[1], null, '🏸')); });
    s.content.appendChild(rest);
    screens.push(['05 · 排行榜', finishPhone(s.phone, s.content, 2, false),
      '金色只给第一名。第三名以下退成中性 —— 奖牌色是稀缺资源。']);
  }

  /* ---- 06 能力分析 ---- */
  {
    const s = phoneScreen('06 能力分析', '数据');
    s.content.appendChild(mkSegmented(['历史', '排行榜', '能力', '成就'], 2));

    const sel = mkPanel('选择选手', { gap: 8 });
    sel.appendChild(mkLabel('选择选手', C.fg3));
    const box = mkFrame('下拉', 'HORIZONTAL', { gap: 8, pl: 12, pr: 12, pt: 12, pb: 12, radius: 3 });
    box.primaryAxisSizingMode = 'FIXED';
    box.counterAxisSizingMode = 'FIXED';
    box.resize(326, 44);
    box.primaryAxisSizingMode = 'FIXED';
    box.counterAxisSizingMode = 'FIXED';
    box.counterAxisAlignItems = 'CENTER';
    box.fills = [solid(C.void)];
    box.effects = [sinkShadow()];
    const nm = mkText('李大力', { size: 13.5, weight: 400, color: C.fg, lh: 1 });
    wantFillH(nm);
    box.appendChild(nm);
    box.appendChild(mkText('⌄', { size: 13.5, color: C.fg2, lh: 1 }));
    sel.appendChild(box);
    s.content.appendChild(sel);

    const ab = mkFrame('能力头', 'HORIZONTAL', { gap: 12 });
    ab.counterAxisAlignItems = 'CENTER';
    const av = mkFrame('头像位', 'HORIZONTAL', { radius: 999 });
    av.primaryAxisSizingMode = 'FIXED';
    av.counterAxisSizingMode = 'FIXED';
    av.resize(44, 44);
    av.primaryAxisSizingMode = 'FIXED';
    av.counterAxisSizingMode = 'FIXED';
    av.primaryAxisAlignItems = 'CENTER';
    av.counterAxisAlignItems = 'CENTER';
    av.fills = [FACE_2()];
    av.appendChild(mkText('🏸', { size: 19, color: C.a, lh: 1 }));
    ab.appendChild(av);
    const ai = mkFrame('名字', 'VERTICAL', { gap: 2 });
    ai.appendChild(mkText('李大力', { size: 19, weight: 700, color: C.fg, lh: 1.15 }));
    ai.appendChild(mkText('能力分析报告', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
    ab.appendChild(ai);
    s.content.appendChild(ab);

    const tags = mkFrame('能力标签', 'HORIZONTAL', { gap: 8 });
    tags.layoutWrap = 'WRAP';
    tags.primaryAxisSizingMode = 'FIXED';
    tags.counterAxisSizingMode = 'FIXED';
    tags.resize(326, 72);
    tags.primaryAxisSizingMode = 'FIXED';
    tags.counterAxisSizingMode = 'FIXED';
    ['进攻型', '擅长双打', '稳定', '21 分制', 'AA 制'].forEach(function (t, i) {
      tags.appendChild(mkTag(t, i < 3 ? 'gold' : 'brand'));
    });
    s.content.appendChild(tags);

    s.content.appendChild(mkSectionTitle('核心数据'));
    const g = mkFrame('核心网格', 'HORIZONTAL', { gap: 8 });
    g.layoutWrap = 'WRAP';
    wantFillH(g);
    [['12', '总场次'], ['7', '胜场'], ['58%', '胜率'], ['21', '最高分'], ['3', '连续胜场'], ['4h', '总时长']]
      .forEach(function (x) { g.appendChild(mkStatCard(x[0], x[1])); });
    s.content.appendChild(g);
    screens.push(['06 · 能力分析', finishPhone(s.phone, s.content, 2, false),
      '高光标签走金色，事实标签走中性 —— 一处颜色一个意思。']);
  }

  /* ---- 07 成就 ---- */
  {
    const s = phoneScreen('07 成就', '数据');
    s.content.appendChild(mkSegmented(['历史', '排行榜', '能力', '成就'], 3));

    const prog = mkFrame('成就进度', 'HORIZONTAL', { gap: 16, pl: 16, pr: 16, pt: 16, pb: 16 });
    wantFillH(prog);
    prog.counterAxisAlignItems = 'CENTER';
    prog.fills = [FACE_1()];
    prog.effects = [lift(1), plateShadow()];
    const ring = mkFrame('进度环', 'VERTICAL');
    ring.primaryAxisSizingMode = 'FIXED';
    ring.counterAxisSizingMode = 'FIXED';
    ring.resize(76, 76);
    ring.primaryAxisSizingMode = 'FIXED';
    ring.counterAxisSizingMode = 'FIXED';
    ring.primaryAxisAlignItems = 'CENTER';
    ring.counterAxisAlignItems = 'CENTER';
    ring.fills = [];
    const circle = figma.createEllipse();
    circle.name = '环底';
    circle.resize(72, 72);
    circle.fills = [];
    circle.strokes = [solid(C.fg, 0.14)];
    circle.strokeWeight = 7;
    ring.appendChild(circle);
    ring.appendChild(mkText('42%', { size: 17, weight: 700, color: C.fg, lh: 1 }));
    prog.appendChild(ring);
    const ptxt = mkFrame('说明', 'VERTICAL', { gap: 4 });
    wantFillH(ptxt);
    ptxt.appendChild(mkText('5 / 12 已解锁', { size: 17, weight: 700, color: C.fg, lh: 1.15 }));
    ptxt.appendChild(mkText('完成比赛会自动累计进度，达成条件即解锁。', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
    prog.appendChild(ptxt);
    s.content.appendChild(prog);

    const grid = mkFrame('成就网格', 'HORIZONTAL', { gap: 8 });
    grid.layoutWrap = 'WRAP';
    wantFillH(grid);
    const achv = [
      ['首胜', '赢下第一场比赛', true], ['十场', '完成 10 场比赛', true],
      ['逆转', '落后 5 分后翻盘', true], ['零封', '让对手一局不过 10 分', true],
      ['加分赛', '打到 20 平后取胜', true], ['常客', '一个月打满 8 场', false],
      ['全勤', '连续 4 周都有比赛', false], ['全能', '三种赛制都打过', false],
    ];
    achv.forEach(function (a) {
      const card = mkFrame('成就 / ' + a[0], 'VERTICAL', { gap: 6, pl: 12, pr: 12, pt: 12, pb: 12, radius: 0 });
      card.primaryAxisSizingMode = 'FIXED';
      card.counterAxisSizingMode = 'FIXED';
      card.resize(155, 104);
      card.primaryAxisSizingMode = 'FIXED';
      card.counterAxisSizingMode = 'FIXED';
      card.fills = [a[2] ? FACE_2() : FACE_1()];
      card.effects = [lift(a[2] ? 2 : 1)];
      if (a[2]) {
        card.strokes = [solid(C.gold, 0.4)];
        card.strokeWeight = 1;
        card.strokeAlign = 'INSIDE';
      }
      const icon = mkText(a[2] ? '★' : '☆', { size: 19, color: a[2] ? C.gold : C.fg3, lh: 1 });
      if (!a[2]) icon.opacity = 0.5;
      card.appendChild(icon);
      card.appendChild(mkText(a[0], { size: 13.5, weight: 700, color: a[2] ? C.fg : C.fg2, lh: 1.2 }));
      card.appendChild(mkText(a[1], { size: 9.5, weight: 400, color: C.fg3, lh: 1.4 }));
      grid.appendChild(card);
    });
    s.content.appendChild(grid);
    screens.push(['07 · 成就', finishPhone(s.phone, s.content, 2, false),
      '已解锁用金色描边 + 实心星，未解锁退成中性 —— 不用灰度蒙版，蒙版会让文字不可读。']);
  }

  /* ---- 08 我的 ---- */
  {
    const s = phoneScreen('08 我的', '我的');
    const me = mkFrame('我的头', 'HORIZONTAL', { gap: 12 });
    me.counterAxisAlignItems = 'CENTER';
    const av = mkFrame('头像位', 'HORIZONTAL', { radius: 999 });
    av.primaryAxisSizingMode = 'FIXED';
    av.counterAxisSizingMode = 'FIXED';
    av.resize(52, 52);
    av.primaryAxisSizingMode = 'FIXED';
    av.counterAxisSizingMode = 'FIXED';
    av.primaryAxisAlignItems = 'CENTER';
    av.counterAxisAlignItems = 'CENTER';
    av.fills = [FACE_2()];
    av.effects = [lift(2)];
    av.appendChild(mkText('🏸', { size: 26, color: C.fg, lh: 1 }));
    me.appendChild(av);
    const mi = mkFrame('名字', 'VERTICAL', { gap: 2 });
    mi.appendChild(mkText('本机球员', { size: 19, weight: 700, color: C.fg, lh: 1.15 }));
    mi.appendChild(mkText('localStorage（本机）', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
    me.appendChild(mi);
    s.content.appendChild(me);

    const acc = mkFrame('账号卡', 'HORIZONTAL', { gap: 12, pl: 16, pr: 16, pt: 12, pb: 12, radius: 0 });
    wantFillH(acc);
    acc.counterAxisAlignItems = 'CENTER';
    acc.fills = [FACE_1()];
    acc.effects = [lift(1)];
    const dot = figma.createEllipse();
    dot.name = '状态点';
    dot.resize(8, 8);
    dot.fills = [solid(C.fg3)];
    acc.appendChild(dot);
    const at = mkFrame('账号文字', 'VERTICAL', { gap: 2 });
    wantFillH(at);
    at.appendChild(mkText('未登录', { size: 13.5, weight: 600, color: C.fg, lh: 1.4 }));
    at.appendChild(mkText('登录后可在多设备同步战绩', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
    acc.appendChild(at);
    acc.appendChild(mkBtn('登录', 'outline', { size: 11 }));
    s.content.appendChild(acc);

    s.content.appendChild(mkSectionTitle('功能入口'));
    const nav = mkFrame('入口列表', 'VERTICAL', { gap: 8 });
    wantFillH(nav);
    [['比赛设置', '目标分数、加分赛、换边提醒', '⚙'], ['绑定头像', '给常用球员配一个头像', '☺'],
     ['数据备份', '导出 / 导入 JSON', '⇅'], ['关于', '版本、存储、反馈', 'ⓘ']]
      .forEach(function (r) { nav.appendChild(mkListItem(r[0], r[1], '›', r[2])); });
    s.content.appendChild(nav);

    s.content.appendChild(mkSectionTitle('数据概览'));
    const bs = mkFrame('备份统计', 'HORIZONTAL', { gap: 8 });
    wantFillH(bs);
    bs.appendChild(mkStatCard('12', '比赛'));
    bs.appendChild(mkStatCard('5', '成就'));
    bs.appendChild(mkStatCard('4.2 KB', '占用'));
    s.content.appendChild(bs);
    s.content.appendChild(mkText('所有数据仅保存在本机浏览器，不会上传服务器。',
      { size: 11, weight: 400, color: C.fg3, lh: 1.6, w: 326 }));
    screens.push(['08 · 我的', finishPhone(s.phone, s.content, 3, false),
      '入口是列表，不是宫格 —— 一行说清「点了会发生什么」。']);
  }

  /* ---- 09 比赛设置 ---- */
  {
    const s = phoneScreen('09 比赛设置', '比赛设置');
    s.content.appendChild(mkSectionTitle('比赛规则'));
    const card = mkPanel('目标分数', { gap: 12 });
    card.appendChild(cardTitle('目标分数'));
    const pg = mkFrame('选择卡组', 'HORIZONTAL', { gap: 8 });
    wantFillH(pg);
    [['21 分', true], ['15 分', false], ['11 分', false], ['自定义', false]]
      .forEach(function (q) { pg.appendChild(mkPickCard(q[0], null, q[1], null)); });
    card.appendChild(pg);
    s.content.appendChild(card);

    const sw = mkPanel('开关组', { gap: 0 });
    sw.appendChild(switchRow('三局两胜', '先赢 2 局者获胜', true));
    sw.appendChild(switchRow('加分赛', '平分后需领先 2 分，30 分封顶', true));
    sw.appendChild(switchRow('换边提醒', '达到换边分时弹出提示', true));
    s.content.appendChild(sw);

    s.content.appendChild(mkSectionTitle('反馈'));
    const fb = mkPanel('反馈组', { gap: 0 });
    fb.appendChild(switchRow('音效', '加分、局末播放提示音', true));
    fb.appendChild(switchRow('震动', '支持震动的设备上生效', false));
    s.content.appendChild(fb);
    screens.push(['09 · 比赛设置', finishPhone(s.phone, s.content, 3, false),
      '开关打开是绿色，不是队色 —— 队色只标识「哪一队」。']);
  }

  /* ---- 10 绑定头像 ---- */
  {
    const s = phoneScreen('10 绑定头像', '绑定头像');
    const card = mkPanel('绑定', { gap: 16 });
    card.appendChild(cardTitle('绑定头像'));
    card.appendChild(mkLabel('球员名字', C.fg3));
    const inp = mkFrame('输入框', 'HORIZONTAL', { pl: 12, pr: 12, pt: 12, pb: 12, radius: 3 });
    inp.primaryAxisSizingMode = 'FIXED';
    inp.counterAxisSizingMode = 'FIXED';
    inp.resize(326, 44);
    inp.primaryAxisSizingMode = 'FIXED';
    inp.counterAxisSizingMode = 'FIXED';
    inp.counterAxisAlignItems = 'CENTER';
    inp.fills = [solid(C.void)];
    inp.effects = [sinkShadow()];
    inp.appendChild(mkText('输入与比赛记录一致的名字', { size: 13.5, weight: 400, color: C.fg3, lh: 1 }));
    card.appendChild(inp);
    card.appendChild(mkLabel('选择头像', C.fg3));
    const ag = mkFrame('头像网格', 'HORIZONTAL', { gap: 8 });
    ag.layoutWrap = 'WRAP';
    wantFillH(ag);
    ['🏸', '🔥', '⚡', '🐉', '🦅', '🐯', '🎯', '🚀', '⭐', '🐺', '🌊', '🍀']
      .forEach(function (e, i) {
        const cell = mkFrame('头像 / ' + e, 'HORIZONTAL', { radius: 999 });
        cell.primaryAxisSizingMode = 'FIXED';
        cell.counterAxisSizingMode = 'FIXED';
        cell.resize(52, 52);
        cell.primaryAxisSizingMode = 'FIXED';
        cell.counterAxisSizingMode = 'FIXED';
        cell.primaryAxisAlignItems = 'CENTER';
        cell.counterAxisAlignItems = 'CENTER';
        cell.fills = [i === 0 ? FACE_3() : FACE_1()];
        cell.effects = [lift(i === 0 ? 2 : 1)];
        if (i === 0) {
          cell.strokes = [solid(C.fg, 0.38)];
          cell.strokeWeight = 1;
          cell.strokeAlign = 'INSIDE';
        }
        cell.appendChild(mkText(e, { size: 22, color: C.fg, lh: 1 }));
        ag.appendChild(cell);
      });
    card.appendChild(ag);
    const save = mkFrame('保存行', 'HORIZONTAL');
    wantFillH(save);
    save.appendChild(mkBtn('保存绑定', 'primary', { size: 13.5, block: true }));
    card.appendChild(save);
    s.content.appendChild(card);

    s.content.appendChild(mkSectionTitle('已绑定'));
    const bound = mkFrame('已绑定列表', 'VERTICAL', { gap: 8 });
    wantFillH(bound);
    bound.appendChild(mkListItem('李大力', '已绑定头像 🏸', '›'));
    bound.appendChild(mkListItem('王小明', '已绑定头像 🐉', '›'));
    s.content.appendChild(bound);
    screens.push(['10 · 绑定头像', finishPhone(s.phone, s.content, 3, false),
      '选中头像用更亮的面 + 发丝环，不用彩色描边。']);
  }

  /* ---- 11 数据备份 ---- */
  {
    const s = phoneScreen('11 数据备份', '数据备份');
    const bs = mkFrame('备份统计', 'HORIZONTAL', { gap: 8 });
    wantFillH(bs);
    bs.appendChild(mkStatCard('12', '比赛'));
    bs.appendChild(mkStatCard('8', '分组'));
    bs.appendChild(mkStatCard('4.2 KB', '占用'));
    s.content.appendChild(bs);

    const card = mkPanel('备份与恢复', { gap: 12 });
    card.appendChild(cardTitle('备份与恢复'));
    card.appendChild(mkText('导出的 JSON 包含全部 10 项本地数据，可在同浏览器导入恢复。',
      { size: 13.5, weight: 400, color: C.fg3, lh: 1.6 }));
    const r1 = mkFrame('操作行', 'HORIZONTAL', { gap: 8 });
    wantFillH(r1);
    r1.appendChild(mkBtn('导出备份', 'primary', { block: true }));
    r1.appendChild(mkBtn('导入备份', 'outline', { block: true }));
    card.appendChild(r1);
    const r2 = mkFrame('危险行', 'HORIZONTAL', { pt: 8 });
    wantFillH(r2);
    r2.appendChild(mkBtn('清空所有数据', 'danger', { block: true }));
    card.appendChild(r2);
    s.content.appendChild(card);
    s.content.appendChild(mkText('提示：清空后无法恢复，建议先导出备份。',
      { size: 11, weight: 400, color: C.fg3, lh: 1.6, w: 326 }));
    screens.push(['11 · 数据备份', finishPhone(s.phone, s.content, 3, false),
      '危险操作单独一行、用深墨字压红底（白字只有 3.4:1，深墨 6.2:1）。']);
  }

  /* ---- 12 关于 ---- */
  {
    const s = phoneScreen('12 关于', '关于');
    const logo = mkFrame('应用标识', 'HORIZONTAL', { gap: 12 });
    logo.counterAxisAlignItems = 'CENTER';
    const mark = mkFrame('标识', 'HORIZONTAL', { radius: 3 });
    mark.primaryAxisSizingMode = 'FIXED';
    mark.counterAxisSizingMode = 'FIXED';
    mark.resize(44, 44);
    mark.primaryAxisSizingMode = 'FIXED';
    mark.counterAxisSizingMode = 'FIXED';
    mark.primaryAxisAlignItems = 'CENTER';
    mark.counterAxisAlignItems = 'CENTER';
    mark.fills = [solid(C.fg)];
    mark.appendChild(mkText('🏸', { size: 22, color: C.onLight, lh: 1 }));
    logo.appendChild(mark);
    const li = mkFrame('标识文字', 'VERTICAL', { gap: 2 });
    li.appendChild(mkText('羽毛球极速计分板', { size: 17, weight: 700, color: C.fg, lh: 1.15 }));
    li.appendChild(mkText('v4.0.0', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
    logo.appendChild(li);
    s.content.appendChild(logo);

    const list = mkFrame('信息列表', 'VERTICAL', { gap: 8 });
    wantFillH(list);
    [['数据存储', 'localStorage'], ['已记录比赛', '12 场'], ['已解锁成就', '5 / 12']]
      .forEach(function (r) { list.appendChild(mkListItem(r[0], null, r[1])); });
    s.content.appendChild(list);
    s.content.appendChild(mkText('纯本地应用，无账号、无后端、离线可用。换设备请使用「数据备份」导出 JSON。',
      { size: 11, weight: 400, color: C.fg3, lh: 1.6, w: 326 }));
    const links = mkFrame('链接', 'HORIZONTAL', { gap: 8 });
    wantFillH(links);
    links.appendChild(mkBtn('✎ 反馈问题', 'outline', { block: true }));
    links.appendChild(mkBtn('★ 去 GitHub 点个 Star', 'outline', { block: true }));
    s.content.appendChild(links);
    screens.push(['12 · 关于', finishPhone(s.phone, s.content, 3, false),
      '标识是全屏唯一一处实心象牙白 —— 与主按钮同一条规则。']);
  }

  let x = 0;
  const GAP = 80;
  screens.forEach(function (sc) {
    const cap = caption(sc[0], sc[2], 360);
    page.appendChild(cap);
    cap.x = x;
    cap.y = 24;
    page.appendChild(sc[1]);
    sc[1].x = x;
    sc[1].y = 110;
    x += 390 + GAP;
  });
  finishPage(page);
  return { page: page.name, count: screens.length };
}

/* ---------------- 9 · 场边与分享 ---------------- */

function csTopbar(width, withTimer) {
  const top = mkFrame('场边顶栏', 'HORIZONTAL', { gap: 12, pl: 16, pr: 16, pt: 8, pb: 8 });
  top.primaryAxisSizingMode = 'FIXED';
  top.counterAxisSizingMode = 'FIXED';
  top.resize(width, 46);
  top.primaryAxisSizingMode = 'FIXED';
  top.counterAxisSizingMode = 'FIXED';
  top.counterAxisAlignItems = 'CENTER';
  top.fills = [FACE_1()];
  top.effects = [lift(1)];
  top.appendChild(mkLabel('第 1 局', C.fg2));
  top.appendChild(spacer());
  top.appendChild(mkText('00:00', { size: 17, weight: 700, color: C.fg, lh: 1 }));
  top.appendChild(mkLabel('进行中', C.live));
  if (withTimer) top.appendChild(mkBtn('计时', 'ghost', { size: 11 }));
  top.appendChild(mkBtn('退出', 'ghost', { size: 11 }));
  return top;
}

async function buildCourtsideAndShare() {
  const page = await ensurePage('场边与分享');
  clearPage(page);

  /* ---- 场边横屏 844×390 ---- */
  const land = mkFrame('场边 · 横屏 844×390', 'VERTICAL', {});
  land.primaryAxisSizingMode = 'FIXED';
  land.counterAxisSizingMode = 'FIXED';
  land.resize(844, 390);
  land.primaryAxisSizingMode = 'FIXED';
  land.counterAxisSizingMode = 'FIXED';
  land.clipsContent = true;
  land.fills = [solid(C.board)];
  land.appendChild(csTopbar(844, true));
  const board = mkFrame('场边比分', 'HORIZONTAL', {});
  wantFillH(board);
  wantFillV(board);
  board.appendChild(mkHalfCourt('a', C.a, '队伍 A', 15, true,
    { head: false, nameSize: 19, scoreSize: 205, scoreWeight: 800, prog: false, meta: false, padTop: 24 }));
  board.appendChild(mkHalfCourt('b', C.b, '队伍 B', 10, false,
    { head: false, nameSize: 19, scoreSize: 205, scoreWeight: 800, prog: false, meta: false, padTop: 24 }));
  land.appendChild(board);
  page.appendChild(land);
  land.x = 0;
  land.y = 110;
  const lcap = caption('场边 · 横屏 844×390',
    '手机架在场边、人站 2 米外。左右半屏即加分键，零装饰 —— 没有导航、没有卡片、没有日志。' +
    '可读高度 ≈ 距离 / 200，205px 对应约 2.2 m。', 560);
  page.appendChild(lcap);
  lcap.x = 0;
  lcap.y = 24;

  /* ---- 场边竖屏 390×844 ---- */
  const port = mkFrame('场边 · 竖屏 390×844', 'VERTICAL', {});
  port.primaryAxisSizingMode = 'FIXED';
  port.counterAxisSizingMode = 'FIXED';
  port.resize(390, 844);
  port.primaryAxisSizingMode = 'FIXED';
  port.counterAxisSizingMode = 'FIXED';
  port.clipsContent = true;
  port.fills = [solid(C.board)];
  port.appendChild(csTopbar(390, false));
  const pboard = mkFrame('场边比分', 'VERTICAL', {});
  wantFillH(pboard);
  wantFillV(pboard);
  pboard.appendChild(mkHalfCourt('a', C.a, '队伍 A', 15, true,
    { head: false, nameSize: 19, scoreSize: 143, scoreWeight: 800, prog: false, meta: false, padTop: 40 }));
  pboard.appendChild(mkHalfCourt('b', C.b, '队伍 B', 10, false,
    { head: false, nameSize: 19, scoreSize: 143, scoreWeight: 800, prog: false, meta: false, padTop: 40 }));
  port.appendChild(pboard);
  page.appendChild(port);
  port.x = 844 + 80;
  port.y = 110;
  const pcap = caption('场边 · 竖屏 390×844',
    '竖屏上下各半屏。比分 143px，2 米外仍然可读（1.7 m 舒适线）。', 390);
  page.appendChild(pcap);
  pcap.x = 844 + 80;
  pcap.y = 24;

  /* ---- 分享卡 360 ---- */
  const sc = mkFrame('分享卡 360×420', 'VERTICAL', { gap: 16, pl: 24, pr: 24, pt: 26, pb: 22 });
  sc.primaryAxisSizingMode = 'FIXED';
  sc.counterAxisSizingMode = 'FIXED';
  sc.resize(360, 420);
  sc.primaryAxisSizingMode = 'FIXED';
  sc.counterAxisSizingMode = 'FIXED';
  sc.clipsContent = true;
  sc.fills = [solid(C.plate)];
  const topLine = rect('胜方识别线', 10, 3, C.a);
  sc.appendChild(topLine);
  wantFillH(topLine);
  topLine.layoutSizingVertical = 'FIXED';

  const head = mkFrame('品牌行', 'HORIZONTAL', { gap: 8, pb: 11 });
  wantFillH(head);
  head.counterAxisAlignItems = 'CENTER';
  const brand = mkText('羽毛球极速计分板', { size: 11, weight: 600, ls: 0.24, color: C.fg3, lh: 1.2 });
  wantFillH(brand);
  head.appendChild(brand);
  head.appendChild(mkText('2026-10-08', { size: 11, weight: 500, ls: 0.05, color: C.fg3, lh: 1.2 }));
  sc.appendChild(head);

  const teams = mkFrame('对阵', 'HORIZONTAL', { gap: 8 });
  wantFillH(teams);
  teams.primaryAxisAlignItems = 'CENTER';
  teams.counterAxisAlignItems = 'CENTER';
  [['队伍 A', '21', '15', C.a, true], ['队伍 B', '18', '10', C.b, false]].forEach(function (t) {
    const col = mkFrame('队', 'VERTICAL', { gap: 4 });
    wantFillH(col);
    col.primaryAxisAlignItems = 'CENTER';
    col.counterAxisAlignItems = 'CENTER';
    col.appendChild(mkText(t[0], { size: 13.5, weight: 600, color: t[4] ? C.fg : C.fg2, lh: 1.2 }));
    col.appendChild(mkText(t[1], { size: 62, weight: 700, color: t[4] ? t[3] : C.fg3, lh: 1 }));
    col.appendChild(mkText(t[2], { size: 13.5, weight: 400, color: C.fg3, lh: 1.2 }));
    teams.appendChild(col);
  });
  sc.appendChild(teams);

  const foot = mkFrame('页脚', 'HORIZONTAL', { gap: 8, pt: 12 });
  wantFillH(foot);
  foot.counterAxisAlignItems = 'CENTER';
  const fl = mkText('2-0 · 32 分钟', { size: 11, weight: 500, color: C.fg3, lh: 1.2 });
  wantFillH(fl);
  foot.appendChild(fl);
  foot.appendChild(mkText('尝试，即世界。', { size: 11, weight: 500, color: C.fg3, lh: 1.2 }));
  sc.appendChild(foot);

  page.appendChild(sc);
  sc.x = (844 + 80) * 2 - 80;
  sc.y = 110;
  const scap = caption('分享卡 360×420',
    '顶部 3px 识别线的颜色就是胜方；平局退成中性发丝线。', 360);
  page.appendChild(scap);
  scap.x = sc.x;
  scap.y = 24;

  finishPage(page);
  return { page: page.name };
}

/* ---------------- 10 · 变量与样式 ---------------- */

const EFFECT_STYLE_NAMES = [
  '光 / 顶光 lift', '光 / 顶光 lift-2', '光 / 面板 plate',
  '光 / 浮层 pop', '光 / 内凹 sink', '光 / 网 net',
];

const TEXT_STYLE_NAMES = [
  '读数 / 比分 Score', '读数 / 场边 Score CS', '读数 / 计时 Timer',
  '标题 / 3xl', '标题 / 2xl', '标题 / xl',
  '正文 / lg', '正文 / md', '正文 / sm 强调', '小字 / 2xs',
  '仪表 / 标签 Label', '仪表 / 微标 Micro',
];

/* dynamic-page 模式下 getLocalEffectStyles()/getLocalTextStyles() 是同步禁用 API，
   必须走 *Async 版本；这里做异步优先、同步兜底的兼容，两种 manifest 模式都能跑。 */
async function localStyles() {
  const out = [];
  if (typeof figma.getLocalEffectStylesAsync === 'function') {
    out.push.apply(out, await figma.getLocalEffectStylesAsync());
  } else {
    out.push.apply(out, figma.getLocalEffectStyles());
  }
  if (typeof figma.getLocalTextStylesAsync === 'function') {
    out.push.apply(out, await figma.getLocalTextStylesAsync());
  } else {
    out.push.apply(out, figma.getLocalTextStyles());
  }
  return out;
}

async function buildVariables() {
  const existing = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of existing) {
    try { c.remove(); }
    catch (e) { WARN.push('旧变量集合「' + c.name + '」仍被节点引用，未删除 —— 重跑前请先清空画布'); }
  }

  const prim = figma.variables.createVariableCollection('1 · 基色 Primitives');
  prim.renameMode(prim.modes[0].modeId, 'Value');
  const sem = figma.variables.createVariableCollection('2 · 语义 Semantic');
  sem.renameMode(sem.modes[0].modeId, 'Night');
  const scl = figma.variables.createVariableCollection('3 · 尺度 Scale');
  scl.renameMode(scl.modes[0].modeId, 'Value');

  const pMode = prim.modes[0].modeId;
  const sMode = sem.modes[0].modeId;
  const cMode = scl.modes[0].modeId;
  const byName = {};

  PRIMITIVES.forEach(function (row) {
    const v = figma.variables.createVariable(row[0], prim, 'COLOR');
    const rgb = hexToRgb(row[1]);
    v.setValueForMode(pMode, { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 });
    try { v.scopes = row[2].split(','); } catch (e) { v.scopes = []; }
    try { v.setVariableCodeSyntax('WEB', 'var(' + row[3] + ')'); } catch (e) { /* 非致命 */ }
    byName[row[0]] = v;
    V[row[0]] = v;
  });

  SEMANTIC.forEach(function (row) {
    const v = figma.variables.createVariable(row[0], sem, 'COLOR');
    const base = byName[row[1]];
    if (base) v.setValueForMode(sMode, { type: 'VARIABLE_ALIAS', id: base.id });
    else v.setValueForMode(sMode, { r: 1, g: 1, b: 1, a: row[2] });
    try { v.scopes = row[3].split(','); } catch (e) { v.scopes = []; }
    try { v.setVariableCodeSyntax('WEB', 'var(' + row[4] + ')'); } catch (e) { /* 非致命 */ }
    V[row[0]] = v;
  });

  SCALE.forEach(function (row) {
    const v = figma.variables.createVariable(row[0], scl, 'FLOAT');
    v.setValueForMode(cMode, row[1]);
    try { v.scopes = row[2] === '[]' ? [] : row[2].split(','); } catch (e) { v.scopes = []; }
    try { v.setVariableCodeSyntax('WEB', 'var(' + row[3] + ')'); } catch (e) { /* 非致命 */ }
    V[row[0]] = v;
  });

  return {
    total: PRIMITIVES.length + SEMANTIC.length + SCALE.length,
    collections: [
      { name: prim.name, vars: PRIMITIVES.length },
      { name: sem.name, vars: SEMANTIC.length },
      { name: scl.name, vars: SCALE.length },
    ],
  };
}

async function buildStyles() {
  /* 重跑时先删掉同名旧样式，否则每跑一次就多一套。
     只删名字在我们清单里的 —— 不碰用户自己建的样式。 */
  const ours = {};
  EFFECT_STYLE_NAMES.concat(TEXT_STYLE_NAMES).forEach(function (n) { ours[n] = 1; });
  const stale = (await localStyles()).filter(function (s) { return ours[s.name]; });
  for (const s of stale) {
    try { s.remove(); } catch (e) { /* 仍被引用则保留 */ }
  }

  const effectSpecs = [
    [EFFECT_STYLE_NAMES[0], [lift(1)]],
    [EFFECT_STYLE_NAMES[1], [lift(2)]],
    [EFFECT_STYLE_NAMES[2], [lift(1), plateShadow()]],
    [EFFECT_STYLE_NAMES[3], [lift(2), popShadow()]],
    [EFFECT_STYLE_NAMES[4], [sinkShadow()]],
    [EFFECT_STYLE_NAMES[5], [
      { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.7 }, offset: { x: -3, y: 0 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' },
      { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.7 }, offset: { x: 3, y: 0 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' },
    ]],
  ];
  const made = [];
  effectSpecs.forEach(function (row) {
    const s = figma.createEffectStyle();
    s.name = row[0];
    s.effects = row[1];
    made.push(s.name);
  });

  const textSpecs = [
    [TEXT_STYLE_NAMES[0], 'display', 140, 700, 0.92, 0],
    [TEXT_STYLE_NAMES[1], 'display', 205, 800, 0.92, 0],
    [TEXT_STYLE_NAMES[2], 'display', 19, 700, 1, 0],
    [TEXT_STYLE_NAMES[3], 'cjk', 26, 700, 1.15, 0],
    [TEXT_STYLE_NAMES[4], 'cjk', 19, 700, 1.15, 0],
    [TEXT_STYLE_NAMES[5], 'cjk', 17, 700, 1.15, 0],
    [TEXT_STYLE_NAMES[6], 'cjk', 15, 400, 1.6, 0],
    [TEXT_STYLE_NAMES[7], 'cjk', 13.5, 400, 1.6, 0],
    [TEXT_STYLE_NAMES[8], 'cjk', 13.5, 600, 1.4, 0],
    [TEXT_STYLE_NAMES[9], 'cjk', 11, 400, 1.4, 0],
    [TEXT_STYLE_NAMES[10], 'cjk', 9.5, 700, 1.2, 0.20],
    [TEXT_STYLE_NAMES[11], 'cjk', 9.5, 700, 1.2, 0.20],
  ];
  for (const row of textSpecs) {
    const fn = await resolveFont(row[1] === 'display' ? DISPLAY_STACK : CJK_STACK, row[3]);
    const s = figma.createTextStyle();
    s.name = row[0];
    s.fontName = fn;
    s.fontSize = row[2];
    s.lineHeight = { unit: 'PERCENT', value: row[4] * 100 };
    s.letterSpacing = { unit: 'PERCENT', value: row[5] * 100 };
    made.push(s.name);
  }
  return made;
}

/* ---------------- 11 · 主流程 ---------------- */

function post(pct, text, kind) {
  figma.ui.postMessage({ type: 'progress', pct: pct, text: text, kind: kind });
}

async function run() {
  AVAIL = await figma.listAvailableFontsAsync();

  post(2, '正在清理上一次的产物…');
  await preparePages();

  post(3, '正在建立变量…');
  const vars = await buildVariables();
  post(12, '变量 ' + vars.total + ' 个 · ' + vars.collections.length + ' 个集合', 'ok');

  /* ⚠️ 字体必须在建任何文本之前加载完。
     mkText 赋 fontName 时若该字体没加载，Figma 会直接抛错；
     而 FONT_OK 是「加载成功」的账本，readyFont 依赖它做兜底。
     所以这一步排在样式与所有页面之前。 */
  post(14, '正在加载字体…');
  const warmup = ['夜场 NIGHT COURT', '1234567890', '队伍 A', '队伍 B', '本局回合时间轴',
    '甲队得分', '乙队得分', '羽毛球极速计分板', '尝试，即世界。', '目标分数',
    '三局两胜', '加分赛', '换边提醒', '智能分组', '费用分摊', '本机球员'];
  await loadFontsFor(warmup, [400, 500, 600, 700, 800]);

  const displayPick = pickFont(DISPLAY_STACK, 700);
  const cjkPick = pickFont(CJK_STACK, 400);
  if (displayPick.family !== 'Barlow Semi Condensed') {
    WARN.push('读数族回落：目标「Barlow Semi Condensed」不可用，实际用「' + displayPick.family + '」。装上该字体可还原设计。');
  }
  if (cjkPick.family !== 'Noto Sans SC') {
    WARN.push('中文族回落：目标「Noto Sans SC」不可用，实际用「' + cjkPick.family + '」。');
  }

  post(15, '正在建立样式…');
  const styles = await buildStyles();
  post(24, '样式 ' + styles.length + ' 个', 'ok');

  post(30, '正在生成封面…');
  await buildCover();
  post(38, '封面 ✓', 'ok');

  post(42, '正在生成基础页…');
  await buildFoundations();
  post(52, '基础 ✓', 'ok');

  post(56, '正在生成组件页…');
  await buildComponents();
  post(66, '组件 ✓', 'ok');

  post(70, '正在生成 12 个界面…');
  await buildScreens();
  post(90, '12 个界面 ✓', 'ok');

  post(93, '正在生成场边与分享卡…');
  await buildCourtsideAndShare();
  post(99, '场边与分享 ✓', 'ok');

  /* 每页在 finishPage() 里已经就地结算过 FILL 与令牌绑定，
     这里只汇总 —— 见 finishPage 上方关于「Figma 只加载当前页」的说明。 */
  post(99, '令牌绑定完成', 'ok');
  const filled = BOUND.fills;
  const colorBound = BOUND.colors;
  const scaleBound = BOUND.scales;

  figma.ui.postMessage({
    type: 'done',
    summary: '5 个页面 · ' + vars.total + ' 个变量 · ' + styles.length + ' 个样式 · ' +
      '12 个界面 + 场边 2 个 + 分享卡 1 个\n' +
      '弹性尺寸 ' + filled + ' 处 · 颜色绑定 ' + colorBound + ' 处 · 尺度绑定 ' + scaleBound + ' 处',
    warnings: WARN,
  });
}

figma.showUI(__html__, { width: 380, height: 460, themeColors: true });

run().catch(function (e) {
  figma.ui.postMessage({
    type: 'error',
    message: String(e && e.message ? e.message : e),
    stack: e && e.stack ? String(e.stack).slice(0, 1400) : '',
  });
});

/* ---------------- 6 · 基础 ---------------- */

async function buildFoundations() {
  const page = await ensurePage('基础 Foundations');
  clearPage(page);
  const root = mkFrame('基础', 'VERTICAL', { gap: 48, pl: 64, pr: 64, pt: 64, pb: 64 });
  root.fills = [solid(C.void)];
  root.resize(1180, 100);
  root.counterAxisSizingMode = 'FIXED';

  root.appendChild(sectionHead('色板', '地面三档 + 墨三档 + 唯二饱和色。改这里必须同步 css/tokens.css。'));
  const groups = [
    ['地面 Ground', [['--void', C.void], ['--board', C.board], ['--plate', C.plate], ['--plate-2', C.plate2], ['--plate-3', C.plate3]]],
    ['墨 Ink', [['--fg', C.fg], ['--fg-2', C.fg2], ['--fg-3', C.fg3]]],
    ['队伍 Team', [['--a', C.a], ['--b', C.b]]],
    ['状态 Status', [['--live', C.live], ['--ok', C.ok], ['--danger', C.danger]]],
    ['奖牌 Medal', [['--gold', C.gold], ['--silver', C.silver], ['--bronze', C.bronze]]],
  ];
  const swWrap = mkFrame('色板组', 'VERTICAL', { gap: 24 });
  wantFillH(swWrap);
  groups.forEach(function (g) {
    const col = mkFrame('色组 / ' + g[0], 'VERTICAL', { gap: 8 });
    wantFillH(col);
    col.appendChild(mkLabel(g[0], C.fg3));
    const row = mkFrame('色块行', 'HORIZONTAL', { gap: 8 });
    wantFillH(row);
    g[1].forEach(function (sw) {
      const cell = mkFrame('色 / ' + sw[0], 'VERTICAL', { gap: 6 });
      const box = rect(sw[0], 132, 62, sw[1]);
      box.effects = [lift(1)];
      cell.appendChild(box);
      cell.appendChild(mkText(sw[0], { size: 11, weight: 700, color: C.fg, lh: 1.2 }));
      cell.appendChild(mkText(sw[1], { size: 9.5, weight: 400, color: C.fg3, lh: 1.2 }));
      row.appendChild(cell);
    });
    col.appendChild(row);
    swWrap.appendChild(col);
  });
  root.appendChild(swWrap);

  root.appendChild(sectionHead('字号', '一档巨型 + 三档小字，中间全部删除。旧版三层挤在一起，所以「看起来什么都没强调」。'));
  const typeSpecs = [
    ['比分 Score', '140 / 700', 140, 700, C.a],
    ['标题 3xl', '26 / 700', 26, 700, C.fg],
    ['标题 2xl', '19 / 700', 19, 700, C.fg],
    ['正文 lg', '15 / 400', 15, 400, C.fg],
    ['正文 sm', '13.5 / 400', 13.5, 400, C.fg2],
    ['小字 2xs', '11 / 400', 11, 400, C.fg3],
    ['仪表 3xs', '9.5 / 700 + 20% 字距', 9.5, 700, C.fg3],
  ];
  const typeWrap = mkFrame('字阶', 'VERTICAL', { gap: 0 });
  wantFillH(typeWrap);
  typeSpecs.forEach(function (s) {
    const row = mkFrame('字阶 / ' + s[0], 'HORIZONTAL', { gap: 24, pt: 12, pb: 12 });
    wantFillH(row);
    row.counterAxisAlignItems = 'CENTER';
    const nm = mkText(s[0], { size: 13.5, weight: 600, color: C.fg, lh: 1.2 });
    nm.textAutoResize = 'HEIGHT';
    nm.resize(140, nm.height);
    row.appendChild(nm);
    const sp = mkText(s[1], { size: 11, weight: 400, color: C.fg3, lh: 1.2 });
    sp.textAutoResize = 'HEIGHT';
    sp.resize(170, sp.height);
    row.appendChild(sp);
    row.appendChild(mkText('1234567890', {
      size: Math.min(s[2], 140), weight: s[3], color: s[4], lh: 1.1,
      ls: s[0].indexOf('仪表') === 0 ? 0.20 : 0,
    }));
    typeWrap.appendChild(row);
  });
  root.appendChild(typeWrap);

  const two = mkFrame('尺度', 'HORIZONTAL', { gap: 48 });
  two.counterAxisAlignItems = 'MIN';
  wantFillH(two);

  const spCol = mkFrame('间距', 'VERTICAL', { gap: 8 });
  spCol.appendChild(mkLabel('间距 · 8 的倍数为主', C.fg3));
  [[4, '--sp-1'], [8, '--sp-2'], [12, '--sp-3'], [16, '--sp-4'], [20, '--sp-5'],
   [24, '--sp-6'], [32, '--sp-7'], [40, '--sp-8']].forEach(function (p) {
    const row = mkFrame('间距 ' + p[0], 'HORIZONTAL', { gap: 12 });
    row.counterAxisAlignItems = 'CENTER';
    const l = mkText(p[1], { size: 11, weight: 400, color: C.fg3, lh: 1 });
    l.textAutoResize = 'HEIGHT';
    l.resize(64, l.height);
    row.appendChild(l);
    row.appendChild(rect(p[0] + 'px', p[0], 10, C.fg, 0.72));
    row.appendChild(mkText(p[0] + 'px', { size: 11, weight: 400, color: C.fg2, lh: 1 }));
    spCol.appendChild(row);
  });
  two.appendChild(spCol);

  const rCol = mkFrame('圆角', 'VERTICAL', { gap: 8 });
  rCol.appendChild(mkLabel('圆角 · 只有两种决定', C.fg3));
  [['--r-sm 面板', '0px', 0], ['--r-xs 输入框', '3px', 3], ['--r-sheet 弹层', '14px', 14], ['--r-full 交互', '999px', 20]]
    .forEach(function (r) {
      const row = mkFrame('圆角 / ' + r[0], 'HORIZONTAL', { gap: 12 });
      row.counterAxisAlignItems = 'CENTER';
      const l = mkText(r[0], { size: 11, weight: 400, color: C.fg3, lh: 1 });
      l.textAutoResize = 'HEIGHT';
      l.resize(120, l.height);
      row.appendChild(l);
      const box = rect(r[0], 64, 40, C.plate2);
      box.cornerRadius = r[2];
      box.strokes = [solid(C.fg, 0.24)];
      box.strokeWeight = 1;
      box.strokeAlign = 'INSIDE';
      row.appendChild(box);
      row.appendChild(mkText(r[1], { size: 11, weight: 400, color: C.fg2, lh: 1 }));
      rCol.appendChild(row);
    });
  rCol.appendChild(mkText('面板一律锐角（球场边线的语言），交互一律全圆（手指按下去没有方向）。',
    { size: 11, weight: 400, color: C.fg3, lh: 1.6, w: 320 }));
  two.appendChild(rCol);

  const lightCol = mkFrame('光', 'VERTICAL', { gap: 8 });
  lightCol.appendChild(mkLabel('光 · v4 的核心', C.fg3));
  [['无顶光（v3 的病根）', false, '--sh-flat: none'],
   ['有顶光（v4）', true, 'inset 0 1px 0 rgba(255,255,255,.065)']].forEach(function (p) {
    const box = mkFrame('面板样例 / ' + p[0], 'VERTICAL', { gap: 6, pl: 16, pr: 16, pt: 16, pb: 16, radius: 0 });
    box.primaryAxisSizingMode = 'FIXED';
    box.counterAxisSizingMode = 'FIXED';
    box.resize(260, 96);
    box.primaryAxisSizingMode = 'FIXED';
    box.counterAxisSizingMode = 'FIXED';
    box.fills = [FACE_1()];
    if (p[1]) box.effects = [lift(1), plateShadow()];
    box.appendChild(mkText(p[0], { size: 13.5, weight: 600, color: C.fg, lh: 1.2 }));
    box.appendChild(mkText(p[2], { size: 9.5, weight: 400, color: C.fg3, lh: 1.4 }));
    lightCol.appendChild(box);
  });
  lightCol.appendChild(mkText('深色底上 1px 灰边是看不见的 —— 少了顶光，所有面板会塌成一块死灰。',
    { size: 11, weight: 400, color: C.fg3, lh: 1.6, w: 260 }));
  two.appendChild(lightCol);

  root.appendChild(two);
  page.appendChild(root);
  root.x = 0;
  root.y = 0;
  finishPage(page);
  return { page: page.name, rootId: root.id };
}

/* ---------------- 7 · 组件 ---------------- */

async function buildComponents() {
  const page = await ensurePage('组件 Components');
  clearPage(page);
  const root = mkFrame('组件', 'VERTICAL', { gap: 48, pl: 64, pr: 64, pt: 64, pb: 64 });
  root.fills = [solid(C.void)];
  root.resize(1180, 100);
  root.counterAxisSizingMode = 'FIXED';

  root.appendChild(sectionHead('按钮', '主行动是全屏唯一一处实心象牙白 —— 「全屏最亮的东西只有一个」，所以主按钮用白，不用彩色。'));
  const btnRow = mkFrame('按钮组', 'HORIZONTAL', { gap: 12 });
  btnRow.layoutWrap = 'WRAP';
  btnRow.counterAxisAlignItems = 'CENTER';
  btnRow.primaryAxisSizingMode = 'FIXED';
  btnRow.counterAxisSizingMode = 'FIXED';
  btnRow.resize(1052, 96);
  btnRow.primaryAxisSizingMode = 'FIXED';
  btnRow.counterAxisSizingMode = 'FIXED';
  btnRow.appendChild(mkBtn('生成分组', 'primary', { size: 15 }));
  btnRow.appendChild(mkBtn('导出', 'outline'));
  btnRow.appendChild(mkBtn('取消', 'ghost'));
  btnRow.appendChild(mkBtn('清空所有数据', 'danger'));
  btnRow.appendChild(mkBtn('重置本局', 'dark'));
  btnRow.appendChild(mkBtn('↶', 'ghost', { icon: true }));
  root.appendChild(btnRow);

  root.appendChild(sectionHead('芯片与标签', '芯片是「可以加的输入」，标签是「已经成立的事实」。'));
  const chipRow = mkFrame('芯片行', 'HORIZONTAL', { gap: 8 });
  chipRow.layoutWrap = 'WRAP';
  chipRow.counterAxisAlignItems = 'CENTER';
  chipRow.primaryAxisSizingMode = 'FIXED';
  chipRow.counterAxisSizingMode = 'FIXED';
  chipRow.resize(1052, 96);
  chipRow.primaryAxisSizingMode = 'FIXED';
  chipRow.counterAxisSizingMode = 'FIXED';
  ['张三', '李四', '王五', '赵六'].forEach(function (n) { chipRow.appendChild(mkChip(n, false, true)); });
  ['21 分制', 'AA 制', '双打'].forEach(function (n) { chipRow.appendChild(mkChip(n, true, false)); });
  root.appendChild(chipRow);

  const tagRow = mkFrame('标签行', 'HORIZONTAL', { gap: 8 });
  tagRow.counterAxisAlignItems = 'CENTER';
  tagRow.appendChild(mkTag('胜', 'win'));
  tagRow.appendChild(mkTag('负', 'lose'));
  tagRow.appendChild(mkTag('高光 · 加分赛', 'gold'));
  tagRow.appendChild(mkTag('21 分制', 'brand'));
  tagRow.appendChild(mkTag('AA 制', 'brand'));
  root.appendChild(tagRow);

  root.appendChild(sectionHead('选择卡', '选中态用象牙白顶线，不是琥珀 —— 琥珀在全站只有一个含义：进行中。'));
  const pickRow = mkFrame('选择卡组', 'HORIZONTAL', { gap: 8 });
  wantFillH(pickRow);
  pickRow.primaryAxisSizingMode = 'FIXED';
  pickRow.counterAxisSizingMode = 'FIXED';
  pickRow.resize(1052, 110);
  pickRow.primaryAxisSizingMode = 'FIXED';
  pickRow.counterAxisSizingMode = 'FIXED';
  [['21 分', '标准单局', true, '◎'], ['15 分', '快速局', false, '⚡'],
   ['11 分', '短局', false, '▲'], ['自定义', '任意目标分', false, '✎']]
    .forEach(function (p) { pickRow.appendChild(mkPickCard(p[0], p[1], p[2], p[3])); });
  root.appendChild(pickRow);

  root.appendChild(sectionHead('表单', '输入框内凹（sink）而不是描边 —— 凹陷感让「可输入」一眼可辨。'));
  const formWrap = mkFrame('表单组', 'HORIZONTAL', { gap: 32 });
  formWrap.counterAxisAlignItems = 'MIN';
  formWrap.primaryAxisSizingMode = 'FIXED';
  formWrap.counterAxisSizingMode = 'FIXED';
  formWrap.resize(1052, 220);
  formWrap.primaryAxisSizingMode = 'FIXED';
  formWrap.counterAxisSizingMode = 'FIXED';

  const f1 = mkFrame('输入框 / 默认', 'VERTICAL', { gap: 8 });
  f1.appendChild(mkLabel('目标分数', C.fg3));
  const input = mkFrame('输入框', 'HORIZONTAL', { pl: 12, pr: 12, pt: 12, pb: 12, radius: 3 });
  input.primaryAxisSizingMode = 'FIXED';
  input.counterAxisSizingMode = 'FIXED';
  input.resize(240, 44);
  input.primaryAxisSizingMode = 'FIXED';
  input.counterAxisSizingMode = 'FIXED';
  input.counterAxisAlignItems = 'CENTER';
  input.fills = [solid(C.void)];
  input.effects = [sinkShadow()];
  input.appendChild(mkText('21', { size: 13.5, weight: 400, color: C.fg, lh: 1 }));
  f1.appendChild(input);
  f1.appendChild(mkText('min 1 · max 99', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
  formWrap.appendChild(f1);

  const f2 = mkFrame('输入框 / 聚焦', 'VERTICAL', { gap: 8 });
  f2.appendChild(mkLabel('聚焦态', C.fg3));
  const input2 = mkFrame('输入框', 'HORIZONTAL', { pl: 12, pr: 12, pt: 12, pb: 12, radius: 3 });
  input2.primaryAxisSizingMode = 'FIXED';
  input2.counterAxisSizingMode = 'FIXED';
  input2.resize(240, 44);
  input2.primaryAxisSizingMode = 'FIXED';
  input2.counterAxisSizingMode = 'FIXED';
  input2.counterAxisAlignItems = 'CENTER';
  input2.fills = [solid(C.void)];
  input2.effects = [sinkShadow()];
  input2.strokes = [solid(C.live)];
  input2.strokeWeight = 2;
  input2.strokeAlign = 'OUTSIDE';
  input2.appendChild(mkText('聚焦环 = 琥珀（进行中）', { size: 13.5, weight: 400, color: C.fg3, lh: 1 }));
  f2.appendChild(input2);
  f2.appendChild(mkText('焦点环不能删 —— 键盘用户靠它定位。', { size: 11, weight: 400, color: C.fg3, lh: 1.4 }));
  formWrap.appendChild(f2);

  const f3 = mkFrame('开关组', 'VERTICAL', { gap: 0 });
  f3.primaryAxisSizingMode = 'FIXED';
  f3.counterAxisSizingMode = 'FIXED';
  f3.resize(360, 200);
  f3.primaryAxisSizingMode = 'FIXED';
  f3.counterAxisSizingMode = 'FIXED';
  f3.appendChild(switchRow('三局两胜', '先赢 2 局者获胜', true));
  f3.appendChild(switchRow('加分赛', '平分后需领先 2 分，30 分封顶', true));
  f3.appendChild(switchRow('换边提醒', '达到换边分时弹出提示', false));
  formWrap.appendChild(f3);
  root.appendChild(formWrap);

  root.appendChild(sectionHead('列表 · 统计 · 分段', '列表一行说清「点了会发生什么」；统计卡只放一个读数加一个标签。'));
  const lists = mkFrame('列表组', 'HORIZONTAL', { gap: 32 });
  lists.counterAxisAlignItems = 'MIN';
  lists.primaryAxisSizingMode = 'FIXED';
  lists.counterAxisSizingMode = 'FIXED';
  lists.resize(1052, 320);
  lists.primaryAxisSizingMode = 'FIXED';
  lists.counterAxisSizingMode = 'FIXED';

  const lc = mkFrame('列表', 'VERTICAL', { gap: 8 });
  lc.primaryAxisSizingMode = 'FIXED';
  lc.counterAxisSizingMode = 'FIXED';
  lc.resize(420, 280);
  lc.primaryAxisSizingMode = 'FIXED';
  lc.counterAxisSizingMode = 'FIXED';
  lc.appendChild(mkListItem('新比赛', '重置并开始一场新比赛', null, '🏸'));
  lc.appendChild(mkListItem('随机分组', '前往智能分组', null, '🎲'));
  lc.appendChild(mkListItem('费用分摊', '前往费用计算', null, '¥'));
  lc.appendChild(mkListItem('查看统计', '前往历史与图表', null, '▥'));
  lists.appendChild(lc);

  const sc = mkFrame('统计', 'VERTICAL', { gap: 12 });
  sc.primaryAxisSizingMode = 'FIXED';
  sc.counterAxisSizingMode = 'FIXED';
  sc.resize(520, 200);
  sc.primaryAxisSizingMode = 'FIXED';
  sc.counterAxisSizingMode = 'FIXED';
  const scRow = mkFrame('统计行', 'HORIZONTAL', { gap: 8 });
  scRow.primaryAxisSizingMode = 'FIXED';
  scRow.counterAxisSizingMode = 'FIXED';
  scRow.resize(520, 76);
  scRow.primaryAxisSizingMode = 'FIXED';
  scRow.counterAxisSizingMode = 'FIXED';
  scRow.appendChild(mkStatCard('12', '总场次'));
  scRow.appendChild(mkStatCard('7', '胜场'));
  scRow.appendChild(mkStatCard('58%', '胜率'));
  sc.appendChild(scRow);
  const scRow2 = mkFrame('统计行 2', 'HORIZONTAL', { gap: 8 });
  scRow2.primaryAxisSizingMode = 'FIXED';
  scRow2.counterAxisSizingMode = 'FIXED';
  scRow2.resize(520, 76);
  scRow2.primaryAxisSizingMode = 'FIXED';
  scRow2.counterAxisSizingMode = 'FIXED';
  scRow2.appendChild(mkStatCard('4h 20m', '总时长'));
  scRow2.appendChild(mkStatCard('3', '连续胜场'));
  scRow2.appendChild(mkStatCard('21', '最高分'));
  sc.appendChild(scRow2);
  lists.appendChild(sc);
  root.appendChild(lists);

  const seg = mkFrame('分段', 'VERTICAL', { gap: 12 });
  seg.primaryAxisSizingMode = 'FIXED';
  seg.counterAxisSizingMode = 'FIXED';
  seg.resize(460, 140);
  seg.primaryAxisSizingMode = 'FIXED';
  seg.counterAxisSizingMode = 'FIXED';
  seg.appendChild(mkSegmented(['胜场', '场次', '胜率', '时长'], 0));
  seg.appendChild(mkSegmented(['随机分组', '实力平衡', '轮换赛制'], 2));
  root.appendChild(seg);

  root.appendChild(sectionHead('回合时间轴', '把一场球压成一条可读的条码：柱高 = 该回合比分，颜色 = 谁得分，竖线 = 换边点。'));
  const tlWrap = mkFrame('时间轴样例', 'HORIZONTAL');
  tlWrap.primaryAxisSizingMode = 'FIXED';
  tlWrap.counterAxisSizingMode = 'FIXED';
  tlWrap.resize(358, 300);
  tlWrap.primaryAxisSizingMode = 'FIXED';
  tlWrap.counterAxisSizingMode = 'FIXED';
  const tl = mkTimeline(sampleRounds(), 11, 326);
  tl.layoutSizingHorizontal = 'FIXED';
  tl.resize(358, tl.height);
  tlWrap.appendChild(tl);
  root.appendChild(tlWrap);

  page.appendChild(root);
  root.x = 0;
  root.y = 0;
  finishPage(page);
  return { page: page.name, rootId: root.id };
}
