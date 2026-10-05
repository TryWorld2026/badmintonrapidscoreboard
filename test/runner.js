/* ================================================================
   test/runner.js — 回归测试

   设计约束：项目无构建、无框架、无依赖，所以测试也不引入任何依赖。
   做法是开一个 iframe 加载真实的 index.html，断言全部打在发布物
   本身（同一个 App 命名空间、同一份 DOM），而不是 DOM 替身——
   替身只能证明替身是对的。

   每条用例对应 v2.0.1 修复清单里的一处缺陷，防的是「最容易再退化」
   的那几类：开关存在但不参与判定、读错了状态源。

   运行：需要 http(s) 通道（file:// 下 iframe 跨域取不到 App，SW 也不注册）。
       python -m http.server 8899
       浏览器打开 http://127.0.0.1:8899/test.html
   ================================================================ */
(function () {
    'use strict';

    var frame = document.getElementById('app-frame');
    var listEl = document.getElementById('results');
    var summaryEl = document.getElementById('summary');
    var barEl = document.getElementById('bar-fill');

    var results = [];
    var currentGroup = null;
    var win = null;   // iframe window
    var doc = null;   // iframe document
    var app = null;   // iframe App

    /* ---------- 断言原语 ---------- */

    function assert(cond, msg) {
        if (!cond) throw new Error(msg || '断言失败');
    }

    function eq(actual, expected, msg) {
        var a = JSON.stringify(actual);
        var b = JSON.stringify(expected);
        if (a !== b) {
            throw new Error((msg || '不相等') + '：期望 ' + b + '，实际 ' + a);
        }
    }

    function contains(haystack, needle, msg) {
        if (String(haystack).indexOf(needle) < 0) {
            throw new Error((msg || '未包含') + '：' + JSON.stringify(needle) +
                ' 不在 ' + JSON.stringify(String(haystack).slice(0, 200)));
        }
    }

    function notContains(haystack, needle, msg) {
        if (String(haystack).indexOf(needle) >= 0) {
            throw new Error((msg || '不应包含') + '：' + JSON.stringify(needle) +
                ' 却出现在 ' + JSON.stringify(String(haystack).slice(0, 200)));
        }
    }

    /* ---------- 输出 ---------- */

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function paint() {
        var pass = results.filter(function (r) { return r.ok; }).length;
        var fail = results.length - pass;
        listEl.innerHTML = results.map(function (r) {
            var detail = r.detail ? '<div class="detail">' + escapeHtml(r.detail) + '</div>' : '';
            return '<li class="' + (r.ok ? 'ok' : 'fail') + '"><span class="mark">' +
                (r.ok ? 'PASS' : 'FAIL') + '</span><span class="name">' +
                escapeHtml(r.name) + '</span>' + detail + '</li>';
        }).join('');
        summaryEl.textContent = pass + ' 通过 / ' + fail + ' 失败 / 共 ' + results.length;
        summaryEl.className = fail === 0 && results.length > 0 ? 'all-pass' : 'has-fail';
        barEl.style.width = (results.length ? (pass / results.length * 100) : 0) + '%';
        document.title = (fail === 0 && results.length > 0 ? '✔ ' : '✘ ') +
            pass + '/' + results.length + ' — 回归测试';
        window.__testResults = { pass: pass, fail: fail, total: results.length, items: results };
    }

    function logGroup(title) {
        var li = document.createElement('li');
        li.className = 'group';
        li.textContent = title;
        listEl.appendChild(li);
    }

    async function test(group, name, fn) {
        if (group !== currentGroup) {
            currentGroup = group;
            logGroup(group);
        }
        try {
            await fn();
            results.push({ group: group, name: name, ok: true, detail: '' });
        } catch (e) {
            results.push({ group: group, name: name, ok: false, detail: e && e.message });
        }
        paint();
    }

    /* ---------- iframe 生命周期 ---------- */

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function waitBoot() {
        return new Promise(function (resolve, reject) {
            var t0 = Date.now();
            (function poll() {
                var w;
                try { w = frame.contentWindow; } catch (e) { w = null; }
                if (w && w.App && w.App.match && w.App.expense && w.App.nav &&
                    w.document.documentElement.classList.contains('app-ready')) {
                    resolve();
                } else if (Date.now() - t0 > 20000) {
                    reject(new Error('等待应用启动超时（是否用 file:// 打开的？需要 http 通道）'));
                } else {
                    setTimeout(poll, 50);
                }
            })();
        });
    }

    function bind() {
        win = frame.contentWindow;
        doc = win.document;
        app = win.App;
        /* 测试期间不弹 toast：它会抢焦点、带定时器，干扰断言 */
        app.ui.notify = function () { };
    }

    function dismissOnboarding() {
        var ob = doc.getElementById('onboarding');
        if (ob && !ob.hidden) {
            var skip = ob.querySelector('[data-act="ui:onboard-skip"]');
            if (skip) skip.click();
        }
    }

    /* 每个分组开头调用：清空持久化状态后重载 iframe，保证用例之间不互相污染。

       必须等 iframe 的 load 事件再waitBoot：location.reload() 是异步的，
       旧文档在被拆除前仍暴露着上一份 App，直接 poll 会绑定到旧对象上，
       于是读写全是 detached DOM —— 表现是偶发的空值，极难复现。 */
    async function fresh() {
        var loaded = new Promise(function (resolve) {
            frame.addEventListener('load', resolve, { once: true });
        });
        try { win && win.localStorage.clear(); } catch (e) { /* 首次调用时 win 未绑定 */ }
        frame.contentWindow.location.reload();
        await loaded;
        await waitBoot();
        bind();
        dismissOnboarding();
        await sleep(150);
    }

    /* ---------- 业务辅助 ---------- */

    /* 按指定设置摆一场新比赛。队名显式取甲乙，断言才好读。 */
    function setupMatch(opts) {
        opts = opts || {};
        var s = app.state.settings;
        s.bestOfThree = opts.bestOfThree !== false;   // 默认三局两胜
        s.gameMode = opts.gameMode || '21';
        s.targetScore = opts.targetScore || 21;
        s.deuceMode = opts.deuceMode !== false;
        s.sideChangeAlert = opts.sideChangeAlert !== false;
        app.state.match = app.state.normalizeMatch(null);
        app.state.match.teamNameA = '甲';
        app.state.match.teamNameB = '乙';
        app.state.match.timerRunning = true;
        app.match.render();
    }

    /* 加到指定分数即停。两个必须：
       1. 每轮重读 app.state.match，不能把引用缓存到循环外；
       2. 局末必须收手 —— 否则会顺着下一局继续加分，把整场打成 21-0，
          既让局数判断失真，也会伪造出「零封胜利」。 */
    function scoreTo(team, n) {
        var key = 'score' + team.toUpperCase();
        var guard = 0;
        while (guard++ < 500) {
            var m = app.state.match;
            if (m[key] >= n) return;
            var game = m.currentGame;
            app.match.updateScore(team, 1);
            var after = app.state.match;
            if (after.currentGame !== game) return;   /* 本局刚结束 */
            if (!after.timerRunning) return;           /* 整场刚结束 */
        }
    }

    /* 拦住 ui.showHighlight，记录用户实际看到的字幕 */
    function spyHighlights() {
        var seen = [];
        app.ui.showHighlight = function (icon, title, subtitle) {
            seen.push({ icon: icon, title: title, subtitle: subtitle });
        };
        return seen;
    }

    function dots(side) {
        return doc.querySelectorAll('#games-won-' + side + ' .game-dot').length;
    }

    function summary() { return app.match.getHighlightsSummary().join(','); }

    /* ================================================================
       用例
       ================================================================ */

    async function run() {
        window.__testDone = false;
        try {
            await waitBoot();
            bind();
            dismissOnboarding();
        } catch (e) {
            results.push({ group: '启动', name: '应用启动', ok: false, detail: e.message });
            paint();
            return;
        }

        /* ---------- 1. 计分规则（A1 / A4 / A5 / A7 / A10 / 加分赛死成就） ---------- */
        await fresh();

        /* 干净 boot（无存档）也必须完整渲染。match.js init() 里曾经只补了
           renderMatchInfo()，于是局分圆点是空的、#current-game 停在 index.html
           写死的英文 "GAME 1"——用户一加分就跳变成「第 1 局」，且屏幕阅读器
           读不到带数字的局分。这条用例锁住整个 render() 真的被调用。 */
        await test('干净 boot', '无存档时也完整渲染：局分圆点 / current-game / aria-label', async function () {
            eq(dots('a'), 3, '甲局分点数量');
            eq(dots('b'), 3, '乙局分点数量');
            eq(doc.querySelectorAll('#games-won-a .game-dot.won').length, 0, '开局不应有已赢的局');
            var cg = doc.getElementById('current-game').textContent.trim();
            eq(cg, '第 1 局', 'current-game 应渲染成中文，而非 index.html 写死的 GAME 1');
            var ga = doc.getElementById('games-won-a');
            eq(ga.getAttribute('role'), 'img', 'aria-label 挂在无 role 的 div 上被 ARIA 禁止');
            assert(/^甲队局分 \d+ 胜$/.test(ga.getAttribute('aria-label')),
                'aria-label 应带真实局数，实际 ' + ga.getAttribute('aria-label'));
        });

        await test('计分规则', 'A1 单局模式：赢 1 局即结束，且只画 1 个局分点', async function () {
            setupMatch({ bestOfThree: false });
            eq(dots('a'), 1, '局分点数量');
            scoreTo('a', 21);
            var m = app.state.match;
            assert(m.gamesWonA === 1, '甲应赢 1 局，实际 ' + m.gamesWonA);
            assert(m.timerRunning === false, '比赛结束后计时器应停止');
        });

        await test('计分规则', 'A1 三局两胜：需赢 2 局，赢 1 局不结束', async function () {
            setupMatch({ bestOfThree: true });
            eq(dots('a'), 3, '局分点数量');
            scoreTo('a', 21);
            assert(app.state.match.gamesWonA === 1, '甲应只赢 1 局');
            assert(app.state.match.timerRunning === true, '1-0 时比赛不该结束');
            scoreTo('a', 21);
            assert(app.state.match.gamesWonA === 2, '甲应赢 2 局');
            assert(app.state.match.timerRunning === false, '2-0 后应结束');
        });

        /* 赛后误触不得重复结算。
           复现路径（全部走真实 UI 路径，实测可触发）：
             打完两局 2:0 → Esc 关结果弹层 → 点「开始」→ 误触一次加分。
           endGame 只把 timerRunning 置 false，并没有锁住计分，
           于是 checkGameEnd 立刻再次成立、gamesWonA 从 2 变 3，
           结果弹层二次弹出；继续点可以一路涨到十几。
           而 state.js 的 normalizeMatch 把 gamesWon 钳在 0..2 ——
           刷新后界面显示 2、存档里是 3+，界面与数据静默分叉。 */
        await test('计分规则', 'A1b 整场结束后不再接受加分：局分不溢出、弹层不二次弹出', async function () {
            setupMatch({ bestOfThree: true });
            scoreTo('a', 21);
            scoreTo('a', 21);
            var m = app.state.match;
            eq(m.gamesWonA, 2, '甲应赢 2 局');
            eq(m.timerRunning, false, '整场结束后计时器应停止');

            /* 模拟用户关掉结果弹层后重新点「开始」再误触加分 */
            app.match.closeResultSheet();
            await sleep(400);                 // closeSheet 有 340ms 退场动画
            app.match.toggleTimer();          // 真实按钮路径：match:timer
            eq(app.state.match.timerRunning, true, '重新开始计时应生效');

            app.match.updateScore('a', 1);    // 真实按钮路径：match:score
            eq(app.state.match.gamesWonA, 2, '已结束的比赛不应再加分（局分不得溢出）');
            eq(app.state.match.gamesWonB, 0, '乙局分不应变化');

            /* 再多点几次，确认不会累积 */
            app.match.updateScore('a', 1);
            app.match.updateScore('a', 1);
            eq(app.state.match.gamesWonA, 2, '连续误触也不应让局分增长');

            /* 结果弹层不应被二次弹出 */
            await sleep(400);
            assert(doc.getElementById('result-sheet').hasAttribute('hidden'),
                '结果弹层不应二次弹出');
        });

        /* 刷新后守卫依然成立：标志位式的实现会在 reload 后失效，
           从局分推导的实现不会。这条锁住「刷新后仍然不能加分」。 */
        await test('计分规则', 'A1c 刷新后守卫仍生效（不依赖内存标志位）', async function () {
            setupMatch({ bestOfThree: true });
            scoreTo('a', 21);
            scoreTo('a', 21);
            eq(app.state.match.gamesWonA, 2, '甲应赢 2 局');

            await fresh();   // 清 localStorage 后重载，模拟重新打开页面
            /* fresh() 清了存档，这里重新摆一场已结束的比赛 */
            setupMatch({ bestOfThree: true });
            var mm = app.state.match;
            mm.gamesWonA = 2;
            mm.timerRunning = true;
            mm.scoreA = 21;
            mm.scoreB = 15;
            app.match.render();
            app.match.updateScore('a', 1);
            eq(app.state.match.gamesWonA, 2, '由局分推导的守卫在重载后仍应拦住加分');
        });

        await test('计分规则', 'A4 平局不制造假大逆转：1-1 → 10-1 不报', async function () {
            setupMatch();
            var seen = spyHighlights();
            scoreTo('a', 1); scoreTo('b', 1);
            scoreTo('a', 10);
            eq(seen.filter(function (h) { return h.title === '大逆转！'; }).length, 0, '大逆转次数');
            notContains(summary(), '大逆转', '高光摘要');
        });

        await test('计分规则', 'A5 真大逆转报对队名：1-1 → 7-1 → 7-14 报「乙」', async function () {
            setupMatch();
            var seen = spyHighlights();
            scoreTo('a', 1); scoreTo('b', 1);
            scoreTo('a', 7);
            scoreTo('b', 14);
            var cb = seen.filter(function (h) { return h.title === '大逆转！'; });
            eq(cb.length, 1, '大逆转次数');
            contains(cb[0].subtitle, '乙', '字幕里的队名');
            notContains(cb[0].subtitle, '甲', '字幕里的队名');
            contains(summary(), '大逆转', '高光摘要');
        });

        await test('计分规则', 'A7 零封：0-0 不报，21-0 报', async function () {
            setupMatch();
            notContains(summary(), '零封', '0-0 时的摘要');
            scoreTo('a', 21);
            contains(summary(), '零封胜利', '21-0 后的摘要');
        });

        await test('计分规则', 'A7 零封：21-18 / 20-22 / 21-19 不误报', async function () {
            await fresh();
            setupMatch();
            /* 必须「先输方后赢方」：反过来写的话，赢方一到 21 分当局就按
               21-0 结束了，零封是自己造出来的。 */
            scoreTo('b', 18); scoreTo('a', 21);                     // 21-18
            scoreTo('b', 20); scoreTo('a', 20); scoreTo('b', 22);    // 20-22（加分赛）
            scoreTo('b', 19); scoreTo('a', 21);                     // 21-19
            notContains(summary(), '零封', '摘要');
        });

        await test('计分规则', 'A10 跳分不漏报换边：0→10→15→20 只提醒 1 次', async function () {
            await fresh();
            setupMatch();
            var calls = [];
            app.ui.notify = function (msg, title) {
                if (String(title).indexOf('换边') >= 0) calls.push(msg);
            };
            scoreTo('a', 10);
            eq(calls.length, 0, '未到 11 分不应提醒');
            scoreTo('a', 15);
            eq(calls.length, 1, '越过 11 分应提醒 1 次');
            scoreTo('a', 20);
            eq(calls.length, 1, '同局内不应重复提醒');
            app.ui.notify = function () { };
        });

        /* 换边判据必须是「领先方得分」，不是「双方之和」。
           BWF：21 分制在领先方先到 11 分时交换场地。
           旧代码用 scoreA+scoreB >= 11，于是 6-5（合计 11）就弹提示，
           而真正的时机 11-0 ~ 11-9 反而因为提前报过而不报了。 */
        await test('计分规则', 'A10b 换边看领先方而非双方之和：6-5 不报、11-5 才报', async function () {
            await fresh();
            setupMatch();
            var calls = [];
            app.ui.notify = function (msg, title) {
                if (String(title).indexOf('换边') >= 0) calls.push(msg);
            };
            /* 6-5：双方之和 11，但领先方只有 6 —— 不该报 */
            scoreTo('a', 6); scoreTo('b', 5);
            eq(calls.length, 0, '6-5（合计 11）不应提醒换边');

            /* 一路打到领先方 11 分 —— 这才是 BWF 的时机 */
            scoreTo('a', 11);
            eq(calls.length, 1, '领先方到 11 分应提醒换边');
            app.ui.notify = function () { };
        });

        /* 11 分制：领先方到 6 分换边（floor(11/2)+1 = 6） */
        await test('计分规则', 'A10c 11 分制换边点是 6 分', async function () {
            await fresh();
            setupMatch({ gameMode: '11', targetScore: 11 });
            var calls = [];
            app.ui.notify = function (msg, title) {
                if (String(title).indexOf('换边') >= 0) calls.push(msg);
            };
            scoreTo('a', 5); scoreTo('b', 5);
            eq(calls.length, 0, '5-5 时领先方只有 5，不应提醒');
            scoreTo('a', 6);
            eq(calls.length, 1, '11 分制领先方到 6 分应提醒换边');
            app.ui.notify = function () { };
        });

        /* 封顶分必须随目标分推导，不能写死 30。
           旧代码 custom 目标 50 分时会在 30-29 被强制结束本局
           （实测：29-29 后甲再得 1 分 -> 30-29 直接判本局结束）。 */
        await test('计分规则', 'A12 封顶随目标分走：custom 50 分制不在 30 分结束', async function () {
            await fresh();
            setupMatch({ gameMode: 'custom', targetScore: 50, bestOfThree: true });
            var m = app.state.match;
            m.scoreA = 29; m.scoreB = 29;
            app.match.render();
            app.match.updateScore('a', 1);          // 30-29
            eq(app.state.match.gamesWonA, 0, '50 分制在 30-29 不应结束本局');
            eq(app.state.match.currentGame, 1, '应仍在第 1 局');

            /* 继续打到 50-48（领先 2 分）才该结束 */
            var mm = app.state.match;
            mm.scoreA = 49; mm.scoreB = 48;
            app.match.render();
            app.match.updateScore('a', 1);          // 50-48
            eq(app.state.match.gamesWonA, 1, '50-48 领先 2 分应结束本局');
        });

        /* 21 分制的官方封顶仍是 30 分，不能被推导逻辑改坏 */
        await test('计分规则', 'A12b 21 分制封顶仍是 30 分', async function () {
            await fresh();
            setupMatch({ gameMode: '21', targetScore: 21 });
            var m = app.state.match;
            m.scoreA = 29; m.scoreB = 29;
            app.match.render();
            app.match.updateScore('a', 1);          // 30-29
            eq(app.state.match.gamesWonA, 1, '21 分制 30-29 应结束本局（30 分封顶）');
        });

        /* 加分赛触发点必须随目标分走，不能写死 20。
           旧代码 11/15 分制永远不触发加分赛高光，
           连带 checkHadDeuce() 恒为假、「加分赛专家」成就永久无法解锁。 */
        await test('计分规则', 'A13 11 分制 10 平触发加分赛（原写死 20 导致永不触发）', async function () {
            await fresh();
            setupMatch({ gameMode: '11', targetScore: 11, bestOfThree: false });
            var seen = spyHighlights();
            scoreTo('a', 10); scoreTo('b', 10);      // 10 平
            eq(seen.filter(function (h) { return h.title === '加分赛！'; }).length, 1,
                '11 分制 10 平应触发加分赛');
            contains(summary(), '加分赛', '高光摘要');

            /* 打完这一局，确认成就判定也认得出来 */
            scoreTo('a', 12); scoreTo('b', 11); scoreTo('a', 13);   // 13-11
            eq(app.match.checkHadDeuce(), true, '11 分制也应能解锁「加分赛专家」');
        });

        /* 15 分制：14 平触发 */
        await test('计分规则', 'A13b 15 分制 14 平触发加分赛', async function () {
            await fresh();
            setupMatch({ gameMode: '15', targetScore: 15, bestOfThree: false });
            var seen = spyHighlights();
            scoreTo('a', 14); scoreTo('b', 14);
            eq(seen.filter(function (h) { return h.title === '加分赛！'; }).length, 1,
                '15 分制 14 平应触发加分赛');
        });

        await test('计分规则', '加分赛成就能解锁：20-20 后 checkHadDeuce() 为真', async function () {
            await fresh();
            setupMatch();
            scoreTo('a', 20); scoreTo('b', 20);
            scoreTo('a', 22);                       // 22-20 结束本局
            /* 关键：saveMatchResult 跑在局末清零之后，旧写法在此恒为 false */
            assert(app.match.checkHadDeuce() === true, 'checkHadDeuce() 应识别到加分赛');
            contains(summary(), '加分赛', '高光摘要');
        });

        await test('计分规则', '快速切换赛制：点击即高亮，且 match-info 不是空盒子', async function () {
            await fresh();

            /* 干净 boot 时没有比赛状态，loadMatchState() 提前 return，render()
               一次都不跑：match-info 沦为空盒子（.match-info 有 padding 和
               inset 边框，空态是个看得见的灰条）。 */
            var mi = doc.getElementById('match-info');
            assert(mi, 'match-info 应存在');
            contains(mi.textContent, '目标', '干净 boot 后 match-info 应已填充，旧版是空的');

            setupMatch();

            function active() {
                return Array.from(doc.querySelectorAll('[data-act="match:mode"]'))
                    .filter(function (b) { return b.classList.contains('active'); })
                    .map(function (b) { return b.getAttribute('data-mode'); });
            }

            /* index.html 把 active 写死在 21 分按钮上，旧版 setGameMode 只
               重写 match-info 的文字、四个按钮一步不动——分数和落盘都改了
               却零视觉反馈，用户看到的就是「点击无反应」。 */
            doc.querySelector('[data-act="match:mode"][data-mode="15"]').click();
            await sleep(80);
            eq(active(), ['15'], '点 15 分后应只有 15 分高亮');
            eq(app.state.settings.targetScore, 15, '目标分应随之变 15');
            contains(mi.textContent.replace(/\s+/g, ''), '目标15分', 'match-info 应跟着变');

            doc.querySelector('[data-act="match:mode"][data-mode="custom"]').click();
            await sleep(80);
            eq(active(), ['custom'], '点自定义后应只有自定义高亮');

            app.state.settings.gameMode = '21';
            app.state.settings.targetScore = 21;
            app.match.render();
        });

        await test('计分规则', '计时未开始/暂停时，加分与撤销走同一道闸门', async function () {
            await fresh();

            /* match.js 文件头与 REFACTOR_NOTES 第 6 节都记着：updateScore 与
               undoScore 同样要求 timerRunning，否则是同一句「请先点击开始比赛」。
               两侧都必须打——只测一侧的话，把另一侧的守卫删掉它照样全绿。 */
            setupMatch();

            var notifySeen = [];
            app.ui.notify = function (msg) { notifySeen.push(String(msg)); };
            function gateCount() {
                return notifySeen.filter(function (m) {
                    return m.indexOf('请先点击「开始比赛」按钮开始计时！') >= 0;
                }).length;
            }

            /* 1) 未开始：加分与撤销都被拦，且流水一条都不记 */
            app.state.match.timerRunning = false;
            app.state.match.scoreA = 0;
            app.state.match.scoreB = 0;
            app.state.match.scoreHistory.length = 0;

            app.match.updateScore('a', 1);
            eq(app.state.match.scoreA, 0, '计时未开始不应加分');
            eq(app.state.match.scoreHistory.length, 0, '计时未开始不应记得分流水');

            app.match.undoScore();
            eq(app.state.match.scoreA, 0, '计时未开始不应撤销');

            /* 2) 中途暂停：两道闸门同样拦得住 */
            app.state.match.timerRunning = true;
            app.match.updateScore('a', 1);
            eq(app.state.match.scoreA, 1, '恢复计时后应能加分');

            app.state.match.timerRunning = false;   /* 暂停 */
            app.match.updateScore('a', 1);
            eq(app.state.match.scoreA, 1, '暂停中不应加分');
            eq(app.state.match.scoreHistory.length, 1, '暂停中不应记得分流水');

            app.match.undoScore();
            eq(app.state.match.scoreA, 1, '暂停中不应撤销');
            eq(app.state.match.scoreHistory.length, 1, '暂停中不应弹掉得分流水');

            /* 3) 恢复计时后撤销放开 */
            app.state.match.timerRunning = true;
            app.match.undoScore();
            eq(app.state.match.scoreA, 0, '恢复计时后应能撤销');
            eq(app.state.match.scoreHistory.length, 0, '撤销后流水应弹掉一条');

            /* 4 × 2 道闸门：文案一致才说明是同一道闸门，不是各写各的 */
            eq(gateCount(), 4, '加分与撤销各被拦 2 次，共 4 次同一句提示，实际 ' + gateCount());
        });

        /* ---------- 2. 存档规整（A11） ---------- */
        await fresh();

        await test('存档规整', 'A11 normalizeMatch 钳制负数与天文数字', async function () {
            var n = app.state.normalizeMatch({
                scoreA: -5, scoreB: 1e9,
                gamesWonA: -5, gamesWonB: 1e9,
                currentGame: 1e9, seconds: -500
            });
            eq(n.scoreA, 0, 'scoreA');
            eq(n.gamesWonA, 0, 'gamesWonA');
            eq(n.gamesWonB, 2, 'gamesWonB');
            eq(n.currentGame, 3, 'currentGame');
            eq(n.seconds, 0, 'seconds');
        });

        await test('存档规整', 'A11 历史条目规整：脏字段钳制、非对象条目过滤', async function () {
            win.localStorage.setItem('matchHistory', JSON.stringify([
                { id: 'x', teamA: 1, teamB: null, scoreA: -9, scoreB: 1e12,
                  gamesWonA: -1, gamesWonB: 99, gameScores: 5, duration: -3,
                  mode: {}, date: 'not-a-date', highlights: 'nope' },
                null, 'nope', 42, [1, 2]
            ]));
            var list = app.state.getMatchHistory();
            eq(list.length, 1, '只有 1 个对象条目应存活');
            var it = list[0];
            eq(it.scoreA, 0, 'scoreA');
            eq(it.gamesWonA, 0, 'gamesWonA');
            eq(it.gamesWonB, 2, 'gamesWonB');
            eq(it.duration, 0, 'duration');
            assert(isFinite(it.date) && it.date > 0, '坏日期应回落成当前时间');
            assert(Array.isArray(it.highlights), 'highlights 应规整成数组');
            eq(it.teamA, '队伍 A', '坏队名应回落默认值');
        });

        /* 白名单重建是"返回对象里没列出的字段会被静默丢弃"。
           synced 与 clientId 都栽在这上面：
             - synced 被丢 -> sync.js 的入队闸门 `if (m.synced) return`
               恒不成立，每次历史变更都把整段历史重新入队重推；
               而服务端 matches.ts 无条件用 Date.now() 覆盖 updated_at，
               配合「到达时间 LWW」，旧数据会把新数据盖掉。
             - clientId 被丢 -> core/migrate.js 给进行中比赛补的
               clientId 一读一写即抹掉，而版本号已推进到 2、
               迁移永不重跑，等于迁移白写。
           这两条锁住它们读回来还在。 */
        await test('存档规整', 'A11b 白名单重建不丢同步字段：synced / clientId / updatedAt', async function () {
            win.localStorage.setItem('matchHistory', JSON.stringify([
                { id: 1, clientId: 'c-1', teamA: '甲', teamB: '乙',
                  scoreA: 2, scoreB: 1, gamesWonA: 2, gamesWonB: 1,
                  gameScores: '21-15,18-21,21-19', duration: 1800, mode: '21',
                  date: 1700000000000, highlights: [],
                  updatedAt: 1234567890, synced: true, deleted: false }
            ]));
            var it2 = app.state.getMatchHistory()[0];
            eq(it2.synced, true, 'synced 必须在白名单里，否则去重闸门永久失效');
            eq(it2.clientId, 'c-1', 'clientId 必须保留（推送去重与冲突解决都靠它）');
            eq(it2.updatedAt, 1234567890, 'updatedAt 必须保留');

            /* 缺省值：老数据没有 synced，应回落 false 而不是 undefined */
            win.localStorage.setItem('matchHistory', JSON.stringify([{ id: 2, clientId: 'c-2' }]));
            eq(app.state.getMatchHistory()[0].synced, false, '缺 synced 应回落 false');

            /* normalizeMatch（进行中的比赛）同样不能丢 clientId */
            var nm = app.state.normalizeMatch({ clientId: 'live-1', scoreA: 3 });
            eq(nm.clientId, 'live-1', 'normalizeMatch 必须保留迁移补的 clientId');
            eq(app.state.normalizeMatch({}).clientId, '', '缺 clientId 应回落空串');
        });

        /* 端到端：写一条 synced:true 的记录，模拟 sync.js 的入队判定，
           确认它真的被跳过（而不是只看字段在不在）。 */
        await test('存档规整', 'A11c 已同步记录不再入队（sync.js 闸门端到端）', async function () {
            win.localStorage.setItem('matchHistory', JSON.stringify([
                { id: 1, clientId: 'done-1', teamA: '甲', teamB: '乙',
                  scoreA: 1, scoreB: 0, date: 1700000000000, synced: true },
                { id: 2, clientId: 'new-2', teamA: '甲', teamB: '乙',
                  scoreA: 0, scoreB: 1, date: 1700000001000, synced: false }
            ]));
            /* 复刻 sync.js:354-361 的判定逻辑 */
            var wouldEnqueue = app.state.getMatchHistory().filter(function (m) {
                if (!m.clientId) return false;
                if (m.synced) return false;
                return true;
            }).map(function (m) { return m.clientId; });
            eq(wouldEnqueue.length, 1, '只有未同步的那条应入队');
            eq(wouldEnqueue[0], 'new-2', '入队的应是 synced=false 的那条');
        });

        await test('存档规整', '脏数据全部优雅降级，不抛异常、不污染原型', async function () {
            var samples = [null, undefined, 'x', 42, true, [], [1, 2],
                { __proto__: { polluted: 1 } }, { scoreA: {} },
                { scoreHistory: 'nope' }, { gameScoresHistory: {} }];
            for (var i = 0; i < samples.length; i++) {
                var r = app.state.normalizeMatch(samples[i]);
                assert(r && typeof r === 'object', '样本 ' + i + ' 应返回对象');
                assert(isFinite(r.scoreA) && isFinite(r.scoreB), '样本 ' + i + ' 得分应为有限数');
            }
            /* 断言必须打在 iframe 域里：normalizeMatch 在 iframe 中执行，
               污染的是 iframe 的 Object.prototype；而这里的 ({}) 是父窗口
               新建的对象，两者根本不是同一个原型。旧写法让这条断言恒真——
               实测把 iframe 域污染得一塌糊涂（iframe 内新建对象 .polluted === 1），
               它照样全绿。 */
            assert(win.Object.prototype.polluted === undefined, '不应发生原型污染');
        });

        /* ---------- 3. 费用分摊（A2 / A3 / A8） ---------- */
        await fresh();

        function gotoExpense() {
            win.location.hash = '#tab=match&sub=expense';
            return sleep(500).then(function () {
                app.expense.onEnter();
                return sleep(150);
            });
        }

        /* 填表并计算。minutes 必须给全所有人——少给一个，
           剩下的 input 会保留默认值 60，等于没测到「时长全 0」。 */
        function fillExpense(total, players, minutes) {
            doc.getElementById('expense-type').value = '场地费';
            doc.getElementById('total-amount').value = String(total);
            doc.getElementById('expense-players').value = players;
            app.expense.onEnter();
            if (minutes) {
                var btn = doc.querySelector('[data-act="expense:mode"][data-mode="time"]');
                if (btn) btn.click();
                app.expense.onEnter();
                var inputs = doc.querySelectorAll('#time-inputs input');
                for (var i = 0; i < minutes.length && i < inputs.length; i++) {
                    inputs[i].value = String(minutes[i]);
                }
            }
            app.expense.calculate();
        }

        function detailRows() {
            return Array.prototype.map.call(
                doc.querySelectorAll('#expense-detail-list .split-row'),
                function (r) { return r.textContent.replace(/\s+/g, ' ').trim(); }
            );
        }

        await test('费用分摊', 'A2 time 模式详情页金额与单位正确', async function () {
            await gotoExpense();
            fillExpense(120, '张三\n李四\n王五', [120, 60, 60]);
            var btn = doc.querySelector('[data-act="expense:detail"]');
            assert(btn, '详情按钮应存在');
            btn.click();
            await sleep(400);
            var joined = detailRows().join('|');
            contains(joined, '¥60.00', '张三应摊 60');
            contains(joined, '¥30.00', '李四/王五应各摊 30');
            contains(joined, '120分钟', '时长单位应为分钟');
            notContains(joined, 'Invalid Date', '不应出现 Invalid Date');
        });

        await test('费用分摊', 'A3 非正份数不再产出 Infinity', async function () {
            await gotoExpense();
            app.state.setExpenseHistory([]);
            /* 必须真的切进 custom 分支：A3 修的那行就在里面。
               fillExpense 的 minutes 传 null 时不会点任何模式按钮，
               #split-mode 留着上一条用例点过的 time，两人各默认 60 分钟，
               除零永远不会发生——旧写法让这条断言从没碰到它名义上
               守着的代码（实测：把修复前的旧代码原样放回去，它照样全绿）。
               -5 与 +5 相加得 0，正是旧代码渲染出 ±Infinity 的那个输入。 */
            doc.getElementById('expense-type').value = '场地费';
            doc.getElementById('total-amount').value = '100';
            doc.getElementById('expense-players').value = '张三\n李四';
            var modeBtn = doc.querySelector('[data-act="expense:mode"][data-mode="custom"]');
            assert(modeBtn, '应有自定义分摊模式按钮');
            modeBtn.click();
            var ratioInputs = doc.querySelectorAll('#ratio-inputs input[type="number"]');
            eq(ratioInputs.length, 2, '应按人数生成 2 个份数输入框');
            ratioInputs[0].value = '-5';
            ratioInputs[1].value = '5';
            app.expense.calculate();
            var body = doc.body.innerText;
            notContains(body, 'Infinity', '界面不应出现 Infinity');
            notContains(body, 'NaN', '界面不应出现 NaN');
            /* 负份数按 1 份处理后：100 × 1/6 与 100 × 5/6 */
            contains(body, '¥16.67', '负份数应回落为 1 份，张三应摊 16.67');
            contains(body, '¥83.33', '正份数应保留，李四应摊 83.33');
        });

        await test('费用分摊', 'A3 时长总量为 0 时中止入账', async function () {
            await gotoExpense();
            app.state.setExpenseHistory([]);
            fillExpense(100, '张三\n李四\n王五', [0, 0, 0]);
            eq(app.state.getExpenseHistory().length, 0, '时长全 0 不应入账');
        });

        await test('费用分摊', 'A8 同参数重复计算只存 1 条', async function () {
            await gotoExpense();
            app.state.setExpenseHistory([]);
            for (var i = 0; i < 4; i++) fillExpense(120, '张三\n李四\n王五', null);
            eq(app.state.getExpenseHistory().length, 1, '同参数点 4 次应只存 1 条');
            fillExpense(240, '张三\n李四\n王五', null);
            eq(app.state.getExpenseHistory().length, 2, '改总额后应存第 2 条');
        });

        /* ---------- 3b. 统计与图表（历史排序 / 最近 N 场） ----------
           matchHistory 的约定是「新在前」（state.js 的 pushMatchHistory 用 unshift）。
           凡是「取最近 N 条」的地方，遍历方向与收集方式必须配成对，
           否则会静默取到最旧的 N 条 —— 不报错，只是把趋势讲反。 */
        await fresh();

        /* 造一份按「新在前」存放的历史：日期递增，下标 0 是最新 */
        function seedHistory(days) {
            var list = [];
            for (var i = days.length - 1; i >= 0; i--) {   // 倒着 push 得到新在前
                list.push({
                    id: i + 1, clientId: 'h' + (i + 1),
                    teamA: '我/搭档', teamB: '对手' + (i + 1),
                    scoreA: 2, scoreB: 0, gamesWonA: 2, gamesWonB: 0,
                    gameScores: '21-10,21-12', duration: 1800, mode: '21',
                    date: new Date(2026, 0, days[i]).getTime(),
                    highlights: [], updatedAt: 0, synced: false, deleted: false
                });
            }
            app.state.setMatchHistory(list);
        }

        await test('统计', 'E1 能力分析「最近 5 场」取的是最新而非最旧', async function () {
            /* 7 场：1 号到 7 号，最新是 7 号 */
            seedHistory([1, 2, 3, 4, 5, 6, 7]);
            eq(app.state.getMatchHistory().length, 7, '历史应有 7 场');
            eq(new Date(app.state.getMatchHistory()[0].date).getDate(), 7, '下标 0 应是最新（7 号）');

            win.location.hash = '#tab=data&sub=ability';
            await sleep(700);
            var sel = doc.getElementById('ability-player-select');
            assert(sel, '能力分析应有球员选择器');
            sel.value = '我';
            app.stats.renderPlayerAbility();
            await sleep(200);

            var dates = [];
            var rows = doc.querySelectorAll('#ability-recent .recent-row .r-date');
            for (var i = 0; i < rows.length; i++) dates.push(rows[i].textContent.trim());

            eq(dates.length, 5, '应显示 5 场');
            /* 最新在前：7、6、5、4、3 */
            var expect = ['2026/1/7', '2026/1/6', '2026/1/5', '2026/1/4', '2026/1/3'];
            eq(dates.join('|'), expect.join('|'),
                '「最近 5 场」应为最新的 5 场（新在前），实际 ' + dates.join('|'));
        });

        await test('统计', 'E2 月度图取最近 6 个月且时间轴升序', async function () {
            /* 8 个月，最新在前 */
            var months = [8, 7, 6, 5, 4, 3, 2, 1];
            var list = months.map(function (m) {
                return {
                    id: m, clientId: 'm' + m, teamA: '甲', teamB: '乙',
                    scoreA: 1, scoreB: 0, gamesWonA: 1, gamesWonB: 0,
                    gameScores: '', duration: 60, mode: '21',
                    date: new Date(2025, m - 1, 15).getTime(),
                    highlights: [], updatedAt: 0, synced: false, deleted: false
                };
            });
            app.state.setMatchHistory(list);
            app.stats.renderHistory();
            await sleep(800);

            var chart = win.Chart && win.Chart.getChart
                ? win.Chart.getChart(doc.getElementById('monthlyChart')) : null;
            assert(chart, '月度图应已创建');
            var labels = chart.data.labels.slice();
            eq(labels.length, 6, '应只显示 6 个月');
            var sorted = labels.slice().sort();
            eq(labels.join(','), sorted.join(','), 'X 轴应升序（时间从左到右）');
            eq(labels.join(','), '2025-03,2025-04,2025-05,2025-06,2025-07,2025-08',
                '应取最近 6 个月，实际 ' + labels.join(','));
        });

        /* ---------- 3c. 智能分组的实力等级（G1） ----------
           「实力均衡」靠每个球员的 1–5 级输入工作。等级存在 DOM 里，
           而输入行会在名单变化时整段重建 —— 重建丢值就等于功能失效。 */
        await fresh();

        function gotoGrouping(players) {
            win.location.hash = '#tab=match&sub=grouping';
            return sleep(600).then(function () {
                var ta = doc.getElementById('players-list');
                ta.value = players.join('\n');
                /* 走真实路径：名单输入会触发 updatePlayerCount -> updateSkillInputs */
                ta.dispatchEvent(new win.Event('input', { bubbles: true }));
                return sleep(150);
            });
        }

        function skillValues() {
            var sels = doc.querySelectorAll('#skill-inputs .skill-select');
            return Array.prototype.map.call(sels, function (s) { return s.value; });
        }

        function setSkill(idx, v) {
            var sels = doc.querySelectorAll('#skill-inputs .skill-select');
            sels[idx].value = String(v);
            /* 必须派发 input 而不是 change：nav.js 把 data-act-input
               挂在 input 监听上（change 那条只认 data-act）。
               浏览器改 select 时两者都会发，但只有 input 能走到
               grouping:skill 处理器 —— 派错事件会让这条用例
               绕开真实接线、从重建时的兜底采集里蒙混过关。 */
            sels[idx].dispatchEvent(new win.Event('input', { bubbles: true }));
        }

        await test('智能分组', 'G1 编辑名单不重置实力等级（原来会全部退回 3 级）', async function () {
            await gotoGrouping(['甲', '乙', '丙', '丁']);
            eq(skillValues().length, 4, '应有 4 行实力输入');
            eq(skillValues().join(','), '3,3,3,3', '初始应都是 3 级');

            setSkill(0, 5); setSkill(1, 1); setSkill(2, 4); setSkill(3, 2);
            eq(skillValues().join(','), '5,1,4,2', '设置后应记下 5/1/4/2');

            /* 再编辑一次名单（加一个人）—— 这是会触发重建的真实操作 */
            var ta = doc.getElementById('players-list');
            ta.value = '甲\n乙\n丙\n丁\n戊';
            ta.dispatchEvent(new win.Event('input', { bubbles: true }));
            await sleep(200);

            eq(skillValues().join(','), '5,1,4,2,3',
                '重建后原 4 人的等级必须保住，新人默认 3；实际 ' + skillValues().join(','));
        });

        await test('智能分组', 'G1b 删人不串位：按名字保留等级，而不是按下标', async function () {
            await fresh();
            await gotoGrouping(['甲', '乙', '丙']);
            setSkill(0, 5); setSkill(1, 1); setSkill(2, 2);
            eq(skillValues().join(','), '5,1,2', '设置后应记下 5/1/2');

            /* 走真实按钮：删掉中间那个「乙」 */
            var del = doc.querySelectorAll('#skill-inputs [data-act="grouping:remove-player"]')[1];
            assert(del, '应有删除按钮');
            del.click();
            await sleep(250);

            var ta = doc.getElementById('players-list');
            eq(ta.value.split('\n').join(','), '甲,丙', '名单应剩甲、丙');
            eq(skillValues().join(','), '5,2',
                '丙应保住自己的 2 级（而不是拿到乙的 1 级）；实际 ' + skillValues().join(','));
        });

        /* 这条专门锁「data-act-input 的接线」：
           select 同时会发 input 与 change，但 nav.js 只把 data-act-input
           挂在 input 监听上（change 那条只认 data-act）。
           所以在真实浏览器里改 select 是能走到 grouping:skill 的；
           若哪天有人把 select 换成只发 change 的写法，或者把
           监听从 input 挪走，等级就会**只在名单重建时才被采集到** ——
           表现是「选完等级直接点生成」不生效。 */
        await test('智能分组', 'G1c 改等级走真实 input 事件即可生效（不依赖名单重建）', async function () {
            await fresh();
            await gotoGrouping(['甲', '乙', '丙', '丁']);
            setSkill(0, 5); setSkill(1, 1);
            /* 不碰名单、不触发重建，直接生成 —— 等级必须在 */
            var groups = app.grouping.balancedGrouping(
                ['甲', '乙', '丙', '丁'], app.grouping.readSkills());
            var g5 = groups.filter(function (g) {
                return g.some(function (p) { return p.skill === 5; });
            })[0];
            assert(g5, '5 级球员应出现在分组结果里');
            assert(g5.some(function (p) { return p.skill === 1; }),
                '5 级应与 1 级同组（说明等级真的读到了，而不是全回落 3）');
        });

        await test('智能分组', 'G1d readSkills 与界面一致，均衡分组强弱搭配', async function () {
            await fresh();
            await gotoGrouping(['强', '弱', '中', '平']);
            setSkill(0, 5); setSkill(1, 1); setSkill(2, 3); setSkill(3, 3);

            eq(app.grouping.readSkills().join(','), '5,1,3,3',
                'readSkills 应与界面一致');

            var players = ['强', '弱', '中', '平'];
            var skills = [5, 1, 3, 3];
            var groups = app.grouping.balancedGrouping(players, skills);
            eq(groups.length, 2, '4 人应分成 2 组');

            /* 每组应「强配弱」：5 级与 1 级同组，组内合计接近 */
            var sums = groups.map(function (g) {
                return g.reduce(function (s, p) { return s + p.skill; }, 0);
            });
            assert(Math.abs(sums[0] - sums[1]) <= 1,
                '两组实力合计应接近，实际 ' + sums.join(' vs '));
            var top = groups.filter(function (g) {
                return g.some(function (p) { return p.skill === 5; });
            })[0];
            assert(top && top.some(function (p) { return p.skill === 1; }),
                '最强的 5 级应与最弱的 1 级同组');
        });

        /* ---------- 4. 弹层（A6） ---------- */
        await fresh();

        await test('弹层', 'A6 确认框上开分享卡：dialog 关闭，Esc 只关一层', async function () {
            app.nav.openDialog('confirm-dialog');
            assert(doc.getElementById('confirm-dialog').classList.contains('show'), '确认框应打开');
            app.nav.openSheet('share-sheet');
            /* closeSheet 要等 340ms 动画结束才置 hidden，所以判 .show 而不是 .hidden */
            assert(!doc.getElementById('confirm-dialog').classList.contains('show'),
                '开分享卡后确认框应关闭');
            assert(doc.getElementById('share-sheet').classList.contains('show'), '分享卡应打开');
            eq(app.state.overlays.length, 1, '弹层栈应只剩 1 层');

            var ev = new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
            doc.dispatchEvent(ev);
            await sleep(150);
            assert(!doc.getElementById('share-sheet').classList.contains('show'), 'Esc 应关掉分享卡');
            eq(app.state.overlays.length, 0, '弹层栈应清空');
        });

        /* ---------- 5. 视觉令牌（D1 / D2） ---------- */
        await fresh();

        /* Dock 出现时必须给内容留出避让空间。
           这条用例防的是「CSS 规则写了但选择器匹配不到任何元素」——
           这类问题不报错、不白屏，只在滚到底时把内容压在 Dock 下面。
           真实缺陷：规则写成 `.app.dock-on .content`，而 nav.js 把
           dock-on 加在 document.body 上，.app 是 body 的子元素，
           要求同一个元素同时具备两者 → 匹配数恒为 0。
           实测 padding-bottom 停在 90px，而需要 162px，
           记分页滚到底时内容被永久压住约 49px。

           断言刻意分两层：先断言规则真的命中了元素（选择器正确），
           再断言避让高度足够（数值正确）。只断言其中一个都拦不住。 */
        await test('视觉令牌', 'D3 Dock 出现时内容底部留出避让空间', async function () {
            win.location.hash = '#tab=score';
            await sleep(600);

            var body = doc.body;
            assert(body.classList.contains('dock-on'), '记分页 body 应有 dock-on');
            eq(doc.querySelectorAll('.app.dock-on .content').length, 0,
                '旧选择器本就不该匹配（它是错的，留着是提醒）');
            var matched = doc.querySelectorAll('body.dock-on .content').length;
            assert(matched > 0, 'body.dock-on .content 必须命中内容容器，实际匹配 ' + matched);

            var content = doc.querySelector('.content');
            var dock = doc.getElementById('dock');
            assert(content && dock, '内容容器与 Dock 都应存在');

            var pad = parseFloat(win.getComputedStyle(content).paddingBottom) || 0;
            /* 需要避让的高度 = 视口底部到 Dock 顶部的距离 */
            var need = win.innerHeight - dock.getBoundingClientRect().top;
            assert(pad >= need - 2,
                '内容底部避让应不小于 Dock 占用高度：padding=' + pad + ' 需要=' + Math.round(need));

            /* 再验一遍语义：规则真的来自 dock-on 那条，而不是别处的 padding */
            var dockH = parseFloat(win.getComputedStyle(doc.documentElement)
                .getPropertyValue('--dock-h')) || 0;
            var tabH = parseFloat(win.getComputedStyle(doc.documentElement)
                .getPropertyValue('--tabbar-h')) || 0;
            assert(pad >= dockH + tabH,
                'padding 应至少覆盖 dock(' + dockH + ') + tabbar(' + tabH + ')，实际 ' + pad);
        });

        await test('视觉令牌', 'D2 tokens.js 能读到 CSS 自定义属性', async function () {
            /* 这条用例防的是「JS 侧没有读令牌的通道」——旧版 charts.js 手抄了
               一份浅色配色，视觉重构后直接在深色卡片上花掉。所以断言的重点是
               「能读到、是合法色值、alpha() 换算正确」，而不是某个具体色号：
               色号属于设计决策，会随视觉方向调整（v2 是 #D4FF3F，方向 C 是
               #E0A33E），把它写死会让每次改配色都要改测试，最终被人随手放宽。 */
            var live = app.tokens.get('--live');
            assert(/^#[0-9a-f]{6}$/i.test(live), '行动色应为 hex，实际 ' + live);

            /* 必须与样式表里的真实值一致（而不是回落到 JS 的兜底字面量）：
               样式表没加载 / 令牌名写错时，get() 会返回 fallback，
               那样就证明不了「通道打通了」。 */
            var declared = win.getComputedStyle(doc.documentElement)
                .getPropertyValue('--live').trim();
            assert(declared, '--live 应存在于 :root');
            eq(live.toLowerCase(), declared.toLowerCase(), '读到值应等于样式表声明值');

            /* alpha() 收的是色值，不是令牌名 */
            var soft = app.tokens.alpha(live, 0.3);
            assert(/^rgba?\(/.test(soft), 'alpha() 应产出 rgba，实际 ' + soft);

            /* 队伍色也走同一条通道 */
            var a = app.tokens.get('--a');
            assert(/^#[0-9a-f]{6}$/i.test(a), '甲队色应为 hex，实际 ' + a);
        });

        await test('布局', '标题+副标题容器必须纵向排列（不能挤成一行）', async function () {
            /* 防的是「只写 flex:1 不写 flex-direction」这一类布局缺陷。
               .ni-title / .ni-sub 都是 inline，父容器不设纵向 flex 时
               两者会排在同一行且中间无间距，短标题项直接读成一句话：
               「设置」+「比赛规则与偏好」渲染成「设置比赛规则与偏好」。
               长标题项因为换行看起来正常，所以这类 bug 只在部分项上暴露。 */
            win.location.hash = '#tab=me';
            await sleep(600);

            var items = doc.querySelectorAll('.me-nav-item');
            assert(items.length > 0, '我的页应有导航项');

            var bad = [];
            for (var i = 0; i < items.length; i++) {
                var main = items[i].querySelector('.ni-main');
                var title = items[i].querySelector('.ni-title');
                var sub = items[i].querySelector('.ni-sub');
                if (!main || !title || !sub) continue;

                var dir = win.getComputedStyle(main).flexDirection;
                if (dir !== 'column') {
                    bad.push((title.textContent || '').trim() + ' 的容器 flex-direction=' + dir);
                    continue;
                }
                /* 更硬的断言：标题底边不应低于副标题顶边（即两者不重叠） */
                var tRect = title.getBoundingClientRect();
                var sRect = sub.getBoundingClientRect();
                if (sRect.top < tRect.bottom - 1) {
                    bad.push((title.textContent || '').trim() + ' 标题与副标题重叠');
                }
            }
            eq(bad.length, 0, '所有导航项标题/副标题应纵向分开，问题项：' + JSON.stringify(bad));

            /* 快捷操作弹层里用的是另一套 class，同一个坑，一起锁住 */
            var quickItems = doc.querySelectorAll('#quick-actions .list-item');
            assert(quickItems.length > 0, '快捷操作应有列表项');
            var bad2 = [];
            for (var j = 0; j < quickItems.length; j++) {
                var m2 = quickItems[j].querySelector('.list-item-main');
                var t2 = quickItems[j].querySelector('.list-item-title');
                var s2 = quickItems[j].querySelector('.list-item-sub');
                if (!m2 || !t2 || !s2) continue;
                if (win.getComputedStyle(m2).flexDirection !== 'column') {
                    bad2.push((t2.textContent || '').trim());
                } else {
                    var r1 = t2.getBoundingClientRect();
                    var r2 = s2.getBoundingClientRect();
                    if (r2.top < r1.bottom - 1) bad2.push((t2.textContent || '').trim() + ' 重叠');
                }
            }
            eq(bad2.length, 0, '快捷操作项也应纵向分开，问题项：' + JSON.stringify(bad2));
        });

        await test('视觉令牌', 'D1 成就徽章渲染出真 SVG 而不是图标名', async function () {
            win.location.hash = '#tab=me&sub=achievements';
            await sleep(700);
            /* 必须真的走一遍 showBadge()：#ab-icon 在 index.html 里是静态
               占位符，开机时就被 icons.js 的 hydrate 填成了真 SVG。光检查
               DOM 只能证明 hydrate 是对的，证明不了 showBadge() 里那一行
               （实测：把那行换成 ic.textContent = a.icon，旧写法照样全绿）。
               showBadge 未导出，经 unlock() 触达；fresh() 已清空存档，
               first_match 必然处于未解锁状态。 */
            app.achievements.unlock(app.achievements.LIST[0]);
            await sleep(250);
            var icon = doc.getElementById('ab-icon');
            assert(icon, '徽章图标容器应存在');
            assert(icon.querySelector('svg'), '徽章图标应为 SVG');
            notContains(icon.textContent, 'shuttle', '不应显示图标名');
        });

        /* ---------- 6. 场边模式（超大字报） ----------
           这一组防的是两件最容易退化的事：
             ① 双计分路径 —— 场边模式自己处理 pointerup、又保留 nav 的
                委托 click，一次点击会加两分（第一版实测就是这个 bug）；
             ② 两套状态 —— 场边模式若自己存一份比分，与主界面必然发散。 */
        await fresh();
        setupMatch();

        await test('场边模式', '进入/退出：覆盖层与 html 类名同步，且不残留', async function () {
            eq(app.courtside.isOpen(), false, '初始不应处于场边模式');
            var ov = doc.getElementById('courtside');
            assert(ov, '场边模式容器应存在');

            app.courtside.open();
            await sleep(150);
            eq(app.courtside.isOpen(), true, '应已进入场边模式');
            eq(ov.hidden, false, '容器应可见');
            eq(ov.getAttribute('aria-hidden'), 'false', 'aria-hidden 应放开');
            eq(doc.documentElement.classList.contains('courtside-on'), true, '应锁定滚动');

            app.courtside.close();
            await sleep(150);
            eq(app.courtside.isOpen(), false, '应已退出');
            eq(ov.hidden, true, '容器应隐藏');
            eq(ov.getAttribute('aria-hidden'), 'true', 'aria-hidden 应还原');
            eq(doc.documentElement.classList.contains('courtside-on'), false, '应解除滚动锁定');
        });

        await test('场边模式', '单击只加 1 分（防双计分路径）', async function () {
            setupMatch();
            app.courtside.open();
            await sleep(150);

            /* ⚠️ 这里必须发真实的 pointer 事件序列，不能用 el.click()。
               第一版用例就是写的 el.click()，结果「注入双计分 bug」的变异
               验证照样全绿 —— 因为合成 click 只走 nav 的委托处理器，
               压根碰不到 pointerdown/pointerup 那条路径，
               等于没测到 bug 本身。现在补全 pointerdown → pointerup → click
               三步，与真实触摸完全一致。 */
            var el = doc.querySelector('#cs-side-a');
            function realTap(node) {
                var r = node.getBoundingClientRect();
                var opt = {
                    bubbles: true, cancelable: true, composed: true,
                    pointerId: 1, pointerType: 'touch', isPrimary: true,
                    button: 0, buttons: 1,
                    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
                };
                node.dispatchEvent(new win.PointerEvent('pointerdown', opt));
                node.dispatchEvent(new win.PointerEvent('pointerup', opt));
                /* 浏览器在 pointerup 之后还会补一次 click，必须一起模拟 */
                node.dispatchEvent(new win.MouseEvent('click', {
                    bubbles: true, cancelable: true,
                    clientX: opt.clientX, clientY: opt.clientY
                }));
            }

            var before = app.state.match.scoreA;
            realTap(el);
            await sleep(180);
            eq(app.state.match.scoreA - before, 1,
                '一次真实点按应只加 1 分；加 2 分说明 pointerup 与委托 click 重复计分');

            app.courtside.close();
            await sleep(100);
        });

        await test('场边模式', '长按撤回后，紧随的 click 不得把分加回来', async function () {
            setupMatch();
            app.courtside.open();
            await sleep(150);

            /* 这条用例防的是「长按撤回 → 浏览器补发 click → 又被加回来」。
               第一版就是这个 bug：长按后 7 分变 8 分（而不是 6 分），
               因为 pointerup 计分 + 委托 click 计分两条路径同时在跑。
               注意不能用 el.click() 测——合成 click 不触发 pointerdown，
               长按根本不会发生，用例会永远绿（实测变异验证证实了这一点）。 */
            var el = doc.querySelector('#cs-side-a');
            var r = el.getBoundingClientRect();
            var opt = {
                bubbles: true, cancelable: true, composed: true,
                pointerId: 1, pointerType: 'touch', isPrimary: true,
                button: 0, buttons: 1,
                clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
            };

            /* 先正常加 3 分（真实点按）*/
            function realTap(node) {
                var b = node.getBoundingClientRect();
                var o = {
                    bubbles: true, cancelable: true, composed: true,
                    pointerId: 1, pointerType: 'touch', isPrimary: true,
                    button: 0, buttons: 1,
                    clientX: b.left + b.width / 2, clientY: b.top + b.height / 2
                };
                node.dispatchEvent(new win.PointerEvent('pointerdown', o));
                node.dispatchEvent(new win.PointerEvent('pointerup', o));
                node.dispatchEvent(new win.MouseEvent('click', {
                    bubbles: true, cancelable: true, clientX: o.clientX, clientY: o.clientY
                }));
            }
            realTap(el); await sleep(160);
            realTap(el); await sleep(160);
            realTap(el); await sleep(160);
            eq(app.state.match.scoreA, 3, '前置：甲队应为 3 分');
            eq(app.state.match.scoreHistory.length, 3, '前置：流水应为 3 条');

            /* 长按：按住超过 520ms 再抬起，随后补发 click */
            el.dispatchEvent(new win.PointerEvent('pointerdown', opt));
            await sleep(700);
            el.dispatchEvent(new win.PointerEvent('pointerup', opt));
            el.dispatchEvent(new win.MouseEvent('click', {
                bubbles: true, cancelable: true, clientX: opt.clientX, clientY: opt.clientY
            }));
            await sleep(200);

            eq(app.state.match.scoreA, 2, '长按应撤回最后一分（3 → 2），不能被 click 加回来');
            eq(app.state.match.scoreHistory.length, 2, '流水应剩 2 条');

            app.courtside.close();
            await sleep(100);
        });

        await test('场边模式', '反复进出后手势监听不累积（长按只撤回一次）', async function () {
            setupMatch();
            /* 这条用例防的是「bindGestures() 每次 open 都重挂一遍」。
               第二版就是这个 bug：进出 5 次后，一次长按会同时触发 5 个
               撤回定时器，3 分的长按会把分数直接打到 0（而不是 2）。
               所以这里刻意多进几次，再验证单次长按只撤回一分。 */
            for (var i = 0; i < 5; i++) {
                app.courtside.open();
                await sleep(80);
                app.courtside.close();
                await sleep(80);
            }
            app.courtside.open();
            await sleep(150);

            var el = doc.querySelector('#cs-side-a');
            var r = el.getBoundingClientRect();
            var opt = {
                bubbles: true, cancelable: true, composed: true,
                pointerId: 1, pointerType: 'touch', isPrimary: true,
                button: 0, buttons: 1,
                clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
            };

            function tap() {
                var b = el.getBoundingClientRect();
                var o = {
                    bubbles: true, cancelable: true, composed: true,
                    pointerId: 1, pointerType: 'touch', isPrimary: true,
                    button: 0, buttons: 1,
                    clientX: b.left + b.width / 2, clientY: b.top + b.height / 2
                };
                el.dispatchEvent(new win.PointerEvent('pointerdown', o));
                el.dispatchEvent(new win.PointerEvent('pointerup', o));
                el.dispatchEvent(new win.MouseEvent('click', {
                    bubbles: true, cancelable: true, clientX: o.clientX, clientY: o.clientY
                }));
            }

            tap(); await sleep(160);
            tap(); await sleep(160);
            tap(); await sleep(160);
            eq(app.state.match.scoreA, 3, '前置：甲队应为 3 分');

            el.dispatchEvent(new win.PointerEvent('pointerdown', opt));
            await sleep(700);
            el.dispatchEvent(new win.PointerEvent('pointerup', opt));
            el.dispatchEvent(new win.MouseEvent('click', {
                bubbles: true, cancelable: true, clientX: opt.clientX, clientY: opt.clientY
            }));
            await sleep(250);

            eq(app.state.match.scoreA, 2,
                '一次长按只能撤回一分；分数被打到 0 说明监听累积了');
            eq(app.state.match.scoreHistory.length, 2, '流水应剩 2 条');

            app.courtside.close();
            await sleep(100);
        });

        await test('场边模式', '左右两半屏都占满宽度（网格列数不能多于子元素）', async function () {
            setupMatch();
            app.courtside.open();
            await sleep(250);

            var board = doc.querySelector('.cs-board');
            var a = doc.getElementById('cs-side-a').getBoundingClientRect();
            var b = doc.getElementById('cs-side-b').getBoundingClientRect();
            var boardW = board.getBoundingClientRect().width;

            /* 防的是「.cs-board 写成 3 列（1fr 1px 1fr）但只有 2 个子元素」：
               乙队会被塞进那 1px 的中间列，整个右半屏变空。
               实测 bug 时 sideB 宽只有 16px，而 sideA 是 422px。 */
            assert(a.width > boardW * 0.4,
                '甲队半屏应占约一半宽度，实际 ' + Math.round(a.width) + '/' + Math.round(boardW));
            assert(b.width > boardW * 0.4,
                '乙队半屏应占约一半宽度，实际 ' + Math.round(b.width) + '/' + Math.round(boardW));
            /* 两半应大致等宽 */
            assert(Math.abs(a.width - b.width) < boardW * 0.1,
                '两半应大致等宽，实际 ' + Math.round(a.width) + ' vs ' + Math.round(b.width));

            app.courtside.close();
            await sleep(100);
        });

        await test('场边模式', '读数与主界面同源（不是第二套状态）', async function () {
            setupMatch();
            app.courtside.open();
            await sleep(150);

            doc.querySelector('#cs-side-a').click();
            doc.querySelector('#cs-side-a').click();
            doc.querySelector('#cs-side-b').click();
            await sleep(200);

            var m = app.state.match;
            eq(Number(doc.getElementById('cs-score-a').textContent), m.scoreA, '场边甲队读数');
            eq(Number(doc.getElementById('cs-score-b').textContent), m.scoreB, '场边乙队读数');
            /* 主界面同一时刻必须一致 */
            eq(Number(doc.getElementById('score-a').textContent), m.scoreA, '主界面甲队读数');
            eq(Number(doc.getElementById('score-b').textContent), m.scoreB, '主界面乙队读数');

            app.courtside.close();
            await sleep(100);
        });

        await test('场边模式', '未开始计时时拦下加分并给出可见提示', async function () {
            await fresh();
            /* setupMatch 默认把 timerRunning 置 true（其余用例都依赖这一点），
               这条用例要的正是「未开始」态，所以显式改回来。
               秒数也归零：只有「没计时且没打过」才算未开始。 */
            setupMatch();
            app.state.match.timerRunning = false;
            app.state.match.seconds = 0;

            app.courtside.open();
            /* 等防息屏探测的 Promise 落地（它会写提示条），
               否则可能盖住后面「未计时」那条提示，让用例偶发假红。 */
            await sleep(400);

            var before = app.state.match.scoreA;
            doc.querySelector('#cs-side-a').click();
            await sleep(200);
            eq(app.state.match.scoreA, before, '未计时不应加分');

            var hint = doc.getElementById('cs-hint');
            assert(hint.classList.contains('show'), '应显示可见提示（场边模式下看不到 toast）');
            assert(hint.textContent.indexOf('计时') >= 0,
                '提示应说明要先开始计时，实际：' + hint.textContent);
            eq(app.state.match.scoreA, before, '再次点击仍不应加分');

            app.courtside.close();
            await sleep(100);
        });

        await test('场边模式', '计分实时反映到局分刻度与领先态', async function () {
            setupMatch();
            app.courtside.open();
            await sleep(150);

            doc.querySelector('#cs-side-a').click();
            await sleep(150);
            eq(doc.getElementById('cs-side-a').classList.contains('leading'), true,
                '甲队应标记为领先');
            eq(doc.getElementById('cs-side-b').classList.contains('leading'), false,
                '乙队不应标记为领先');

            /* 局分刻度数量跟随赛制：三局两胜 = 2 个刻度 */
            eq(doc.querySelectorAll('#cs-games-a .cs-mark').length, 2, '甲队局分刻度数');

            app.courtside.close();
            await sleep(100);
        });

        /* ---------- 7. 状态层基础设施（事件总线 / 存档迁移） ----------
           这两块是接云同步的地基。地基不可靠的话，后端接上来只会更难查。 */
        await fresh();

        await test('事件总线', '订阅者按注册顺序收到事件，payload 正确传递', async function () {
            var seen = [];
            var off1 = app.bus.on('t:order', function (p) { seen.push('a' + p); });
            var off2 = app.bus.on('t:order', function (p) { seen.push('b' + p); });

            var n = app.bus.emit('t:order', 1);
            eq(n, 2, '应通知到 2 个订阅者');
            eq(seen.join(','), 'a1,b1', '应按注册顺序派发');

            off1(); off2();
            eq(app.bus.count('t:order'), 0, '退订后应清空');
        });

        await test('事件总线', '一个订阅者抛错不影响其他订阅者（隔离）', async function () {
            var ok = false;
            var offBad = app.bus.on('t:iso', function () { throw new Error('故意抛错'); });
            var offGood = app.bus.on('t:iso', function () { ok = true; });

            /* 旧版项目里出过「一个副作用抛错把整个状态机卡住」（B14），
               所以这里必须验证隔离：坏订阅者不能拖垮好订阅者。

               注意：总线会把隔离住的错误打进 console.error（这是对的，
               否则故障会被静默吞掉）。但测试运行器把「控制台出现 error」
               视为失败，所以这里临时把 console.error 静音 ——
               否则这条用例自己会让整轮测试变红。
               静音只包住这一次 emit，其余时间仍然正常记录，
               真正的意外错误不会被漏掉。 */
            var realErr = win.console.error;
            var muted = [];
            win.console.error = function () { muted.push([].slice.call(arguments)); };
            try {
                app.bus.emit('t:iso', null);
            } finally {
                win.console.error = realErr;
            }

            eq(ok, true, '第二个订阅者仍应收到事件');
            assert(muted.length >= 1, '被隔离的错误应至少记录一次（不能静默吞掉）');

            offBad(); offGood();
        });

        await test('事件总线', '订阅者在回调里退订不会打乱本次派发', async function () {
            var hits = [];
            var offB = null;
            var offA = app.bus.on('t:mut', function () {
                hits.push('a');
                if (offB) offB();          /* 派发过程中退订 b */
            });
            offB = app.bus.on('t:mut', function () { hits.push('b'); });

            app.bus.emit('t:mut', null);
            /* 本次派发用的是快照，所以 b 仍应收到（不静默丢失） */
            eq(hits.join(','), 'a,b', '本次派发应使用快照');

            /* 但下一次就不该再有 b 了 */
            hits.length = 0;
            app.bus.emit('t:mut', null);
            eq(hits.join(','), 'a', '退订应从下一次派发生效');

            offA();
        });

        await test('事件总线', 'state 落盘会广播变更事件', async function () {
            var kinds = [];
            var off = app.bus.on('state:settings', function () { kinds.push('settings'); });
            app.state.saveSettings();
            await sleep(50);
            eq(kinds.length, 1, 'saveSettings 应广播一次 state:settings');
            off();

            var matchKinds = 0;
            var off2 = app.bus.on('state:match', function () { matchKinds++; });
            app.state.saveMatch();
            await sleep(50);
            eq(matchKinds, 1, 'saveMatch 应广播一次 state:match');
            off2();
        });

        await test('存档迁移', '迁移是幂等的：重复运行不改变结果', async function () {
            /* 幂等性靠"确定性 id"保证：若用 Date.now()/randomUUID，
               重跑一次就会给同一场历史生成新 id，云端会认成两条不同记录。 */
            var r1 = app.migrate.run();
            var before = JSON.stringify(app.state.getMatchHistory());
            var r2 = app.migrate.run();
            var after = JSON.stringify(app.state.getMatchHistory());

            eq(r2.migrated, false, '已是最新版时不应再迁移');
            eq(after, before, '重复运行不应改变历史数据');
        });

        await test('存档迁移', '迁移给历史补上稳定 clientId，且同输入同输出', async function () {
            /* 手工造一份 v1 存档：没有 clientId 的两条历史 */
            var legacy = [
                { id: 1, teamA: '甲', teamB: '乙', scoreA: 2, scoreB: 0, date: 1700000000000 },
                { id: 2, teamA: '丙', teamB: '丁', scoreA: 1, scoreB: 2, date: 1700000100000 }
            ];
            app.state.setMatchHistory(legacy);
            app.migrate.setVersion(1);

            var r = app.migrate.run();
            eq(r.migrated, true, '应从 v1 迁移');
            eq(r.to, app.migrate.CURRENT_VERSION, '应迁到当前版本');
            assert(!r.error, '不应有错误：' + r.error);

            var hist = app.state.getMatchHistory();
            eq(hist.length, 2, '历史条数不应变化');
            assert(hist[0].clientId, '第一条应补上 clientId');
            assert(hist[1].clientId, '第二条应补上 clientId');
            assert(hist[0].clientId !== hist[1].clientId, '两条的 clientId 应不同');

            /* 同输入必须同输出：再迁一次（先把版本退回去）结果应一致 */
            var first = hist[0].clientId;
            app.state.setMatchHistory(legacy);
            app.migrate.setVersion(1);
            app.migrate.run();
            eq(app.state.getMatchHistory()[0].clientId, first,
                '相同输入应生成相同 clientId（否则重跑会产生重复记录）');
        });

        await test('存档迁移', '迁移前会留一份备份', async function () {
            app.state.setMatchHistory([{ id: 9, teamA: 'A', teamB: 'B', scoreA: 1, scoreB: 0, date: 1700000000000 }]);
            app.migrate.setVersion(1);
            app.migrate.run();
            var bak = app.store.readJSON('badminton.backup.v1', null);
            assert(bak && typeof bak === 'object', '应写出 badminton.backup.v1');
        });

        await test('存档迁移', '缺步骤时不假装迁完（版本停在安全位置）', async function () {
            /* 临时挖掉 v1→v2 这一步，模拟"发布了新版本但忘了写迁移" */
            var saved = app.migrate._migrations[1];
            delete app.migrate._migrations[1];
            try {
                app.migrate.setVersion(1);
                var r = app.migrate.run();
                eq(r.migrated, false, '不应报告迁移成功');
                eq(r.to, 1, '版本应停在 1，不能假装到了最新');
                assert(r.error && r.error.indexOf('缺少') >= 0,
                    '应给出缺步骤的错误，实际：' + r.error);
                eq(app.migrate.getVersion(), 1, '磁盘上的版本也应是 1');
            } finally {
                app.migrate._migrations[1] = saved;
            }
        });

        await test('存档迁移', '迁移失败不阻断应用启动', async function () {
            /* 应用此刻是正常运行的，说明迁移失败没有把启动搞挂。
               这里验证诊断信息确实被记录下来了。 */
            assert(app.state.migrationError !== undefined,
                'state 应暴露 migrationError 字段');
            eq(typeof app.state.migrationError, 'string', 'migrationError 应为字符串');
        });

        /* ---------- 8. PWA（SW1 / SW2，仅 http 通道有意义） ---------- */
        await test('PWA', 'SW 已注册且离线缓存里的 index.html 是真应用', async function () {
            if (!('serviceWorker' in win.navigator)) {
                throw new Error('当前环境不支持 serviceWorker（file:// 下属正常，需 http 通道）');
            }
            var reg = await win.navigator.serviceWorker.getRegistration();
            assert(reg, 'SW 应已注册');
            var names = await win.caches.keys();
            assert(names.length > 0, '应有缓存，实际 ' + JSON.stringify(names));
            var c = await win.caches.open(names[0]);
            var res = await c.match('./index.html');
            assert(res && res.ok, '缓存的 index.html 应为 200，实际 ' + (res && res.status));
            var txt = await res.text();
            contains(txt, 'js/app.js', '缓存的 index.html 应是真实应用');
            contains(txt, 'js/tokens.js', '缓存清单应含 tokens.js');
        });

        paint();
        window.__testDone = true;
    }

    document.getElementById('run').addEventListener('click', function () {
        results = [];
        listEl.innerHTML = '';
        currentGroup = null;
        run();
    });

    run();
})();
