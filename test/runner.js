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

        await test('存档规整', '脏数据全部优雅降级，不抛异常、不污染原型', async function () {
            var samples = [null, undefined, 'x', 42, true, [], [1, 2],
                { __proto__: { polluted: 1 } }, { scoreA: {} },
                { scoreHistory: 'nope' }, { gameScoresHistory: {} }];
            for (var i = 0; i < samples.length; i++) {
                var r = app.state.normalizeMatch(samples[i]);
                assert(r && typeof r === 'object', '样本 ' + i + ' 应返回对象');
                assert(isFinite(r.scoreA) && isFinite(r.scoreB), '样本 ' + i + ' 得分应为有限数');
            }
            assert(({}).polluted === undefined, '不应发生原型污染');
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
            fillExpense(100, '张三\n李四', null);
            var body = doc.body.innerText;
            notContains(body, 'Infinity', '界面不应出现 Infinity');
            notContains(body, 'NaN', '界面不应出现 NaN');
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

        await test('视觉令牌', 'D2 tokens.js 能读到 CSS 自定义属性', async function () {
            var brand = app.tokens.get('--c-brand');
            assert(/^#[0-9a-f]{6}$/i.test(brand), '品牌色应为 hex，实际 ' + brand);
            eq(brand.toLowerCase(), '#d4ff3f', '品牌色值');
            /* alpha() 收的是色值，不是令牌名 */
            var soft = app.tokens.alpha(brand, 0.3);
            assert(/^rgba?\(/.test(soft), 'alpha() 应产出 rgba，实际 ' + soft);
        });

        await test('视觉令牌', 'D1 成就徽章渲染出真 SVG 而不是图标名', async function () {
            win.location.hash = '#tab=me&sub=achievements';
            await sleep(700);
            var icon = doc.getElementById('ab-icon');
            if (icon) {
                assert(icon.querySelector('svg'), '徽章图标应为 SVG');
                notContains(icon.textContent, 'shuttle', '不应显示图标名');
            }
        });

        /* ---------- 6. PWA（SW1 / SW2，仅 http 通道有意义） ---------- */
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
