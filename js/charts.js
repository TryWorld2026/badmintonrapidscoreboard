/* ================================================================
   charts.js — 统计图表（4 张：月度折线 / 胜负环 / 胜率趋势 / 时长分布）
   图表类型与数据口径与旧版一致；配色从 VOLT TRUCK 令牌层运行时读取。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    /* 画布吃不到 var(--*)，但可以读已解析的值。禁止再手抄色值：
       旧版在这里硬编码了一套浅色主题配色（#1B4DFF / 白边），
       视觉重构后没人同步，图表在深色卡片上直接花掉。 */
    function palette() {
        var p = App.tokens.palette({
            brand: ['--c-brand', '#D4FF3F'],
            teamA: ['--c-team-a', '#FF2E63'],
            teamB: ['--c-team-b', '#00E5FF'],
            gold: ['--c-gold', '#FFB627'],
            text2: ['--c-text-2', '#8A94A3'],
            text3: ['--c-text-3', '#5A6472'],
            surface: ['--c-surface', '#111721']
        });
        /* 网格线：深色底上用极淡的同系色，比旧版 rgba(15,21,28,.07) 可见得多 */
        p.grid = App.tokens.alpha(p.text3, 0.35);
        p.fillBrand = App.tokens.alpha(p.brand, 0.14);
        p.fillBrandStrong = App.tokens.alpha(p.brand, 0.38);
        return p;
    }

    /* 每次建图都重新取一遍：设置里改不了主题，但这样读绝不会拿到过期值 */
    function C() { return palette(); }

    var charts = {
        monthly: null,
        winLoss: null,
        winRateTrend: null,
        duration: null
    };

    function hasChart() {
        return typeof window.Chart === 'function';
    }

    function destroy() {
        Object.keys(charts).forEach(function (k) {
            if (charts[k]) { charts[k].destroy(); charts[k] = null; }
        });
    }

    /* Chart.js v4 起 grid.drawBorder 已移除，改用 grid.border.display。
       旧写法里的 drawBorder:false 是静默失效的死配置。 */
    function baseScales(yStep) {
        var c = C();
        return {
            x: { grid: { color: c.grid, border: { display: false } }, ticks: { color: c.text2 } },
            y: {
                beginAtZero: true,
                grid: { color: c.grid, border: { display: false } },
                ticks: { color: c.text2, stepSize: yStep || 1 }
            }
        };
    }

    function createMonthly(matchHistory) {
        var ctx = document.getElementById('monthlyChart');
        if (!ctx || !hasChart()) return;
        var c = C();

        var monthlyData = {};
        matchHistory.forEach(function (m) {
            var d = new Date(m.date);
            var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            monthlyData[key] = (monthlyData[key] || 0) + 1;
        });

        var labels = Object.keys(monthlyData).slice(-6);
        var data = labels.map(function (l) { return monthlyData[l]; });

        charts.monthly = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '比赛场数',
                    data: data,
                    borderColor: c.brand,
                    backgroundColor: c.fillBrand,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: c.brand,
                    /* 数据点外圈用卡片底色，不再是 3px 白边 */
                    pointBorderColor: c.surface,
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: baseScales(1)
            }
        });
    }

    function createWinLoss(matchHistory) {
        var ctx = document.getElementById('winLossChart');
        if (!ctx || !hasChart()) return;
        var c = C();

        var wins = 0;
        var losses = 0;
        matchHistory.forEach(function (m) {
            if (m.scoreA > m.scoreB) wins++;
            else losses++;
        });

        charts.winLoss = new window.Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['胜利', '失败'],
                datasets: [{
                    data: [wins, losses],
                    backgroundColor: [c.brand, c.teamA],
                    /* 用卡片底色做分隔，不再是 3px 白边 */
                    borderColor: c.surface,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: c.text2 }
                    }
                }
            }
        });
    }

    function createWinRateTrend(matchHistory) {
        var ctx = document.getElementById('winRateTrendChart');
        if (!ctx || !hasChart()) return;
        var c = C();

        var sorted = matchHistory.slice().reverse();
        var cumulativeWins = 0;
        var winRates = [];
        var labels = [];

        sorted.forEach(function (m, i) {
            if (m.scoreA > m.scoreB) cumulativeWins++;
            winRates.push(Math.round((cumulativeWins / (i + 1)) * 100));
            labels.push('#' + (i + 1));
        });

        var recentLabels = labels.slice(-10);
        var recentRates = winRates.slice(-10);

        charts.winRateTrend = new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels: recentLabels,
                datasets: [{
                    label: '胜率 (%)',
                    data: recentRates,
                    backgroundColor: c.fillBrandStrong,
                    borderColor: c.brand,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false, border: { display: false } }, ticks: { color: c.text2 } },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: c.grid, border: { display: false } },
                        ticks: {
                            color: c.text2,
                            callback: function (v) { return v + '%'; }
                        }
                    }
                }
            }
        });
    }

    function createDuration(matchHistory) {
        var ctx = document.getElementById('durationChart');
        if (!ctx || !hasChart()) return;
        var c = C();

        var ranges = {
            '0-10分钟': 0,
            '10-20分钟': 0,
            '20-30分钟': 0,
            '30-40分钟': 0,
            '40分钟以上': 0
        };

        matchHistory.forEach(function (m) {
            var minutes = (m.duration || 0) / 60;
            if (minutes < 10) ranges['0-10分钟']++;
            else if (minutes < 20) ranges['10-20分钟']++;
            else if (minutes < 30) ranges['20-30分钟']++;
            else if (minutes < 40) ranges['30-40分钟']++;
            else ranges['40分钟以上']++;
        });

        charts.duration = new window.Chart(ctx, {
            type: 'polarArea',
            data: {
                labels: Object.keys(ranges),
                datasets: [{
                    data: Object.keys(ranges).map(function (k) { return ranges[k]; }),
                    backgroundColor: [
                        c.fillBrand, c.fillBrandStrong, App.tokens.alpha(c.gold, 0.38),
                        App.tokens.alpha(c.teamB, 0.38), App.tokens.alpha(c.teamA, 0.38)
                    ],
                    /* 极坐标分隔线同样用卡片底色，不再是白边 */
                    borderColor: c.surface,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: c.text2 }
                    }
                },
                scales: {
                    r: {
                        grid: { color: c.grid },
                        angleLines: { color: c.grid },
                        ticks: { color: c.text2, backdropColor: 'rgba(0, 0, 0, 0)' }
                    }
                }
            }
        });
    }

    function initCharts() {
        if (!hasChart()) return;
        /* 先销毁旧实例：Chart.js 不允许在同一 canvas 上重复 new，
           否则抛 "Canvas is already in use. Chart with ID '0' ..." */
        destroy();
        var history = App.state.getMatchHistory();
        if (!history || history.length === 0) return;
        createMonthly(history);
        createWinLoss(history);
        createWinRateTrend(history);
        createDuration(history);
    }

    App.charts = {
        initCharts: initCharts,
        destroy: destroy
    };
})(window.App);
