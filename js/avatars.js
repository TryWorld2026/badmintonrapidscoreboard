/* ================================================================
   avatars.js — 球员头像（emoji 绑定）
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var ui = App.ui;

    /* 与旧版完全一致的 32 个头像 */
    var EMOJIS = ['😀', '😎', '🤩', '🥳', '😴', '🤔', '😤', '😱', '🤗', '😇',
        '🤠', '🥸', '🦸', '🧙', '🧑‍🎤', '👨‍🎨', '👩‍🎓', '🧑‍🍳', '🦊', '🐱',
        '🐶', '🐼', '🦄', '🐲', '🐯', '🦁', '🐻', '🐨', '🦝', '🦊', '🐰', '🐸'];

    var selected = EMOJIS[0];

    function get(name) {
        var v = App.state.avatars[name];
        return v || '🏸';
    }

    function save() { App.state.saveAvatars(); }

    function set(name, emoji) {
        if (!name) return false;
        App.state.avatars[name] = emoji;
        save();
        return true;
    }

    function remove(name) {
        if (!name) return false;
        if (!Object.prototype.hasOwnProperty.call(App.state.avatars, name)) return false;
        delete App.state.avatars[name];
        save();
        return true;
    }

    /* ---------- 管理页 ---------- */
    function renderLibrary() {
        var grid = nav.byId('avatar-emoji-grid');
        if (!grid) return;
        grid.innerHTML = '';
        EMOJIS.forEach(function (e) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'avatar-opt' + (e === selected ? ' active' : '');
            b.setAttribute('data-act', 'avatars:pick');
            b.setAttribute('data-value', e);
            b.setAttribute('aria-label', '选择头像 ' + e);
            b.textContent = e;
            grid.appendChild(b);
        });
    }

    function renderBound() {
        var box = nav.byId('avatar-bound-list');
        if (!box) return;
        var entries = Object.keys(App.state.avatars);
        if (!entries.length) {
            /* 和其他空态一致用 ic-box + data-icon，由 MutationObserver 水合成 SVG。
               旧代码这里放了个 🙂 emoji，与「0 UI emoji」的约定冲突。 */
            box.innerHTML = '<div class="empty"><div class="empty-icon ic-box" data-icon="users"></div>' +
                '<div class="empty-title">还没有绑定头像</div>' +
                '<div class="empty-hint">输入球员名字，选一个 emoji 后保存</div></div>';
            return;
        }
        entries.sort();
        box.innerHTML = entries.map(function (name) {
            return '<div class="avatar-bound-row">' +
                '<span class="ab-avatar">' + App.state.avatars[name] + '</span>' +
                '<span class="ab-name">' + ui.escapeHtml(name) + '</span>' +
                '<button type="button" class="btn btn-small btn-ghost" data-act="avatars:unbind" data-key="' +
                (ui.escapeHtml(name)) + '">解绑</button>' +
                '</div>';
        }).join('');
    }

    function pick(el) {
        selected = el.getAttribute('data-value') || EMOJIS[0];
        renderLibrary();
        ui.notify('已选择 ' + selected, '头像');
    }

    function bindCurrent() {
        var input = nav.byId('avatar-name-input');
        var name = input ? input.value.trim() : '';
        if (!name) {
            ui.notify('请输入球员名字', '提示');
            if (input) input.focus();
            return;
        }
        set(name, selected);
        renderBound();
        if (input) input.value = '';
        ui.notify(name + ' 的头像已设为 ' + selected, '已保存');
        if (App.match) App.match.render();
    }

    function unbind(el) {
        var name = el.getAttribute('data-key');
        if (!name) return;
        ui.showConfirm({
            title: '解绑头像？',
            message: '将删除「' + name + '」的头像绑定。',
            okText: '解绑',
            danger: true,
            onConfirm: function () {
                remove(name);
                renderBound();
                if (App.match) App.match.render();
                ui.notify('已解绑', '完成');
            }
        });
    }

    function onEnter() {
        renderLibrary();
        renderBound();
    }

    function init() {
        nav.on('avatars:pick', pick);
        nav.on('avatars:bind', bindCurrent);
        nav.on('avatars:unbind', unbind);
    }

    App.avatars = {
        EMOJIS: EMOJIS,
        init: init,
        get: get,
        set: set,
        remove: remove,
        onEnter: onEnter
    };
})(window.App);
