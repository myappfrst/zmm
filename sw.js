/**
 * ============================================================================
 * ZOOM WORKPLACE — PWA SERVICE WORKER (sw.js)
 * ============================================================================
 * - PWA ilova sifatida telefonga (iOS / Android) va kompyuterga o'rnatishni ta'minlaydi
 * - Push bildirishnomalar (Notification) ustiga bosilganda ilovani ochadi
 * - /api/* so'rovlarini har doim jonli serverdan oladi (keshlab qo'ymaydi)
 * ============================================================================
 */

const CACHE_NAME = 'zoom-workplace-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/api.js',
    '/manifest.json',
    '/src/favicon.png',
    '/src/ava.jpg',
    '/src/rwn.jpg',
    '/src/lew.jpg',
    '/src/and.jpg',
    '/src/alert.mp3'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                STATIC_ASSETS.map((url) => cache.add(url).catch(() => {}))
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const reqUrl = new URL(event.request.url);

    // API so'rovlarini hech qachon keshlamaslik (real vaqtda ishlashi uchun)
    if (reqUrl.pathname.startsWith('/api/') || reqUrl.pathname === '/health' || event.request.method !== 'GET') {
        return;
    }

    // Network-first, offline bo'lganda keshdan olish
    event.respondWith(
        fetch(event.request)
            .then((networkResp) => {
                if (networkResp && networkResp.status === 200) {
                    const respClone = networkResp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone)).catch(() => {});
                }
                return networkResp;
            })
            .catch(() => caches.match(event.request))
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow('/');
        })
    );
});
