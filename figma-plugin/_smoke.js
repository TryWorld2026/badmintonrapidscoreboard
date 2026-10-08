/* ================================================================
   figma-plugin/_smoke.js — 无头冒烟测试（开发用，不随插件发布）

   用一个最小的 Figma Plugin API 替身把 code.js 跑一遍，
   抓出「只有打开 Figma 才会暴露」的那类错误：
     · 未加载字体就写文本
     · 在非 auto-layout 子节点上设 FILL
     · 颜色通道越界 / 不存在的 API

   用法：node figma-plugin/_smoke.js
   ================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERRORS = [];
const STATS = { nodes: 0, texts: 0, frames: 0, rects: 0, ellipses: 0 };

function fail(msg) { ERRORS.push(msg); }

/* ---- 字体表：只提供一组「真实世界」会有的族，逼出回落路径 ---- */
/* 默认表模拟「Figma 字体库里有 Barlow」；
   SMOKE_NO_BARLOW=1 模拟「本机没装、库里也没有」——那才是真实环境最常见的情况，
   回落分支必须也能跑通。 */
const FONT_TABLE = {
  'Barlow Semi Condensed': ['Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold'],
  'Noto Sans SC': ['Regular', 'Medium', 'Bold'],
  'Inter': ['Regular', 'Medium', 'Semi Bold', 'Bold'],
  'Microsoft YaHei': ['Regular', 'Bold'],
};
if (process.env.SMOKE_NO_BARLOW) {
  delete FONT_TABLE['Barlow Semi Condensed'];
  delete FONT_TABLE['Noto Sans SC'];
}

const loadedFonts = new Set();

class FakeMixin {
  constructor(type, name) {
    this.type = type;
    this.id = 'id:' + (++STATS.nodes);
    this.name = name || type;
    this.children = [];
    this.parent = null;
    this.x = 0;
    this.y = 0;
    this.width = 100;
    this.height = 100;
    this.fills = [];
    this.strokes = [];
    this.effects = [];
    this.strokeWeight = 1;
    this.opacity = 1;
    this.cornerRadius = 0;
    this.clipsContent = false;
    this.layoutMode = 'NONE';
    this.layoutWrap = 'NO_WRAP';
    this.itemSpacing = 0;
    this.paddingLeft = 0;
    this.paddingRight = 0;
    this.paddingTop = 0;
    this.paddingBottom = 0;
    this.primaryAxisSizingMode = 'AUTO';
    this.counterAxisSizingMode = 'AUTO';
    this.primaryAxisAlignItems = 'MIN';
    this.counterAxisAlignItems = 'MIN';
    this.minHeight = null;
    this._fillH = null;
    this._fillV = null;
    this._fontName = null;
  }

  get isAutoLayout() { return this.layoutMode === 'HORIZONTAL' || this.layoutMode === 'VERTICAL'; }

  set layoutSizingHorizontal(v) {
    if (v === 'FILL') {
      if (!this.parent) return fail('FILL(横) 设在无父节点上：' + this.name);
      if (!this.parent.isAutoLayout) return fail('FILL(横) 的父级不是 auto-layout：' + this.name + ' <- ' + this.parent.name);
    }
    this._fillH = v;
  }
  get layoutSizingHorizontal() { return this._fillH; }

  set layoutSizingVertical(v) {
    if (v === 'FILL') {
      if (!this.parent) return fail('FILL(纵) 设在无父节点上：' + this.name);
      if (!this.parent.isAutoLayout) return fail('FILL(纵) 的父级不是 auto-layout：' + this.name + ' <- ' + this.parent.name);
    }
    this._fillV = v;
  }
  get layoutSizingVertical() { return this._fillV; }

  resize(w, h) {
    if (w < 0 || h < 0) return fail('resize 收到负数：' + this.name + ' ' + w + ' x ' + h);
    this.width = w;
    this.height = h;
  }

  appendChild(child) {
    if (!child || typeof child !== 'object') return fail('appendChild 收到非节点：' + this.name);
    if (child === this) return fail('appendChild 自己：' + this.name);
    if (child.parent) {
      const i = child.parent.children.indexOf(child);
      if (i >= 0) child.parent.children.splice(i, 1);
    }
    child.parent = this;
    this.children.push(child);
    return child;
  }

