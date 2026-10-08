// sw.js — アプリシェルのキャッシュ（stale-while-revalidate）＋ Firebase SDK のキャッシュ（cache-first）。オフライン起動可
// ファイルを更新したら CACHE_VERSION を上げる（旧キャッシュは activate で削除）
const CACHE_VERSION = 'v1.2.1';
// Firebase JS SDK のバージョン。js/firebase-config.js の SDK_VERSION と必ず揃えること（tests/test.html で一致を検査）
const SDK_VERSION = '12.19.0';
const SHELL_CACHE = 'won-shell-' + CACHE_VERSION;
const FONT_CACHE = 'won-fonts-' + CACHE_VERSION;
const SDK_CACHE = 'won-sdk-' + SDK_VERSION;       // バージョン固定URL＝不変なので、アプリ更新をまたいで使い回す
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/calc.js', 'js/store.js', 'js/defaults.js', 'js/timer.js', 'js/state.js', 'js/ui.js',
  'js/firebase-config.js', 'js/auth.js', 'js/store-firebase.js', 'js/migrate.js', 'js/cloud.js', 'js/photo.js', 'js/photo-layout.js',
  'js/screens/home.js', 'js/screens/pick.js', 'js/screens/entry.js', 'js/screens/history.js', 'js/screens/analysis.js',
  'js/screens/body.js', 'js/screens/settings.js', 'js/screens/master.js', 'js/screens/sheets.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.ico', 'icons/favicon-32.png',
];
// SDK の3ファイル（auth / firestore が内部で import するのは同じバージョンの firebase-app.js だけであることを確認済み）
const SDK_PREFIX = 'https://www.gstatic.com/firebasejs/';
const SDK_URLS = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => SDK_PREFIX + SDK_VERSION + '/' + f);
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/** SDK を取得してキャッシュ。失敗しても例外にしない（SW のインストールを失敗させない） */
function cacheSdk() {
  return caches.open(SDK_CACHE).then(cache => Promise.all(SDK_URLS.map(u =>
    cache.match(u).then(hit => hit || fetch(new Request(u, { mode: 'cors', credentials: 'omit' })).then(res => { if (res && res.ok) return cache.put(u, res); }))
      .catch(() => { /* オフライン等。次回の利用時に取り直す */ })))).catch(() => {});
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => cacheSdk())
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  const keep = [SHELL_CACHE, FONT_CACHE, SDK_CACHE];
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('won-') && !keep.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function staleWhileRevalidate(e, cacheName, req, fetchReq) {
  e.respondWith(caches.open(cacheName).then(cache => cache.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => {
    const net = fetch(fetchReq).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
  })));
}
/** cache-first（不変のURL用）。無ければ取得してキャッシュ */
function cacheFirst(e, cacheName, req) {
  e.respondWith(caches.open(cacheName).then(cache => cache.match(req.url).then(hit => hit || fetch(req).then(res => {
    if (res && res.ok) cache.put(req.url, res.clone());
    return res;
  }))));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // ナビゲーションは index.html として扱う（クエリ違いでもキャッシュが当たるように）
    staleWhileRevalidate(e, SHELL_CACHE, req, req.mode === 'navigate' ? req : new Request(req.url, { cache: 'no-cache' }));
  } else if (req.url.startsWith(SDK_PREFIX)) {
    cacheFirst(e, SDK_CACHE, req);                   // Firebase SDK（gstatic の ESM）
  } else if (FONT_HOSTS.includes(url.hostname)) {
    staleWhileRevalidate(e, FONT_CACHE, req, req);   // Google Fonts は実行時キャッシュ
  }
  // それ以外（firestore.googleapis.com / identitytoolkit.googleapis.com / securetoken.googleapis.com /
  // apis.google.com / *.firebaseapp.com など API・認証の通信）は SW では一切触らない
});
