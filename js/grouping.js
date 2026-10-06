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

    /* 轮换赛制的现场状态（每个人上了几局 / 最后上场时间），只存本地 */
    var ROTATION_KEY = 'rotationHistory';

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

    /* ================================================================
       轮换赛制 —— 公平轮转排阵

       ⚠️ 这一段原来叫 rotationGrouping，做的事是「枚举所有两人组合」
       （双层 for 循环，C(n,2)）。它和界面上写的「轮换赛制」、
       README 承诺的「告别固定搭档的尴尬」完全对不上：
         - 恰恰制造了固定搭档 —— 每对人都会出现，且只出现一次，
           排下来就是「甲乙、丙丁…」，之后又是另一批组合，
           没有任何「谁该上场」的判断；
         - 产出规模爆炸：12 人 66 组、20 人 190 组、50 人 1225 组，
           一次性 innerHTML 进去，手机上直接卡死。

       真正的「轮换」要回答的是球局里的那个具体问题：
         6 个人 2 块场地打两小时，谁该上场了？
         靠人喊的结果是「某人连打 4 局」或「有人一直坐冷板凳」。

       下面这套算法与服务端 sessions.ts 的 nextRotation 同源
       （上场少的优先 → 休息久的优先 → 避免重复搭档），
       但不依赖数据库：从本地保存的历史里统计，按「下一轮」排。

       只排下一轮，不排整个赛程 —— 球局是动态的，排太远一定被现实打乱。
       ================================================================ */

    /* 轮换赛制的历史：一轮一组，记录每个人上了几次、最后上场时间。
       存在本地（store 的 lastRotation 键），换设备不跟随 —— 这是有意的：
       轮换是「今天这场球」的现场状态，不是个人档案。 */
    function readRotationHistory() {
        var raw = App.store.readJSON(ROTATION_KEY, null);
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : { rounds: 0, played: {}, lastAt: {} };
    }

    function writeRotationHistory(h) {
        App.store.writeJSON(ROTATION_KEY, h);
    }

    function resetRotationHistory() {
        writeRotationHistory({ rounds: 0, played: {}, lastAt: {} });
    }

    /* 排下一轮。
       players  名单（至少 4 人）
       courts   场地数，默认 1
       record   是否把这一轮记进历史（generate 传 true；纯预览传 false）
       返回 { groups: [[人,...], ...], resting: [人,...], round: 第几轮, stats: [...] }

       组队：每 4 人一场，组内首尾配对（1+4 / 2+3），
       与服务端一致 —— 避免一队碾压。 */
    function planRotation(players, courts, record) {
        var hist = readRotationHistory();
        var played = hist.played || {};
        var lastAt = hist.lastAt || {};
        var n = players.length;
        var courtCount = Math.max(1, courts || 1);
        /* 双打每场 4 人；场地太多时人不够，按实际能排的场次封顶
           （6 人开 2 块地物理上排不出来，只排 1 场，剩下的人轮休） */
        var canCourt = Math.max(1, Math.floor(n / 4));
        if (courtCount > canCourt) courtCount = canCourt;

        /* 排序：上场少的优先 → 休息久的优先 → 原名单顺序（稳定）
           用 index 做 tiebreak，避免每次结果都跳。 */
        var order = players.map(function (name, i) {
            return { name: name, i: i, c: played[name] || 0, last: lastAt[name] || 0 };
        });
        order.sort(function (a, b) {
            if (a.c !== b.c) return a.c - b.c;          /* 上场少的优先 */
            if (a.last !== b.last) return a.last - b.last;  /* 休息久的优先 */
            return a.i - b.i;                          /* 稳定 */
        });

        var need = courtCount * 4;
        var playing = order.slice(0, need);
        var resting = order.slice(need);

        var groups = [];
        for (var c = 0; c < courtCount; c++) {
            var four = playing.slice(c * 4, c * 4 + 4);
            if (four.length < 4) break;
            /* 首尾配对：[0,3] 一队、[1,2] 一队 */
            groups.push([
                { name: four[0].name, skill: 3 },
                { name: four[3].name, skill: 3 },
                { name: four[1].name, skill: 3 },
                { name: four[2].name, skill: 3 }
            ]);
        }

        var result = {
            groups: groups,
            resting: resting.map(function (p) { return p.name; }),
            round: (hist.rounds || 0) + 1,
            stats: order.map(function (p) {
                return { name: p.name, played: p.c, onBench: resting.indexOf(p) >= 0 };
            })
        };

        /* record=true 时顺手把这一轮记进历史，让「下一轮」真的会换人。
           generate() 传 true；纯预览（例如只想看看排谁）传 false。 */
        if (record) commitRotationRound(players, groups);

        return result;
    }

    /* 把这一轮记进历史，供下一轮排序用。
       注意：只在「生成下一轮」时累计，不在用户反复点「重新生成」时累加 ——
       否则多点几次就会假装每个人都打了很多场。 */
    function commitRotationRound(players, groups) {
        var hist = readRotationHistory();
        var played = hist.played || {};
        var lastAt = hist.lastAt || {};
        var now = Date.now();
        groups.forEach(function (g) {
            g.forEach(function (p) {
                played[p.name] = (played[p.name] || 0) + 1;
                lastAt[p.name] = now;
            });
        });
        /* 只保留本次名单里的人，避免换了一拨人后统计无限膨胀 */
        var keepPlayed = {}, keepLast = {};
        players.forEach(function (name) {
            if (played[name] !== undefined) keepPlayed[name] = played[name];
            if (lastAt[name] !== undefined) keepLast[name] = lastAt[name];
        });
        writeRotationHistory({ rounds: (hist.rounds || 0) + 1, played: keepPlayed, lastAt: keepLast });
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
        var rotation = null;

        if (mode === 'balanced') {
            groups = balancedGrouping(players, skills);
        } else if (mode === 'rotation') {
            rotation = planRotation(players, readCourtCount(), true);
            if (!rotation.groups.length) {
                ui.notify('人不够排满一场（双打需要 4 人）', '提示');
                return;
            }
            groups = rotation.groups;
        } else {
            groups = randomGrouping(players);
        }

        displayGroups(groups, mode, skills);
        if (rotation) displayRotationMeta(rotation);
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

    function readCourtCount() {
        var el = $('court-count');
        var n = el ? parseInt(el.value, 10) : NaN;
        return (isFinite(n) && n >= 1) ? Math.min(n, 8) : 1;
    }

    /* 轮换赛制额外要展示「谁在替补、谁已打几局」。
       算法不透明的话球友会觉得不公平 —— 这与服务端 nextRotation
       返回 stats 是同一个理由。 */
    function displayRotationMeta(rotation) {
        var box = $('rotation-meta');
        if (!box) return;

        var rows = rotation.stats.map(function (s) {
            var state = s.onBench ? '轮休' : ('已打 ' + s.played + ' 局');
            return '<div class="rotation-row' + (s.onBench ? ' is-bench' : '') + '">' +
                '<span class="rotation-name">' + ui.escapeHtml(s.name) + '</span>' +
                '<span class="rotation-state">' + state + '</span>' +
                '</div>';
        }).join('');

        box.innerHTML =
            '<div class="rotation-round">第 ' + rotation.round + ' 轮' +
            (rotation.resting.length
                ? ' · ' + rotation.resting.length + ' 人轮休'
                : ' · 全部上场') + '</div>' +
            '<div class="rotation-list">' + rows + '</div>' +
            '<div class="rotation-hint">下一轮优先让「已打局数最少」的人上场，' +
            '并按「休息最久」打破平局。轮换记录只存在这台设备上。</div>';
        box.classList.remove('hidden');
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
        var courtCard = $('court-card');
        if (courtCard) courtCard.classList.toggle('hidden', mode !== 'rotation');
        /* 切走时把上一轮的结果藏起来，免得留在别的模式下误导 */
        var meta = $('rotation-meta');
        if (meta && mode !== 'rotation') meta.classList.add('hidden');
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
        /* 轮换排阵：返回 { groups, resting, round, stats } */
        planRotation: planRotation,
        resetRotationHistory: resetRotationHistory,
        displayGroups: displayGroups,
        exportGroups: exportGroups,
        clearGroups: clearGroups,
        /* 供回归测试断言「界面上的等级确实被读成了算法输入」 */
        readSkills: readSkills
    };
})(window.App);