  insertChild(index, child) {
    if (child.parent) {
      const i = child.parent.children.indexOf(child);
      if (i >= 0) child.parent.children.splice(i, 1);
    }
    child.parent = this;
    this.children.splice(index, 0, child);
    return child;
  }

  remove() {
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
  }

  findAll(cb) {
    const out = [];
    const walk = function (n) {
      for (const c of n.children) {
        if (!cb || cb(c)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  findOne(cb) { return this.findAll(cb)[0] || null; }

  setBoundVariable(prop, v) {
    if (!v) return fail('setBoundVariable 收到空变量：' + this.name + '.' + prop);
    this['_bv_' + prop] = v;
  }
}

class FakeText extends FakeMixin {
  constructor() {
    super('TEXT', 'text');
    STATS.texts++;
    this.fontSize = 12;
    this.lineHeight = { unit: 'PERCENT', value: 100 };
    this.letterSpacing = { unit: 'PERCENT', value: 0 };
    this.textAutoResize = 'WIDTH_AND_HEIGHT';
    this.textAlignHorizontal = 'LEFT';
    this.textCase = 'ORIGINAL';
    this._chars = '';
  }
  set fontName(fn) {
    if (!fn || !fn.family || !fn.style) return fail('fontName 不完整：' + JSON.stringify(fn));
    const key = fn.family + '|' + fn.style;
    if (!loadedFonts.has(key)) return fail('未加载就设字体：' + key + '（节点 ' + this.name + '）');
    this._fontName = fn;
  }
  get fontName() { return this._fontName; }
  set characters(s) {
    if (!this._fontName) return fail('未设字体就写 characters：' + this.name);
    this._chars = s;
  }
  get characters() { return this._chars; }
}

class FakeFrame extends FakeMixin {
  constructor() { super('FRAME', 'frame'); STATS.frames++; }
}
class FakeRect extends FakeMixin {
  constructor() { super('RECTANGLE', 'rect'); STATS.rects++; }
}
class FakeEllipse extends FakeMixin {
  constructor() { super('ELLIPSE', 'ellipse'); STATS.ellipses++; }
}
class FakePage extends FakeMixin {
  constructor(name) {
    super('PAGE', name);
    this._children = [];
    this._loaded = false;
  }

  /* 模拟 Figma 的「按需加载页」：
     只有当前页才暴露 children，非当前页一律读成空数组。
     这是本项目踩过的真实坑 —— 不模拟它，测试就抓不到误删用户页的 bug。 */
  get children() {
    return this._loaded ? this._children : [];
  }
  set children(v) { this._children = v; }

  appendChild(child) {
    this._loaded = true;
    return super.appendChild(child);
  }
  insertChild(index, child) {
    this._loaded = true;
    return super.insertChild(index, child);
  }

  /* dynamic-page 模式下切页不等于内容就绪，插件会显式 loadAsync 一次。 */
  async loadAsync() { this._loaded = true; }

  remove() {
    const i = figma.root.children.indexOf(this);
    if (i < 0) return;
    if (figma.root.children.length <= 1) {
      return fail('试图删除最后一页（Figma 不允许）：' + this.name);
    }
    figma.root.children.splice(i, 1);
  }
}

const collections = [];
const effectStyles = [];
const textStyles = [];

const figma = {
  root: { children: [] },
  currentPage: null,
  mixed: Symbol('mixed'),

  async setCurrentPageAsync(p) {
    this.currentPage = p;
    /* 切到某页 = Figma 把它的内容加载进来。 */
    if (p && p.type === 'PAGE') p._loaded = true;
  },

  createPage() {
    const p = new FakePage('Page ' + (figma.root.children.length + 1));
    figma.root.children.push(p);
    return p;
  },

  async getNodeByIdAsync(id) {
    const seen = [];
    const walk = function (n) {
      if (n.id === id) seen.push(n);
      for (const c of n.children) walk(c);
    };
    for (const pg of figma.root.children) walk(pg);
    return seen[0] || null;
  },

  createFrame() { return new FakeFrame(); },
  createRectangle() { return new FakeRect(); },
  createEllipse() { return new FakeEllipse(); },
  createText() { return new FakeText(); },

  createEffectStyle() {
    const s = { name: '', effects: [] };
    s.remove = function () {
      const i = effectStyles.indexOf(s);
      if (i >= 0) effectStyles.splice(i, 1);
    };
    effectStyles.push(s);
    return s;
  },
  createTextStyle() {
    const s = { name: '', fontName: null, fontSize: 0, lineHeight: null, letterSpacing: null };
    s.remove = function () {
      const i = textStyles.indexOf(s);
      if (i >= 0) textStyles.splice(i, 1);
    };
    textStyles.push(s);
    return s;
  },
  getLocalEffectStyles() { return effectStyles.slice(); },
  getLocalTextStyles() { return textStyles.slice(); },
  /* dynamic-page 模式下同步版会抛错，插件必须优先走 *Async。
     设 SMOKE_SYNC_STYLES=1 可摘掉异步版，用来验证同步兜底分支。 */
  ...(process.env.SMOKE_SYNC_STYLES ? {} : {
    async getLocalEffectStylesAsync() { return effectStyles.slice(); },
    async getLocalTextStylesAsync() { return textStyles.slice(); },
  }),

  async loadFontAsync(fn) {
    const styles = FONT_TABLE[fn.family];
    if (!styles || styles.indexOf(fn.style) === -1) {
      throw new Error('字体不存在: ' + fn.family + ' ' + fn.style);
    }
    loadedFonts.add(fn.family + '|' + fn.style);
  },

  async listAvailableFontsAsync() {
    const out = [];
    for (const fam of Object.keys(FONT_TABLE)) {
      for (const st of FONT_TABLE[fam]) out.push({ fontName: { family: fam, style: st } });
    }
    return out;
  },

  notify() { /* 插件里合法，测试替身忽略 */ },
  showUI() {},

  variables: {
    async getLocalVariableCollectionsAsync() { return collections.slice(); },
    createVariableCollection(name) {
      const c = {
        id: 'coll:' + name,
        name: name,
        modes: [{ modeId: 'm0', name: 'Mode' }],
        variableIds: [],
        renameMode: function (id, nm) { this.modes[0].name = nm; },
      };
      c.remove = function () {
        const i = collections.indexOf(c);
        if (i >= 0) collections.splice(i, 1);
      };
      collections.push(c);
      return c;
    },
    createVariable(name, coll, type) {
      const v = {
        id: 'var:' + name,
        name: name,
        resolvedType: type,
        variableCollectionId: coll.id,
        scopes: [],
        setValueForMode: function () {},
        setVariableCodeSyntax: function () {},
      };
      coll.variableIds.push(v.id);
      return v;
    },
    setBoundVariableForPaint(paint, field, v) {
      if (!v) fail('setBoundVariableForPaint 收到空变量');
      const next = Object.assign({}, paint);
      next.boundVariables = {};
      next.boundVariables[field] = v.id;
      return next;
    },
  },
};

const src = fs.readFileSync(path.join(__dirname, 'code.js'), 'utf8');

const messages = [];
figma.ui = {
  postMessage: function (m) {
    messages.push(m);
    if (m.type === 'error') fail('运行时错误：' + m.message + '\n' + (m.stack || ''));
  },
};

const sandbox = { figma: figma, __html__: '<html></html>', console: console };
let ctx = vm.createContext(sandbox);

/* 先造一个「Figma 新建文件的初始状态」：一个空页 + 一个假用户页。 */
figma.root.children.push(new FakePage('Page 1'));
const userPage = new FakePage('我的草稿');
/* 直接塞 _children，不走 appendChild —— 否则会把 _loaded 置 true。
   真实场景里用户页在插件启动时**不是当前页**，也就是「未加载」状态：
   children 读出来是空数组。这正是那个误删 bug 的触发条件。 */
userPage._children.push(new FakeRect());
userPage._loaded = false;
figma.root.children.push(userPage);
/* 用户页后面再放一个空页：否则「最后一页不能删」的保护会替 bug 兜底，
   顺序错误就暴露不出来。 */
figma.root.children.push(new FakePage('Page 3'));
figma.currentPage = figma.root.children[0];
figma.root.children[0]._loaded = true;

try {
  vm.runInContext(src, ctx, { filename: 'code.js' });
} catch (e) {
  fail('脚本抛错：' + e.message + '\n' + e.stack);
}

/* ---- 重跑：同一份脚本再跑一次，模拟「改一行再跑一遍」 ---- */
setTimeout(function () {
  const before = figma.root.children.length;
  messages.length = 0;
  /* 真实 Figma 每次运行都是全新上下文；同一个 vm 里重跑会撞 const 重复声明。
     所以这里换一个干净上下文，但复用同一个假 figma 对象 —— 文件状态延续。 */
  ctx = vm.createContext({ figma: figma, __html__: '<html></html>', console: console });
  try {
    vm.runInContext(src, ctx, { filename: 'code.js (rerun)' });
  } catch (e) {
    fail('重跑抛错：' + e.message + '\n' + e.stack);
  }
  setTimeout(function () {
    const pages = figma.root.children.map(function (p) { return p.name + '(' + p.children.length + ')'; });
    console.log('');
    console.log('  重跑检查');
    console.log('    页面数 重跑前 ' + before + ' → 重跑后 ' + figma.root.children.length);
    console.log('    页面    ' + pages.join('  '));
    if (figma.root.children.length !== 6) {
      fail('重跑后页面数应为 6（5 个产出页 + 1 个用户页），实际 ' + figma.root.children.length);
    }
    if (figma.root.children.indexOf(userPage) === -1) {
      fail('用户自己的页面被删掉了');
    }
    if (!userPage.children.length) {
      fail('用户页里的内容被清空了');
    }
    const names = figma.root.children.map(function (p) { return p.name; });
    ['封面 Cover', '基础 Foundations', '组件 Components', '界面 Screens', '场边与分享'].forEach(function (n) {
      if (names.indexOf(n) === -1) fail('缺少产出页：' + n);
    });
    if (collections.length !== 3) {
      fail('重跑后变量集合应仍为 3 个，实际 ' + collections.length);
    }
    if (effectStyles.length !== 6) {
      fail('重跑后效果样式应仍为 6 个，实际 ' + effectStyles.length);
    }
    if (textStyles.length !== 12) {
      fail('重跑后文字样式应仍为 12 个，实际 ' + textStyles.length);
    }
    report();
  }, 3000);
}, 3000);

function report() {
  const done = messages.find(function (m) { return m.type === 'done'; });
  const progress = messages.filter(function (m) { return m.type === 'progress'; });

  console.log('');
  console.log('  羽毛球计分板 · Figma 插件冒烟测试');
  console.log('  ' + '='.repeat(46));
  console.log('  进度消息   ' + progress.length + ' 条');
  if (progress.length) console.log('  最后一条   ' + progress[progress.length - 1].text);
  console.log('  节点统计   帧 ' + STATS.frames + ' / 文本 ' + STATS.texts +
    ' / 矩形 ' + STATS.rects + ' / 圆 ' + STATS.ellipses);
  console.log('  已加载字体 ' + Array.from(loadedFonts).sort().join(', '));
  console.log('');

  if (done) {
    console.log('  OK 完成：' + String(done.summary).replace(/\n/g, '\n    '));
    if (done.warnings && done.warnings.length) {
      console.log('');
      console.log('  提醒 ' + done.warnings.length + ' 条：');
      done.warnings.forEach(function (w) { console.log('    - ' + w); });
    }
  } else {
    console.log('  FAIL 没有收到 done 消息');
  }

  console.log('');
  if (ERRORS.length) {
    const uniq = Array.from(new Set(ERRORS));
    console.log('  FAIL 发现 ' + uniq.length + ' 类问题：');
    uniq.slice(0, 40).forEach(function (e) { console.log('    - ' + e); });
    if (uniq.length > 40) console.log('    ... 还有 ' + (uniq.length - 40) + ' 条');
    process.exitCode = 1;
  } else {
    console.log('  PASS 无问题');
  }
  console.log('');
}
