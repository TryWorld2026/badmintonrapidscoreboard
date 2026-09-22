/* ================================================================
   achievements.js — 成就系统（12 枚，判定条件与旧版一致）
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var fx = App.effects;

    /* 与旧版逐字一致 */
    var LIST = [
        { id: 'first_match', icon: '🏸', title: '初次登场', desc: '完成第一场比赛', type: 'match', value: 1 },
        { id: 'ten_matches', icon: '🎯', title: '小有成就', desc: '完成10场比赛', type: 'match', value: 10 },
        { id: 'fifty_matches', icon: '🏆', title: '球场老将', desc: '完成50场比赛', type: 'match', value: 50 },
        { id: 'first_win', icon: '🎉', title: '首胜', desc: '赢得第一场比赛', type: 'win', value: 1 },
        { id: 'ten_wins', icon: '🥈', title: '常胜将军', desc: '赢得10场比赛', type: 'win', value: 10 },
        { id: 'twentyfive_wins', icon: '🥇', title: '羽坛王者', desc: '赢得25场比赛', type: 'win', value: 25 },
        { id: 'streak_3', icon: '🔥', title: '三连胜', desc: '连续赢得3场比赛', type: 'streak', value: 3 },
        { id: 'streak_5', icon: '💥', title: '五连胜', desc: '连续赢得5场比赛', type: 'streak', value: 5 },
        { id: 'play_hour', icon: '⏱️', title: '球痴', desc: '累计打球1小时', type: 'duration', value: 3600 },
        { id: 'play_5hours', icon: '⌛', title: '球瘾', desc: '累计打球5小时', type: 'duration', value: 18000 },
        { id: 'perfect_win', icon: '✨', title: '完美胜利', desc: '一局比赛零封对手', type: 'perfect', value: 1 },
        { id: 'deuce_master', icon: '🎮', title: '加分赛专家', desc: '经历3次加分赛', type: 'deuce', value: 3 }
    ];

    var GROUPS = [
        { key: 'match', label: '参赛成就' },
        { key: 'win', label: '胜场成就' },
        { key: 'duration', label: '时长成就' },
        { key: 'special', label: '特殊成就' }
    ];

    var badgeTimer = null;

    function stats() { return App.state.stats; }
    function unlocked() { return App.state.unlocked; }

    function save() { App.state.saveUnlocked(); }

    /* ---------- 渲染 ---------- */
    function progressFor(a) {
        var s = stats();
        var cur = 0;
        switch (a.type) {
            case 'match': cur = s.totalMatches; break;
            case 'win': cur = s.totalWins; break;
            case 'streak': cur = s.currentStreak; break;
            case 'duration': cur = s.totalDuration; break;
            case 'deuce': cur = s.deuceCount; break;
            case 'perfect': cur = unlocked().indexOf(a.id) >= 0 ? 1 : 0; break;
            default: cur = 0;
        }
        var pct = Math.min(100, Math.round((cur / a.value) * 100));
        return { cur: cur, pct: pct };
    }

    function cardHtml(a) {
        var on = unlocked().indexOf(a.id) >= 0;
        var p = progressFor(a);
        return '<div class="achv-card' + (on ? ' unlocked' : '') + '">' +
            '<div class="ic">' + (on ? a.icon : '🔒') + '</div>' +
            '<div class="nm">' + a.title + '</div>' +
            '<div class="ds">' + a.desc + '</div>' +
            '<div class="pb"><i style="width:' + p.pct + '%"></i></div>' +
            '</div>';
    }

    function render() {
        var box = nav.byId('achv-grid');
        if (box) {
            box.innerHTML = LIST.map(cardHtml).join('');
        }
        renderSummary();
    }

    function renderSummary() {
        var count = unlocked().length;
        var total = LIST.length;
        var progress = Math.round((count / total) * 100);

        var c = nav.byId('achv-unlocked');
        var t = nav.byId('achv-total');
        var p = nav.byId('achv-progress');
        var ring = nav.byId('achv-ring-fg');
        if (c) c.textContent = count;
        if (t) t.textContent = total;
        if (p) p.textContent = progress + '%';
        if (ring) {
            var circumference = 283;
            var offset = circumference - (progress / 100) * circumference;
            ring.style.strokeDashoffset = offset;
        }
    }

    function showBadge(a) {
        var badge = nav.byId('achievement-badge');
        if (!badge) return;
        var ic = nav.byId('ab-icon');
        var ti = nav.byId('ab-title');
        var de = nav.byId('ab-desc');
        if (ic) ic.textContent = a.icon;
        if (ti) ti.textContent = '成就解锁：' + a.title;
        if (de) de.textContent = a.desc;
        badge.classList.add('show');
        if (badgeTimer) window.clearTimeout(badgeTimer);
        badgeTimer = window.setTimeout(function () {
            badge.classList.remove('show');
        }, 4000);
    }

    /* ---------- 解锁 ---------- */
    function unlock(a) {
        if (unlocked().indexOf(a.id) >= 0) return;
        unlocked().push(a.id);
        save();
        showBadge(a);
        render();
        fx.confetti(60);
    }

    function checkAndUnlock(type, value) {
        LIST.forEach(function (a) {
            if (a.type === type && unlocked().indexOf(a.id) < 0) {
                if (value >= a.value) unlock(a);
            }
        });
    }

    function updateMatchAchievements(won, perfectWin, hadDeuce) {
        var s = stats();
        s.totalMatches++;
        s.totalDuration += App.state.match.seconds;

        if (won) {
            s.totalWins++;
            s.currentStreak++;
        } else {
            s.currentStreak = 0;
        }

        if (hadDeuce) s.deuceCount++;

        App.state.saveStats();

        checkAndUnlock('match', s.totalMatches);
        checkAndUnlock('win', s.totalWins);
        checkAndUnlock('streak', s.currentStreak);
        checkAndUnlock('duration', s.totalDuration);
        checkAndUnlock('deuce', s.deuceCount);

        if (perfectWin) {
            var pa = LIST.filter(function (a) { return a.type === 'perfect'; })[0];
            if (pa) unlock(pa);
        }
    }

    function init() {
        /* 无交互，仅渲染 */
    }

    App.achievements = {
        LIST: LIST,
        init: init,
        render: render,
        renderSummary: renderSummary,
        checkAndUnlock: checkAndUnlock,
        unlock: unlock,
        updateMatchAchievements: updateMatchAchievements
    };
})(window.App);
