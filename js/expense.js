/* ================================================================
   expense.js — 费用分摊（均摊 / 自定义比例 / 按时长）
   计算方式与旧版逐行一致。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    var nav = App.nav;
    var ui = App.ui;

    var MODE_NAMES = { equal: '平均分摊', custom: '自定义比例', time: '按时长' };

    function $(id) { return document.getElementById(id); }

    /* 非法日期统一降级，避免把 "Invalid Date" 摆到用户脸上 */
    function fmtDate(v, mode) {
        var d = new Date(v);
        if (!d || isNaN(d.getTime())) return '—';
        return mode === 'date' ? d.toLocaleDateString() : d.toLocaleString();
    }


    function readParticipants() {
        var ta = $('expense-players');
        if (!ta) return [];
        return ta.value.split('\n')
            .map(function (p) { return p.trim(); })
            .filter(function (p) { return p !== ''; });
    }

    function updateParticipantCount() {
        var el = $('participant-count');
        if (el) el.textContent = readParticipants().length;
        updateRatioInputs();
    }

    function updateRatioInputs() {
        var box = $('ratio-inputs');
        if (!box) return;
        var players = readParticipants();
        box.innerHTML = players.map(function (p, i) {
            return '<div class="skill-row">' +
                '<span class="idx">' + (i + 1) + '</span>' +
                '<input type="text" class="input name-input" value="' + ui.escapeHtml(p) + '" readonly>' +
                '<input type="number" class="input skill-select" min="1" max="10" value="1" data-index="' + i +
                '" aria-label="' + ui.escapeHtml(p) + ' 的分摊份数">' +
                '</div>';
        }).join('');
    }

    function quickAmount(el) {
        var input = $('total-amount');
        if (input) input.value = el.getAttribute('data-value') || '';
    }

    function setSplitMode(el) {
        var m = el.getAttribute('data-mode') || 'equal';
        var hidden = $('split-mode');
        if (hidden) hidden.value = m;
        document.querySelectorAll('[data-act="expense:mode"]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-mode') === m);
        });
        var ratio = $('ratio-container');
        if (ratio) ratio.classList.toggle('hidden', m !== 'custom');
        var time = $('time-container');
        if (time) time.classList.toggle('hidden', m !== 'time');
        if (m === 'custom') updateRatioInputs();
    }

    /* ---------- 计算 ---------- */
    function calculate() {
        var typeEl = $('expense-type');
        var totalEl = $('total-amount');
        var modeEl = $('split-mode');

        var expenseType = typeEl ? typeEl.value : '场地费';
        var totalAmount = totalEl ? parseFloat(totalEl.value) : NaN;
        var splitMode = modeEl ? modeEl.value : 'equal';

        if (isNaN(totalAmount) || totalAmount <= 0) {
            ui.notify('请输入有效的总金额', '提示');
            if (totalEl) totalEl.focus();
            return;
        }

        var participants = readParticipants();
        if (participants.length === 0) {
            ui.notify('请填写参与人员', '提示');
            return;
        }

        var ratios = [];
        var durations = [];
        var perPerson = totalAmount / participants.length;
        var amounts = [];
        var hourlyRate = 0;
        var matchDuration = 0;

        if (splitMode === 'custom') {
            var inputs = Array.prototype.slice.call(document.querySelectorAll('#ratio-inputs input[type="number"]'));
            /* 份数必须是正数：旧代码用 parseFloat(v) || 1，负数原样保留，
               -5 + 5 会让 totalRatio 变成 0，界面上直接渲染出 ±Infinity。
               非正数一律按 1 份处理，totalRatio 因此恒 > 0。 */
            ratios = inputs.map(function (i) {
                var v = parseFloat(i.value);
                return (isFinite(v) && v > 0) ? v : 1;
            });
            if (ratios.length !== participants.length) {
                ratios = participants.map(function () { return 1; });
            }
            var totalRatio = ratios.reduce(function (s, r) { return s + r; }, 0);
            if (!isFinite(totalRatio) || totalRatio <= 0) {
                ui.notify('分摊份数无效，请检查每人的份数', '提示');
                return;
            }
            amounts = ratios.map(function (r) { return (totalAmount * r / totalRatio); });
        } else if (splitMode === 'time') {
            var dInputs = Array.prototype.slice.call(document.querySelectorAll('#time-inputs input'))
                .map(function (i) {
                    var v = parseFloat(i.value);
                    return (isFinite(v) && v > 0) ? v : 0;
                });
            if (dInputs.length !== participants.length) {
                dInputs = participants.map(function () { return 60; });
            }
            durations = dInputs;
            var totalTime = durations.reduce(function (s, d) { return s + d; }, 0);
            if (!isFinite(totalTime) || totalTime <= 0) {
                ui.notify('请至少为一位参与者填写有效的运动时长', '提示');
                return;
            }
            matchDuration = totalTime;
            hourlyRate = totalAmount / (totalTime / 60);
            amounts = durations.map(function (d) { return (totalAmount * d / totalTime); });
            ratios = durations;
        } else {
            amounts = participants.map(function () { return perPerson; });
        }

        /* hero 大数字 */
        var hero = $('expense-hero-total');
        if (hero) hero.textContent = '¥' + totalAmount.toFixed(2);
        var hp = $('expense-hero-per');
        if (hp) hp.textContent = participants.length + ' 人参与 · ' + MODE_NAMES[splitMode];

        var meta = $('expense-meta');
        if (meta) {
            var bits = ['<span class="tag tag-brand">' + ui.escapeHtml(expenseType) + '</span>'];
            if (splitMode === 'time') {
                bits.push('<span class="tag">时长 ' + matchDuration + ' 分钟</span>');
                bits.push('<span class="tag">时均 ¥' + hourlyRate.toFixed(2) + '/小时</span>');
            }
            bits.push('<span class="tag">人均 ¥' + perPerson.toFixed(2) + '</span>');
            meta.innerHTML = bits.join('');
        }

        var maxAmt = Math.max.apply(null, amounts.concat([0.0001]));
        var list = $('expense-split-list');
        if (list) {
            list.innerHTML = participants.map(function (p, i) {
                var pct = totalAmount > 0 ? Math.round((amounts[i] / totalAmount) * 100) : 0;
                return '<div class="split-row">' +
                    '<span class="who">' + ui.escapeHtml(p) + '</span>' +
                    '<span class="share-bar"><i style="width:' +
                    Math.round((amounts[i] / maxAmt) * 100) + '%"></i></span>' +
                    '<span class="amt">¥' + amounts[i].toFixed(2) + '</span>' +
                    '<span class="pct">' + pct + '%</span>' +
                    '</div>';
            }).join('');
        }

        var section = $('expense-result-section');
        if (section) section.classList.remove('hidden');

        /* 保存历史。原有字段（date/type/total/participants/splitMode/ratios）
           一个没动，只新增 durations：
           旧代码把时长塞进 ratios，详情页只能按「自定义比例」或「平均」
           两种口径重算，按时长的记录点开永远是错的金额，
           还把分钟误标成「份」。 */
        var record = {
            date: new Date().toISOString(),
            type: expenseType,
            total: totalAmount,
            participants: participants,
            splitMode: splitMode,
            ratios: ratios,
            durations: durations
        };
        /* 同一组参数重复点「计算」不再重复入账，只和最近一条比对。
           确实要记两笔相同费用时，中间改任意一项即可。 */
        if (!sameAsLastRecord(record)) App.state.pushExpenseHistory(record);
        renderHistory();
        ui.notify('已按' + MODE_NAMES[splitMode] + '完成分摊', '计算完成');
    }

    function sameAsLastRecord(rec) {
        var list = App.state.getExpenseHistory();
        if (!list.length) return false;
        var last = list[0];
        function key(r) {
            return [r.type, r.total, r.splitMode,
                (r.participants || []).join('\u0001'),
                (r.ratios || []).join('\u0001'),
                (r.durations || []).join('\u0001')].join('\u0002');
        }
        return key(last) === key(rec);
    }

    function clearForm() {
        ['expense-type', 'total-amount', 'expense-players'].forEach(function (id) {
            var el = $(id);
            if (el) el.value = '';
        });
        var section = $('expense-result-section');
        if (section) section.classList.add('hidden');
        updateParticipantCount();
    }

    /* ---------- 历史 ---------- */
    function renderHistory() {
        var box = $('expense-history-list');
        if (!box) return;
        var list = App.state.getExpenseHistory();
        if (!list.length) {
            box.innerHTML = '<div class="empty"><div class="empty-icon ic-box" data-icon="yuan"></div>' +
                '<div class="empty-title">暂无分摊历史</div>' +
                '<div class="empty-hint">计算一次后会自动保存最近 20 条</div></div>';
            return;
        }
        box.innerHTML = list.map(function (item, i) {
            return '<div class="history-row">' +
                '<div class="h-main">' +
                '<div class="h-teams">' + ui.escapeHtml(item.type) + ' · ¥' +
                Number(item.total || 0).toFixed(2) + '</div>' +
                '<div class="h-meta"><span>' + fmtDate(item.date) + '</span>' +
                '<span class="tag">' + ui.escapeHtml(MODE_NAMES[item.splitMode] || item.splitMode) + '</span>' +
                '<span class="tag">' + (item.participants ? item.participants.length : 0) + ' 人</span></div>' +
                '</div>' +
                '<button type="button" class="btn btn-small btn-ghost" data-act="expense:detail" data-index="' + i +
                '" aria-label="查看第 ' + (i + 1) + ' 条详情">详情</button>' +
                '</div>';
        }).join('');
    }

    function showDetail(el) {
        var idx = parseInt(el.getAttribute('data-index'), 10);
        var item = App.state.getExpenseHistory()[idx];
        if (!item) {
            ui.notify('未找到该记录', '错误');
            return;
        }
        var participants = item.participants || [];
        var amounts = [];
        var perPerson = 0;
        /* 每条记录按它自己的模式重算：time 模式必须用 durations 按比例分，
           旧代码只有 custom 分支，time 记录全部掉进 else 走平均分摊，
           详情页金额和计算页对不上。 */
        var unitSuffix = '';

        if (item.splitMode === 'custom' && item.ratios && item.ratios.length > 0) {
            var totalRatio = item.ratios.reduce(function (s, r) { return s + r; }, 0) || 1;
            amounts = item.ratios.map(function (r) { return (item.total * r / totalRatio); });
            unitSuffix = '份';
        } else if (item.splitMode === 'time' && item.durations && item.durations.length > 0) {
            var totalDur = item.durations.reduce(function (s, d) { return s + d; }, 0) || 1;
            amounts = item.durations.map(function (d) { return (item.total * d / totalDur); });
            unitSuffix = '分钟';
        } else {
            perPerson = item.total / (participants.length || 1);
            amounts = participants.map(function () { return perPerson; });
        }

        var sum = $('expense-detail-summary');
        if (sum) {
            sum.innerHTML =
                '<div class="split-row"><span class="who">费用类型</span><span class="amt">' +
                ui.escapeHtml(item.type) + '</span></div>' +
                '<div class="split-row"><span class="who">总金额</span><span class="amt">¥' +
                Number(item.total).toFixed(2) + '</span></div>' +
                '<div class="split-row"><span class="who">分摊模式</span><span class="amt">' +
                ui.escapeHtml(MODE_NAMES[item.splitMode] || item.splitMode) + '</span></div>' +
                '<div class="split-row"><span class="who">参与人数</span><span class="amt">' +
                participants.length + ' 人</span></div>' +
                '<div class="split-row"><span class="who">时间</span><span class="amt">' +
                fmtDate(item.date) + '</span></div>';
        }
        var dl = $('expense-detail-list');
        if (dl) {
            dl.innerHTML = participants.map(function (p, i) {
                /* 单位跟随模式：份 / 分钟，不再把时长显示成「120份」 */
                var raw = (item.ratios && item.ratios[i]);
                var extra = (unitSuffix && raw) ? (' (' + raw + unitSuffix + ')') : '';
                return '<div class="split-row">' +
                    '<span class="who">' + ui.escapeHtml(p) + extra + '</span>' +
                    '<span class="amt">¥' + amounts[i].toFixed(2) + '</span>' +
                    '</div>';
            }).join('');
        }
        nav.openSheet('expense-detail-sheet');
    }

    function copyResult() {
        var summary = $('expense-meta');
        var list = $('expense-split-list');
        var text = '费用分摊结果\n';
        if (summary) text += summary.innerText + '\n';
        if (list) text += list.innerText;
        ui.copyText(text, '分摊结果已复制到剪贴板');
    }

    function exportExpense() {
        var list = App.state.getExpenseHistory();
        if (!list.length) {
            ui.notify('还没有费用记录', '提示');
            return;
        }
        var text = '💰 费用分摊记录\n==================\n\n';
        list.forEach(function (item, i) {
            text += '【' + (i + 1) + '】' + item.type + '\n';
            text += '金额：¥' + Number(item.total).toFixed(2) + '\n';
            text += '参与人：' + (item.participants || []).join('、') + '\n';
            text += '时间：' + new Date(item.date).toLocaleString() + '\n\n';
        });
        ui.downloadText('费用分摊记录_' + new Date().toISOString().slice(0, 10) + '.txt', text);
        ui.notify('费用记录已导出', '导出成功');
    }

    function updateTimeInputs() {
        var box = $('time-inputs');
        if (!box) return;
        var players = readParticipants();
        box.innerHTML = players.map(function (p, i) {
            return '<div class="time-row">' +
                '<span class="who">' + ui.escapeHtml(p) + '</span>' +
                '<input type="number" class="input time-input" min="1" value="60" data-index="' + i +
                '" aria-label="' + ui.escapeHtml(p) + ' 的运动时长（分钟）">' +
                '<span class="unit">分钟</span>' +
                '</div>';
        }).join('');
    }

    function onEnter() {
        updateParticipantCount();
        updateTimeInputs();
        renderHistory();
    }

    function init() {
        nav.on('expense:calculate', calculate);
        nav.on('expense:clear', clearForm);
        nav.on('expense:mode', setSplitMode);
        nav.on('expense:quick-amount', quickAmount);
        nav.on('expense:detail', showDetail);
        nav.on('expense:copy', copyResult);
        nav.on('expense:export', exportExpense);
        nav.on('expense:players-input', function () { updateParticipantCount(); updateTimeInputs(); });
    }

    App.expense = {
        init: init,
        onEnter: onEnter,
        calculate: calculate,
        showDetail: showDetail,
        copyResult: copyResult,
        exportExpense: exportExpense
    };
})(window.App);
