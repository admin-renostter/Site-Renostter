/* ================================================
   RENOSTTER — Service Worker
   Cache estratégico para performance offline
   ================================================ */

const RELEASE_VERSION = '2026.05.28';
const CACHE_NAME = `renostter-v${RELEASE_VERSION}`;
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/chatbot.css',
    '/script.js',
    '/calendar.js',
    '/chatbot.js',
    '/js/portfolio.js',
    '/js/reviews.js',
    '/js/carousel.js',
    '/assets/logo.png',
    '/assets/logo-dinamico.webm',
    '/assets/lucas-ai.jpg',
    '/assets/marcas/lg.png',
    '/assets/marcas/samsung.png',
    '/assets/marcas/midea.png',
    '/assets/marcas/daikin.png',
    '/assets/marcas/gree.png',
    '/assets/marcas/elgin.png',
    '/assets/marcas/springer.png',
    '/assets/marcas/electrolux.png',
    '/assets/marcas/consul.png',
    '/assets/marcas/tcl.png',
    '/assets/marcas/philco.png',
];

/* ─── Instalar: pré-cache dos assets estáticos ─── */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.allSettled(
                STATIC_ASSETS.map(asset =>
                    cache.add(asset).catch(err => {
                        console.warn('[SW] Asset não cacheado:', asset, err);
                    })
                )
            );
        })
    );
    self.skipWaiting();
});

/* ─── Ativar: limpar caches antigos ─── */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

/* ─── Fetch: Cache-First para assets, Network-First para HTML ─── */
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    /* Ignorar requests que não são GET ou são de outras origens */
    if (request.method !== 'GET' || url.origin !== location.origin) return;
    if (url.pathname.startsWith('/proxy/') || url.pathname.startsWith('/api/')) return;

    /* HTML: Network-First (sempre busca versão nova, fallback no cache) */
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then(res => {
                    if (!res || !res.ok) return res;
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(request, clone));
                    return res;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    /* Assets estáticos (CSS, JS, imagens): Cache-First */
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;

            return fetch(request).then(res => {
                if (res && res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(request, clone));
                }
                return res;
            }).catch(() => Response.error());
        })
    );
});
