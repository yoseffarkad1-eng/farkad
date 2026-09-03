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

const VERSION = 'farkad-v101';

const SHELL = [
    './',
    './index.html',
    './css/app.css',
    './js/store.js',
    './js/recovery.js',
    './js/dates.js',
    './js/model/schema.js',
    './js/model/money.js',
    './js/model/migrate.js',
    './js/model/ledger.js',
    './js/sync/sync.js',
    './js/sync/restore.js',
    './js/sync/receive.js',
    './js/sync/send.js',
    './js/sync/status.js',
    './js/sync/boot.js',
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
    './js/ui/backup.js',
    './js/ui/printout.js',
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
    // The spreadsheet library, on this origin and in the shell.
    //
    // It used to come from a CDN, which made the export the one thing in this app that
    // needed a signal - and the pay sheet is worked out in the van, where there is none.
    // Precached like everything else, so a phone that has opened the app once can hand a
    // bookkeeper a workbook from a tunnel. It is 860K, which is most of this cache: that
    // is what one offline export costs, paid once per build rather than once per press.
    './vendor/xlsx-0.18.5.min.js',
    // The licence travels with the library. Apache-2.0 asks for it wherever the code is
    // distributed, and every phone that installs this app is a distribution. It is also
    // what keeps vendor/ honest: every other shell directory holds shell files only, and
    // tests/swrestart.test.mjs builds what it expects a cache to hold out of what the
    // deploy shipped - so one deployed file the worker did not cache reads there as a
    // build that installed incomplete.
    './vendor/xlsx-0.18.5.LICENSE',
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
    //
    // The shelf says so about itself, before and after. `installing` is written BEFORE
    // the first fetch and only becomes `complete` when every file is down, because the
    // reaper below collects by lifecycle state and a shelf being written is the one thing
    // it must never touch: a delete that lands mid-install leaves cache.add resolving
    // against a handle to a cache that is no longer in the store, so the browser calls
    // the install a success and the build activates with nothing on its shelf.
    event.waitUntil(
        markShelf(VERSION, 'installing')
            .then(() => caches.open(VERSION))
            .then(cache =>
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
                    return writeManifest(VERSION, cache);
                }))
            .then(() => markShelf(VERSION, 'complete'))
    );
});

// ---------------------------------------------------------------- the shelf registry
//
// Which shelves exist, and what each one IS. Everything the reaper does is decided from
// this and from who is running what - never from the shelf's NAME.
//
// Names were the old answer: a shelf was collectable if its version number was lower, or
// on a tie if its name sorted earlier. Both are guesses about lifecycle dressed as facts
// about strings, and both are wrong in ordinary cases. A ROLLBACK installs a build whose
// name sorts below the running one; a same-version candidate (a deploy test, a rebuild)
// ties and loses the string comparison. Either one is a complete, waiting shelf that the
// build it is about to replace deletes out from under it.
//
// So a shelf is only ever collected when something explicitly wrote down that it has
// been retired - which only the worker that actually replaced it can say, and only after
// it has taken over that shelf's windows.
const SHELVES = 'farkad-shelves';
const ACTIVE_KEY = 'https://farkad.invalid/shelf/@active';

// The manifest lives in the REGISTRY, not in the shelf it describes. A shelf holds
// exactly the files of its build and nothing else - three suites check that by
// enumerating it, and they are right to: an extra key in a shelf is an asset the build
// never had, and something will eventually serve it.
function manifestKey(name) {
    return new Request('https://farkad.invalid/manifest/' + encodeURIComponent(name));
}

function shelfKey(name) {
    return new Request('https://farkad.invalid/shelf/' + encodeURIComponent(name));
}

// Written and read back. A lifecycle mark that was not stored is not a mark, and the
// difference matters in the direction that deletes things: an unwritten `installing`
// leaves a shelf that is being filled looking collectable.
function markShelf(name, state) {
    return caches.open(SHELVES)
        .then(cache => cache.put(shelfKey(name), new Response(state))
            .then(() => cache.match(shelfKey(name)))
            .then(hit => (hit ? hit.text() : null))
            .then(stored => stored === state))
        .catch(() => false);
}

