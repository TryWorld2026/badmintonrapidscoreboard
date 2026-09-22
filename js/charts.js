/* ================================================================
   charts.js — 统计图表（4 张：月度折线 / 胜负环 / 胜率趋势 / 时长分布）
   图表类型与数据口径与旧版一致；配色改为 Court Light 亮色主题。
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    /* 图表调色板（字面量，避免 html2canvas / canvas 解析 var() 失败）*/
    var C = {
        brand: '#1B4DFF',
        teamA: '#E5484D',
        teamB: '#0090FF',
        gold: '#FFB020',
        white: '#FFFFFF',
        grid: 'rgba(15, 21, 28, 0.07)',
        tick: '#8B96A4',
        border: '#FFFFFF',
        fillBrand: 'rgba(27, 77, 255, 0.12)',
        fillBrandStrong: 'rgba(27, 77, 255, 0.35)',
        fillTeamA: 'rgba(229, 72, 77, 0.35)',
        fillTeamB: 'rgba(0, 144, 255, 0.35)',
        fillGold: 'rgba(255, 176, 32, 0.35)'
    };

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

    function baseScales(yStep) {
        return {
            x: { grid: { color: C.grid, drawBorder: false }, ticks: { color: C.tick } },
            y: {
                beginAtZero: true,
                grid: { color: C.grid, drawBorder: false },
                ticks: { color: C.tick, stepSize: yStep || 1 }
            }
        };
    }

    function createMonthly(matchHistory) {
        var ctx = document.getElementById('monthlyChart');
        if (!ctx || !hasChart()) return;

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
                    borderColor: C.brand,
                    backgroundColor: C.fillBrand,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: C.brand,
                    pointBorderColor: C.border,
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
                    backgroundColor: [C.brand, C.teamA],
                    borderColor: C.border,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: C.tick }
                    }
                }
            }
        });
    }

    function createWinRateTrend(matchHistory) {
        var ctx = document.getElementById('winRateTrendChart');
        if (!ctx || !hasChart()) return;

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
                    backgroundColor: C.fillBrandStrong,
                    borderColor: C.brand,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false, drawBorder: false }, ticks: { color: C.tick } },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: C.grid, drawBorder: false },
                        ticks: {
                            color: C.tick,
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
                        C.fillBrand, C.fillBrandStrong, C.fillGold, C.fillTeamB, C.fillTeamA
                    ],
                    borderColor: C.border,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: C.tick }
                    }
                },
                scales: {
                    r: {
                        grid: { color: C.grid },
                        angleLines: { color: C.grid },
                        ticks: { color: C.tick, backdropColor: 'rgba(0,0,0,0)' }
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
