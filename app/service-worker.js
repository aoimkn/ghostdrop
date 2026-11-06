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

// Shared content stays on the device: it waits here, unencrypted, until home picks it up.
/**
 * @param {{ text: string | null, files: File[] }} shared
 * @returns {Promise<void>}
 */
function keepShared(shared) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("__SHARE_DATABASE__", 1);
    request.addEventListener("upgradeneeded", () =>
      request.result.createObjectStore("__SHARE_STORE__"),
    );
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("success", () => {
      const db = request.result;
      const transaction = db.transaction("__SHARE_STORE__", "readwrite");
      transaction.objectStore("__SHARE_STORE__").put(shared, "__SHARE_KEY__");
      transaction.addEventListener("complete", () => {
        db.close();
        resolve();
      });
      transaction.addEventListener("error", () => reject(transaction.error));
    });
  });
}

/** @param {Request} request */
async function receiveShare(request) {
  const form = await request.formData();
  /** @param {string} name */
  const field = (name) => {
    const value = form.get(name);
    return typeof value === "string" && value !== "" ? value : null;
  };
  const text = field("text");
  const url = field("url");
  const joined =
    url === null || (text !== null && text.includes(url))
      ? text
      : text === null
        ? url
        : `${text}\n${url}`;
  const files = form
    .getAll("files")
    .filter(/** @returns {value is File} */ (value) => value instanceof File && value.name !== "");
  await keepShared({ text: joined, files });
  return Response.redirect("/", 303);
}

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
  if (url.origin !== globalThis.location.origin) return;
  if (request.method === "POST" && url.pathname === "/share") {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET") return;
  if (request.mode === "navigate") event.respondWith(fromNetworkFirst(request));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(fromCacheFirst(request));
});