function shelfState(name) {
    return caches.open(SHELVES)
        .then(cache => cache.match(shelfKey(name)))
        .then(hit => (hit ? hit.text() : null))
        .catch(() => null);
}

// Which build is the active one. Read at activate BEFORE it is overwritten, so the
// incoming worker learns the name of the build it is replacing - which is what the
// windows it is about to claim are running.
function readActive() {
    return caches.open(SHELVES)
        .then(cache => cache.match(new Request(ACTIVE_KEY)))
        .then(hit => (hit ? hit.text() : null))
        .then(name => (name && /^farkad-/.test(name) ? name : null))
        .catch(() => null);
}

function writeActive(name) {
    return caches.open(SHELVES)
        .then(cache => cache.put(new Request(ACTIVE_KEY), new Response(name))
            .then(() => cache.match(new Request(ACTIVE_KEY)))
            .then(hit => (hit ? hit.text() : null))
            .then(stored => stored === name))
        .catch(() => false);
}

// What this shelf actually holds, hashed, written into the shelf itself at install.
//
// "The cache exists" was the whole of the old check, and a cache is allowed to lose
// entries: the Cache API evicts per-entry under storage pressure without telling anybody.
// A shelf that has lost a file is not that build's shelf any more, and serving from it
// means falling through to the network for the missing piece - which is the current
// deploy, which is a different build.
function writeManifest(name, cache) {
    return Promise.all(SHELL.map(url =>
        cache.match(url)
            .then(hit => (hit ? hit.clone().arrayBuffer() : null))
            .then(bytes => (bytes === null ? null : crypto.subtle.digest('SHA-256', bytes)))
            .then(digest => (digest === null ? null : [url, hex(digest)]))
    )).then(pairs => {
        const manifest = {};
        pairs.filter(Boolean).forEach(([url, sum]) => { manifest[url] = sum; });
        return caches.open(SHELVES).then(registry =>
            registry.put(manifestKey(name),
                new Response(JSON.stringify(manifest), {
                    headers: { 'Content-Type': 'application/json' }
                })));
    }).catch(() => undefined);
}

function readManifest(name) {
    return caches.open(SHELVES)
        .then(registry => registry.match(manifestKey(name)))
        .then(hit => (hit ? hit.json().catch(() => null) : null))
        .catch(() => null);
}

