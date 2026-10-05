/* ================================================================
   js/account.js — 账号界面与同步状态展示

   职责边界：
     - 只负责「展示与收集输入」，所有网络调用交给 App.api
     - 不自己缓存用户信息，一律读 App.api.user()
     - 不直接写比赛历史，同步交给 App.sync

   一个刻意的产品决策：
     未登录时**不显示任何催促**。计分板的核心场景是打球，
     不是注册账号。账号入口只在「我的」页里安静地待着，
     用户想同步了自然会点。用弹窗逼登录是这类工具最令人反感的行为。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    function $(id) { return document.getElementById(id); }
    function setText(id, v) {
        var el = $(id);
        if (el && el.textContent !== String(v)) el.textContent = String(v);
    }

    /* ---------- 同步状态文案 ----------
       一个原则：成功时不打扰。
       只有「有待同步 / 出错了」才需要让用户看见。 */
    function syncLabel() {
        var s = App.sync ? App.sync.status() : null;
        if (!s) return { title: '未启用', sub: '', tone: 'off' };

        if (s.lastError) {
            return { title: '同步失败', sub: s.lastError, tone: 'error' };
        }
        if (s.syncing) return { title: '同步中…', sub: '', tone: 'busy' };
        if (s.pending > 0) {
            return {
                title: '待同步 ' + s.pending + ' 场',
                sub: s.online ? '正在等待网络' : '离线中，联网后自动上传',
                tone: 'pending'
            };
        }
        if (s.lastSyncAt) {
            return { title: '已同步', sub: '上次 ' + fmtTime(s.lastSyncAt), tone: 'ok' };
        }
        return { title: '已同步', sub: '', tone: 'ok' };
    }

    function fmtTime(ts) {
        var d = new Date(ts);
        var now = new Date();
        var sameDay = d.toDateString() === now.toDateString();
        var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
        if (sameDay) return '今天 ' + hm;
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    /* ---------- 渲染 ---------- */
    function render() {
        var card = $('account-card');
        if (!card) return;

        /* 后端没配置（纯本地部署）→ 整块隐藏。
           不留一个点了没反应的按钮。 */
        if (!App.api || !App.api.available()) {
            card.classList.add('hidden');
            return;
        }
        card.classList.remove('hidden');

        var user = App.api.user();
        var dot = $('acc-dot');
        var actions = $('acc-actions');

        if (user) {
            /* 已登录 */
            var st = syncLabel();
            setText('acc-title', user.displayName || user.email);
            setText('acc-sub', st.sub ? (st.title + ' · ' + st.sub) : st.title);
            setText('me-name', user.displayName || '已登录');
            setText('about-storage', '云端已连接');
            var note = $('me-storage-note');
            if (note) note.textContent = '数据同时保存在本机与云端，换设备登录即可拉回。';

            if (dot) dot.className = 'acc-dot tone-' + st.tone;

            actions.innerHTML =
                '<button type="button" class="btn btn-outline btn-small" data-act="account:sync">立即同步</button>' +
                '<button type="button" class="btn btn-ghost btn-small" data-act="account:logout">退出登录</button>';
        } else {
            /* 未登录 */
            setText('acc-title', '未登录');
            setText('acc-sub', '登录后可在多设备同步战绩，不影响本地使用');
            setText('me-name', '本机球员');
            setText('about-storage', App.store.isAvailable() ? 'localStorage（本机）' : '内存（不可持久化）');
            var note2 = $('me-storage-note');
            if (note2) note2.textContent = '所有数据仅保存在本机浏览器，不会上传服务器。';

            if (dot) dot.className = 'acc-dot tone-off';

            actions.innerHTML =
                '<button type="button" class="btn btn-primary btn-small" data-act="account:login">登录 / 注册</button>';
        }
    }

    /* ---------- 登录 / 注册对话框 ----------
       用一个表单同时承担两件事：填了邮箱密码，若账号不存在
       就自动注册。让用户在"登录"和"注册"之间做选择是多余的负担 ——
       他只想同步数据，不关心这两个词的区别。

       走 nav.openDialog 而不是自己操作 DOM：它已经处理了
       aria-hidden、焦点陷阱、弹层栈与焦点还原。
       自己写一份必然漏掉其中一两项（本项目历史上出过这个 bug）。 */
    function openAuthDialog() {
        var wrap = $('auth-dialog');
        if (!wrap) return;

        var msg = $('auth-msg');
        if (msg) { msg.textContent = ''; msg.className = 'auth-msg'; }
        var emailEl = $('auth-email');
        var passEl = $('auth-password');
        if (emailEl) emailEl.value = '';
        if (passEl) passEl.value = '';

        App.nav.openDialog('auth-dialog');
    }

    function closeAuthDialog() {
        App.nav.closeDialog('auth-dialog');
    }

    function authMsg(text, isError) {
        var msg = $('auth-msg');
        if (!msg) return;
        msg.textContent = text;
        msg.className = 'auth-msg' + (isError ? ' is-error' : ' is-ok');
    }

    /* 提交：先尝试登录，账号不存在则自动注册。
       顺序很重要 —— 反过来（先注册）会让老用户每次都撞 409。 */
    function submitAuth() {
        var email = ($('auth-email') || {}).value || '';
        var password = ($('auth-password') || {}).value || '';
        email = email.trim();

        if (!email || email.indexOf('@') < 0) {
            authMsg('请输入有效的邮箱', true);
            return;
        }
        if (password.length < 8) {
            authMsg('密码至少 8 位', true);
            return;
        }

        var btn = $('auth-submit');
        if (btn) { btn.disabled = true; btn.textContent = '处理中…'; }
        authMsg('正在连接…', false);

        function done() {
            if (btn) { btn.disabled = false; btn.textContent = '登录 / 注册'; }
        }

        App.api.login(email, password).then(function () {
            done();
            closeAuthDialog();
            App.ui.notify('登录成功，正在同步…', '已登录');
            render();
            return App.sync.syncNow();
        }).catch(function (err) {
            /* 401 = 账号不存在或密码错。
               这种情况尝试注册；如果邮箱已占用，注册会返回 409，
               说明密码确实错了，如实告诉用户。 */
            if (err && err.status === 401) {
                return App.api.register(email, password).then(function () {
                    done();
                    closeAuthDialog();
                    App.ui.notify('账号已创建，正在同步…', '注册成功');
                    render();
                    /* 首次注册：把本地已有的比赛全部推上去。
                       这是「本地优先」的关键一步 ——
                       用户此前离线打的所有球不该白打。 */
                    return App.sync.syncNow();
                }).catch(function (e2) {
                    done();
                    authMsg(describeError(e2, '邮箱或密码不正确'), true);
                });
            }
            done();
            authMsg(describeError(err), true);
        });
    }

    function describeError(err, fallback) {
        if (!err) return fallback || '操作失败，请重试';
        if (err.status === 422 && err.fields && err.fields.length) {
            return err.fields.map(function (f) { return f.message; }).join('；');
        }
        if (err.status === 409) return '该邮箱已注册，请检查密码';
        if (err.status === 429) return '操作太频繁，请稍后再试';
        if (err.status === 0 || err.code === 'NO_BACKEND') return '未配置后端服务';
        if (err.message === 'Failed to fetch') return '连不上服务器，请检查网络';
        return err.message || fallback || '操作失败，请重试';
    }

    /* ---------- 退出 ---------- */
    function doLogout() {
        App.ui.showConfirm({
            title: '退出登录？',
            message: '本机数据会保留，只是不再与云端同步。',
            okText: '退出',
            danger: false,
            onConfirm: function () {
                App.api.logout().then(function () {
                    App.ui.notify('已退出登录', '已退出');
                    render();
                });
            }
        });
    }

    /* ---------- 手动同步 ---------- */
    function doSync() {
        if (!App.api.isLoggedIn()) { openAuthDialog(); return; }
        App.ui.notify('正在同步…', '同步中');
        App.sync.syncNow().then(function (okFlag) {
            var s = App.sync.status();
            if (okFlag && !s.lastError) {
                App.ui.notify('同步完成', '完成');
                /* 历史列表要刷新才能看到拉下来的记录 */
                if (App.stats && App.stats.refreshAll) App.stats.refreshAll();
            } else {
                App.ui.notify(s.lastError || '同步失败，请稍后重试', '同步失败');
            }
            render();
        });
    }

    /* ---------- 初始化 ---------- */
    function init() {
        App.nav.on('account:login', openAuthDialog);
        App.nav.on('account:logout', doLogout);
        App.nav.on('account:sync', doSync);
        App.nav.on('account:submit', submitAuth);
        App.nav.on('account:close', closeAuthDialog);
        App.nav.on('account:toggle-mode', function () {
            /* 表单兼作注册，这里只切换按钮文案与提示，不改逻辑 */
            var mode = ($('auth-dialog') || {}).dataset;
            var el = $('auth-dialog');
            if (!el) return;
            var next = el.getAttribute('data-mode') === 'register' ? 'login' : 'register';
            el.setAttribute('data-mode', next);
            var btn = $('auth-submit');
            if (btn) btn.textContent = next === 'register' ? '创建账号' : '登录 / 注册';
        });

        /* 认证状态或同步状态变化时重绘 */
        if (App.bus) {
            App.bus.on('auth:changed', render);
            App.bus.on('sync:changed', function () {
                /* 只在「我的」页可见时才重绘，避免无谓的 DOM 操作 */
                if (App.state.route && App.state.route.tab === 'me') render();
            });
        }

        render();
    }

    App.account = {
        init: init,
        render: render,
        openAuthDialog: openAuthDialog,
        closeAuthDialog: closeAuthDialog,
        submit: submitAuth,
        doSync: doSync,
        doLogout: doLogout,
        _syncLabel: syncLabel,
        _describeError: describeError
    };
})(window.App);
