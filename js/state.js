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

    function bool(v, d) {
        return typeof v === 'boolean' ? v : d;
    }

    function normalizeMatch(raw) {
        var d = defaultMatch();
        if (!raw || typeof raw !== 'object') return d;
        return {
            scoreA: num(raw.scoreA, d.scoreA),
            scoreB: num(raw.scoreB, d.scoreB),
            gamesWonA: num(raw.gamesWonA, d.gamesWonA),
            gamesWonB: num(raw.gamesWonB, d.gamesWonB),
            currentGame: num(raw.currentGame, d.currentGame),
            seconds: num(raw.seconds, d.seconds),
            teamNameA: str(raw.teamNameA, d.teamNameA),
            teamNameB: str(raw.teamNameB, d.teamNameB),
            scoreHistory: objs(raw.scoreHistory),
            gameScoresHistory: arr(raw.gameScoresHistory),
            timerRunning: bool(raw.timerRunning, d.timerRunning)
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
        overlays: []
    };

    /* ---------- 落盘 ---------- */
    function saveMatch() { store.writeJSON(store.KEYS.MATCH_STATE, state.match); }
    function saveSettings() { store.writeJSON(store.KEYS.SETTINGS, state.settings); }
    function saveStats() { store.writeJSON(store.KEYS.ACHIEVEMENT_STATS, state.stats); }
    function saveUnlocked() { store.writeJSON(store.KEYS.UNLOCKED, state.unlocked); }
    function saveAvatars() { store.writeJSON(store.KEYS.AVATARS, state.avatars); }
    function saveLastGroups(v) { state.lastGroups = v; store.writeJSON(store.KEYS.LAST_GROUPS, v); }
    function saveOnboarding() { store.writeJSON(store.KEYS.ONBOARDING, state.hasSeenOnboarding); }

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
       字符串日期（老数据）也能被 new Date() 正确解析。 */
    function normMatchItem(raw) {
        var d = raw.date;
        if (typeof d === 'string') {
            var t = Date.parse(d);
            d = isFinite(t) ? t : Date.now();
        }
        return {
            id: num(raw.id, Date.now()),
            teamA: str(raw.teamA, '队伍 A'),
            teamB: str(raw.teamB, '队伍 B'),
            scoreA: num(raw.scoreA, 0),
            scoreB: num(raw.scoreB, 0),
            gamesWonA: num(raw.gamesWonA, 0),
            gamesWonB: num(raw.gamesWonB, 0),
            gameScores: str(raw.gameScores, ''),
            duration: num(raw.duration, 0),
            mode: str(raw.mode, ''),
            date: num(d, Date.now()),
            highlights: arr(raw.highlights).map(String)
        };
    }

    function getMatchHistory() {
        return objs(store.readJSON(store.KEYS.MATCH_HISTORY, [])).map(normMatchItem);
    }

    function setMatchHistory(list) {
        if (!Array.isArray(list)) list = [];
        store.writeJSON(store.KEYS.MATCH_HISTORY, list);
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
