/* ================================================================
   settings.js — 设置 / 数据备份 / 关于 / 我的 / 快捷操作
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var ui = App.ui;
    var store = App.store;

    var VERSION = '2.0.0';

    function $(id) { return document.getElementById(id); }

    /* 安全写文本：元素不存在时静默跳过 */
    function set(id, v) {
        var el = $(id);
        if (el) el.textContent = v;
    }

    /* ================================================================
       设置
       ================================================================ */
    function applySettingsToUI() {
        var s = App.state.settings;

        document.querySelectorAll('[data-act="settings:mode"]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-value') === String(s.gameMode));
        });

        var custom = $('custom-score');
        if (custom) {
            custom.value = s.targetScore;
            var wrap = $('custom-score-wrap');
            if (wrap) wrap.classList.toggle('hidden', s.gameMode !== 'custom');
        }

        setChecked('set-best-of-three', s.bestOfThree);
        setChecked('set-deuce-mode', s.deuceMode);
        setChecked('set-sound', s.soundEnabled);
        setChecked('set-vibration', s.vibrationEnabled);
        setChecked('set-side-change', s.sideChangeAlert);
    }

    function setChecked(id, v) {
        var el = $(id);
        if (el) el.checked = !!v;
    }

    function readChecked(id, fallback) {
        var el = $(id);
        return el ? !!el.checked : fallback;
    }

    function saveFromUI() {
        var s = App.state.settings;
        s.bestOfThree = readChecked('set-best-of-three', s.bestOfThree);
        s.deuceMode = readChecked('set-deuce-mode', s.deuceMode);
        s.soundEnabled = readChecked('set-sound', s.soundEnabled);
        s.vibrationEnabled = readChecked('set-vibration', s.vibrationEnabled);
        s.sideChangeAlert = readChecked('set-side-change', s.sideChangeAlert);
        var custom = $('custom-score');
        if (custom) s.targetScore = parseInt(custom.value, 10) || s.targetScore;
        App.state.saveSettings();
        if (App.match) App.match.render();
    }

    function setMode(el) {
        var mode = el.getAttribute('data-value') || '21';
        if (App.match) App.match.setGameMode(mode);
        applySettingsToUI();
        ui.notify('比赛模式已切换', '设置已保存');
    }

    /* ================================================================
       数据备份
       ================================================================ */
    function renderBackupStats() {
        /* 「我的」主页与「数据备份」子页各有一份统计容器，都要填 */
        var boxes = [$('backup-stats'), $('backup-stats-sub')].filter(Boolean);
        if (!boxes.length) return;
        var history = App.state.getMatchHistory();
        var grouping = App.state.getGroupingHistory().length;
        var expense = App.state.getExpenseHistory().length;
        var bytes = store.usedBytes();
        var kb = (bytes / 1024).toFixed(1);

        var items = [
            [history.length, '比赛记录'],
            [grouping, '分组记录'],
            [expense, '费用记录'],
            [kb + ' KB', '占用空间']
        ];
        var html = items.map(function (it) {
            return '<div class="bs"><div class="v num">' + it[0] + '</div><div class="k">' + it[1] + '</div></div>';
        }).join('');
        boxes.forEach(function (box) { box.innerHTML = html; });
    }

    function exportBackup() {
        var payload = {
            __app: 'badminton-scoreboard',
            __version: VERSION,
            __exportedAt: new Date().toISOString(),
            data: store.exportAll()
        };
        ui.downloadText(
            '羽毛球计分板备份_' + new Date().toISOString().slice(0, 10) + '.json',
            JSON.stringify(payload, null, 2)
        );
        ui.notify('备份文件已导出', '导出成功');
    }

    function importBackup() {
        var input = $('backup-file');
        if (!input) return;
        input.value = '';
        input.click();
    }

    function handleBackupFile(ev) {
        var file = ev.target && ev.target.files && ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            var parsed = null;
            try {
                parsed = JSON.parse(String(reader.result));
            } catch (e) {
                ui.notify('备份文件不是合法的 JSON', '恢复失败');
                return;
            }
            var payload = (parsed && parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
            ui.showConfirm({
                title: '恢复备份？',
                message: '将用备份文件覆盖当前所有本地数据，此操作不可撤销。建议先导出一次当前数据。',
                okText: '覆盖恢复',
                danger: true,
                onConfirm: function () {
                    var r = store.importAll(payload);
                    reloadState();
                    renderBackupStats();
                    ui.notify('已恢复 ' + r.ok + ' 项数据' + (r.skipped ? ('，跳过 ' + r.skipped + ' 项') : ''), '恢复完成');
                }
            });
        };
        reader.onerror = function () { ui.notify('读取文件失败', '恢复失败'); };
        reader.readAsText(file);
    }

    function clearAllData() {
        ui.showConfirm({
            title: '清空所有本地数据？',
            message: '比赛记录、分组、费用、成就、头像绑定将全部删除，且不可恢复。',
            okText: '全部清空',
            danger: true,
            onConfirm: function () {
                store.clearAll();
                reloadState();
                renderBackupStats();
                ui.notify('所有本地数据已清空', '已清空');
            }
        });
    }

    /* 恢复/清空后把内存态重新对齐 localStorage */
    function reloadState() {
        App.state.match = App.state.normalizeMatch(store.readJSON(store.KEYS.MATCH_STATE, null));
        App.state.settings = App.state.normalizeSettings(store.readJSON(store.KEYS.SETTINGS, null));
        App.state.stats = App.state.normalizeStats(store.readJSON(store.KEYS.ACHIEVEMENT_STATS, null));
        var un = store.readJSON(store.KEYS.UNLOCKED, []);
        App.state.unlocked = Array.isArray(un) ? un : [];
        var av = store.readJSON(store.KEYS.AVATARS, {});
        App.state.avatars = (av && typeof av === 'object' && !Array.isArray(av)) ? av : {};
        App.state.hasSeenOnboarding = store.readJSON(store.KEYS.ONBOARDING, false) === true;
        App.state.lastGroups = store.readJSON(store.KEYS.LAST_GROUPS, null);

        /* 高光时刻是内存态，不随存档走。恢复备份 / 清空数据时
           如果不显式清掉，上一场的「加分赛 / 大逆转」会被当成
           这一场的成绩写进下一次保存的比赛记录。 */
        if (App.match && App.match.resetHighlights) App.match.resetHighlights();

        if (App.match) App.match.render();
        if (App.stats) App.stats.refreshAll();
        if (App.grouping) App.grouping.onEnter();
        if (App.expense) App.expense.onEnter();
        if (App.avatars) App.avatars.onEnter();
        applySettingsToUI();
    }

    /* ================================================================
       关于
       ================================================================ */
    function renderAbout() {
        set('about-version', 'v' + VERSION);
        var storage = store.isAvailable() ? 'localStorage（本机）' : '内存（不可持久化）';
        set('about-storage', storage);
        set('about-storage-2', storage);
        set('about-matches', App.state.getMatchHistory().length + ' 场');
        set('about-achievements', App.state.unlocked.length + ' / ' + App.achievements.LIST.length);
    }

    /* ================================================================
       我的
       ================================================================ */
    function onEnter(sub) {
        if (sub === 'settings') applySettingsToUI();
        else if (sub === 'backup') renderBackupStats();
        else if (sub === 'about') renderAbout();
        else if (sub === 'avatars') { if (App.avatars) App.avatars.onEnter(); }
        else {
            /* 主页：展示概览 */
            renderAbout();
            renderBackupStats();
            var w = $('weather-box');
            if (w) w.classList.add('hidden');
            ui.initWeather();
        }
    }

    /* ================================================================
       快捷操作（双击顶栏唤出；旧版 quickAction → switchScreen 未定义）
       ================================================================ */
    function armAutoDismiss(panel) {
        if (panel._timer) window.clearTimeout(panel._timer);
        panel._timer = window.setTimeout(function () {
            panel._timer = null;
            hideQuickActions();
        }, 3000);
    }

    /* 打开：必须真的摘掉 hidden 属性。base.css 里 [hidden] { display:none !important }
       压过一切 class，只加 .show 是显示不出来的（旧代码就是这样，面板全程不可见）。 */
    function showQuickActions() {
        var panel = $('quick-actions');
        if (!panel) return;
        if (panel._timer) { window.clearTimeout(panel._timer); panel._timer = null; }
        /* 已经开着就只续期：重复压栈会让 Esc 要按两次才关掉 */
        if (panel.classList.contains('show') && !panel.hasAttribute('hidden')) {
            armAutoDismiss(panel);
            return;
        }
        nav.openDialog('quick-actions');
        /* 键盘用户一进来焦点就落在面板里，而不是留在顶栏标题上 */
        var first = panel.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
        if (first) first.focus();
        armAutoDismiss(panel);
    }

    function hideQuickActions() {
        var panel = $('quick-actions');
        if (!panel) return;
        if (panel._timer) { window.clearTimeout(panel._timer); panel._timer = null; }
        /* closeDialog 会摘 .show、出栈、并把 hidden 补回去（延迟到动画结束） */
        nav.closeDialog('quick-actions');
    }

    function bindQuickTrigger() {
        var title = $('appbar-title');
        if (!title) return;
        var last = 0;
        title.addEventListener('click', function () {
            var now = Date.now();
            if (now - last < 300) {
                showQuickActions();
                last = 0;
            } else {
                last = now;
            }
        });
        /* 键盘可达：Enter / 空格直接唤出 */
        title.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            ev.preventDefault();
            showQuickActions();
        });
    }

    /* ================================================================
       注册
       ================================================================ */
    function init() {
        nav.on('settings:mode', setMode);
        nav.on('settings:save', saveFromUI);
        nav.on('settings:custom', function () { saveFromUI(); });
        nav.on('backup:export', exportBackup);
        nav.on('backup:import', importBackup);
        nav.on('backup:file', handleBackupFile);
        nav.on('backup:clear', clearAllData);
        nav.on('quick:action', function (el) {
            hideQuickActions();
            if (App.match) App.match.quickAction(el.getAttribute('data-action'));
        });
        nav.on('me:back', function () { nav.go('me'); });

        /* 顶栏标题只绑一次。这里原来调了两次 bindQuickTrigger()，
           标题上会挂两份 click / keydown 监听：双击时 showQuickActions()
           被调用两次、Enter 也是。目前有「已开着就只续期」的兜底所以看不出
           问题，但这是白挂一倍的监听，以后往 handler 里加非幂等动作就会翻车。 */
        bindQuickTrigger();

        var file = $('backup-file');
        if (file) file.addEventListener('change', handleBackupFile);

        /* 开关即时生效 */
        ['set-best-of-three', 'set-deuce-mode', 'set-sound', 'set-vibration', 'set-side-change']
            .forEach(function (id) {
                var el = $(id);
                if (el) el.addEventListener('change', saveFromUI);
            });

        applySettingsToUI();
    }

    App.settings = {
        VERSION: VERSION,
        init: init,
        onEnter: onEnter,
        applySettingsToUI: applySettingsToUI,
        saveFromUI: saveFromUI,
        exportBackup: exportBackup,
        renderBackupStats: renderBackupStats,
        showQuickActions: showQuickActions,
        hideQuickActions: hideQuickActions
    };
})(window.App);
