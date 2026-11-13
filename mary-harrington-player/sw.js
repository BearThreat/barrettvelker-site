const CACHE_NAME = "mary-harrington-charlotte-v9";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Pages: network first so updated HTML (and its CSP) replaces old offline copies;
  // the cached copy is the offline fallback. Audio and other assets stay cache first.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then(async (response) => {
        const cache = await caches.open(CACHE_NAME);
        if (response.ok && (await cache.match(event.request))) {
          await cache.put(event.request, response.clone());
        }
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      const range = event.request.headers.get("range");
      if (cached && range) {
        return makeRangeResponse(cached, range);
      }
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        return response;
      });
    })
  );
});

async function makeRangeResponse(response, rangeHeader) {
  const buffer = await response.arrayBuffer();
  const size = buffer.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return response;

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (match[1] === "" && match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(size - suffix, 0);
    end = size - 1;
  }
  start = Math.max(0, Math.min(start, size - 1));
  end = Math.max(start, Math.min(end, size - 1));
  const body = buffer.slice(start, end + 1);
  return new Response(body, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
      "Content-Length": String(body.byteLength),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes"
    }
  });
}
