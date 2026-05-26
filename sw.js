const CACHE = 'turno-v2';
const FILES = ['./index.html', './manifest.json', './style.css', './app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nunca intercepta requisições para outros domínios (Supabase, APIs, etc.)
  if (url.origin !== self.location.origin) {
    return; // deixa o browser fazer a requisição normalmente
  }

  // Apenas arquivos do próprio app usam cache
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
