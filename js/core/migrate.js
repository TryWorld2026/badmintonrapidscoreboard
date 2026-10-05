/* ================================================================
   core/migrate.js — 存档版本迁移框架

   为什么需要它：
     现在要往存档里加字段（云同步 id、俱乐部 id、球员身份…），
     而线上已有用户的数据是旧结构。历史教训很明确：
     REFACTOR_NOTES 里 30+ 个缺陷中有一大半与「读到缺字段/错类型的旧数据」有关。
     靠每处渲染层判空是防不住的，必须有一个集中的迁移入口。

   设计原则：
     1. **只增不减**：迁移只补字段、不改已有字段的语义。
        旧字段一旦被读走，改语义就是静默的数据损坏。
     2. **顺序执行、幂等**：v1→v2→v3 逐级跑；已是最新的直接跳过。
        每条迁移都必须能在"已经迁过一次"的数据上安全重跑。
     3. **失败不毁数据**：任一迁移抛错就停在那一步，保留已完成的成果，
        并把版本停在安全位置——绝不把半迁移的数据标记为"已完成"。
     4. **迁移前自动备份**：写入新结构之前先把旧结构整份存到
        `badminton.backup.<version>`，用户后悔时能捞回来。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var store = App.store;

    /* 当前代码期望的存档版本。加字段就 +1 并补一条迁移。 */
    var CURRENT_VERSION = 2;

    /* 版本号存这个键。刻意用新命名空间，避免与旧键冲突。 */
    var VERSION_KEY = 'badminton.schemaVersion';

    /* ------------------------------------------------------------
       迁移表：from → 把 from 版数据变成 from+1 版
       每条签名 (data) => data，data 是 { match, settings, stats, ... } 的聚合视图
       ------------------------------------------------------------ */
    var MIGRATIONS = {

        /* v1 → v2：为云端同步做准备
           加的都是"存在但为空"的字段，不影响任何现有逻辑：
           本地-only 用户永远用不到它们，登录后才被填上。 */
        1: function (data) {
            var m = data.match || {};
            /* 每条比赛历史需要一个稳定的客户端 id：
               推送去重、冲突解决都靠它。旧数据没有，就按「日期+队名」生成一个
               确定性 id —— 用 Date.now() 会导致每次迁移都产生新 id。 */
            if (Array.isArray(data.matchHistory)) {
                data.matchHistory = data.matchHistory.map(function (it) {
                    if (!it || typeof it !== 'object') return it;
                    if (it.clientId) return it;
                    it.clientId = deterministicId(it);
                    return it;
                });
            }
            /* 比赛状态也带上，用于「一场比赛跨设备继续」 */
            if (m && !m.clientId) m.clientId = deterministicId({
                teamA: m.teamNameA, teamB: m.teamNameB, date: m.startedAt || 0
            });
            data.match = m;
            return data;
        }
    };

    /* 确定性 id：同样的输入永远得到同样的输出。
       不用 crypto.randomUUID —— 那会让"重跑迁移"产生不同结果，
       破坏幂等性（同一场历史被迁两次会得到两个不同 id）。 */
    function deterministicId(obj) {
        var seed = [
            (obj && obj.date) || '',
            (obj && (obj.teamA || obj.teamNameA)) || '',
            (obj && (obj.teamB || obj.teamNameB)) || '',
            (obj && obj.gameScores) || ''
        ].join('|');
        var h = 2166136261;                       /* FNV-1a */
        for (var i = 0; i < seed.length; i++) {
            h ^= seed.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return 'm' + h.toString(36) + '-' + seed.length.toString(36);
    }

    /* ------------------------------------------------------------
       读取当前存档版本。读不到（全新用户 / 旧版用户）按 1 处理。
       ------------------------------------------------------------ */
    function getVersion() {
        var v = store.readJSON(VERSION_KEY, null);
        var n = typeof v === 'number' ? v : parseInt(v, 10);
        if (!isFinite(n) || n < 1) return 1;
        return n;
    }

    function setVersion(v) {
        store.writeJSON(VERSION_KEY, v);
    }

    /* ------------------------------------------------------------
       把散落在各个键里的数据聚合成一份，跑迁移，再写回。
       返回 { from, to, migrated, error? }
       ------------------------------------------------------------ */
    function run() {
        var from = getVersion();
        if (from >= CURRENT_VERSION) {
            return { from: from, to: from, migrated: false };
        }

        /* 迁移前整份备份：出问题时用户至少能把数据捞回来。
           备份键名带版本号，多次升级不会互相覆盖。 */
        try {
            var snapshot = store.exportAll();
            store.writeJSON('badminton.backup.v' + from, snapshot);
        } catch (e) {
            /* 备份失败不阻断迁移（隐私模式下可能写不进去），但要留痕 */
            if (window.console && console.warn) {
                console.warn('[migrate] 备份失败，继续迁移', e);
            }
        }

        var v = from;
        var data = null;

        while (v < CURRENT_VERSION) {
            var step = MIGRATIONS[v];
            if (typeof step !== 'function') {
                /* 缺一步就停：宁可版本停在 v，也不要假装迁完 */
                return {
                    from: from, to: v, migrated: v !== from,
                    error: '缺少 v' + v + ' → v' + (v + 1) + ' 的迁移'
                };
            }

            /* 每一步都重新读盘：上一步可能改了数据 */
            data = readAll();
            try {
                data = step(data) || data;
            } catch (e) {
                /* 抛错就停，版本不推进 —— 下次启动会重试同一步 */
                return {
                    from: from, to: v, migrated: v !== from,
                    error: 'v' + v + ' 迁移失败：' + (e && e.message)
                };
            }

            if (!writeAll(data)) {
                return {
                    from: from, to: v, migrated: v !== from,
                    error: 'v' + (v + 1) + ' 写入失败（存储不可用？）'
                };
            }

            v++;
            setVersion(v);
        }

        return { from: from, to: v, migrated: true };
    }

    /* ------------------------------------------------------------
       聚合读写：只处理本框架关心的键，其余键原样不动。
       ------------------------------------------------------------ */
    var KEYS = {
        match: 'matchState',
        matchHistory: 'matchHistory',
        settings: 'settings',
        stats: 'achievementStats',
        unlocked: 'unlockedAchievements',
        avatars: 'playerAvatars',
        groupingHistory: 'groupingHistory',
        expenseHistory: 'expenseHistory',
        lastGroups: 'lastGroups',
        onboarding: 'hasSeenOnboarding'
    };

    function readAll() {
        var out = {};
        Object.keys(KEYS).forEach(function (k) {
            out[k] = store.readJSON(KEYS[k], null);
        });
        return out;
    }

    function writeAll(data) {
        if (!data || typeof data !== 'object') return false;
        var ok = true;
        Object.keys(KEYS).forEach(function (k) {
            if (!Object.prototype.hasOwnProperty.call(data, k)) return;
            if (data[k] === null || data[k] === undefined) return;
            if (!store.writeJSON(KEYS[k], data[k])) ok = false;
        });
        return ok;
    }

    App.migrate = {
        CURRENT_VERSION: CURRENT_VERSION,
        VERSION_KEY: VERSION_KEY,
        KEYS: KEYS,
        getVersion: getVersion,
        setVersion: setVersion,
        run: run,
        /* 供测试使用 */
        _migrations: MIGRATIONS,
        _deterministicId: deterministicId,
        _readAll: readAll,
        _writeAll: writeAll
    };
})(window.App);
