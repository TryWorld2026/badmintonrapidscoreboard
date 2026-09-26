/* ================================================================
   match.js — 比赛计分（规则与旧版一致）
   - updateScore / undoScore：需 timerRunning（旧版即如此）
   - checkSideChange：21→11 / 15→8 / 11→6 / custom→floor(t/2)+1
   - checkGameEnd：deuce 30 分封顶，或达到目标分且领先 2 分
   - endGame：三局两胜由 settings.bestOfThree 决定（2 胜出），单局则 1 胜出
   - 高光：加分赛 / 赛点 / 落后 5 分以上反超
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var store = App.store;
    var fx = App.effects;
    var ui = App.ui;

    var timerInterval = null;

    /* 高光时刻（内存态，与旧版一致，不落盘）*/
    var highlightMoments = [];
    var wasLeadingTeamA = null;
    /* 换边提醒只报一次：旧代码用 total === N 精确相等，
       一旦跳分（改分 / 异常数据）就整局漏报。改成越过阈值即报 + 已报标记。 */
    var sideChangeAlerted = false;

    function $(id) { return document.getElementById(id); }

    /* 副作用保护：动画 / 音频 / 弹层出错只降级，不中断比赛状态机 */
    function safe(fn) {
        try { fn(); } catch (err) { /* 静默降级 */ }
    }

    /* 宽口径取数：非有限数字一律回退到默认值 */
    function num(v, d) {
        var n = typeof v === 'number' ? v : parseFloat(v);
        return isFinite(n) ? n : d;
    }

    function scoreA() { return App.state.match.scoreA; }
    function scoreB() { return App.state.match.scoreB; }

    /* ================================================================
       渲染
       ================================================================ */
    function render() {
        var m = App.state.match;
        var sa = $('score-a');
        var sb = $('score-b');
        if (sa) sa.textContent = m.scoreA;
        if (sb) sb.textContent = m.scoreB;

        var na = $('team-a-name');
        var nb = $('team-b-name');
        if (na && na.value !== m.teamNameA) na.value = m.teamNameA;
        if (nb && nb.value !== m.teamNameB) nb.value = m.teamNameB;

        var aa = $('team-a-avatar');
        var ab = $('team-b-avatar');
        if (aa) aa.textContent = App.avatars ? App.avatars.get(m.teamNameA) : '🏸';
        if (ab) ab.textContent = App.avatars ? App.avatars.get(m.teamNameB) : '🏸';

        var cg = $('current-game');
        if (cg) cg.textContent = '第 ' + m.currentGame + ' 局';

        var tv = $('timer-value');
        if (tv) {
            tv.textContent = formatTime(m.seconds);
            tv.classList.toggle('timer-paused', !m.timerRunning);
        }

        var tb = $('timer-btn-label');
        if (tb) tb.textContent = m.timerRunning ? '暂停' : (m.seconds > 0 ? '继续' : '开始');

        updateGamesWonDisplay();
        renderLeading();
        renderPointLog();
        renderMatchInfo();
    }

    function renderLeading() {
        var m = App.state.match;
        var ta = $('team-a-panel');
        var tb = $('team-b-panel');
        if (ta) ta.classList.toggle('leading', m.scoreA > m.scoreB);
        if (tb) tb.classList.toggle('leading', m.scoreB > m.scoreA);
    }

    function renderPointLog() {
        var box = $('point-log');
        if (!box) return;
        var h = App.state.match.scoreHistory;
        if (!h.length) {
            box.innerHTML = '<div class="empty"><div class="empty-icon ic-box" data-icon="list"></div>' +
                '<div class="empty-title">还没有得分</div>' +
                '<div class="empty-hint">点击「开始比赛」后用底部按钮加分</div></div>';
            return;
        }
        var html = '';
        var shown = 0;
        for (var i = h.length - 1; i >= 0 && shown < 40; i--) {
            var it = h[i];
            /* 坏条目（老数据 / 手改过的存档）单独跳过，不能让它把整张流水表搞死。
               真实条目的 oldScore / newScore 一定是有限数字，其余一律视为脏数据。 */
            if (!it || typeof it !== 'object') continue;
            if (it.oldScore == null || it.newScore == null) continue;
            if (!isFinite(it.oldScore) || !isFinite(it.newScore)) continue;
            shown++;
            var isA = it.team === 'a';
            var nm = isA ? App.state.match.teamNameA : App.state.match.teamNameB;
            html += '<div class="point-log-item ' + (isA ? 'a' : 'b') + '">' +
                '<span>' + ui.escapeHtml(nm) + '</span>' +
                '<span class="log-score">' + ui.escapeHtml(String(it.oldScore)) +
                ' → ' + ui.escapeHtml(String(it.newScore)) + '</span>' +
                '</div>';
        }
        if (!shown) {
            box.innerHTML = '<div class="empty"><div class="empty-icon ic-box" data-icon="list"></div>' +
                '<div class="empty-title">还没有得分</div>' +
                '<div class="empty-hint">点击「开始比赛」后用底部按钮加分</div></div>';
            return;
        }
        box.innerHTML = html;
    }

    function renderMatchInfo() {
        var box = $('match-info');
        if (!box) return;
        var s = App.state.settings;
        var modeName = s.gameMode === 'custom' ? ('自定义 ' + s.targetScore) : s.gameMode + ' 分制';
        /* 「加分赛」开关的实际语义只是「是否 30 分封顶」——关掉后依然要求
           领先 2 分（否则 21-20 就结束，不符合规则）。旧标签写成
           「加分赛开 / 加分赛关」会让人以为关掉就是先到目标分即胜，
           这里改成如实描述差异。 */
        box.innerHTML =
            '<span class="tag tag-brand">' + ui.escapeHtml(modeName) + '</span>' +
            '<span class="tag">' + (s.bestOfThree ? '三局两胜' : '单局') + '</span>' +
            '<span class="tag">' + (s.deuceMode ? '30 分封顶' : '无封顶') + '</span>' +
            '<span class="grow text-3">目标 ' + App.state.targetScore() + ' 分</span>';
    }

    function formatTime(sec) {
        var s = Math.max(0, Math.floor(sec || 0));
        var m = Math.floor(s / 60);
        var r = s % 60;
        return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
    }

    /* 需要赢几局才算整场结束：设置里关掉「三局两胜」就是单局 1 胜出。
       旧代码硬编码 >= 2，导致「单局」开关被完整持久化、完整展示，
       却在 endGame 里完全不参与判定。 */
    function gamesNeeded() {
        return App.state.settings.bestOfThree ? 2 : 1;
    }

    function updateGamesWonDisplay() {
        var m = App.state.match;
        /* 单局模式只画 1 个点，别再画 3 个 */
        var maxGames = gamesNeeded() === 1 ? 1 : 3;
        var a = $('games-won-a');
        var b = $('games-won-b');
        var ha = '';
        var hb = '';
        for (var i = 0; i < maxGames; i++) {
            ha += '<div class="game-dot' + (i < m.gamesWonA ? ' won' : '') + '"></div>';
            hb += '<div class="game-dot' + (i < m.gamesWonB ? ' won' : '') + '"></div>';
        }
        if (a) a.innerHTML = ha;
        if (b) b.innerHTML = hb;
        var ca = $('games-count-a');
        var cb = $('games-count-b');
        if (ca) ca.textContent = m.gamesWonA;
        if (cb) cb.textContent = m.gamesWonB;
    }

    /* ================================================================
       持久化
       ================================================================ */
    function saveMatchState() { App.state.saveMatch(); }

    function loadMatchState() {
        var raw = store.readJSON(store.KEYS.MATCH_STATE, null);
        if (!raw || typeof raw !== 'object') return false;
        App.state.match = App.state.normalizeMatch(raw);
        /* B2/B3 修复：局分写 games-count-a/b，队名写 input.value */
        render();
        /* 旧版在刷新后不会恢复计时器运行态，这里补上，让「刷新后续赛」真正可用 */
        if (App.state.match.timerRunning) startTimerInterval();
        return true;
    }

    function clearMatchState() { store.remove(store.KEYS.MATCH_STATE); }

    /* ================================================================
       计时器
       ================================================================ */
    function startTimerInterval() {
        stopTimerInterval();
        timerInterval = window.setInterval(tick, 1000);
    }

    function stopTimerInterval() {
        if (timerInterval) { window.clearInterval(timerInterval); timerInterval = null; }
    }

    function tick() {
        App.state.match.seconds++;
        var tv = $('timer-value');
        if (tv) tv.textContent = formatTime(App.state.match.seconds);
        /* 每 30 秒落盘一次，避免频繁写 */
        if (App.state.match.seconds % 30 === 0) saveMatchState();
    }

    function toggleTimer() {
        var m = App.state.match;
        if (m.timerRunning) {
            m.timerRunning = false;
            stopTimerInterval();
            fx.clickSound();
        } else {
            m.timerRunning = true;
            startTimerInterval();
            fx.unlockAudio();
            fx.pointSound();
            fx.vibrate(20);
        }
        saveMatchState();
        render();
    }

    function resetTimer() {
        stopTimerInterval();
        App.state.match.seconds = 0;
        App.state.match.timerRunning = false;
        saveMatchState();
        render();
    }

    /* ================================================================
       记分
       ================================================================ */
    function updateScore(team, amount) {
        var m = App.state.match;
        if (!m.timerRunning) {
            ui.notify('请先点击「开始比赛」按钮开始计时！', '提示');
            return;
        }

        /* amount 是外部可传的公开参数：缺省按 +1，非有限数字直接拒掉。
           否则 oldScore + undefined = NaN，NaN 会灌进 scoreA / scoreHistory，
           之后局末判定、换边提示全部失灵，得分流水也会整表变空白。 */
        amount = Number(amount);
        if (!isFinite(amount)) amount = 1;

        var oldScore = num(team === 'a' ? m.scoreA : m.scoreB, 0);
        var newScore = Math.max(0, oldScore + amount);

        m.scoreHistory.push({ team: team, oldScore: oldScore, newScore: newScore, timestamp: Date.now() });

        if (team === 'a') m.scoreA = newScore;
        else m.scoreB = newScore;

        var el = $(team === 'a' ? 'score-a' : 'score-b');
        fx.bumpScore(el);
        var panel = $(team === 'a' ? 'team-a-panel' : 'team-b-panel');
        /* 脉冲色从令牌层取，不再手抄 rgba(255,46,99,.30) / rgba(0,229,255,.30) */
        var pulse = team === 'a'
            ? App.tokens.alpha(App.tokens.get('--c-team-a', '#FF2E63'), 0.30)
            : App.tokens.alpha(App.tokens.get('--c-team-b', '#00E5FF'), 0.30);
        fx.scorePulse(panel, pulse);

        if (amount > 0) { fx.pointSound(); fx.vibrate(50); }
        else { fx.clickSound(); fx.vibrate([30, 30, 30]); }

        render();
        checkSideChange();
        checkHighlights();
        checkGameEnd();
        saveMatchState();
    }

    function undoScore() {
        var m = App.state.match;
        if (!m.timerRunning) {
            ui.notify('请先点击「开始比赛」按钮开始计时！', '提示');
            return;
        }
        if (m.scoreHistory.length === 0) {
            ui.notify('当前没有可撤回的得分', '提示');
            return;
        }
        var last = m.scoreHistory.pop();
        if (!last || typeof last !== 'object') { saveMatchState(); render(); return; }
        var back = num(last.oldScore, 0);
        if (last.team === 'a') m.scoreA = back;
        else m.scoreB = back;

        fx.clickSound();
        fx.vibrate([30, 30, 30]);
        render();
        saveMatchState();
    }

    /* ================================================================
       换边提醒
       ================================================================ */
    /* 换边提醒：越过阈值即报，且每局只报一次。
       旧代码是 total === N 精确相等，跳分（改分、异常数据、中途开提醒）
       会整局漏掉；三个 target 分支算出来的 switchPoint 本来就相同，合并成一条。 */
    function checkSideChange() {
        if (!App.state.settings.sideChangeAlert) return;
        var m = App.state.match;
        var total = m.scoreA + m.scoreB;
        var target = App.state.targetScore();
        var switchPoint = Math.floor(target / 2) + 1;

        if (total >= switchPoint && !sideChangeAlerted) {
            sideChangeAlerted = true;
            ui.notify('双方得分之和达到 ' + switchPoint + ' 分，请交换场地！', '换边提醒');
        }
    }

    /* ================================================================
       本局结束判定
       ================================================================ */
    function checkGameEnd() {
        var m = App.state.match;
        var s = App.state.settings;
        var target = App.state.targetScore();
        var gameEnded = false;

        if (s.deuceMode) {
            if (m.scoreA >= 30 || m.scoreB >= 30) {
                gameEnded = true;
            } else if ((m.scoreA >= target || m.scoreB >= target) && Math.abs(m.scoreA - m.scoreB) >= 2) {
                gameEnded = true;
            }
        } else {
            if ((m.scoreA >= target || m.scoreB >= target) && Math.abs(m.scoreA - m.scoreB) >= 2) {
                gameEnded = true;
            } else if (m.scoreA >= target && m.scoreB >= target) {
                ui.notify('双方同时达到目标分数，请继续比赛直到领先 2 分！', '平局');
            }
        }

        if (gameEnded) endGame();
    }

    function endGame() {
        var m = App.state.match;
        if (!m.timerRunning && m.scoreA === 0 && m.scoreB === 0) {
            ui.notify('请先点击「开始比赛」按钮开始计时！', '提示');
            return;
        }

        var winner = '';
        if (m.scoreA > m.scoreB) {
            m.gamesWonA++;
            winner = m.teamNameA || '己方';
        } else if (m.scoreB > m.scoreA) {
            m.gamesWonB++;
            winner = m.teamNameB || '对方';
        } else {
            ui.notify('双方比分相同，请继续比赛！', '平局');
            return;
        }

        m.gameScoresHistory.push(m.scoreA + '-' + m.scoreB);
        updateGamesWonDisplay();

        /* 局数上限跟随设置，不再硬编码 2 */
        var need = gamesNeeded();
        var matchOver = (m.gamesWonA >= need || m.gamesWonB >= need);

        if (matchOver) {
            if (m.timerRunning) {
                stopTimerInterval();
                m.timerRunning = false;
            }
        } else {
            /* 先落状态再做副作用：动画/音频异常不能把局数卡住 */
            m.currentGame++;
        }

        safe(function () {
            if (matchOver) {
                ui.notify(winner + ' 获胜！\n最终比分: ' + m.gamesWonA + ' : ' + m.gamesWonB, '比赛结束');
                fx.winSound();
                openResultSheet();
                window.setTimeout(function () {
                    fx.victoryBanner(winner + ' 获胜！', '最终比分 ' + m.gamesWonA + ' : ' + m.gamesWonB);
                }, 500);
            } else {
                ui.notify(winner + ' 赢得第 ' + (m.currentGame - 1) + ' 局！\n比分: ' +
                    m.scoreA + ' - ' + m.scoreB, '本局结束');
                fx.beep(660, 0.18, 'sine');
            }
        });

        if (!matchOver) resetCurrentGame();
        saveMatchState();
    }

    function resetCurrentGame() {
        var m = App.state.match;
        m.scoreA = 0;
        m.scoreB = 0;
        m.scoreHistory = [];
        wasLeadingTeamA = null;
        sideChangeAlerted = false;
        render();
        saveMatchState();
    }

    /* opts.silent：保存成功后自动重置时传 true。
       那条路径上记录已经落盘，重置不损失任何数据，
       旧代码却照样弹「此操作不可撤销！」的红色确认框，纯属吓人。 */
    function resetMatch(opts) {
        var m = App.state.match;
        var silent = !!(opts && opts.silent === true);
        var hasProgress = m.scoreA > 0 || m.scoreB > 0 || m.gamesWonA > 0 || m.gamesWonB > 0 || m.seconds > 0;

        function doReset() {
            m.scoreA = 0;
            m.scoreB = 0;
            m.gamesWonA = 0;
            m.gamesWonB = 0;
            m.currentGame = 1;
            m.scoreHistory = [];
            m.gameScoresHistory = [];
            resetTimer();
            resetHighlights();
            clearMatchState();
            closeResultSheet();
            render();
            ui.notify('比赛已重置', '已重置');
        }

        if (hasProgress && !silent) {
            ui.showConfirm({
                title: '重置整场比赛？',
                message: '当前局分 ' + m.gamesWonA + ' : ' + m.gamesWonB +
                    '，比赛时长 ' + formatTime(m.seconds) + '。此操作不可撤销！',
                okText: '重置',
                danger: true,
                onConfirm: doReset
            });
        } else {
            doReset();
        }
    }

    /* ================================================================
       高光时刻
       ================================================================ */
    function recordHighlight(type, message) {
        highlightMoments.push({
            type: type,
            message: message,
            timestamp: Date.now(),
            scoreA: App.state.match.scoreA,
            scoreB: App.state.match.scoreB,
            currentGame: App.state.match.currentGame
        });
    }

    function checkHighlights() {
        var m = App.state.match;
        var s = App.state.settings;
        var target = App.state.targetScore();

        if (s.deuceMode && m.scoreA >= 20 && m.scoreB >= 20) {
            if (highlightMoments.filter(function (h) {
                return h.type === 'deuce' && h.currentGame === m.currentGame;
            }).length === 0) {
                recordHighlight('deuce', '进入加分赛！');
                ui.showHighlight('sliders', '加分赛！', '双方比分 20 平，进入加分赛！');
            }
        }

        if (m.scoreA >= target - 1 || m.scoreB >= target - 1) {
            var existing = highlightMoments.find(function (h) {
                return h.type === 'matchpoint' && h.currentGame === m.currentGame;
            });
            if (!existing) {
                var team = m.scoreA >= target - 1 ? m.teamNameA : m.teamNameB;
                recordHighlight('matchpoint', team + ' 赛点！');
                ui.showHighlight('bolt', '赛点！', team + ' 拿到赛点！');
            }
        }

        if (m.scoreA > 0 && m.scoreB > 0) {
            var lead = m.scoreA - m.scoreB;
            if (lead === 0) {
                /* 平手时谁也不领先：旧代码在这里把 wasLeadingTeamA 置成
                   (lead > 0) === false，等同于提前认定「乙领先」，
                   之后甲只要拉开 5 分就误报一次「甲 落后 5 分以上后反超」。
                   平局不改变领先认知，直接跳过。 */
            } else if (wasLeadingTeamA === null) {
                wasLeadingTeamA = lead > 0;
            } else if (wasLeadingTeamA && lead < -5) {
                /* 乙反超：旧代码 recordHighlight 传乙、showHighlight 传甲，
                   字幕把功劳安到了从未落后的人头上。统一用同一个变量。 */
                fireComeback(m.teamNameB);
                wasLeadingTeamA = false;
            } else if (!wasLeadingTeamA && lead > 5) {
                fireComeback(m.teamNameA);
                wasLeadingTeamA = true;
            }
        }
    }

    /* 大逆转：文案和记录用同一个队名，避免再次出现「说的是 A、记的是 B」 */
    function fireComeback(teamName) {
        recordHighlight('comeback', teamName + ' 大逆转！');
        ui.showHighlight('flame', '大逆转！', teamName + ' 落后 5 分以上后反超！');
    }

    function resetHighlights() {
        highlightMoments = [];
        wasLeadingTeamA = null;
        sideChangeAlerted = false;
    }

    /* 零封判定扫「已结束的局」，不再看当前局比分。
       旧写法读 scoreA/scoreB，第二局开局 0-0 时必然误报「零封胜利」，
       分享卡和存入的历史记录都会带上一个假标签。 */
    function hasShutoutGame() {
        return App.state.match.gameScoresHistory.some(function (s) {
            var p = String(s).split('-');
            var a = parseInt(p[0], 10);
            var b = parseInt(p[1], 10);
            if (!isFinite(a) || !isFinite(b)) return false;
            return (a > 0 && b === 0) || (b > 0 && a === 0);
        });
    }

    function getHighlightsSummary() {
        var summary = [];
        if (highlightMoments.filter(function (h) { return h.type === 'deuce'; }).length > 0) {
            summary.push('加分赛');
        }
        if (highlightMoments.filter(function (h) { return h.type === 'comeback'; }).length > 0) {
            summary.push('大逆转');
        }
        if (hasShutoutGame()) {
            summary.push('零封胜利');
        }
        return summary;
    }

    function checkPerfectWin() {
        return hasShutoutGame();
    }

    /* 加分赛判定改成看已记录的高光，不再读当前局比分。
       saveMatchResult() 是在 endGame() → resetCurrentGame() 之后跑的，
       那时比分已被清零，旧写法 scoreA>=20 && scoreB>=20 恒为 false，
       「加分赛专家」这个成就永远不可能解锁。 */
    function checkHadDeuce() {
        return highlightMoments.some(function (h) { return h.type === 'deuce'; });
    }

    function getGameScores() { return App.state.match.gameScoresHistory.join(', '); }

    /* ================================================================
       比赛结果
       ================================================================ */
    function openResultSheet() {
        var m = App.state.match;
        var an = $('result-team-a-names');
        var bn = $('result-team-b-names');
        if (an) an.value = '';
        if (bn) bn.value = '';

        var winSide = $('result-win');
        if (winSide) {
            winSide.textContent = m.gamesWonA > m.gamesWonB ? m.teamNameA : m.teamNameB;
        }

        var sa = $('result-score-a');
        var sb = $('result-score-b');
        if (sa) sa.textContent = m.gamesWonA;
        if (sb) sb.textContent = m.gamesWonB;

        var na = $('result-name-a');
        var nb = $('result-name-b');
        if (na) na.textContent = m.teamNameA;
        if (nb) nb.textContent = m.teamNameB;

        var pa = $('result-panel-a');
        var pb = $('result-panel-b');
        if (pa) pa.classList.toggle('win', m.gamesWonA > m.gamesWonB);
        if (pb) pb.classList.toggle('win', m.gamesWonB > m.gamesWonA);

        var gs = $('result-games');
        if (gs) gs.textContent = getGameScores() || '—';

        var du = $('result-duration');
        if (du) du.textContent = formatTime(m.seconds);

        var hl = $('result-highlights');
        if (hl) {
            var list = getHighlightsSummary();
            var hc = $('result-hl-count');
            if (hc) hc.textContent = list.length ? (list.length + ' 个') : '0';
            if (list.length) {
                hl.innerHTML = list.map(function (t) {
                    return '<div class="highlight-item"><span class="hi-icon">' +
                        t.slice(0, 2) + '</span><span class="hi-title">' + t.slice(2).trim() + '</span></div>';
                }).join('');
            } else {
                hl.innerHTML = '<div class="empty"><div class="empty-icon ic-box" data-icon="shuttle"></div>' +
                    '<div class="empty-title">本场没有高光时刻</div></div>';
            }
        }

        nav.openSheet('result-sheet');
    }

    function closeResultSheet() { nav.closeSheet('result-sheet'); }

    function saveMatchResult() {
        var m = App.state.match;
        var teamANames = ($('result-team-a-names') || {}).value || m.teamNameA;
        var teamBNames = ($('result-team-b-names') || {}).value || m.teamNameB;

        var matchResult = {
            id: Date.now(),
            teamA: teamANames,
            teamB: teamBNames,
            scoreA: m.gamesWonA,
            scoreB: m.gamesWonB,
            gameScores: getGameScores(),
            duration: m.seconds,
            date: new Date().toISOString(),
            mode: App.state.settings.gameMode,
            highlights: getHighlightsSummary()
        };

        App.state.pushMatchHistory(matchResult);

        var won = m.gamesWonA > m.gamesWonB;
        if (App.achievements) App.achievements.updateMatchAchievements(won, checkPerfectWin(), checkHadDeuce());

        ui.notify('比赛记录已保存！', '保存成功');
        closeResultSheet();
        if (App.stats) App.stats.refreshAll();
        /* 记录已入历史，这里直接重置，不再弹破坏性确认 */
        resetMatch({ silent: true });
    }

    /* ================================================================
       模式设置
       ================================================================ */
    function setGameMode(mode) {
        var s = App.state.settings;
        var custom = $('custom-score');
        s.gameMode = mode;
        if (mode === 'custom') {
            s.targetScore = custom ? (parseInt(custom.value, 10) || 21) : 21;
        } else {
            s.targetScore = parseInt(mode, 10) || 21;
        }
        App.state.saveSettings();
        renderMatchInfo();
    }

    /* ================================================================
       队伍名 / 头像
       ================================================================ */
    function setTeamName(team, name) {
        var v = (name || '').trim();
        if (!v) return;
        var m = App.state.match;
        if (team === 'a') m.teamNameA = v; else m.teamNameB = v;
        saveMatchState();
        render();
    }

    /* ================================================================
       注册 & 启动
       ================================================================ */
    function init() {
        nav.on('match:score', function (el) { updateScore(el.getAttribute('data-team'), 1); });
        nav.on('match:undo', function () { undoScore(); });
        nav.on('match:timer', function () { toggleTimer(); });
        nav.on('match:reset-game', function () {
            ui.showConfirm({
                title: '重置本局比分？',
                message: '当前局比分将清零，局分保留。',
                okText: '重置本局',
                danger: true,
                onConfirm: function () {
                    resetCurrentGame();
                    ui.notify('本局比分已重置', '已重置');
                }
            });
        });
        nav.on('match:reset', function () { resetMatch(); });
        nav.on('match:save-result', function () { saveMatchResult(); });
        nav.on('match:share', function () {
            if (App.share) App.share.openForCurrentMatch();
        });
        nav.on('match:mode', function (el) { setGameMode(el.getAttribute('data-mode')); });
        nav.on('match:team-name', function (el) {
            setTeamName(el.getAttribute('data-team'), el.value);
        });
        nav.on('match:quick-action', function (el) {
            quickAction(el.getAttribute('data-action'));
        });
    }

    /* 双击顶栏弹出的快捷操作（旧版 quickAction，switchScreen 已由 nav.go 取代）*/
    function quickAction(action) {
        switch (action) {
            case 'newMatch':
                nav.go('score');
                resetMatch();
                break;
            case 'randomTeam':
                nav.go('match', 'grouping');
                break;
            case 'splitCost':
                nav.go('match', 'expense');
                break;
            case 'viewStats':
                nav.go('data', 'history');
                break;
        }
    }

    App.match = {
        init: init,
        render: render,
        updateScore: updateScore,
        undoScore: undoScore,
        toggleTimer: toggleTimer,
        resetTimer: resetTimer,
        resetCurrentGame: resetCurrentGame,
        resetMatch: resetMatch,
        setGameMode: setGameMode,
        checkGameEnd: checkGameEnd,
        checkSideChange: checkSideChange,
        checkHighlights: checkHighlights,
        getHighlightsSummary: getHighlightsSummary,
        checkPerfectWin: checkPerfectWin,
        checkHadDeuce: checkHadDeuce,
        getGameScores: getGameScores,
        saveMatchResult: saveMatchResult,
        openResultSheet: openResultSheet,
        closeResultSheet: closeResultSheet,
        loadMatchState: loadMatchState,
        saveMatchState: saveMatchState,
        clearMatchState: clearMatchState,
        resetHighlights: resetHighlights,
        formatTime: formatTime,
        quickAction: quickAction
    };
})(window.App);
