// Offline shell.
//
// The people using this are on building sites with unreliable signal, and the app is the
// official record of who worked where. It has to open whether or not there is a network.
//
// Two rules decide everything here:
//
//   index.html is network-first  - so a new version is picked up rather than a stale page
//                                  being served forever from cache.
//   everything else is cache-first - the CSS and JS are versioned with the cache, so once
//                                  a version is installed its assets never change.
//
// The version string below is the whole update mechanism. Bump it in the same commit as
// any change to a cached file, or returning visitors keep running the old build.

const VERSION = 'farkad-v56';

const SHELL = [
    './',
    './index.html',
    './css/app.css',
    './js/store.js',
    './js/dates.js',
    './js/model/schema.js',
    './js/model/migrate.js',
    './js/sync/sync.js',
    './js/state.js',
    './js/ui/dom.js',
    './js/ui/ask.js',
    './js/ui/undo.js',
    './js/ui/modal.js',
    './js/ui/sitecolor.js',
    './js/ui/day.js',
    './js/ui/sheet.js',
    './js/ui/quickstart.js',
    './js/ui/week.js',
    './js/ui/roster.js',
    './js/ui/reports.js',
    './js/ui/share.js',
    './js/ui/migration.js',
    './js/ui/offline.js',
    './js/ui/install.js',
    './js/app.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', event => {
    // All of the shell or none of it. Swallowing a single failed file used to let a
    // half-fetched update ACTIVATE - at which point the activate handler below deleted
    // the complete old cache, and the next offline launch opened an app with some of
    // its scripts missing and no error pointing at why. A failed install leaves the
    // old version serving and is retried on a later visit; per-file failures are still
    // named in the log for whoever goes looking.
    event.waitUntil(
        caches.open(VERSION).then(cache =>
            Promise.all(SHELL.map(url =>
                cache.add(url).catch(error => {
                    console.error('[sw] could not cache', url, error);
                    return url;
                })
            )).then(results => {
                const missing = results.filter(Boolean);
                if (missing.length > 0) {
                    throw new Error('shell incomplete, keeping the old version: ' + missing.join(', '));
                }
            })
        )
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== VERSION).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // The SheetJS CDN and anything else off-origin is left alone. Caching a third-party
    // script would pin a version we do not control, and the export already falls back to
    // CSV when it is unavailable.
    if (url.origin !== self.location.origin) return;

    // Network-first for the document, so a deployed change is seen on the next load -
    // but only for as long as the network is worth waiting for.
    if (request.mode === 'navigate') {
        event.respondWith(
            timedFetch(request, DOCUMENT_TIMEOUT_MS)
                .then(response => {
                    // Only a real page overwrites the cached shell. A host mid-deploy
                    // answers 502 for a moment; caching that page made it THE app on
                    // every offline launch afterwards. And when the network hands back
                    // an error while a good copy sits in the cache, the good copy wins.
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(VERSION).then(cache => cache.put('./index.html', copy));
                        return response;
                    }
                    return caches.match('./index.html').then(hit => hit || response);
                })
                .catch(() => caches.match('./index.html').then(hit => hit || offlineFallback()))
        );
        return;
    }

    // Cache-first for versioned assets.
    event.respondWith(
        caches.match(request).then(hit => {
            if (hit) return hit;

            return fetch(request).then(response => {
                if (response && response.status === 200) {
                    const copy = response.clone();
                    caches.open(VERSION).then(cache => cache.put(request, copy));
                }
                return response;
            });
            // No .catch here on purpose. Returning undefined from respondWith turns a
            // retryable network error into a script that silently never runs - the app
            // then loads with half its globals missing and no error pointing at why.
            // Letting the rejection through gives the browser's real failure instead.
        })
    );
});

// Offline is the easy case: the fetch fails at once and the cached page is served. The
// hard case on a building site is a signal that is technically connected and going
// nowhere - there the request can hang for half a minute while the person stares at a
// blank screen, with a perfectly good copy of the app sitting in the cache the whole time.
//
// So the network gets a few seconds to prove itself and then loses. The cost of being
// wrong is one load of a slightly older page; the next one goes to the network again.
const DOCUMENT_TIMEOUT_MS = 3000;

function timedFetch(request, timeout) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('network too slow')), timeout);
        fetch(request).then(
            response => { clearTimeout(timer); resolve(response); },
            error => { clearTimeout(timer); reject(error); }
        );
    });
}

function offlineFallback() {
    return new Response(
        '<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8">' +
        '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
        '<h1>אין חיבור</h1><p>האפליקציה עדיין לא נשמרה במכשיר. התחבר פעם אחת ונסה שוב.</p>' +
        '</body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

// The page asks for this when the user presses the update banner. Swapping versions
// mid-session without asking would reload the screen under someone's hands while they
// are entering a day.
self.addEventListener('message', event => {
    if (event.data === 'skip-waiting') self.skipWaiting();
});
