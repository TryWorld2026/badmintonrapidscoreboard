/* ================================================================
   effects.js — 全屏特效：彩带 / 烟花 / 胜利横幅 / 得分脉冲 / 震动
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    /* 彩带配色同样从令牌层读，不再手抄一份（抄错了视觉重构后没人发现）。
       v4 的克制原则：彩带不用七种高饱和色乱撒，只用
       「队伍色 + 状态色」共 5 色，与界面上出现的颜色严格一致。
       ⚠️ 这里的回落字面量必须与 css/tokens.css 保持一致 ——
          样式表未就绪时它们是唯一来源。 */
    var COLORS = null;
    function palette() {
        if (!COLORS) {
            var p = App.tokens.palette({
                live: ['--live', '#F2C14E'],
                teamA: ['--a', '#FF5A47'],
                teamB: ['--b', '#4FA8E8'],
                gold: ['--gold', '#D8B26A'],
                ok: ['--ok', '#4FC08A']
            });
            COLORS = [p.teamA, p.teamB, p.live, p.gold, p.ok];
        }
        return COLORS;
    }
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
                p.style.background = pick(palette());
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
                    var color = pick(palette());
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

    /* ---------- 胜利横幅（3 秒）----------
       第二个参数是副标题（调用方传的是「最终比分 x : y」），
       旧名字叫 teamName 会让人以为必须传队名。 */
    function victoryBanner(text, subtitle) {
        var el = document.getElementById('victory-banner');
        if (!el) return;
        var t = document.getElementById('vb-title');
        var n = document.getElementById('vb-team');
        if (t) t.textContent = text || '比赛结束';
        if (n) n.textContent = subtitle || '';
        nav.announce((text || '比赛结束') + (subtitle ? '，' + subtitle : ''));
        el.classList.add('show');
        confetti(120);
        fireworks(5);
        window.setTimeout(function () {
            el.classList.remove('show');
        }, 3000);
    }

    /* ---------- 得分扫光 ----------
       一道中性的白光扫过得分方半场。刻意不带队色：
       队色已经出现在边线、数字、光池三处，再给动效上色就成了第四次，
       而「彩色闪一下」正是廉价感的来源（v3 的实心扩散圆就是这么来的）。 */
    function scoreSweep(teamEl) {
        if (!teamEl || prefersReduced()) return;
        var s = document.createElement('span');
        s.className = 'score-sweep';
        teamEl.appendChild(s);
        window.setTimeout(function () {
            if (s.parentNode) s.parentNode.removeChild(s);
        }, 600);
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
        scoreSweep: scoreSweep,
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
