/* ================================================================
   stats.js — 数据 Tab：概览 / 历史 / 排行榜 / 能力分析
   统计口径与旧版一致。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var ui = App.ui;
    var avatars = App.avatars;

    var lbType = 'wins';

    function $(id) { return document.getElementById(id); }

    /* 非法日期统一降级，避免把 "Invalid Date" 摆到用户脸上 */
    function fmtDate(v, mode) {
        var d = new Date(v);
        if (!d || isNaN(d.getTime())) return '—';
        return mode === 'date' ? d.toLocaleDateString() : d.toLocaleString();
    }

    function splitPlayers(str) {
        return String(str || '').split(/[\/、]/).map(function (p) { return p.trim(); })
            .filter(function (p) { return p !== ''; });
    }

    /* ================================================================
       概览
       ================================================================ */
    function updateStats(matchHistory) {
        var totalMatches = matchHistory.length;
        var wins = 0;
        var losses = 0;
        var totalDuration = 0;

        matchHistory.forEach(function (m) {
            if (m.scoreA > m.scoreB) wins++;
            else if (m.scoreA < m.scoreB) losses++;
            totalDuration += m.duration || 0;
        });

        set('stat-total-matches', totalMatches);
        set('stat-total-wins', wins);
        set('stat-total-losses', losses);
        set('stat-win-rate', totalMatches > 0 ? Math.round(wins / totalMatches * 100) + '%' : '0%');
        set('stat-total-time', Math.round(totalDuration / 3600) + 'h');
    }

    function set(id, v) {
        var el = $(id);
        if (el) el.textContent = v;
    }

    /* ================================================================
       历史列表
       ================================================================ */
    function renderHistory() {
        var matchHistory = App.state.getMatchHistory();
        var box = $('history-list');
        var count = $('history-count');
        if (!box) return;

        if (count) count.textContent = matchHistory.length + ' 场';

        if (!matchHistory.length) {
            box.innerHTML = '<div class="empty"><div class="empty-icon ic-box" data-icon="shuttle"></div>' +
                '<div class="empty-title">暂无比赛记录</div>' +
                '<div class="empty-hint">开始一场比赛后会自动记录在这里</div></div>';
            updateStats([]);
            if (App.charts) App.charts.destroy();
            return;
        }

        box.innerHTML = matchHistory.slice(0, 20).map(function (m, i) {
            var isWin = m.scoreA > m.scoreB;
            var tag = isWin ? '<span class="tag tag-win">胜利</span>'
                : (m.scoreA < m.scoreB ? '<span class="tag tag-lose">失败</span>'
                    : '<span class="tag tag-draw">平局</span>');
            var minutes = Math.floor((m.duration || 0) / 60);
            var dur = minutes > 0 ? (minutes + ' 分钟') : '';
            var hl = (m.highlights && m.highlights.length)
                ? m.highlights.map(function (t) { return '<span class="tag tag-gold">' + ui.escapeHtml(t) + '</span>'; }).join('')
                : '';
            return '<div class="history-row" data-act="stats:match-detail" data-index="' + i + '" role="button" tabindex="0">' +
                '<div class="h-main">' +
                '<div class="h-teams">' + ui.escapeHtml(m.teamA) + ' vs ' + ui.escapeHtml(m.teamB) + '</div>' +
                '<div class="h-meta"><span>' + new Date(m.date).toLocaleString() + '</span>' + tag +
                (dur ? '<span>' + dur + '</span>' : '') + hl + '</div>' +
                '</div>' +
                '<div class="h-score">' + m.scoreA + ' : ' + m.scoreB + '</div>' +
                '</div>';
        }).join('');

        updateStats(matchHistory);
        if (App.charts) App.charts.initCharts();
    }

    function showMatchDetail(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        var m = App.state.getMatchHistory()[idx];
        if (!m) return;

        var sum = $('match-detail-summary');
        if (sum) {
            sum.innerHTML =
                '<div class="split-row"><span class="who">' + ui.escapeHtml(m.teamA) + '</span>' +
                '<span class="amt">' + m.scoreA + '</span></div>' +
                '<div class="split-row"><span class="who">' + ui.escapeHtml(m.teamB) + '</span>' +
                '<span class="amt">' + m.scoreB + '</span></div>' +
                '<div class="split-row"><span class="who">各局比分</span>' +
                '<span class="amt">' + ui.escapeHtml(m.gameScores || '—') + '</span></div>' +
                '<div class="split-row"><span class="who">比赛时长</span>' +
                '<span class="amt">' + App.match.formatTime(m.duration || 0) + '</span></div>' +
                '<div class="split-row"><span class="who">赛制</span>' +
                '<span class="amt">' + ui.escapeHtml(m.mode || '—') + '</span></div>' +
                '<div class="split-row"><span class="who">时间</span>' +
                '<span class="amt">' + new Date(m.date).toLocaleString() + '</span></div>';
        }
        var hl = $('match-detail-highlights');
        if (hl) {
            hl.innerHTML = (m.highlights && m.highlights.length)
                ? m.highlights.map(function (t) {
                    return '<div class="highlight-item"><span class="hi-icon">' +
                        ui.escapeHtml(t.slice(0, 2)) + '</span><span class="hi-title">' +
                        ui.escapeHtml(t.slice(2).trim()) + '</span></div>';
                }).join('')
                : '<div class="empty"><div class="empty-icon ic-box" data-icon="shuttle"></div>' +
                '<div class="empty-title">本场没有高光时刻</div></div>';
        }
        nav.openSheet('match-detail-sheet');
        /* 分享入口：动态绑定当前记录的索引 */
        var shareBtn = $('md-share-btn');
        if (shareBtn) shareBtn.setAttribute('data-index', String(idx));
    }

    function exportHistory() {
        var list = App.state.getMatchHistory();
        if (!list.length) {
            ui.notify('还没有比赛记录', '提示');
            return;
        }
        ui.downloadText('羽毛球比赛记录_' + new Date().toISOString().slice(0, 10) + '.json',
            JSON.stringify(list, null, 2));
        ui.notify('比赛记录已导出', '导出成功');
    }

    function clearHistory() {
        ui.showConfirm({
            title: '清空所有比赛记录？',
            message: '此操作不可恢复，排行榜与能力分析数据也会一并清空。',
            okText: '清空',
            danger: true,
            onConfirm: function () {
                App.state.setMatchHistory([]);
                refreshAll();
                ui.notify('所有比赛记录已删除', '已清空');
            }
        });
    }

    /* ================================================================
       排行榜
       ================================================================ */
    function buildPlayerStats(matchHistory) {
        var playerStats = {};
        matchHistory.forEach(function (m) {
            var playersA = splitPlayers(m.teamA);
            var playersB = splitPlayers(m.teamB);
            var aWon = m.scoreA > m.scoreB;

            playersA.forEach(function (p) {
                if (!playerStats[p]) playerStats[p] = { wins: 0, matches: 0, duration: 0 };
                playerStats[p].matches++;
                playerStats[p].duration += m.duration || 0;
                if (aWon) playerStats[p].wins++;
            });
            playersB.forEach(function (p) {
                if (!playerStats[p]) playerStats[p] = { wins: 0, matches: 0, duration: 0 };
                playerStats[p].matches++;
                playerStats[p].duration += m.duration || 0;
                if (!aWon) playerStats[p].wins++;
            });
        });
        return playerStats;
    }

    function renderLeaderboard() {
        var podium = $('podium');
        var list = $('leaderboard-list');
        var matchHistory = App.state.getMatchHistory();
        if (!podium || !list) return;

        if (!matchHistory.length) {
            podium.innerHTML = '';
            list.innerHTML = '<div class="empty"><div class="empty-icon ic-box" data-icon="shuttle"></div>' +
                '<div class="empty-title">暂无数据</div>' +
                '<div class="empty-hint">开始比赛后会自动生成排行榜</div></div>';
            return;
        }

        var stats = buildPlayerStats(matchHistory);
        var arr = Object.keys(stats).map(function (name) {
            return {
                name: name,
                wins: stats[name].wins,
                matches: stats[name].matches,
                duration: stats[name].duration,
                winRate: stats[name].matches > 0 ? (stats[name].wins / stats[name].matches * 100) : 0
            };
        });

        if (lbType === 'wins') arr.sort(function (a, b) { return b.wins - a.wins; });
        else if (lbType === 'matches') arr.sort(function (a, b) { return b.matches - a.matches; });
        else if (lbType === 'winrate') arr.sort(function (a, b) { return b.winRate - a.winRate; });
        else if (lbType === 'duration') arr.sort(function (a, b) { return b.duration - a.duration; });

        var top3 = arr.slice(0, 3);
        var rest = arr.slice(3, 10);

        var medals = ['crown', 'medal', 'medal'];
        var order = [1, 0, 2];
        var html = '';
        order.forEach(function (idx) {
            var p = top3[idx];
            if (!p) return;
            html += '<div class="podium-step rank-' + (idx + 1) + '">' +
                '<div class="medal ic-box">' + App.icons.icon(medals[idx]) + '</div>' +
                '<div class="pname">' + ui.escapeHtml(p.name) + '</div>' +
                '<div class="pval">' + lbValue(p) + '</div>' +
                '</div>';
        });
        podium.innerHTML = html;

        list.innerHTML = rest.map(function (p, i) {
            return '<div class="rank-row">' +
                '<span class="rno">' + (i + 4) + '</span>' +
                '<span class="rmain"><span class="rname">' + ui.escapeHtml(p.name) + '</span>' +
                '<span class="rsub">' + p.matches + ' 场 · 胜率 ' + Math.round(p.winRate) + '%</span></span>' +
                '<span class="rval">' + lbValue(p) + '</span>' +
                '</div>';
        }).join('');
    }

    function lbValue(p) {
        if (lbType === 'wins') return p.wins + ' 胜';
        if (lbType === 'matches') return p.matches + ' 场';
        if (lbType === 'winrate') return Math.round(p.winRate) + '%';
        return Math.round(p.duration / 60) + ' 分';
    }

    function switchLeaderboard(el) {
        lbType = el.getAttribute('data-value') || 'wins';
        renderLeaderboard();
    }

    /* ================================================================
       能力分析
       ================================================================ */
    function calculateAllPlayerStats(matchHistory) {
        var playerStats = {};
        matchHistory.forEach(function (m) {
            var playersA = splitPlayers(m.teamA);
            var playersB = splitPlayers(m.teamB);
            var aWon = m.scoreA > m.scoreB;

            playersA.concat(playersB).forEach(function (player) {
                if (!playerStats[player]) playerStats[player] = { wins: 0, matches: 0, duration: 0 };
                playerStats[player].matches++;
                playerStats[player].duration += m.duration || 0;
                var won = (playersA.indexOf(player) >= 0 && aWon) ||
                    (playersB.indexOf(player) >= 0 && !aWon);
                if (won) playerStats[player].wins++;
            });
        });
        return playerStats;
    }

    function calculatePlayerRanks(playerName, all) {
        var players = Object.keys(all);
        function rankBy(fn) {
            var sorted = players.slice().sort(function (a, b) { return fn(all[b]) - fn(all[a]); });
            return sorted.indexOf(playerName) + 1;
        }
        return {
            wins: rankBy(function (s) { return s.wins; }),
            matches: rankBy(function (s) { return s.matches; }),
            winRate: rankBy(function (s) { return s.matches > 0 ? s.wins / s.matches : 0; }),
            duration: rankBy(function (s) { return s.duration; })
        };
    }

    function generateRealTags(wins, matches, winRate, totalDuration, maxWinStreak) {
        var tags = [];
        if (winRate >= 70 && matches >= 5) tags.push('常胜将军');
        if (winRate >= 50 && winRate < 70 && matches >= 5) tags.push('稳定选手');
        if (matches >= 20) tags.push('球场老将');
        if (matches >= 50) tags.push('资深玩家');
        if (totalDuration >= 36000) tags.push('运动达人');
        if (maxWinStreak >= 5) tags.push('连胜王者');
        if (maxWinStreak >= 3) tags.push('势不可挡');
        if (winRate >= 80 && matches >= 10) tags.push('羽坛高手');
        if (matches >= 5 && matches < 10) tags.push('新秀选手');
        return tags;
    }

    function initPlayerAbilitySelector() {
        var select = $('ability-player-select');
        if (!select) return;
        var matchHistory = App.state.getMatchHistory();
        if (!matchHistory.length) {
            select.innerHTML = '<option value="">选择选手...</option>';
            return;
        }
        var stats = {};
        matchHistory.forEach(function (m) {
            splitPlayers(m.teamA).concat(splitPlayers(m.teamB)).forEach(function (p) {
                if (!stats[p]) stats[p] = { wins: 0, matches: 0, duration: 0 };
                stats[p].matches++;
                stats[p].duration += m.duration || 0;
            });
        });
        var players = Object.keys(stats).sort();
        select.innerHTML = '<option value="">选择选手...</option>' +
            players.map(function (p) {
                return '<option value="' + ui.escapeHtml(p) + '">' + ui.escapeHtml(p) + '</option>';
            }).join('');
    }

    function renderPlayerAbility() {
        var select = $('ability-player-select');
        var playerName = select ? select.value : '';
        var display = $('ability-display');
        var hint = $('ability-empty');
        if (!display || !hint) return;

        if (!playerName) {
            display.classList.add('hidden');
            hint.classList.remove('hidden');
            return;
        }
        hint.classList.add('hidden');
        display.classList.remove('hidden');

        var matchHistory = App.state.getMatchHistory();
        var wins = 0, losses = 0, matches = 0, totalDuration = 0;
        var currentWinStreak = 0, currentLoseStreak = 0, maxWinStreak = 0, maxLoseStreak = 0;
        var totalScoreFor = 0, totalScoreAgainst = 0;
        var recent = [];

        matchHistory.forEach(function (m) {
            var playersA = splitPlayers(m.teamA);
            var isA = playersA.indexOf(playerName) >= 0;
            if (!isA && splitPlayers(m.teamB).indexOf(playerName) < 0) return;

            var won = isA ? (m.scoreA > m.scoreB) : (m.scoreB > m.scoreA);
            matches++;
            totalDuration += m.duration || 0;
            if (won) {
                wins++;
                currentWinStreak++;
                currentLoseStreak = 0;
                if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
            } else {
                losses++;
                currentLoseStreak++;
                currentWinStreak = 0;
                if (currentLoseStreak > maxLoseStreak) maxLoseStreak = currentLoseStreak;
            }
            if (isA) { totalScoreFor += m.scoreA; totalScoreAgainst += m.scoreB; }
            else { totalScoreFor += m.scoreB; totalScoreAgainst += m.scoreA; }

            recent.unshift({
                date: fmtDate(m.date, 'date'),
                won: won,
                score: m.scoreA + ' : ' + m.scoreB,
                opponent: isA ? m.teamB : m.teamA
            });
        });

        var winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
        var avgDuration = matches > 0 ? Math.round(totalDuration / matches / 60) : 0;
        var totalHours = Math.round(totalDuration / 3600 * 10) / 10;
        var avgFor = matches > 0 ? (totalScoreFor / matches).toFixed(1) : '0.0';
        var avgAgainst = matches > 0 ? (totalScoreAgainst / matches).toFixed(1) : '0.0';

        var nm = $('ability-name');
        if (nm) nm.textContent = playerName;
        var av = $('ability-avatar');
        if (av) av.textContent = avatars.get(playerName);

        var grid = $('ability-stats-grid');
        if (grid) {
            var cards = [
                [matches, '总场次'], [wins, '胜场'], [losses, '负场'],
                [winRate + '%', '胜率'], [totalHours + 'h', '总时长'],
                [avgDuration + 'm', '场均时长'], [maxWinStreak, '最长连胜'],
                [maxLoseStreak, '最长连败'], [avgFor, '场均得分'], [avgAgainst, '场均失分']
            ];
            grid.innerHTML = cards.map(function (c) {
                return '<div class="stat-card"><div class="v num">' + c[0] + '</div><div class="k">' + c[1] + '</div></div>';
            }).join('');
        }

        var all = calculateAllPlayerStats(matchHistory);
        var ranks = calculatePlayerRanks(playerName, all);
        var rk = $('ability-ranks');
        if (rk) {
            var rcards = [
                [ranks.wins, '胜场排名'], [ranks.matches, '参赛排名'],
                [ranks.winRate, '胜率排名'], [ranks.duration, '时长排名']
            ];
            rk.innerHTML = rcards.map(function (r) {
                return '<div class="stat-card"><div class="v num">#' + r[0] + '</div><div class="k">' + r[1] + '</div></div>';
            }).join('');
        }

        var recentBox = $('ability-recent');
        if (recentBox) {
            var r5 = recent.slice(0, 5);
            recentBox.innerHTML = r5.length
                ? r5.map(function (m) {
                    return '<div class="recent-row">' +
                        '<span class="tag ' + (m.won ? 'tag-win' : 'tag-lose') + '">' +
                        (m.won ? '胜' : '负') + '</span>' +
                        '<span class="r-main"><span class="r-teams">vs ' + ui.escapeHtml(m.opponent) + '</span>' +
                        '<span class="r-date">' + ui.escapeHtml(m.date) + '</span></span>' +
                        '<span class="r-score num">' + m.score + '</span>' +
                        '</div>';
                }).join('')
                : '<div class="empty"><div class="empty-icon ic-box" data-icon="list"></div>' +
                '<div class="empty-title">暂无比赛记录</div></div>';
        }

        var tags = generateRealTags(wins, matches, winRate, totalDuration, maxWinStreak);
        var tagBox = $('ability-tags');
        if (tagBox) {
            /* 注意：两条分支都必须是数组，否则空列表时 .join 会抛
               "(intermediate value).join is not a function" */
            var tagHtml = (tags && tags.length
                ? tags.map(function (t) { return '<span class="ability-tag">' + t + '</span>'; })
                : ['<span class="ability-tag">羽毛球爱好者</span>']).join('');
            tagBox.innerHTML = tagHtml;
        }
    }

    /* ================================================================
       刷新 / 钩子
       ================================================================ */
    function refreshAll() {
        renderHistory();
        renderLeaderboard();
        initPlayerAbilitySelector();
        renderPlayerAbility();
        if (App.achievements) App.achievements.render();
    }

    function onEnter(sub) {
        if (sub === 'history' || sub === '') {
            renderHistory();
            if (App.charts) App.charts.initCharts();
        } else if (sub === 'leaderboard') {
            renderLeaderboard();
        } else if (sub === 'ability') {
            initPlayerAbilitySelector();
            renderPlayerAbility();
        } else if (sub === 'achievements') {
            if (App.achievements) App.achievements.render();
        }
    }

    function init() {
        nav.on('stats:match-detail', showMatchDetail);
        nav.on('stats:export', exportHistory);
        nav.on('stats:clear', clearHistory);
        nav.on('stats:leaderboard', switchLeaderboard);
        nav.on('stats:ability-select', renderPlayerAbility);
    }

    App.stats = {
        init: init,
        onEnter: onEnter,
        refreshAll: refreshAll,
        renderHistory: renderHistory,
        renderLeaderboard: renderLeaderboard,
        renderPlayerAbility: renderPlayerAbility,
        updateStats: updateStats,
        exportHistory: exportHistory,
        clearHistory: clearHistory,
        showMatchDetail: showMatchDetail,
        calculateAllPlayerStats: calculateAllPlayerStats,
        calculatePlayerRanks: calculatePlayerRanks,
        generateRealTags: generateRealTags
    };
})(window.App);
