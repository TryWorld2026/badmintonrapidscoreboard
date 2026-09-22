/* ================================================================
   store.js — 持久化层（localStorage）
   键名与数据结构与旧版完全一致，零迁移。
   所有读写都包 try/catch：隐私模式 / file:// 下 localStorage 可能
   直接抛异常，此时退化为内存存储，保证页面不白屏。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var KEYS = {
        MATCH_STATE: 'matchState',
        MATCH_HISTORY: 'matchHistory',
        GROUPING_HISTORY: 'groupingHistory',
        EXPENSE_HISTORY: 'expenseHistory',
        SETTINGS: 'settings',
        ACHIEVEMENT_STATS: 'achievementStats',
        UNLOCKED: 'unlockedAchievements',
        AVATARS: 'playerAvatars',
        ONBOARDING: 'hasSeenOnboarding',
        LAST_GROUPS: 'lastGroups'
    };

    /* 全部 10 个键，备份/恢复/清空时使用 */
    var ALL_KEYS = [
        KEYS.MATCH_STATE, KEYS.MATCH_HISTORY, KEYS.GROUPING_HISTORY,
        KEYS.EXPENSE_HISTORY, KEYS.SETTINGS, KEYS.ACHIEVEMENT_STATS,
        KEYS.UNLOCKED, KEYS.AVATARS, KEYS.ONBOARDING, KEYS.LAST_GROUPS
    ];

    var mem = {};
    var backend = null;
    var available = false;

    try {
        backend = window.localStorage;
        var probe = '__bb_probe__';
        backend.setItem(probe, '1');
        backend.removeItem(probe);
        available = true;
    } catch (e) {
        available = false;
    }

    function isAvailable() { return available; }

    function readRaw(key) {
        if (available) {
            try { return backend.getItem(key); } catch (e) { /* fallthrough */ }
        }
        return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    }

    function writeRaw(key, value) {
        mem[key] = value;
        if (available) {
            try { backend.setItem(key, value); return true; } catch (e) { return false; }
        }
        return true;
    }

    function removeRaw(key) {
        delete mem[key];
        if (available) {
            try { backend.removeItem(key); } catch (e) { /* ignore */ }
        }
    }

    /* 宽松读取：任何解析失败都退回 fallback，绝不抛错 */
    function readJSON(key, fallback) {
        var raw = readRaw(key);
        if (raw === null || raw === undefined || raw === '') return fallback;
        try {
            var val = JSON.parse(raw);
            if (val === null || val === undefined) return fallback;
            return val;
        } catch (e) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            return writeRaw(key, JSON.stringify(value));
        } catch (e) {
            return false;
        }
    }

    function remove(key) { removeRaw(key); }

    function clearAll() {
        for (var i = 0; i < ALL_KEYS.length; i++) removeRaw(ALL_KEYS[i]);
    }

    /* 全量导出（备份用）：只导出存在的键 */
    function exportAll() {
        var out = {};
        for (var i = 0; i < ALL_KEYS.length; i++) {
            var k = ALL_KEYS[i];
            var raw = readRaw(k);
            if (raw !== null && raw !== undefined && raw !== '') {
                out[k] = JSON.parse(raw);
            }
        }
        return out;
    }

    /* 全量导入（恢复用）：先清空再写入，结构不符的键跳过 */
    function importAll(data) {
        if (!data || typeof data !== 'object') return { ok: 0, skipped: 0 };
        var ok = 0;
        var skipped = 0;
        var i;
        for (i = 0; i < ALL_KEYS.length; i++) {
            var k = ALL_KEYS[i];
            if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
            var v = data[k];
            if (typeof v === 'string') {
                try { v = JSON.parse(v); } catch (e) { skipped++; continue; }
            }
            if (writeJSON(k, v)) ok++; else skipped++;
        }
        return { ok: ok, skipped: skipped };
    }

    /* 估算占用字节数（展示用） */
    function usedBytes() {
        var n = 0;
        for (var i = 0; i < ALL_KEYS.length; i++) {
            var raw = readRaw(ALL_KEYS[i]);
            if (raw) n += raw.length;
        }
        return n;
    }

    App.store = {
        KEYS: KEYS,
        ALL_KEYS: ALL_KEYS,
        isAvailable: isAvailable,
        readRaw: readRaw,
        writeRaw: writeRaw,
        readJSON: readJSON,
        writeJSON: writeJSON,
        remove: remove,
        clearAll: clearAll,
        exportAll: exportAll,
        importAll: importAll,
        usedBytes: usedBytes
    };
})(window.App);
