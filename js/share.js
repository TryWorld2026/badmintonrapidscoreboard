/* ================================================================
   share.js — 分享卡（3 模板）+ html2canvas 导出 + 文本分享
   ⚠️ 分享卡 DOM 只使用 share-card.css 中的字面量类名，
      禁止注入 var(--*)，否则 html2canvas 导出会丢色。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var ui = App.ui;

    var TEMPLATES = {
        1: 'linear-gradient(160deg, #E5484D 0%, #FF7A45 100%)',
        2: 'linear-gradient(160deg, #1B4DFF 0%, #00C6FF 100%)',
        3: 'linear-gradient(160deg, #0F151C 0%, #34495E 100%)'
    };

    var tpl = 1;
    var data = {};

    function $(id) { return document.getElementById(id); }

    function esc(s) { return ui.escapeHtml(s); }

    /* ---------- 渲染 ---------- */
    function render() {
        var card = $('share-card');
        if (!card) return;

        var d = data;
        var aWin = (d.scoreA || 0) > (d.scoreB || 0);

        var games = (d.games || []).map(function (g) {
            return '<span class="sc-game">' + esc(g) + '</span>';
        }).join('');

        var highlights = (d.highlights && d.highlights.length)
            ? '<div class="sc-highlights"><div class="sc-hl-title">高光时刻</div>' +
            d.highlights.map(function (t) {
                return '<div class="sc-hl"><b>' + esc(t) + '</b></div>';
            }).join('') + '</div>'
            : '';

        card.className = 'share-card share-card-tpl-' + tpl;
        card.innerHTML =
            '<div class="sc-head">' +
            '<span class="sc-brand">BADMINTON SCOREBOARD</span>' +
            '<span class="sc-date">' + esc(d.dateText || '') + '</span>' +
            '</div>' +
            '<div class="sc-teams">' +
            '<div class="sc-team ' + (aWin ? 'win' : 'lose') + '">' +
            '<div class="sc-avatar">' + esc(d.avatarA || '🏸') + '</div>' +
            '<div class="sc-name">' + esc(d.teamA || '') + '</div>' +
            '<div class="sc-score">' + (d.scoreA || 0) + '</div>' +
            '</div>' +
            '<div class="sc-vs">VS</div>' +
            '<div class="sc-team ' + (!aWin ? 'win' : 'lose') + '">' +
            '<div class="sc-avatar">' + esc(d.avatarB || '🏸') + '</div>' +
            '<div class="sc-name">' + esc(d.teamB || '') + '</div>' +
            '<div class="sc-score">' + (d.scoreB || 0) + '</div>' +
            '</div>' +
            '</div>' +
            (games ? '<div class="sc-games"><span class="sc-games-title">各局比分</span>' +
                '<span class="sc-games-list">' + games + '</span></div>' : '') +
            highlights +
            '<div class="sc-foot">' +
            '<span class="sc-foot-txt">时长 ' + esc(d.durationText || '00:00') + '</span>' +
            '<span class="sc-foot-app">🏸 极速计分板</span>' +
            '</div>';

        /* 模板按钮高亮 */
        document.querySelectorAll('[data-act="share:tpl"]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-value') === String(tpl));
        });
    }

    /* ---------- 数据来源 ---------- */
    function openForCurrentMatch() {
        var m = App.state.match;
        data = {
            teamA: m.teamNameA,
            teamB: m.teamNameB,
            scoreA: m.gamesWonA,
            scoreB: m.gamesWonB,
            games: m.gameScoresHistory.slice(),
            highlights: App.match.getHighlightsSummary(),
            durationText: App.match.formatTime(m.seconds),
            dateText: new Date().toLocaleDateString(),
            avatarA: App.avatars.get(m.teamNameA),
            avatarB: App.avatars.get(m.teamNameB)
        };
        render();
        nav.openSheet('share-sheet');
    }

    function openForHistory(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        var m = App.state.getMatchHistory()[idx];
        if (!m) return;
        var games = String(m.gameScores || '').split(',').map(function (s) { return s.trim(); })
            .filter(function (s) { return s !== ''; });
        data = {
            teamA: m.teamA,
            teamB: m.teamB,
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            games: games,
            highlights: m.highlights || [],
            durationText: App.match.formatTime(m.duration || 0),
            dateText: new Date(m.date).toLocaleDateString(),
            avatarA: App.avatars.get(m.teamA),
            avatarB: App.avatars.get(m.teamB)
        };
        render();
        nav.openSheet('share-sheet');
    }

    function setTemplate(el) {
        tpl = parseInt(el.getAttribute('data-value'), 10) || 1;
        render();
    }

    /* ---------- 导出图片 ---------- */
    function download() {
        var card = $('share-card');
        if (!card) return;
        if (typeof window.html2canvas !== 'function') {
            ui.notify('图片导出组件未加载，请改用「复制文本」或截图', '提示');
            return;
        }
        var btn = $('share-download-btn');
        var original = btn ? btn.textContent : '';
        if (btn) { btn.textContent = '生成中...'; btn.disabled = true; }

        window.html2canvas(card, {
            scale: 2,
            backgroundColor: null,
            useCORS: true,
            logging: false
        }).then(function (canvas) {
            var stamp = new Date().toISOString().slice(0, 10);
            ui.downloadDataUrl(
                '羽毛球比赛_' + (data.teamA || 'A') + 'vs' + (data.teamB || 'B') + '_' + stamp + '.png',
                canvas.toDataURL('image/png')
            );
            ui.notify('分享卡片已保存到本地！', '保存成功');
        }).catch(function (err) {
            if (window.console && console.error) console.error('保存失败:', err);
            ui.notify('请使用截图功能手动保存', '保存失败');
        }).then(function () {
            if (btn) { btn.textContent = original; btn.disabled = false; }
        });
    }

    /* ---------- 文本分享 ---------- */
    function shareText() {
        var d = data;
        var winner = d.scoreA > d.scoreB ? d.teamA : (d.scoreB > d.scoreA ? d.teamB : '平局');
        var text = '🏸 羽毛球比赛结果\n' +
            '📅 ' + (d.dateText || '') + '\n' +
            '👥 ' + d.teamA + ' vs ' + d.teamB + '\n' +
            '📊 局分: ' + d.scoreA + ' : ' + d.scoreB + '\n' +
            '⏱️ 比赛时长: ' + (d.durationText || '') + '\n' +
            '🏆 获胜方: ' + winner;

        if (navigator.share) {
            navigator.share({ title: '羽毛球比赛结果', text: text }).catch(function () { /* 用户取消 */ });
        } else {
            ui.copyText(text, '比赛结果已复制，可直接粘贴发送');
        }
    }

    function init() {
        nav.on('share:tpl', setTemplate);
        nav.on('share:download', download);
        nav.on('share:text', shareText);
        nav.on('share:from-history', openForHistory);
    }

    App.share = {
        init: init,
        render: render,
        openForCurrentMatch: openForCurrentMatch,
        openForHistory: openForHistory,
        download: download
    };
})(window.App);
