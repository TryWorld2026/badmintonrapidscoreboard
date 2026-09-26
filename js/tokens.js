/* ================================================================
   tokens.js — CSS 自定义属性 → JS 的唯一出口
   ----------------------------------------------------------------
   为什么需要这个文件：
   canvas 绘图（Chart.js）和 DOM style 确实吃不到 var(--*)，
   但完全可以在运行时用 getComputedStyle 把「已解析好的值」读出来
   再传进去。此前 charts.js / effects.js 各自手抄了一份色值，
   视觉重构后 charts.js 抄的还是旧版浅色配色（#1B4DFF / 白边），
   在 #111721 深色卡片上直接花掉——根因就是「JS 侧没有读令牌的通道」。

   红线：JS 里禁止再出现裸 hex / rgba 业务色，一律走 App.tokens。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    /* 读单个令牌。样式表未就绪时用 fallback 兜底，绝不返回空串把调用方坑死。 */
    function get(name, fallback) {
        try {
            var v = getComputedStyle(document.documentElement).getPropertyValue(name);
            v = v ? String(v).trim() : '';
            return v || (fallback || '');
        } catch (err) {
            return fallback || '';
        }
    }

    /* #RGB / #RRGGBB → rgba()。Canvas 的填充色需要带 alpha 的写法，
       而令牌层只存实色，所以在这里统一换算，避免调用方各写一份。 */
    function alpha(color, a) {
        var c = String(color || '').trim();
        var hex = c.charAt(0) === '#' ? c.slice(1) : '';
        if (hex.length === 3) {
            hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
        }
        if (hex.length !== 6) return c;          /* 已经是 rgba()/color() 等，原样返回 */
        var n = parseInt(hex, 16);
        if (!isFinite(n)) return c;
        var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
    }

    /* 一次取齐一组语义色，调用方解构使用 */
    function palette(map) {
        var out = {};
        Object.keys(map).forEach(function (k) {
            out[k] = get(map[k][0], map[k][1]);
        });
        return out;
    }

    App.tokens = {
        get: get,
        alpha: alpha,
        palette: palette
    };
})(window.App);
