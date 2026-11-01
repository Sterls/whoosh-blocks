// Offline support and updates.
//
// Each version of the game is downloaded in full and kept on the phone, so it
// opens instantly with no signal. When a new version is published, it is
// downloaded in the background and waits; the game then shows a
// "New version ready" bar, and tapping Update switches over.
//
// VERSION is a fingerprint of the files below. Run `npm run stamp` after
// changing any of them (`npm test` fails if you forget), so phones notice.

const VERSION = '8ae058513825';
const CACHE = `whoosh-blocks-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'privacy.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/game.js',
  'js/levels.js',
  'js/audio.js',
  'js/storage.js',
  'js/config.js',
  'js/leaderboard.js',
  'vendor/three.module.min.js',
  'vendor/RoundedBoxGeometry.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // Bypass the browser's HTTP cache so we get this version's files, not stale ones.
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// The page asks for this when the player taps Update.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(req, { ignoreSearch: true }))
      .then((cached) => cached || fetch(req)));
});
