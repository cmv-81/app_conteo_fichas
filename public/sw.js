/*
 * Service worker: permite usar la web SIN CONEXIÓN (en un festival la cobertura falla).
 * Estrategia "primero red": con conexión siempre se usan los datos más nuevos
 * (por ejemplo, un datos.js recién exportado); sin conexión, la copia guardada.
 */
const CACHE = "fichas-v3";
const ARCHIVOS = [
  "./",
  "index.html",
  "estilos.css",
  "motor.js",
  "app.js",
  "datos.js",
  "manifest.webmanifest",
  "iconos/icono-192.png",
  "iconos/icono-512.png",
];
const ESPERA_RED_MS = 3000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const red = fetch(req, { cache: "no-cache" }).then((resp) => {
      if (resp && resp.ok) cache.put(req, resp.clone());
      return resp;
    });
    e.waitUntil(red.catch(() => {})); // deja terminar la actualización aunque ya se haya respondido
    try {
      // Si la red tarda demasiado, se usa la copia guardada (y la red la actualiza por detrás).
      const lenta = new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("lenta")), ESPERA_RED_MS));
      return await Promise.race([red, lenta]);
    } catch (err) {
      const guardada = await cache.match(req, { ignoreSearch: true });
      if (guardada) return guardada;
      return red; // no hay copia: esperar a la red
    }
  })());
});
