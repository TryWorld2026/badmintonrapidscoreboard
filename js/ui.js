/* ================================================================
   ui.js — 通用 UI：输入对话框 / 确认对话框 / 高光徽章 / 新手引导 / 天气
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var fx = App.effects;

    /* ================================================================
       输入对话框（替代 prompt，可在弹层内键盘操作）
       ================================================================ */
    var inputCb = null;

    function showInputDialog(opts) {
        opts = opts || {};
        var el = nav.byId('input-dialog');
        if (!el) return;
        var title = nav.byId('input-dialog-title');
        var label = nav.byId('input-dialog-label');
        var input = nav.byId('input-dialog-input');
        var hint = nav.byId('input-dialog-hint');

        if (title) title.textContent = opts.title || '请输入';
        if (label) label.textContent = opts.label || '';
        if (input) {
            input.value = opts.value !== undefined && opts.value !== null ? String(opts.value) : '';
            input.placeholder = opts.placeholder || '';
            input.setAttribute('inputmode', opts.inputmode || 'text');
        }
        if (hint) {
            hint.textContent = opts.hint || '';
            hint.classList.toggle('hidden', !opts.hint);
        }
        inputCb = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
        nav.openDialog('input-dialog');
        /* Enter 直接确认；Esc 交由 nav 的 Esc 逻辑关弹层 */
        if (input) {
            input.onkeydown = function (ev) {
                if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); confirmInput(); }
            };
        }
    }

    function confirmInput() {
        var input = nav.byId('input-dialog-input');
        var val = input ? input.value : '';
        var cb = inputCb;
        hideInputDialog();
        if (cb) cb(val);
    }

    function hideInputDialog() {
        inputCb = null;
        var input = nav.byId('input-dialog-input');
        if (input) input.onkeydown = null;
        nav.closeDialog('input-dialog');
    }

    /* ================================================================
       确认对话框（替代 confirm）
       ================================================================ */
    var confirmCb = null;

    function showConfirm(opts) {
        opts = opts || {};
        var el = nav.byId('confirm-dialog');
        if (!el) return;
        var title = nav.byId('confirm-title');
        var msg = nav.byId('confirm-msg');
        var ok = nav.byId('confirm-ok');
        if (title) title.textContent = opts.title || '确认操作';
        if (msg) msg.textContent = opts.message || '';
        if (ok) {
            ok.textContent = opts.okText || '确定';
            ok.setAttribute('data-act', '');
            ok.setAttribute('data-act', 'ui:confirm-ok');
        }
        ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
        confirmCb = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
        nav.openDialog('confirm-dialog');
    }

    function runConfirm() {
        var cb = confirmCb;
        hideConfirm();
        if (cb) cb();
    }

    function hideConfirm() {
        confirmCb = null;
        nav.closeDialog('confirm-dialog');
    }

    /* ================================================================
       高光徽章（加分赛 / 赛点 / 逆转）
       ================================================================ */
    var hlTimer = null;

    /* icon 参数是 js/icons.js 的图标名（不再是 emoji）*/
    function showHighlight(icon, title, desc) {
        var el = nav.byId('highlight-badge');
        if (!el) return;
        var i = nav.byId('hl-icon');
        var t = nav.byId('hl-title');
        var d = nav.byId('hl-desc');
        if (i) i.innerHTML = App.icons.icon(icon || 'star');
        if (t) t.textContent = title || '';
        if (d) d.textContent = desc || '';
        /* 赛点 / 加分赛 / 大逆转是关键节点，读屏用户也得知道 */
        nav.announce((title || '') + (desc ? '，' + desc : ''));
        el.classList.remove('show', 'hide');
        el.removeAttribute('hidden');
        void el.offsetWidth;
        el.classList.add('show');
        if (hlTimer) window.clearTimeout(hlTimer);
        hlTimer = window.setTimeout(function () {
            el.classList.remove('show');
            el.classList.add('hide');
            window.setTimeout(function () {
                if (!el.classList.contains('show')) {
                    el.classList.remove('hide');
                    el.setAttribute('hidden', '');
                }
            }, 300);
        }, 2600);
    }

    /* ================================================================
       通知（toast 包装）
       ================================================================ */
    function notify(msg, title) { nav.toast(msg, title); }

    /* ================================================================
       转义（拼接 innerHTML 时统一走这里，避免注入）
       ================================================================ */
    function escapeHtml(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* ================================================================
       剪贴板
       ================================================================ */
    function copyText(text, okMsg) {
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                nav.toast(ok ? (okMsg || '已复制到剪贴板') : '复制失败，请手动选择', ok ? '成功' : '失败');
            } catch (e) {
                nav.toast('复制失败，请手动选择', '失败');
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                nav.toast(okMsg || '已复制到剪贴板', '成功');
            }, fallback);
        } else {
            fallback();
        }
    }

    /* ================================================================
       下载文本 / 图片
       ================================================================ */
    function downloadText(filename, text) {
        try {
            var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            return true;
        } catch (e) {
            nav.toast('导出失败', '错误');
            return false;
        }
    }

    function downloadDataUrl(filename, dataUrl) {
        try {
            var a = document.createElement('a');
            a.href = dataUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return true;
        } catch (e) {
            nav.toast('保存图片失败', '错误');
            return false;
        }
    }

    /* ================================================================
       天气（移入「我的」页，失败静默）
       ================================================================ */
    function initWeather() {
        var box = nav.byId('weather-box');
        if (!box) return;
        /* 未配置 API Key 时不发请求：卡片保持隐藏，控制台无 403 噪音 */
        var key = (App.state && App.state.settings && App.state.settings.weatherKey) || '';
        if (!key) {
            box.classList.add('hidden');
            return;
        }
        var url = 'https://api.seniverse.com/v3/weather/now.json?key=' + encodeURIComponent(key) +
            '&location=ip&language=zh-Hans&unit=c';
        fetch(url)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data || !data.results || !data.results[0]) {
                    box.classList.add('hidden');
                    return;
                }
                var now = data.results[0].now || {};
                var loc = data.results[0].location || {};
                var iconMap = {
                    '0': 'sun', '1': 'sun', '2': 'cloud', '3': 'cloud', '4': 'cloud',
                    '5': 'cloud', '6': 'cloud', '7': 'cloud', '8': 'cloud', '9': 'cloud',
                    '10': 'cloud', '11': 'cloud', '12': 'cloud', '13': 'cloud',
                    '14': 'cloud', '15': 'cloud', '16': 'cloud', '17': 'cloud', '18': 'cloud',
                    '19': 'cloud', '20': 'wind'
                };
                var wi = nav.byId('w-icon');
                var wt = nav.byId('w-temp');
                var wd = nav.byId('w-desc');
                var wc = nav.byId('w-city');
                if (wi) wi.innerHTML = App.icons.icon(iconMap[now.code] || 'thermo');
                if (wt) wt.textContent = (now.temperature || '--') + '°C';
                if (wd) wd.textContent = (now.text || '') + ' · 风速 ' + (now.wind_speed || '--') + ' km/h';
                if (wc) wc.textContent = (loc.name || '本地') + ' · ' + (loc.path || '');
                box.classList.remove('hidden');
            })
            .catch(function () {
                /* 网络失败 / 隐私模式：静默隐藏，不打扰用户 */
                box.classList.add('hidden');
            });
    }

    /* ================================================================
       新手引导（6 页）
       ================================================================ */
    var ONBOARD_PAGES = [
        { icon: 'shuttle', title: '欢迎使用极速计分板', desc: '专为羽毛球散打设计的轻量计分工具，打开即用，数据全部保存在本机。' },
        { icon: 'bolt', title: '一键记分', desc: '底部两个大按钮分别给两队加分，支持 21 / 15 / 11 分制与三局两胜。' },
        { icon: 'undo', title: '点错可撤回', desc: '比分板下方可以逐分撤回，也能一键重置本局或整场比赛。' },
        { icon: 'swords', title: '智能分组与分费', desc: '输入名单即可随机 / 均衡 / 轮换分组，费用支持均摊、按比例、按时长三种方式。' },
        { icon: 'chart', title: '数据与成就', desc: '自动记录历史战绩、胜率曲线、排行榜与能力分析，还有 12 枚成就等你解锁。' },
        { icon: 'rocket', title: '开始使用', desc: '可安装到桌面当 App 用，离线也能正常记分。祝打球愉快！' }
    ];
    var onboardIdx = 0;

    function renderOnboard() {
        var p = ONBOARD_PAGES[onboardIdx];
        var art = nav.byId('ob-art');
        var title = nav.byId('ob-title');
        var desc = nav.byId('ob-desc');
        var dots = nav.byId('ob-dots');
        var prev = nav.byId('ob-prev');
        var next = nav.byId('ob-next');
        if (art) art.innerHTML = App.icons.icon(p.icon);
        if (title) title.textContent = p.title;
        if (desc) desc.textContent = p.desc;
        if (dots) {
            dots.innerHTML = '';
            ONBOARD_PAGES.forEach(function (_, i) {
                var d = document.createElement('i');
                if (i === onboardIdx) d.className = 'on';
                dots.appendChild(d);
            });
        }
        if (prev) prev.classList.toggle('hidden', onboardIdx === 0);
        if (next) next.textContent = (onboardIdx === ONBOARD_PAGES.length - 1) ? '开始使用' : '下一步';
    }

    function showOnboarding() {
        onboardIdx = 0;
        renderOnboard();
        var el = nav.byId('onboarding');
        if (el) {
            el.classList.add('show');
            el.removeAttribute('hidden');
        }
    }

    function hideOnboarding() {
        App.state.hasSeenOnboarding = true;
        App.state.saveOnboarding();
        var el = nav.byId('onboarding');
        if (el) {
            el.classList.remove('show');
            el.setAttribute('hidden', '');
        }
    }

    function onboardNext() {
        if (onboardIdx >= ONBOARD_PAGES.length - 1) { hideOnboarding(); return; }
        onboardIdx++;
        renderOnboard();
    }

    function onboardPrev() {
        if (onboardIdx <= 0) return;
        onboardIdx--;
        renderOnboard();
    }

    /* ================================================================
       注册
       ================================================================ */
    function init() {
        nav.on('ui:input-ok', confirmInput);
        nav.on('ui:input-cancel', hideInputDialog);
        nav.on('ui:confirm-ok', runConfirm);
        nav.on('ui:confirm-cancel', hideConfirm);
        nav.on('ui:onboard-next', onboardNext);
        nav.on('ui:onboard-prev', onboardPrev);
        nav.on('ui:onboard-skip', hideOnboarding);
    }

    App.ui = {
        init: init,
        showInputDialog: showInputDialog,
        hideInputDialog: hideInputDialog,
        confirmInput: confirmInput,
        showConfirm: showConfirm,
        hideConfirm: hideConfirm,
        runConfirm: runConfirm,
        showHighlight: showHighlight,
        escapeHtml: escapeHtml,
        notify: notify,
        copyText: copyText,
        downloadText: downloadText,
        downloadDataUrl: downloadDataUrl,
        initWeather: initWeather,
        showOnboarding: showOnboarding,
        hideOnboarding: hideOnboarding
    };
})(window.App);
