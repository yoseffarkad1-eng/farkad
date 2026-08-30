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

// Which build each window is running.
//
// A window this worker handed a page to is running THIS build. A window that is open and
// is not one of those was loaded by the build before - claimed away from its own worker,
// still executing the old scripts. That distinction is the whole of what the rules below
// need, and it is derived rather than reported: the page that most needs identifying is
// one shipped before anybody thought to ask it.
//
// It used to live only in a Set in this worker's memory, and that was wrong in the one
// direction the comment here claimed was safe. A service worker is a process the browser
// stops and restarts at will - same version, same registration, same controller object,
// so `controllerchange` never fires and nothing in the page ever re-announces. The Set
// came back empty and THIS build's own window then failed the membership test and fell
// into the branch written for the previous build's window: it was handed v86's scripts,
// and with two shelves down there v85's, because caches.keys() is creation-ordered and
// the search took the oldest. Measured, in a real browser, with the origin withholding
// the file so the answer could only have come from a cache.
//
// So it is written down where a restart cannot reach it. The Cache API is the only
// durable store a worker has, and one entry per client is a few bytes.
const SERVED = new Set();
const CLIENTS = 'farkad-clients';

function clientKey(id) {
    return new Request('https://farkad.invalid/client/' + encodeURIComponent(id));
}

// Remembered durably, and in memory for the fetches that follow in this same process.
function rememberClient(id, build) {
    if (!id) return Promise.resolve();
    if (build === VERSION) SERVED.add(id);
    return caches.open(CLIENTS)
        .then(cache => cache.put(clientKey(id), new Response(build)))
        .catch(() => undefined);
}

// Which build this window is running, as far as anything on this device can say.
// Null means nobody ever wrote it down - which after the change above means a window
// from a build that predates it, and is the ONLY case the guessing below is for.
function buildOfClient(id) {
    if (!id) return Promise.resolve(VERSION);
    if (SERVED.has(id)) return Promise.resolve(VERSION);
    return caches.open(CLIENTS)
        .then(cache => cache.match(clientKey(id)))
        .then(hit => (hit ? hit.text() : null))
        .then(build => {
            if (build === VERSION) SERVED.add(id);
            return build;
        })
        .catch(() => null);
}

// Every build any open window is recorded as running, plus this one.
function buildsInUse() {
    return self.clients.matchAll({ type: 'window' })
        .then(clients => Promise.all(clients.map(client => buildOfClient(client.id))))
        .then(builds => {
            const held = new Set([VERSION]);
            let unknown = false;
            builds.forEach(build => {
                if (build === null) unknown = true;
                else held.add(build);
            });
            return { held, unknown };
        });
}

// Every OTHER build's shelf. The client bookkeeping is not a shelf: reaping it would
// throw away the record of which window is running what, and serving out of it would
// hand somebody a page that is not a page.
function previousCaches() {
    return caches.keys().then(keys => keys.filter(key => key !== VERSION && key !== CLIENTS));
}

// A window still running the build before this one, if there is one.
function strangerOpen() {
    return buildsInUse().then(state => state.unknown || state.held.size > 1);
}

// Every other build's cache goes, but not while somebody is still running one of them.
//
// This used to reap and THEN claim, so the old build's cache was deleted while a window
// was still executing the old build - and after the claim that window had nowhere of its
// own left to be served from. A cache is a few hundred kilobytes and it is the only copy
// of the app that window can still run; it is kept until nothing is running it, and then
// it goes at the next activate or the next navigation.
function reapUnusedCaches() {
    return buildsInUse().then(state => {
        // A window whose build nobody wrote down. It is running SOMETHING, and until it
        // is gone there is no shelf here that can be proved unused.
        if (state.unknown) return undefined;
        return previousCaches().then(keys => Promise.all(keys
            .filter(key => !state.held.has(key))
            .map(key => caches.delete(key))));
    }).then(() => forgetClosedClients());
}

// Now, and twice more as the browser catches up.
//
// A window that has just been closed can still be listed by clients.matchAll for a
// second or two, and while it is listed it is a window running something - so the first
// pass correctly collects nothing. Without the later ones the shelves would sit there
// until the next navigation, which on an installed app might be tomorrow. It stops as
// soon as there is nothing left to collect.
function reapLater(attempt) {
    const round = attempt || 0;
    return reapUnusedCaches()
        .then(() => previousCaches())
        .then(keys => {
            if (keys.length === 0 || round >= 2) return undefined;
            return new Promise(resolve => setTimeout(resolve, 2000 + round * 3000))
                .then(() => reapLater(round + 1));
        });
}

