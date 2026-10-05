/* ================================================================
   js/sync.js — 离线优先同步

   模型（本地权威 + 服务端去重）：
     1. 计分**永远**写本地，不等网络 —— 球馆信号差是常态，
        联网才能计分的计分板等于不能用。
     2. 每次本地写入把一条 mutation 放进队列。
     3. 有网时批量推送；服务端按 (owner_id, client_id) 幂等去重，
        所以弱网重试不会产生重复记录。
     4. 拉取用 updated_at 游标做增量，不全量拉。

   为什么队列不放 localStorage 而放内存 + localStorage 双写：
     localStorage 是同步 API，写队列会阻塞主线程；
     但队列又必须持久化（否则关掉页面就丢了）。
     折中：队列存 localStorage，但只在"入队/出队"这两个低频时刻写，
     不做逐条实时持久化。

   冲突解决：LWW（最后写入胜），按服务端 updated_at 排序。
     计分场景并发写极少，CRDT 会让数据结构复杂到没人敢改。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var QUEUE_KEY = 'badminton.syncQueue';
    var CURSOR_KEY = 'badminton.syncCursor';
    var LAST_SYNC_KEY = 'badminton.lastSyncAt';

    /* 一次最多推多少条。太大→单请求体过大且失败重试代价高；
       太小→弱网下往返次数爆炸。200 与服务端上限一致。 */
    var BATCH_SIZE = 200;

    var state = {
        /** 待推送的 mutation 队列 */
        queue: [],
        /** 上次成功拉取到的 updated_at 游标 */
        cursor: 0,
        /** 是否正在同步（防重入） */
        syncing: false,
        /** 上次同步时间 */
        lastSyncAt: 0,
        /** 上次同步错误（展示用；空串=正常） */
        lastError: '',
        /** 待推送数量（供角标展示） */
        pending: 0,
        /** 已同步过的 clientId -> updatedAt，用于增量合并 */
        online: false
    };

    function $(id) { return document.getElementById(id); }

    /* ---------- 持久化 ---------- */
    function load() {
        try {
            var q = App.store.readJSON(QUEUE_KEY, []);
            state.queue = Array.isArray(q) ? q.filter(function (x) {
                return x && typeof x === 'object' && x.clientId;
            }) : [];
            state.cursor = App.store.readJSON(CURSOR_KEY, 0) || 0;
            state.lastSyncAt = App.store.readJSON(LAST_SYNC_KEY, 0) || 0;
        } catch (e) {
            state.queue = [];
        }
        state.pending = state.queue.length;
    }

    function saveQueue() {
        App.store.writeJSON(QUEUE_KEY, state.queue);
        state.pending = state.queue.length;
        emit();
    }

    function saveCursor(v) {
        state.cursor = v;
        App.store.writeJSON(CURSOR_KEY, v);
    }

    /* ---------- 变更广播 ---------- */
    function emit() {
        if (App.bus) {
            App.bus.emit('sync:changed', {
                pending: state.pending,
                syncing: state.syncing,
                lastError: state.lastError,
                lastSyncAt: state.lastSyncAt,
                online: state.online
            });
        }
    }

    /* ---------- 入队 ----------
       每一条比赛记录就是一个 mutation。用 clientId 去重：
       同一场比赛被改多次时，队列里只保留最后一条，
       避免把中间态也推上去（服务端 upsert 本来也会覆盖，
       但少推几条省流量、也少几次写库）。 */
    function enqueueMatch(match) {
        if (!match || !match.clientId) return;

        var i;
        for (i = 0; i < state.queue.length; i++) {
            if (state.queue[i].clientId === match.clientId) {
                state.queue[i] = toPayload(match);
                saveQueue();
                schedule();
                return;
            }
        }
        state.queue.push(toPayload(match));
        saveQueue();
        schedule();
    }

    function toPayload(m) {
        return {
            clientId: m.clientId,
            teamA: m.teamA || '',
            teamB: m.teamB || '',
            scoreA: m.gamesWonA != null ? m.gamesWonA : (m.scoreA || 0),
            scoreB: m.gamesWonB != null ? m.gamesWonB : (m.scoreB || 0),
            gamesA: m.gamesWonA || 0,
            gamesB: m.gamesWonB || 0,
            gameScores: m.gameScores || '',
            durationSec: m.duration || 0,
            mode: m.mode || '21',
            playedAt: m.date || Date.now(),
            sessionId: m.sessionId || undefined,
            deleted: !!m.deleted,
            highlights: Array.isArray(m.highlights) ? m.highlights.slice(0, 20) : []
        };
    }

    /* ---------- 定时器 ----------
       不立即推：一次球局结束会连续写入（保存比赛 + 成就 + 统计），
       立刻推会产生一串请求。攒 3 秒合并成一次批量推送。 */
    var timer = null;
    function schedule(delay) {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(function () {
            timer = null;
            flush();
        }, delay == null ? 3000 : delay);
    }

    /* ---------- 推送 ---------- */
    function flush() {
        if (state.syncing) return Promise.resolve(false);
        if (!App.api || !App.api.isLoggedIn()) return Promise.resolve(false);
        if (!state.queue.length) return Promise.resolve(true);

        state.syncing = true;
        state.lastError = '';
        emit();

        /* 只取一批，成功后再递归下一批 —— 避免一次构造过大的请求体 */
        var batch = state.queue.slice(0, BATCH_SIZE);

        return App.api.pushMatches(batch).then(function (res) {
            /* 服务端可能只接受了部分（rejected 里的条目字段非法）。
               被拒的条目不能无限重试：它们永远不可能成功。
               从队列移除并记日志，避免队列卡死。 */
            var rejectedIdx = {};
            (res && res.rejected ? res.rejected : []).forEach(function (r) {
                if (typeof r.index === 'number') rejectedIdx[r.index] = true;
            });

            var pushedIds = {};
            batch.forEach(function (item, i) {
                if (!rejectedIdx[i]) pushedIds[item.clientId] = true;
            });

            state.queue = state.queue.filter(function (item) {
                return !pushedIds[item.clientId];
            });

            if (Object.keys(rejectedIdx).length && window.console) {
                console.warn('[sync] ' + Object.keys(rejectedIdx).length + ' 条记录被服务端拒绝，已丢弃');
            }

            state.syncing = false;
            state.lastSyncAt = Date.now();
            App.store.writeJSON(LAST_SYNC_KEY, state.lastSyncAt);
            saveQueue();

            /* 还有剩的就继续推 */
            if (state.queue.length) schedule(200);
            return true;
        }).catch(function (err) {
            state.syncing = false;
            /* 队列**保留**：网络恢复后要重试。
               区分"网络问题"与"业务错误"：
               401/403/422 重试也不会成功，但保留着至少不丢数据。 */
            state.lastError = (err && err.message) || '同步失败';
            emit();
            /* 失败后退避：30 秒后再试，不疯狂重连耗电 */
            schedule(30000);
            return false;
        });
    }

    /* ---------- 拉取 ---------- */
    function pull() {
        if (!App.api || !App.api.isLoggedIn()) return Promise.resolve(false);

        return App.api.pullMatches(state.cursor, BATCH_SIZE).then(function (res) {
            if (!res || !Array.isArray(res.items)) return false;

            if (res.items.length) {
                mergeIntoLocal(res.items);
                if (res.cursor) saveCursor(res.cursor);
            }
            /* 拉完还有更多就继续（首次登录时可能有几百条） */
            if (res.hasMore) return pull();
            return true;
        }).catch(function (err) {
            state.lastError = (err && err.message) || '拉取失败';
            emit();
            return false;
        });
    }

    /* 合并期间的抑制标记。
       ⚠️ 必须有：mergeIntoLocal 会调 setMatchHistory，
       而 setMatchHistory 会广播 state:matchHistory，
       监听器又把"新出现的记录"入队 —— 于是服务端刚拉下来的记录
       立刻被当成"本地新记录"再推回去，形成无限往返。
       这不是理论风险，是这类同步代码最经典的死循环。 */
    var suppressEnqueue = false;

    /* 把服务端的记录合并进本地历史。
       冲突用 LWW：服务端返回的是权威版本，直接覆盖本地。
       本地有而服务端没有的（离线新增还没推上去）保持原样。 */
    function mergeIntoLocal(remoteItems) {
        var local = App.state.getMatchHistory();
        var byClient = {};
        local.forEach(function (m) { if (m.clientId) byClient[m.clientId] = m; });

        var added = 0;
        var updated = 0;

        remoteItems.forEach(function (r) {
            var existing = byClient[r.clientId];
            var record = {
                id: existing ? existing.id : Date.now() + Math.floor(Math.random() * 1000),
                clientId: r.clientId,
                teamA: r.teamA,
                teamB: r.teamB,
                /* 本地历史里的 scoreA/scoreB 表示「赢了几局」（局分），
                   不是某一局的得分。与服务端字段语义一致。 */
                scoreA: r.scoreA,
                scoreB: r.scoreB,
                gamesWonA: r.scoreA,
                gamesWonB: r.scoreB,
                gameScores: r.gameScores,
                duration: r.durationSec,
                mode: r.mode,
                date: r.playedAt,
                highlights: r.highlights || [],
                /* updatedAt 是服务端时间：用它当"已同步"的凭据，
                   下次不必再推。 */
                updatedAt: r.updatedAt,
                synced: true,
                deleted: !!r.deleted
            };
            if (existing) updated++; else added++;
            byClient[r.clientId] = record;
        });

        /* 墓碑（deleted）不删除本地条目，而是标记 ——
           界面按需过滤，这样"删除"也能在多设备间传播。 */
        var merged = Object.keys(byClient).map(function (k) { return byClient[k]; });
        merged.sort(function (a, b) { return (b.date || 0) - (a.date || 0); });

        suppressEnqueue = true;
        try {
            App.state.setMatchHistory(merged);
        } finally {
            suppressEnqueue = false;
        }

        if (App.bus && (added || updated)) {
            App.bus.emit('sync:merged', { added: added, updated: updated });
        }
    }

    /* ---------- 全量同步（登录后 / 手动触发）---------- */
    function syncNow() {
        if (!App.api || !App.api.isLoggedIn()) {
            return Promise.resolve(false);
        }
        if (!state.online) {
            /* 明确离线：不必发请求，但要如实报告状态，
               否则界面会显示"已同步"而数据其实卡在队列里。 */
            state.lastError = '当前离线，恢复网络后会自动同步';
            emit();
            return Promise.resolve(false);
        }

        /* 先推后拉：本地新增的立刻上传，再拉回其他设备的改动。
           反过来的话，刚推上去的记录又会被拉下来一次（虽然幂等，
           但多一次无谓的写）。 */
        var pushOk = true;
        return flush().then(function (okFlag) {
            pushOk = okFlag !== false;
            /* 推送失败时不要继续拉取：拉回来的数据会和本地队列混在一起，
               增加判断复杂度，而用户感知上"同步失败"就够了。 */
            if (!pushOk) return false;
            return pull();
        }).then(function (pullOk) {
            /* ⚠️ 返回值必须反映真实结果。
               第一版这里无条件 return true，且 pull() 成功会把 lastError
               清空 —— 于是"推送失败但拉取成功"被报成同步成功，
               界面显示"已同步"而队列里还压着数据（实测复现过）。 */
            var ok = pushOk && pullOk !== false && !state.lastError;
            if (ok) {
                state.lastError = '';
            } else if (!state.lastError) {
                state.lastError = '同步未完成，请稍后重试';
            }
            emit();
            return ok;
        });
    }

    /* ---------- 网络状态 ---------- */
    function bindNetwork() {
        state.online = navigator.onLine !== false;
        window.addEventListener('online', function () {
            state.online = true;
            emit();
            /* 一恢复网络就补推，不等用户手动点 */
            schedule(500);
        });
        window.addEventListener('offline', function () {
            state.online = false;
            emit();
        });
    }

    /* ---------- 订阅本地变更 ----------
       比赛历史一变就入队。用事件总线而不是在每个写入点手动调用，
       这样以后新增写入路径（比如导入备份）也能自动被同步覆盖。 */
    function bindStateChanges() {
        if (!App.bus) return;

        App.bus.on('state:matchHistory', function () {
            /* 合并期间不自入队，否则形成推送→拉取→再推送的死循环 */
            if (suppressEnqueue) return;
            if (!App.api || !App.api.isLoggedIn()) return;

            var hist = App.state.getMatchHistory();
            var queued = {};
            state.queue.forEach(function (q) { queued[q.clientId] = true; });

            hist.forEach(function (m) {
                if (!m.clientId) return;
                if (queued[m.clientId]) return;
                /* 已同步过的记录（synced=true 且服务端更新时间不比本地旧）
                   不必再推。 */
                if (m.synced) return;
                enqueueMatch(m);
            });
        });
    }

    /* ---------- 初始化 ---------- */
    function init() {
        load();
        bindNetwork();
        bindStateChanges();

        /* 恢复会话后自动同步一次 */
        if (App.api && App.api.available()) {
            App.api.restore().then(function (user) {
                if (user) return syncNow();
                return null;
            }).catch(function () { /* 静默：未登录是正常状态 */ });
        }
    }

    App.sync = {
        init: init,
        syncNow: syncNow,
        flush: flush,
        pull: pull,
        enqueueMatch: enqueueMatch,
        status: function () {
            return {
                pending: state.pending,
                syncing: state.syncing,
                lastError: state.lastError,
                lastSyncAt: state.lastSyncAt,
                online: state.online
            };
        },
        /* 供测试与诊断 */
        _reset: function () {
            state.queue = [];
            state.cursor = 0;
            state.lastError = '';
            saveQueue();
            saveCursor(0);
        }
    };
})(window.App);
