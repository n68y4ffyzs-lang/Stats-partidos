// Service Worker de Statix: permite abrir y usar la app sin conexión.
//
// - Página (index.html): primero red (con un tiempo límite corto) y, si no hay conexión o
//   tarda demasiado, la copia guardada. Así, con internet siempre se carga la última versión
//   desplegada en Vercel, y sin internet se abre la última que se descargó. Una versión nueva
//   solo se aplica al abrir/recargar la app: nunca interrumpe un partido que esté en curso
//   (los datos del partido viven en localStorage, no en esta caché).
// - Librerías de CDN, fuentes, iconos y manifest: primero caché y, si no están, red (y se
//   guardan para la próxima vez).
// - /api/* (FFCV) y Supabase: siempre red, nunca se guardan en caché.
//
// Si se añade algún archivo nuevo que la app necesite para arrancar, añádelo a PRECACHE y
// sube VERSION para que se descargue en la siguiente visita con conexión.

const VERSION = "v2";
const CACHE = `statix-${VERSION}`;
const NAV_TIMEOUT_MS = 4000;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icon-512.png",
  "/favicon-32.png",
  "https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js",
  "https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://cdn.jsdelivr.net/npm/@babel/standalone@7.25.6/babel.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdn.tailwindcss.com/3.4.17",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js",
];

const RUNTIME_HOSTS = ["cdn.jsdelivr.net", "cdn.tailwindcss.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Uno a uno, para que un archivo que falle no impida guardar el resto
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res);
          } catch (e) {
            // Sin conexión durante la instalación: se guardará en tiempo de ejecución
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("statix-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then(async (res) => {
    // Las respuestas con redirección no se pueden servir a una navegación desde caché
    if (res.ok && !res.redirected) await cache.put("/", res.clone());
    return res;
  });
  try {
    return await withTimeout(network, NAV_TIMEOUT_MS);
  } catch (e) {
    const cached = await cache.match("/");
    if (cached) {
      network.catch(() => {}); // si al final llega, actualiza la caché para la próxima vez
      return cached;
    }
    return network;
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") await cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
    event.respondWith(handleAsset(request));
    return;
  }

  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(handleAsset(request));
  }
  // Cualquier otra cosa (Supabase, FFCV...) va directa a la red
});
