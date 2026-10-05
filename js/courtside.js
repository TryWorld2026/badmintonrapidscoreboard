/* ================================================================
   courtside.js — 场边模式（超大字报）

   为什么需要这个：
     真实场景是「手机靠在球包上、屏幕朝上、人在场上」。
     常规界面是为「握在手里」设计的，2 米外完全读不出比分。

   设计约束（决定了实现方式）：
     1. 不复制任何计分逻辑 —— 全部调用 App.match.updateScore / undoScore，
        否则两套状态机迟早会不一致（本项目历史上最贵的一类 bug）。
     2. 防息屏、全屏、锁方向三者都可能不可用（iOS Safari / 非 HTTPS），
        所以每一项都独立降级，任何一项失败都不阻断计分。
     3. 手势要能盲按：左右半屏 = 加分，长按 = 撤回。

   已实测的环境事实：
     HTTPS 下 navigator.wakeLock / requestFullscreen / screen.orientation.lock
     三者均存在；http 与 headless 下可能缺失，故全部走 try/catch 探测。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var overlay = null;          // 覆盖层根节点
    var open = false;            // 是否处于场边模式
    var wakeLock = null;         // Screen Wake Lock 句柄
    var wakeSupported = null;    // null=未探测
    var prevOrientation = null;  // 退出时还原方向

    /* 长按判定：超过这个毫秒数算「撤回」，否则算「加分」 */
    var LONG_PRESS_MS = 520;
    /* 误触保护：同一侧连续两次加分至少间隔这么久（一次物理点击只应产生一次加分） */
    var MIN_TAP_GAP_MS = 90;

    var lastTapAt = { a: 0, b: 0 };

    function $(id) { return document.getElementById(id); }

    /* 侧别 → 队色令牌（跟随令牌层，不手抄色值） */
    function sideColor(side) {
        return App.tokens.get(side === 'a' ? '--a' : '--b', side === 'a' ? '#E1554A' : '#3E8FD9');
    }

    /* ------------------------------------------------------------
       渲染：只读 App.state.match，不持有自己的状态副本
       ------------------------------------------------------------ */
    function render() {
        if (!open || !overlay) return;
        var m = App.state.match;

        setText('cs-score-a', m.scoreA);
        setText('cs-score-b', m.scoreB);
        setText('cs-name-a', m.teamNameA || '甲队');
        setText('cs-name-b', m.teamNameB || '乙队');
        setText('cs-timer', App.match.formatTime(m.seconds));
        setText('cs-game', '第 ' + m.currentGame + ' 局');

        /* 局分：条形刻度，与主界面语言一致 */
        var need = App.state.settings.bestOfThree ? 2 : 1;
        paintMarks('cs-games-a', m.gamesWonA, need, 'a');
        paintMarks('cs-games-b', m.gamesWonB, need, 'b');

        /* 领先方提亮、落后方降调 —— 与主界面同一套语义 */
        toggleClass('cs-side-a', 'leading', m.scoreA > m.scoreB);
        toggleClass('cs-side-b', 'leading', m.scoreB > m.scoreA);

        /* 计时状态：暂停时给出明确读数 */
        toggleClass('cs-timer', 'paused', !m.timerRunning);
        setText('cs-timer-label', m.timerRunning ? '进行中' : (m.seconds > 0 ? '已暂停' : '未开始'));
    }

    function setText(id, v) {
        var el = $(id);
        if (el && el.textContent !== String(v)) el.textContent = v;
    }

    function toggleClass(id, cls, on) {
        var el = $(id);
        if (el) el.classList.toggle(cls, !!on);
    }

    function paintMarks(id, won, need, side) {
        var el = $(id);
        if (!el) return;
        var html = '';
        for (var i = 0; i < need; i++) {
            html += '<i class="cs-mark' + (i < won ? ' won' : '') + '"></i>';
        }
        if (el.innerHTML !== html) el.innerHTML = html;
    }

    /* ------------------------------------------------------------
       计分：直接复用主引擎
       ------------------------------------------------------------ */
    function score(side) {
        var now = Date.now();
        if (now - lastTapAt[side] < MIN_TAP_GAP_MS) return;   // 同侧去抖
        lastTapAt[side] = now;

        /* 未开始计时时主引擎会拦下并 toast 提示 —— 场边模式下
           用户看不到那条 toast，所以这里自己补一个可见的提示。 */
        if (!App.state.match.timerRunning && App.state.match.seconds === 0) {
            flashHint('先点「开始计时」再计分');
            return;
        }
        App.match.updateScore(side, 1);
        pulse(side);
        render();
    }

    function undo() {
        var before = App.state.match.scoreA + ':' + App.state.match.scoreB;
        App.match.undoScore();
        var after = App.state.match.scoreA + ':' + App.state.match.scoreB;
        if (before === after) flashHint('没有可撤回的得分');
        else pulse('a', true), pulse('b', true);
        render();
    }

    function toggleTimer() {
        App.match.toggleTimer();
        render();
    }

    /* 一次短促的视觉反馈：让用户确认「这一下按到了」 */
    function pulse(side, both) {
        var ids = both ? ['cs-side-a', 'cs-side-b'] : ['cs-side-' + side];
        ids.forEach(function (id) {
            var el = $(id);
            if (!el) return;
            el.classList.remove('hit');
            /* 强制回流以重启动画（否则连续点击时第二次不播） */
            void el.offsetWidth;
            el.classList.add('hit');
            window.setTimeout(function () { el.classList.remove('hit'); }, 220);
        });
    }

    var hintTimer = null;
    function flashHint(text) {
        var el = $('cs-hint');
        if (!el) return;
        el.textContent = text;
        el.classList.add('show');
        if (hintTimer) window.clearTimeout(hintTimer);
        hintTimer = window.setTimeout(function () { el.classList.remove('show'); }, 1600);
    }

    /* ------------------------------------------------------------
       手势：轻点加分 / 长按撤回
       用 Pointer Events 统一鼠标与触摸。

       ⚠️ 计分只能有一条路径。
       第一版在这里用 pointerup 直接调 score()，同时又保留了 markup 上的
       data-act="courtside:score"（nav 的委托 click 也会调 score()）——
       于是一次点击加两分，长按撤回之后还会被 click 补回一分
       （实测：长按后 7 分变 8 分，而不是 6 分）。
       现在的分工是：计分统一交给 nav 的委托 click（键盘/鼠标/触摸都走它），
       这里只负责「识别长按 → 撤回 → 吞掉紧随其后的那次 click」。

       ⚠️ 只能绑定一次。
       第二版把 bindGestures() 放在 openCourtside() 里，于是每进出一次
       场边模式就多挂一整套监听：进 5 次后一次长按会触发 5 个撤回定时器，
       分数直接被打到 0（实测：3 分长按后变成 0 分，而不是 2 分）。
       现在改为首次 open 时绑定一次，之后复用。
       ------------------------------------------------------------ */
    var gesturesBound = false;

    function bindGestures() {
        if (gesturesBound) return;
        gesturesBound = true;

        ['a', 'b'].forEach(function (side) {
            var el = $('cs-side-' + side);
            if (!el) return;

            var pressTimer = null;
            var longFired = false;

            el.addEventListener('pointerdown', function (ev) {
                if (ev.button !== undefined && ev.button !== 0) return;
                longFired = false;
                pressTimer = window.setTimeout(function () {
                    longFired = true;
                    undo();
                }, LONG_PRESS_MS);
            });

            function clearPress() {
                if (pressTimer) { window.clearTimeout(pressTimer); pressTimer = null; }
            }

            el.addEventListener('pointerup', clearPress);
            el.addEventListener('pointercancel', clearPress);
            el.addEventListener('pointerleave', clearPress);

            /* 长按已经撤回过了，这一次 click 必须被吞掉，否则会立刻加回一分。
               用捕获阶段拦截，保证在 nav 的委托处理器之前生效。 */
            el.addEventListener('click', function (ev) {
                if (longFired) {
                    ev.stopPropagation();
                    ev.preventDefault();
                    longFired = false;
                }
            }, true);
        });
    }

    /* ------------------------------------------------------------
       防息屏（Screen Wake Lock）
       最常见的坑：页面切到后台时浏览器会自动释放 wake lock，
       回到前台必须重新申请，否则"防息屏"在切出去一次后就失效。
       ------------------------------------------------------------ */
    function requestWakeLock() {
        if (!('wakeLock' in navigator) || !navigator.wakeLock) return Promise.resolve(false);
        return navigator.wakeLock.request('screen').then(function (lock) {
            wakeLock = lock;
            /* 被系统释放时清掉句柄，便于下次重新申请 */
            if (lock.addEventListener) {
                lock.addEventListener('release', function () { wakeLock = null; });
            }
            return true;
        }).catch(function () {
            /* 常见原因：非 HTTPS、电量过低、页面不在前台。静默降级。 */
            return false;
        });
    }

    function releaseWakeLock() {
        if (wakeLock && wakeLock.release) {
            try { wakeLock.release(); } catch (e) { /* ignore */ }
        }
        wakeLock = null;
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible' && open && !wakeLock) {
            requestWakeLock();
        }
    }

    /* ------------------------------------------------------------
       全屏 / 方向锁：各自独立降级
       ------------------------------------------------------------ */
    function enterFullscreen() {
        var el = overlay || document.documentElement;
        var fn = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!fn) return Promise.resolve(false);
        try {
            var r = fn.call(el);
            return (r && r.then) ? r.then(function () { return true; }).catch(function () { return false; })
                : Promise.resolve(true);
        } catch (e) { return Promise.resolve(false); }
    }

    function exitFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
        var fn = document.exitFullscreen || document.webkitExitFullscreen;
        if (!fn) return;
        try {
            var r = fn.call(document);
            if (r && r.catch) r.catch(function () { /* ignore */ });
        } catch (e) { /* ignore */ }
    }

    function lockLandscape() {
        var so = screen.orientation;
        if (!so || !so.lock) return Promise.resolve(false);
        prevOrientation = so.type || null;
        try {
            var r = so.lock('landscape');
            return (r && r.then) ? r.then(function () { return true; }).catch(function () { return false; })
                : Promise.resolve(true);
        } catch (e) { return Promise.resolve(false); }
    }

    function unlockOrientation() {
        var so = screen.orientation;
        if (so && so.unlock) { try { so.unlock(); } catch (e) { /* ignore */ } }
    }

    /* ------------------------------------------------------------
       开关
       ------------------------------------------------------------ */
    function openCourtside() {
        if (open) return;
        overlay = $('courtside');
        if (!overlay) return;

        open = true;
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('courtside-on');

        bindGestures();
        render();

        /* 三项增强能力并行申请，互不阻塞；任一失败都只是少一个便利 */
        var results = [];
        results.push(enterFullscreen());
        results.push(lockLandscape());
        results.push(requestWakeLock());

        Promise.all(results).then(function (r) {
            if (!open) return;
            /* 只有在"确实拿到了某项能力"时才提示，避免噪音；
               Wake Lock 失败是唯一值得告诉用户的（影响最大）。 */
            if (!r[2]) {
                flashHint('系统不支持防息屏，建议手动调高息屏时间');
            }
        });

        document.addEventListener('visibilitychange', onVisibilityChange);

        /* 焦点移入，键盘用户不会迷失在背后的页面上 */
        var first = $('cs-side-a');
        if (first && first.focus) first.focus();

        App.nav.announce && App.nav.announce('已进入场边模式，左半屏甲队加分，右半屏乙队加分，长按撤回');
    }

    function closeCourtside() {
        if (!open) return;
        var ov = overlay || $('courtside');
        open = false;

        if (ov) {
            ov.hidden = true;
            ov.setAttribute('aria-hidden', 'true');
        }
        document.documentElement.classList.remove('courtside-on');

        document.removeEventListener('visibilitychange', onVisibilityChange);
        releaseWakeLock();
        unlockOrientation();
        exitFullscreen();

        if (hintTimer) { window.clearTimeout(hintTimer); hintTimer = null; }

        /* 回到主界面时同步一次，保证两边读数一致 */
        App.match.render();

        var back = $('dock-courtside') || $('dock');
        if (back && back.focus) back.focus();
    }

    function toggle() { open ? closeCourtside() : openCourtside(); }
    function isOpen() { return open; }

    /* ------------------------------------------------------------
       初始化
       ------------------------------------------------------------ */
    function init() {
        App.nav.on('courtside:open', function () { openCourtside(); });
        App.nav.on('courtside:close', function () { closeCourtside(); });
        App.nav.on('courtside:score', function (el) {
            score(el.getAttribute('data-side'));
        });
        App.nav.on('courtside:timer', function () { toggleTimer(); });

        /* Esc 退出：与全站弹层语义一致 */
        document.addEventListener('keydown', function (ev) {
            if (open && ev.key === 'Escape') { ev.preventDefault(); closeCourtside(); }
        });

        /* 用户按浏览器全屏退出键时，同步收掉覆盖层状态 */
        document.addEventListener('fullscreenchange', function () {
            if (open && !document.fullscreenElement && !document.webkitFullscreenElement) {
                /* 只同步内部标记，不强制退出场边模式：
                   用户可能只是不想全屏，仍想继续用大字报。 */
            }
        });

        /* 主引擎每次渲染后同步场边读数。
           用包装而不是新增事件总线：改动最小，且不会漏掉任何调用点。 */
        var originalRender = App.match.render;
        App.match.render = function () {
            originalRender.apply(this, arguments);
            if (open) render();
        };
    }

    App.courtside = {
        init: init,
        open: openCourtside,
        close: closeCourtside,
        toggle: toggle,
        isOpen: isOpen,
        render: render,
        /* 供测试与诊断使用 */
        _score: score,
        _undo: undo,
        _wakeSupported: function () { return ('wakeLock' in navigator); }
    };
})(window.App);
