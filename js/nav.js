/* ================================================================
   nav.js — 路由 / Tab Bar / 分段控件 / 弹层栈 / 事件委托派发
   取代旧版 switchScreen()（旧文件里从未定义，导致快捷操作直接报错）。
   所有交互统一走 data-act 属性 + 一个全局委托监听器，
   不再使用 inline onclick（解决非 button 元素不可聚焦的问题）。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    /* ---------- 路由表 ---------- */
    /* icon 字段是 js/icons.js 里的线性 SVG 图标名，不再是 emoji */
    var TABS = [
        { id: 'score', label: '记分', icon: 'shuttle' },
        { id: 'match', label: '对战', icon: 'swords' },
        { id: 'data', label: '数据', icon: 'chart' },
        { id: 'me', label: '我的', icon: 'users' }
    ];

    /* 每个 Tab 的二级页；sub 为空串表示主视图 */
    var SUB_PANELS = {
        score: [],
        match: [
            { id: 'grouping', label: '智能分组' },
            { id: 'expense', label: '费用分摊' }
        ],
        data: [
            { id: 'history', label: '历史' },
            { id: 'leaderboard', label: '排行榜' },
            { id: 'ability', label: '能力分析' },
            { id: 'achievements', label: '成就' }
        ],
        me: []
    };

    var DEFAULT_SUB = {
        score: '',
        match: 'grouping',
        data: 'history',
        me: ''
    };

    /* "我的" 页下的二级子页（设置 / 头像 / 备份 / 关于）*/
    var ME_SUBS = [
        { id: 'settings', label: '设置', icon: 'sliders', sub: '比赛规则与偏好' },
        { id: 'avatars', label: '头像管理', icon: 'users', sub: '为球员绑定专属头像' },
        { id: 'backup', label: '数据备份', icon: 'download', sub: '导出 / 恢复 / 清空' },
        { id: 'about', label: '关于', icon: 'info', sub: '版本与说明' }
    ];

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $all(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }
    function byId(id) { return document.getElementById(id); }

    /* ---------- 路由 ---------- */
    function go(tab, sub) {
        if (!TABS.some(function (t) { return t.id === tab; })) tab = 'score';
        if (sub === undefined || sub === null || sub === '') sub = DEFAULT_SUB[tab] || '';
        /* sub 合法性：不在该 Tab 的二级页清单里就回落到默认二级页。
           否则 #tab=data&sub=typo 会留下一个谁都匹配不上的半状态：
           route.sub 是脏值、分段控件无高亮、顶栏标题只剩 Tab 名、hash 里也带着垃圾。 */
        if (sub) {
            var validSubs = (SUB_PANELS[tab] || []).concat(tab === 'me' ? ME_SUBS : []);
            if (!validSubs.some(function (x) { return x.id === sub; })) sub = DEFAULT_SUB[tab] || '';
        }
        App.state.route.tab = tab;
        App.state.route.sub = sub;

        /* 主面板 */
        $all('.tab-panel').forEach(function (p) {
            p.classList.toggle('active', p.getAttribute('data-tab') === tab);
        });

        /* Tab Bar 高亮 */
        $all('.tabbar-item').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tab') === tab);
            b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab ? 'true' : 'false');
        });

        /* 二级分段控件：只处理 data-for 指向某个 Tab 的（排行榜自己的分段是静态 markup）*/
        $all('.segmented').forEach(function (seg) {
            var owner = seg.getAttribute('data-for');
            if (!TABS.some(function (t) { return t.id === owner; })) return;
            var show = (owner === tab);
            seg.classList.toggle('hidden', !show);
            $all('.segmented-item', seg).forEach(function (it) {
                it.classList.toggle('active', it.getAttribute('data-sub') === sub);
            });
        });

        /* 二级面板 */
        $all('.sub-panel').forEach(function (p) {
            var owner = p.getAttribute('data-tab');
            var match = (owner === tab && p.getAttribute('data-sub') === sub);
            p.classList.toggle('active', match);
            p.classList.toggle('hidden', !match);
        });

        /* "我的" 页的子页面切换 */
        if (tab === 'me') {
            renderMe(sub);
        }

        /* 底部 Dock 只在记分主视图出现 */
        var dock = byId('dock');
        if (dock) {
            var on = (tab === 'score');
            dock.hidden = !on;
            document.body.classList.toggle('dock-on', on);
        }

        /* 顶栏标题 */
        var titleEl = byId('appbar-title');
        if (titleEl) {
            var t = TABS.filter(function (x) { return x.id === tab; })[0];
            var base = t ? t.label : '';
            var subDef = (SUB_PANELS[tab] || []).filter(function (s) { return s.id === sub; })[0];
            var meDef = ME_SUBS.filter(function (s) { return s.id === sub; })[0];
            var extra = subDef ? subDef.label : (meDef ? meDef.label : '');
            titleEl.textContent = extra ? (base + ' · ' + extra) : base;
        }

        /* 切页时滚回顶部，避免停留在上一页的滚动位置 */
        var scroller = byId('scroller') || window;
        if (scroller === window) window.scrollTo(0, 0);
        else scroller.scrollTop = 0;

        /* 页面钩子：进入某页时按需刷新数据 */
        if (tab === 'data' && App.stats && App.stats.onEnter) App.stats.onEnter(sub);
        if (tab === 'match' && App.expense && App.expense.onEnter) App.expense.onEnter(sub);
        if (tab === 'match' && App.grouping && App.grouping.onEnter) App.grouping.onEnter(sub);
        if (tab === 'me' && App.settings && App.settings.onEnter) App.settings.onEnter(sub);

        writeHash(tab, sub);

        document.dispatchEvent(new CustomEvent('app:navigate', {
            detail: { tab: tab, sub: sub }
        }));
    }

    /* ---------- URL hash 同步 ----------
       原来 nav.go() 只改内存路由，从不碰 location.hash，后果是：
       1) 在「数据 › 排行榜」刷新一下又被打回记分页，当前视图丢失；
       2) 手动改地址栏 hash / 点站内 hash 链接毫无反应；
       3) 安卓物理返回键直接退出应用，连打开中的弹层都关不掉。
       这里把路由写进 hash，并接管 popstate / hashchange。 */
    var firstNav = true;
    var suppressHashWrite = false;

    function hashOf(tab, sub) {
        var h = '#tab=' + encodeURIComponent(tab);
        if (sub) h += '&sub=' + encodeURIComponent(sub);
        return h;
    }

    function readHash() {
        var out = {};
        var h = (location.hash || '').replace(/^#/, '');
        h.split('&').forEach(function (kv) {
            var i = kv.indexOf('=');
            if (i < 1) return;
            var k = kv.slice(0, i), v = kv.slice(i + 1);
            try { out[decodeURIComponent(k)] = decodeURIComponent(v); } catch (err) { out[k] = v; }
        });
        return out;
    }

    function writeHash(tab, sub) {
        if (suppressHashWrite) return;
        var h = hashOf(tab, sub);
        var same = (location.hash === h);
        var st = { tab: tab, sub: sub };
        try {
            /* 首次导航只替换，不新增历史条目，否则一进应用就多一层「返回」 */
            if (firstNav) history.replaceState(st, '', h);
            else if (!same) history.pushState(st, '', h);
        } catch (err) {
            /* file:// 等禁用了 history API 的场景下降级为直接改 hash */
            if (!same) location.hash = h;
        }
        firstNav = false;
    }

    /* 按 hash 路由（不反向写 hash，避免循环）*/
    function applyHash() {
        var t = readHash();
        suppressHashWrite = true;
        go(t.tab || 'score', t.sub);
        suppressHashWrite = false;
    }

    /* 系统返回键 / 地址栏改 hash：有弹层先关弹层，且不消耗这次返回 */
    function onPopState() {
        if (App.state.overlays.length) {
            closeTopOverlay();
            var r = App.state.route;
            try { history.pushState({ tab: r.tab, sub: r.sub }, '', hashOf(r.tab, r.sub)); } catch (err) { /* 忽略 */ }
            return;
        }
        applyHash();
    }

    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', function () {
        /* 弹层打开期间忽略 hash 抖动，避免误关页面 */
        if (App.state.overlays.length) return;
        applyHash();
    });

    function currentTab() { return App.state.route.tab; }

    function readHashTarget() { return readHash(); }
    function currentSub() { return App.state.route.sub; }

    /* ---------- "我的" 子页 ---------- */
    function renderMe(sub) {
        var home = byId('me-home');
        if (!home) return;
        var isSub = !!sub && ME_SUBS.some(function (m) { return m.id === sub; });
        home.classList.toggle('hidden', isSub);
        $all('.me-sub').forEach(function (el) {
            el.classList.toggle('hidden', el.getAttribute('data-me') !== sub);
        });
        var back = byId('me-back');
        if (back) back.classList.toggle('hidden', !isSub);
    }

    /* ---------- Tab Bar 构建 ---------- */
    function buildTabBar() {
        var bar = byId('tabbar');
        if (!bar) return;
        bar.innerHTML = '';
        TABS.forEach(function (t) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'tabbar-item';
            b.setAttribute('data-tab', t.id);
            b.setAttribute('data-act', 'nav:tab');
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', 'false');
            b.innerHTML =
                '<span class="tab-icon ic-box" aria-hidden="true">' + App.icons.icon(t.icon) + '</span>' +
                '<span class="tab-label">' + t.label + '</span>';
            bar.appendChild(b);
        });
    }

    /* ---------- 分段控件构建 ---------- */
    function buildSegmented() {
        $all('.segmented').forEach(function (seg) {
            var owner = seg.getAttribute('data-for');
            /* 只重建 Tab 内二级页导航；其余（如排行榜口径）是静态 markup，保留原样 */
            if (!TABS.some(function (t) { return t.id === owner; })) return;
            var items = SUB_PANELS[owner] || [];
            seg.innerHTML = '';
            items.forEach(function (s) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'segmented-item';
                b.setAttribute('data-sub', s.id);
                b.setAttribute('data-act', 'nav:sub');
                b.textContent = s.label;
                seg.appendChild(b);
            });
        });
    }

    /* ---------- "我的" 导航构建 ---------- */
    function buildMeNav() {
        var box = byId('me-nav');
        if (!box) return;
        box.innerHTML = '';
        ME_SUBS.forEach(function (m) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'me-nav-item';
            b.setAttribute('data-act', 'nav:me');
            b.setAttribute('data-me', m.id);
            b.innerHTML =
                '<span class="ni-icon ic-box" aria-hidden="true">' + App.icons.icon(m.icon) + '</span>' +
                '<span class="ni-main">' +
                '<span class="ni-title">' + m.label + '</span>' +
                '<span class="ni-sub">' + m.sub + '</span>' +
                '</span>' +
                '<span class="ni-arrow" aria-hidden="true">›</span>';
            box.appendChild(b);
        });
    }

    /* ================================================================
       弹层管理
       ================================================================ */
    /* 打开弹层前清场：不管是 sheet 还是 dialog，只要还可见就先关掉。
       旧写法只清理 .sheet-backdrop，而 --z-modal(210) > --z-sheet(200)，
       确认框会一直浮在后来打开的分享卡上面，出现「双层叠住」+
       Esc 关错层。弹层栈本来就是「同时只留一层」的语义。 */
    function closeOtherOverlays(keep) {
        $all('.sheet-backdrop.show, .dialog-backdrop.show').forEach(function (other) {
            if (other === keep) return;
            if (other.classList.contains('sheet-backdrop')) closeSheet(other.id);
            else closeDialog(other.id);
        });
    }

    function openSheet(id) {
        var el = byId(id);
        if (!el) return null;
        /* 同层互斥：打开新 sheet 前关掉其他仍可见的弹层，避免双层叠住导致点不动、Esc 失灵 */
        closeOtherOverlays(el);
        el.classList.add('show');
        el.removeAttribute('hidden');
        el.setAttribute('aria-hidden', 'false');
        pushOverlay(el, 'sheet');
        var focusable = el.querySelector('[data-autofocus]') ||
            el.querySelector('button, [href], input, select, textarea');
        if (focusable) focusable.focus();
        return el;
    }

    function closeSheet(id) {
        var el = byId(id);
        if (!el) return;
        el.classList.remove('show');
        el.setAttribute('aria-hidden', 'true');
        popOverlay(el);
        restoreFocus();
        /* 等动画结束再从渲染树隐藏，避免闪烁 */
        window.setTimeout(function () {
            if (!el.classList.contains('show')) el.setAttribute('hidden', '');
        }, 340);
    }

    function openDialog(id) {
        var el = byId(id);
        if (!el) return null;
        /* 与 openSheet 对称：dialog 打开时也清掉其他可见弹层 */
        closeOtherOverlays(el);
        el.classList.add('show');
        el.removeAttribute('hidden');
        el.setAttribute('aria-hidden', 'false');
        pushOverlay(el, 'dialog');
        /* 必须把焦点移进弹层：没有输入框的对话框（确认框 / 快捷操作）
           原来根本不聚焦，键盘焦点留在背景的触发按钮上，
           用户按 Tab 会直接走进被遮罩盖住的页面。
           兜底选第一个可见可聚焦项 —— 确认框里那是「取消」，
           破坏性操作不当默认焦点，正是想要的结果。 */
        var input = el.querySelector('input, textarea');
        var target = input || el.querySelector('[data-autofocus]') || visibleFocusables(el)[0];
        if (target) {
            target.focus();
            if (input && input.select) input.select();
        }
        return el;
    }

    function closeDialog(id) {
        var el = byId(id);
        if (!el) return;
        el.classList.remove('show');
        el.setAttribute('aria-hidden', 'true');
        popOverlay(el);
        restoreFocus();
        window.setTimeout(function () {
            if (!el.classList.contains('show')) el.setAttribute('hidden', '');
        }, 240);
    }

    /* 打开第一层弹层时记下触发元素，全部关掉后把焦点还回去。
       否则键盘用户点完「取消」焦点掉到 <body>，得从头 Tab 一遍。 */
    var lastFocus = null;

    function pushOverlay(el, kind) {
        if (!App.state.overlays.length) {
            var a = document.activeElement;
            lastFocus = (a && a !== document.body && typeof a.focus === 'function') ? a : null;
        }
        App.state.overlays.push({ el: el, kind: kind });
    }

    function restoreFocus() {
        if (App.state.overlays.length || !lastFocus) return;
        var el = lastFocus;
        lastFocus = null;
        try { el.focus(); } catch (err) { /* 元素可能已离开文档 */ }
    }

    function popOverlay(el) {
        var list = App.state.overlays;
        for (var i = list.length - 1; i >= 0; i--) {
            if (list[i].el === el) { list.splice(i, 1); return; }
        }
    }

    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    /* 只收真正可见的：隐藏项拿不到 client rects */
    function visibleFocusables(root) {
        return $all(FOCUSABLE, root).filter(function (el) {
            return el.getClientRects().length > 0;
        });
    }

    function closeTopOverlay() {
        var list = App.state.overlays;
        if (!list.length) return false;
        var top = list[list.length - 1];
        if (top.kind === 'sheet') closeSheet(top.el.id);
        else closeDialog(top.el.id);
        return true;
    }

    function closeAllOverlays() {
        var list = App.state.overlays.slice();
        list.forEach(function (o) {
            if (o.kind === 'sheet') closeSheet(o.el.id);
            else closeDialog(o.el.id);
        });
    }

    /* ---------- Toast ---------- */
    var toastTimer = null;

    function toast(msg, title) {
        var el = byId('toast');
        if (!el) return;
        var t = byId('toast-title');
        var m = byId('toast-msg');
        if (t) t.textContent = title || '提示';
        if (m) m.textContent = msg || '';
        el.classList.add('show');
        if (toastTimer) window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () {
            el.classList.remove('show');
        }, 2200);
    }

    /* ---------- 读屏播报 ----------
       高光徽章、成就徽章、胜利横幅都是 display:none 的纯视觉提示，
       读屏用户完全感知不到。统一走这个常驻的 live region 补上。
       先清后写，保证同一句话连续出现两次也能重新播报。 */
    var lastAnnounce = '';
    var announceTimer = null;

    function announce(msg) {
        var el = byId('sr-announce');
        if (!el || !msg) return;
        var text = String(msg);
        if (text === lastAnnounce && el.textContent === text) {
            if (announceTimer) window.clearTimeout(announceTimer);
            el.textContent = '';
            announceTimer = window.setTimeout(function () { el.textContent = text; }, 60);
            return;
        }
        lastAnnounce = text;
        el.textContent = text;
    }

    /* ================================================================
       事件委托：data-act 派发
       格式 data-act="ns:name"；附加参数从 data-* 读
       ================================================================ */
    var handlers = {};

    function on(action, fn) { handlers[action] = fn; }

    function attr(el, name) { return el.getAttribute('data-' + name); }

    function dispatch(el) {
        var act = attr(el, 'act');
        if (!act) return false;
        var fn = handlers[act];
        if (typeof fn !== 'function') return false;
        fn(el, {
            act: act,
            el: el,
            /* 常用附加参数 */
            id: attr(el, 'id'),
            tab: attr(el, 'tab'),
            sub: attr(el, 'sub'),
            me: attr(el, 'me'),
            team: attr(el, 'team'),
            mode: attr(el, 'mode'),
            value: attr(el, 'value'),
            index: attr(el, 'index'),
            key: attr(el, 'key')
        });
        return true;
    }

    function initDelegation() {
        /* click：button / [data-act] 元素 */
        document.addEventListener('click', function (ev) {
            var target = ev.target;
            if (!target || !target.closest) return;
            var el = target.closest('[data-act]');
            if (!el) return;
            if (el.hasAttribute('disabled')) return;
            /* select 由 change 事件负责，click 会重复派发 */
            if (el.tagName === 'SELECT') return;
            /* 让 input / textarea 的点击正常落到自身 */
            if (el !== target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' || target.tagName === 'LABEL')) {
                return;
            }
            if (dispatch(el)) ev.preventDefault();
        });

        /* change：下拉 / 开关 / 数字输入 */
        document.addEventListener('change', function (ev) {
            var target = ev.target;
            if (!target || !target.getAttribute) return;
            var act = target.getAttribute('data-act');
            if (!act) return;
            var fn = handlers[act];
            if (typeof fn === 'function') {
                fn(target, { act: act, el: target, value: target.value, checked: target.checked });
            }
        });

        /* input：实时联动（技能输入等）*/
        document.addEventListener('input', function (ev) {
            var target = ev.target;
            if (!target || !target.getAttribute) return;
            var act = target.getAttribute('data-act-input');
            if (!act) return;
            var fn = handlers[act];
            if (typeof fn === 'function') fn(target, { el: target, value: target.value });
        });

        /* Esc：关最上层弹层 */
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && closeTopOverlay()) ev.preventDefault();
        });

        /* Tab 焦点陷阱：aria-modal 弹层打开时，Tab 不能跑到背后的页面上。
           没有这一条，键盘用户按几下 Tab 就「穿模」到被遮罩盖住的按钮堆里。 */
        document.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Tab') return;
            var list = App.state.overlays;
            if (!list.length) return;
            var top = list[list.length - 1].el;
            if (!top) return;
            var items = visibleFocusables(top);
            if (!items.length) { ev.preventDefault(); return; }
            /* 焦点不在最上层弹层里（刚打开、或点过遮罩）→ 直接抓回弹层内。
               少这一条，Tab 会一路走到被遮罩盖住的背景按钮上，
               而鼠标用户永远发现不了。 */
            if (!top.contains(ev.target)) {
                ev.preventDefault();
                items[0].focus();
                return;
            }
            var first = items[0], last = items[items.length - 1];
            if (ev.shiftKey) {
                if (ev.target === first || ev.target === top) { ev.preventDefault(); last.focus(); }
            } else if (ev.target === last) {
                ev.preventDefault(); first.focus();
            }
        });

        /* 键盘激活 role=button 的自定义可交互元素 */
        document.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            var t = ev.target;
            if (!t || !t.getAttribute) return;
            if (t.getAttribute('role') !== 'button') return;
            if (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' ||
                t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
            if (dispatch(t)) ev.preventDefault();
        });

        /* 点击遮罩关闭（仅点 backdrop 本身）*/
        document.addEventListener('click', function (ev) {
            var el = ev.target;
            if (!el || !el.classList) return;
            if (el.classList.contains('sheet-backdrop')) closeSheet(el.id);
            if (el.classList.contains('dialog-backdrop')) closeDialog(el.id);
        });
    }

    /* ---------- 启动 ---------- */
    function init() {
        buildTabBar();
        buildSegmented();
        buildMeNav();
        initDelegation();
        on('nav:tab', function (el) { go(el.getAttribute('data-tab')); });
        on('nav:sub', function (el) { go(currentTab(), el.getAttribute('data-sub')); });
        on('nav:me', function (el) { go('me', el.getAttribute('data-me')); });
        on('overlay:close', function (el) {
            var sheet = el.closest('.sheet-backdrop');
            var dlg = el.closest('.dialog-backdrop');
            if (sheet) closeSheet(sheet.id);
            else if (dlg) closeDialog(dlg.id);
        });
    }

    App.nav = {
        TABS: TABS,
        SUB_PANELS: SUB_PANELS,
        ME_SUBS: ME_SUBS,
        DEFAULT_SUB: DEFAULT_SUB,
        init: init,
        go: go,
        currentTab: currentTab,
        currentSub: currentSub,
        renderMe: renderMe,
        openSheet: openSheet,
        closeSheet: closeSheet,
        openDialog: openDialog,
        closeDialog: closeDialog,
        closeTopOverlay: closeTopOverlay,
        closeAllOverlays: closeAllOverlays,
        toast: toast,
        announce: announce,
        on: on,
        dispatch: dispatch,
        $: $,
        $all: $all,
        byId: byId
    };
})(window.App);
