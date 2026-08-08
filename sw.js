// sw.js
const CACHE_VERSION = 'v5.1-cloudflare'; // <--- CAMBIA ESTE NÚMERO CADA VEZ QUE HAGAS UN CAMBIO IMPORTANTE
const CACHE_NAME = `radio-cache-${CACHE_VERSION}`;

// Archivos a cachear (asegúrate de que esta lista esté completa)
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/logo.png',
    '/img/backgroundapp.jpg'
];

// Instalación: guarda los archivos en la nueva caché
self.addEventListener('install', event => {
    console.log(`[SW] Instalando versión ${CACHE_VERSION}`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Archivos cacheados');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activación: ¡LIMPIA LAS CACHÉS VIEJAS!
self.addEventListener('activate', event => {
    console.log(`[SW] Activando versión ${CACHE_VERSION}`);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    // Si el nombre de la caché NO coincide con la actual, la borramos
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Eliminando caché antigua:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    // Asegura que el nuevo SW tome el control de las páginas abiertas
    return self.clients.claim();
});

// Fetch: estrategia "network first" con fallback a caché (para asegurar que siempre se vea la versión más reciente)
self.addEventListener('fetch', event => {
    // Solo cachear solicitudes GET y que sean del mismo origen
    if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request)
                .then(response => response || fetch(event.request))
        );
    } else {
        // Para POST y otras, solo hacer fetch normal
        event.respondWith(fetch(event.request));
    }
});