function hex(buffer) {
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Is this shelf complete enough to be that build's program?
//
// Inventory first: every file the shell names has to be there. Then, if the shelf
// carries a manifest - which every build from v88 on writes at install - the BYTES are
// checked against it, so a file that was replaced rather than lost is caught too. A
// shelf from an older build has no manifest and is checked by inventory alone, which is
// stated rather than hidden: it is the strongest claim the evidence supports.
//
// Memoised per process. It reads the whole shelf, and the answer cannot change while
// this worker is alive without something else in here noticing.
const SHELF_OK = new Map();

function shelfUsable(name) {
    if (SHELF_OK.has(name)) return SHELF_OK.get(name);
    const answer = caches.has(name).then(there => {
        if (!there) return { ok: false, why: 'missing' };
        return caches.open(name).then(cache =>
            readManifest(name)
                .then(manifest => {
                    // A SHELF IS JUDGED BY ITS OWN SHELL, NEVER BY THIS BUILD'S.
                    //
                    // This iterated SHELL - the list the running worker was compiled with
                    // - over whatever shelf it was handed, including a shelf some earlier
                    // build installed. That is a comparison between two different builds
                    // dressed up as a completeness check, and it answers 'incomplete' for
                    // a shelf that is complete, the moment a build ADDS a file. Every
                    // window still running the older build is then fail-closed with a
                    // 503: on rollout day, a white page on every phone that had the app
                    // open, which is the exact failure iron law 7 exists to prevent.
                    //
                    // It stayed hidden because no build had ever added a shell entry -
                    // files were edited, renamed and removed, and none of those trips it.
                    // Vendoring the spreadsheet library added the first one.
                    //
                    // The manifest is the answer, and it was already being written: the
                    // worker that installs a shelf records ITS OWN SHELL there, with a
                    // hash per file. So the question asked of a shelf is the one it can
                    // actually answer - is it still everything its own build put in it.
                    const expected = manifest ? Object.keys(manifest) : null;
                    if (expected !== null) {
                        return Promise.all(expected.map(url =>
                            cache.match(url).then(hit => {
                                if (!hit) return url;
                                return hit.clone().arrayBuffer()
                                    .then(bytes => crypto.subtle.digest('SHA-256', bytes))
                                    .then(digest => (hex(digest) === manifest[url] ? null : url));
                            })
                        ));
                    }
                    // NO MANIFEST: a shelf from a build that predates them. There is no
                    // record of what that build's shell was, and this build's list is not
                    // a substitute for one - it is the very thing that got this wrong.
                    //
                    // What can be checked is that the shelf can still serve the app: the
                    // page is the entry to everything else, and the build that wrote this
                    // shelf installed all-or-none under its own rules, so a shelf that
                    // exists and holds its page is as complete as anything here can
                    // establish. Claiming more would be inventing the missing record.
                    return cache.match('./index.html')
                        .then(hit => (hit ? [] : ['./index.html']));
                })
                .then(bad => {
                    const missing = bad.filter(Boolean);
                    return missing.length === 0
                        ? { ok: true, why: null }
                        : { ok: false, why: 'incomplete', missing };
                })
        );
    }).catch(() => ({ ok: false, why: 'unreadable' }));
    SHELF_OK.set(name, answer);
    return answer;
}

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
// Returns whether the record is PROVABLY stored. The answer is used: a write that was
// swallowed left a window whose identity nothing knew, and the fetch handler then treated
// it as a window from an older build and handed it another build's bytes.
function rememberClient(id, build) {
    if (!id) return Promise.resolve(false);
    return caches.open(CLIENTS)
        .then(cache => cache.put(clientKey(id), new Response(build))
            .then(() => cache.match(clientKey(id)))
            .then(hit => (hit ? hit.text() : null))
            .then(stored => stored === build))
        // The in-memory copy is written only once the durable one is PROVED. It used to
        // be set first and unconditionally, so a refused put left the process asserting
        // an identity that nothing on the disk agreed with - and answering fetches from
        // it, correctly, right up until the browser stopped the worker. Then the Set came
        // back empty and the window fell into the branch written for older builds.
        //
        // Marking a client served before its identity is stored does not make the write
        // succeed; it only postpones finding out, past the point where anything can be
        // done about it.
        .then(stored => {
            if (stored && build === VERSION) SERVED.add(id);
            return stored;
        })
        .catch(() => false);
}

// The windows the OUTGOING worker was controlling, written down before this one claims
// them.
//
// This is the repair the fetch handler's refusals rest on. clients.claim() takes over
// every window of the origin at once; at the instant before it runs, every window it is
// about to take over was being controlled by the worker this one replaces, and is
// therefore running THAT build. That is the only moment in the life of the device when a
// legacy window's build is a fact. Nothing used it: the worker claimed first and asked
// afterwards, at fetch time, when all that is left to go on is how many shelves happen to
// be on the disk - and that guess handed a real window a real other build's program.
//
// Who the predecessor is, in order of what can actually be known:
//
//   the @active pointer, written by every worker from this build on. Exact.
//   failing that, the one previous shelf, if there is exactly one. Not a guess in the way
//     the fetch-time version was: these windows are known to be the outgoing worker's,
//     and a device with one shelf has one build they can be running. Every phone in the
//     field is in exactly this state, because v86 wrote no pointer.
//   failing that, nothing. Two shelves and no pointer is a genuine ambiguity, and the
//     answer is to leave the windows with the worker that is already serving them
//     correctly rather than to pick one.
//
// If the records cannot be written and read back, this worker does NOT claim. That is the
// safe half of the failure: unclaimed windows keep being served by the old worker out of
// the shelf they are running, which is right, instead of by this one out of a guess.
function enrollLegacyClients() {
    // includeUncontrolled, and it is not a detail. The FIRST window ever opened on an
    // origin is navigated before any worker exists, so nothing recorded it and nothing
    // controls it - and it is precisely one of the windows this activate is about to
    // claim. Without it here, that window is claimed having never been written down, and
    // is then refused its own scripts for the rest of its life. Measured: the put-refusal
    // scenario in tests/swidentity.test.mjs, where the window left behind on the first
    // build was fail-closed out of a shelf that was sitting right there.
    return Promise.all([
        readActive(),
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    ])
        .then(([pointed, windows]) => {
            if (windows.length === 0) return { ok: true, predecessor: pointed, enrolled: 0 };
            return unrecorded(windows).then(pending => {
                if (pending.length === 0) return { ok: true, predecessor: pointed, enrolled: 0 };
                return predecessorFor(pointed).then(predecessor => {
                    if (!predecessor) return { ok: false, predecessor: null, enrolled: 0 };
                    return Promise.all(pending.map(id => rememberClient(id, predecessor)))
                        .then(results => ({
                            ok: results.every(Boolean),
                            predecessor,
                            enrolled: results.filter(Boolean).length
                        }));
                });
            });
        })
        .catch(() => ({ ok: false, predecessor: null, enrolled: 0 }));
}

// Windows this device has no usable record for. A window whose record is UNREADABLE is
// deliberately not in this list: the device HAS an opinion about it and cannot reach it,
// so writing a fresh one would be overwriting evidence with a guess.
function unrecorded(windows) {
    return Promise.all(windows.map(client =>
        buildOfClient(client.id).then(build => (build === null ? client.id : null))
    )).then(ids => ids.filter(Boolean));
}

// Which build the windows this worker is about to claim are running.
//
//   the @active pointer, written by every worker from this build on. Exact.
//   failing that, the one other shelf, if there is exactly one. These windows are known
//     to have been open before this worker arrived, and a device with one other shelf has
//     one other program they can be running. Every phone in the field is in this state,
//     because v86 wrote no pointer.
//   failing THAT - no pointer and no other shelf at all - this build. Not a guess about
//     which of several programs a window is running: there is only one program on this
//     device, the one just installed, and a window that loaded from this origin while it
//     was installing loaded that. Nothing else is here to be mixed with, which is the
//     whole of what the rule protects.
//   and with a pointer that is gone, or two shelves and no pointer, nothing. A genuine
//     ambiguity is answered by leaving these windows with the worker already serving them
//     correctly, not by picking one.
function predecessorFor(pointed) {
    if (pointed === VERSION) return Promise.resolve(null);
    if (pointed) {
        return caches.has(pointed).then(there => (there ? pointed : null)).catch(() => null);
    }
    return otherShelves().then(names => {
        if (names.length === 0) return VERSION;
        return names.length === 1 ? names[0] : null;
    });
}

// Every cache that is a build's shelf and is not this build's. The bookkeeping caches are
// not shelves, and reaping either of them throws away the record of who is running what.
function otherShelves() {
    return caches.keys().then(keys => keys.filter(key =>
        key !== VERSION && key !== CLIENTS && key !== SHELVES && /^farkad-v/.test(key)));
}

// Which build this window is running, as far as anything on this device can say.
// Null means nobody ever wrote it down - which after the change above means a window
// from a build that predates it, and is the ONLY case the guessing below is for.
// Three answers, and the third is the one that was missing. UNKNOWN means the store
// could not be read at all, which is not the same as "nothing was written down" - the
// old code returned null for both, so a read failure was answered as though the window
// had come from a build that predates the bookkeeping, and it was handed that build's
// bytes off a disk that was in fact holding its own.
const UNKNOWN = '\u0000unknown';

function buildOfClient(id) {
    if (!id) return Promise.resolve(VERSION);
    if (SERVED.has(id)) return Promise.resolve(VERSION);
    return caches.open(CLIENTS)
        .then(cache => cache.match(clientKey(id)))
        .then(hit => (hit ? hit.text() : null))
        .then(build => {
            if (build === null) return null;
            // A record that is there and is not a build name is damage, not an answer.
            if (!/^farkad-v\d+/.test(build)) return UNKNOWN;
            if (build === VERSION) SERVED.add(id);
            return build;
        })
        .catch(() => UNKNOWN);
}

// Every build any open window is recorded as running, plus this one.
function buildsInUse() {
    return self.clients.matchAll({ type: 'window' })
        .then(clients => Promise.all(clients.map(client => buildOfClient(client.id))))
        .then(builds => {
            const held = new Set([VERSION]);
            let unknown = false;
            builds.forEach(build => {
                // UNKNOWN is a marker, not a build name. Adding it to the held set made a
                // window whose record could not be read look like a window running a build
                // called "\u0000unknown" - so `unknown` stayed false and the shelf that
                // window was actually running was reaped out from under it.
                if (build === null || build === UNKNOWN) unknown = true;
                else held.add(build);
            });
            return { held, unknown };
        });
}

// Every shelf this worker is allowed to collect.
//
// One question, asked of the registry: has something explicitly written down that this
// shelf is RETIRED? Only the worker that actually replaced a build can say that, and only
// after it has taken over that build's windows, so a `retired` mark is evidence rather
// than inference.
//
// Everything else is kept. A shelf marked `installing` is being written right now. One
// marked `complete` has been installed and is waiting for somebody to press the banner -
// it is the NEXT build, not a previous one. A shelf with no mark at all came from a build
// that predates this registry, and an unmarked shelf is not evidence that a shelf is
// disposable. The old version of this decided by version number, and on a tie by string
// comparison, which deleted rollbacks and same-version candidates - complete, waiting
// shelves - out from under their own installs.
function reapableShelves() {
    // Is any other build mid-install or waiting to be pressed, RIGHT NOW? This is the
    // browser's own lifecycle state rather than a guess made from a cache name, and it is
    // what invariant "protect installing and waiting shelves" actually needs. While either
    // is set, an unmarked shelf might be the one being written, so none of them are
    // touched.
    const busy = Boolean(self.registration
        && (self.registration.installing || self.registration.waiting));
    return otherShelves().then(names => Promise.all(names.map(name =>
        shelfState(name).then(state => {
            // Explicitly retired: the worker that replaced this build said so, after
            // taking over its windows. Always collectable.
            if (state === 'retired') return name;
            // Explicitly installing, or complete and waiting to be pressed. Never.
            if (state !== null) return null;
            // No mark at all: a shelf from a build that predates this registry. It cannot
            // be one that is being written now, because every build from here on writes
            // `installing` before it fetches its first file - unless a build that predates
            // the registry is installing or waiting at this moment, which is what the
            // lifecycle check above is for. A rollback to such a build is exactly that
            // case, and it is the one that used to lose its shelf mid-install.
            //
            // Otherwise it is an old shelf nobody retired because nothing at the time knew
            // how to. Leaving it forever is not free either: a device that upgraded twice
            // before this build would carry every shelf it ever had, and these are the
            // devices most likely to be short of space. It goes only when no live window is
            // running it and every live window's identity is known - which the caller
            // enforces, and which is the same bar a retired shelf has to clear.
            return busy ? null : name;
        })
    ))).then(names => names.filter(Boolean));
}

// A window still running a build that is not this one, if there is one.
function strangerOpen() {
    return buildsInUse().then(state => state.unknown || state.held.size > 1);
}

// Retired shelves that nobody is running, and not one byte more.
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
        return reapableShelves().then(keys => Promise.all(keys
            .filter(key => !state.held.has(key))
            .map(key => caches.delete(key))));
    });
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
        .then(() => reapableShelves())
        .then(keys => {
            if (keys.length === 0 || round >= 3) return forgetClosedClients();
            return new Promise(resolve => setTimeout(resolve, 2000 + round * 3000))
                .then(() => reapLater(round + 1));
        });
}

