self.addEventListener('fetch', (event) => {
    if (event.request.method === 'GET') {
        event.respondWith(fetch(event.request));
    }
});
