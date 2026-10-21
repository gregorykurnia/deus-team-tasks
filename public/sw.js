// Keeps the app's pages and files on the device so it opens with no connection (A3). Registered in production only,
// as /sw.js?v=<build id>: every build gets its own cache, and the activate step deletes the caches of earlier builds.
const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `deus-shell-${BUILD}`;
// One page per area. The areas are client screens under one layout, so each page is the same shell.
const PAGES = ["/", "/tasks", "/plan", "/companies", "/notes", "/past", "/flows"];
const FILES = ["/manifest.webmanifest", "/icon-192x192.png", "/icon-512x512.png", "/apple-touch-icon.png", "/brand/deus-mark.png"];
const ASSET = /\/_next\/static\/[^"'\\\s)]+/g;

// Stores each page, then the script, style and font files it names, so every area can open from the device alone. A
// page or file that can't be fetched fails the install: the previous build's worker and its complete copy stay, and the
// browser tries the new one again on a later visit (deleting a working copy for a partial one would break the app
// offline). Fonts and icons are a bonus: without them the app still opens.
async function precache() {
  const cache = await caches.open(CACHE);
  const assets = new Set();
  await Promise.all(
    PAGES.map(async (page) => {
      const response = await fetch(page, { cache: "reload" });
      if (!response.ok || response.redirected) throw new Error(`${page}: ${response.status}`);
      const html = await response.clone().text();
      for (const match of html.match(ASSET) || []) assets.add(match);
      await cache.put(page, response);
    })
  );
  const styles = [];
  await Promise.all(
    [...assets].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      if (url.endsWith(".css")) styles.push({ url, response: response.clone() });
      await cache.put(url, response);
    })
  );
  // Fonts are named in the style files, relative to them (url(../media/…)).
  const fonts = new Set();
  for (const { url, response } of styles) {
    for (const [, ref] of (await response.text()).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const font = new URL(ref, new URL(url, self.location.origin));
      if (font.origin === self.location.origin && font.pathname.startsWith("/_next/static/")) fonts.add(font.pathname);
    }
  }
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
  event.waitUntil(precache().then(() => self.skipWaiting()));
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
async function cachedPage(url) {
  const cache = await caches.open(CACHE);
  const exact = await cache.match(url.pathname);
  if (exact) return exact;
  const area = "/" + url.pathname.split("/")[1];
  return (await cache.match(area)) || (await cache.match("/")) || null;
}
const offlinePage = async (url) => (await cachedPage(url)) || Response.error();
const SLOW_MS = 4000; // a page the network hasn't answered by then opens from the device (guide 5.8: the app always opens)

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
  // A network that hangs (a weak signal, a captive Wi-Fi) gives way to the device's copy after SLOW_MS.
  if (request.mode === "navigate") {
    const network = fetch(request).then((response) => {
      if (response.ok && PAGES.includes(url.pathname) && !url.search) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(url.pathname, copy)));
      }
      return response;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith(
      new Promise((resolve) => {
        let answered = false;
        const answer = (response) => {
          if (answered) return;
          answered = true;
          clearTimeout(timer);
          resolve(response);
        };
        const timer = setTimeout(() => cachedPage(url).then((page) => page && answer(page)), SLOW_MS);
        network.then(answer, () => offlinePage(url).then(answer));
      })
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