// The record of a window that is gone. Bounded rather than tidy: without it the store
// grows for the life of the origin, one entry per window ever opened.
//
// The live set is read TWICE - once to decide, and again immediately before each delete.
// A window that opens between those two reads is a window whose identity was about to be
// thrown away while it was running, and the gap is not theoretical: enumerating the store
// and enumerating the clients are both async, and a person reopening the app lands in the
// middle of them. The second read is what makes the delete a statement about now.
// Long enough to cover a navigation, short enough that a closed window's record does not
// outlive the session that reaps it.
//
// It is deliberately NOT inside reapUnusedCaches. Shelf collection and record forgetting
// are separate jobs with separate urgencies, and chaining them made every reap round wait
// out this pause before it could even look at the shelves - three rounds of that and a
// device with two old shelves was still carrying them a full half-minute later. Shelves
// go promptly; records are forgotten afterwards, unhurried, because being slow about
// forgetting costs a few bytes and being quick about it costs a window its identity.
const FORGET_GRACE_MS = 6000;

// Every window this worker can see, controlled or not. `includeUncontrolled` matters: a
// window that has not been claimed yet is still a window that is open and running
// something, and leaving it out of this set is how its record gets collected.
function liveClientUrls() {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => new Set(clients.map(client => clientKey(client.id).url)))
        // A reading that FAILED is not a reading that found nothing. Null says "I could
        // not look", and the caller deletes nothing on it - the opposite of treating an
        // error as an empty set, which would collect the identity of every open window.
        .catch(() => null);
}

