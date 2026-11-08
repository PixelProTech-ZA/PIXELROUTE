// PixelRoute service worker v2. Shell: network-first (always fresh when online), cache fallback offline.
// API GETs: network-first; offline replay is flagged from_cache so the app can show it as historical.
const V = "pixelroute-v2";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.pathname.startsWith("/api/")) {
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })
      .catch(async () => {
        const m = await caches.match(r);
        if (!m) return new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } });
        const j = await m.json(); return new Response(JSON.stringify({ ...j, from_cache: true }), { headers: { "Content-Type": "application/json" } });
      }));
    return;
  }
  e.respondWith(fetch(r, { cache: "no-cache" }).then(res => { if (res.ok && u.origin === location.origin) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r).then(m => m || caches.match("index.html"))));
});
