/* ================================================================
   grouping.js — 智能分组（随机 / 实力平衡 / 轮换赛制）
   算法与旧版逐行一致。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var ui = App.ui;
    var avatars = App.avatars;

    /* 当前选中的分组模式（UI 态，不落盘）*/
    var mode = 'random';

    var MODE_NAMES = { random: '随机分组', balanced: '实力平衡', rotation: '轮换赛制' };

    function $(id) { return document.getElementById(id); }

    function readPlayers() {
        var ta = $('players-list');
        if (!ta) return [];
        return ta.value.split('\n')
            .map(function (p) { return p.trim(); })
            .filter(function (p) { return p !== ''; });
    }

    function updatePlayerCount() {
        var el = $('player-count');
        if (el) el.textContent = readPlayers().length;
        updateSkillInputs();
    }

    /* 实力输入行（均衡模式用）。

       ⚠️ 每次重建 innerHTML 都会丢掉用户已选的等级。
       旧实现把默认值写死成 `v === 3 ? ' selected'`，于是名单任何一次
       编辑（增删一人、改一行字）都会把**全部**球员重置为 3 级；
       而 readSkills() 在行数不匹配时也回退全 3 ——
       「实力均衡」这个主打功能因此事实上不可用（实测：设 5 级 →
       编辑名单 → 全部变回 3）。

       修法：按「球员名 → 等级」记住已选值，重建后回填。
       按名字而不是下标，因为增删球员会让下标整体位移。

       关键细节：采集时不能拿「当前名单」去配对 DOM，因为
       removePlayer 是**先改名单、再重建 DOM** 的 —— 那一刻 DOM 里还是
       旧的一批行，而 readPlayers() 已经返回新名单，两者错位会让等级
       串到别人头上（实测：A5/B1/C2 删掉 B 后，C 会拿到 1 而不是 2）。
       所以用 builtFor 记住「当前 DOM 是按哪份名单建的」，采集时以它为准。 */
    var skillByName = {};
    var builtFor = [];

    /* 从当前 DOM 采集一次。配对基准是 builtFor，不是当前名单。 */
    function captureSkills() {
        var sels = Array.prototype.slice.call(
            document.querySelectorAll('#skill-inputs .skill-select'));
        for (var i = 0; i < sels.length; i++) {
            var name = builtFor[i];
            if (name === undefined) continue;
            var v = parseInt(sels[i].value, 10);
            if (v >= 1 && v <= 5) skillByName[name] = v;
        }
    }

    function updateSkillInputs() {
        var box = $('skill-inputs');
        if (!box) return;
        var players = readPlayers();
        if (!players.length) {
            box.innerHTML = '';
            box.classList.add('hidden');
            builtFor = [];
            return;
        }
        /* 先把用户当前的设置收进 skillByName，再重建 DOM */
        captureSkills();

        box.classList.remove('hidden');
        box.innerHTML = players.map(function (p, i) {
            var cur = skillByName[p] || 3;
            return '<div class="skill-row">' +
                '<span class="idx">' + (i + 1) + '</span>' +
                '<input type="text" class="input name-input" value="' + ui.escapeHtml(p) + '" readonly>' +
                '<select class="select skill-select" data-act-input="grouping:skill" data-index="' + i + '" aria-label="' +
                ui.escapeHtml(p) + ' 的实力等级">' +
                [1, 2, 3, 4, 5].map(function (v) {
                    return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + v + ' 级</option>';
                }).join('') +
                '</select>' +
                '<button type="button" class="del-btn" data-act="grouping:remove-player" data-index="' + i +
                '" aria-label="删除 ' + ui.escapeHtml(p) + '"><span class="ic-box" data-icon="close"></span></button>' +
                '</div>';
        }).join('');
        /* DOM 现在对应的就是这批人 */
        builtFor = players.slice();
    }

    function readSkills() {
        var players = readPlayers();
        var sels = Array.prototype.slice.call(document.querySelectorAll('#skill-inputs .skill-select'));
        if (sels.length !== players.length) return players.map(function () { return 3; });
        /* 读的时候顺手记下来，后续重建才能回填 */
        return sels.map(function (s, i) {
            var v = parseInt(s.value, 10) || 3;
            skillByName[players[i]] = v;
            return v;
        });
    }

    function quickAddPlayer(name) {
        var ta = $('players-list');
        if (!ta) return;
        var cur = ta.value.trim();
        ta.value = cur ? (cur + '\n' + name) : name;
        updatePlayerCount();
    }

    function removePlayer(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        var players = readPlayers();
        players.splice(idx, 1);
        var ta = $('players-list');
        if (ta) ta.value = players.join('\n');
        updatePlayerCount();
    }

    /* ---------- 三种分组算法（与旧版一致）---------- */
    function randomGrouping(players) {
        var shuffled = players.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
        }
        var groups = [];
        for (var k = 0; k < shuffled.length; k += 2) {
            if (k + 1 < shuffled.length) {
                groups.push([
                    { name: shuffled[k], skill: 3 },
                    { name: shuffled[k + 1], skill: 3 }
                ]);
            } else if (groups.length > 0) {
                groups[groups.length - 1].push({ name: shuffled[k], skill: 3 });
            }
        }
        return groups;
    }

    function balancedGrouping(players, skills) {
        if (!skills || skills.length !== players.length) {
            skills = players.map(function () { return 3; });
        }
        var withSkill = players.map(function (p, i) { return { name: p, skill: skills[i] }; });
        withSkill.sort(function (a, b) { return b.skill - a.skill; });

        var groups = [];
        var used = {};

        while (Object.keys(used).length < withSkill.length) {
            var available = withSkill.filter(function (_, i) { return !used[i]; });
            if (available.length === 0) break;

            var strongest = available[0];
            var strongestIdx = withSkill.findIndex(function (p, i) {
                return !used[i] && p.name === strongest.name;
            });
            used[strongestIdx] = true;

            var remaining = withSkill.filter(function (_, i) { return !used[i]; });
            if (remaining.length > 0) {
                var weakest = remaining[remaining.length - 1];
                var weakestIdx = withSkill.findIndex(function (p, i) {
                    return !used[i] && p.name === weakest.name;
                });
                used[weakestIdx] = true;
                groups.push([
                    { name: strongest.name, skill: strongest.skill },
                    { name: weakest.name, skill: weakest.skill }
                ]);
            } else if (groups.length > 0) {
                groups[groups.length - 1].push({ name: strongest.name, skill: strongest.skill });
            }
        }
        return groups;
    }

    function rotationGrouping(players) {
        var groups = [];
        for (var i = 0; i < players.length; i++) {
            for (var j = i + 1; j < players.length; j++) {
                groups.push([
                    { name: players[i], skill: 3 },
                    { name: players[j], skill: 3 }
                ]);
            }
        }
        return groups;
    }

    /* ---------- 生成 ---------- */
    function generate() {
        var players = readPlayers();
        if (players.length < 4) {
            ui.notify('至少需要 4 人才能分组', '提示');
            return;
        }
        var skills = (mode === 'balanced') ? readSkills() : null;
        var groups;
        if (mode === 'balanced') groups = balancedGrouping(players, skills);
        else if (mode === 'rotation') groups = rotationGrouping(players);
        else groups = randomGrouping(players);

        displayGroups(groups, mode, skills);
        App.state.saveLastGroups(groups);
        /* 写入分组历史（上限 10 条，新的在最前）*/
        App.state.pushGroupingHistory({
            groups: groups,
            mode: mode,
            modeName: MODE_NAMES[mode] || mode,
            players: players,
            date: Date.now()
        });
        renderHistory();
        ui.notify('已生成 ' + groups.length + ' 组对阵', '分组完成');
    }

    function displayGroups(groups, m, skills) {
        var section = $('group-results-section');
        var box = $('group-results');
        var stats = $('group-stats');
        if (!box) return;
        if (section) section.classList.remove('hidden');
        box.innerHTML = '';

        var html = '';
        groups.forEach(function (group, index) {
            var totalSkill = group.reduce(function (sum, p) { return sum + (p.skill || 3); }, 0);
            html += '<div class="duel-card">' +
                '<div class="duel-card-head"><span>第 ' + (index + 1) + ' 组</span>' +
                '<span class="vs-tag">合计实力 ' + totalSkill + '</span></div>';
            group.forEach(function (p, pi) {
                html += '<div class="duel-side ' + (pi === 0 ? 'side-a' : 'side-b') + '">' +
                    '<span class="duel-side-tag">' + (pi === 0 ? 'A' : 'B') + '</span>' +
                    '<span class="duel-side-names">' +
                    '<span>' + ui.escapeHtml(p.name) + '</span>' +
                    '</span>' +
                    '<span class="duel-side-avatar">' + avatars.get(p.name) + '</span>' +
                    '</div>';
            });
            html += '</div>';
        });
        box.innerHTML = html;

        if (stats) {
            var totalGroups = groups.length;
            var totalPlayers = groups.reduce(function (s, g) { return s + g.length; }, 0);
            var avg = (totalPlayers / totalGroups).toFixed(1);
            stats.innerHTML =
                '<div class="stat-card"><div class="v">' + totalGroups + '</div><div class="k">总组数</div></div>' +
                '<div class="stat-card"><div class="v">' + totalPlayers + '</div><div class="k">参与人数</div></div>' +
                '<div class="stat-card"><div class="v">' + avg + '</div><div class="k">平均每组</div></div>';
        }
    }

    function clearGroups() {
        var ta = $('players-list');
        if (ta) ta.value = '';
        var box = $('group-results');
        if (box) box.innerHTML = '';
        var stats = $('group-stats');
        if (stats) stats.innerHTML = '';
        var section = $('group-results-section');
        if (section) section.classList.add('hidden');
        updatePlayerCount();
    }

    function exportGroups() {
        var cards = document.querySelectorAll('#group-results .duel-card');
        if (!cards.length) {
            ui.notify('还没有可导出的分组结果', '提示');
            return;
        }
        var text = '🏸 羽毛球分组结果\n==================\n\n';
        Array.prototype.forEach.call(cards, function (card, index) {
            var names = Array.prototype.map.call(
                card.querySelectorAll('.duel-side-names span'),
                function (s) { return s.textContent; }
            );
            text += '第' + (index + 1) + '组：' + names.join(' & ') + '\n';
        });
        text += '\n生成时间：' + new Date().toLocaleString();
        ui.downloadText('分组结果_' + new Date().toISOString().slice(0, 10) + '.txt', text);
        ui.notify('分组结果已导出', '导出成功');
    }

    /* ---------- 分组历史 ---------- */
    function renderHistory() {
        var box = $('grouping-history-list');
        if (!box) return;
        var list = App.state.getGroupingHistory();
        if (!list.length) {
            box.innerHTML = '<div class="empty"><div class="empty-icon ic-box" data-icon="swords"></div>' +
                '<div class="empty-title">还没有分组记录</div>' +
                '<div class="empty-hint">生成分组后会自动保存最近 10 次</div></div>';
            return;
        }
        box.innerHTML = list.map(function (item, i) {
            var pairs = (item.groups || []).map(function (g) {
                return (g || []).map(function (p) {
                    return ui.escapeHtml(p && p.name ? p.name : '?');
                }).join(' & ');
            }).join(' ｜ ');
            return '<div class="history-row">' +
                '<div class="h-main">' +
                '<div class="h-teams">' + pairs + '</div>' +
                '<div class="h-meta"><span>' + new Date(item.date).toLocaleString() + '</span>' +
                '<span class="tag">' + ui.escapeHtml(item.modeName || item.mode || '') + '</span>' +
                '<span class="tag">' + (item.players ? item.players.length : 0) + ' 人</span></div>' +
                '</div>' +
                '<button type="button" class="btn btn-small btn-ghost" data-act="grouping:reuse" data-index="' + i +
                '" aria-label="复用第 ' + (i + 1) + ' 次分组">复用</button>' +
                '</div>';
        }).join('');
    }

    function reuse(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        var item = App.state.getGroupingHistory()[idx];
        if (!item || !item.groups) { ui.notify('该分组记录已损坏', '错误'); return; }
        displayGroups(item.groups, item.mode, null);
        ui.notify('已载入历史分组', '已复用');
    }

    /* ---------- 模式切换 ---------- */
    function setMode(el) {
        mode = el.getAttribute('data-mode') || 'random';
        document.querySelectorAll('[data-act="grouping:mode"]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-mode') === mode);
        });
        var skillCard = $('skill-card');
        if (skillCard) skillCard.classList.toggle('hidden', mode !== 'balanced');
        updateSkillInputs();
    }

    function onEnter() {
        updatePlayerCount();
        renderHistory();
        var last = App.state.lastGroups;
        if (last && Array.isArray(last) && last.length) {
            displayGroups(last, 'random', null);
        }
    }

    function init() {
        nav.on('grouping:mode', setMode);
        nav.on('grouping:generate', generate);
        nav.on('grouping:clear', clearGroups);
        nav.on('grouping:export', exportGroups);
        nav.on('grouping:quick-add', function (el) { quickAddPlayer(el.getAttribute('data-value')); });
        nav.on('grouping:remove-player', removePlayer);
        nav.on('grouping:reuse', reuse);
        /* 选完等级立刻记进 skillByName：不依赖「重建时再采集」，
           因为重建只发生在名单变化时，而这期间 DOM 里可能已被改过。
           配对基准用 builtFor（这份 DOM 是按它建的），不用当前名单。 */
        nav.on('grouping:skill', function (el) {
            var i = parseInt(el.getAttribute('data-index'), 10);
            var v = parseInt(el.value, 10);
            var name = builtFor[i];
            if (name !== undefined && v >= 1 && v <= 5) skillByName[name] = v;
        });
        nav.on('grouping:players-input', function () { updatePlayerCount(); });
    }

    App.grouping = {
        init: init,
        onEnter: onEnter,
        generate: generate,
        randomGrouping: randomGrouping,
        balancedGrouping: balancedGrouping,
        rotationGrouping: rotationGrouping,
        displayGroups: displayGroups,
        exportGroups: exportGroups,
        clearGroups: clearGroups,
        /* 供回归测试断言「界面上的等级确实被读成了算法输入」 */
        readSkills: readSkills
    };
})(window.App);