// The record of a window that is gone. Bounded rather than tidy: without it the store
// grows for the life of the origin, one entry per window ever opened.
function forgetClosedClients() {
    return Promise.all([
        caches.open(CLIENTS).then(cache => cache.keys()),
        self.clients.matchAll({ type: 'window' })
    ]).then(([keys, clients]) => {
        const open = new Set(clients.map(client => clientKey(client.id).url));
        return caches.open(CLIENTS).then(cache => Promise.all(
            keys.filter(request => !open.has(request.url))
                .map(request => cache.delete(request))
        ));
    }).catch(() => undefined);
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
        // page it is about to run. That is the one fact everything else here is built on,
        // and it is written down durably so a worker restart cannot forget it.
        if (event.resultingClientId) {
            event.waitUntil(rememberClient(event.resultingClientId, VERSION));
        }
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

    // Whatever build this window is running, from the shelf that build was installed on.
    //
    // clients.claim() takes over every window of the origin, and this handler only ever
    // opened caches.open(VERSION) - so a page still executing the old scripts was handed
    // the new build's for everything it asked for after the handover. New sync layer, old
    // page, one session: the exact failure the header of this file says the design exists
    // to prevent. The page catches up on its own at the first safe moment (see
    // js/ui/offline.js); until it does, it is served the app it is running.
    //
    // The window's build is READ, not guessed. It used to be "not in the in-memory set,
    // therefore old, therefore the first previous cache that has the file" - three
    // inferences, and after a worker restart the first one was wrong for THIS build's own
    // window, which was then handed the oldest shelf on the device.
    if (event.clientId) {
        event.respondWith(buildOfClient(event.clientId).then(build => {
            if (build === VERSION || build === null) {
                // null is a window from a build that predates this bookkeeping. There is
                // exactly one honest answer for it and it is not a guess: if the device
                // holds one previous shelf, that is the build it must be running. If it
                // holds several, nothing here can tell them apart, so nothing here
                // chooses - it asks the origin, and answers out of this build's cache
                // only when the origin cannot be reached, which is the same thing every
                // other window would get.
                if (build === VERSION) return serveFrom(VERSION, request);
                return previousCaches().then(keys => {
                    if (keys.length === 0) return serveFrom(VERSION, request);
                    if (keys.length === 1) return serveFrom(keys[0], request);
                    // Several shelves and a window nobody wrote down. The origin is asked
                    // FIRST - it is the only party that can still be right - and only if
                    // it cannot be reached does this fall back, to the NEWEST previous
                    // shelf rather than to whichever one caches.keys() happens to yield
                    // first. That order was creation order, so the old code reached for
                    // the oldest build on the device: two releases back, for a window
                    // that had almost certainly come from the one just before this.
                    //
                    // It is a last resort and it is bounded: from this build forward
                    // every window is written down at its navigation, so the only windows
                    // that can land here are ones from a build that predates the
                    // bookkeeping, and they are gone the moment they reload.
                    return askOrigin(request)
                        .then(hit => hit || serveFrom(keys[keys.length - 1], request));
                });
            }
            // A build we wrote down. Its own shelf, or - if that shelf is gone - the
            // origin, never somebody else's shelf.
            return caches.has(build).then(there => (there
                ? serveFrom(build, request)
                : askOrigin(request).then(hit => hit || serveFrom(VERSION, request))));
        }));
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

// The origin, or null. A REFUSAL is not an answer: a deploy in progress hands back 404s
// and 503s, and passing one to a page that asked for a script is the same as handing it
// nothing - the script silently never runs and the app loads with half its globals
// missing. Null means "the origin could not answer", which is what the caller needs.
function askOrigin(request) {
    return fetch(request).then(
        response => (response && response.ok ? response : null),
        () => null
    );
}

// One shelf, then the network. Never a search across shelves.
function serveFrom(cacheName, request) {
    return caches.open(cacheName)
        .then(cache => cache.match(request))
        .then(hit => hit || fetch(request));
}

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
    if (event.data && event.data.type === 'running' && typeof event.data.build === 'string') {
        const id = event.source && event.source.id;
        // Twice: now, and again a moment later. A window that has just been closed can
        // still be listed by clients.matchAll for a short while, and while it is listed
        // it is a window running something - so the first pass correctly collects
        // nothing, and without the second the shelves would sit there until the next
        // navigation, which on an installed app might be tomorrow.
        event.waitUntil(rememberClient(id, event.data.build).then(() => reapLater()));
    }
});
