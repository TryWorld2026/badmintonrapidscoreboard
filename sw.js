/* ================================================================
   Service Worker — 离线缓存
   用相对 URL，任意子路径部署都能命中。
   预缓存清单只包含仓库中真实存在的文件（旧版缓存了不存在的
   图标，导致 install 直接失败，整个 SW 注册无效）。
   ================================================================ */
var CACHE_NAME = 'badminton-score-v6';

var ASSETS = [
  './',
  './index.html',
  './manifest.json',

  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/screens.css',
  './css/effects.css',
  './css/share-card.css',

  './js/icons.js',
  './js/tokens.js',
  './js/store.js',
  './js/state.js',
  './js/effects.js',
  './js/ui.js',
  './js/nav.js',
  './js/avatars.js',
  './js/match.js',
  './js/grouping.js',
  './js/expense.js',
  './js/charts.js',
  './js/stats.js',
  './js/achievements.js',
  './js/share.js',
  './js/settings.js',
  './js/app.js',

  './vendor/chart.umd.min.js',
  './vendor/html2canvas.min.js',

  './images/icon-192.png',
  './images/icon-512.png',
  './images/apple-touch-icon.png',
  './images/favicon.svg'
];

/* 只缓存同源 GET；跳过 chrome-extension / data / blob 等 scheme */
function shouldHandle(request) {
  if (!request || request.method !== 'GET') return false;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return url.protocol === 'http:' || url.protocol === 'https:';
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* 逐条 add，单个资源失败不影响整体 install */
      return Promise.all(ASSETS.map(function (src) {
        return cache.add(new Request(src, { cache: 'reload' }))
          .catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n !== CACHE_NAME) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var request = e.request;
  if (!shouldHandle(request)) return;

  /* 页面导航：网络优先，失败回退到缓存的 index.html（SPA 单文件）*/
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then(function (res) {
        /* 只把真正的页面写进缓存，且只把真正的页面交给浏览器。
           fetch() 对错误状态（502/503/504、强制门户跳转页）并不抛异常，
           照样 resolve，所以必须自己判 res.ok。否则一次源站抖动就会把
           错误页 c.put 进 ./index.html —— 之后离线回退取到的是错误页
           而不是应用，且会一直错到缓存名变更为止。 */
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put('./index.html', copy); });
          return res;
        }
        throw new Error('navigation not ok: ' + (res ? res.status : 'no response'));
      }).catch(function () {
        return caches.match('./index.html').then(function (r) {
          return r || caches.match('./');
        });
      })
    );
    return;
  }

  /* 静态资源：缓存优先，后台更新 */
  e.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      var network = fetch(request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(request, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
