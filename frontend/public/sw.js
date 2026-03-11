const CACHE_NAME = 'hunter-guiris-v1';
const TILE_CACHE = 'map-tiles-v1';
const OFFLINE_QUEUE = 'offline-queue';

// Archivos esenciales para offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install - cachea archivos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Hunter Guiris CC: Cacheando archivos offline...');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - limpia caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== TILE_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - estrategia de cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Tiles del mapa - cache first, luego network
  if (url.hostname.includes('basemaps.cartocdn.com')) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // API calls - network first, con fallback offline
  if (url.pathname.startsWith('/api/')) {
    // Si es POST analyze y estamos offline, guardar en cola
    if (request.method === 'POST' && url.pathname.includes('/analyze')) {
      event.respondWith(
        fetch(request.clone()).catch(async () => {
          // Guardar en IndexedDB para procesar después
          const body = await request.clone().json();
          await saveToOfflineQueue(body);
          return new Response(JSON.stringify({
            status: 'queued',
            message: 'Sin conexión. Tu búsqueda se procesará cuando vuelvas a tener internet.',
            offline: true
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );
      return;
    }

    // Otros API calls - network first
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request);
      })
    );
    return;
  }

  // Archivos estáticos - cache first
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((response) => {
        if (response.ok && request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// Background sync - procesar cola cuando vuelve internet
self.addEventListener('sync', (event) => {
  if (event.tag === 'process-offline-queue') {
    event.waitUntil(processOfflineQueue());
  }
});

// Online event - procesar cola
self.addEventListener('message', (event) => {
  if (event.data === 'ONLINE') {
    processOfflineQueue();
  }
});

// Funciones auxiliares para IndexedDB
async function saveToOfflineQueue(data) {
  const db = await openDB();
  const tx = db.transaction(OFFLINE_QUEUE, 'readwrite');
  const store = tx.objectStore(OFFLINE_QUEUE);
  await store.add({ ...data, timestamp: Date.now() });
}

async function processOfflineQueue() {
  try {
    const db = await openDB();
    const tx = db.transaction(OFFLINE_QUEUE, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUEUE);
    const items = await store.getAll();

    for (const item of items) {
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });

        if (response.ok) {
          await store.delete(item.id);
          // Notificar al usuario
          self.registration.showNotification('Hunter Guiris CC', {
            body: 'Tu búsqueda offline ha sido procesada!',
            icon: '/icon-192.png'
          });
        }
      } catch (e) {
        console.log('Aún sin conexión, reintentando después...');
      }
    }
  } catch (e) {
    console.error('Error procesando cola offline:', e);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HunterGuirisDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE)) {
        db.createObjectStore(OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}
