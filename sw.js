// Offline shell.
//
// The people using this are on building sites with unreliable signal, and the app is the
// official record of who worked where. It has to open whether or not there is a network.
//
// One rule decides everything here: A SESSION RUNS ONE BUILD, END TO END.
//
// index.html used to be network-first, and that quietly broke the rule. Deploy v63 while
// a phone is running v62 and the next navigation fetched v63's PAGE while the scripts
// came cache-first from v62's cache - new HTML, old JavaScript, in the same session.
// Worse, that page was written INTO the v62 cache, so every offline launch afterwards
// opened the mismatch too. A page and a sync layer from different builds is how an edit
// gets written in a shape the other half does not read.
//
// So everything is cache-first, the page included, and a cache only ever holds the build
// it was installed with. A new version is not picked up by loading the page - it is
// picked up by the service worker update the browser runs anyway, which installs the new
// build COMPLETE and waits until the person presses the banner. Then one reload crosses
// from all of one build to all of the next.
//
// The version string below is the whole update mechanism. Bump it in the same commit as
// any change to a cached file, or returning visitors keep running the old build.

const VERSION = 'farkad-v87';

const SHELL = [
    './',
    './index.html',
    './css/app.css',
    './js/store.js',
    './js/recovery.js',
    './js/dates.js',
    './js/model/schema.js',
    './js/model/migrate.js',
    './js/model/ledger.js',
    './js/sync/sync.js',
    './js/state.js',
    './js/ui/dom.js',
    './js/ui/bars.js',
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
    './js/ui/settings.js',
    './js/app.js',
    // The cloud adapter and its configuration. Same-origin, imported at runtime, and
    // therefore exactly as much a part of the offline shell as any other script here -
    // an installed app that cannot fetch them signs nobody in and says nothing about why.
    './js/sync/firebase-adapter.js',
    './js/sync/firebase-config.js',
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

// Which windows this worker has actually handed a page to.
//
// A window in here navigated through THIS worker, so it is running THIS build. A window
// that is open and is not in here was loaded by the build before - claimed away from its
// own worker by the claim below, still executing the old scripts. That distinction is
// the whole of what the two rules under it need, and it is derived rather than reported:
// a page cannot be asked, because the page that needs identifying is one shipped before
// anybody thought to ask it.
//
// It is in memory, so a worker the browser has terminated and restarted forgets it. That
// is the safe direction: a window it has forgotten reads as "not this build", so the old
// cache is kept and the old bytes are served - the same answer, reached again.
const SERVED = new Set();

function previousCaches() {
    return caches.keys().then(keys => keys.filter(key => key !== VERSION));
}

// A window still running the build before this one, if there is one.
function strangerOpen() {
    return self.clients.matchAll({ type: 'window' })
        .then(clients => clients.some(client => !SERVED.has(client.id)));
}

// Every other build's cache goes, but not while somebody is still running one of them.
//
// This used to reap and THEN claim, so the old build's cache was deleted while a window
// was still executing the old build - and after the claim that window had nowhere of its
// own left to be served from. A cache is a few hundred kilobytes and it is the only copy
// of the app that window can still run; it is kept until nothing is running it, and then
// it goes at the next activate or the next navigation.
function reapUnusedCaches() {
    return strangerOpen().then(stranger => {
        if (stranger) return undefined;
        return previousCaches()
            .then(keys => Promise.all(keys.map(key => caches.delete(key))));
    });
}

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim().then(() => reapUnusedCaches()));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // The SheetJS CDN and anything else off-origin is left alone. Caching a third-party
    // script would pin a version we do not control, and the export already falls back to
    // CSV when it is unavailable.
    if (url.origin !== self.location.origin) return;

    // The document, from THIS version's cache. Not from the network, and never written
    // back at runtime: the page in a cache has to stay the page that build was installed
    // with, or the session is running two builds at once.
    //
    // It is a fast path as well as a correct one - no wait for the network before the app
    // appears, which on a site with a signal that is technically connected and going
    // nowhere was the difference between opening and staring at white.
    if (request.mode === 'navigate') {
        // The window this navigation creates is running THIS build, because this is the
        // page it is about to run. That is the one fact everything else here is built on.
        if (event.resultingClientId) SERVED.add(event.resultingClientId);
        event.respondWith(
            caches.open(VERSION)
                .then(cache => cache.match('./index.html'))
                .then(hit => hit || timedFetch(request, DOCUMENT_TIMEOUT_MS)
                    .catch(() => offlineFallback()))
        );
        // The window that just left may have been the last one running the old build -
        // but it has not left yet. At the moment this handler runs, the client being
        // replaced is still open and still a stranger, so a reap here always finds one
        // and never collects anything. waitUntil keeps this worker alive long enough for
        // the navigation to finish and the old client to go.
        event.waitUntil(new Promise(resolve => setTimeout(resolve, 1500))
            .then(() => reapUnusedCaches()));
        return;
    }

    // A window this worker never served is a window running the build before it, claimed
    // away from its own worker. It gets ITS build's bytes, not this one's.
    //
    // clients.claim() takes over every window of the origin, and this handler only ever
    // opened caches.open(VERSION) - so a page still executing the old scripts was handed
    // the new build's for everything it asked for after the handover. New sync layer, old
    // page, one session: the exact failure the header of this file says the design exists
    // to prevent. The page catches up on its own at the first safe moment (see
    // js/ui/offline.js); until it does, it is served the app it is running.
    if (event.clientId && !SERVED.has(event.clientId)) {
        event.respondWith(
            previousCaches()
                .then(keys => keys.reduce(
                    (found, key) => found.then(hit => hit
                        || caches.open(key).then(cache => cache.match(request))),
                    Promise.resolve(null)
                ))
                .then(hit => hit || caches.open(VERSION)
                    .then(cache => cache.match(request))
                    .then(inThis => inThis || fetch(request)))
        );
        return;
    }

    // Cache-first for versioned assets, and only from THIS version's cache. Falling
    // through to caches.match() across every cache would serve an asset from the build
    // before this one - which is the same mixed-build failure by another route.
    event.respondWith(
        caches.open(VERSION).then(cache => cache.match(request)).then(hit => {
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

    // A page saying which build it is running. Only pages from this build and later can
    // say it - the one that needs identifying is a page shipped before anybody thought to
    // ask - so silence means "not this build", which is the safe reading and the one
    // SERVED already gives. What this adds is promptness: the moment the last window of
    // the old build is replaced by one of this build, the old cache can go, instead of
    // waiting for the next launch.
    if (event.data && event.data.type === 'running' && event.data.build === VERSION) {
        if (event.source && event.source.id) SERVED.add(event.source.id);
        event.waitUntil(reapUnusedCaches());
    }
});
