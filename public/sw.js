// Keeps the app's pages and files on the device so it opens with no connection (A3). Registered in production only,
// as /sw.js?v=<build id>: every build gets its own cache, and the activate step deletes the caches of earlier builds.
const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `deus-shell-${BUILD}`;
// One page per area. The areas are client screens under one layout, so each page is the same shell.
const PAGES = ["/", "/tasks", "/plan", "/companies", "/notes", "/past", "/flows"];
const FILES = ["/manifest.webmanifest", "/icon-192x192.png", "/icon-512x512.png", "/apple-touch-icon.png", "/brand/deus-mark.png"];
const ASSET = /\/_next\/static\/[^"'\\\s)]+/g;

// Stores each page, then the script, style and font files it names, so every area can open from the device alone.
async function precache() {
  const cache = await caches.open(CACHE);
  const assets = new Set();
  await Promise.all(
    PAGES.map(async (page) => {
      try {
        const response = await fetch(page, { cache: "reload" });
        if (!response.ok || response.redirected) return;
        const html = await response.clone().text();
        for (const match of html.match(ASSET) || []) assets.add(match);
        await cache.put(page, response);
      } catch {}
    })
  );
  const styles = [];
  await Promise.all(
    [...assets].map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        if (url.endsWith(".css")) styles.push(response.clone());
        await cache.put(url, response);
      } catch {}
    })
  );
  // Fonts are named in the style files.
  const fonts = new Set();
  for (const css of styles) for (const match of (await css.text()).match(ASSET) || []) fonts.add(match);
  await Promise.all(
    [...fonts].filter((url) => !assets.has(url)).map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch {}
    })
  );
  await Promise.all(FILES.map((url) => cache.add(url).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("deus-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// The page for an address, or the page of its area (a flow's address gives the flows page), or Today.
async function offlinePage(url) {
  const cache = await caches.open(CACHE);
  const exact = await cache.match(url.pathname);
  if (exact) return exact;
  const area = "/" + url.pathname.split("/")[1];
  return (await cache.match(area)) || (await cache.match("/")) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  // Navigation between screens inside the app asks for data, not pages: the network answers or it fails.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  // Files named by a hash never change: the device's copy is the answer, and a new one is kept after the first load.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // A page: the network first so it is always the latest, the device's copy when the network is out.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && PAGES.includes(url.pathname) && !url.search) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(() => offlinePage(url))
    );
    return;
  }

  // Anything else of ours (icons, the manifest): the network first, then the device.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || Response.error()))
  );
});
