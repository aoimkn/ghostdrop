const CACHE = "ghostdrop-__VERSION__";
const OFFLINE = "/offline";

// The offline screen is kept without its scripts: it is shown in place of whatever page failed
// to load, so hydrating it would run that page's code with no network.
async function cacheOfflineScreen() {
  const cache = await caches.open(CACHE);
  const response = await fetch(OFFLINE, { cache: "no-store" });
  const html = (await response.text())
    .replaceAll(/<script\b[\s\S]*?<\/script>/g, "")
    .replaceAll(/<link rel="modulepreload"[^>]*>/g, "");
  const styles = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((match) => match[1]);
  await cache.addAll(styles);
  await cache.put(OFFLINE, new Response(html, { headers: { "Content-Type": "text/html" } }));
}

globalThis.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflineScreen().then(() => globalThis.skipWaiting()));
});

globalThis.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Take over first: until then the previous worker still serves pages and can refill its cache.
      await globalThis.clients.claim();
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
    })(),
  );
});

/** @param {Request} request */
async function fromCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

/** @param {Request} request */
async function fromNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE)) ?? Response.error();
  }
}

globalThis.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== globalThis.location.origin) return;
  if (request.mode === "navigate") event.respondWith(fromNetworkFirst(request));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(fromCacheFirst(request));
});