function forgetClosedClients() {
    return Promise.all([
        caches.open(CLIENTS).then(cache => cache.keys()),
        liveClientUrls()
    ]).then(([keys, open]) => {
        if (open === null) return undefined;
        const stale = keys.filter(request => !open.has(request.url));
        if (stale.length === 0) return undefined;
        // A SECOND look, after a pause, and the pause is the point.
        //
        // clients.matchAll is a snapshot, and during a navigation a window that is very
        // much open can be absent from it for a moment - the old client is going, the new
        // one has not arrived. Deleting on one reading therefore throws away the identity
        // of a window that is still running, which is worse than anything this function
        // exists to prevent: an unbounded store costs a few bytes per window, while a lost
        // record costs that window its own program, refused, until somebody reloads it.
        //
        // Measured, not argued: with a single reading, crossing one window to a new build
        // deleted the OTHER window's record while it sat there mid-edit, and it was then
        // fail-closed out of its own scripts.
        //
        // Two readings a few seconds apart, and only what is absent from both goes. The
        // store stays bounded - a window that has really closed is absent from every
        // reading from then on - and a navigation in flight is never mistaken for one.
        return new Promise(resolve => setTimeout(resolve, FORGET_GRACE_MS))
            .then(() => liveClientUrls())
            .then(live => (live === null ? undefined
                : caches.open(CLIENTS).then(cache => Promise.all(
                    stale.filter(request => !live.has(request.url))
                        .map(request => cache.delete(request))
                ))));
    }).catch(() => undefined);
}

