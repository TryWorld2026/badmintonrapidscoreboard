/* ================================================================
   js/api.js — 后端接口客户端

   设计要点（与后端 server/src/lib/http.ts 的响应格式一一对应）：
     - 成功：直接返回数据对象（后端不套 { data } 壳）
     - 失败：抛出 ApiError，带 status / code / detail / fields

   令牌策略：
     access token 只存在**内存**（这个闭包变量）里，不写 localStorage。
     原因：localStorage 里的 token 任何 XSS 都能读走；
     内存里的 token 页面一关就没了，攻击面小得多。
     30 天的续期靠 httpOnly cookie 里的 refresh token —— JS 读不到它。

   错误处理：
     401 时自动尝试刷新一次并重放原请求。这是必须的：
     access token 只有 15 分钟，用户不可能每 15 分钟重新登录一次。
     但要防止无限递归 —— 用 _retried 标记只重试一次。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    /* ---------- 配置 ----------
       解析顺序（越靠前优先级越高）：
         1. URL 查询参数 ?api=https://...  —— 自部署的人不必改文件，
            也给自动化测试一个注入点
         2. <meta name="api-base" content="...">  —— 正式部署用
         3. 空串 = 纯本地模式

       返回空串时整个应用退化为纯本地：计分、分组、费用全部照常，
       只是没有账号与同步。这是刻意的 —— 不联网也必须能用。 */
    var apiBaseCache = null;

    function apiBase() {
        if (apiBaseCache !== null) return apiBaseCache;

        var fromQuery = '';
        try {
            var m = /[?&]api=([^&]+)/.exec(location.search || '');
            if (m) fromQuery = decodeURIComponent(m[1]);
        } catch (e) { /* file:// 下 location.search 可能异常 */ }

        if (fromQuery) {
            apiBaseCache = fromQuery.replace(/\/+$/, '');
            return apiBaseCache;
        }

        var meta = document.querySelector('meta[name="api-base"]');
        var v = meta ? (meta.getAttribute('content') || '').trim() : '';
        /* 占位符要当作"未配置"，否则用户忘了改就会被指向一个不存在的域名 */
        if (v && v.indexOf('REPLACE') < 0 && v.indexOf('{{') < 0) {
            apiBaseCache = v.replace(/\/+$/, '');
            return apiBaseCache;
        }

        apiBaseCache = '';
        return apiBaseCache;
    }

    /* access token 只在这里，不落盘 */
    var accessToken = null;
    /* 当前用户（null = 未登录） */
    var currentUser = null;
    /* 刷新进行中的 Promise：并发 401 时只发一次刷新请求，
       否则 5 个并发请求会触发 5 次刷新，其中 4 次会因为
       refresh token 已被轮换而失败（并触发复用检测，把用户踢下线）。 */
    var refreshing = null;

    /* ---------- 错误类型 ---------- */
    function ApiError(status, body) {
        var msg = (body && (body.detail || body.title)) || ('请求失败（' + status + '）');
        var err = new Error(msg);
        err.name = 'ApiError';
        err.status = status;
        err.code = (body && body.title) || 'UNKNOWN';
        err.fields = (body && body.fields) || null;
        err.requestId = (body && body.request_id) || null;
        return err;
    }

    /* ---------- 底层请求 ---------- */
    function rawRequest(method, path, body, opts) {
        opts = opts || {};
        var base = apiBase();
        if (!base) {
            /* 没配后端：直接失败，让上层走本地逻辑 */
            var e = new Error('未配置后端地址');
            e.name = 'ApiError';
            e.status = 0;
            e.code = 'NO_BACKEND';
            return Promise.reject(e);
        }

        var headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;

        var init = {
            method: method,
            headers: headers,
            /* 刷新令牌在 httpOnly cookie 里，必须带上凭据 */
            credentials: 'include'
        };
        if (body !== undefined) init.body = JSON.stringify(body);

        return fetch(base + path, init).then(function (res) {
            if (res.status === 204) return null;
            return res.text().then(function (text) {
                var data = null;
                if (text) {
                    try { data = JSON.parse(text); } catch (e) { data = null; }
                }
                if (!res.ok) throw ApiError(res.status, data);
                return data;
            });
        });
    }

    /* ---------- 带自动刷新的请求 ---------- */
    function request(method, path, body, opts) {
        opts = opts || {};
        return rawRequest(method, path, body, opts).catch(function (err) {
            /* 只有 401 且不是刷新请求本身、且还没重试过，才尝试续期 */
            if (err.status !== 401 || opts._retried || opts.noRetry) throw err;

            return ensureRefreshed().then(function (okFlag) {
                if (!okFlag) throw err;
                return rawRequest(method, path, body, { _retried: true });
            });
        });
    }

    /* 确保拿到可用的 access token。
       并发调用共享同一个 Promise（见 refreshing 的注释）。 */
    function ensureRefreshed() {
        if (refreshing) return refreshing;

        refreshing = rawRequest('POST', '/api/auth/refresh', undefined, { noRetry: true })
            .then(function (data) {
                refreshing = null;
                if (!data || !data.accessToken) return false;
                accessToken = data.accessToken;
                currentUser = data.user || currentUser;
                notifyAuthChange();
                return true;
            })
            .catch(function () {
                refreshing = null;
                /* 刷新失败 = 会话真的结束了 */
                accessToken = null;
                currentUser = null;
                notifyAuthChange();
                return false;
            });
        return refreshing;
    }

    /* ---------- 认证状态广播 ---------- */
    function notifyAuthChange() {
        if (App.bus) App.bus.emit('auth:changed', { user: currentUser });
    }

    /* ---------- 对外 API ---------- */
    var api = {
        /* 有没有配置后端。没有就整个应用走本地模式。 */
        available: function () { return !!apiBase(); },
        base: apiBase,

        isLoggedIn: function () { return !!currentUser; },
        user: function () { return currentUser; },
        token: function () { return accessToken; },

        register: function (email, password, displayName) {
            return rawRequest('POST', '/api/auth/register', {
                email: email, password: password, displayName: displayName || ''
            }).then(function (d) {
                accessToken = d.accessToken;
                currentUser = d.user;
                notifyAuthChange();
                return d.user;
            });
        },

        login: function (email, password) {
            return rawRequest('POST', '/api/auth/login', { email: email, password: password })
                .then(function (d) {
                    accessToken = d.accessToken;
                    currentUser = d.user;
                    notifyAuthChange();
                    return d.user;
                });
        },

        logout: function () {
            return rawRequest('POST', '/api/auth/logout', {})
                .catch(function () { /* 即便服务端失败，本地也要登出 */ })
                .then(function () {
                    accessToken = null;
                    currentUser = null;
                    notifyAuthChange();
                });
        },

        /* 页面加载时尝试用 cookie 恢复会话。
           失败是正常情况（从没登录过），不要当错误抛。 */
        restore: function () {
            var base = apiBase();
            if (!base) return Promise.resolve(null);
            return rawRequest('GET', '/api/auth/me', undefined, { noRetry: true })
                .then(function (d) {
                    currentUser = d.user;
                    notifyAuthChange();
                    return currentUser;
                })
                .catch(function () {
                    /* 没有 access token，试试用 cookie 刷新一次 */
                    return ensureRefreshed().then(function (okFlag) {
                        return okFlag ? currentUser : null;
                    });
                });
        },

        /* ---------- 比赛同步 ---------- */
        pushMatches: function (items) {
            return request('POST', '/api/matches', { items: items });
        },
        pullMatches: function (since, limit) {
            var q = '/api/matches?since=' + (since || 0);
            if (limit) q += '&limit=' + limit;
            return request('GET', q);
        },
        deleteMatch: function (clientId) {
            return request('DELETE', '/api/matches/' + encodeURIComponent(clientId));
        },

        /* ---------- 俱乐部 ---------- */
        listClubs: function () { return request('GET', '/api/clubs'); },
        createClub: function (name) { return request('POST', '/api/clubs', { name: name }); },
        joinClub: function (inviteCode) { return request('POST', '/api/clubs/join', { inviteCode: inviteCode }); },
        clubMembers: function (id) { return request('GET', '/api/clubs/' + encodeURIComponent(id) + '/members'); },
        renameClub: function (id, name) { return request('PATCH', '/api/clubs/' + encodeURIComponent(id), { name: name }); },

        /* ---------- 球局 ---------- */
        listSessions: function (clubId) {
            return request('GET', '/api/sessions' + (clubId ? '?clubId=' + encodeURIComponent(clubId) : ''));
        },
        createSession: function (payload) { return request('POST', '/api/sessions', payload); },
        getSession: function (id) { return request('GET', '/api/sessions/' + encodeURIComponent(id)); },
        joinSession: function (id) { return request('POST', '/api/sessions/' + encodeURIComponent(id) + '/join', {}); },
        leaveSession: function (id) { return request('POST', '/api/sessions/' + encodeURIComponent(id) + '/leave', {}); },
        addGuest: function (id, guestName) {
            return request('POST', '/api/sessions/' + encodeURIComponent(id) + '/guests', { guestName: guestName });
        },
        rotation: function (id) { return request('GET', '/api/sessions/' + encodeURIComponent(id) + '/rotation'); },

        /* 供同步层复用底层请求（带刷新与鉴权） */
        _request: request,

        /* 仅供测试：把内存里的 access token 置空，用于模拟
           "15 分钟过期"而不必真的等 15 分钟。
           生产代码不要调用它 —— 它绕过了正常的令牌管理。 */
        _setTokenForTest: function (t) { accessToken = t; }
    };

    App.api = api;
})(window.App);
