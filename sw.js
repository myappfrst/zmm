/**
 * ============================================================================
 * ZOOM WORKPLACE — PWA & BACKGROUND WEB PUSH SERVICE WORKER (sw.js)
 * ============================================================================
 * - PWA ilova sifatida telefonga (iOS / Android) va kompyuterga o'rnatishni ta'minlaydi
 * - Hattoki PWA umuman yopiq bo'lganda ham serverdan VAPID Web Push orqali kelgan
 *   bildirishnomalarni (push event) qabul qilib ekranga chiqaradi
 * - Bildirishnoma ustiga bosilganda ilovani va tegishli chatni ochadi
 * ============================================================================
 */

const CACHE_NAME = 'zoom-workplace-v5';
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
    if (reqUrl.pathname.startsWith('/api/') || reqUrl.pathname === '/health' || event.request.method !== 'GET') {
        return;
    }
    event.respondWith(
        fetch(event.request, { cache: 'no-cache' })
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

// BACKGROUND WEB PUSH LISTENER (Works even when PWA is completely closed!)
self.addEventListener('push', (event) => {
    let payload = {
        title: 'Zoom Workplace',
        body: 'New message received',
        icon: 'src/favicon.png',
        badge: 'src/favicon.png',
        tag: 'zw-msg-' + Date.now(),
        chat: 'james'
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            payload = { ...payload, ...parsed };
        } catch (e) {
            try {
                payload.body = event.data.text() || payload.body;
            } catch (err) {}
        }
    }

    const options = {
        body: payload.body,
        icon: payload.icon || 'src/favicon.png',
        badge: payload.badge || 'src/favicon.png',
        tag: payload.tag || ('zw-push-' + Date.now()),
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: {
            chat: payload.chat || 'james',
            url: payload.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Zoom Workplace', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetChat = (event.notification.data && event.notification.data.chat) || null;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.postMessage({ type: 'OPEN_CHAT_FROM_PUSH', chat: targetChat });
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetChat ? `/?chat=${targetChat}` : '/');
            }
        })
    );
});
