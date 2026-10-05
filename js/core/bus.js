/* ================================================================
   core/bus.js — 极简事件总线

   为什么需要它：
     现状是「任何改动 → 调一次 render()」全量重绘。在没有后端的年代
     这没问题，但一旦接上云同步，就必须回答一个问题：
     **「刚才这次改动，值不值得推给服务器？」**
     全量重绘回答不了，事件总线可以。

   设计取舍（刻意做得极小）：
     - 同步派发，不用 Promise：状态写入后立刻通知，避免"读到旧值"
     - 单个订阅者抛错不影响其他订阅者（隔离，避免一个 bug 拖垮全局）
     - 不提供 once / 优先级 / 通配符：用不到就是负担

   命名：App.bus（App.store 已被 localStorage 层占用，不重名）
   ================================================================ */
window.App = window.App || {};
(function (App) {
    'use strict';

    /* 事件名 → 订阅者数组 */
    var map = {};
    /* 派发深度：用于识别"事件里又发事件"的递归，超过阈值就告警并截断 */
    var depth = 0;
    var MAX_DEPTH = 8;

    function on(evt, fn) {
        if (typeof evt !== 'string' || !evt) return function () { };
        if (typeof fn !== 'function') return function () { };
        if (!map[evt]) map[evt] = [];
        map[evt].push(fn);

        /* 返回退订函数：调用方不必自己记住 fn 引用 */
        return function off() { off_(evt, fn); };
    }

    function off_(evt, fn) {
        var list = map[evt];
        if (!list) return;
        var i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) delete map[evt];
    }

    function emit(evt, payload) {
        var list = map[evt];
        if (!list || !list.length) return 0;

        if (depth >= MAX_DEPTH) {
            /* 递归派发通常意味着两个模块互相触发（A 改 → 通知 B → B 又改 A）。
               不抛错（会打断业务），但要留下痕迹，否则这类 bug 极难定位。 */
            if (window.console && console.warn) {
                console.warn('[bus] 事件递归过深，已截断：' + evt);
            }
            return 0;
        }

        depth++;
        /* 复制一份再遍历：订阅者在回调里退订/新增不会打乱本次遍历 */
        var snapshot = list.slice();
        var delivered = 0;
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](payload, evt);
                delivered++;
            } catch (err) {
                /* 隔离：一个订阅者出错不能让其余订阅者收不到通知。
                   本项目历史上「一个副作用抛错把整个状态机卡住」出过不止一次
                   （见 REFACTOR_NOTES 的 B14），这里显式兜住。 */
                if (window.console && console.error) {
                    console.error('[bus] 订阅者抛错，已隔离：' + evt, err);
                }
            }
        }
        depth--;
        return delivered;
    }

    /* 退订某个事件的全部订阅者（主要用于测试之间清理） */
    function clear(evt) {
        if (evt === undefined) map = {};
        else delete map[evt];
    }

    function count(evt) {
        if (evt === undefined) {
            var n = 0;
            for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) n += map[k].length;
            return n;
        }
        return map[evt] ? map[evt].length : 0;
    }

    App.bus = {
        on: on,
        off: off_,
        emit: emit,
        clear: clear,
        count: count
    };
})(window.App);
