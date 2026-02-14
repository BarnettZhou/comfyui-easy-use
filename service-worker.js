// Service Worker 已禁用
// 如需启用 PWA 功能，请重新实现

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
    // 清理旧缓存
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => caches.delete(cacheName))
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // 直接通过网络请求，不缓存
    event.respondWith(fetch(event.request));
});
