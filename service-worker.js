// Service Worker for ZIT Easy Use PWA
const CACHE_NAME = 'zit-easy-use-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/gallery.html',
  '/js/common.js',
  '/js/index.js',
  '/js/gallery.js',
  '/js/tailwind.js',
  '/resources/icon.png'
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 处理请求
self.addEventListener('fetch', (event) => {
  // 忽略非GET请求
  if (event.request.method !== 'GET') return;
  
  // 忽略API请求，只缓存静态资源
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/view') || 
      url.pathname.startsWith('/history') || 
      url.pathname.startsWith('/prompt') || 
      url.pathname.startsWith('/interrupt') || 
      url.pathname.startsWith('/queue') || 
      url.pathname.startsWith('/ws')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果在缓存中找到响应，直接返回
        if (response) {
          return response;
        }

        // 否则从网络获取
        return fetch(event.request)
          .then((networkResponse) => {
            // 只缓存成功的响应
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // 克隆响应，因为响应流只能使用一次
            const responseToCache = networkResponse.clone();
            
            // 存入缓存
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // 如果网络请求失败，返回离线页面
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// 后台同步（可选）
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// 推送通知（可选）
self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/resources/icon.png',
    badge: '/resources/icon.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 通知点击事件
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

// 同步数据函数（示例）
async function syncData() {
  // 这里可以实现数据同步逻辑
  console.log('Syncing data...');
}