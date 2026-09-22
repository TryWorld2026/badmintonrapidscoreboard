/* ================================================================
   icons.js — 线性 SVG 图标库（VOLT TRUCK 广播图形语言）
   全部图标 24×24 viewBox、1.6px 描边、圆角线帽，跟随 currentColor。
   用 width:1em;height:1em 缩放，所以字号即图标号。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    /* 描边型：fill=none stroke=currentColor */
    function S(inner) { return inner; }
    /* 实心型：fill=currentColor stroke=none */
    function F(inner) { return '<g fill="currentColor" stroke="none">' + inner + '</g>'; }

    var REG = {
        /* ---- 品牌 ---- */
        shuttle: S('<circle cx="12" cy="19.4" r="2.4"/><path d="M10 17.2 12 3l2 14.2"/><path d="M10.7 12.3h2.6"/>'),
        racket: S('<ellipse cx="11" cy="8.6" rx="5.4" ry="6.4"/><path d="M14.2 13.4 19.6 20.4"/><path d="M15.9 12.1 18.1 14.3"/><path d="M8.4 5.6h5.2"/><path d="M8.4 8.6h5.2"/><path d="M8.4 11.6h5.2"/>'),
        court: S('<rect x="3.2" y="4.5" width="17.6" height="15" rx="1.2"/><path d="M12 4.5v15"/><path d="M3.2 12.2h3.4"/><path d="M17.4 12.2h3.4"/><path d="M7.6 4.5v3"/><path d="M16.4 4.5v3"/><path d="M7.6 16.5v3"/><path d="M16.4 16.5v3"/>'),

        /* ---- 导航 / 功能 ---- */
        trophy: S('<path d="M7.2 4h9.6v5.2a4.8 4.8 0 0 1-9.6 0z"/><path d="M7.2 5.2H4.4v1.4a3.6 3.6 0 0 0 3.6 3.6"/><path d="M16.8 5.2h2.8v1.4a3.6 3.6 0 0 1-3.6 3.6"/><path d="M12 14v3.2"/><path d="M8.4 20.6h7.2"/><path d="M10 17.2h4v3.4h-4z"/>'),
        chart: S('<path d="M4 19.6h16"/><path d="M7.4 19.6v-5.8"/><path d="M12 19.6V7.6"/><path d="M16.6 19.6v-9"/>'),
        trend: S('<path d="M4 19.6h16"/><path d="M5.8 15.4 10 10.8l3.2 2.6 5-6"/>'),
        pie: S('<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8V12h8.2"/>'),
        users: S('<circle cx="9.2" cy="8.4" r="3.4"/><path d="M3.2 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4"/><path d="M15.8 5.4a3.4 3.4 0 0 1 0 6.4"/><path d="M17.4 14.9c2 .7 3.4 2.5 3.4 5.1"/>'),
        swords: S('<path d="M3.4 20.6 13 11"/><path d="M20.6 20.6 11 11"/><path d="M11 3.4 20.6 13"/><path d="M13 3.4 3.4 13"/><circle cx="12" cy="12" r="1.9"/>'),
        scale: S('<path d="M12 4v15.4"/><path d="M7.4 19.8h9.2"/><path d="M3.6 8.8h16.8"/><path d="M3.6 8.8 1.9 13.4h3.4z"/><path d="M20.4 8.8l-1.7 4.6h3.4z"/>'),
        dice: S('<rect x="4" y="4" width="16" height="16" rx="3.4"/><circle cx="9" cy="9" r="1.25" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.25" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.25" fill="currentColor" stroke="none"/>'),
        rotate: S('<path d="M20.2 12a8.2 8.2 0 1 1-2.6-6"/><path d="M20.4 3.6v4.2h-4.2"/>'),
        target: S('<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>'),
        bolt: F('<path d="M13.8 2.6 6.2 13.4h4.4L9.8 21.4l7.8-11h-4.4z"/>'),
        flame: S('<path d="M12 21.2c-3.3 0-6-2.5-6-5.9 0-2.4 1.3-4.4 2.9-6 .5 1.2 1.5 2 2.4 2.2-.4-2.3.3-4.7 2-6.7.8 1.5 2.4 3.1 3.7 4.7 1.3 1.7 2 3.2 2 5.8 0 3.4-2.7 5.9-6 5.9z"/>'),
        pencil: S('<path d="M4 20h4.2L19.4 8.8l-4.2-4.2L4 15.8z"/><path d="M14.4 5.6 18.4 9.6"/>'),
        divide: S('<path d="M5 12h14"/><circle cx="12" cy="6.4" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="17.6" r="1.5" fill="currentColor" stroke="none"/>'),
        yuan: S('<path d="M7 3.6 12 10l5-6.4"/><path d="M12 10v10.4"/><path d="M7.4 12.8h9.2"/><path d="M7.4 16.2h9.2"/>'),
        clock: S('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.1 2"/>'),
        timer: S('<circle cx="12" cy="13.4" r="7.4"/><path d="M12 10v3.6l2.4 1.5"/><path d="M9.4 2.8h5.2"/><path d="M12 2.8v3.2"/>'),
        medal: S('<circle cx="12" cy="14.6" r="5.4"/><path d="M8.6 9.6 6.2 3.2h11.6l-2.4 6.4"/><path d="M12 12.2l1.1 2.2 2.4.4-1.8 1.7.4 2.4-2.1-1.1-2.1 1.1.4-2.4-1.8-1.7 2.4-.4z"/>'),
        crown: S('<path d="M3.6 17.8 2.6 8l5 3.6L12 5l4.4 6.6L21.4 8l-1 9.8z"/><path d="M5.2 20.6h13.6"/>'),
        star: S('<path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.2 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.2 5.9-.8z"/>'),
        flag: S('<path d="M6.2 21V3.6"/><path d="M6.2 4.2h11.2l-2.1 3.6 2.1 3.6H6.2"/>'),
        rocket: S('<path d="M12 2.8c3.4 2.2 5.2 5.8 5.2 9.6l-2.6 3.4H9.4L6.8 12.4c0-3.8 1.8-7.4 5.2-9.6z"/><circle cx="12" cy="10" r="1.9"/><path d="M9.4 15.6 7.2 20.4l3.2-1.2"/><path d="M14.6 15.6 16.8 20.4l-3.2-1.2"/><path d="M12 6.4V4.2"/>'),
        spark: S('<path d="M12 3.2l1.9 5.1 5.1 1.9-5.1 1.9L12 17.2l-1.9-5.1L5 10.2l5.1-1.9z"/><path d="M18.6 16.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>'),

        /* ---- 操作 ---- */
        share: S('<path d="M12 15.2V3.8"/><path d="M8 7.6 12 3.6l4 4"/><path d="M5 13.6v5.6h14v-5.6"/>'),
        download: S('<path d="M12 3.8v11.2"/><path d="M8 10.8 12 14.8l4-4"/><path d="M4.8 20.2h14.4"/>'),
        upload: S('<path d="M12 15.2V4"/><path d="M8 8 12 4l4 4"/><path d="M4.8 20.2h14.4"/>'),
        copy: S('<rect x="8.6" y="8.6" width="11" height="11" rx="2.4"/><path d="M15.4 5.4v-1a2 2 0 0 0-2-2H6.4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h1"/>'),
        trash: S('<path d="M4.4 6.8h15.2"/><path d="M9.6 6.8V4.2h4.8v2.6"/><path d="M6.6 6.8 7.6 20h8.8l1-13.2"/><path d="M10.4 10.4v6"/><path d="M13.6 10.4v6"/>'),
        undo: S('<path d="M3.8 10h12.2a4.6 4.6 0 0 1 0 9.2H9.2"/><path d="M7.4 5.6 3 10l4.4 4.4"/>'),
        refresh: S('<path d="M20.2 12a8.2 8.2 0 1 1-2.6-6"/><path d="M20.4 3.6v4.2h-4.2"/>'),
        plus: S('<path d="M12 5.2v13.6"/><path d="M5.2 12h13.6"/>'),
        close: S('<path d="M6.2 6.2 17.8 17.8"/><path d="M17.8 6.2 6.2 17.8"/>'),
        check: S('<path d="M5 12.6 10 17.6 19.2 6.8"/>'),
        play: F('<path d="M8 5.4 18.6 12 8 18.6z"/>'),
        pause: S('<path d="M9.4 5.4v13.2"/><path d="M14.6 5.4v13.2"/>'),
        sliders: S('<path d="M4 7.2h3.6M13.4 7.2H20"/><path d="M4 12h9.6M19.4 12H20"/><path d="M4 16.8h6.6M16.4 16.8H20"/><circle cx="9.6" cy="7.2" r="2.2"/><circle cx="15.6" cy="12" r="2.2"/><circle cx="12.6" cy="16.8" r="2.2"/>'),
        calendar: S('<rect x="4" y="5.6" width="16" height="14.8" rx="2.2"/><path d="M4 10.2h16"/><path d="M8.4 3.4v4"/><path d="M15.6 3.4v4"/>'),
        list: S('<path d="M6.4 3.6h11.2v16.8l-1.9-1.2-1.9 1.2-1.9-1.2-1.9 1.2-1.9-1.2-1.7 1.2z"/><path d="M9.4 8.2h5.2"/><path d="M9.4 12.2h5.2"/>'),
        receipt: S('<path d="M5.4 3.6h13.2v16.8l-2.2-1.3-2.2 1.3-2.2-1.3-2.2 1.3-2.2-1.3-2.2 1.3z"/><path d="M9 8.4h6"/><path d="M9 12.4h6"/><path d="M9 16.2h3.6"/>'),

        /* ---- 状态 / 提示 ---- */
        info: S('<circle cx="12" cy="12" r="8.4"/><path d="M12 11.2v5.4"/><circle cx="12" cy="7.9" r="1.05" fill="currentColor" stroke="none"/>'),
        warning: S('<path d="M12 3.8 21.2 19.6H2.8z"/><path d="M12 9.8v4.6"/><circle cx="12" cy="17.2" r="1.05" fill="currentColor" stroke="none"/>'),
        eye: S('<path d="M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 17.8 18.2 12 18.2 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="3"/>'),
        lock: S('<rect x="5" y="10.6" width="14" height="9.8" rx="2.4"/><path d="M8.4 10.6V7.8a3.6 3.6 0 0 1 7.2 0v2.8"/>'),

        /* ---- 天气（未配置 Key 时隐藏，保留代码路径）---- */
        thermo: S('<path d="M10.2 3.8a1.9 1.9 0 0 1 3.8 0v9.6a4.1 4.1 0 1 1-3.8 0z"/><circle cx="12.1" cy="17.4" r="1.7" fill="currentColor" stroke="none"/>'),
        cloud: S('<path d="M7.4 18.4h9.8a3.8 3.8 0 0 0 .3-7.6 5.6 5.6 0 0 0-10.9-1.3 3.9 3.9 0 0 0 .8 8.9z"/>'),
        sun: S('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4"/><path d="M12 18.8v2.4"/><path d="M2.8 12h2.4"/><path d="M18.8 12h2.4"/><path d="M5.5 5.5 7.2 7.2"/><path d="M16.8 16.8l1.7 1.7"/><path d="M18.5 5.5 16.8 7.2"/><path d="M7.2 16.8 5.5 18.5"/>'),
        wind: S('<path d="M3.4 8.6h11a3 3 0 1 0-3-3"/><path d="M3.4 15.4h13.2a3 3 0 1 1-3 3"/>'),
        pin: S('<path d="M12 21.4S5.2 15.2 5.2 10.2a6.8 6.8 0 0 1 13.6 0c0 5-6.8 11.2-6.8 11.2z"/><circle cx="12" cy="10.2" r="2.6"/>')
    };

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * 生成图标 SVG。
     * @param {string} name 图标名
     * @param {string} [cls] 附加 class
     * @param {string} [style] 附加 style
     */
    function icon(name, cls, style) {
        var inner = REG[name];
        if (!inner) inner = REG.info;
        return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
            'aria-hidden="true" focusable="false"' + (style ? ' style="' + esc(style) + '"' : '') + '>' +
            inner + '</svg>';
    }

    /* 直接取内部 path（用于需要嵌进更大 SVG 的场景）*/
    function raw(name) { return REG[name] || REG.info; }

    /**
     * 把静态 HTML 里的 <span data-icon="name"> 占位 hydrated 成真 SVG。
     * 经典 <script> 无框架，所以用声明式占位符而非模板渲染。
     * @param {ParentNode} [root] 默认 document
     */
    function hydrate(root) {
        var host = root || document;
        var nodes = host.querySelectorAll('[data-icon]');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var name = el.getAttribute('data-icon');
            if (!name || !REG[name]) continue;
            if (el.getAttribute('aria-hidden') !== 'true') el.setAttribute('aria-hidden', 'true');
            el.innerHTML = icon(name);
            el.removeAttribute('data-icon');
            el.setAttribute('data-icon-done', name);
        }
        return nodes.length;
    }

    App.icons = {
        icon: icon,
        raw: raw,
        hydrate: hydrate,
        has: function (n) { return Object.prototype.hasOwnProperty.call(REG, n); },
        names: Object.keys(REG)
    };
})(window.App);
