/* ================================================================
   app.js — 启动引导
   加载顺序：vendor → store → state → effects/ui/nav → 功能模块 → app
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    function boot() {
        var nav = App.nav;

        /* 1. 外壳与路由 */
        nav.init();

        /* 2. 通用 UI */
        App.ui.init();
        App.settings.init();
        App.avatars.init();
        App.match.init();
        App.grouping.init();
        App.expense.init();
        App.stats.init();
        App.achievements.init();
        App.share.init();

        /* 3. 恢复上次比赛状态（B2/B3 已在 match.loadMatchState 内修复）*/
        App.match.loadMatchState();

        /* 4. 首次交互解锁音频（浏览器自动播放策略）*/
        document.addEventListener('pointerdown', function once() {
            App.effects.unlockAudio();
            document.removeEventListener('pointerdown', once);
        });

        /* 5. 进入默认 Tab（支持 manifest 快捷方式：#tab=match&sub=expense）*/
        nav.go(readHashTarget().tab || 'score', readHashTarget().sub);

        /* 6. 新手引导 */
        if (!App.state.hasSeenOnboarding) {
            App.ui.showOnboarding();
        }

        /* 7. Service Worker（仅 http(s) 下注册，file:// 双击打开时跳过）*/
        registerSW();

        document.documentElement.classList.add('app-ready');
    }

    /* 从 location.hash 解析初始路由：?tab=xxx&sub=yyy（manifest shortcuts 用）*/
    function readHashTarget() {
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

    function registerSW() {
        if (!('serviceWorker' in navigator)) return;
        if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('sw.js').catch(function () {
                /* 注册失败不影响正常使用 */
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    App.boot = boot;
})(window.App);
