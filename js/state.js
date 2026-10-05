/* ================================================================
   state.js — 单一数据源
   比赛状态 / 设置 / 成就统计 / 路由，全部集中在这里读写并落盘。
   字段名与旧版逐字一致（零迁移），任何模块都不直接碰 localStorage。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var store = App.store;

    /* ---------- 默认值（与旧版结构完全一致）---------- */
    function defaultMatch() {
        return {
            scoreA: 0,
            scoreB: 0,
            gamesWonA: 0,
            gamesWonB: 0,
            currentGame: 1,
            seconds: 0,
            teamNameA: '队伍 A',
            teamNameB: '队伍 B',
            scoreHistory: [],
            gameScoresHistory: [],
            timerRunning: false
        };
    }

    function defaultSettings() {
        return {
            gameMode: '21',          // '21' | '15' | '11' | 'custom'
            targetScore: 21,
            bestOfThree: true,
            deuceMode: true,
            soundEnabled: true,
            vibrationEnabled: true,
            sideChangeAlert: true
        };
    }

    function defaultStats() {
        return {
            totalMatches: 0,
            totalWins: 0,
            currentStreak: 0,
            totalDuration: 0,
            deuceCount: 0
        };
    }

    /* ---------- 宽松规整：缺字段补默认，类型不对就换默认 ---------- */
    function num(v, d) {
        var n = typeof v === 'number' ? v : parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : d;
    }

    function str(v, d) {
        return (typeof v === 'string' && v.length) ? v : d;
    }

    function arr(v) {
        return Array.isArray(v) ? v : [];
    }

    /* 只保留「像对象」的条目：null / 字符串 / 数字 / 数组一律丢掉。
       老数据或手改过的 localStorage 里常混进这些，渲染层逐层判空太容易漏，
       在这里一次性过滤掉，三条历史链路的渲染才有干净输入。 */
    function objs(v) {
        return arr(v).filter(function (x) {
            return !!x && typeof x === 'object' && !Array.isArray(x);
        });
    }

    /* num() 只挡 NaN/Infinity，不挡负数和天文数字。
       手改过的存档里出现过 gamesWonA:-5、currentGame:1e9，
       原样存活后会渲染成「第 1000000000 局」、负局分，所以这里补范围钳制。 */
    function clamp(v, d, min, max) {
        var n = num(v, d);
        if (n < min) n = min;
        if (max !== null && max !== undefined && n > max) n = max;
        return n;
    }

    function bool(v, d) {
        return typeof v === 'boolean' ? v : d;
    }

    function normalizeMatch(raw) {
        var d = defaultMatch();
        if (!raw || typeof raw !== 'object') return d;
        return {
            scoreA: clamp(raw.scoreA, d.scoreA, 0, null),
            scoreB: clamp(raw.scoreB, d.scoreB, 0, null),
            gamesWonA: clamp(raw.gamesWonA, d.gamesWonA, 0, 2),
            gamesWonB: clamp(raw.gamesWonB, d.gamesWonB, 0, 2),
            currentGame: clamp(raw.currentGame, d.currentGame, 1, 3),
            seconds: clamp(raw.seconds, d.seconds, 0, null),
            teamNameA: str(raw.teamNameA, d.teamNameA),
            teamNameB: str(raw.teamNameB, d.teamNameB),
            scoreHistory: objs(raw.scoreHistory),
            gameScoresHistory: arr(raw.gameScoresHistory),
            timerRunning: bool(raw.timerRunning, d.timerRunning),
            /* 同步标识：core/migrate.js 的 v1→v2 迁移给进行中的比赛补过
               clientId（用于「一场比赛跨设备继续」）。它曾经不在这里，
               于是 loadMatchState 一读、saveMatch 一写就把它抹掉，
               而版本号已推进到 2、迁移永不重跑 —— 迁移写了等于白写。
               与 normMatchItem 的 clientId 是同一类问题（见下方注释）。 */
            clientId: str(raw.clientId, '')
        };
    }

    function normalizeSettings(raw) {
        var d = defaultSettings();
        if (!raw || typeof raw !== 'object') return d;
        var mode = (typeof raw.gameMode === 'string') ? raw.gameMode : d.gameMode;
        return {
            gameMode: mode,
            targetScore: num(raw.targetScore, d.targetScore),
            bestOfThree: bool(raw.bestOfThree, d.bestOfThree),
            deuceMode: bool(raw.deuceMode, d.deuceMode),
            soundEnabled: bool(raw.soundEnabled, d.soundEnabled),
            vibrationEnabled: bool(raw.vibrationEnabled, d.vibrationEnabled),
            sideChangeAlert: bool(raw.sideChangeAlert, d.sideChangeAlert)
        };
    }

    function normalizeStats(raw) {
        var d = defaultStats();
        if (!raw || typeof raw !== 'object') return d;
        return {
            totalMatches: num(raw.totalMatches, d.totalMatches),
            totalWins: num(raw.totalWins, d.totalWins),
            currentStreak: num(raw.currentStreak, d.currentStreak),
            totalDuration: num(raw.totalDuration, d.totalDuration),
            deuceCount: num(raw.deuceCount, d.deuceCount)
        };
    }

    /* ---------- 存档迁移 ----------
       必须在读取任何状态之前跑完：迁移可能改写 match / matchHistory 的
       结构（补 clientId 等同步字段），先读后迁会读到旧结构。

       失败时不阻断启动：迁移出错只意味着"暂时还用不上云同步"，
       不该让整个应用打不开。错误留在 state.migrationError 供设置页展示。 */
    var migrationResult = null;
    var migrationError = '';
    try {
        if (App.migrate) {
            migrationResult = App.migrate.run();
            if (migrationResult && migrationResult.error) {
                migrationError = migrationResult.error;
                if (window.console && console.warn) {
                    console.warn('[state] 存档迁移未完成：' + migrationError);
                }
            }
        }
    } catch (e) {
        migrationError = (e && e.message) || String(e);
        if (window.console && console.error) {
            console.error('[state] 存档迁移异常', e);
        }
    }

    /* ---------- 运行时状态 ---------- */
    var state = {
        match: normalizeMatch(store.readJSON(store.KEYS.MATCH_STATE, null)),
        settings: normalizeSettings(store.readJSON(store.KEYS.SETTINGS, null)),
        stats: normalizeStats(store.readJSON(store.KEYS.ACHIEVEMENT_STATS, null)),
        unlocked: (function () {
            var v = store.readJSON(store.KEYS.UNLOCKED, []);
            return Array.isArray(v) ? v : [];
        })(),
        avatars: (function () {
            var v = store.readJSON(store.KEYS.AVATARS, {});
            return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
        })(),
        hasSeenOnboarding: store.readJSON(store.KEYS.ONBOARDING, false) === true,
        lastGroups: store.readJSON(store.KEYS.LAST_GROUPS, null),
        /* 路由：tab 为 4 主入口之一，sub 为该 Tab 内的二级页 */
        route: { tab: 'score', sub: '' },
        /* 弹层栈，Esc / 返回键依次关闭 */
        overlays: [],
        /* 迁移诊断（设置页「关于」会展示；为空表示一切正常） */
        migrationError: migrationError,
        migrationResult: migrationResult
    };

    /* ---------- 落盘 ----------
       每一次写入都广播一条事件。这是接云同步的前提：
       同步层需要知道「哪一类数据变了、变了多少」，而不是被动全量重绘。

       事件名统一 `state:` 前缀，payload 尽量小（只带 id / 数量这类线索），
       订阅者要完整数据就自己读 state —— 避免事件里塞大对象被长期持有。

       ⚠️ 兼容性：这些函数的名字、参数、返回值一律不变。
       30 条回归测试里有大量 `app.state.saveMatch()` 这类调用，
       签名一动就全红。 */
    function emitChange(kind, extra) {
        if (App.bus) {
            try { App.bus.emit('state:' + kind, extra || null); } catch (e) { /* 通知失败不影响落盘 */ }
        }
    }

    function saveMatch() {
        var ok = store.writeJSON(store.KEYS.MATCH_STATE, state.match);
        emitChange('match');
        return ok;
    }

    function saveSettings() {
        var ok = store.writeJSON(store.KEYS.SETTINGS, state.settings);
        emitChange('settings');
        return ok;
    }

    function saveStats() {
        var ok = store.writeJSON(store.KEYS.ACHIEVEMENT_STATS, state.stats);
        emitChange('stats');
        return ok;
    }

    function saveUnlocked() {
        var ok = store.writeJSON(store.KEYS.UNLOCKED, state.unlocked);
        emitChange('unlocked');
        return ok;
    }

    function saveAvatars() {
        var ok = store.writeJSON(store.KEYS.AVATARS, state.avatars);
        emitChange('avatars');
        return ok;
    }

    function saveLastGroups(v) {
        state.lastGroups = v;
        var ok = store.writeJSON(store.KEYS.LAST_GROUPS, v);
        emitChange('lastGroups');
        return ok;
    }

    function saveOnboarding() {
        var ok = store.writeJSON(store.KEYS.ONBOARDING, state.hasSeenOnboarding);
        emitChange('onboarding');
        return ok;
    }

    /* ---------- 列表类历史（带上限）---------- */
    var LIMITS = {
        grouping: 10,
        expense: 20
    };

    /* 分组历史条目规整：groups 必须是「数组的数组」，否则渲染层 .map 会抛 */
    function normGroupItem(raw) {
        var groups = arr(raw.groups).map(function (g) {
            return arr(g).filter(function (p) { return p && typeof p === 'object'; });
        });
        return {
            groups: groups,
            mode: str(raw.mode, 'random'),
            modeName: str(raw.modeName, ''),
            players: arr(raw.players),
            date: num(raw.date, Date.now())
        };
    }

    function getGroupingHistory() {
        return objs(store.readJSON(store.KEYS.GROUPING_HISTORY, [])).map(normGroupItem);
    }

    function setGroupingHistory(list) {
        if (!Array.isArray(list)) list = [];
        if (list.length > LIMITS.grouping) list = list.slice(0, LIMITS.grouping);
        store.writeJSON(store.KEYS.GROUPING_HISTORY, list);
        emitChange('groupingHistory', { count: list.length });
        return list;
    }

    function pushGroupingHistory(item) {
        var list = getGroupingHistory();
        list.unshift(item);
        return setGroupingHistory(list);
    }

    /* 费用历史条目规整：金额/时长全部转 number，避免 NaN 渗进 UI 与图表 */
    function normExpenseItem(raw) {
        return {
            type: str(raw.type, '其他'),
            total: num(raw.total, 0),
            splitMode: str(raw.splitMode, 'equal'),
            participants: arr(raw.participants).map(String),
            ratios: arr(raw.ratios).map(function (r) { return num(r, 0); }),
            durations: arr(raw.durations).map(function (d) { return num(d, 0); }),
            date: num(raw.date, Date.now())
        };
    }

    function getExpenseHistory() {
        return objs(store.readJSON(store.KEYS.EXPENSE_HISTORY, [])).map(normExpenseItem);
    }

    function setExpenseHistory(list) {
        if (!Array.isArray(list)) list = [];
        if (list.length > LIMITS.expense) list = list.slice(0, LIMITS.expense);
        store.writeJSON(store.KEYS.EXPENSE_HISTORY, list);
        return list;
    }

    function pushExpenseHistory(item) {
        var list = getExpenseHistory();
        list.unshift(item);
        return setExpenseHistory(list);
    }

    /* 比赛历史条目规整：比分/时长转 number，日期给合法时间戳，
       字符串日期（老数据）也能被 new Date() 正确解析。

       ⚠️ 这里是"白名单重建"，不是"逐字段清洗"：返回对象里没列出的字段
       会被静默丢弃。core/migrate.js 给每条历史补的 clientId 就是靠
       推送去重与冲突解决的，如果这里不带出来，迁移写了也等于白写
       （存进去有、读出来没有）。加字段时必须同步加进这个对象。 */
    function normMatchItem(raw) {
        var d = raw.date;
        if (typeof d === 'string') {
            var t = Date.parse(d);
            d = isFinite(t) ? t : Date.now();
        }
        return {
            id: num(raw.id, Date.now()),
            /* 同步标识：迁移补的，或保存时新生成的 */
            clientId: str(raw.clientId, ''),
            teamA: str(raw.teamA, '队伍 A'),
            teamB: str(raw.teamB, '队伍 B'),
            scoreA: clamp(raw.scoreA, 0, 0, null),
            scoreB: clamp(raw.scoreB, 0, 0, null),
            gamesWonA: clamp(raw.gamesWonA, 0, 0, 2),
            gamesWonB: clamp(raw.gamesWonB, 0, 0, 2),
            gameScores: str(raw.gameScores, ''),
            duration: clamp(raw.duration, 0, 0, null),
            mode: str(raw.mode, ''),
            date: num(d, Date.now()),
            highlights: arr(raw.highlights).map(String),
            /* 同步时间戳：0 表示"从未同步"。用于 LWW 冲突解决。 */
            updatedAt: clamp(raw.updatedAt, 0, 0, null),
            /* 软删除：云端删除后本地保留墓碑，避免被其他设备推回来 */
            deleted: bool(raw.deleted, false),
            /* 已同步标记。sync.js 的入队闸门读它做去重
               （「synced=true 的记录不必再推」）。
               它曾经不在这里 —— 于是闸门恒不成立，每次历史变更都把
               整段历史重新入队重推；而服务端 matches.ts 无条件用
               Date.now() 覆盖 updated_at，配合「到达时间 LWW」，
               旧数据会把新数据盖掉。 */
            synced: bool(raw.synced, false)
        };
    }

    function getMatchHistory() {
        return objs(store.readJSON(store.KEYS.MATCH_HISTORY, [])).map(normMatchItem);
    }

    function setMatchHistory(list) {
        if (!Array.isArray(list)) list = [];
        store.writeJSON(store.KEYS.MATCH_HISTORY, list);
        emitChange('matchHistory', { count: list.length });
        return list;
    }

    function pushMatchHistory(item) {
        var list = getMatchHistory();
        list.unshift(item);
        return setMatchHistory(list);
    }

    /* ---------- 设置快捷访问 ---------- */
    function targetScore() {
        if (state.settings.gameMode === 'custom') return num(state.settings.targetScore, 21);
        return num(state.settings.gameMode, 21);
    }

    /* ------------------------------------------------------------
       导出 state 对象本身（而不是它的属性快照）。
       旧写法把属性逐个拷贝到新对象上，外部 `App.state.match = x`
       之后 saveMatch() 读到的仍是闭包里的旧值，导致恢复存档后
       一保存就把刚恢复的数据覆盖回默认值。
       把方法直接挂到 state 上，读写才是同一份。
       ------------------------------------------------------------ */
    state.normalizeMatch = normalizeMatch;
    state.normalizeSettings = normalizeSettings;
    state.normalizeStats = normalizeStats;

    state.saveMatch = saveMatch;
    state.saveSettings = saveSettings;
    state.saveStats = saveStats;
    state.saveUnlocked = saveUnlocked;
    state.saveAvatars = saveAvatars;
    state.saveLastGroups = saveLastGroups;
    state.saveOnboarding = saveOnboarding;

    state.getGroupingHistory = getGroupingHistory;
    state.setGroupingHistory = setGroupingHistory;
    state.pushGroupingHistory = pushGroupingHistory;
    state.getExpenseHistory = getExpenseHistory;
    state.setExpenseHistory = setExpenseHistory;
    state.pushExpenseHistory = pushExpenseHistory;
    state.getMatchHistory = getMatchHistory;
    state.setMatchHistory = setMatchHistory;
    state.pushMatchHistory = pushMatchHistory;

    state.targetScore = targetScore;

    state.defaults = {
        match: defaultMatch,
        settings: defaultSettings,
        stats: defaultStats
    };

    App.state = state;
})(window.App);