// Enroll, then claim, then retire what was replaced - in that order, and the order is
// the whole point.
//
// Claiming first is what made a legacy window unidentifiable: the instant the claim lands
// the evidence of which worker was serving it is gone, and every later question about it
// is a guess. So the windows are written down while the answer is still known, and the
// claim is CONDITIONAL on that having worked. A worker that cannot record who it is about
// to take over does not take them over: they stay with the old worker, which is serving
// them correctly out of the shelf they are actually running.
//
// Only after the claim is the replaced build marked retired, because that mark is what
// makes its shelf collectable - and it must not become collectable until its windows have
// somewhere else to be identified from.
self.addEventListener('activate', event => {
    event.waitUntil(
        enrollLegacyClients()
            .then(enrollment => {
                if (!enrollment.ok) {
                    console.warn('[sw] not claiming: could not record the windows of the '
                        + 'build being replaced');
                    return undefined;
                }
                return self.clients.claim()
                    .then(() => writeActive(VERSION))
                    .then(() => (enrollment.predecessor
                        ? markShelf(enrollment.predecessor, 'retired')
                        : undefined))
                    .then(() => reapUnusedCaches())
                    .then(() => forgetClosedClients());
            })
            .catch(error => console.error('[sw] activate', error))
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
        // and it is written down durably BEFORE the page is handed over.
        //
        // It used to be written in waitUntil and the document served regardless, which is
        // the same shape of mistake as claiming before enrolling: the app starts, and the
        // record that says what it is starts separately and may never arrive. While the
        // process lives the in-memory Set covers the hole, so nothing looks wrong; when
        // the browser stops the worker - which it does whenever it likes - the window
        // becomes unidentifiable, and unidentifiable is now refused.
        //
        // So a window is never left running the app with no durable record of its build.
        // A session that cannot be identified is a session that will be refused its own
        // scripts partway through somebody's working day; refusing to start it, with a
        // page that says why, is the same failure discovered while it is still cheap.
        event.respondWith(
            (event.resultingClientId
                ? rememberClient(event.resultingClientId, VERSION)
                : Promise.resolve(false))
                .then(stored => {
                    if (!stored) return cannotStart(event.resultingClientId ? 'unwritable' : 'no-client-id');
                    return caches.open(VERSION)
                        .then(cache => cache.match('./index.html'))
                        .then(hit => hit || timedFetch(request, DOCUMENT_TIMEOUT_MS)
                            .catch(() => offlineFallback()));
                })
        );
        // The window that just left may have been the last one running the old build -
        // but it has not left yet. At the moment this handler runs, the client being
        // replaced is still open and still a stranger, so a reap here always finds one
        // and never collects anything. waitUntil keeps this worker alive long enough for
        // the navigation to finish and the old client to go.
        event.waitUntil(new Promise(resolve => setTimeout(resolve, 1500))
            .then(() => reapUnusedCaches())
            .then(() => forgetClosedClients()));
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
            // Its own build, and only its own. The network is allowed here and nowhere
            // else below: for THIS build the origin is serving the same build, so a file
            // the shelf is missing comes back as itself.
            if (build === VERSION) return serveFrom(VERSION, request, true);

            // A build we wrote down. Its own shelf, and nothing else at all.
            if (build !== null && build !== UNKNOWN) {
                return shelfUsable(build).then(shelf => {
                    // "The cache exists" was the whole of the old test, and a cache is
                    // allowed to lose entries: the Cache API evicts per-entry under
                    // storage pressure. A shelf that has lost a file is not that build's
                    // program any more, and half of it plus the network is a mixed build
                    // assembled one request at a time.
                    if (!shelf.ok) return failClosed(request, 'shelf-' + shelf.why);
                    // Not `hit || fetch(request)`. The origin serves whatever is deployed
                    // NOW, so for a page from an older build the fallback IS the current
                    // build's bytes - identity established correctly and mixed anyway, by
                    // the one route the identity work does not cover.
                    return serveFrom(build, request, false);
                });
            }

            // Identity this device cannot establish. It used to be answered by guessing:
            // the one previous shelf if there was one, the newest if there were several,
            // this build's if there were none. Every one of those hands a page from one
            // build the scripts of another, which is the mixed-build session this file
            // exists to prevent - and it did, measurably, in four different ways.
            //
            // The last of those guesses to go was the singleton: one previous shelf, so
            // one possible answer. It was defended as the ordinary upgrade - every phone
            // in the field runs a build that predates this bookkeeping - and it really did
            // keep those phones working. It also handed a window whose identity write had
            // been REFUSED the other build's program, measurably, in a real browser, and
            // no test could tell the two cases apart because at this point in the code
            // they are the same case.
            //
            // They are separated earlier now instead. A legacy window is written down at
            // activate, before the claim, while its build is still a fact (see
            // enrollLegacyClients). What reaches here with no record is a window nothing
            // on this device can identify, and refusing it costs nothing that was ever
            // working.
            //
            // Every shelf and every stored record is left exactly where it is. Refusing
            // to serve is recoverable by a reload; serving the wrong build is not.
            return failClosed(request, build === UNKNOWN ? 'unreadable' : 'unrecorded', event.clientId);
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

// The answer when this worker cannot say which build is asking.
//
// A dedicated response rather than silence: returning undefined from respondWith turns a
// retryable failure into a script that never runs, and the app then loads with half its
// globals missing and nothing pointing at why. 503 is honest - this is temporary and a
// reload fixes it - and the body names the cause for whoever opens the console.
function failClosed(request, why, clientId) {
    return new Response(
        `/* farkad: this window's build could not be established (${why}); refusing to `
        + `serve another build's bytes. Reload the page. */\n`,
        {
            status: 503,
            statusText: 'farkad: build identity unknown',
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Farkad-Fail-Closed': String(why),
                // Which window was refused. A refusal that does not say who it is about
                // cannot be matched against what is on the disk, which is the first thing
                // anybody debugging this has to do.
                'X-Farkad-Client': String(clientId || '')
            }
        }
    );
}

// One shelf. Never a search across shelves, and the network only when the caller has
// established that the origin is serving the same build the shelf holds - which is true
// for THIS build and false for every other.
function serveFrom(cacheName, request, allowNetwork) {
    return caches.open(cacheName)
        .then(cache => cache.match(request))
        .then(hit => {
            if (hit) return hit;
            if (allowNetwork) return fetch(request);
            return failClosed(request, 'shelf-gap:' + cacheName);
        });
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

// The document's own fail-closed answer. A 503 body of plain text where a page belongs
// renders as a wall of text in a browser tab; this is the same refusal, said in the
// language of the people who will see it, with the diagnostic header the tests match on
// and nothing on the disk touched.
function cannotStart(why) {
    return new Response(
        '<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8">'
        + '<meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<body style="font-family:system-ui;padding:2rem;text-align:center">'
        + '<h1>האפליקציה לא נפתחה</h1>'
        + '<p>המכשיר לא הצליח לרשום איזו גרסה חלון זה מריץ, ולכן האפליקציה לא הופעלה - '
        + 'כדי שלא תרוץ חצי גרסה אחת וחצי אחרת.</p>'
        + '<p>נסה לרענן. אם זה חוזר, סגור את שאר החלונות של האפליקציה ופתח מחדש. '
        + 'שום נתון לא נמחק.</p>'
        + `<p style="opacity:.6;font-size:.8rem">${why}</p>`
        + '</body></html>',
        {
            status: 503,
            statusText: 'farkad: build identity could not be recorded',
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'X-Farkad-Fail-Closed': String(why)
            }
        }
    );
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
        // What this message is NOT any more: a source of identity. It used to be written
        // straight to the durable record, which made the page the authority on which
        // build it is running - and the page is the party being placed. Any window could
        // name any build and be believed, and a window that named a shelf it was not
        // running would then be served that shelf.
        //
        // Identity comes from the worker now: recorded at the navigation that created the
        // window, or enrolled at the activate that claimed it. This message says only
        // "something changed, look again", which is all it was ever needed for - it is
        // what lets the old shelf go the moment its last window is replaced, instead of
        // at the next launch, which on an installed app might be tomorrow.
        event.waitUntil(reapLater());
    }

    // THE CENSUS: which builds have a window open on this origin, right now.
    //
    // The page cannot work this out and neither can the disk. A build that predates the
    // write fence writes every record the rescue file carries and moves no counter doing
    // it, so no reading of any counter can see it - and detecting it by a key means that
    // writer writing a key it has never heard of. The only party that knows is this
    // worker, which enrolled every window it claimed and recorded every one it handed a
    // page to.
    //
    // Answered on the port the page opened, so the reply reaches the window that asked
    // rather than every window of the origin.
    if (event.data && event.data.type === 'which-builds') {
        const reply = event.ports && event.ports[0];
        if (!reply) return;
        event.waitUntil(buildsInUse().then(state => {
            reply.postMessage({
                type: 'builds',
                builds: [...state.held],
                // A window whose identity nothing on this device can establish. It is
                // running SOMETHING and this is not the place to guess what.
                unknown: state.unknown === true
            });
        }).catch(() => reply.postMessage({ type: 'builds', builds: [], unknown: true })));
    }
});
