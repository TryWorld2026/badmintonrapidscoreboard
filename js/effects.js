/* ================================================================
   effects.js — 全屏特效：彩带 / 烟花 / 胜利横幅 / 得分脉冲 / 震动
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var COLORS = ['#E5484D', '#0090FF', '#FFB020', '#0E9F6E', '#1B4DFF', '#FF7A45', '#8B5CF6'];
    var reduced = false;

    function prefersReduced() {
        try {
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (e) { return false; }
    }

    function layer() {
        var el = document.getElementById('fx-layer');
        if (!el) {
            el = document.createElement('div');
            el.id = 'fx-layer';
            el.className = 'fx-layer';
            el.setAttribute('aria-hidden', 'true');
            document.body.appendChild(el);
        }
        return el;
    }

    function rand(min, max) { return min + Math.random() * (max - min); }
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    /* ---------- 彩带（150 粒）---------- */
    function confetti(count) {
        if (prefersReduced()) return;
        var host = layer();
        var n = count || 150;
        var i;
        for (i = 0; i < n; i++) {
            (function (i) {
                var p = document.createElement('i');
                p.className = 'confetti';
                p.style.left = rand(0, 100) + '%';
                p.style.background = pick(COLORS);
                p.style.width = rand(6, 11) + 'px';
                p.style.height = rand(10, 16) + 'px';
                p.style.setProperty('--dx', rand(-120, 120) + 'px');
                p.style.setProperty('--rot', rand(360, 1080) + 'deg');
                p.style.animationDuration = rand(2.2, 3.8) + 's';
                p.style.animationDelay = rand(0, 0.6) + 's';
                host.appendChild(p);
                window.setTimeout(function () {
                    if (p.parentNode) p.parentNode.removeChild(p);
                }, 4800);
            })(i);
        }
    }

    /* ---------- 烟花（5 处 × 30 粒）---------- */
    function fireworks(rounds) {
        if (prefersReduced()) return;
        var host = layer();
        var r = rounds || 5;
        var i;
        for (i = 0; i < r; i++) {
            (function (i) {
                window.setTimeout(function () {
                    var cx = rand(15, 85);
                    var cy = rand(15, 55);
                    var color = pick(COLORS);
                    var j;
                    for (j = 0; j < 30; j++) {
                        var p = document.createElement('i');
                        p.className = 'firework';
                        var ang = (Math.PI * 2 * j) / 30;
                        var dist = rand(60, 150);
                        p.style.left = cx + '%';
                        p.style.top = cy + '%';
                        p.style.background = color;
                        p.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
                        p.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(1) + 'px');
                        p.style.setProperty('--fdur', rand(900, 1400) + 'ms');
                        host.appendChild(p);
                        window.setTimeout(function () {
                            if (p.parentNode) p.parentNode.removeChild(p);
                        }, 1500);
                    }
                }, i * 320);
            })(i);
        }
    }

    /* ---------- 胜利横幅（3 秒）---------- */
    function victoryBanner(text, teamName) {
        var el = document.getElementById('victory-banner');
        if (!el) return;
        var t = document.getElementById('vb-title');
        var n = document.getElementById('vb-team');
        if (t) t.textContent = text || '比赛结束';
        if (n) n.textContent = teamName || '';
        el.classList.add('show');
        confetti(120);
        fireworks(5);
        window.setTimeout(function () {
            el.classList.remove('show');
        }, 3000);
    }

    /* ---------- 得分脉冲 ---------- */
    function scorePulse(teamEl, color) {
        if (!teamEl || prefersReduced()) return;
        var p = document.createElement('span');
        p.className = 'score-pulse';
        p.style.background = color || 'rgba(27, 77, 255, 0.35)';
        teamEl.appendChild(p);
        window.setTimeout(function () {
            if (p.parentNode) p.parentNode.removeChild(p);
        }, 560);
    }

    /* ---------- 数字跳动 ---------- */
    function bumpScore(el) {
        if (!el || prefersReduced()) return;
        el.classList.remove('bump');
        /* 强制重排以重启动画 */
        void el.offsetWidth;
        el.classList.add('bump');
    }

    /* ---------- 横向震动 ---------- */
    function shake(el) {
        if (!el || prefersReduced()) return;
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        window.setTimeout(function () { el.classList.remove('shake'); }, 420);
    }

    /* ---------- 触感 / 音效 ---------- */
    function vibrate(ms) {
        if (!App.state.settings.vibrationEnabled) return;
        try {
            if (navigator.vibrate) navigator.vibrate(ms || 15);
        } catch (e) { /* ignore */ }
    }

    var audioCtx = null;

    function beep(freq, dur, type) {
        if (!App.state.settings.soundEnabled) return;
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!audioCtx) audioCtx = new Ctx();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            var o = audioCtx.createOscillator();
            var g = audioCtx.createGain();
            o.type = type || 'sine';
            o.frequency.value = freq || 660;
            g.gain.value = 0.06;
            o.connect(g);
            g.connect(audioCtx.destination);
            var now = audioCtx.currentTime;
            g.gain.setValueAtTime(0.06, now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + (dur || 0.12));
            o.start(now);
            o.stop(now + (dur || 0.12) + 0.02);
        } catch (e) { /* ignore */ }
    }

    function clickSound() { beep(880, 0.06, 'triangle'); }
    function pointSound() { beep(1046, 0.1, 'sine'); }
    function winSound() {
        beep(523, 0.16, 'sine');
        window.setTimeout(function () { beep(659, 0.16, 'sine'); }, 150);
        window.setTimeout(function () { beep(784, 0.28, 'sine'); }, 300);
    }

    /* 用户首次交互后解锁 AudioContext（浏览器策略）*/
    function unlockAudio() {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!audioCtx) audioCtx = new Ctx();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { /* ignore */ }
    }

    App.effects = {
        confetti: confetti,
        fireworks: fireworks,
        victoryBanner: victoryBanner,
        scorePulse: scorePulse,
        bumpScore: bumpScore,
        shake: shake,
        vibrate: vibrate,
        beep: beep,
        clickSound: clickSound,
        pointSound: pointSound,
        winSound: winSound,
        unlockAudio: unlockAudio
    };
})(window.App);
