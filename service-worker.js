self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method === 'GET') {
        event.respondWith(
            fetch(event.request).catch((err) => {
                if (event.request.destination === 'script' || event.request.url.endsWith('.js')) {
                    return new Response('/* Offline or network unavailable */', {
                        status: 503,
                        headers: { 'Content-Type': 'text/javascript; charset=utf-8' }
                    });
                }
                throw err;
            })
        );
    }
});
