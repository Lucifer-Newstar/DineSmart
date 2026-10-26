/* DineSmart service worker (S5-05).
 *
 * - Pages: network first. The public pages listed in PAGE_ROUTES are kept so
 *   they open without a connection; any other page shows /offline instead.
 * - Built assets under /_next/static/ are content-hashed, so they are served
 *   from the cache once fetched.
 * - The public menu (GET /api/v1/menu) is network first; the last copy is kept
 *   and returned offline with the X-DineSmart-Offline-Copy header so the page
 *   can turn ordering off and say so.
 * - Nothing else under /api/ is cached: bookings, orders and account data
 *   always come from the server.
 */
const VERSION = "v1";
const SHELL_CACHE = `dinesmart-shell-${VERSION}`;
const PAGE_CACHE = `dinesmart-pages-${VERSION}`;
const MENU_CACHE = `dinesmart-menu-${VERSION}`;
const OFFLINE_URL = "/offline";
const PAGE_ROUTES = new Set(["/", "/menu", OFFLINE_URL]);
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, PAGE_CACHE, MENU_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("dinesmart-") && !keep.has(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function pageResponse(request, url) {
  try {
    const response = await fetch(request);
    if (response.ok && PAGE_ROUTES.has(url.pathname)) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(url.pathname, response.clone());
    }
    return response;
  } catch {
    const cached = PAGE_ROUTES.has(url.pathname)
      ? await caches.match(url.pathname, { cacheName: PAGE_CACHE })
      : undefined;
    return cached ?? (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function staticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** One cache entry per restaurant: the page's refresh counter is not part of the key. */
function menuKey(url) {
  const key = new URL(url.pathname, url.origin);
  const restaurantId = url.searchParams.get("restaurantId");
  if (restaurantId) key.searchParams.set("restaurantId", restaurantId);
  return key.toString();
}

async function menuResponse(request, url) {
  const key = menuKey(url);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(MENU_CACHE);
      await cache.put(key, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(key, { cacheName: MENU_CACHE });
    if (!cached) return Response.error();
    const headers = new Headers(cached.headers);
    headers.set("X-DineSmart-Offline-Copy", "1");
    return new Response(await cached.blob(), {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(pageResponse(request, url));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(staticAsset(request));
    return;
  }
  if (url.pathname === "/api/v1/menu") {
    event.respondWith(menuResponse(request, url));
  }
});
